import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { log } from "./log.js";

// Fetching and verifying a package.
//
// The package is code the runner did not write, fetched at run time, so the checksum is
// the only thing standing between "the catalog said version 2" and whatever happens to
// be at that key. It is verified before anything is unpacked, because an archive that
// fails its checksum must leave nothing behind to run or to inspect later and mistake
// for the real thing.

// The catalog's grammar, asserted against report-service's package contract fixture
// (fixtures/package-contract.json). A name has no underscore, which is what makes `__`
// unambiguous in a package key.
export const IDENTITY = /^(users|projects)\/[1-9][0-9]{0,17}\/[a-z0-9][a-z0-9-]{0,62}$/;
export const VERSION = /^(?=.{1,64}$)(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$/;
export const CHECKSUM = /^sha256:[0-9a-f]{64}$/;
// A result document id: the identity with each / as __.
export const PACKAGE_DOC_ID = new RegExp(IDENTITY.source.replaceAll("\\/", "__"));

// The most report-server accepts as an archive's declared unpacked size. The runner,
// which unpacks everything, bounds the bytes actually produced.
export const MAX_UNPACKED_BYTES = 50 * 1024 * 1024;

export async function sha256File(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(file).on("error", reject).on("data", (chunk) => hash.update(chunk)).on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

// The bucket prefix packages are published under, beside `researchers/`. The broker's
// session policy grants read on it.
export const PACKAGES_PREFIX = "packages";

// The key under PACKAGES_PREFIX, which is report-server's layout: the identity, then the
// version.
export function packageKey(identity, version) {
  return `${identity}/${version}.zip`;
}

// The identity with `/` as `__`: one path segment, reversible, never Firestore's
// reserved `__.*__`, since a name cannot contain `_`. It names the result document and
// every per-package path in the VM, and is derived here, never taken from a caller.
export function packageDocId(identity) {
  if (!IDENTITY.test(identity)) throw new Error(`${identity} is not a package identity`);
  return identity.replaceAll("/", "__");
}

export function nameOf(identity) {
  return identity.split("/").at(-1);
}

// A backend's failure to read the archive. The broker's session policy grants no list on
// packages/, so a missing key answers AccessDenied rather than NoSuchKey, and neither is
// taken to mean more than the other.
export class PackageUnreadable extends Error {}

// Counts what `unzip -p` inflates, and stops it past `limit`: the declared sizes in an
// archive are the author's claim, and an entry can inflate to far more than it says.
export function inflatedSize(archive, { limit = MAX_UNPACKED_BYTES, spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnFn("unzip", ["-p", archive], { stdio: ["ignore", "pipe", "pipe"] });
    let bytes = 0;
    let over = false;
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > limit && !over) {
        over = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (over) return resolve({ bytes, over: true });
      if (code !== 0) return reject(new Error(`unzip could not read the archive (exit ${code}): ${stderr.trim()}`));
      resolve({ bytes, over: false });
    });
  });
}

// Everything unzip wrote, refusing a symbolic link (unzip restores them) or anything
// that resolves outside the package directory.
function checkTree(dir) {
  const root = path.resolve(dir) + path.sep;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`the archive holds a symbolic link, ${path.relative(dir, full)}`);
      if (!path.resolve(full).startsWith(root)) throw new Error(`the archive writes outside its directory, ${full}`);
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(dir);
}

// `pkg` is {identity, version, checksum} from /work. The cache and the unpacked copy are
// keyed by the package key, so two packages with the same name from different origins
// never share an archive or a directory.
export async function fetchPackage({ backend, pkg, workRoot, unzip, measure = inflatedSize }) {
  const docId = packageDocId(pkg.identity);
  const dest = path.join(workRoot, "packages", docId, pkg.version);
  const archive = `${dest}.zip`;
  const key = packageKey(pkg.identity, pkg.version);

  // A package is immutable at a version, so a copy already verified here is the same
  // bytes. Re-verified rather than trusted, since it is cheap next to the fetch and the
  // work root outlives a run.
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  if (!fs.existsSync(archive)) {
    try {
      await backend.get(key, archive);
    } catch (err) {
      fs.rmSync(archive, { force: true });
      log.warn("package.fetch_failed", { key, error: err.name ?? err.message });
      throw new PackageUnreadable(`${PACKAGES_PREFIX}/${key} is missing or not readable`);
    }
  }

  const actual = await sha256File(archive);
  if (actual !== pkg.checksum) {
    // Removed rather than left: an archive that failed is not evidence of anything, and
    // leaving it would let the next run's existence check skip the fetch and re-verify
    // the same bad bytes.
    fs.rmSync(archive, { force: true });
    throw new Error(
      `package ${pkg.identity} ${pkg.version} failed its checksum: expected ${pkg.checksum}, got ${actual}`
    );
  }

  // Only now, so a failed checksum unpacks nothing, and a bomb unpacks nothing either.
  const size = await measure(archive);
  if (size.over) {
    throw new Error(`package ${pkg.identity} ${pkg.version} unpacks to more than ${MAX_UNPACKED_BYTES} bytes`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  await unzip(archive, dest);
  try {
    checkTree(dest);
  } catch (err) {
    fs.rmSync(dest, { recursive: true, force: true });
    throw new Error(`package ${pkg.identity} ${pkg.version} is refused: ${err.message}`);
  }

  const manifest = readManifest(dest);
  if (manifest.name !== nameOf(pkg.identity) || manifest.version !== pkg.version) {
    throw new Error(
      `package ${pkg.identity} ${pkg.version} contains a manifest for ${manifest.name} ${manifest.version}`
    );
  }

  log.info("package.resolved", { package: pkg.identity, version: pkg.version, checksum: actual });
  return { manifest, dir: dest };
}

const URL_SENSES = ["all", "any", "none"];

// A manifest with no pattern in any group applies to every scope, so nothing needs asking.
export function declaresPatterns(urls) {
  return URL_SENSES.some((sense) => (urls?.[sense] ?? []).length > 0);
}

export function readManifest(dir) {
  const file = path.join(dir, "manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`package has no readable manifest.json: ${err.message}`);
  }
  for (const field of ["name", "version", "entrypoint"]) {
    if (typeof manifest[field] !== "string" || manifest[field] === "") {
      throw new Error(`manifest.json is missing ${field}`);
    }
  }
  // Checked here as well as by report-server at publish, because it sets the window the
  // runner schedules against.
  const declared = manifest.expected_duration_seconds;
  if (!Number.isInteger(declared) || declared < 1) {
    throw new Error("manifest.json's expected_duration_seconds is not a positive integer");
  }
  if (manifest.urls !== undefined) {
    if (typeof manifest.urls !== "object" || manifest.urls === null || Array.isArray(manifest.urls)) {
      throw new Error("manifest.json's urls is not an object");
    }
    for (const [sense, patterns] of Object.entries(manifest.urls)) {
      if (!URL_SENSES.includes(sense)) throw new Error(`manifest.json's urls has an unknown key, ${sense}`);
      if (!Array.isArray(patterns) || patterns.some((p) => typeof p !== "string" || p === "")) {
        throw new Error(`manifest.json's urls.${sense} is not a list of patterns`);
      }
    }
  }
  // The entrypoint is joined to the package directory and then executed, so a path that
  // escapes it would run something the archive does not contain.
  const entry = path.resolve(dir, manifest.entrypoint);
  if (!entry.startsWith(path.resolve(dir) + path.sep)) {
    throw new Error("manifest.json entrypoint escapes the package directory");
  }
  return manifest;
}
