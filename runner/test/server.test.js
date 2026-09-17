import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { loadEnv } from "../server/config.js";
import { createServer } from "../server/index.js";
import { Runner } from "../server/runner.js";
import { MemoryStore } from "../server/status.js";
import { DirBackend, Syncer } from "../server/sync/index.js";

const HOOK = "/aws/lambda-microvms/runtime/v1";
const PORTAL = "learn_portal_staging_concord_org";
const CLASS = "7be899cf".repeat(6);

const PAYLOAD = JSON.stringify({
  session_token: "session-token",
  platform_user_id: "439",
  portal: PORTAL,
  firebase_project: "report-service-dev",
  bucket: "researcher-dashboard-runner-staging",
  secret_name: "researcher-dashboard-runner-staging/report-service-token"
});

let work;
let server;
let base;
let store;

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "rd-http-"));
  store = new MemoryStore();
  const env = {
    ...loadEnv({ SYNC_BACKEND: "DIR", SYNC_DIR: path.join(work, "remote") }),
    dataRoot: path.join(work, "data"),
    workRoot: path.join(work, "work"),
    analysisTimeoutMs: 2000
  };
  const runner = new Runner({
    env,
    makeStore: () => store,
    makeSyncer: ({ root }) =>
      new Syncer({ backend: new DirBackend(path.join(work, "remote")), root }),
    readSecret: async () => "token",
    steps: {
      installCredential: async () => {},
      resolvePackage: async () => ({ expected_duration_seconds: 1 }),
      pullData: async () => ({ answers: 1, logs: 2, clue_documents: 3 }),
      runPackage: async () => ({ version: 1, summary: "ok", sections: [] })
    }
  });
  server = createServer({ runner, env });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  await rm(work, { recursive: true, force: true });
});

const post = (p, body) =>
  fetch(`${base}${p}`, {
    method: "POST",
    body: body === undefined ? "" : JSON.stringify(body)
  });

test("/ready answers 200 before /run, which is what the image build waits on", async () => {
  const res = await post(`${HOOK}/ready`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ready: true });
});

test("the lifecycle hooks route through to the runner", async () => {
  assert.equal((await post(`${HOOK}/run`, { microvmId: "mvm-1", runHookPayload: PAYLOAD })).status, 200);
  assert.equal((await post(`${HOOK}/suspend`)).status, 200);
  assert.equal((await post(`${HOOK}/resume`)).status, 200);
  assert.equal((await post(`${HOOK}/terminate`)).status, 200);
  assert.deepEqual(store.states(`researcher_dashboard/${PORTAL}/researchers/439`), [
    "starting",
    "ready",
    "suspending",
    "suspended",
    "ready",
    "terminated"
  ]);
});

test("/analyze answers 202 with the document path, not 200", async () => {
  await post(`${HOOK}/run`, { microvmId: "mvm-1", runHookPayload: PAYLOAD });
  const res = await post("/analyze", {
    analysis_id: "a1",
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_token: "class-token"
  });
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.analysis_id, "a1");
  assert.equal(body.doc_path, `researcher_dashboard/${PORTAL}/classes/${CLASS}/analyses/a1`);
});

test("a refusal surfaces its own status code and reason", async () => {
  await post(`${HOOK}/run`, { microvmId: "mvm-1", runHookPayload: PAYLOAD });
  const res = await post("/analyze", { analysis_id: "a1" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /scope must be/);
});

test("a hook before /run is refused with 409 rather than 500", async () => {
  const res = await post(`${HOOK}/suspend`);
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /has not completed \/run/);
});

test("malformed JSON is a 400, not an unhandled crash", async () => {
  const res = await fetch(`${base}/analyze`, { method: "POST", body: "{not json" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /not valid JSON/);
});

test("unknown paths and wrong methods are 404", async () => {
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  assert.equal((await post(`${HOOK}/validate`)).status, 404);
  assert.equal((await fetch(`${base}${HOOK}/run`)).status, 404, "GET on a hook path");
});

test("GET / reports the VM's live state for a human", async () => {
  await post(`${HOOK}/run`, { microvmId: "mvm-1", runHookPayload: PAYLOAD });
  const body = await (await fetch(`${base}/`)).json();
  assert.equal(body.state, "ready");
  assert.equal(body.microvm_id, "mvm-1");
  assert.equal(body.sync_backend, "DIR");
  assert.ok(body.expires_at, "expires_at drives the /analyze duration refusal");
});
