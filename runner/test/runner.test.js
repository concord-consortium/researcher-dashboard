import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { disableDefaultCredentialChain, loadEnv } from "../server/config.js";
import { makeSteps } from "../server/steps.js";
import { HEARTBEAT_SECONDS, HookError, LOST_RUN_REASON, PACKAGE_END_TIMEOUT_MS, REVOKE_TIMEOUT_MS, Runner, TOKEN_TIMEOUT_MS } from "../server/runner.js";
import { buildRunner } from "../server/index.js";
import { packageDocId, packageKey } from "../server/package-fetch.js";
import { MemoryStore, SERVER_TIME, STATUS_WRITE_TIMEOUT_MS, classPath, resultPath, runnerPath, scopePath } from "../server/status.js";
import { StorageCredentials } from "../server/storage.js";
import { ReportServerError } from "../server/report-server.js";
import { DirBackend, S3Backend, Syncer } from "../server/sync/index.js";

const PORTAL = "learn_portal_staging_concord_org";
const USER = "439";
const CLASS = "7be899cf".repeat(6);
const OTHER_CLASS = "64727df0".repeat(6);
const PLATFORM_ID = "https://learn.portal.staging.concord.org";
const PROJECT = "report-service-dev";
// rigse also sends a CLUE class token for a package declaring clue_prepull; the runner reads none.
const CLUE_ROW = "collaborative-learning-staging";
const CHECKSUM = `sha256:${"ab".repeat(32)}`;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function customToken(claims, { exp } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "none" })}.${b64({ uid: "u", iat: now, exp: exp ?? now + 3600, claims })}.`;
}
const IDENTITY = { platform_id: PLATFORM_ID, platform_user_id: 439, user_type: "researcher", researcher_dashboard_runner: true };
const sessionToken = (extra = {}) => customToken({ ...IDENTITY, ...extra });
const classToken = (classHash, extra = {}) => customToken({ ...IDENTITY, class_hash: classHash, ...extra });

const PAYLOAD = JSON.stringify({
  session_token: sessionToken(),
  platform_user_id: USER,
  platform_id: PLATFORM_ID,
  portal: PORTAL,
  firebase_project: PROJECT,
  bucket: "researcher-dashboard-runner-staging",
  report_server_url: "https://report-server.example.org",
  report_server_token: "forwarded-report-server-token",
  function_url: "https://us-central1-report-service-dev.cloudfunctions.net/researcherDashboard"
});

const scopeBlock = (classHash, classId = 111) => ({
  kind: "class",
  collection: "classes",
  id: classHash,
  classes: [{ class_hash: classHash, class_id: classId }],
  assignments: [{ offering_id: 9, runnable_id: 1234, name: "Moth 1.2", url: "https://activity-player.concord.org/?activity=1" }]
});

// Stands in for report-service's researcherDashboard function: /work hands out the
// entries whose result says queued (or has none), and mints
// a session token each time; /idle answers work_queued while anything is queued and
// suspends otherwise, unless a test queues its own answer.
function fakeFunction(docs) {
  const state = { entries: [], scopes: {}, calls: [], idle: [], workErrors: [], sessionToken: () => sessionToken(), block: null };
  const statusOf = (e) => docs.get(resultPath(PORTAL, e.class_hash, USER, packageDocId(e.identity)))?.status;
  const call = async (route, { idToken, body }) => {
    state.calls.push({ route, idToken, body });
    if (state.block?.route === route) await state.block.promise;
    if (route === "work") {
      if (state.workErrors.length) throw state.workErrors.shift();
      const queued = state.entries.filter((e) => !["running", "done", "failed"].includes(statusOf(e)));
      const scopes = {};
      for (const h of new Set(queued.map((e) => e.class_hash))) scopes[h] = state.scopes[h];
      return {
        success: true,
        packages: queued.map((e) => ({ ...e, package_key: packageDocId(e.identity) })),
        scopes,
        session_token: state.sessionToken(),
        firebase_project: PROJECT
      };
    }
    // Never suspends while anything is still queued.
    if (route === "idle") {
      if (state.idle.length) return state.idle.shift();
      const queued = state.entries.some((e) => !["running", "done", "failed"].includes(statusOf(e)));
      return queued ? { success: true, suspended: false, work_queued: true } : { success: true, suspended: true };
    }
    throw new Error(`no ${route} here`);
  };
  return {
    state,
    makeFunctionClient: () => call,
    queue({ identity, classHash = CLASS, version = "1.0.0", catalogId = 1234, tokens }) {
      state.entries.push({ class_hash: classHash, identity, version, checksum: CHECKSUM, catalog_id: catalogId });
      state.scopes[classHash] = {
        scope: scopeBlock(classHash),
        class_tokens: tokens ?? { [PROJECT]: classToken(classHash), [CLUE_ROW]: classToken(classHash) }
      };
      docs.set(resultPath(PORTAL, classHash, USER, packageDocId(identity)), { status: "queued", platform_id: PLATFORM_ID });
    },
    routes: () => state.calls.map((c) => c.route)
  };
}

const manifestFor = (identity, extra = {}) => ({
  name: identity.split("/").at(-1),
  version: "1.0.0",
  entrypoint: "run.py",
  expected_duration_seconds: 60,
  dir: "/nowhere",
  ...extra
});

let work;

function steps(record, overrides = {}) {
  return {
    installCredential: async () => {},
    resolvePackage: async ({ pkg }) => { record.resolved.push(pkg); return record.manifests[pkg.identity] ?? manifestFor(pkg.identity); },
    preparePackage: async (args) => {
      record.prepared.push(args);
      const dataDir = path.join(args.dataRoot, "classes", args.classHash);
      mkdirSync(dataDir, { recursive: true });
      return { paths: { outputDir: path.join(args.workRoot, "out", args.docId), home: "/h", dataDir }, env: {} };
    },
    probeWritable: async () => ({ stdout: "" }),
    runPackage: async ({ paths }) => {
      if (paths?.dataDir) writeFileSync(path.join(paths.dataDir, "state.json"), "{}");
      return { display: "# Counts\n\n12 documents", summary: "12 documents" };
    },
    readPackageCounts: async () => ({ answers: 201, logs: 490, log_freshness_at: "2026-08-26T00:00:00Z" }),
    killPackageProcesses: async () => {},
    heldClasses: makeSteps().heldClasses,
    ...overrides
  };
}

// A runner wired to in-memory stores, a directory for S3 and the fake function. The clock
// is advanced by `sleep`, so the idle period passes without waiting.
function build({ stepOverrides = {}, envOverrides = {}, makeStore, wrapStore = (store) => store, makePackageBackend, revoke, applies, clock = { t: Date.parse("2026-09-26T12:00:00Z") } } = {}) {
  const docs = new Map();
  const fn = fakeFunction(docs);
  const record = { resolved: [], prepared: [], stores: [], manifests: {}, sleeps: [], revoked: [], applies: [], timers: [] };
  const env = {
    ...loadEnv({ SYNC_BACKEND: "DIR", SYNC_DIR: path.join(work, "remote") }),
    dataRoot: path.join(work, "data"),
    workRoot: path.join(work, "work"),
    ...envOverrides
  };
  const runner = new Runner({
    env,
    makeStore: makeStore ?? (({ projectId }) => {
      const store = new MemoryStore({ docs });
      store.projectId = projectId;
      record.stores.push(store);
      return wrapStore(store);
    }),
    makeFunctionClient: fn.makeFunctionClient,
    makeSyncer: ({ root }) => new Syncer({ backend: new DirBackend(path.join(work, "remote")), root }),
    makePackageBackend: makePackageBackend ?? (() => ({ async get() {} })),
    unzip: async () => {},
    netGuard: async () => ({ uid: 1000 }),
    revokeReportServerToken: revoke ?? (async (args) => { record.revoked.push(args); }),
    // report-server's answer is the test's to set; the matcher is report-server's.
    askAppliesRoute: async (args) => { record.applies.push(args); return applies ? applies(args) : { applies: true, reason: null }; },
    steps: steps(record, stepOverrides),
    now: () => clock.t,
    sleep: async (ms) => { record.sleeps.push(ms); clock.t += ms; await new Promise((r) => setImmediate(r)); },
    // The heartbeat's timer, fired by hand with tick().
    startTimer: (ms, fn) => {
      const timer = { ms, fn, cancelled: false };
      record.timers.push(timer);
      return () => { timer.cancelled = true; };
    }
  });
  return { runner, fn, docs, record, clock, env };
}

const runnerDoc = (docs) => docs.get(runnerPath(PORTAL, USER));
const settle = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
// Waits for `ready()`, failing rather than hanging the file when it never comes.
async function until(ready, what) {
  for (let i = 0; i < 1000; i++) {
    if (ready()) return;
    await settle(1);
  }
  assert.fail(`never reached: ${what}`);
}
// Fires every heartbeat timer still running, as one interval passing.
async function tick(built) {
  for (const timer of built.record.timers) if (!timer.cancelled) timer.fn();
  await settle();
}
const result = (docs, identity, classHash = CLASS) => docs.get(resultPath(PORTAL, classHash, USER, packageDocId(identity)));
const writesTo = (record, p) => record.stores.flatMap((s) => s.writes.filter((w) => w.path === p).map((w) => w.doc));

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "rd-runner-"));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

async function started(opts) {
  const built = build(opts);
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  return built;
}

// ---- /run ----------------------------------------------------------------------

test("/run reaches ready on the runners/ document, with server time and the portal", async () => {
  const { runner, docs, record } = await started();
  await runner.loop;

  assert.equal(runner.state, "ready");
  const states = writesTo(record, runnerPath(PORTAL, USER)).map((w) => w.state).filter(Boolean);
  assert.deepEqual(states.slice(0, 2), ["starting", "ready"]);
  const doc = runnerDoc(docs);
  assert.equal(doc.platform_id, PLATFORM_ID);
  assert.equal(doc.updated_at, SERVER_TIME, "the rules require server time on every runner write");
  assert.equal(doc.microvm_id, "mvm-1");
  assert.equal(docs.has(`researcher_dashboard/${PORTAL}/researchers/${USER}`), false, "the spike's session path is not written");
});

// /work and /idle refuse any call without the VM's own id, and a result cannot be
// written running without it, so a VM that does not know its id is stopped at once.
test("/run refuses a body without the VM's own id", async () => {
  const { runner } = build();
  await assert.rejects(() => runner.run({ runHookPayload: PAYLOAD }), /microvmId/);
  assert.equal(runner.state, null);
});

test("/run refuses a payload without function_url", async () => {
  const { runner } = build();
  const without = JSON.stringify({ ...JSON.parse(PAYLOAD), function_url: undefined });
  await assert.rejects(() => runner.run({ microvmId: "mvm-1", runHookPayload: without }), /missing: function_url/);
});

test("/run refuses a payload carrying no forwarded credential", async () => {
  const { runner } = build();
  const without = JSON.stringify({ ...JSON.parse(PAYLOAD), report_server_token: undefined });
  await assert.rejects(() => runner.run({ microvmId: "mvm-1", runHookPayload: without }), /report_server_token/);
  assert.equal(runner.state, null);
});

// The S3 prefix is built from platform_user_id, so a token naming someone else is never used.
test("/run refuses a session token that names another researcher", async () => {
  const { runner } = build();
  const other = JSON.stringify({ ...JSON.parse(PAYLOAD), session_token: sessionToken({ platform_user_id: 999 }) });
  await assert.rejects(() => runner.run({ microvmId: "mvm-1", runHookPayload: other }), /names researcher 999/);
});

test("/run refuses a session token for another portal", async () => {
  const { runner } = build();
  const other = JSON.stringify({ ...JSON.parse(PAYLOAD), session_token: sessionToken({ platform_id: "https://learn.concord.org" }) });
  await assert.rejects(() => runner.run({ microvmId: "mvm-1", runHookPayload: other }), /names portal/);
});

test("/run logs the default chain as enabled when the process still holds credentials", async () => {
  const built = build();
  built.runner.processEnv = { AWS_ACCESS_KEY_ID: "x" };
  const lines = await captured(async () => {
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await built.runner.loop;
  });
  const line = lines.find((l) => l.event === "aws.default_chain_enabled");
  assert.deepEqual(line?.present, ["AWS_ACCESS_KEY_ID"]);
  assert.ok(!lines.some((l) => l.event === "aws.default_chain_disabled"));
});

test("/run refuses a session token without the runner claim", async () => {
  const { runner } = build();
  const other = JSON.stringify({ ...JSON.parse(PAYLOAD), session_token: sessionToken({ researcher_dashboard_runner: false }) });
  await assert.rejects(() => runner.run({ microvmId: "mvm-1", runHookPayload: other }), /runner claim/);
});

test("the status doc says which image version the VM is running", async () => {
  const { runner, docs } = await started({ envOverrides: { imageVersion: "24.0" } });
  await runner.loop;
  assert.equal(runnerDoc(docs).image_version, "24.0");
});

// ---- the pull loop -------------------------------------------------------------

test("/run asks for work with the VM's own id once it is ready", async () => {
  const { runner, fn } = await started();
  await runner.loop;
  const first = fn.state.calls[0];
  assert.equal(first.route, "work");
  assert.deepEqual(first.body, { microvm_id: "mvm-1" });
  assert.match(first.idToken, /^id-token-for:/, "authenticated as the VM's session");
});

test("a queued package is claimed, run and finished, and the counts land on the researcher's scope document", async () => {
  const built = build({ envOverrides: { imageVersion: "24.0" } });
  built.fn.queue({ identity: "users/136/class-counts", catalogId: 1234 });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const { docs, record } = built;

  const writes = writesTo(record, resultPath(PORTAL, CLASS, USER, "users__136__class-counts"));
  const claim = writes.find((w) => w.status === "running");
  assert.deepEqual(claim.package, { identity: "users/136/class-counts", version: "1.0.0", checksum: CHECKSUM });
  assert.equal(claim.microvm_id, "mvm-1");
  assert.equal(claim.expected_duration_seconds, 60);
  assert.equal(claim.started_at, SERVER_TIME);
  assert.equal(claim.display, null, "a claim clears the last run's display");
  assert.equal(claim.image_version, "24.0");

  const done = result(docs, "users/136/class-counts");
  assert.equal(done.status, "done");
  assert.equal(done.display, "# Counts\n\n12 documents");
  assert.equal(done.summary, "12 documents");
  assert.equal(done.finished_at, SERVER_TIME);
  assert.equal(done.requested_by, undefined, "the path says who ran it");
  const finish = writes.at(-1);
  for (const field of ["status", "package", "image_version", "summary", "display", "finished_at", "updated_at"]) {
    assert.ok(field in finish, `the finish writes ${field} in the same call`);
  }

  const scopeDoc = docs.get(scopePath(PORTAL, CLASS, USER));
  assert.equal(scopeDoc.data.answers, 201);
  assert.equal(scopeDoc.data.logs, 490);
  assert.equal("clue_documents" in scopeDoc.data, false);
  assert.equal(scopeDoc.data.last_pull_at, SERVER_TIME);
  assert.equal(scopeDoc.data.log_freshness_at, "2026-08-26T00:00:00.000Z");
  assert.equal(scopeDoc.data.learners, undefined);
  assert.equal(docs.has(classPath(PORTAL, CLASS)), false, "nothing per researcher on the class's own document");
});

test("a count the package did not report is absent, not zero", async () => {
  const built = build({ stepOverrides: { readPackageCounts: async () => ({ logs: 4 }) } });
  built.fn.queue({ identity: "users/1/logs-only" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.deepEqual(built.docs.get(scopePath(PORTAL, CLASS, USER)).data, { logs: 4, last_pull_at: SERVER_TIME });
});

test("an unparseable log_freshness_at is left out, and the counts still land", async () => {
  const built = build({ stepOverrides: { readPackageCounts: async () => ({ answers: 3, log_freshness_at: "not a date" }) } });
  built.fn.queue({ identity: "users/1/wildfire-responses" });
  const lines = await captured(async () => {
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await built.runner.loop;
  });
  assert.deepEqual(built.docs.get(scopePath(PORTAL, CLASS, USER)).data, { answers: 3, last_pull_at: SERVER_TIME });
  assert.ok(!lines.some((l) => l.event === "status.write_failed"));
});

// A package that reports only some counts must not inherit another run's others.
test("the counts replace the scope document's last counts rather than merging into them", async () => {
  const built = build({ stepOverrides: { readPackageCounts: async () => ({ answers: 3 }) } });
  built.docs.set(scopePath(PORTAL, CLASS, USER), { platform_id: PLATFORM_ID, data: { answers: 1, logs: 9, log_freshness_at: "2026-01-01T00:00:00.000Z", clue_documents: 4 } });
  built.fn.queue({ identity: "users/1/wildfire-responses" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.deepEqual(built.docs.get(scopePath(PORTAL, CLASS, USER)).data, { answers: 3, last_pull_at: SERVER_TIME });
});

test("the status document says what is running and what is queued behind it, then drains", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/first" });
  built.fn.queue({ identity: "users/1/second" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;

  const runningWrites = writesTo(built.record, runnerPath(PORTAL, USER)).filter((w) => w.state === "running");
  assert.deepEqual(runningWrites[0].current_package, { class_hash: CLASS, package_key: "users__1__first" });
  assert.deepEqual(runningWrites[0].queue, [{ class_hash: CLASS, package_key: "users__1__second" }]);
  assert.deepEqual(runningWrites[1].queue, []);
  assert.deepEqual(runningWrites[0].scopes, [CLASS]);
  const last = runnerDoc(built.docs);
  assert.equal(last.state, "ready");
  assert.equal(last.current_package, null);
  assert.deepEqual(last.queue, []);
});

// Two packages with the same name from different origins are two packages.
test("two packages named alike from different origins run in one queue without sharing anything", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts" });
  built.fn.queue({ identity: "projects/20/counts" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;

  assert.equal(result(built.docs, "users/1/counts").status, "done");
  assert.equal(result(built.docs, "projects/20/counts").status, "done");
  const docIds = built.record.prepared.map((p) => p.docId);
  assert.deepEqual(docIds, ["users__1__counts", "projects__20__counts"]);
  assert.deepEqual([...new Set(built.record.resolved.map((p) => p.identity))], ["users/1/counts", "projects/20/counts"]);
});

test("the package is handed its scope and its dataset's catalog id", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts", catalogId: 77 });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;

  const prepared = built.record.prepared[0];
  assert.equal(prepared.catalogId, 77);
  assert.deepEqual(prepared.scope, scopeBlock(CLASS));
  assert.equal(prepared.docId, "users__1__counts");
});

test("a run writes its stages in order, with no pull stage of its own", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const stages = writesTo(built.record, resultPath(PORTAL, CLASS, USER, "users__1__counts")).map((w) => w.stage).filter(Boolean);
  assert.deepEqual(stages, ["starting", "prepare_package", "run_package", "done"]);
});

test("a CLUE class token from rigse signs nothing in", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(result(built.docs, "users/1/counts").status, "done");
  assert.ok(built.fn.state.scopes[CLASS].class_tokens[CLUE_ROW], "the answer carried one");
  assert.deepEqual([...new Set(built.record.stores.map((store) => store.projectId))], [PROJECT]);
});

// The last of the three places applicability is evaluated, and the only boundary.
test("a package whose patterns do not match the class is refused, never claimed", async () => {
  const reason = "no URL in this class matches any of *question-interactives/*open-response/*";
  const built = build({ applies: async () => ({ applies: false, reason }) });
  built.fn.queue({ identity: "users/1/ap-only" });
  built.record.manifests["users/1/ap-only"] = manifestFor("users/1/ap-only", { urls: { any: ["*question-interactives/*open-response/*"] } });
  built.docs.set(classPath(PORTAL, CLASS), { platform_id: PLATFORM_ID, assignment_urls: ["https://models-resources.concord.org/collaborative-learning/index.html?unit=moth"], interactive_urls: [] });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;

  const writes = writesTo(built.record, resultPath(PORTAL, CLASS, USER, "users__1__ap-only"));
  assert.ok(!writes.some((w) => w.status === "running"), "refused before any claim");
  const doc = result(built.docs, "users/1/ap-only");
  assert.equal(doc.finished_at, SERVER_TIME, "a refusal is written with its finish time");
  assert.equal(doc.status, "failed");
  assert.equal(doc.error, `the package does not apply to this class: ${reason}`);
  assert.equal(built.record.prepared.length, 0);
  // The patterns are the archive's and the URLs the profile's, both together.
  const asked = built.record.applies[0];
  assert.deepEqual(asked.urls, { any: ["*question-interactives/*open-response/*"] });
  assert.deepEqual(asked.scopeUrls, ["https://models-resources.concord.org/collaborative-learning/index.html?unit=moth"]);
  assert.equal(asked.token, JSON.parse(PAYLOAD).report_server_token);
  assert.equal(asked.baseUrl, JSON.parse(PAYLOAD).report_server_url);
});

test("a package that matches its class's profile runs", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/ap" });
  built.record.manifests["users/1/ap"] = manifestFor("users/1/ap", { urls: { any: ["*question-interactives/*open-response/*"] } });
  built.docs.set(classPath(PORTAL, CLASS), { platform_id: PLATFORM_ID, assignment_urls: [], interactive_urls: ["https://models-resources.concord.org/question-interactives/branch/master/open-response/"] });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(result(built.docs, "users/1/ap").status, "done");
  assert.deepEqual(built.record.applies.map((a) => a.scopeUrls), [["https://models-resources.concord.org/question-interactives/branch/master/open-response/"]]);
});

test("a package declaring no patterns runs without asking report-server", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts" });
  built.record.manifests["users/1/counts"] = manifestFor("users/1/counts", { urls: { all: [], any: [], none: [] } });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(result(built.docs, "users/1/counts").status, "done");
  assert.equal(built.record.applies.length, 0);
});

test("report-server unavailable for three attempts fails the package so the VM can suspend", async () => {
  const built = build({ applies: async () => { throw new ReportServerError("report-server answered 503 to the applies check", { status: 503 }); } });
  built.fn.queue({ identity: "users/1/ap" });
  built.record.manifests["users/1/ap"] = manifestFor("users/1/ap", { urls: { any: ["*x*"] } });
  built.docs.set(classPath(PORTAL, CLASS), { platform_id: PLATFORM_ID, assignment_urls: ["https://a/x"], interactive_urls: [] });
  const lines = await captured(async () => {
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await built.runner.loop;
  });
  // Each failed check is logged under its stable name, saying which call failed.
  const refused = lines.filter((l) => l.event === "report_server.refused");
  assert.equal(refused.length, 3);
  for (const line of refused) {
    assert.deepEqual({ call: line.call, status: line.status, scope: line.scope, package: line.package },
      { call: "applies", status: 503, scope: CLASS, package: "users/1/ap" });
  }
  const doc = result(built.docs, "users/1/ap");
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /could not say whether the package applies.*answered 503.*run it again/);
  assert.equal(built.record.applies.length, 3);
  assert.ok(!writesTo(built.record, resultPath(PORTAL, CLASS, USER, "users__1__ap")).some((w) => w.status === "running"));
});

test("a class profile that cannot be read three times fails the package so the VM can suspend", async () => {
  const built = build({
    wrapStore: (store) => {
      const get = store.get.bind(store);
      store.get = (p) => (p === classPath(PORTAL, CLASS) ? Promise.reject(new Error("UNAVAILABLE")) : get(p));
      return store;
    }
  });
  built.fn.queue({ identity: "users/1/ap" });
  built.record.manifests["users/1/ap"] = manifestFor("users/1/ap", { urls: { any: ["*x*"] } });
  stopAfter(built, 40);
  const lines = await captured(async () => {
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await built.runner.loop;
  });
  assert.equal(lines.filter((l) => l.event === "report_server.refused" && l.call === "applies").length, 3);
  const doc = result(built.docs, "users/1/ap");
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /could not say whether the package applies.*UNAVAILABLE.*run it again/);
  assert.equal(built.record.applies.length, 0, "report-server is not asked without a profile");
});

// A resume stands the old loop's plan down; its late answers must not refuse anything.
test("a plan a resume has stood down makes no further call or write", async () => {
  let first = true;
  let answerOld;
  const built = build({
    applies: () => {
      if (!first) return { applies: true, reason: null };
      first = false;
      return new Promise((r) => { answerOld = r; });
    }
  });
  built.docs.set(classPath(PORTAL, CLASS), { platform_id: PLATFORM_ID, assignment_urls: ["https://a/x"], interactive_urls: [] });
  for (const identity of ["users/1/first", "users/1/second"]) {
    built.fn.queue({ identity });
    built.record.manifests[identity] = manifestFor(identity, { urls: { any: ["*x*"] } });
  }
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => answerOld, "the old plan's applies check");
  const oldLoop = built.runner.loop;
  built.runner.resume();
  await built.runner.loop;
  const asked = built.record.applies.length;
  answerOld({ applies: false, reason: "no URL in this class matches the required pattern *x*" });
  await oldLoop;
  assert.equal(built.record.applies.length, asked, "the old plan asks nothing more");
  for (const identity of ["users/1/first", "users/1/second"]) {
    assert.equal(result(built.docs, identity).status, "done", `${identity} is not refused by the old plan`);
  }
});

test("a plan started by a resume shares the fetch the old plan has under way", async () => {
  const pending = [];
  const fetched = () => { for (const release of pending) release(); };
  const built = build({
    stepOverrides: {
      resolvePackage: ({ pkg }) => {
        built.record.resolved.push(pkg);
        return new Promise((r) => { pending.push(() => r(manifestFor(pkg.identity))); });
      }
    }
  });
  built.fn.queue({ identity: "users/1/counts" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => pending.length, "the old plan's fetch");
  const oldLoop = built.runner.loop;
  built.runner.resume();
  await settle(10);
  fetched();
  await oldLoop;
  await built.runner.loop;
  assert.equal(built.record.resolved.length, 1, "one fetch for both plans");
  assert.equal(result(built.docs, "users/1/counts").status, "done");
});

test("a plan stood down during its fetch asks report-server nothing", async () => {
  const pending = [];
  const built = build({
    stepOverrides: {
      resolvePackage: ({ pkg }) => new Promise((r) => { pending.push(() => r(manifestFor(pkg.identity, { urls: { any: ["*x*"] } }))); })
    }
  });
  built.docs.set(classPath(PORTAL, CLASS), { platform_id: PLATFORM_ID, assignment_urls: ["https://a/x"], interactive_urls: [] });
  built.fn.queue({ identity: "users/1/counts" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => pending.length, "the old plan's fetch");
  const oldLoop = built.runner.loop;
  built.runner.resume();
  await settle(10);
  for (const release of pending) release();
  await oldLoop;
  await built.runner.loop;
  assert.equal(built.record.applies.length, 1, "only the new plan asks");
});

test("a fetch that fails after a resume is refused once, by the new plan", async () => {
  let reject;
  const built = build({ stepOverrides: { resolvePackage: () => new Promise((_, r) => { reject = r; }) } });
  built.fn.queue({ identity: "users/1/counts" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => reject, "the old plan's fetch");
  const oldLoop = built.runner.loop;
  built.runner.resume();
  await settle(10);
  const lines = await captured(async () => {
    reject(new Error("packages/users/1/counts/1.0.0.zip is missing or not readable"));
    await oldLoop;
    await built.runner.loop;
  });
  const failures = writesTo(built.record, resultPath(PORTAL, CLASS, USER, "users__1__counts")).filter((w) => w.status === "failed");
  assert.equal(failures.length, 1);
  assert.equal(lines.filter((l) => l.event === "package.refused").length, 1, "the old plan refuses nothing");
});

test("a claim that fails after a resume is not charged to the new awake period", async () => {
  let rejectOld;
  let first = true;
  const built = build({
    wrapStore: (store) => {
      const merge = store.merge.bind(store);
      store.merge = (p, fields) => {
        if (first && p.includes("/results/") && fields.status === "running") {
          first = false;
          return new Promise((_, reject) => { rejectOld = reject; });
        }
        return merge(p, fields);
      };
      return store;
    }
  });
  built.fn.queue({ identity: "users/1/counts" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => rejectOld, "the old loop's claim");
  const oldLoop = built.runner.loop;
  const lines = await captured(async () => {
    built.runner.resume();
    rejectOld(new Error("UNAVAILABLE"));
    await oldLoop;
    await built.runner.loop;
  });
  assert.equal(lines.filter((l) => l.event === "package.claim_failed").length, 0);
  assert.equal(result(built.docs, "users/1/counts").status, "done");
});

test("a fetch that failed is tried again when the package is run again", async () => {
  let fetches = 0;
  const built = build({
    stepOverrides: {
      resolvePackage: async ({ pkg }) => {
        fetches += 1;
        if (fetches === 1) throw new Error("packages/users/1/counts/1.0.0.zip is missing or not readable");
        return manifestFor(pkg.identity);
      }
    }
  });
  built.fn.queue({ identity: "users/1/counts" });
  onceWhen(built, () => result(built.docs, "users/1/counts")?.status === "failed", () => requeue(built, "users/1/counts"));
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(fetches, 2);
  assert.equal(result(built.docs, "users/1/counts").status, "done");
});

test("a request report-server refuses outright refuses the package with its message", async () => {
  const built = build({ applies: async () => { throw new ReportServerError("scope_urls[3] is longer than 2048 bytes", { status: 400, refusal: true }); } });
  built.fn.queue({ identity: "users/1/ap" });
  built.record.manifests["users/1/ap"] = manifestFor("users/1/ap", { urls: { any: ["*x*"] } });
  built.docs.set(classPath(PORTAL, CLASS), { platform_id: PLATFORM_ID, assignment_urls: ["https://a/x"], interactive_urls: [] });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const doc = result(built.docs, "users/1/ap");
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /longer than 2048 bytes/);
  assert.equal(built.record.applies.length, 1);
});

test("a refusal whose write hangs is bounded, so the loop moves on", async (t) => {
  const g = gate((p, fields) => p.includes("/results/") && fields.status === "failed");
  const built = build({ wrapStore: g.wrap, applies: () => ({ applies: false, reason: "no URL in this class matches the required pattern *x*" }) });
  built.docs.set(classPath(PORTAL, CLASS), { assignment_urls: ["https://a"], interactive_urls: [] });
  built.record.manifests["users/1/refused"] = manifestFor("users/1/refused", { urls: { all: ["*x*"] } });
  built.fn.queue({ identity: "users/1/refused" });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let lines;
  try {
    lines = await captured(async () => {
      await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
      await until(() => g.held.length, "the refusal's write");
      t.mock.timers.tick(STATUS_WRITE_TIMEOUT_MS + 1000);
      await settle(10);
    });
  } finally {
    t.mock.timers.reset();
    g.open();
  }
  assert.ok(lines.some((l) => l.event === "package.claim_failed"), "the hung write counts as a failed attempt");
  await built.runner.loop;
  assert.equal(result(built.docs, "users/1/refused").status, "failed");
});

test("a window-exhausted write that hangs is bounded, so the loop moves on", async (t) => {
  const g = gate((p, fields) => p.includes("/results/") && fields.status === "failed" && /VM window exhausted/.test(fields.error));
  const clock = { t: Date.parse("2026-09-26T12:00:00Z") };
  const built = build({ clock, wrapStore: g.wrap });
  built.fn.queue({ identity: "users/1/long" });
  built.record.manifests["users/1/long"] = manifestFor("users/1/long", { expected_duration_seconds: 7000 });
  built.fn.state.workErrors.push(Object.assign(new Error("not yet"), { status: 500 }));
  const origSleep = built.runner.sleep;
  let jumped = false;
  built.runner.sleep = async (ms) => {
    if (!jumped) { jumped = true; clock.t += 7 * 3600_000; return; }
    await origSleep(ms);
  };
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let lines;
  try {
    lines = await captured(async () => {
      await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
      await until(() => g.held.length, "the window's write");
      t.mock.timers.tick(STATUS_WRITE_TIMEOUT_MS + 1000);
      await settle(10);
    });
  } finally {
    t.mock.timers.reset();
    g.open();
  }
  assert.ok(lines.some((l) => l.event === "package.claim_failed"), "the hung write counts as a failed attempt");
  await built.runner.loop;
  assert.match(result(built.docs, "users/1/long").error, /VM window exhausted/);
});

test("a package declaring patterns on a class with no profile is refused", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/ap" });
  built.record.manifests["users/1/ap"] = manifestFor("users/1/ap", { urls: { none: ["*secret*"] } });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.match(result(built.docs, "users/1/ap").error, /profile has not been derived/);
});

test("a manifest declaring ten hours is refused by the runner's ceiling", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/long" });
  built.record.manifests["users/1/long"] = manifestFor("users/1/long", { expected_duration_seconds: 36_000 });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;

  const doc = result(built.docs, "users/1/long");
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /declares 36000s, over the runner's ceiling of 7200s/);
});

// /run is at 12:00, so the VM's cap is 20:00, less five minutes. At 16:30, 3h25m are
// left: one package declaring 7,000s fits, and two do not.
test("the window check fails what cannot finish before the VM's cap, up front", async () => {
  const clock = { t: Date.parse("2026-09-26T12:00:00Z") };
  const built = build({ clock });
  built.fn.queue({ identity: "users/1/first" });
  built.fn.queue({ identity: "users/1/second" });
  built.record.manifests["users/1/first"] = manifestFor("users/1/first", { expected_duration_seconds: 7000 });
  built.record.manifests["users/1/second"] = manifestFor("users/1/second", { expected_duration_seconds: 7000 });
  built.fn.state.workErrors.push(Object.assign(new Error("not yet"), { status: 500 }));
  const origSleep = built.runner.sleep;
  let jumped = false;
  built.runner.sleep = async (ms) => {
    if (!jumped) { jumped = true; clock.t += 4.5 * 3600_000; return; }
    await origSleep(ms);
  };
  const lines = await captured(async () => {
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await built.runner.loop;
  });

  assert.equal(result(built.docs, "users/1/first").status, "done");
  const second = result(built.docs, "users/1/second");
  assert.equal(second.status, "failed");
  assert.match(second.error, /VM window exhausted: 12300s left, and this package and the ones before it declare 14000s/);
  assert.ok(lines.some((l) => l.event === "package.refused" && l.package === "users/1/second" && /VM window exhausted/.test(l.error)), "the refusal is logged");
  assert.ok(!writesTo(built.record, resultPath(PORTAL, CLASS, USER, "users__1__second")).some((w) => w.status === "running"));
});

// A hung package's process dies only when it is killed, as the sandbox's does.
function killable(events) {
  let die;
  return {
    runPackage: () => new Promise((_, reject) => { die = reject; }),
    killPackageProcesses: async () => { events.push("kill"); die?.(new Error("killed")); }
  };
}

test("a package that outruns its bound fails rather than hanging", async () => {
  const built = build({ envOverrides: { packageTimeoutMs: 20 }, stepOverrides: killable([]) });
  built.fn.queue({ identity: "users/1/hang" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const doc = result(built.docs, "users/1/hang");
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /ran past its/);
  assert.equal(built.runner.state, "ready");
});

test("a package past its bound during preparation is never started", async () => {
  let prepared;
  let started = false;
  const built = build({
    envOverrides: { packageTimeoutMs: 20 },
    stepOverrides: {
      preparePackage: (args) => new Promise((r) => { prepared = () => r({ paths: { outputDir: path.join(args.workRoot, "out", args.docId), home: "/h", dataDir: args.dataRoot }, env: {} }); }),
      killPackageProcesses: async () => { prepared?.(); },
      runPackage: async () => { started = true; return { display: "x", summary: "y" }; }
    }
  });
  built.fn.queue({ identity: "users/1/slow-prepare" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const writes = writesTo(built.record, resultPath(PORTAL, CLASS, USER, "users__1__slow-prepare"));
  const failed = writes.findIndex((w) => w.status === "failed");
  assert.ok(failed >= 0);
  assert.deepEqual(writes.slice(failed + 1).filter((w) => w.stage), [], "no stage after the failure");
  assert.equal(started, false, "the package's entrypoint never runs");
  assert.ok(!writes.some((w) => w.stage === "run_package"));
});

test("a timed-out package whose step never ends is failed once its end's bound passes", async (t) => {
  let started;
  const built = build({
    envOverrides: { packageTimeoutMs: 20 },
    stepOverrides: { runPackage: () => { started = true; return new Promise(() => {}); }, killPackageProcesses: async () => {} }
  });
  built.fn.queue({ identity: "users/1/stuck" });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await until(() => started, "the package step");
    t.mock.timers.tick(25);
    await settle(10);
    assert.equal(result(built.docs, "users/1/stuck").status, "running", "held for the step's end");
    t.mock.timers.tick(PACKAGE_END_TIMEOUT_MS + 1000);
    await settle(10);
    assert.equal(result(built.docs, "users/1/stuck").status, "failed");
  } finally {
    t.mock.timers.reset();
  }
  built.runner.terminate().catch(() => {});
});

// Every package runs as one uid, so one past its bound must be gone before the next starts.
test("a package past its bound is killed before its failure is written and the next is claimed", async () => {
  const events = [];
  const stopped = killable(events);
  let runs = 0;
  const built = build({
    envOverrides: { packageTimeoutMs: 20 },
    stepOverrides: { ...stopped, runPackage: (args) => (++runs === 1 ? stopped.runPackage(args) : Promise.resolve({ display: "x", summary: "y" })) },
    wrapStore: (store) => {
      const merge = store.merge.bind(store);
      store.merge = (p, fields) => {
        if (p.includes("/results/") && (fields.status || fields.stage)) events.push(`${p.split("/").at(-1)}:${fields.status ?? fields.stage}`);
        return merge(p, fields);
      };
      return store;
    }
  });
  built.fn.queue({ identity: "users/1/hang" });
  built.fn.queue({ identity: "users/1/next" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const kill = events.indexOf("kill");
  assert.ok(kill >= 0, "the package's processes are killed");
  assert.ok(kill < events.indexOf("users__1__hang:failed"), "before its failure is written");
  assert.ok(kill < events.indexOf("users__1__next:running"), "before the next package is claimed");
  assert.ok(!events.slice(events.indexOf("users__1__hang:failed")).some((e) => e.startsWith("users__1__hang:") && e !== "users__1__hang:failed"), "nothing of the run is written after its failure");
  assert.equal(result(built.docs, "users/1/next").status, "done");
});

test("a failed package fails its document, is redacted, and the VM goes back to ready", async () => {
  const built = build({ stepOverrides: { runPackage: async () => { throw new Error("package exited 1: Bearer abc.def.ghi"); } } });
  built.fn.queue({ identity: "users/1/broken" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const doc = result(built.docs, "users/1/broken");
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /package exited 1: Bearer \[redacted\]/);
  assert.equal(doc.finished_at, SERVER_TIME, "a failed run is written with its finish time");
  assert.equal(built.runner.state, "ready");
});

test("an archive that cannot be fetched is refused as missing or not readable", async () => {
  const built = build({ stepOverrides: { resolvePackage: async () => { throw new Error("packages/users/1/gone/1.0.0.zip is missing or not readable"); } } });
  built.fn.queue({ identity: "users/1/gone" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.match(result(built.docs, "users/1/gone").error, /missing or not readable/);
});

test("a queued package is fetched from the payload's bucket at its identity's key", async () => {
  const asked = [];
  const built = build({
    makePackageBackend: ({ bucket }) => ({ async get(key) { asked.push({ bucket, key }); throw new Error("stop"); } }),
    stepOverrides: { resolvePackage: makeSteps().resolvePackage }
  });
  built.fn.queue({ identity: "users/136/class-counts" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;

  assert.deepEqual(asked, [{ bucket: "researcher-dashboard-runner-staging", key: "users/136/class-counts/1.0.0.zip" }]);
});

// The id comes from the identity; /work's own package_key is only checked.
test("a queued entry whose package_key disagrees with its identity is refused", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts" });
  const call = built.fn.makeFunctionClient();
  built.runner.makeFunctionClient = () => async (route, args) => {
    const answer = await call(route, args);
    if (route === "work") answer.packages = answer.packages.map((p) => ({ ...p, package_key: "users__1__other" }));
    return answer;
  };
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.match(result(built.docs, "users/1/counts").error, /named this package users__1__other/);
});

// The result's address is the package key /work named, the one place it is used, and only
// when it is itself well formed.
test("a queued entry whose identity is unusable is failed at its package key", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts" });
  const call = built.fn.makeFunctionClient();
  built.runner.makeFunctionClient = () => async (route, args) => {
    const answer = await call(route, args);
    if (route === "work") answer.packages = answer.packages.map((p) => ({ ...p, identity: "Users/1/counts" }));
    return answer;
  };
  stopAfter(built, 40);
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const doc = result(built.docs, "users/1/counts");
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /does not match the catalog's grammar/);
  assert.equal(built.fn.routes().at(-1), "idle", "the queue drains and the VM can suspend");
});

// Each value /work hands out is checked before it reaches a path, an S3 key or scope.json.
test("a queued entry is refused when its version, checksum, catalog id or scope is malformed", async () => {
  const cases = [
    ["version", (p) => ({ ...p, version: "../1.0.0" }), null, /does not match the catalog's grammar/],
    ["checksum", (p) => ({ ...p, checksum: "sha256:xyz" }), null, /does not match the catalog's grammar/],
    ["catalog id", (p) => ({ ...p, catalog_id: 0 }), null, /does not match the catalog's grammar/],
    ["scope kind", null, (sc) => ({ ...sc, kind: "school" }), /not a class scope/],
    ["scope id", null, (sc) => ({ ...sc, id: OTHER_CLASS }), /queued scope names .*, not /],
    ["class id zero", null, (sc) => ({ ...sc, classes: [{ class_hash: CLASS, class_id: 0 }] }), /class list is not this class/],
    ["class id string", null, (sc) => ({ ...sc, classes: [{ class_hash: CLASS, class_id: "111" }] }), /class list is not this class/],
    ["scope class", null, (sc) => ({ ...sc, classes: [{ class_hash: OTHER_CLASS, class_id: 1 }] }), /class list is not this class/],
    ["assignments", null, (sc) => ({ ...sc, assignments: "none" }), /no assignment list/],
    ["two classes", null, (sc) => ({ ...sc, classes: [...sc.classes, { class_hash: OTHER_CLASS, class_id: 2 }] }), /class list is not this class/]
  ];
  for (const [name, entry, scope, reason] of cases) {
    const built = build();
    built.fn.queue({ identity: "users/1/counts" });
    const call = built.fn.makeFunctionClient();
    built.runner.makeFunctionClient = () => async (route, args) => {
      const answer = await call(route, args);
      if (route === "work") {
        if (entry) answer.packages = answer.packages.map(entry);
        if (scope && answer.scopes[CLASS]) answer.scopes = { [CLASS]: { ...answer.scopes[CLASS], scope: scope(answer.scopes[CLASS].scope) } };
      }
      return answer;
    };
    stopAfter(built, 40);
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await built.runner.loop;
    const doc = result(built.docs, "users/1/counts");
    assert.equal(doc.status, "failed", name);
    assert.match(doc.error, reason, name);
    assert.equal(built.record.prepared.length, 0, `${name}: nothing prepared`);
    assert.ok(!writesTo(built.record, resultPath(PORTAL, CLASS, USER, "users__1__counts")).some((w) => w.status === "running"), `${name}: never claimed`);
  }
});

test("an entry with neither a usable identity nor a well-formed key is logged and written nowhere", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts" });
  const call = built.fn.makeFunctionClient();
  built.runner.makeFunctionClient = () => async (route, args) => {
    const answer = await call(route, args);
    if (route === "work") answer.packages = answer.packages.map((p) => (p.identity === "users/1/counts" ? { ...p, identity: "Users/1/counts", package_key: "../evil" } : p));
    return answer;
  };
  built.fn.queue({ identity: "users/1/good" });
  stopAfter(built, 4);
  const lines = await captured(async () => {
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await built.runner.loop;
  });
  await until(() => built.runner.state === "terminated", "the stop's terminate");
  const resultWrites = built.record.stores.flatMap((st) => st.writes).filter((w) => w.path.includes("/results/") && !w.path.endsWith("users__1__good"));
  assert.deepEqual(resultWrites, []);
  const running = writesTo(built.record, runnerPath(PORTAL, USER)).find((w) => w.state === "running");
  assert.ok(running, "the good package's claim-time runner-document write lands");
  assert.deepEqual(running.queue, [], "an entry with no usable key is not listed");
  assert.ok(lines.some((l) => l.event === "package.refused" && /Users\/1\/counts/.test(l.error) && /\.\.\/evil/.test(l.error)));
});

// ---- tokens and stores ---------------------------------------------------------

test("every /work answer signs in new stores, per class, and the last request's are closed", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/a" });
  built.fn.queue({ identity: "users/1/b", classHash: OTHER_CLASS });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;

  const classStores = built.record.stores.filter((s) => s.signedInWith.some((t) => t.includes(".")) && s.signedInWith.length && JSON.parse(Buffer.from(s.signedInWith[0].split(".")[1], "base64url")).claims.class_hash);
  assert.ok(classStores.length >= 3, "a class store per class per request, never one kept for the VM");
  const open = built.record.stores.filter((s) => !s.closed);
  assert.ok(open.length <= 3, `only the current request's stores stay open, found ${open.length}`);
});

