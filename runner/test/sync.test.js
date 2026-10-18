import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import fs from "node:fs";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { DirBackend, S3Backend, Syncer } from "../server/sync/index.js";
import { isExcluded, openForSync, pendingFiles, scanTree } from "../server/sync/scan.js";
import { captureLog } from "./helpers/capture-log.js";

// Only Linux has /proc, which the swapped-directory check and the open-file count read.
const HAS_PROC = fs.existsSync("/proc/self/fd");

let work;
let local;
let remote;

beforeEach(async () => {
  // The real path: macOS's temp directory is under a link.
  work = fs.realpathSync(await mkdtemp(path.join(tmpdir(), "rd-sync-")));
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

// A log-based metric counts sync.failed, so a failed tick is logged under it too.
test("a tick whose flush fails is logged as sync.failed", async () => {
  await write("answers.v1.jsonl", "a");
  let puts = 0;
  const s = syncer({ backend: { put: async () => { puts += 1; throw new Error("AccessDenied"); }, list: async () => [] }, intervalMs: 5 });
  const lines = await captureLog(async () => {
    s.start();
    try {
      // Until a tick has tried an upload, then one more interval for its failure's line.
      for (let i = 0; i < 100 && puts === 0; i++) await new Promise((r) => setTimeout(r, 5));
      await new Promise((r) => setTimeout(r, 5));
    } finally {
      s.stop();
    }
  });
  const line = lines.find((l) => l.event === "sync.failed");
  assert.deepEqual({ hook: line?.hook, error: line?.error }, { hook: "tick", error: "AccessDenied" });
});

// The syncer runs as root over a tree the package owns, so a hard link there is not followed.
test("scanTree leaves out a file with another hard link", async () => {
  const abs = await write("mine.txt", "a");
  fs.linkSync(abs, path.join(work, "outside-link"));
  await write("plain.txt", "b");
  const files = await scanTree(local);
  assert.ok(files.has("plain.txt"));
  assert.ok(!files.has("mine.txt"));
});

// Root opens what it uploads from a tree the package owns, so whatever the package swapped
// in since the scan is refused there, at once.
test("openForSync refuses a pipe, a link, a hard link and a path through a swapped directory", async () => {
  const real = await write("dir/plain.txt", "abc");
  const opened = openForSync(real);
  assert.equal(opened.size, 3);
  fs.closeSync(opened.fd);
  execFileSync("mkfifo", [path.join(local, "dir", "pipe")]);
  assert.equal(openForSync(path.join(local, "dir", "pipe")), null, "a pipe does not block, and is refused");
  fs.symlinkSync(real, path.join(local, "dir", "sym"));
  assert.equal(openForSync(path.join(local, "dir", "sym")), null);
  fs.linkSync(real, path.join(work, "hard"));
  assert.equal(openForSync(real), null, "a file with another hard link");
  fs.unlinkSync(path.join(work, "hard"));
  if (!HAS_PROC) return;
  fs.renameSync(path.join(local, "dir"), path.join(local, "moved"));
  fs.symlinkSync(path.join(local, "moved"), path.join(local, "dir"));
  assert.equal(openForSync(real), null, "a directory above it became a link");
});

// A broker outage fails every tick's upload; each must give back the file it opened.
test("an upload that fails closes the file the syncer opened", { skip: !HAS_PROC && "needs /proc" }, async () => {
  await write("a.txt", "a");
  const failing = syncer({ backend: { put: async () => { throw new Error("storage-credentials answered 502"); }, list: async () => [] } });
  const open = () => fs.readdirSync("/proc/self/fd").length;
  const before = open();
  for (let i = 0; i < 5; i++) await failing.flush().catch(() => {});
  assert.equal(open(), before);
});

// A package appending to a log while a tick uploads it: the body is what the open saw, so
// it always agrees with the length the upload states.
test("a file that grows during its upload is sent at the size it was opened at", async () => {
  const abs = await write("log.jsonl", "first\n");
  const sent = [];
  const s = syncer({ backend: { list: async () => [], put: async (rel, { body, size }) => {
    fs.appendFileSync(abs, "appended while uploading\n");
    const chunks = [];
    for await (const chunk of body) chunks.push(chunk);
    sent.push({ rel, size, body: Buffer.concat(chunks).toString() });
  } } });
  await s.flush();
  assert.deepEqual(sent, [{ rel: "log.jsonl", size: 6, body: "first\n" }]);
  assert.equal((await s.verify()).ok, false, "what was appended is still outstanding");
});

test("an empty file is uploaded as an empty body, even if it grows meanwhile", async () => {
  const abs = await write("empty.txt", "");
  const sent = [];
  const s = syncer({ backend: { list: async () => [], put: async (rel, { body, size }) => {
    fs.appendFileSync(abs, "x");
    sent.push({ size, length: Buffer.isBuffer(body) ? body.length : null });
  } } });
  await s.flush();
  assert.deepEqual(sent, [{ size: 0, length: 0 }]);
});

test("S3Backend states the size the syncer gives as the upload's length", async () => {
  const commands = [];
  const backend = new S3Backend({ bucket: "b", prefix: "researchers/439", client: async () => ({ send: async (command) => { commands.push(command.input); } }) });
  await backend.put("a.txt", { body: Buffer.from("abc"), size: 3 });
  assert.equal(commands[0].ContentLength, 3);
  assert.equal(commands[0].Key, "researchers/439/a.txt");
});

// The syncer, running as root, never reads such a file, so it is never synced; that is
// logged once, and the verify names it.
test("a file skipped for another hard link is logged once and named by the verify", async () => {
  const abs = await write("linked.txt", "a");
  fs.linkSync(abs, path.join(work, "outside-link"));
  const s = syncer();
  let result;
  const lines = await captureLog(async () => {
    await s.flush();
    await s.flush();
    result = await s.flushAndVerify("suspend");
  });
  assert.deepEqual(lines.filter((l) => l.event === "sync.unsyncable").map((l) => l.path), ["linked.txt"]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.skipped, ["linked.txt"]);
});

test("the directory backend writes a Buffer body whole", async () => {
  await new DirBackend(remote).put("b.txt", { body: Buffer.from("abc"), size: 3 });
  assert.equal(fs.readFileSync(path.join(remote, "b.txt"), "utf8"), "abc");
});

// The empty file's body is a Buffer, not a stream that would close the descriptor itself.
test("an empty file's descriptor is closed once its upload is sent", async () => {
  await write("empty.txt", "");
  const closed = [];
  const closeSync = fs.closeSync;
  fs.closeSync = (fd) => { closed.push(fd); return closeSync(fd); };
  let closedDuringPut;
  try {
    await syncer({ backend: { list: async () => [], put: async () => { closedDuringPut = closed.length; } } }).flush();
  } finally {
    fs.closeSync = closeSync;
  }
  assert.equal(closedDuringPut, 0, "still open while the upload is sent");
  assert.equal(closed.length, 1);
});
