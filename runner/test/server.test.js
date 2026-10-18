import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { loadEnv } from "../server/config.js";
import { createServer } from "../server/index.js";
import { Runner } from "../server/runner.js";
import { makeSteps } from "../server/steps.js";
import { MemoryStore, runnerPath } from "../server/status.js";
import { DirBackend, Syncer } from "../server/sync/index.js";
import { captureLog } from "./helpers/capture-log.js";

const HOOK = "/aws/lambda-microvms/runtime/v1";
const PORTAL = "learn_portal_staging_concord_org";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const SESSION = `${b64({ alg: "none" })}.${b64({ uid: "u", claims: { platform_id: "https://learn.portal.staging.concord.org", platform_user_id: 439, user_type: "researcher", researcher_dashboard_runner: true } })}.`;
const PAYLOAD = JSON.stringify({
  session_token: SESSION,
  platform_user_id: "439",
  platform_id: "https://learn.portal.staging.concord.org",
  portal: PORTAL,
  firebase_project: "report-service-dev",
  bucket: "researcher-dashboard-runner-staging",
  report_server_url: "https://report-server.example.org",
  report_server_token: "forwarded-report-server-token",
  function_url: "https://functions.example.org/researcherDashboard"
});

let work;
let server;
let base;
let docs;
let runner;
// Every state written to the runner document, in order, through whichever store wrote it.
let states;

beforeEach(async () => {
  work = await mkdtemp(path.join(tmpdir(), "rd-http-"));
  docs = new Map();
  states = [];
  const env = {
    ...loadEnv({ SYNC_BACKEND: "DIR", SYNC_DIR: path.join(work, "remote") }),
    dataRoot: path.join(work, "data"),
    workRoot: path.join(work, "work")
  };
  runner = new Runner({
    env,
    makeStore: () => {
      const store = new MemoryStore({ docs });
      const merge = store.merge.bind(store);
      store.merge = (p, fields) => {
        if (p === runnerPath(PORTAL, "439") && fields.state) states.push(fields.state);
        return merge(p, fields);
      };
      return store;
    },
    // Nothing queued, and /idle suspends: the loop ends as soon as it has asked.
    makeFunctionClient: () => async (route) => (route === "work"
      ? { success: true, packages: [], scopes: {}, session_token: SESSION, firebase_project: "report-service-dev" }
      : { success: true, suspended: true }),
    makeSyncer: ({ root }) => new Syncer({ backend: new DirBackend(path.join(work, "remote")), root }),
    makePackageBackend: () => ({ async get() {} }),
    netGuard: async () => ({ uid: 1000 }),
    steps: { ...makeSteps(), installCredential: async () => {} },
    sleep: async () => {},
    now: (() => { let t = Date.now(); return () => (t += 60_000); })()
  });
  server = createServer({ runner, env });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  await rm(work, { recursive: true, force: true });
});

const post = (p, body) => fetch(`${base}${p}`, { method: "POST", body: body === undefined ? "" : JSON.stringify(body) });

test("/ready answers 200 before /run, which is what the image build waits on", async () => {
  const res = await post(`${HOOK}/ready`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ready: true });
});

test("the lifecycle hooks route through to the runner", async () => {
  assert.equal((await post(`${HOOK}/run`, { microvmId: "mvm-1", runHookPayload: PAYLOAD })).status, 200);
  await runner.loop;
  assert.equal((await post(`${HOOK}/suspend`)).status, 200);
  assert.equal((await post(`${HOOK}/resume`)).status, 200);
  await runner.loop;
  assert.equal((await post(`${HOOK}/terminate`)).status, 200);
  assert.deepEqual(states, ["starting", "ready", "ready", "suspending", "suspended", "ready", "terminated"]);
});

test("/run-package and /refresh-token exist nowhere", async () => {
  await post(`${HOOK}/run`, { microvmId: "mvm-1", runHookPayload: PAYLOAD });
  assert.equal((await post("/run-package", {})).status, 404);
  assert.equal((await post("/refresh-token", { session_token: "x" })).status, 404);
});

test("a hook before /run is refused with 409 rather than 500", async () => {
  const res = await post(`${HOOK}/suspend`);
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /has not completed \/run/);
});

test("a /run whose body is not JSON is a 400, not an unhandled crash", async () => {
  const res = await fetch(`${base}${HOOK}/run`, { method: "POST", body: "{not json" });
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
  await runner.loop;
  const body = await (await fetch(`${base}/`)).json();
  assert.equal(body.state, "ready");
  assert.equal(body.microvm_id, "mvm-1");
  assert.equal(body.current_package, null);
  assert.equal(body.sync_backend, "DIR");
  assert.ok(body.expires_at);
});

test("a hook that fails is logged as hook.failed", async () => {
  const lines = await captureLog(() => post(`${HOOK}/suspend`));
  const failed = lines.find((l) => l.event === "hook.failed");
  assert.ok(failed);
  assert.equal(failed.status, 409);
});