for (const [name, change] of [
  ["another portal's session token", (fn) => { fn.state.sessionToken = () => sessionToken({ platform_id: "https://learn.concord.org" }); }],
  ["another Firebase project", (fn, built) => {
    const call = fn.makeFunctionClient();
    built.runner.makeFunctionClient = () => async (route, args) => {
      const answer = await call(route, args);
      return route === "work" ? { ...answer, firebase_project: "report-service-pro" } : answer;
    };
  }]
]) {
  test(`a /work answer naming ${name} is not adopted`, async () => {
    const built = build();
    built.fn.queue({ identity: "users/1/counts" });
    change(built.fn, built);
    stopAfter(built, 4);
    const lines = await captured(async () => {
      await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
      await built.runner.loop;
    });
    assert.equal(result(built.docs, "users/1/counts").status, "queued");
    assert.equal(built.record.prepared.length, 0);
    assert.ok(lines.some((l) => l.event === "work.token_refused"));
  });
}

test("a /work answer whose session token names another researcher is not adopted", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts" });
  const refused = sessionToken({ platform_user_id: 999 });
  built.fn.state.sessionToken = () => refused;
  const run = built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await run;
  // Nothing it names runs; the loop keeps asking at the idle interval.
  let polls = 0;
  const origSleep = built.runner.sleep;
  built.runner.sleep = async (ms) => { polls += 1; if (polls > 3) built.runner.terminate().catch(() => {}); await origSleep(ms); };
  await built.runner.loop;
  assert.equal(result(built.docs, "users/1/counts").status, "queued");
  assert.equal(built.record.prepared.length, 0);
  const refusedStores = built.record.stores.filter((st) => st.signedInWith.includes(refused));
  assert.ok(refusedStores.length >= 1);
  assert.ok(refusedStores.every((st) => st.closed), "a refused token's store is closed");
});

