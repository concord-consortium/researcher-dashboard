import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { DISPLAY_LIMIT_BYTES, datasetName, packageEnvironment, packagePaths, preparePackage, readPackageCounts, readPackageResult } from "../server/package-env.js";

const CLASS = "7be899cf".repeat(6);
const PORTAL_HOST = "learn.portal.staging.concord.org";
const SCOPE = {
  kind: "class",
  collection: "classes",
  id: CLASS,
  classes: [{ class_hash: CLASS, class_id: 111 }],
  assignments: [{ offering_id: 9, runnable_id: 1234, name: "Moth 1.2", url: "https://activity-player.concord.org/?activity=1" }]
};
let root;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "rd-pkg-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

let logins = [];

function prepare(overrides = {}) {
  logins = [];
  return preparePackage({
    workRoot: path.join(root, "work"),
    dataRoot: path.join(root, "data"),
    classHash: CLASS,
    docId: "users__1__counts",
    scope: SCOPE,
    catalogId: 1234,
    portalHost: PORTAL_HOST,
    token: "ccd_secret",
    login: async (args) => { logins.push(args); },
    ...overrides
  });
}

// The credential must never become durable state. The runner's own lives under $HOME
// for the same reason: the syncer walks the data root and nothing else.
test("the package's HOME is outside the synced data root", () => {
  const paths = packagePaths({ workRoot: path.join(root, "work"), dataRoot: path.join(root, "data"), classHash: CLASS, docId: "users__1__counts" });
  assert.ok(!paths.home.startsWith(path.join(root, "data")), "HOME must not be under the data root");
  assert.ok(paths.dataDir.startsWith(path.join(root, "data")), "the corpus must be under it, so it syncs");
});

// Two packages with the same name from different origins are two packages.
test("every per-package path is keyed by the package key, not the name", () => {
  const a = packagePaths({ workRoot: "/work", dataRoot: "/data", classHash: CLASS, docId: "users__1__counts" });
  const b = packagePaths({ workRoot: "/work", dataRoot: "/data", classHash: CLASS, docId: "projects__20__counts" });
  for (const key of ["home", "inputDir", "outputDir"]) assert.notEqual(a[key], b[key], key);
  assert.equal(a.outputDir, "/work/out/users__1__counts");
  assert.equal(a.dataDir, b.dataDir, "the class's corpus is the researcher's, shared");
});

test("the credential is installed by cc-data itself, into the package's home", async () => {
  const { paths } = await prepare();
  assert.equal(logins.length, 1);
  assert.equal(logins[0].token, "ccd_secret");
  assert.equal(logins[0].portal, PORTAL_HOST);
  assert.equal(logins[0].home, paths.home, "it must log in to the package's HOME, not the runner's");
});

test("no login happens when no token was sent", async () => {
  await prepare({ token: null });
  assert.equal(logins.length, 0);
});

// A package that writes no display.md must not be credited with its last run's.
test("HOME and the output directory start empty on every run, the corpus does not", async () => {
  const first = await prepare();
  fs.writeFileSync(path.join(first.paths.home, "leftover"), "x");
  fs.writeFileSync(path.join(first.paths.outputDir, "display.md"), "# last run");
  fs.writeFileSync(path.join(first.paths.dataDir, "corpus"), "keep me");

  const second = await prepare();
  assert.ok(!fs.existsSync(path.join(second.paths.home, "leftover")), "HOME is wiped");
  assert.ok(!fs.existsSync(path.join(second.paths.outputDir, "display.md")), "the output is wiped");
  assert.ok(fs.existsSync(path.join(second.paths.dataDir, "corpus")), "the pulled corpus survives");
});

