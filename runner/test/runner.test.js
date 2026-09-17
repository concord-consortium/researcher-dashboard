import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { loadEnv } from "../server/config.js";
import { HookError, Runner } from "../server/runner.js";
import { MemoryStore, analysisPath, researcherPath } from "../server/status.js";
import { DirBackend, Syncer } from "../server/sync/index.js";

const PORTAL = "learn_portal_staging_concord_org";
const USER = "439";
const CLASS = "7be899cf".repeat(6);

let work;
let store;

const PAYLOAD = JSON.stringify({
  session_token: "session-token",
  platform_user_id: USER,
  portal: PORTAL,
  firebase_project: "report-service-dev",
  bucket: "researcher-dashboard-runner-staging",
  secret_name: "researcher-dashboard-runner-staging/report-service-token"
});

function steps(overrides = {}) {
  return {
    installCredential: async () => {},
    resolvePackage: async () => ({ expected_duration_seconds: 60 }),
    pullData: async () => ({ answers: 201, logs: 490, clue_documents: 12 }),
    runPackage: async () => ({ version: 1, summary: "ok", sections: [] }),
    ...overrides
  };
}

function build({ stepOverrides = {}, now, envOverrides = {} } = {}) {
  const env = {
    ...loadEnv({ SYNC_BACKEND: "DIR", SYNC_DIR: path.join(work, "remote") }),
    dataRoot: path.join(work, "data"),
    workRoot: path.join(work, "work"),
    // The production default is 30 minutes and its timer is deliberately not
    // unref'd, so a test that leaves an analysis pending would hold the event loop
    // open for that long. Seconds are ample for a faked pipeline.
    analysisTimeoutMs: 2000,
    ...envOverrides
  };
  store = new MemoryStore();
  return new Runner({
    env,
    makeStore: () => store,
    makeSyncer: ({ root }) =>
      new Syncer({ backend: new DirBackend(path.join(work, "remote")), root }),
    readSecret: async () => "report-service-token-value",
    steps: steps(stepOverrides),
    now
  });
}

const rdoc = () => researcherPath(PORTAL, USER);

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "rd-runner-"));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

async function started(opts) {
  const runner = build(opts);
  await runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  return runner;
}

test("/run reads the secret, pulls down, and reaches ready", async () => {
  let secretAsked = null;
  const runner = build();
  runner.readSecret = async (name) => {
    secretAsked = name;
    return "token";
  };
  await runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });

  assert.equal(runner.state, "ready");
  assert.equal(secretAsked, "researcher-dashboard-runner-staging/report-service-token");
  assert.deepEqual(store.states(rdoc()), ["starting", "ready"]);
  assert.equal(store.get(rdoc()).microvm_id, "mvm-1");
});

test("/run refuses a malformed payload rather than serving traffic", async () => {
  const runner = build();
  await assert.rejects(
    () => runner.run({ microvmId: "mvm-1", runHookPayload: "{}" }),
    /missing: session_token/
  );
  assert.equal(runner.state, null);
});

test("a full analysis writes starting, ready, running, ready and the class counts", async () => {
  const runner = await started();
  const res = await runner.analyze({
    analysis_id: "a1",
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_token: "class-token"
  });
  await runner.currentAnalysis?.done;
  assert.equal(res.analysis_id, "a1");

  assert.deepEqual(store.states(rdoc()), ["starting", "ready", "running", "ready"]);
  const doc = store.get(analysisPath(PORTAL, CLASS, "a1"));
  assert.equal(doc.status, "done");
  assert.equal(doc.requested_by, USER);
  assert.deepEqual(doc.package, { name: "demo", version: "1.0.0", checksum: "sha256:abc" });
  assert.equal(store.get(`researcher_dashboard/${PORTAL}/classes/${CLASS}`).data.answers, 201);
});

test("requested_by comes from the session payload, not the request body", async () => {
  const runner = await started();
  await runner.analyze({
    analysis_id: "a1",
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_token: "class-token",
    requested_by: "someone-else"
  });
  await runner.currentAnalysis?.done;
  assert.equal(store.get(analysisPath(PORTAL, CLASS, "a1")).requested_by, USER);
});

test("a second analysis is refused with 409 and writes nothing", async () => {
  let release;
  const runner = await started({
    stepOverrides: { pullData: () => new Promise((r) => (release = r)) }
  });
  const body = {
    analysis_id: "a1",
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_token: "class-token"
  };
  await runner.analyze(body);
  const before = store.writes.length;

  await assert.rejects(
    () => runner.analyze({ ...body, analysis_id: "a2" }),
    (err) => err instanceof HookError && err.status === 409
  );
  assert.equal(store.writes.length, before, "a refusal must leave Firestore untouched");
  assert.equal(store.get(analysisPath(PORTAL, CLASS, "a2")), undefined);

  release({ answers: 1, logs: 1, clue_documents: 1 });
  await runner.currentAnalysis?.done;
});

test("an analysis longer than the VM has left is refused, writing nothing", async () => {
  let clock = 1_000_000;
  const runner = await started({
    now: () => clock,
    stepOverrides: { resolvePackage: async () => ({ expected_duration_seconds: 3600 }) }
  });
  // Seven and a half hours in, less than the package's declared hour remains.
  clock += 7.5 * 60 * 60 * 1000;
  const before = store.writes.length;

  await assert.rejects(
    () =>
      runner.analyze({
        analysis_id: "a1",
        scope: { kind: "class", class_hash: CLASS },
        package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
        class_token: "class-token"
      }),
    (err) => err instanceof HookError && err.status === 409 && /expires in/.test(err.message)
  );
  assert.equal(store.writes.length, before);
});

