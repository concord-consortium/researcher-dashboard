import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { MAX_UNPACKED_BYTES, PackageUnreadable, fetchPackage, inflatedSize, packageDocId, packageKey, readManifest, sha256File } from "../server/package-fetch.js";

let root;
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "rd-fetch-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const IDENTITY = "users/136/class-counts";
const MANIFEST = { name: "class-counts", version: "1.0.0", entrypoint: "run.py", expected_duration_seconds: 120 };

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

// Unzipping is the image's job; here it just materializes what the archive stands for.
function unzipWriting(manifest) {
  return async (_archive, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    if (manifest) fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(manifest));
  };
}
const small = async () => ({ bytes: 10, over: false });

async function checksumOf(contents) {
  const f = path.join(root, "probe");
  fs.writeFileSync(f, contents);
  return sha256File(f);
}

test("the key is report-server's layout: the identity, then the version", () => {
  assert.equal(packageKey(IDENTITY, "1.0.0"), "users/136/class-counts/1.0.0.zip");
});

test("the package key is the identity with / as __, and refuses anything else", () => {
  assert.equal(packageDocId("projects/20/class-counts"), "projects__20__class-counts");
  for (const bad of ["class-counts", "users/1/Class_Counts", "users/x/counts", "users/1/counts/extra", "../1/counts"]) {
    assert.throws(() => packageDocId(bad), /not a package identity/, bad);
  }
});

test("fetches, verifies and unpacks a matching package into its package key's directory", async () => {
  const backend = backendWriting("archive-bytes");
  const checksum = await checksumOf("archive-bytes");
  const { manifest, dir } = await fetchPackage({
    backend, pkg: { identity: IDENTITY, version: "1.0.0", checksum }, workRoot: path.join(root, "work"), unzip: unzipWriting(MANIFEST), measure: small
  });
  assert.deepEqual(backend.requested, ["users/136/class-counts/1.0.0.zip"]);
  assert.equal(manifest.name, "class-counts");
  assert.equal(dir, path.join(root, "work", "packages", "users__136__class-counts", "1.0.0"));
});

// Two packages with the same name from different origins never share a cached archive.
test("same-named packages from two origins do not share a fetch cache", async () => {
  const workRoot = path.join(root, "work");
  const a = await checksumOf("bytes-a");
  const b = await checksumOf("bytes-b");
  await fetchPackage({ backend: backendWriting("bytes-a"), pkg: { identity: "users/1/counts", version: "1.0.0", checksum: a }, workRoot, unzip: unzipWriting({ ...MANIFEST, name: "counts" }), measure: small });
  await fetchPackage({ backend: backendWriting("bytes-b"), pkg: { identity: "projects/20/counts", version: "1.0.0", checksum: b }, workRoot, unzip: unzipWriting({ ...MANIFEST, name: "counts" }), measure: small });
  assert.equal(fs.readFileSync(path.join(workRoot, "packages", "users__1__counts", "1.0.0.zip"), "utf8"), "bytes-a");
  assert.equal(fs.readFileSync(path.join(workRoot, "packages", "projects__20__counts", "1.0.0.zip"), "utf8"), "bytes-b");
});

// Without a list grant on packages/, a missing key answers AccessDenied, not NoSuchKey.
test("an archive the backend cannot read is missing or not readable, whatever S3 said", async () => {
  for (const name of ["AccessDenied", "NoSuchKey"]) {
    const backend = { async get() { throw Object.assign(new Error(name), { name }); } };
    await assert.rejects(
      () => fetchPackage({ backend, pkg: { identity: IDENTITY, version: "1.0.0", checksum: "sha256:x" }, workRoot: path.join(root, "work"), unzip: unzipWriting(MANIFEST), measure: small }),
      (err) => err instanceof PackageUnreadable && err.message === "packages/users/136/class-counts/1.0.0.zip is missing or not readable"
    );
  }
});

test("a checksum mismatch refuses and unpacks nothing", async () => {
  const workRoot = path.join(root, "work");
  let unzipped = false;
  await assert.rejects(
    () => fetchPackage({ backend: backendWriting("different-bytes"), pkg: { identity: IDENTITY, version: "3.0.0", checksum: "sha256:" + "0".repeat(64) }, workRoot, unzip: async () => { unzipped = true; }, measure: small }),
    /failed its checksum/
  );
  assert.equal(unzipped, false);
  assert.ok(!fs.existsSync(path.join(workRoot, "packages", "users__136__class-counts", "3.0.0.zip")));
});

test("an archive already fetched is re-verified rather than trusted", async () => {
  const backend = backendWriting("archive-bytes");
  const checksum = await checksumOf("archive-bytes");
  const workRoot = path.join(root, "work");
  const args = { backend, pkg: { identity: IDENTITY, version: "1.0.0", checksum }, workRoot, unzip: unzipWriting(MANIFEST), measure: small };
  await fetchPackage(args);
  await fetchPackage(args);
  assert.equal(backend.requested.length, 1, "an immutable version is fetched once");
  fs.writeFileSync(path.join(workRoot, "packages", "users__136__class-counts", "1.0.0.zip"), "tampered");
  await assert.rejects(() => fetchPackage(args), /failed its checksum/);
});

