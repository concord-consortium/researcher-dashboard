import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { disableDefaultCredentialChain, loadEnv } from "../server/config.js";
import { makeSteps } from "../server/steps.js";
import { HookError, Runner } from "../server/runner.js";
import { buildRunner } from "../server/index.js";
import { packageDocId, packageKey } from "../server/package-fetch.js";
import { MemoryStore, SERVER_TIME, classPath, resultPath, runnerPath, scopePath } from "../server/status.js";
import { StorageCredentials } from "../server/storage.js";
import { ReportServerError } from "../server/report-server.js";
import { DirBackend, S3Backend, Syncer } from "../server/sync/index.js";

const PORTAL = "learn_portal_staging_concord_org";
const USER = "439";
const CLASS = "7be899cf".repeat(6);
const OTHER_CLASS = "64727df0".repeat(6);
const PLATFORM_ID = "https://learn.portal.staging.concord.org";
const PROJECT = "report-service-dev";
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
    pullData: async (args) => { record.pulled.push(args); return { clue_documents: 12 }; },
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
    heldClasses: makeSteps().heldClasses,
    ...overrides
  };
}

// A runner wired to in-memory stores, a directory for S3 and the fake function. The clock
// is advanced by `sleep`, so the idle period passes without waiting.
function build({ stepOverrides = {}, envOverrides = {}, makeStore, revoke, applies, clock = { t: Date.parse("2026-09-26T12:00:00Z") } } = {}) {
  const docs = new Map();
  const fn = fakeFunction(docs);
  const record = { resolved: [], pulled: [], prepared: [], stores: [], manifests: {}, sleeps: [], revoked: [], applies: [] };
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
      return store;
    }),
    makeFunctionClient: fn.makeFunctionClient,
    makeSyncer: ({ root }) => new Syncer({ backend: new DirBackend(path.join(work, "remote")), root }),
    makePackageBackend: () => ({ async get() {} }),
    unzip: async () => {},
    netGuard: async () => ({ uid: 1000 }),
    revokeReportServerToken: revoke ?? (async (args) => { record.revoked.push(args); }),
    // report-server's answer is the test's to set; the matcher is report-server's.
    askAppliesRoute: async (args) => { record.applies.push(args); return applies ? applies(args) : { applies: true, reason: null }; },
    steps: steps(record, stepOverrides),
    now: () => clock.t,
    sleep: async (ms) => { record.sleeps.push(ms); clock.t += ms; await new Promise((r) => setImmediate(r)); }
  });
  return { runner, fn, docs, record, clock, env };
}

const runnerDoc = (docs) => docs.get(runnerPath(PORTAL, USER));
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

// The check the deleted refresh endpoint made, moved to /run and every adopted token: the S3 prefix is
// built from platform_user_id, so a token for someone else must never be used.
test("/run refuses a session token that names another researcher", async () => {
  const { runner } = build();
  const other = JSON.stringify({ ...JSON.parse(PAYLOAD), session_token: sessionToken({ platform_user_id: 999 }) });
  await assert.rejects(() => runner.run({ microvmId: "mvm-1", runHookPayload: other }), /names researcher 999/);
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
  assert.equal(scopeDoc.data.clue_documents, 12);
  assert.equal(scopeDoc.data.last_pull_at, SERVER_TIME);
  assert.equal(scopeDoc.data.log_freshness_at, "2026-08-26T00:00:00.000Z");
  assert.equal(scopeDoc.data.learners, undefined);
  assert.equal(docs.has(classPath(PORTAL, CLASS)), false, "nothing per researcher on the class's own document");
});

