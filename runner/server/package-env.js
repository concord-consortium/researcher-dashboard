import fs from "node:fs";
import path from "node:path";
import { log } from "./log.js";

// What a package is handed, and where its credential lives.
//
// The package makes its own pulls with cc-data, CLUE's included, which is only safe
// because the credential is the requesting researcher's own rather than a shared site
// admin's: a package that leaks it reaches what its researcher could already download to
// their laptop, and nothing else.
//
// The package's HOME sits outside the synced data root, so the credential is never
// written to S3, the same reason the runner's own is under $HOME rather than /data.
// cc-data's dataset root is under the data root, because the pulled corpus is exactly
// what should survive a suspend and be there for the next run.
//
// cc-data reads one variable for that root, CC_DATA_ROOT, and nothing else: without it it
// falls back to $HOME/cc-data, which here is the throwaway home, so every pull lands
// somewhere that is deleted before the next run and is never synced.

// cc-data's dataset grammar, the narrowest of the names in play.
export const DATASET_NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/;

// Keyed to the package rather than its version, so a new version reuses the pulls the
// last one left behind; the identity cannot be the name, since cc-data forbids a slash.
export function datasetName(catalogId) {
  if (!Number.isInteger(catalogId) || catalogId < 1) throw new Error(`catalog id ${catalogId} is not a positive integer`);
  const name = `pkg-${catalogId}`;
  if (!DATASET_NAME.test(name)) throw new Error(`${name} is not a usable cc-data dataset name`);
  return name;
}

// `docId` is the package key, the identity with `/` as `__`: two packages with the same
// name from different origins get separate homes, inputs and outputs.
export function packagePaths({ workRoot, dataRoot, classHash, docId }) {
  return {
    home: path.join(workRoot, "home", docId),
    inputDir: path.join(workRoot, "in", docId),
    outputDir: path.join(workRoot, "out", docId),
    // Shared across packages and across runs: the pulled corpus is the expensive thing
    // and belongs to the researcher, keyed by class.
    dataDir: path.join(dataRoot, "classes", classHash),
    // cc-data's own root, which holds <portal>/datasets/<name> beneath it.
    ccDataRoot: path.join(dataRoot, "cc-data"),
    dataRoot
  };
}

// Who fetches a package's CLUE data: the package, through cc-data.
export const CLUE_SOURCE = "cc-data";

// The file a package writes its filters from. Everything but clue_source, dataset and
// output_dir comes from the scope block rigse sent, which /work returns: the runner holds
// no portal bearer and cannot build it any other way.
export function scopeFile({ scope, dataset, outputDir }) {
  return {
    kind: scope.kind,
    id: scope.id,
    classes: scope.classes.map(({ class_hash, class_id }) => ({ class_hash, class_id })),
    assignments: scope.assignments.map(({ offering_id, runnable_id, name, url }) => ({ offering_id, runnable_id, name, url })),
    clue_source: CLUE_SOURCE,
    dataset,
    output_dir: outputDir
  };
}

// The package runs as another uid in its own namespace, so it inherits nothing useful
// and everything it needs has to be named here. No AWS variables and no Firebase
// session: it pulls through cc-data as the researcher and nothing else.
export function packageEnvironment({ paths, portalHost, dataset, proxyUrl, reportServerUrl, bucket, storagePrefix }) {
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
    RD_DATASET: `${portalHost}/${dataset}`,
    RD_SCOPE_FILE: path.join(paths.inputDir, "scope.json"),
    CC_DATA_LOCAL: paths.dataDir,
    CC_DATA_PORTAL: portalHost,
    // Which report-server the researcher's credential is for. cc-data resolves it from
    // the login, so a package pulling with cc-data never needs it; a package that probes
    // what it can reach does.
    ...(reportServerUrl ? { RD_REPORT_SERVER_URL: reportServerUrl } : {}),
    // Where the researcher's data is kept, and under which prefix. Neither is a
    // credential and neither lets a package act: the sandbox has no AWS credentials and
    // no way to obtain any, which a package measuring its own boundary has to
    // demonstrate rather than assume.
    ...(bucket ? { RD_BUCKET: bucket } : {}),
    ...(storagePrefix ? { RD_STORAGE_PREFIX: storagePrefix } : {}),
    RD_DATA_DIR: paths.dataDir,
    RD_OUTPUT_DIR: paths.outputDir
  };
}

// Root walks a tree the package has written to, so it follows no link: a symbolic link
// left there is skipped, lchown never changes a link's target, and a file with another
// hard link, which could be a file of root's, is left alone.
function chownTree(dir, uid, chown = fs.lchownSync) {
  chown(dir, uid, uid);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) chownTree(full, uid, chown);
    else if (fs.lstatSync(full).nlink === 1) chown(full, uid, uid);
  }
}

// Every directory from the root down to the leaf, inclusive, so each can be made
// searchable by the package uid.
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