test("a manifest naming a different package or version is refused", async () => {
  const checksum = await checksumOf("archive-bytes");
  for (const manifest of [{ ...MANIFEST, version: "9.9.9" }, { ...MANIFEST, name: "other" }]) {
    await assert.rejects(
      () => fetchPackage({ backend: backendWriting("archive-bytes"), pkg: { identity: IDENTITY, version: "1.0.0", checksum }, workRoot: path.join(root, `w-${manifest.name}`), unzip: unzipWriting(manifest), measure: small }),
      /contains a manifest for/
    );
  }
});

// The declared sizes are the author's claim; what unzip produces is the fact.
test("an archive that inflates past 50 MiB is refused before anything is unpacked", async () => {
  const checksum = await checksumOf("archive-bytes");
  let unzipped = false;
  await assert.rejects(
    () => fetchPackage({ backend: backendWriting("archive-bytes"), pkg: { identity: IDENTITY, version: "1.0.0", checksum }, workRoot: path.join(root, "work"), unzip: async () => { unzipped = true; }, measure: async () => ({ bytes: MAX_UNPACKED_BYTES + 1, over: true }) }),
    /unpacks to more than 52428800 bytes/
  );
  assert.equal(unzipped, false);
});

test("inflatedSize counts what unzip really produces, and stops at the limit", { skip: !hasZip() }, async () => {
  const dir = path.join(root, "z");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "big.bin"), Buffer.alloc(3 * 1024 * 1024));
  execFileSync("zip", ["-q", "-9", path.join(root, "bomb.zip"), "big.bin"], { cwd: dir });
  assert.ok(fs.statSync(path.join(root, "bomb.zip")).size < 64 * 1024, "the archive is small");
  const stopped = await inflatedSize(path.join(root, "bomb.zip"), { limit: 1024 * 1024 });
  assert.equal(stopped.over, true);
  assert.ok(stopped.bytes > 1024 * 1024 && stopped.bytes < 3 * 1024 * 1024, "stopped past the limit, before the end");
  assert.deepEqual(await inflatedSize(path.join(root, "bomb.zip")), { bytes: 3 * 1024 * 1024, over: false });
});

// unzip restores a symbolic link as a link, which could point anywhere.
test("an archive holding a symbolic link is refused and its directory removed", { skip: !hasZip() }, async () => {
  const dir = path.join(root, "s");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(MANIFEST));
  fs.writeFileSync(path.join(dir, "run.py"), "");
  fs.symlinkSync("/etc/passwd", path.join(dir, "link"));
  execFileSync("zip", ["-q", "-y", path.join(root, "sym.zip"), "manifest.json", "run.py", "link"], { cwd: dir });
  const bytes = fs.readFileSync(path.join(root, "sym.zip"));
  const checksum = await checksumOf(bytes);
  const workRoot = path.join(root, "work");
  const unzip = async (archive, dest) => { execFileSync("unzip", ["-q", "-o", archive, "-d", dest]); };
  await assert.rejects(
    () => fetchPackage({ backend: backendWriting(bytes), pkg: { identity: IDENTITY, version: "1.0.0", checksum }, workRoot, unzip }),
    /holds a symbolic link, link/
  );
  assert.ok(!fs.existsSync(path.join(workRoot, "packages", "users__136__class-counts", "1.0.0")));
});

function writeManifest(name, manifest) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  return dir;
}

test("a manifest without the required fields is refused", () => {
  assert.throws(() => readManifest(writeManifest("a", { name: "x", version: "1" })), /missing entrypoint/);
});

test("a manifest without a positive integer duration is refused", () => {
  for (const d of [undefined, 0, -1, 1.5, "120"]) {
    assert.throws(() => readManifest(writeManifest(`d${d}`, { ...MANIFEST, expected_duration_seconds: d })), /expected_duration_seconds/);
  }
});

// A misspelled `any` would make a package apply everywhere.
test("a manifest's urls must be all, any and none lists", () => {
  assert.throws(() => readManifest(writeManifest("u1", { ...MANIFEST, urls: { anyy: ["*"] } })), /unknown key, anyy/);
  assert.throws(() => readManifest(writeManifest("u2", { ...MANIFEST, urls: { any: "*" } })), /not a list of patterns/);
  assert.doesNotThrow(() => readManifest(writeManifest("u3", { ...MANIFEST, urls: { all: [], any: ["*x*"], none: [] } })));
});

test("an entrypoint escaping the package directory is refused", () => {
  assert.throws(() => readManifest(writeManifest("e", { ...MANIFEST, entrypoint: "../../../usr/bin/env" })), /escapes the package directory/);
});

test("an unreadable manifest names the problem", () => {
  const dir = path.join(root, "none");
  fs.mkdirSync(dir);
  assert.throws(() => readManifest(dir), /no readable manifest.json/);
});

function hasZip() {
  try {
    execFileSync("zip", ["-v"], { stdio: "ignore" });
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