test("a class token that names another class leaves that class's packages unclaimed", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts", tokens: { [PROJECT]: classToken(OTHER_CLASS) } });
  let polls = 0;
  const origSleep = built.runner.sleep;
  built.runner.sleep = async (ms) => { polls += 1; if (polls > 12) built.fn.state.entries = []; await origSleep(ms); };
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(result(built.docs, "users/1/counts").status, "queued");
});

test("a claim that cannot be written is tried three times, then left, without a tight loop", async () => {
  const docs = new Map();
  const events = [];
  const built = build({
    makeStore: () => {
      const store = new MemoryStore({ docs });
      const merge = store.merge.bind(store);
      store.merge = async (p, fields) => {
        if (fields.status === "running") events.push("claim");
        if (fields.status === "running" || fields.status === "failed") throw new Error("PERMISSION_DENIED");
        return merge(p, fields);
      };
      return store;
    }
  });
  built.fn.queue({ identity: "users/1/counts" });
  let polls = 0;
  const origSleep = built.runner.sleep;
  built.runner.sleep = async (ms) => { events.push(ms); polls += 1; if (polls > 20) built.runner.terminate().catch(() => {}); await origSleep(ms); };
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const attempts = events.flatMap((e, i) => (e === "claim" ? [i] : []));
  assert.equal(attempts.length, 3);
  for (let i = 1; i < attempts.length; i++) {
    assert.ok(events.slice(attempts[i - 1], attempts[i]).includes(built.env.idlePollMs), "an idle poll between attempts");
  }
  // Left queued, the entry keeps the VM awake: /idle declines to suspend it, and the
  // runner goes back to /work.
  const routes = built.fn.routes();
  assert.ok(routes.includes("idle") && routes.indexOf("idle") < routes.lastIndexOf("work"));
  assert.equal(result(built.docs, "users/1/counts").status, "queued");
});