// scope.json, from the scope block /work returned.
test("scope.json carries the seven fields, and names the package's dataset and output", async () => {
  const { paths, env } = await prepare();
  const file = path.join(paths.inputDir, "scope.json");
  assert.equal(env.RD_SCOPE_FILE, file);
  const scope = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(Object.keys(scope).sort(), ["assignments", "classes", "clue_source", "dataset", "id", "kind", "output_dir"]);
  assert.equal(scope.kind, "class");
  assert.equal(scope.id, CLASS);
  assert.deepEqual(scope.classes, [{ class_hash: CLASS, class_id: 111 }]);
  assert.deepEqual(scope.assignments, SCOPE.assignments);
  assert.equal(scope.clue_source, "cc-data", "packages read CLUE through cc-data");
  assert.equal(scope.dataset, "pkg-1234");
  assert.equal(scope.output_dir, paths.outputDir);
  assert.equal(fs.statSync(file).mode & 0o777, 0o644, "readable, not writable, by the package");
});

// The package learns its classes from scope.json, not from per-class variables.
test("the environment names the paths and carries no class variable, AWS or Firebase credential", async () => {
  const { env } = await prepare();
  assert.equal(env.CC_DATA_PORTAL, PORTAL_HOST);
  assert.ok(!("RD_CLASS_HASH" in env) && !("RD_PORTAL_CLASS_ID" in env));
  assert.ok(env.CC_DATA_LOCAL.endsWith(path.join("classes", CLASS)));
  assert.ok(env.HOME && env.RD_OUTPUT_DIR && env.CC_DATA_ROOT && env.RD_DATASET && env.RD_SCOPE_FILE);
  for (const key of Object.keys(env)) assert.ok(!/^AWS_/.test(key), `${key} must not be handed to a package`);
  assert.ok(!("session_token" in env) && !("RD_SESSION_TOKEN" in env));
});

// Keyed to the package, not the version, so a new version reuses the last one's pulls.
test("the dataset is pkg-<catalog id>", async () => {
  const { env } = await prepare({ catalogId: 77 });
  assert.equal(env.RD_DATASET, `${PORTAL_HOST}/pkg-77`);
  assert.equal(datasetName(1), "pkg-1");
  assert.throws(() => datasetName(0), /not a positive integer/);
  assert.throws(() => datasetName("12"), /not a positive integer/);
});

test("counts.json is read back, and only the counts the scope document holds", async () => {
  const { paths } = await prepare();
  fs.writeFileSync(path.join(paths.outputDir, "counts.json"), JSON.stringify({
    answers: 201, learners: 6, logs: 490, log_freshness_at: "2026-08-26T00:00:00Z", clue_documents: 9999
  }));
  assert.deepEqual(readPackageCounts(paths.outputDir), { answers: 201, logs: 490, log_freshness_at: "2026-08-26T00:00:00Z" });
});

test("a missing or unreadable counts.json is not a failure", async () => {
  const { paths } = await prepare();
  assert.deepEqual(readPackageCounts(paths.outputDir), {});
  fs.writeFileSync(path.join(paths.outputDir, "counts.json"), "{not json");
  assert.deepEqual(readPackageCounts(paths.outputDir), {});
});

test("display.md and the first line of summary.txt are the result", async () => {
  const { paths } = await prepare();
  fs.writeFileSync(path.join(paths.outputDir, "display.md"), "# Counts\n\n| a | b |\n");
  fs.writeFileSync(path.join(paths.outputDir, "summary.txt"), "  12 documents  \nmore\n");
  assert.deepEqual(readPackageResult(paths.outputDir), { display: "# Counts\n\n| a | b |\n", summary: "12 documents" });
});

test("summary.txt is optional, display.md is not", async () => {
  const { paths } = await prepare();
  assert.throws(() => readPackageResult(paths.outputDir), /wrote no display.md/);
  fs.writeFileSync(path.join(paths.outputDir, "display.md"), "ok");
  assert.equal(readPackageResult(paths.outputDir).summary, null);
});