// A package that reports only some counts must not inherit another run's others.
test("the counts replace the scope document's last counts rather than merging into them", async () => {
  const built = build({ stepOverrides: { pullData: async () => ({}), readPackageCounts: async () => ({ answers: 3 }) } });
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

test("the package is handed its scope, its dataset's catalog id and the CLUE source", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts", catalogId: 77 });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;

  const prepared = built.record.prepared[0];
  assert.equal(prepared.catalogId, 77);
  assert.equal(prepared.clueSource, "firebase");
  assert.deepEqual(prepared.scope, scopeBlock(CLASS));
  assert.equal(prepared.docId, "users__1__counts");
  assert.equal(built.record.pulled[0].firebaseProject, PROJECT);
  assert.ok(built.record.pulled[0].classTokens[CLUE_ROW], "the CLUE class token reaches the pre-pull");
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

test("a package declaring patterns on a class with no profile is refused", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/ap" });
  built.record.manifests["users/1/ap"] = manifestFor("users/1/ap", { urls: { none: ["*secret*"] } });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.match(result(built.docs, "users/1/ap").error, /profile has not been derived/);
});

// Done when: a manifest declaring ten hours is refused.
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
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;

  assert.equal(result(built.docs, "users/1/first").status, "done");
  const second = result(built.docs, "users/1/second");
  assert.equal(second.status, "failed");
  assert.match(second.error, /VM window exhausted: 12300s left, and this package and the ones before it declare 14000s/);
  assert.ok(!writesTo(built.record, resultPath(PORTAL, CLASS, USER, "users__1__second")).some((w) => w.status === "running"));
});