// ---- /work's answers -----------------------------------------------------------

test("a 409 long after /run waits one idle poll, not five seconds", async () => {
  const clock = { t: Date.parse("2026-09-26T12:00:00Z") };
  const built = build({ clock });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  await built.runner.suspend();
  clock.t += 120_000;
  built.fn.state.workErrors.push(Object.assign(new Error("not the recorded VM"), { status: 409 }));
  const before = built.record.sleeps.length;
  built.runner.resume();
  await built.runner.loop;
  assert.equal(built.record.sleeps[before], built.env.idlePollMs);
});

test("a 409 right after /run is retried after five seconds", async () => {
  const built = build();
  built.fn.state.workErrors.push(Object.assign(new Error("not the recorded VM"), { status: 409 }));
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(built.record.sleeps[0], 5000);
  assert.deepEqual(built.fn.routes().slice(0, 2), ["work", "work"]);
});

test("any other /work failure waits one idle poll", async () => {
  const built = build();
  built.fn.state.workErrors.push(Object.assign(new Error("down"), { status: 502 }));
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(built.record.sleeps[0], 30_000);
});

// ---- idle ----------------------------------------------------------------------

test("a drained VM asks for work through its idle period, flushes, then asks to be suspended", async () => {
  const built = build();
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const routes = built.fn.routes();
  assert.equal(routes.filter((r) => r === "work").length, 11, "every 30 seconds for five minutes");
  assert.equal(routes.at(-1), "idle");
  assert.deepEqual(built.fn.state.calls.at(-1).body, { microvm_id: "mvm-1" });
});

// The function's launch record writes starting after RunMicrovm returns, unordered against
// /run. /work refuses the VM until that record exists, and the first answer it takes
// writes ready again.
test("a launch record that lands after /run's ready is corrected by the first /work", async () => {
  const built = build();
  built.fn.state.workErrors.push(Object.assign(new Error("not the recorded VM"), { status: 409 }));
  const origSleep = built.runner.sleep;
  let first = true;
  built.runner.sleep = async (ms) => {
    if (first) { first = false; built.docs.set(runnerPath(PORTAL, USER), { ...runnerDoc(built.docs), state: "starting" }); }
    await origSleep(ms);
  };
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(runnerDoc(built.docs).state, "ready");
});

// Ten polls through the idle period must not mean ten writes of the same document.
test("a drained VM writes ready once, not on every poll", async () => {
  const built = build();
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const readies = writesTo(built.record, runnerPath(PORTAL, USER)).filter((w) => w.state === "ready");
  assert.equal(readies.length, 2, "one at /run, one when the first answer is empty");
});

test("work requested while idle is taken at the next poll", async () => {
  const built = build();
  let polls = 0;
  const origSleep = built.runner.sleep;
  built.runner.sleep = async (ms) => { polls += 1; if (polls === 2) built.fn.queue({ identity: "users/1/late" }); await origSleep(ms); };
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(result(built.docs, "users/1/late").status, "done");
  assert.equal(runnerDoc(built.docs).state, "ready", "ready is written again once the late package is done");
  assert.equal(runnerDoc(built.docs).current_package, null);
});

test("/idle answering work_queued sends the runner straight back to /work", async () => {
  const built = build();
  built.fn.state.idle.push({ success: true, suspended: false, work_queued: true });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const routes = built.fn.routes();
  const firstIdle = routes.indexOf("idle");
  assert.equal(routes[firstIdle + 1], "work");
  assert.equal(routes.at(-1), "idle");
});