// Everything the package needs. Its home, output directory and data are handed to the
// package uid; its input directory and scope.json stay root's.
// `chown` is a seam: the effect it has cannot be observed by a test, which runs as the
// uid it would be chowning to, so what a test can check is that it was asked for.
export async function preparePackage({ workRoot, dataRoot, classHash, docId, scope, catalogId, portalHost, token, uid, proxyUrl, reportServerUrl, bucket, storagePrefix, login, chown = fs.lchownSync }) {
  const dataset = datasetName(catalogId);
  const paths = packagePaths({ workRoot, dataRoot, classHash, docId });

  // HOME and the output directory start empty on every run, so nothing of a previous run
  // is read back, a display.md least of all.
  for (const dir of [paths.home, paths.outputDir, paths.inputDir]) fs.rmSync(dir, { recursive: true, force: true });
  // The cc-data root is not rebuilt: it holds the pulled corpus, which is the thing
  // worth keeping across runs and across suspends.
  for (const dir of [paths.home, paths.inputDir, paths.outputDir, paths.dataDir, paths.ccDataRoot]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Root-owned and world-readable: the package reads its scope and cannot rewrite it.
  const scopeJson = scopeFile({ scope, dataset, outputDir: paths.outputDir });
  fs.writeFileSync(path.join(paths.inputDir, "scope.json"), JSON.stringify(scopeJson, null, 2), { mode: 0o644 });
  fs.chmodSync(paths.inputDir, 0o755);

  // The credential is installed by cc-data itself, into the package's own HOME and as
  // the package's own uid. Its store has a version, a portals map and a backend that
  // may be a keyring or a file, and none of that is ours to reproduce.
  if (typeof uid === "number") chownTree(paths.home, uid, chown);
  if (token && login) {
    await login({ token, portal: portalHost, home: paths.home, uid });
  }

  // The package runs as `uid`, so it has to own what it is expected to write.
  if (typeof uid === "number") {
    chownTree(paths.home, uid, chown);
    chown(paths.outputDir, uid, uid);
    // The whole class directory. Its contents come back from S3 on every cold start,
    // written by the syncer as root.
    chownTree(paths.dataDir, uid, chown);
    chownTree(paths.ccDataRoot, uid, chown);
    // Owning the leaf is not enough: creating a file in it also needs search permission
    // on every directory above it, and those are made by the syncer as root.
    for (const dir of [...parentsBetween(paths.dataRoot, paths.dataDir),
                       ...parentsBetween(paths.dataRoot, paths.ccDataRoot)]) {
      fs.chmodSync(dir, 0o755);
    }
  }

  log.info("package.prepared", {
    package_key: docId,
    dataset,
    credential: Boolean(token),
    uid: uid ?? null
  });

  return {
    paths,
    scope: scopeJson,
    env: packageEnvironment({ paths, portalHost, dataset, proxyUrl, reportServerUrl, bucket, storagePrefix })
  };
}

// The runner reads what the package wrote as root, from a directory the package owns, so
// it follows no link the package could have left: the directory must resolve to itself,
// and each file is opened with O_NOFOLLOW and must be a regular file. Otherwise a package
// could point display.md at a file only root can read and have it copied into its result.
function readOwnFile(outputDir, name, limit) {
  const dir = path.resolve(outputDir);
  if (fs.realpathSync(dir) !== dir) throw new Error(`the package replaced its output directory with a link`);
  let fd;
  try {
    // O_NONBLOCK, so a named pipe left in a file's place opens at once and is refused below
    // rather than blocking the runner's process on a writer that will never come.
    fd = fs.openSync(path.join(dir, name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    if (err.code === "ELOOP") throw new Error(`the package's ${name} is a link, not a file`);
    throw err;
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error(`the package's ${name} is not a file`);
    if (stat.nlink !== 1) throw new Error(`the package's ${name} is linked from elsewhere`);
    const buffer = Buffer.alloc(Math.min(stat.size, limit + 1));
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return { size: stat.size, text: buffer.subarray(0, read).toString("utf8") };
  } finally {
    fs.closeSync(fd);
  }
}

// `display.md` goes into one Firestore field, so it is capped; larger is refused, never
// truncated. A result keeps the previous run's display and summary beside its own, and two
// of each at these sizes fit Firestore's 1 MiB document. summary.txt and counts.json are
// read only up to OUTPUT_READ_LIMIT_BYTES.
export const DISPLAY_LIMIT_BYTES = 440 * 1024;
export const OUTPUT_READ_LIMIT_BYTES = 64 * 1024;

// What the package counted, because it makes the pulls and the runner writes Firestore.
// Only the counts the scope document holds are read. Absent or unreadable is not a failure.
export function readPackageCounts(outputDir) {
  try {
    const parsed = JSON.parse(readOwnFile(outputDir, "counts.json", OUTPUT_READ_LIMIT_BYTES)?.text ?? "");
    const counts = {};
    for (const key of ["answers", "logs", "log_freshness_at"]) {
      if (parsed[key] !== undefined) counts[key] = parsed[key];
    }
    return counts;
  } catch {
    return {};
  }
}

// What the package wrote: display.md, required and refused rather than truncated when it
// is too large, and summary.txt's first line, optional. The output directory dies with
// the VM, so nothing of a refused display survives anywhere.
export function readPackageResult(outputDir) {
  const display = readOwnFile(outputDir, "display.md", DISPLAY_LIMIT_BYTES);
  if (!display) throw new Error("the package wrote no display.md");
  if (display.size > DISPLAY_LIMIT_BYTES) {
    throw new Error(`the package's display.md is ${display.size} bytes, over the ${DISPLAY_LIMIT_BYTES}-byte limit`);
  }
  const summaryFile = readOwnFile(outputDir, "summary.txt", OUTPUT_READ_LIMIT_BYTES);
  const summary = summaryFile?.text.split(/\r?\n/)[0].trim() || null;
  return { display: display.text, summary };
}