// An oversized display is refused with its size and the limit, never truncated.
test("a display.md over 64 KiB is refused with its size and the limit", async () => {
  const { paths } = await prepare();
  fs.writeFileSync(path.join(paths.outputDir, "display.md"), "x".repeat(DISPLAY_LIMIT_BYTES));
  assert.equal(readPackageResult(paths.outputDir).display.length, DISPLAY_LIMIT_BYTES, "exactly at the cap is accepted");
  fs.writeFileSync(path.join(paths.outputDir, "display.md"), "é".repeat(DISPLAY_LIMIT_BYTES / 2 + 1));
  assert.throws(() => readPackageResult(paths.outputDir), /is 65538 bytes, over the 65536-byte limit/);
});

test("the package is told where the egress proxy is, and nothing when there is none", () => {
  const paths = { home: "/h", dataDir: "/d", outputDir: "/o", inputDir: "/i", ccDataRoot: "/d/cc-data" };
  const env = packageEnvironment({ paths, portalHost: PORTAL_HOST, dataset: "pkg-1", proxyUrl: "http://10.201.0.1:8123" });
  assert.equal(env.HTTPS_PROXY, "http://10.201.0.1:8123");
  assert.equal(env.https_proxy, "http://10.201.0.1:8123");
  assert.ok(!("HTTPS_PROXY" in packageEnvironment({ paths, portalHost: PORTAL_HOST, dataset: "pkg-1" })));
});

// cc-data creates its own credential store and config under HOME, as the package's uid,
// so the home has to belong to the package before the login runs rather than after.
test("the home belongs to the package before cc-data is logged in", async () => {
  const uid = 4242;
  const events = [];
  const { paths } = await prepare({
    uid,
    chown: (target, owner) => events.push(`chown:${target}:${owner}`),
    login: async () => { events.push("login"); }
  });
  const chownedHome = events.indexOf(`chown:${paths.home}:${uid}`);
  assert.ok(chownedHome >= 0, "the home is handed to the package uid");
  assert.ok(chownedHome < events.indexOf("login"), "cc-data cannot create its store in a home it does not own");
});

// Root chowns a tree the package wrote to, so a link the package left there must not hand
// it the link's target.
test("a link the package left in its data directory is not followed", async () => {
  const chowned = [];
  const first = await prepare({ uid: process.getuid() });
  const outside = path.join(root, "root-only");
  fs.writeFileSync(outside, "secret");
  fs.symlinkSync(outside, path.join(first.paths.dataDir, "planted"));
  fs.symlinkSync(root, path.join(first.paths.ccDataRoot, "planted-dir"));
  await prepare({ uid: process.getuid(), chown: (target) => chowned.push(target) });
  for (const target of chowned) {
    assert.ok(!target.includes("planted"), `chowned ${target}`);
    assert.notEqual(target, outside);
  }
  assert.ok(chowned.includes(first.paths.dataDir), "the directory itself is still handed over");
});

// A hard link passes every check a symbolic link fails, and can name a file of root's.
test("a hard-linked file in the data directory is not chowned", async () => {
  const chowned = [];
  const first = await prepare({ uid: process.getuid() });
  const outside = path.join(root, "root-only-hard");
  fs.writeFileSync(outside, "secret");
  fs.linkSync(outside, path.join(first.paths.dataDir, "hard"));
  await prepare({ uid: process.getuid(), chown: (target) => chowned.push(target) });
  assert.ok(!chowned.includes(path.join(first.paths.dataDir, "hard")));
});

// A pipe with no writer would block a plain open for good, and the runner with it.
test("a named pipe in place of display.md is refused at once", async () => {
  const { paths } = await prepare();
  execFileSync("mkfifo", [path.join(paths.outputDir, "display.md")]);
  assert.throws(() => readPackageResult(paths.outputDir), /not a file/);
});

test("a hard-linked display.md is refused", async () => {
  const { paths } = await prepare();
  const outside = path.join(root, "root-only-display");
  fs.writeFileSync(outside, "secret");
  fs.linkSync(outside, path.join(paths.outputDir, "display.md"));
  assert.throws(() => readPackageResult(paths.outputDir), /linked from elsewhere/);
});