test("an /idle that neither queues nor suspends waits out another idle period", async () => {
  const built = build();
  const inProgress = { success: true, suspended: false, run_in_progress: true };
  built.fn.state.idle.push(inProgress, inProgress);
  const lines = await captured(async () => {
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await built.runner.loop;
  });
  const routes = built.fn.routes();
  const idles = routes.flatMap((r, i) => (r === "idle" ? [i] : []));
  assert.equal(idles.length, 3, "two declined, then suspended");
  assert.equal(routes.slice(idles[0], idles[1]).filter((r) => r === "work").length, 11, "a whole idle period between them");
  assert.equal(lines.filter((l) => l.event === "idle.declined").length, 2);
});

test("/idle is not called on a flush that does not verify", async () => {
  const built = build();
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  let flushes = 0;
  built.runner.syncer.flushAndVerify = async () => { flushes += 1; built.fn.state.calls.push({ route: "flush" }); return flushes === 1 ? { ok: false, reason: "sync incomplete" } : { ok: true }; };
  await built.runner.loop;
  const routes = built.fn.routes();
  assert.equal(routes.filter((r) => r === "idle").length, 1, "one /idle, after the second flush verified");
  assert.equal(flushes, 2);
  const flushAt = routes.flatMap((r, i) => (r === "flush" ? [i] : []));
  assert.equal(routes.slice(flushAt[0], flushAt[1]).filter((r) => r === "work").length, 11, "a whole idle period before the next flush");
});

test("an /idle call that fails waits out another idle period", async () => {
  const built = build();
  const call = built.fn.makeFunctionClient();
  let failed = false;
  built.runner.makeFunctionClient = () => async (route, args) => {
    if (route === "idle" && !failed) {
      failed = true;
      built.fn.state.calls.push({ route: "idle" });
      throw Object.assign(new Error("SuspendMicrovm failed"), { status: 502 });
    }
    return call(route, args);
  };
  const lines = await captured(async () => {
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await built.runner.loop;
  });
  assert.equal(lines.filter((l) => l.event === "idle.failed").length, 1);
  const routes = built.fn.routes();
  const idles = routes.flatMap((r, i) => (r === "idle" ? [i] : []));
  assert.equal(routes.slice(idles[0], idles[1]).filter((r) => r === "work").length, 11);
});

// Stops a loop that would otherwise poll until the VM's cap, so a regression fails the
// test rather than hanging the file.
function stopAfter(built, polls) {
  let n = 0;
  const sleep = built.runner.sleep;
  built.runner.sleep = async (ms) => { n += 1; if (n === polls) built.runner.terminate().catch(() => {}); await sleep(ms); };
}

// The function re-appends a finished package with a fresh queued result when it is run again.
const requeue = (built, identity) =>
  built.docs.set(resultPath(PORTAL, CLASS, USER, packageDocId(identity)), { status: "queued", platform_id: PLATFORM_ID });

// Runs `fn` once, from the loop's next wait after `when()` holds, as a researcher acting
// while the VM stays awake.
function onceWhen(built, when, fn) {
  let done = false;
  const sleep = built.runner.sleep;
  built.runner.sleep = async (ms) => { if (!done && when()) { done = true; fn(); } await sleep(ms); };
}

test("a package failed because report-server could not answer runs when it is run again", async () => {
  let down = true;
  const built = build({ applies: async () => {
    if (down) throw new ReportServerError("report-server answered 503 to the applies check", { status: 503 });
    return { applies: true, reason: null };
  } });
  built.fn.queue({ identity: "users/1/ap" });
  built.record.manifests["users/1/ap"] = manifestFor("users/1/ap", { urls: { any: ["*x*"] } });
  built.docs.set(classPath(PORTAL, CLASS), { platform_id: PLATFORM_ID, assignment_urls: ["https://a/x"], interactive_urls: [] });
  onceWhen(built, () => result(built.docs, "users/1/ap").status === "failed", () => { down = false; requeue(built, "users/1/ap"); });
  stopAfter(built, 60);
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(result(built.docs, "users/1/ap").status, "done");
  assert.equal(built.record.applies.length, 4);
});

test("failed attempts before a successful claim do not count against the next run", async () => {
  let failures = 2;
  const built = build({ applies: async () => {
    if (failures-- > 0) throw new ReportServerError("report-server answered 503 to the applies check", { status: 503 });
    return { applies: true, reason: null };
  } });
  built.fn.queue({ identity: "users/1/ap" });
  built.record.manifests["users/1/ap"] = manifestFor("users/1/ap", { urls: { any: ["*x*"] } });
  built.docs.set(classPath(PORTAL, CLASS), { platform_id: PLATFORM_ID, assignment_urls: ["https://a/x"], interactive_urls: [] });
  // One more blip on the next run is that run's first failure, not its third. A new
  // version, so report-server is asked again rather than its last answer reused.
  let rerun = false;
  onceWhen(built, () => result(built.docs, "users/1/ap").status === "done", () => {
    rerun = true;
    failures = 1;
    built.fn.state.entries[0].version = "1.0.1";
    requeue(built, "users/1/ap");
  });
  stopAfter(built, 60);
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.ok(rerun);
  assert.equal(result(built.docs, "users/1/ap").status, "done");
  assert.equal(writesTo(built.record, resultPath(PORTAL, CLASS, USER, "users__1__ap")).filter((w) => w.status === "running").length, 2);
});

test("a resume gives a claim that could not be written three more attempts", async () => {
  const docs = new Map();
  let attempts = 0;
  const built = build({
    makeStore: () => {
      const store = new MemoryStore({ docs });
      const merge = store.merge.bind(store);
      store.merge = async (p, fields) => {
        if (fields.status === "running") { attempts += 1; throw new Error("PERMISSION_DENIED"); }
        return merge(p, fields);
      };
      return store;
    }
  });
  built.fn.queue({ identity: "users/1/counts" });
  built.fn.state.idle.push({ success: true, suspended: true });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(attempts, 3);
  await built.runner.suspend();
  built.fn.state.idle.push({ success: true, suspended: true });
  built.runner.resume();
  await built.runner.loop;
  assert.equal(attempts, 6);
});

test("re-planning after each package resolves and asks report-server about each package once", async () => {
  const built = build();
  for (const n of ["a", "b", "c", "d"]) {
    built.fn.queue({ identity: `users/1/${n}` });
    built.record.manifests[`users/1/${n}`] = manifestFor(`users/1/${n}`, { urls: { any: ["*x*"] } });
  }
  built.docs.set(classPath(PORTAL, CLASS), { platform_id: PLATFORM_ID, assignment_urls: ["https://a/x"], interactive_urls: [] });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  for (const n of ["a", "b", "c", "d"]) assert.equal(result(built.docs, `users/1/${n}`).status, "done");
  assert.equal(built.record.resolved.length, 4);
  assert.equal(built.record.applies.length, 4);
});

test("the status document's queue leaves out a package the same plan failed", async () => {
  let release;
  const built = build({
    applies: async () => ({ applies: false, reason: "no URL in this class matches the required pattern *x*" }),
    // Holds the first run, so the status document is read while it is running.
    stepOverrides: { runPackage: () => release ? { display: "x", summary: "y" } : new Promise((r) => { release = r; }) }
  });
  built.fn.queue({ identity: "users/1/first" });
  built.fn.queue({ identity: "users/1/refused" });
  built.fn.queue({ identity: "users/1/third" });
  built.record.manifests["users/1/refused"] = manifestFor("users/1/refused", { urls: { all: ["*x*"] } });
  built.docs.set(classPath(PORTAL, CLASS), { platform_id: PLATFORM_ID, assignment_urls: ["https://a/y"], interactive_urls: [] });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  while (!release) await new Promise((r) => setImmediate(r));
  try {
    assert.equal(result(built.docs, "users/1/refused").status, "failed");
    assert.deepEqual(runnerDoc(built.docs).queue, [{ class_hash: CLASS, package_key: "users__1__third" }]);
  } finally {
    release({ display: "x", summary: "y" });
  }
  await built.runner.loop;
});

// A slow /idle answer can arrive after the VM was suspended and resumed; it is not read
// as a failure or as anything else.
test("an /idle answer from before a resume is ignored", async () => {
  const built = build();
  let release;
  built.fn.state.block = { route: "idle", promise: new Promise((r) => { release = r; }) };
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  while (!built.fn.routes().includes("idle")) await new Promise((r) => setImmediate(r));
  const firstLoop = built.runner.loop;
  await built.runner.suspend();
  built.fn.state.block = null;
  built.runner.resume();
  // The late answer says work is queued. Read as current, it would start a second loop's
  // worth of /work and a second /idle beside the resume's own.
  built.fn.state.idle.unshift({ success: true, suspended: false, work_queued: true });
  release();
  await firstLoop;
  await built.runner.loop;
  const routes = built.fn.routes();
  assert.equal(routes.filter((r) => r === "idle").length, 2, "one /idle before the suspend, one from the resume's loop");
});

// The same race reached the other way: a call started late rather than answered late.
test("a loop stood down by a resume during its pre-idle flush does not ask to be suspended", async () => {
  let releaseFlush;
  let releaseRun;
  const built = build({ stepOverrides: { runPackage: () => new Promise((r) => { releaseRun = r; }) } });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  const flush = built.runner.syncer.flushAndVerify.bind(built.runner.syncer);
  let held = false;
  built.runner.syncer.flushAndVerify = async (why) => {
    if (why === "idle" && !held) { held = true; await new Promise((r) => { releaseFlush = r; }); }
    return flush(why);
  };
  while (!releaseFlush) await new Promise((r) => setImmediate(r));
  const firstLoop = built.runner.loop;
  await built.runner.suspend();
  built.fn.queue({ identity: "users/1/slow" });
  built.runner.resume();
  while (!built.runner.currentRun || !releaseRun) await new Promise((r) => setImmediate(r));
  try {
    releaseFlush();
    await firstLoop;
    assert.equal(built.fn.routes().filter((r) => r === "idle").length, 0, "/idle suspends whenever nothing is queued, so this call would suspend the VM mid-run");
  } finally {
    releaseRun({ display: "x", summary: "y" });
  }
  await built.runner.loop;
});


// ---- the heartbeat and the run's final write -----------------------------------

const SLOW = "users/1/slow";
const SLOW_KEY = packageDocId(SLOW);
const isBeat = (p, fields) => p.includes("/results/") && Object.keys(fields).sort().join() === "platform_id,updated_at";
const beatsIn = (record) => writesTo(record, resultPath(PORTAL, CLASS, USER, SLOW_KEY)).filter((w) => isBeat("/results/", w));

// Holds each merge `matches` picks until the test releases it; the rest go straight through.
// `open()` releases everything held and lets later merges through.
function gate(matches) {
  const held = [];
  let opened = false;
  return {
    held,
    open: () => { opened = true; for (const h of held) h.release(); },
    wrap: (store) => {
      const merge = store.merge.bind(store);
      store.merge = (p, fields) => !opened && matches(p, fields)
        ? new Promise((resolve, reject) => held.push({ release: () => merge(p, fields).then(resolve, reject) }))
        : merge(p, fields);
      return store;
    }
  };
}

// A run held in its package step until the test lets it finish.
async function holding(opts = {}) {
  let release;
  const built = build({ ...opts, stepOverrides: { runPackage: () => new Promise((r) => { release = r; }), ...opts.stepOverrides } });
  built.fn.queue({ identity: SLOW });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => release, "the package step");
  return { built, finish: () => release({ display: "x", summary: "y" }) };
}

test("the claim records the interval its heartbeat is written at", async () => {
  const { built, finish } = await holding();
  try {
    const claim = writesTo(built.record, resultPath(PORTAL, CLASS, USER, SLOW_KEY)).find((w) => w.status === "running");
    assert.equal(claim.heartbeat_seconds, HEARTBEAT_SECONDS);
    assert.deepEqual(built.record.timers.map((t) => t.ms), [HEARTBEAT_SECONDS * 1000]);
  } finally {
    finish();
  }
  await built.runner.loop;
});

test("each heartbeat merges only platform_id and server time into the running result", async () => {
  const { built, finish } = await holding();
  try {
    for (let i = 0; i < 3; i++) await tick(built);
    const beats = beatsIn(built.record);
    assert.equal(beats.length, 3);
    assert.deepEqual(beats[0], { platform_id: PLATFORM_ID, updated_at: SERVER_TIME });
    const doc = result(built.docs, SLOW);
    assert.equal(doc.status, "running");
    assert.equal(doc.stage, "run_package");
  } finally {
    finish();
  }
  await built.runner.loop;
});

test("a heartbeat is skipped while the last one is unsettled", async () => {
  const g = gate(isBeat);
  const { built, finish } = await holding({ wrapStore: g.wrap });
  await tick(built);
  await tick(built);
  assert.equal(g.held.length, 1, "no second beat while the first is in flight");
  g.held[0].release();
  await settle();
  await tick(built);
  assert.equal(g.held.length, 2, "beats resume once the last one settles");
  g.held[1].release();
  finish();
  await built.runner.loop;
});

test("the finish waits for a heartbeat in flight, and no heartbeat follows it", async () => {
  const g = gate(isBeat);
  const { built, finish } = await holding({ wrapStore: g.wrap });
  await tick(built);
  finish();
  await settle(10);
  assert.equal(result(built.docs, SLOW).status, "running", "done is not written while a beat is in flight");
  g.held[0].release();
  await built.runner.loop;
  assert.equal(result(built.docs, SLOW).status, "done");
  assert.ok(built.record.timers.every((t) => t.cancelled), "the timer stopped with the run");
  const writes = writesTo(built.record, resultPath(PORTAL, CLASS, USER, SLOW_KEY)).length;
  await tick(built);
  assert.equal(writesTo(built.record, resultPath(PORTAL, CLASS, USER, SLOW_KEY)).length, writes, "the timer stopped with the run");
});

