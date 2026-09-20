import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { packageEnvironment, packagePaths, preparePackage, readPackageCounts } from "../server/package-env.js";

const CLASS = "7be899cf".repeat(6);
const PORTAL_HOST = "learn.portal.staging.concord.org";
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
    packageName: "counts",
    portalHost: PORTAL_HOST,
    token: "ccd_secret",
    login: async (args) => { logins.push(args); },
    ...overrides
  });
}

// The credential must never become durable state. The runner's own lives under $HOME
// for the same reason: the syncer walks the data root and nothing else.
test("the package's HOME is outside the synced data root", async () => {
  const paths = packagePaths({
    workRoot: path.join(root, "work"),
    dataRoot: path.join(root, "data"),
    classHash: CLASS,
    packageName: "counts"
  });
  assert.ok(!paths.home.startsWith(path.join(root, "data")), "HOME must not be under the data root");
  assert.ok(paths.dataDir.startsWith(path.join(root, "data")), "the corpus must be under it, so it syncs");
});

// cc-data owns the shape of its credential store: it has a version, a portals map and a
// backend that may be a keyring or a file. Writing that by hand is a guess, and the guess
// failed as NOT_AUTHENTICATED with a perfectly good token on disk.
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

// A rerun must not read the previous run's working files, and a package that wrote
// something odd into its HOME must not leave it for the next one.
test("HOME is recreated on each preparation, the corpus is not", async () => {
  const first = await prepare();
  fs.writeFileSync(path.join(first.paths.home, "leftover"), "x");
  fs.writeFileSync(path.join(first.paths.dataDir, "corpus"), "keep me");

  const second = await prepare();
  assert.ok(!fs.existsSync(path.join(second.paths.home, "leftover")), "HOME is wiped");
  assert.ok(fs.existsSync(path.join(second.paths.dataDir, "corpus")), "the pulled corpus survives");
});

// The package runs as another uid in its own namespace, so it inherits nothing and
// everything it needs has to be named. No AWS variables, and no Firebase session.
test("the environment names the paths and carries no AWS or Firebase credential", async () => {
  const { env } = await prepare();
  assert.equal(env.CC_DATA_PORTAL, PORTAL_HOST);
  assert.equal(env.RD_CLASS_HASH, CLASS);
  assert.ok(env.CC_DATA_LOCAL.endsWith(path.join("classes", CLASS)));
  assert.ok(env.HOME && env.RD_OUTPUT_DIR);
  for (const key of Object.keys(env)) {
    assert.ok(!/^AWS_/.test(key), `${key} must not be handed to a package`);
  }
  assert.ok(!("session_token" in env) && !("RD_SESSION_TOKEN" in env));
});

test("counts.json is read back, and only the contracted keys", async () => {
  const { paths } = await prepare();
  fs.writeFileSync(path.join(paths.outputDir, "counts.json"), JSON.stringify({
    answers: 201, learners: 6, logs: 490, log_freshness_at: "2026-08-26T00:00:00Z",
    clue_documents: 9999, something_else: true
  }));

  const counts = readPackageCounts(paths.outputDir);
  assert.deepEqual(counts, {
    answers: 201, learners: 6, logs: 490, log_freshness_at: "2026-08-26T00:00:00Z"
  });
  // clue_documents is the runner's own count; a package does not get to claim it.
  assert.ok(!("clue_documents" in counts));
});

test("a missing or unreadable counts.json is not a failure", async () => {
  const { paths } = await prepare();
  assert.deepEqual(readPackageCounts(paths.outputDir), {});
  fs.writeFileSync(path.join(paths.outputDir, "counts.json"), "{not json");
  assert.deepEqual(readPackageCounts(paths.outputDir), {});
});

// The namespace has no default route, so the proxy is the only way out. A package that
// is not told where it is fails with whatever its HTTP client says about an unreachable
// host, which for cc-data is an empty stderr.
test("the package is told where the egress proxy is", async () => {
  const env = packageEnvironment({
    paths: { home: "/h", dataDir: "/d", outputDir: "/o" },
    portalHost: "learn.portal.staging.concord.org",
    classHash: "abc",
    classId: 111,
    proxyUrl: "http://10.201.0.1:8123"
  });

  assert.equal(env.HTTPS_PROXY, "http://10.201.0.1:8123");
  assert.equal(env.https_proxy, "http://10.201.0.1:8123");
});

test("a package with no proxy is given no proxy variables to misread", async () => {
  const env = packageEnvironment({
    paths: { home: "/h", dataDir: "/d", outputDir: "/o" },
    portalHost: "learn.portal.staging.concord.org",
    classHash: "abc",
    classId: 111
  });

  assert.ok(!("HTTPS_PROXY" in env));
});

// cc-data creates its own credential store and config under HOME, as the package's uid,
// so the home has to belong to the package before the login runs rather than after.
test("the home belongs to the package before cc-data is logged in", async () => {
  const uid = process.getuid();
  let ownerAtLogin = null;

  const { paths } = await preparePackage({
    workRoot: path.join(root, "work"),
    dataRoot: path.join(root, "data"),
    classHash: "abc",
    classId: 111,
    packageName: "demo",
    portalHost: "learn.portal.staging.concord.org",
    token: "report-token",
    uid,
    login: async ({ home }) => { ownerAtLogin = fs.statSync(home).uid; }
  });

  assert.equal(ownerAtLogin, uid, "cc-data cannot create its store in a home it does not own");
  assert.equal(fs.statSync(paths.home).uid, uid);
});
