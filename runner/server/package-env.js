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
export function packageEnvironment({ paths, portalHost, classHash, classId, proxyUrl }) {
  return {
    HOME: paths.home,
    PATH: "/usr/local/bin:/usr/bin:/bin",
    // The namespace has no default route, so the proxy is the only way out and the
    // package has to be told where it is. Without these the package is simply offline
    // and its HTTP client fails with nothing useful to say.
    ...(proxyUrl ? { HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl, https_proxy: proxyUrl, http_proxy: proxyUrl } : {}),
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

// The home is rebuilt per preparation and belongs entirely to the package, so it is
// handed over whole. Chowning only the directory and the credential file inside it left
// the .config/cc-data path root-owned, and cc-data writes its own config.json there.
function chownTree(dir, uid) {
  fs.chownSync(dir, uid, uid);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) chownTree(full, uid);
    else fs.chownSync(full, uid, uid);
  }
}

// Every directory from the root down to the leaf, inclusive, so each can be made
// searchable by the analysis uid.
function parentsBetween(root, leaf) {
  const dirs = [];
  let current = leaf;
  while (current.startsWith(root) && current.length >= root.length) {
    dirs.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

// Everything the package needs, prepared and owned by the analysis uid.
export function preparePackage({ workRoot, dataRoot, classHash, classId, packageName, portalHost, token, uid, proxyUrl }) {
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
    chownTree(paths.home, uid);
    for (const dir of [paths.outputDir, paths.dataDir]) {
      fs.chownSync(dir, uid, uid);
    }
    // Owning the leaf is not enough: creating a file in it also needs search permission
    // on every directory above it, and those are made by the syncer and the CLUE reader
    // as root. Without this the package fails with EACCES on a directory it owns.
    for (const dir of parentsBetween(paths.datasetRoot, paths.dataDir)) {
      fs.chmodSync(dir, 0o755);
    }
  }

  log.info("package.prepared", {
    package: packageName,
    class_hash: classHash,
    credential: Boolean(credentialFile),
    uid: uid ?? null,
    data_dir_mode: (fs.statSync(paths.dataDir).mode & 0o777).toString(8),
    data_dir_uid: fs.statSync(paths.dataDir).uid
  });

  return { paths, env: packageEnvironment({ paths, portalHost, classHash, classId, proxyUrl }) };
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
