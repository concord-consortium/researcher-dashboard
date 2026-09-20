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

function prepare(overrides = {}) {
  return preparePackage({
    workRoot: path.join(root, "work"),
    dataRoot: path.join(root, "data"),
    classHash: CLASS,
    packageName: "counts",
    portalHost: PORTAL_HOST,
    token: "ccd_secret",
    ...overrides
  });
}

// The credential must never become durable state. The runner's own lives under $HOME
// for the same reason: the syncer walks the data root and nothing else.
test("the package's HOME is outside the synced data root", () => {
  const paths = packagePaths({
    workRoot: path.join(root, "work"),
    dataRoot: path.join(root, "data"),
    classHash: CLASS,
    packageName: "counts"
  });
  assert.ok(!paths.home.startsWith(path.join(root, "data")), "HOME must not be under the data root");
  assert.ok(paths.dataDir.startsWith(path.join(root, "data")), "the corpus must be under it, so it syncs");
});

test("the cc-data credential is written 0600 and keyed by portal host", () => {
  const { paths } = prepare();
  const file = path.join(paths.home, ".config", "cc-data", "credentials.json");

  assert.equal(fs.statSync(file).mode & 0o777, 0o600, "a umask must not widen it");
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
    [PORTAL_HOST]: { token: "ccd_secret" }
  });
});

test("no credential is written when none was sent", () => {
  const { paths } = prepare({ token: null });
  assert.ok(!fs.existsSync(path.join(paths.home, ".config", "cc-data", "credentials.json")));
});

// A rerun must not read the previous run's working files, and a package that wrote
// something odd into its HOME must not leave it for the next one.
test("HOME is recreated on each preparation, the corpus is not", () => {
  const first = prepare();
  fs.writeFileSync(path.join(first.paths.home, "leftover"), "x");
  fs.writeFileSync(path.join(first.paths.dataDir, "corpus"), "keep me");

  const second = prepare();
  assert.ok(!fs.existsSync(path.join(second.paths.home, "leftover")), "HOME is wiped");
  assert.ok(fs.existsSync(path.join(second.paths.dataDir, "corpus")), "the pulled corpus survives");
});

// The package runs as another uid in its own namespace, so it inherits nothing and
// everything it needs has to be named. No AWS variables, and no Firebase session.
test("the environment names the paths and carries no AWS or Firebase credential", () => {
  const { env } = prepare();
  assert.equal(env.CC_DATA_PORTAL, PORTAL_HOST);
  assert.equal(env.RD_CLASS_HASH, CLASS);
  assert.ok(env.CC_DATA_LOCAL.endsWith(path.join("classes", CLASS)));
  assert.ok(env.HOME && env.RD_OUTPUT_DIR);
  for (const key of Object.keys(env)) {
    assert.ok(!/^AWS_/.test(key), `${key} must not be handed to a package`);
  }
  assert.ok(!("session_token" in env) && !("RD_SESSION_TOKEN" in env));
});

test("counts.json is read back, and only the contracted keys", () => {
  const { paths } = prepare();
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

test("a missing or unreadable counts.json is not a failure", () => {
  const { paths } = prepare();
  assert.deepEqual(readPackageCounts(paths.outputDir), {});
  fs.writeFileSync(path.join(paths.outputDir, "counts.json"), "{not json");
  assert.deepEqual(readPackageCounts(paths.outputDir), {});
});

// The namespace has no default route, so the proxy is the only way out. A package that
// is not told where it is fails with whatever its HTTP client says about an unreachable
// host, which for cc-data is an empty stderr.
test("the package is told where the egress proxy is", () => {
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

test("a package with no proxy is given no proxy variables to misread", () => {
  const env = packageEnvironment({
    paths: { home: "/h", dataDir: "/d", outputDir: "/o" },
    portalHost: "learn.portal.staging.concord.org",
    classHash: "abc",
    classId: 111
  });

  assert.ok(!("HTTPS_PROXY" in env));
});

// cc-data writes its own config.json beside the credential, so owning the home and the
// credential file is not enough: the directories between them have to be handed over too.
test("the package owns every path inside its home, not just the credential", async () => {
  const uid = process.getuid();
  const { paths } = preparePackage({
    workRoot: path.join(root, "work"),
    dataRoot: path.join(root, "data"),
    classHash: "abc",
    classId: 111,
    packageName: "demo",
    portalHost: "learn.portal.staging.concord.org",
    token: "report-token",
    uid
  });

  const configDir = path.join(paths.home, ".config", "cc-data");
  assert.equal(fs.statSync(configDir).uid, uid, ".config/cc-data must be the package's");
  assert.equal(fs.statSync(path.join(paths.home, ".config")).uid, uid, ".config must be the package's");
});
