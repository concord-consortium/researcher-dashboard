import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { checksumsMatch, fetchPackage, packageKey, readManifest, sha256File } from "../server/package-fetch.js";

let root;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "rd-fetch-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const MANIFEST = { name: "class-counts", version: "1.0.0", entrypoint: "run.py", required_inputs: ["answers"] };

// A backend that writes known bytes, standing in for S3.
function backendWriting(contents) {
  return {
    requested: [],
    async get(key, dest) {
      this.requested.push(key);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, contents);
    }
  };
}

// Unzipping is the platform's job; here it just materializes what the archive stands for.
function unzipWriting(manifest) {
  return async (_archive, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    if (manifest) fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(manifest));
  };
}

async function checksumOf(contents) {
  const f = path.join(root, "probe");
  fs.writeFileSync(f, contents);
  return sha256File(f);
}

test("the key is name and version, so a catalog entry maps to one object", () => {
  assert.equal(packageKey("class-counts", "1.0.0"), "class-counts/1.0.0.zip");
});

test("fetches, verifies and unpacks a matching package", async () => {
  const backend = backendWriting("archive-bytes");
  const checksum = await checksumOf("archive-bytes");

  const { manifest, dir } = await fetchPackage({
    backend,
    pkg: { name: "class-counts", version: "1.0.0", checksum },
    workRoot: path.join(root, "work"),
    unzip: unzipWriting(MANIFEST)
  });

  assert.deepEqual(backend.requested, ["class-counts/1.0.0.zip"]);
  assert.equal(manifest.name, "class-counts");
  assert.ok(fs.existsSync(path.join(dir, "manifest.json")));
});

// Criterion 20: a version 3 zip with a checksum copied from version 2 must refuse, and
// nothing from the zip may be unpacked.
test("a checksum mismatch refuses and unpacks nothing", async () => {
  const backend = backendWriting("different-bytes");
  const workRoot = path.join(root, "work");
  let unzipped = false;

  await assert.rejects(
    () => fetchPackage({
      backend,
      pkg: { name: "class-counts", version: "3.0.0", checksum: "sha256:" + "0".repeat(64) },
      workRoot,
      unzip: async () => { unzipped = true; }
    }),
    /failed its checksum/
  );

  assert.equal(unzipped, false, "nothing may be unpacked from an archive that failed");
  assert.ok(!fs.existsSync(path.join(workRoot, "packages", "class-counts", "3.0.0")));
  // The archive goes too, or the next run's existence check would skip the fetch and
  // re-verify the same bad bytes.
  assert.ok(!fs.existsSync(path.join(workRoot, "packages", "class-counts", "3.0.0.zip")));
});

test("an archive already fetched is re-verified rather than trusted", async () => {
  const backend = backendWriting("archive-bytes");
  const checksum = await checksumOf("archive-bytes");
  const workRoot = path.join(root, "work");
  const args = { backend, pkg: { name: "class-counts", version: "1.0.0", checksum }, workRoot, unzip: unzipWriting(MANIFEST) };

  await fetchPackage(args);
  await fetchPackage(args);
  assert.equal(backend.requested.length, 1, "an immutable version is fetched once");

  // Tamper with the cached copy: the second call must not accept it.
  fs.writeFileSync(path.join(workRoot, "packages", "class-counts", "1.0.0.zip"), "tampered");
  await assert.rejects(() => fetchPackage(args), /failed its checksum/);
});

test("a manifest naming a different package is refused", async () => {
  const backend = backendWriting("archive-bytes");
  const checksum = await checksumOf("archive-bytes");

  await assert.rejects(
    () => fetchPackage({
      backend,
      pkg: { name: "class-counts", version: "1.0.0", checksum },
      workRoot: path.join(root, "work"),
      unzip: unzipWriting({ ...MANIFEST, version: "9.9.9" })
    }),
    /contains a manifest for class-counts 9.9.9/
  );
});

test("checksums compare case-insensitively", async () => {
  const c = await checksumOf("x");
  assert.ok(checksumsMatch(c, c.toUpperCase()));
  assert.ok(!checksumsMatch(c, "sha256:" + "0".repeat(64)));
  assert.ok(!checksumsMatch(c, undefined));
});

describe_manifest();
function describe_manifest() {
  test("a manifest without the required fields is refused", () => {
    const dir = path.join(root, "pkg");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ name: "x", version: "1" }));
    assert.throws(() => readManifest(dir), /missing entrypoint/);
  });

  // The entrypoint is resolved against the package directory and then executed.
  test("an entrypoint escaping the package directory is refused", () => {
    const dir = path.join(root, "pkg2");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"),
      JSON.stringify({ ...MANIFEST, entrypoint: "../../../usr/bin/env" }));
    assert.throws(() => readManifest(dir), /escapes the package directory/);
  });

  test("an unreadable manifest names the problem", () => {
    const dir = path.join(root, "pkg3");
    fs.mkdirSync(dir, { recursive: true });
    assert.throws(() => readManifest(dir), /no readable manifest.json/);
  });
}