test("the run's final write is awaited past the status bound, and nothing else is written until it settles", async (t) => {
  const g = gate((p, fields) => p.includes("/results/") && fields.status === "done");
  const { built, finish } = await holding({ wrapStore: g.wrap });
  const classStore = built.runner.currentRun.store;
  const runnerWrites = writesTo(built.record, runnerPath(PORTAL, USER)).length;
  const calls = built.fn.state.calls.length;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    finish();
    await settle(10);
    assert.equal(g.held.length, 1, "done was issued");
    t.mock.timers.tick(STATUS_WRITE_TIMEOUT_MS + 1000);
    await settle(10);
    assert.equal(writesTo(built.record, runnerPath(PORTAL, USER)).length, runnerWrites, "no runner-document write");
    assert.equal(built.fn.state.calls.length, calls, "no /work");
    assert.equal(classStore.closed, false, "the run's store stays open");
  } finally {
    t.mock.timers.reset();
  }
  g.held[0].release();
  await built.runner.loop;
  assert.equal(result(built.docs, SLOW).status, "done");
  assert.equal(classStore.closed, true);
  assert.equal(runnerDoc(built.docs).state, "ready");
});

test("a finish the store refuses is followed by a failure, awaited past the status bound the same way", async (t) => {
  const g = gate((p, fields) => p.includes("/results/") && fields.status === "failed");
  const { built, finish } = await holding({
    wrapStore: (store) => {
      g.wrap(store);
      const merge = store.merge;
      store.merge = (p, fields) => (p.includes("/results/") && fields.status === "done" ? Promise.reject(new Error("PERMISSION_DENIED")) : merge(p, fields));
      return store;
    }
  });
  const classStore = built.runner.currentRun.store;
  const runnerWrites = writesTo(built.record, runnerPath(PORTAL, USER)).length;
  const calls = built.fn.state.calls.length;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    finish();
    await settle(10);
    assert.equal(g.held.length, 1, "the failure was issued");
    t.mock.timers.tick(STATUS_WRITE_TIMEOUT_MS + 1000);
    await settle(10);
    assert.equal(writesTo(built.record, runnerPath(PORTAL, USER)).length, runnerWrites, "no runner-document write");
    assert.equal(built.fn.state.calls.length, calls, "no /work");
    assert.equal(classStore.closed, false, "the run's store stays open");
  } finally {
    t.mock.timers.reset();
  }
  g.held[0].release();
  await built.runner.loop;
  assert.equal(result(built.docs, SLOW).status, "failed");
  assert.match(result(built.docs, SLOW).error, /PERMISSION_DENIED/);
  assert.equal(classStore.closed, true);
});

test("a package that fails waits for a heartbeat in flight before its failure, and no heartbeat follows", async () => {
  const g = gate(isBeat);
  let fail;
  const built = build({ wrapStore: g.wrap, stepOverrides: { runPackage: () => new Promise((_, reject) => { fail = reject; }) } });
  built.fn.queue({ identity: SLOW });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => fail, "the package step");
  await tick(built);
  fail(new Error("package exited 1"));
  await settle(10);
  assert.equal(result(built.docs, SLOW).status, "running", "failed is not written while a beat is in flight");
  g.held[0].release();
  await built.runner.loop;
  assert.equal(result(built.docs, SLOW).status, "failed");
  assert.ok(built.record.timers.every((t) => t.cancelled), "the timer stopped with the run");
  const writes = writesTo(built.record, resultPath(PORTAL, CLASS, USER, SLOW_KEY)).length;
  await tick(built);
  assert.equal(writesTo(built.record, resultPath(PORTAL, CLASS, USER, SLOW_KEY)).length, writes, "the timer stopped with the run");
});

test("a heartbeat that fails is logged and the run still finishes", async () => {
  const { built, finish } = await holding({
    wrapStore: (store) => {
      const merge = store.merge.bind(store);
      store.merge = (p, fields) => (isBeat(p, fields) ? Promise.reject(new Error("UNAVAILABLE")) : merge(p, fields));
      return store;
    }
  });
  const lines = await captured(() => tick(built));
  assert.ok(lines.some((l) => l.event === "heartbeat.failed"));
  finish();
  await built.runner.loop;
  assert.equal(result(built.docs, SLOW).status, "done");
});

// The function keeps the last finished run on a re-queued result; it is not the runner's to touch.
test("previous survives the claim, the finish and a later failure", async () => {
  const previous = { summary: "last time", display: "# Last" };
  let runs = 0;
  let release;
  const built = build({
    stepOverrides: {
      runPackage: () => {
        runs += 1;
        if (runs === 1) return new Promise((r) => { release = r; });
        return Promise.reject(new Error("package exited 1"));
      }
    }
  });
  built.fn.queue({ identity: SLOW });
  const queued = () => built.docs.set(resultPath(PORTAL, CLASS, USER, SLOW_KEY), { status: "queued", platform_id: PLATFORM_ID, previous });
  queued();
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => release, "the package step");
  assert.deepEqual(result(built.docs, SLOW).previous, previous, "after the claim");
  release({ display: "x", summary: "y" });
  await built.runner.loop;
  assert.equal(result(built.docs, SLOW).status, "done");
  assert.deepEqual(result(built.docs, SLOW).previous, previous, "after the finish");
  queued();
  built.runner.resume();
  await built.runner.loop;
  assert.equal(result(built.docs, SLOW).status, "failed");
  assert.deepEqual(result(built.docs, SLOW).previous, previous, "after a failure");
});

// ---- the hooks -----------------------------------------------------------------

test("/suspend while idle writes suspending then suspended, leaving current_package and queue alone", async () => {
  const { runner, docs, record } = await started();
  await runner.loop;
  docs.set(runnerPath(PORTAL, USER), { ...runnerDoc(docs), queue: [{ class_hash: CLASS, package_key: "users__1__y" }] });
  await runner.suspend();
  const suspendWrites = writesTo(record, runnerPath(PORTAL, USER)).slice(-2);
  assert.deepEqual(suspendWrites.map((w) => w.state), ["suspending", "suspended"]);
  for (const w of suspendWrites) {
    assert.ok(!("current_package" in w) && !("queue" in w), "the hook does not write them, so they are kept");
  }
  assert.equal(runnerDoc(docs).current_package, null);
  assert.deepEqual(runnerDoc(docs).queue, [{ class_hash: CLASS, package_key: "users__1__y" }]);
});

test("/suspend mid-run names the outstanding run on both its writes", async () => {
  const { built, finish } = await holding();
  await built.runner.suspend();
  const suspendWrites = writesTo(built.record, runnerPath(PORTAL, USER)).slice(-2);
  assert.deepEqual(suspendWrites.map((w) => w.state), ["suspending", "suspended"]);
  for (const w of suspendWrites) assert.deepEqual(w.current_package, { class_hash: CLASS, package_key: SLOW_KEY });
  finish();
  await built.runner.loop;
});

// The watchdog reads a runner document naming an earlier package as a runner that has
// moved on, so a hook write names the run whatever the claim's own write did.
test("a hook write repairs a runner document the claim's write never reached", async () => {
  let failRunning = true;
  const { built, finish } = await holding({
    wrapStore: (store) => {
      const merge = store.merge.bind(store);
      store.merge = (p, fields) => (failRunning && p.includes("/runners/") && fields.state === "running" ? Promise.reject(new Error("UNAVAILABLE")) : merge(p, fields));
      return store;
    }
  });
  assert.equal(runnerDoc(built.docs).current_package, null, "the claim's runner-document write was lost");
  failRunning = false;
  await built.runner.suspend();
  assert.equal(runnerDoc(built.docs).state, "suspended");
  assert.deepEqual(runnerDoc(built.docs).current_package, { class_hash: CLASS, package_key: SLOW_KEY });
  finish();
  await built.runner.loop;
});

test("/suspend mid-run on an unverified flush names the outstanding run on its failed write", async () => {
  const { built, finish } = await holding();
  built.docs.set(runnerPath(PORTAL, USER), { ...runnerDoc(built.docs), current_package: null });
  const flush = built.runner.syncer.flushAndVerify;
  built.runner.syncer.flushAndVerify = async () => ({ ok: false, reason: "sync incomplete" });
  await assert.rejects(() => built.runner.suspend());
  assert.equal(runnerDoc(built.docs).state, "failed");
  const failedWrite = writesTo(built.record, runnerPath(PORTAL, USER)).at(-1);
  assert.equal(failedWrite.state, "failed");
  assert.deepEqual(failedWrite.current_package, { class_hash: CLASS, package_key: SLOW_KEY });
  built.runner.syncer.flushAndVerify = flush;
  finish();
  await built.runner.loop;
});

test("a claim that lands while /suspend runs still runs its package", async () => {
  const g = gate((p, fields) => p.includes("/results/") && fields.status === "running");
  const built = build({ wrapStore: g.wrap });
  built.fn.queue({ identity: SLOW });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => g.held.length, "the claim's write");
  let flushed;
  const flush = built.runner.syncer.flushAndVerify;
  built.runner.syncer.flushAndVerify = () => new Promise((r) => { flushed = r; });
  const suspending = built.runner.suspend();
  await until(() => flushed, "the suspend's flush");
  g.held[0].release();
  await until(() => built.record.prepared.length, "the package's preparation");
  built.runner.syncer.flushAndVerify = flush;
  flushed({ ok: true });
  await suspending;
  built.runner.resume();
  await built.runner.loop;
  assert.equal(result(built.docs, SLOW).status, "done");
});

// A resume while the old loop is still signing in has started a new loop, whose stores
// the old loop's late adoption must leave in place.
test("an adoption a resume has overtaken closes its own stores, not the new loop's", async () => {
  let signIns = 0;
  let releaseOld;
  const built = build({
    wrapStore: (store) => {
      const signIn = store.signIn.bind(store);
      store.signIn = async (token) => {
        signIns += 1;
        if (signIns === 3) await new Promise((r) => { releaseOld = r; });
        return signIn(token);
      };
      return store;
    }
  });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => releaseOld, "the old loop's sign-in");
  const oldLoop = built.runner.loop;
  built.runner.resume();
  await until(() => signIns >= 4, "the new loop's sign-in");
  await settle(10);
  const lateSession = built.record.stores[2];
  releaseOld();
  await oldLoop;
  assert.equal(lateSession.closed, true, "the late adoption's own store is closed");
  assert.notEqual(built.runner.status.store, lateSession, "the new loop's session stays the runner's");
  assert.equal(built.runner.status.store.closed, false);
  await built.runner.loop;
});

test("a VM whose suspend was refused goes on taking work without a resume", async () => {
  const { runner, fn, docs } = await started();
  await runner.loop;
  const flush = runner.syncer.flushAndVerify;
  runner.syncer.flushAndVerify = async () => ({ ok: false, reason: "sync incomplete" });
  await assert.rejects(() => runner.suspend());
  runner.syncer.flushAndVerify = flush;
  fn.queue({ identity: "users/1/after" });
  let stateDuringRun = null;
  const steps = runner.steps;
  const runPackage = steps.runPackage;
  steps.runPackage = async (args) => { stateDuringRun = runner.state; return runPackage(args); };
  await runner.loop;
  assert.equal(result(docs, "users/1/after").status, "done");
  assert.equal(stateDuringRun, "running", "the VM reads running during the run");
  assert.equal(runnerDoc(docs).state, "ready", "the runner document is back in service once drained");
  assert.notEqual(runner.state, "failed");
});

test("a VM whose suspend was refused, with nothing to do, reads ready again", async () => {
  const { runner, docs } = await started();
  await runner.loop;
  const flush = runner.syncer.flushAndVerify;
  runner.syncer.flushAndVerify = async () => ({ ok: false, reason: "sync incomplete" });
  await assert.rejects(() => runner.suspend());
  assert.equal(runnerDoc(docs).state, "failed");
  runner.syncer.flushAndVerify = flush;
  await runner.loop;
  assert.equal(runnerDoc(docs).state, "ready");
  assert.equal(runnerDoc(docs).error, null, "the refused suspend's reason is cleared");
});

test("a failed terminate after a failed suspend still writes the runner document failed", async () => {
  const { built, finish } = await holding();
  try {
    built.runner.syncer.flushAndVerify = async () => ({ ok: false, reason: "sync incomplete: 1 file(s) still outstanding" });
    await assert.rejects(() => built.runner.suspend());
    built.docs.set(runnerPath(PORTAL, USER), { ...runnerDoc(built.docs), state: "suspending", current_package: null });
    await assert.rejects(() => built.runner.terminate(), (err) => err instanceof HookError && /sync incomplete/.test(err.message));
    assert.equal(runnerDoc(built.docs).state, "failed");
    assert.deepEqual(runnerDoc(built.docs).current_package, { class_hash: CLASS, package_key: SLOW_KEY });
  } finally {
    finish();
  }
});