// Everything in the class directory comes back from S3 on a cold start, written by the
// syncer as root, and all of it is the package's.
test("the package owns every file of its class's data directory", async () => {
  const chowned = [];
  const first = await prepare({ uid: process.getuid() });
  const nested = path.join(first.paths.dataDir, "clue-documents");
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(nested, "content.jsonl"), "{}");
  fs.writeFileSync(path.join(first.paths.dataDir, "runs.json"), "{}");
  await prepare({ uid: process.getuid(), chown: (target) => chowned.push(target) });
  assert.ok(chowned.includes(path.join(first.paths.dataDir, "runs.json")));
  assert.ok(chowned.includes(path.join(nested, "content.jsonl")), "a nested directory's files are the package's too");
});

// CC_DATA_ROOT is the only variable cc-data reads for its dataset root. Unset, it falls
// back to $HOME/cc-data, which here is the home wiped before every run.
test("cc-data pulls into the synced data root, not into the throwaway home", async () => {
  const { env, paths } = await prepare();
  assert.ok(env.CC_DATA_ROOT.startsWith(path.join(root, "data")));
  assert.ok(!env.CC_DATA_ROOT.startsWith(env.HOME));
  assert.equal(env.CC_DATA_ROOT, paths.ccDataRoot);
});

test("the dataset root survives a rerun and is handed back to the package", async () => {
  const uid = process.getuid();
  const first = await prepare({ uid });
  fs.writeFileSync(path.join(first.paths.ccDataRoot, "pulled"), "keep me");
  const chowned = [];
  const second = await prepare({ uid, chown: (target) => chowned.push(target) });
  assert.ok(fs.existsSync(path.join(second.paths.ccDataRoot, "pulled")), "the pull survives");
  assert.ok(chowned.includes(path.join(first.paths.ccDataRoot, "pulled")));
});

test("a package that probes what it can reach is told where report-server is", async () => {
  const { env } = await prepare({ reportServerUrl: "https://report-server.concordqa.org" });
  assert.equal(env.RD_REPORT_SERVER_URL, "https://report-server.concordqa.org");
  const without = await prepare();
  assert.ok(!("RD_REPORT_SERVER_URL" in without.env));
});

// The runner reads these as root from a directory the package owns: a link there must not
// make root copy a file the package could not read into its result.
test("a display.md that is a link is refused, not followed", async () => {
  const { paths } = await prepare();
  fs.writeFileSync(path.join(root, "root-only"), "secret");
  fs.symlinkSync(path.join(root, "root-only"), path.join(paths.outputDir, "display.md"));
  assert.throws(() => readPackageResult(paths.outputDir), /display.md is a link/);
});

test("an output directory swapped for a link is refused", async () => {
  const { paths } = await prepare();
  const elsewhere = path.join(root, "elsewhere");
  fs.mkdirSync(elsewhere);
  fs.writeFileSync(path.join(elsewhere, "display.md"), "# not the package's");
  fs.rmSync(paths.outputDir, { recursive: true });
  fs.symlinkSync(elsewhere, paths.outputDir);
  assert.throws(() => readPackageResult(paths.outputDir), /replaced its output directory with a link/);
});

test("a counts.json or summary.txt that is a link is not read", async () => {
  const { paths } = await prepare();
  fs.writeFileSync(path.join(root, "counts"), JSON.stringify({ answers: 999 }));
  fs.symlinkSync(path.join(root, "counts"), path.join(paths.outputDir, "counts.json"));
  assert.deepEqual(readPackageCounts(paths.outputDir), {});
  fs.writeFileSync(path.join(paths.outputDir, "display.md"), "ok");
  fs.symlinkSync(path.join(root, "counts"), path.join(paths.outputDir, "summary.txt"));
  assert.throws(() => readPackageResult(paths.outputDir), /summary.txt is a link/);
});