test("a malformed /analyze body is refused before any document is created", async () => {
  const runner = await started();
  const before = store.writes.length;
  for (const body of [
    {},
    { analysis_id: "a1" },
    { analysis_id: "a1", scope: { kind: "cohort" } },
    { analysis_id: "a1", scope: { kind: "class", class_hash: CLASS } },
    {
      analysis_id: "a1",
      scope: { kind: "class", class_hash: CLASS },
      package: { name: "d", version: "1", checksum: "c" }
    }
  ]) {
    await assert.rejects(
      () => runner.analyze(body),
      (err) => err instanceof HookError && err.status === 400
    );
  }
  assert.equal(store.writes.length, before);
});

test("a failed analysis fails its document but returns the VM to ready", async () => {
  const runner = await started({
    stepOverrides: {
      runPackage: async () => {
        throw new Error("package exited 1");
      }
    }
  });
  await runner.analyze({
    analysis_id: "a1",
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_token: "class-token"
  });
  await runner.currentAnalysis?.done;

  const doc = store.get(analysisPath(PORTAL, CLASS, "a1"));
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /package exited 1/);
  assert.equal(runner.state, "ready", "the VM can still serve, so it is not failed");
  assert.deepEqual(store.states(rdoc()), ["starting", "ready", "running", "ready"]);
});

test("an analysis that outruns its timeout fails rather than hanging", async () => {
  const runner = await started({
    envOverrides: { analysisTimeoutMs: 20 },
    stepOverrides: { pullData: () => new Promise(() => {}) }
  });
  await runner.analyze({
    analysis_id: "a1",
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_token: "class-token"
  });
  await runner.currentAnalysis?.done;

  const doc = store.get(analysisPath(PORTAL, CLASS, "a1"));
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /exceeded 20ms/);
  assert.equal(runner.state, "ready");
});

test("/suspend reaches suspended only after the sync verifies", async () => {
  const runner = await started();
  const res = await runner.suspend();
  assert.equal(res.state, "suspended");
  assert.deepEqual(store.states(rdoc()), ["starting", "ready", "suspending", "suspended"]);
});

test("criterion 13: a denied PutObject leaves failed, never suspended", async () => {
  const runner = await started();
  runner.syncer.backend = {
    put: async () => {
      throw new Error("AccessDenied: PutObject");
    }
  };
  await runner.syncer.flush().catch(() => {});
  // Something to push, so the flush has work that can fail.
  const { writeFile, mkdir } = await import("node:fs/promises");
  await mkdir(runner.env.dataRoot, { recursive: true });
  await writeFile(path.join(runner.env.dataRoot, "answers.v1.jsonl"), "data");

  await assert.rejects(() => runner.suspend(), /AccessDenied/);
  const states = store.states(rdoc());
  assert.deepEqual(states, ["starting", "ready", "suspending", "failed"]);
  assert.ok(!states.includes("suspended"), "must never claim suspended on a failed sync");
  assert.match(store.get(rdoc()).error, /AccessDenied/);
});

test("/resume returns a suspended VM to ready", async () => {
  const runner = await started();
  await runner.suspend();
  await runner.resume();
  assert.equal(runner.state, "ready");
  assert.deepEqual(store.states(rdoc()), [
    "starting",
    "ready",
    "suspending",
    "suspended",
    "ready"
  ]);
});

test("criterion 11: terminate during an analysis fails the analysis and terminates the VM", async () => {
  let release;
  const runner = await started({
    stepOverrides: { pullData: () => new Promise((r) => (release = r)) }
  });
  await runner.analyze({
    analysis_id: "a1",
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_token: "class-token"
  });

  const inFlight = runner.currentAnalysis.done;
  await runner.terminate();
  assert.equal(runner.state, "terminated");
  assert.equal(store.get(analysisPath(PORTAL, CLASS, "a1")).status, "failed");
  assert.match(store.get(analysisPath(PORTAL, CLASS, "a1")).error, /terminated during analysis/);
  assert.equal(store.states(rdoc()).at(-1), "terminated");

  release({ answers: 0, logs: 0, clue_documents: 0 });
  await inFlight;
});

test("/refresh-token replaces the session token and re-signs in", async () => {
  const installed = [];
  const runner = await started({
    stepOverrides: { installCredential: async (args) => installed.push(args) }
  });
  await runner.refreshToken({ session_token: "fresh-token" });

  assert.equal(installed.at(-1).sessionToken, "fresh-token");
  await assert.rejects(
    () => runner.refreshToken({}),
    (err) => err instanceof HookError && err.status === 400
  );
});

test("hooks before /run are refused rather than writing a doc for nobody", async () => {
  const runner = build();
  for (const call of [
    () => runner.analyze({}),
    () => runner.suspend(),
    () => runner.resume(),
    () => runner.terminate(),
    () => runner.refreshToken({ session_token: "x" })
  ]) {
    await assert.rejects(call, (err) => err instanceof HookError && err.status === 409);
  }
  assert.equal(store.writes.length, 0, "a refused hook must write nothing");
  assert.equal(runner.store, null, "no store is built before /run");
});