test("a denied PutObject leaves failed, never suspended, and fails the hook", async () => {
  const { runner, docs, record } = await started();
  await runner.loop;
  runner.syncer.backend = { put: async () => { throw new Error("AccessDenied: PutObject"); } };
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(runner.env.dataRoot, { recursive: true });
  await writeFile(path.join(runner.env.dataRoot, "answers.v1.jsonl"), "data");

  await assert.rejects(() => runner.suspend(), (err) => err instanceof HookError && err.status === 500 && /AccessDenied/.test(err.message));
  const states = writesTo(record, runnerPath(PORTAL, USER)).map((w) => w.state).filter(Boolean);
  assert.deepEqual(states.slice(-2), ["suspending", "failed"]);
  assert.match(runnerDoc(docs).error, /AccessDenied/);
});

test("/resume writes nothing and answers at once, and the next /work forces a fresh ID token", async () => {
  const { runner, record, fn } = await started();
  await runner.loop;
  await runner.suspend();
  const writesBefore = record.stores.reduce((n, s) => n + s.writes.length, 0);
  const idTokens = [];
  for (const store of record.stores) {
    const orig = store.idToken.bind(store);
    store.idToken = async (force) => { idTokens.push(force); return orig(force); };
  }
  const answer = runner.resume();
  assert.equal(answer instanceof Promise, false, "no await in the hook");
  assert.equal(record.stores.reduce((n, s) => n + s.writes.length, 0), writesBefore, "nothing written by the hook");
  await runner.loop;
  assert.equal(idTokens[0], true, "the first call after a resume refreshes the ID token");
  assert.ok(fn.routes().length > 0);
});

test("a resume after a suspend logs no missing suspend", async () => {
  const { runner } = await started();
  await runner.loop;
  await runner.suspend();
  const lines = await captured(async () => {
    runner.resume();
    await runner.loop;
  });
  assert.ok(lines.length > 0, "the resumed loop logged");
  assert.ok(!lines.some((l) => l.event === "lifecycle.resume_without_suspend"));
});

test("a loop a resume overtook during its credential fetch does not start the syncer", async () => {
  const { runner } = await started();
  await runner.loop;
  const pending = [];
  runner.storage = { markStale() {}, client: () => new Promise((r) => pending.push(r)) };
  let starts = 0;
  const start = runner.syncer.start.bind(runner.syncer);
  runner.syncer.start = () => { starts += 1; return start(); };
  await runner.suspend();
  runner.resume();
  await until(() => pending.length === 1, "the first loop's fetch");
  runner.resume();
  await until(() => pending.length === 2, "the second loop's fetch");
  pending[0]();
  await settle(10);
  assert.equal(starts, 0, "the stood-down loop starts nothing");
  pending[1]();
  await runner.loop;
  assert.equal(starts, 1);
});

test("a ready write in flight across a suspend and resume leaves the new loop to write ready", async () => {
  let held = null;
  let readies = 0;
  const built = build({
    wrapStore: (store) => {
      const merge = store.merge.bind(store);
      store.merge = (p, fields) => {
        // The write lands at once; only its answer is late.
        if (p.includes("/runners/") && fields.state === "ready" && fields.current_package === null && ++readies === 1) {
          return merge(p, fields).then(() => new Promise((r) => { held = r; }));
        }
        return merge(p, fields);
      };
      return store;
    }
  });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => held, "the drained ready write");
  const oldLoop = built.runner.loop;
  await built.runner.suspend();
  built.runner.resume();
  held();
  await oldLoop;
  await built.runner.loop;
  assert.equal(runnerDoc(built.docs).state, "ready", "the new loop wrote ready over suspended");
});

test("report-server's yes is asked again after a resume", async () => {
  const built = build();
  built.docs.set(classPath(PORTAL, CLASS), { platform_id: PLATFORM_ID, assignment_urls: ["https://a/x"], interactive_urls: [] });
  built.fn.queue({ identity: "users/1/ap" });
  built.record.manifests["users/1/ap"] = manifestFor("users/1/ap", { urls: { any: ["*x*"] } });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.equal(built.record.applies.length, 1);
  await built.runner.suspend();
  requeue(built, "users/1/ap");
  built.runner.resume();
  await built.runner.loop;
  assert.equal(built.record.applies.length, 2);
});

test("the syncer stops at a resume until the new loop has fetched credentials", async () => {
  const { runner } = await started();
  await runner.loop;
  const events = [];
  let release;
  runner.storage = { markStale() {}, client: () => { events.push("client"); return new Promise((r) => { release = () => { events.push("fetched"); r(); }; }); } };
  const stop = runner.syncer.stop.bind(runner.syncer);
  const start = runner.syncer.start.bind(runner.syncer);
  runner.syncer.stop = () => { events.push("stop"); return stop(); };
  runner.syncer.start = () => { events.push("start"); return start(); };
  runner.resume();
  await until(() => release, "the post-resume fetch");
  release();
  await runner.loop;
  assert.ok(events.indexOf("stop") >= 0 && events.indexOf("stop") < events.indexOf("client"), "stopped before the fetch");
  assert.ok(events.indexOf("start") > events.indexOf("fetched"), "started only after it");
});

// The package the suspend interrupted finishes, through the store it was claimed with,
// before the resumed loop claims anything else.
test("a resume finishes the interrupted package before claiming the next", async () => {
  let release;
  const built = build({ stepOverrides: { runPackage: () => (release ? Promise.resolve({ display: "x", summary: "y" }) : new Promise((r) => { release = () => r({ display: "x", summary: "y" }); })) } });
  built.fn.queue({ identity: SLOW });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => release, "the package step");
  const finish = () => release();
  const runStore = built.runner.currentRun.store;
  await built.runner.suspend();
  built.fn.queue({ identity: "users/1/next" });
  built.runner.resume();
  await settle(20);
  assert.equal(built.record.prepared.length, 1, "nothing else is prepared while it runs");
  assert.equal(result(built.docs, "users/1/next").status, "queued");
  assert.equal(runStore.closed, false, "its class store stays open");
  finish();
  await built.runner.loop;
  assert.equal(result(built.docs, SLOW).status, "done");
  assert.equal(result(built.docs, "users/1/next").status, "done");
});

test("the syncer is stopped before /suspend's and /terminate's flushes", async () => {
  for (const hook of ["suspend", "terminate"]) {
    const { runner } = await started();
    await runner.loop;
    const events = [];
    const stop = runner.syncer.stop.bind(runner.syncer);
    const flush = runner.syncer.flushAndVerify.bind(runner.syncer);
    runner.syncer.stop = () => { events.push("stop"); return stop(); };
    runner.syncer.flushAndVerify = (h) => { events.push(`flush:${h}`); return flush(h); };
    await runner[hook]();
    assert.ok(events.indexOf("stop") >= 0 && events.indexOf("stop") < events.indexOf(`flush:${hook}`), hook);
  }
});

test("an ID token that never comes is given up on at its bound", async (t) => {
  const { runner, fn } = await started();
  await runner.loop;
  await runner.suspend();
  for (const store of [runner.status.store]) store.idToken = () => new Promise(() => {});
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const lines = await captured(async () => {
      runner.resume();
      await settle(10);
      const calls = fn.state.calls.length;
      t.mock.timers.tick(TOKEN_TIMEOUT_MS + 1000);
      await settle(10);
      assert.equal(fn.state.calls.length, calls, "no /work without a token");
      runner.terminate().catch(() => {});
      await settle(10);
    });
    assert.ok(lines.some((l) => l.event === "work.failed" && /an ID token did not finish/.test(l.error)));
  } finally {
    t.mock.timers.reset();
  }
});

test("each resume with no suspend before it is logged, not only the first", async () => {
  const { runner } = await started();
  await runner.loop;
  await runner.suspend();
  runner.resume();
  await runner.loop;
  const lines = await captured(async () => {
    runner.resume();
    await runner.loop;
  });
  assert.ok(lines.some((l) => l.event === "lifecycle.resume_without_suspend"));
});

test("/resume itself marks the storage credentials stale, before the loop runs", async () => {
  const { runner } = await started();
  await runner.loop;
  let marked = 0;
  runner.storage = { markStale() { marked += 1; }, client: async () => {} };
  await runner.suspend();
  runner.resume();
  assert.equal(marked, 1, "marked by the hook, synchronously");
  await runner.loop;
});

test("a resume with no suspend since the last activity is logged", async () => {
  const lines = [];
  const original = process.stdout.write;
  const { runner } = await started();
  await runner.loop;
  process.stdout.write = (chunk) => { lines.push(String(chunk)); return true; };
  try {
    runner.resume();
  } finally {
    process.stdout.write = original;
  }
  await runner.loop;
  assert.ok(lines.some((l) => l.includes("lifecycle.resume_without_suspend")));
});

// The watchdog fails a lost run with the same words, so the two read as one reason.
test("the lost-run reason is the watchdog's, word for word", () => {
  assert.equal(LOST_RUN_REASON, "The machine running it stopped before the run finished; run it again.");
});

test("/terminate during a run fails the result first, revokes, flushes and terminates", async () => {
  const { built, finish } = await holding();
  try {
    built.docs.set(runnerPath(PORTAL, USER), { ...runnerDoc(built.docs), current_package: null });
    await built.runner.terminate();
    assert.equal(built.runner.state, "terminated");
    const doc = result(built.docs, SLOW);
    assert.equal(doc.status, "failed");
    assert.equal(doc.error, LOST_RUN_REASON);
    assert.equal(built.record.revoked[0].token, "forwarded-report-server-token");
    assert.equal(runnerDoc(built.docs).state, "terminated");
    assert.deepEqual(runnerDoc(built.docs).current_package, { class_hash: CLASS, package_key: SLOW_KEY });
    const writes = writesTo(built.record, resultPath(PORTAL, CLASS, USER, SLOW_KEY)).length;
    await tick(built);
    assert.equal(writesTo(built.record, resultPath(PORTAL, CLASS, USER, SLOW_KEY)).length, writes, "no heartbeat after the hook");
  } finally {
    // The run's own bound is its declared duration plus ten minutes; let it end.
    finish();
  }
});

test("/terminate's failure write is bounded, so a hung write does not keep the hook from revoking and flushing", async (t) => {
  const g = gate((p, fields) => p.includes("/results/") && fields.error === LOST_RUN_REASON);
  const { built, finish } = await holding({ wrapStore: g.wrap });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let ended = false;
  try {
    const terminating = built.runner.terminate().then(() => { ended = true; });
    await until(() => g.held.length, "the failure write");
    t.mock.timers.tick(STATUS_WRITE_TIMEOUT_MS + 1000);
    await until(() => ended, "the hook's end");
    await terminating;
    assert.equal(built.record.revoked.length, 1);
    assert.equal(runnerDoc(built.docs).state, "terminated");
  } finally {
    t.mock.timers.reset();
    g.open();
    finish();
  }
});

test("/terminate after an unverified flush names the outstanding run on its failed write", async () => {
  const { built, finish } = await holding();
  try {
    built.docs.set(runnerPath(PORTAL, USER), { ...runnerDoc(built.docs), current_package: null });
    built.runner.syncer.flushAndVerify = async () => ({ ok: false, reason: "sync incomplete" });
    await assert.rejects(() => built.runner.terminate());
    assert.equal(runnerDoc(built.docs).state, "failed");
    assert.deepEqual(runnerDoc(built.docs).current_package, { class_hash: CLASS, package_key: SLOW_KEY });
  } finally {
    finish();
  }
});

test("a claim that lands after /terminate has finished writes and runs nothing more", async () => {
  const g = gate((p, fields) => p.includes("/results/") && fields.status === "running");
  const built = build({ wrapStore: g.wrap });
  built.fn.queue({ identity: SLOW });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => g.held.length, "the claim's write");
  await built.runner.terminate();
  built.docs.set(runnerPath(PORTAL, USER), { ...runnerDoc(built.docs), microvm_id: "mvm-2", state: "starting" });
  g.held[0].release();
  await settle(20);
  assert.equal(runnerDoc(built.docs).state, "starting", "the newer VM's document is left alone");
  assert.equal(built.record.prepared.length, 0, "the package is not prepared");
  assert.equal(built.record.timers.length, 0);
});

test("/terminate during the claim's runner-document write starts no heartbeat", async () => {
  const g = gate((p, fields) => p.includes("/runners/") && fields.state === "running");
  const built = build({ wrapStore: g.wrap, stepOverrides: { runPackage: () => new Promise(() => {}) } });
  built.fn.queue({ identity: SLOW });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => g.held.length, "the claim's runner-document write");
  await built.runner.terminate();
  g.open();
  await settle(20);
  assert.equal(built.record.timers.length, 0, "no heartbeat once the VM is terminating");
  assert.equal(built.record.prepared.length, 0, "the package is not prepared");
});

test("currentPackage names the outstanding run, and null with none", async () => {
  const { built, finish } = await holding();
  assert.deepEqual(built.runner.currentPackage, { class_hash: CLASS, package_key: SLOW_KEY });
  finish();
  await built.runner.loop;
  assert.equal(built.runner.currentPackage, null);
});

test("a revocation that never answers does not hold /terminate past its bound", async (t) => {
  const { runner, docs } = await started({ revoke: () => new Promise(() => {}) });
  await runner.loop;
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let ended = false;
  try {
    const lines = await captured(async () => {
      const terminating = runner.terminate().then(() => { ended = true; });
      await settle(10);
      t.mock.timers.tick(REVOKE_TIMEOUT_MS + 1000);
      await until(() => ended, "the hook's end");
      await terminating;
    });
    assert.equal(runnerDoc(docs).state, "terminated");
    assert.ok(lines.some((l) => l.event === "report_server.refused" && l.call === "revoke"));
  } finally {
    t.mock.timers.reset();
  }
});

