import { createHash } from "node:crypto";
import fs from "node:fs";
import { createReadStream } from "node:fs";
import path from "node:path";
import { log } from "./log.js";

// Fetching and verifying an analysis package.
//
// The package is code the runner did not write, fetched at run time, so the checksum is
// the only thing standing between "the catalog said version 2" and whatever happens to
// be at that key. It is verified before anything is unpacked, because an archive that
// fails its checksum must leave nothing behind to run or to inspect later and mistake
// for the real thing.

export async function sha256File(file) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(file).on("error", reject).on("data", (chunk) => hash.update(chunk)).on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

// `sha256:<hex>`, matching the /run-package body's `package.checksum`, compared after
// normalizing case so a catalog written by a different tool still matches.
export function checksumsMatch(a, b) {
  return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
}

export function packageKey(name, version) {
  return `${name}/${version}.zip`;
}

export async function fetchPackage({ backend, pkg, workRoot, unzip }) {
  const dest = path.join(workRoot, "packages", pkg.name, pkg.version);
  const archive = `${dest}.zip`;

  // A package is immutable at a version, so a copy already verified here is the same
  // bytes. Re-verified rather than trusted, since it is cheap next to the fetch and the
  // work root outlives an analysis.
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  if (!fs.existsSync(archive)) {
    await backend.get(packageKey(pkg.name, pkg.version), archive);
  }

  const actual = await sha256File(archive);
  if (!checksumsMatch(actual, pkg.checksum)) {
    // Removed rather than left: an archive that failed is not evidence of anything, and
    // leaving it would let the next run's existence check skip the fetch and re-verify
    // the same bad bytes.
    fs.rmSync(archive, { force: true });
    throw new Error(
      `package ${pkg.name} ${pkg.version} failed its checksum: expected ${pkg.checksum}, got ${actual}`
    );
  }

  // Only now, so a failed checksum unpacks nothing.
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  await unzip(archive, dest);

  const manifest = readManifest(dest);
  if (manifest.name !== pkg.name || manifest.version !== pkg.version) {
    throw new Error(
      `package ${pkg.name} ${pkg.version} contains a manifest for ${manifest.name} ${manifest.version}`
    );
  }

  log.info("package.resolved", { package: pkg.name, version: pkg.version, checksum: actual });
  return { manifest, dir: dest };
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
  // The entrypoint is joined to the package directory and then executed, so a path that
  // escapes it would run something the archive does not contain.
  const entry = path.resolve(dir, manifest.entrypoint);
  if (!entry.startsWith(path.resolve(dir) + path.sep)) {
    throw new Error("manifest.json entrypoint escapes the package directory");
  }
  return manifest;
}
