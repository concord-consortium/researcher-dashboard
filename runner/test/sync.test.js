import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { DirBackend, Syncer } from "../server/sync/index.js";
import { isExcluded, pendingFiles, scanTree } from "../server/sync/scan.js";

let work;
let local;
let remote;

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "rd-sync-"));
  local = path.join(work, "local");
  remote = path.join(work, "remote");
  await mkdir(local, { recursive: true });
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

function syncer(overrides = {}) {
  return new Syncer({ backend: new DirBackend(remote), root: local, ...overrides });
}

async function write(rel, body) {
  const abs = path.join(local, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, body);
  return abs;
}

test("scanTree excludes cc-data lock files and includes nested data", async () => {
  await write("answers.v1.jsonl", "a");
  await write("attachments/x.mp3", "b");
  await write(".dataset.lock", "lock");
  await write("segments/seg_answers_164.lock", "lock");

  const scanned = await scanTree(local);
  assert.deepEqual([...scanned.keys()].sort(), ["answers.v1.jsonl", "attachments/x.mp3"]);
  assert.equal(isExcluded("segments/seg_answers_164.lock"), true);
  assert.equal(isExcluded("answers.v1.jsonl"), false);
});

test("scanTree treats a missing root as empty rather than throwing", async () => {
  const scanned = await scanTree(path.join(work, "never-created"));
  assert.equal(scanned.size, 0);
});

test("pendingFiles reports only what differs from the uploaded record", () => {
  const scanned = new Map([
    ["same", { size: 1, mtimeMs: 100 }],
    ["resized", { size: 2, mtimeMs: 100 }],
    ["touched", { size: 1, mtimeMs: 200 }],
    ["new", { size: 1, mtimeMs: 100 }]
  ]);
  const uploaded = new Map([
    ["same", { size: 1, mtimeMs: 100 }],
    ["resized", { size: 1, mtimeMs: 100 }],
    ["touched", { size: 1, mtimeMs: 100 }]
  ]);
  assert.deepEqual(pendingFiles(scanned, uploaded), ["new", "resized", "touched"]);
});

test("flush uploads pending files and verify then passes", async () => {
  await write("answers.v1.jsonl", "one");
  await write("attachments/a.bin", "two");
  const s = syncer();

  assert.deepEqual(await s.pending(), ["answers.v1.jsonl", "attachments/a.bin"]);
  const flushed = await s.flush();
  assert.equal(flushed.files, 2);
  assert.equal(flushed.bytes, 6);

  assert.deepEqual((await s.verify()).outstanding, []);
  assert.equal((await s.verify()).ok, true);
  assert.deepEqual(
    (await new DirBackend(remote).list()).map((o) => o.path).sort(),
    ["answers.v1.jsonl", "attachments/a.bin"]
  );
});

test("flush re-uploads a file only after it changes", async () => {
  await write("answers.v1.jsonl", "one");
  const s = syncer();
  await s.flush();

  assert.equal((await s.flush()).files, 0, "unchanged tree must upload nothing");

  await write("answers.v1.jsonl", "one-plus-more");
  assert.equal((await s.flush()).files, 1, "a changed file must upload again");
});

test("a same-size rewrite is still caught, because mtime is compared too", async () => {
  await write("answers.v1.jsonl", "aaa");
  const s = syncer();
  await s.flush();
  assert.equal((await s.flush()).files, 0);

  const abs = await write("answers.v1.jsonl", "bbb");
  const future = new Date(Date.now() + 5000);
  await utimes(abs, future, future);
  assert.equal((await s.flush()).files, 1);
});

test("flushAndVerify reports the reason when the backend fails, and stays failed", async () => {
  await write("answers.v1.jsonl", "one");
  const s = syncer();
  s.backend = {
    put: async () => {
      throw new Error("AccessDenied: PutObject");
    }
  };

  const result = await s.flushAndVerify("suspend");
  assert.equal(result.ok, false);
  assert.match(result.reason, /AccessDenied/);

  // Criterion 13: the file is still outstanding, so nothing may claim the VM is
  // safely suspended.
  assert.deepEqual((await s.verify()).outstanding, ["answers.v1.jsonl"]);
});

test("a denied upload leaves the previous remote copy intact", async () => {
  await write("answers.v1.jsonl", "first");
  const s = syncer();
  await s.flush();

  const abs = await write("answers.v1.jsonl", "second");
  const future = new Date(Date.now() + 5000);
  await utimes(abs, future, future);
  s.backend = {
    put: async () => {
      throw new Error("AccessDenied: PutObject");
    }
  };

  const result = await s.flushAndVerify("suspend");
  assert.equal(result.ok, false);
  const stored = await new DirBackend(remote).list();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].size, "first".length, "the earlier copy must survive");
});

test("verify refuses a flush that a concurrent write outran", async () => {
  await write("answers.v1.jsonl", "one");
  const s = syncer();
  const realPut = s.backend.put.bind(s.backend);
  s.backend = {
    put: async (rel, src) => {
      await realPut(rel, src);
      // A late write lands after its own file was uploaded, which is precisely the
      // case a flush's own return value cannot see.
      if (rel === "answers.v1.jsonl") await write("history.v1.jsonl", "late");
    }
  };

  const result = await s.flushAndVerify("suspend");
  assert.equal(result.ok, false);
  assert.deepEqual(result.outstanding, ["history.v1.jsonl"]);
});

test("concurrent flushes are serialized rather than racing", async () => {
  await write("a.jsonl", "a");
  await write("b.jsonl", "b");
  const s = syncer();
  let concurrent = 0;
  let maxConcurrent = 0;
  const realPut = s.backend.put.bind(s.backend);
  s.backend = {
    put: async (rel, src) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      await realPut(rel, src);
      concurrent -= 1;
    }
  };

  const [first, second] = await Promise.all([s.flush(), s.flush()]);
  assert.equal(maxConcurrent, 1);
  // The second call joined the first rather than starting a second upload pass.
  assert.equal(first, second);
  assert.deepEqual((await s.verify()).outstanding, []);
});

test("pullDown restores the tree and does not re-upload what it just pulled", async () => {
  await write("answers.v1.jsonl", "one");
  await write("attachments/a.bin", "two");
  const seeded = syncer();
  await seeded.flush();

  const fresh = path.join(work, "fresh");
  const s = new Syncer({ backend: new DirBackend(remote), root: fresh });
  const pulled = await s.pullDown();

  assert.equal(pulled.files, 2);
  assert.deepEqual((await scanTree(fresh)).size, 2);
  assert.equal((await s.flush()).files, 0, "a just-pulled tree must be already in sync");
});

test("pullDown on an empty prefix is the normal first session, not an error", async () => {
  const s = syncer();
  assert.deepEqual(await s.pullDown(), { files: 0 });
});
