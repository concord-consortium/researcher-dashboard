import fs from "node:fs";
import path from "node:path";
import { log } from "./log.js";

// What an analysis package is handed, and where its credential lives.
//
// The package makes its own AP and log pulls with cc-data (design.md, AP data flow),
// which is only safe because the credential is the requesting researcher's own rather
// than a shared site admin's: a package that leaks it reaches what its researcher could
// already download to their laptop, and nothing else. CLUE reads stay in the runner,
// because those need the class runner token, a Firebase credential the design says must
// never reach package code.
//
// The package's HOME sits outside the synced data root, so the credential is never
// written to S3, the same reason the runner's own is under $HOME rather than /data.
// The dataset is under the data root, because the corpus is exactly what should survive
// a suspend and be there for the next analysis.

export const CC_DATA_CREDENTIAL_MODE = 0o600;

export function packagePaths({ workRoot, dataRoot, classHash, packageName }) {
  return {
    // Per package, so two packages cannot read each other's working files, and so a
    // rerun starts clean.
    home: path.join(workRoot, "home", packageName),
    outputDir: path.join(workRoot, "out", packageName),
    // Shared across packages and across runs: the pulled corpus is the expensive thing
    // and belongs to the researcher, keyed by class.
    dataDir: path.join(dataRoot, "classes", classHash),
    datasetRoot: dataRoot
  };
}

// cc-data reads its credential from $HOME/.config/cc-data/credentials.json and warns
// about a missing keychain before falling back to exactly that path, which is the
// expected arrangement on a VM with no dbus rather than a problem.
export function writeCcDataCredential({ home, portalHost, token }) {
  const dir = path.join(home, ".config", "cc-data");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "credentials.json");
  fs.writeFileSync(file, JSON.stringify({ [portalHost]: { token } }, null, 2), {
    mode: CC_DATA_CREDENTIAL_MODE
  });
  // Written, then tightened: writeFileSync's mode is masked by the process umask, so a
  // umask of 022 would leave it readable by anything else on the VM.
  fs.chmodSync(file, CC_DATA_CREDENTIAL_MODE);
  return file;
}

// The package runs as another uid in its own namespace, so it inherits nothing useful
// and everything it needs has to be named here. No AWS variables and no Firebase
// session: it pulls through cc-data as the researcher and nothing else.
export function packageEnvironment({ paths, portalHost, classHash, classId }) {
  return {
    HOME: paths.home,
    PATH: "/usr/local/bin:/usr/bin:/bin",
    CC_DATA_LOCAL: paths.dataDir,
    CC_DATA_PORTAL: portalHost,
    RD_CLASS_HASH: classHash,
    // What report-server filters a run by. The hash identifies the class to Firebase and
    // CLUE; this identifies it to the portal, and neither derives from the other.
    RD_PORTAL_CLASS_ID: String(classId),
    RD_DATA_DIR: paths.dataDir,
    RD_OUTPUT_DIR: paths.outputDir
  };
}

// Everything the package needs, prepared and owned by the analysis uid.
export function preparePackage({ workRoot, dataRoot, classHash, classId, packageName, portalHost, token, uid }) {
  const paths = packagePaths({ workRoot, dataRoot, classHash, packageName });

  fs.rmSync(paths.home, { recursive: true, force: true });
  for (const dir of [paths.home, paths.outputDir, paths.dataDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const credentialFile = token
    ? writeCcDataCredential({ home: paths.home, portalHost, token })
    : null;

  // The package runs as `uid`, so it has to own what it is expected to write. The data
  // directory is included because the package pulls into it.
  if (typeof uid === "number") {
    for (const dir of [paths.home, paths.outputDir, paths.dataDir]) {
      fs.chownSync(dir, uid, uid);
    }
    if (credentialFile) fs.chownSync(credentialFile, uid, uid);
  }

  log.info("package.prepared", {
    package: packageName,
    class_hash: classHash,
    credential: Boolean(credentialFile)
  });

  return { paths, env: packageEnvironment({ paths, portalHost, classHash, classId }) };
}

// What the package reports back, because it makes the pulls and the runner writes
// Firestore. Absent or unreadable is not a failure: a package that pulled nothing has
// nothing to say about counts, and the class document simply keeps what it had.
export function readPackageCounts(outputDir) {
  const file = path.join(outputDir, "counts.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const counts = {};
    for (const key of ["answers", "learners", "logs", "log_freshness_at"]) {
      if (parsed[key] !== undefined) counts[key] = parsed[key];
    }
    return counts;
  } catch {
    return {};
  }
}