test("/terminate leaves a runner document that records another VM", async () => {
  for (const flushed of [true, false]) {
    const { built, finish } = await holding();
    try {
      built.docs.set(runnerPath(PORTAL, USER), { ...runnerDoc(built.docs), microvm_id: "mvm-2", state: "starting" });
      if (!flushed) built.runner.syncer.flushAndVerify = async () => ({ ok: false, reason: "sync incomplete" });
      const lines = await captured(() => built.runner.terminate().catch(() => {}));
      assert.equal(runnerDoc(built.docs).microvm_id, "mvm-2");
      assert.equal(runnerDoc(built.docs).state, "starting", flushed ? "not terminated" : "not failed");
      assert.ok(lines.some((l) => l.event === "terminate.runner_doc_skipped"));
    } finally {
      finish();
    }
  }
});

test("a claim that lands while /terminate is under way starts no heartbeat", async () => {
  const g = gate((p, fields) => p.includes("/results/") && fields.status === "running");
  let revoked;
  const built = build({
    wrapStore: g.wrap,
    revoke: () => new Promise((r) => { revoked = r; }),
    stepOverrides: { runPackage: () => new Promise(() => {}) }
  });
  built.fn.queue({ identity: SLOW });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => g.held.length, "the claim's write");
  const terminating = built.runner.terminate();
  await until(() => revoked, "the revocation");
  g.held[0].release();
  await settle(20);
  revoked();
  await terminating;
  assert.equal(runnerDoc(built.docs).state, "terminated");
  assert.ok(!writesTo(built.record, runnerPath(PORTAL, USER)).some((w) => w.state === "running"), "no running write once the VM is terminating");
  assert.equal(built.record.timers.length, 0, "no heartbeat starts once the VM is terminating");
});

test("a run that finishes after /terminate leaves the hook's failure as the last word", async () => {
  const { built, finish } = await holding();
  await built.runner.terminate();
  finish();
  await settle(20);
  assert.equal(result(built.docs, SLOW).status, "failed");
  assert.equal(result(built.docs, SLOW).error, LOST_RUN_REASON);
  assert.equal(built.docs.get(scopePath(PORTAL, CLASS, USER)), undefined, "no counts written after the hook");
});

test("a run that fails after /terminate leaves the hook's failure as the last word", async () => {
  let fail;
  const built = build({ stepOverrides: { runPackage: () => new Promise((_, reject) => { fail = reject; }) } });
  built.fn.queue({ identity: SLOW });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => fail, "the package step");
  await built.runner.terminate();
  fail(new Error("package exited 1"));
  await settle(20);
  assert.equal(result(built.docs, SLOW).error, LOST_RUN_REASON);
});

test("a /terminate during the finished run's counts write leaves the hook's failure as the last word", async () => {
  const held = [];
  const { built, finish } = await holding({
    wrapStore: (store) => {
      const replaceFields = store.replaceFields.bind(store);
      store.replaceFields = (p, fields) => new Promise((resolve, reject) => held.push(() => replaceFields(p, fields).then(resolve, reject)));
      return store;
    }
  });
  finish();
  await until(() => held.length, "the counts write");
  await built.runner.terminate();
  assert.equal(result(built.docs, SLOW).error, LOST_RUN_REASON);
  held[0]();
  await settle(20);
  assert.equal(result(built.docs, SLOW).status, "failed");
  assert.equal(result(built.docs, SLOW).error, LOST_RUN_REASON);
});

test("a /terminate during a failed run's beat leaves the hook's failure as the last word", async () => {
  let fail;
  const g = gate((p, fields) => p.includes("/results/") && Object.keys(fields).every((k) => ["platform_id", "updated_at"].includes(k)));
  const built = build({ wrapStore: g.wrap, stepOverrides: { runPackage: () => new Promise((_, reject) => { fail = reject; }) } });
  built.fn.queue({ identity: SLOW });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await until(() => fail, "the package step");
  await tick(built);
  assert.equal(g.held.length, 1, "a beat is in flight");
  fail(new Error("package exited 1"));
  await settle(20);
  await built.runner.terminate();
  g.held[0].release();
  await settle(20);
  assert.equal(result(built.docs, SLOW).status, "failed");
  assert.equal(result(built.docs, SLOW).error, LOST_RUN_REASON);
});

test("a refused revocation does not fail the terminate hook", async () => {
  const { runner } = await started({ revoke: async () => { throw new Error("report-server down"); } });
  await runner.loop;
  await assert.doesNotReject(() => runner.terminate());
  assert.equal(runner.state, "terminated");
});

// Losing the VM is strictly worse than a status document that lags.
test("a status write that fails does not fail the hook, and the next write reports it redacted", async () => {
  const docs = new Map();
  let fail = false;
  const built = build({
    makeStore: () => {
      const store = new MemoryStore({ docs });
      const merge = store.merge.bind(store);
      store.merge = async (p, fields) => { if (fail && p.includes("/runners/")) throw new Error("UNAVAILABLE for Bearer abc.def.ghi"); return merge(p, fields); };
      return store;
    }
  });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  fail = true;
  await assert.doesNotReject(() => built.runner.suspend());
  fail = false;
  built.runner.resume();
  await built.runner.loop;
  const failures = docs.get(runnerPath(PORTAL, USER)).status_write_failures;
  assert.ok(failures?.length >= 1, "the next successful write carries the failures");
  assert.equal(failures[0].hook, "suspend");
  assert.match(failures[0].error, /Bearer \[redacted\]/);
});

test("hooks before /run are refused rather than writing a doc for nobody", async () => {
  const { runner, record } = build();
  for (const call of [() => runner.suspend(), () => runner.resume(), () => runner.terminate()]) {
    await assert.rejects(async () => call(), (err) => err instanceof HookError && err.status === 409);
  }
  assert.equal(record.stores.length, 0, "no store is built before /run");
});

// ---- S3 on the broker's credentials only --------------------------------------

// The pull-down is the first S3 call, and it goes through credentials fetched from the
// function with the session's ID token.
test("in S3 mode /run fetches the broker's credentials before its first S3 call", async () => {
  const docs = new Map();
  const events = [];
  const fn = fakeFunction(docs);
  const call = fn.makeFunctionClient();
  const env = { ...loadEnv({ SYNC_BACKEND: "S3" }), dataRoot: path.join(work, "data"), workRoot: path.join(work, "work") };
  const fakeClient = { send: async (command) => { events.push(command.constructor.name); return { Contents: [] }; } };
  const runner = new Runner({
    env,
    makeStore: () => new MemoryStore({ docs }),
    makeFunctionClient: () => async (route, args) => {
      events.push(route);
      if (route === "storage-credentials") {
        events.push(`id-token:${args.idToken}`);
        return { success: true, access_key_id: "ASIAX", secret_access_key: "s", session_token: "t", expiration: new Date(Date.now() + 3600e3).toISOString(), bucket: "researcher-dashboard-runner-staging", prefix: `researchers/${USER}/`, region: "us-east-1" };
      }
      return call(route, args);
    },
    makeStorage: ({ bucket, prefix, fetchCredentials }) => new StorageCredentials({ bucket, prefix, fetchCredentials, makeClient: (creds) => { events.push(`client:${creds.accessKeyId}`); return fakeClient; } }),
    makeSyncer: ({ bucket, prefix, root, storage }) => new Syncer({ root, backend: new S3Backend({ bucket, prefix, client: () => storage.client() }) }),
    makePackageBackend: () => ({ async get() {} }),
    unzip: async () => {},
    netGuard: async () => ({}),
    steps: steps({ resolved: [], prepared: [], manifests: {} }),
    sleep: async () => {},
    now: (() => { let t = Date.now(); return () => (t += 60_000); })(),
    processEnv: disableDefaultCredentialChain({ AWS_ACCESS_KEY_ID: "AKIA-EXECUTION-ROLE" })
  });
  const lines = await captured(async () => {
    await runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  });
  runner.terminate().catch(() => {});
  const first = events.indexOf("ListObjectsV2Command");
  assert.ok(first > 0);
  assert.equal(events[0], "storage-credentials", "no other call to the function comes first");
  assert.equal(events[1], `id-token:id-token-for:${JSON.parse(PAYLOAD).session_token}`, "it carries the session's ID token");
  assert.ok(events.indexOf("storage-credentials") < first && events.indexOf("client:ASIAX") < first);
  // Each VM's log says the default chain is off, with the VM's id on the line.
  assert.equal(lines.find((l) => l.event === "aws.default_chain_disabled")?.microvm_id, "mvm-1");
});

test("DIR mode declines to revoke the report-server credential", async () => {
  let called = false;
  const env = loadEnv({ SYNC_BACKEND: "DIR", SYNC_DIR: path.join(work, "remote") });
  const runner = buildRunner(env);
  await runner.revokeReportServerToken({
    baseUrl: "https://report-server.example.org",
    token: "the-developers-own-token",
    fetchImpl: async () => { called = true; return { ok: true }; }
  });
  assert.equal(called, false);
});

// Both modes fetch from packages/<identity>/<version>.zip.
test("packages are fetched from packages/<identity>/<version>.zip with the broker's client", async () => {
  const runner = buildRunner(loadEnv({ SYNC_BACKEND: "S3" }));
  const sent = [];
  const storage = { client: async () => ({ send: async (cmd) => { sent.push(cmd.input); throw new Error("stop"); } }) };
  const backend = runner.makePackageBackend({ bucket: "researcher-dashboard-runner-staging", storage });
  await assert.rejects(() => backend.get(packageKey("users/136/class-counts", "1.0.6"), path.join(work, "a.zip")), /stop/);
  assert.deepEqual(sent, [{ Bucket: "researcher-dashboard-runner-staging", Key: "packages/users/136/class-counts/1.0.6.zip" }]);
});

test("DIR mode fetches packages from <SYNC_DIR>/packages/<identity>", async () => {
  const syncDir = path.join(work, "remote");
  mkdirSync(path.join(syncDir, "packages", "users", "136", "class-counts"), { recursive: true });
  writeFileSync(path.join(syncDir, "packages", "users", "136", "class-counts", "1.0.6.zip"), "archive-bytes");
  const runner = buildRunner(loadEnv({ SYNC_BACKEND: "DIR", SYNC_DIR: syncDir }));
  const dest = path.join(work, "fetched.zip");
  await runner.makePackageBackend({ bucket: "local" }).get(packageKey("users/136/class-counts", "1.0.6"), dest);
  assert.equal(readFileSync(dest, "utf8"), "archive-bytes");
});

// ---- the logs --------------------------------------------------------------------

async function captured(fn) {
  const lines = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { lines.push(String(chunk)); return true; };
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return lines.flatMap((l) => l.split("\n")).filter(Boolean).map((l) => JSON.parse(l));
}

test("every line of a run names the researcher, the VM, the scope and the package, and none after it", async () => {
  const built = build();
  built.fn.queue({ identity: "users/136/class-counts" });
  const lines = await captured(async () => {
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await built.runner.loop;
  });
  const during = lines.filter((l) => l.event.startsWith("package."));
  assert.ok(during.length >= 3, "the stage lines of the run");
  for (const line of during) {
    assert.equal(line.researcher, USER, line.event);
    assert.equal(line.microvm_id, "mvm-1", line.event);
    assert.equal(line.scope, CLASS, line.event);
    assert.equal(line.package, "users/136/class-counts", line.event);
  }
  const after = lines.filter((l) => l.event === "idle.suspended");
  assert.equal(after.length, 1);
  assert.equal(after[0].scope, null);
  assert.equal(after[0].package, null);
  assert.equal(after[0].researcher, USER);
});

// The names a log-based metric would count, one per failure the runner reports.
test("each failure the runner reports is logged under its stable event name", async () => {
  // The stores share the document tree the fake function reads, set once it exists.
  let docs;
  let failWrites = false;
  const built = build({
    stepOverrides: { runPackage: async () => { throw new Error("package exited 1"); } },
    revoke: async () => { throw new Error("report-server answered 500"); },
    makeStore: () => {
      const store = new MemoryStore({ docs });
      const merge = store.merge.bind(store);
      store.merge = async (p, fields) => { if (failWrites && p.includes("/runners/")) throw new Error("UNAVAILABLE"); return merge(p, fields); };
      return store;
    }
  });
  docs = built.docs;
  built.fn.queue({ identity: "users/1/broken" });
  const lines = await captured(async () => {
    await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
    await built.runner.loop;
    failWrites = true;
    built.runner.syncer.flushAndVerify = async () => ({ ok: false, reason: "sync incomplete: 1 file(s) still outstanding" });
    await built.runner.suspend().catch(() => {});
    await built.runner.terminate().catch(() => {});
  });
  const events = new Set(lines.map((l) => l.event));
  for (const name of ["package.failed", "status.write_failed", "sync.failed", "report_server.refused"]) {
    assert.ok(events.has(name), `${name} is logged`);
  }
  assert.ok(lines.some((l) => l.event === "report_server.refused" && l.call === "revoke"), "the revocation names its call");
});
