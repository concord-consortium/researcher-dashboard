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
// cc-data's dataset root is under the data root, because the pulled corpus is exactly
// what should survive a suspend and be there for the next analysis.
//
// cc-data reads one variable for that root, CC_DATA_ROOT, and nothing else: without it
// it falls back to $HOME/cc-data, which here is the throwaway home, so every pull lands
// somewhere that is deleted before the next run and is never synced.


// A package name is a Firestore document id, a filesystem path segment and a cc-data
// dataset name, and the last is the narrowest of the three.
export const DATASET_NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export function packagePaths({ workRoot, dataRoot, classHash, packageName }) {
  return {
    // Per package, so two packages cannot read each other's working files, and so a
    // rerun starts clean.
    home: path.join(workRoot, "home", packageName),
    outputDir: path.join(workRoot, "out", packageName),
    // Shared across packages and across runs: the pulled corpus is the expensive thing
    // and belongs to the researcher, keyed by class.
    dataDir: path.join(dataRoot, "classes", classHash),
    // cc-data's own root, which holds <portal>/datasets/<name> beneath it. One dataset
    // per package rather than per class: a package decides for itself how many classes
    // it pulls, and cc-data records the run each row came from, so scoping a count to
    // one class is the package's query rather than a directory the runner picks.
    ccDataRoot: path.join(dataRoot, "cc-data"),
    dataRoot
  };
}


// The package runs as another uid in its own namespace, so it inherits nothing useful
// and everything it needs has to be named here. No AWS variables and no Firebase
// session: it pulls through cc-data as the researcher and nothing else.
export function packageEnvironment({ paths, portalHost, packageName, classHash, classId, proxyUrl, reportServerUrl, bucket, storagePrefix }) {
  return {
    HOME: paths.home,
    PATH: "/usr/local/bin:/usr/bin:/bin",
    // The namespace has no default route, so the proxy is the only way out and the
    // package has to be told where it is. Without these the package is simply offline
    // and its HTTP client fails with nothing useful to say.
    ...(proxyUrl ? { HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl, https_proxy: proxyUrl, http_proxy: proxyUrl } : {}),
    // Where cc-data keeps its datasets. The one variable it reads for this.
    CC_DATA_ROOT: paths.ccDataRoot,
    // The dataset this package pulls into, named here rather than composed by the
    // package, so the layout stays the runner's to change.
    RD_DATASET: `${portalHost}/${packageName}`,
    CC_DATA_LOCAL: paths.dataDir,
    CC_DATA_PORTAL: portalHost,
    // Which report-server the researcher's credential is for. cc-data resolves it from
    // the login, so a package pulling with cc-data never needs it; a package that probes
    // what it can reach does, and without it the probe reports nothing rather than
    // reporting that it could not check.
    ...(reportServerUrl ? { RD_REPORT_SERVER_URL: reportServerUrl } : {}),
    // Where the researcher's data is kept, and under which prefix. Neither is a
    // credential and neither lets a package act: the sandbox has no AWS credentials and
    // no way to obtain any, which is exactly what a package measuring its own boundary
    // has to demonstrate rather than assume. Naming the store is what lets it try.
    ...(bucket ? { RD_BUCKET: bucket } : {}),
    ...(storagePrefix ? { RD_STORAGE_PREFIX: storagePrefix } : {}),
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
// The CLUE corpus is the runner's: the package reads it and must not be able to rewrite
// it, which is the read-only half of the contract in design.md.
export const RUNNER_OWNED = "clue-documents";

function chownTree(dir, uid, skip = null, chown = fs.chownSync) {
  chown(dir, uid, uid);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip && entry.name === skip) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) chownTree(full, uid, skip, chown);
    else chown(full, uid, uid);
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
// `chown` is a seam: the effect it has cannot be observed by a test, which runs as the
// uid it would be chowning to, so what a test can check is that it was asked for.
export async function preparePackage({ workRoot, dataRoot, classHash, classId, packageName, portalHost, token, uid, proxyUrl, reportServerUrl, bucket, storagePrefix, login, chown = fs.chownSync }) {
  if (!DATASET_NAME.test(packageName)) {
    throw new Error(`package name ${packageName} is not a usable cc-data dataset name (${DATASET_NAME})`);
  }
  const paths = packagePaths({ workRoot, dataRoot, classHash, packageName });

  fs.rmSync(paths.home, { recursive: true, force: true });
  // The cc-data root is not rebuilt: it holds the pulled corpus, which is the thing
  // worth keeping across runs and across suspends.
  for (const dir of [paths.home, paths.outputDir, paths.dataDir, paths.ccDataRoot]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // The credential is installed by cc-data itself, into the package's own HOME and as
  // the package's own uid. Its store has a version, a portals map and a backend that
  // may be a keyring or a file, and none of that is ours to reproduce.
  if (typeof uid === "number") chownTree(paths.home, uid, null, chown);
  if (token && login) {
    await login({ token, portal: portalHost, home: paths.home, uid });
  }

  // The package runs as `uid`, so it has to own what it is expected to write. The data
  // directory is included because the package pulls into it.
  if (typeof uid === "number") {
    chownTree(paths.home, uid, null, chown);
    chown(paths.outputDir, uid, uid);
    // The whole class directory except the CLUE corpus. Its contents come back from S3
    // on every cold start, written by the syncer as root, so owning only the directory
    // leaves the package unable to reopen a file it wrote on a previous run.
    chownTree(paths.dataDir, uid, RUNNER_OWNED, chown);
    // The same, for the datasets the package pulls into. cc-data creates the portal and
    // dataset directories under this root itself, as the package, so the root is all it
    // needs to own; the tree is walked because a cold start restores it from S3 as root.
    chownTree(paths.ccDataRoot, uid, null, chown);
    // Owning the leaf is not enough: creating a file in it also needs search permission
    // on every directory above it, and those are made by the syncer and the CLUE reader
    // as root. Without this the package fails with EACCES on a directory it owns.
    for (const dir of [...parentsBetween(paths.dataRoot, paths.dataDir),
                       ...parentsBetween(paths.dataRoot, paths.ccDataRoot)]) {
      fs.chmodSync(dir, 0o755);
    }
  }

  log.info("package.prepared", {
    package: packageName,
    class_hash: classHash,
    credential: Boolean(token),
    uid: uid ?? null,
    data_dir_mode: (fs.statSync(paths.dataDir).mode & 0o777).toString(8),
    data_dir_uid: fs.statSync(paths.dataDir).uid,
    cc_data_root: paths.ccDataRoot,
    cc_data_root_uid: fs.statSync(paths.ccDataRoot).uid
  });

  return { paths, env: packageEnvironment({ paths, portalHost, packageName, classHash, classId, proxyUrl, reportServerUrl, bucket, storagePrefix }) };
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