test("a package that outruns its bound fails rather than hanging", async () => {
  const built = build({ envOverrides: { packageTimeoutMs: 20 }, stepOverrides: { runPackage: () => new Promise(() => {}) } });
  built.fn.queue({ identity: "users/1/hang" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const doc = result(built.docs, "users/1/hang");
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /ran past its/);
  assert.equal(built.runner.state, "ready");
});

test("a failed package fails its document, is redacted, and the VM goes back to ready", async () => {
  const built = build({ stepOverrides: { runPackage: async () => { throw new Error("package exited 1: Bearer abc.def.ghi"); } } });
  built.fn.queue({ identity: "users/1/broken" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const doc = result(built.docs, "users/1/broken");
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /package exited 1: Bearer \[redacted\]/);
  assert.equal(built.runner.state, "ready");
});

test("an archive that cannot be fetched is refused as missing or not readable", async () => {
  const built = build({ stepOverrides: { resolvePackage: async () => { throw new Error("packages/users/1/gone/1.0.0.zip is missing or not readable"); } } });
  built.fn.queue({ identity: "users/1/gone" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  assert.match(result(built.docs, "users/1/gone").error, /missing or not readable/);
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

test("a /work answer whose session token names another researcher is not adopted", async () => {
  const built = build();
  built.fn.queue({ identity: "users/1/counts" });
  built.fn.state.sessionToken = () => sessionToken({ platform_user_id: 999 });
  const run = built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await run;
  // Nothing it names runs; the loop keeps asking at the idle interval.
  let polls = 0;
  const origSleep = built.runner.sleep;
  built.runner.sleep = async (ms) => { polls += 1; if (polls > 3) built.runner.terminate().catch(() => {}); await origSleep(ms); };
  await built.runner.loop;
  assert.equal(result(built.docs, "users/1/counts").status, "queued");
  assert.equal(built.record.prepared.length, 0);
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
  const stores = [];
  const built = build({
    makeStore: () => {
      const store = new MemoryStore({ docs });
      const merge = store.merge.bind(store);
      store.merge = async (p, fields) => {
        if (fields.status === "running" || fields.status === "failed") throw new Error("PERMISSION_DENIED");
        return merge(p, fields);
      };
      stores.push(store);
      return store;
    }
  });
  built.fn.queue({ identity: "users/1/counts" });
  let polls = 0;
  const origSleep = built.runner.sleep;
  built.runner.sleep = async (ms) => { polls += 1; if (polls > 20) built.runner.terminate().catch(() => {}); await origSleep(ms); };
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await built.runner.loop;
  const claims = stores.flatMap((s) => s.writes).filter((w) => w.doc.status === "running");
  assert.equal(claims.length, 0);
  assert.ok(polls > 3, "it waits between attempts");
  // Left queued, the entry keeps the VM awake: /idle declines to suspend it, and the
  // runner goes back to /work.
  const routes = built.fn.routes();
  assert.ok(routes.includes("idle") && routes.indexOf("idle") < routes.lastIndexOf("work"));
  assert.equal(result(built.docs, "users/1/counts").status, "queued");
});

// ---- /work's answers -----------------------------------------------------------

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

test("/idle is not called on a flush that does not verify", async () => {
  const built = build();
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  let flushes = 0;
  built.runner.syncer.flushAndVerify = async () => { flushes += 1; return flushes === 1 ? { ok: false, reason: "sync incomplete" } : { ok: true }; };
  await built.runner.loop;
  const routes = built.fn.routes();
  assert.equal(routes.filter((r) => r === "idle").length, 1, "one /idle, after the second flush verified");
  assert.equal(flushes, 2);
});

// A slow /idle answer can arrive after the VM was suspended and resumed; it is not read
// as a failure or as anything else.
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
    assert.equal(built.fn.routes().filter((r) => r === "idle").length, 0, "REPORT-143's /idle would suspend the VM mid-run");
  } finally {
    releaseRun({ display: "x", summary: "y" });
  }
  await built.runner.loop;
});

// ---- the hooks -----------------------------------------------------------------

test("/suspend writes suspending then suspended, keeping current_package and queue", async () => {
  const { runner, docs, record } = await started();
  await runner.loop;
  docs.set(runnerPath(PORTAL, USER), { ...runnerDoc(docs), current_package: { class_hash: CLASS, package_key: "users__1__x" }, queue: [{ class_hash: CLASS, package_key: "users__1__y" }] });
  await runner.suspend();
  const suspendWrites = writesTo(record, runnerPath(PORTAL, USER)).slice(-2);
  assert.deepEqual(suspendWrites.map((w) => w.state), ["suspending", "suspended"]);
  for (const w of suspendWrites) {
    assert.ok(!("current_package" in w) && !("queue" in w), "the hook does not write them, so they are kept");
  }
  assert.deepEqual(runnerDoc(docs).current_package, { class_hash: CLASS, package_key: "users__1__x" });
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

test("/terminate during a run fails the result first, revokes, flushes and terminates", async () => {
  let release;
  const built = build({ stepOverrides: { runPackage: () => new Promise((r) => { release = r; }) } });
  built.fn.queue({ identity: "users/1/slow" });
  await built.runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  while (!built.runner.currentRun || !release) await new Promise((r) => setImmediate(r));
  try {
    await built.runner.terminate();
    assert.equal(built.runner.state, "terminated");
    const doc = result(built.docs, "users/1/slow");
    assert.equal(doc.status, "failed");
    assert.equal(doc.error, "VM terminated during the package run");
    assert.equal(built.record.revoked[0].token, "forwarded-report-server-token");
    assert.equal(runnerDoc(built.docs).state, "terminated");
  } finally {
    // The run's own bound is its declared duration plus ten minutes; let it end.
    release({ display: "x", summary: "y" });
  }
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
        return { success: true, access_key_id: "ASIAX", secret_access_key: "s", session_token: "t", expiration: new Date(Date.now() + 3600e3).toISOString(), bucket: "researcher-dashboard-runner-staging", prefix: `researchers/${USER}/`, region: "us-east-1" };
      }
      return call(route, args);
    },
    makeStorage: ({ bucket, prefix, fetchCredentials }) => new StorageCredentials({ bucket, prefix, fetchCredentials, makeClient: (creds) => { events.push(`client:${creds.accessKeyId}`); return fakeClient; } }),
    makeSyncer: ({ bucket, prefix, root, storage }) => new Syncer({ root, backend: new S3Backend({ bucket, prefix, client: () => storage.client() }) }),
    makePackageBackend: () => ({ async get() {} }),
    unzip: async () => {},
    netGuard: async () => ({}),
    steps: steps({ resolved: [], pulled: [], prepared: [], manifests: {} }),
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

// Done when: a log line from a run names the researcher, the scope and the package.
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
