import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { loadEnv } from "../server/config.js";
import { HookError, Runner } from "../server/runner.js";
import { MemoryStore, resultPath, researcherPath } from "../server/status.js";
import { DirBackend, Syncer } from "../server/sync/index.js";

const PORTAL = "learn_portal_staging_concord_org";
const USER = "439";
const CLASS = "7be899cf".repeat(6);
const PLATFORM_ID = "https://learn.portal.staging.concord.org";
// One per Firebase project the analysis touches, keyed by FirebaseApp name.
const CLASS_TOKENS = Object.freeze({
  "report-service-dev": "rs-class-token",
  "collaborative-learning-staging": "clue-class-token"
});

let work;
let store;

const PAYLOAD = JSON.stringify({
  session_token: "session-token",
  platform_user_id: USER,
  platform_id: PLATFORM_ID,
  portal: PORTAL,
  firebase_project: "report-service-dev",
  bucket: "researcher-dashboard-runner-staging",
  secret_name: "researcher-dashboard-runner-staging/report-service-token"
});

function steps(overrides = {}) {
  return {
    installCredential: async () => {},
    resolvePackage: async () => ({ expected_duration_seconds: 60 }),
    pullData: async () => ({ clue_documents: 12 }),
    // The package prepares nothing real in these tests; what matters is that the runner
    // hands it paths and takes counts back.
    preparePackage: async ({ workRoot, packageName }) => ({
      paths: { outputDir: path.join(workRoot, "out", packageName), home: path.join(workRoot, "home", packageName) },
      env: {}
    }),
    runPackage: async () => ({ version: 1, summary: "ok", sections: [] }),
    // The AP and log counts come from the package, which made those pulls.
    readPackageCounts: async () => ({ answers: 201, logs: 490 }),
    ...overrides
  };
}

function build({ stepOverrides = {}, now, envOverrides = {}, makeStore } = {}) {
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
    makeStore: makeStore ?? (() => store),
    makePackageBackend: () => ({ async get() {} }),
    unzip: async () => {},
    makeSyncer: ({ root }) =>
      new Syncer({ backend: new DirBackend(path.join(work, "remote")), root }),
    readSecret: async () => "report-service-token-value",
    netGuard: async () => ({ uid: 1000, binary: "stub" }),
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
  const res = await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  });
  await runner.currentAnalysis?.done;
  assert.equal(res.package, "demo");

  assert.deepEqual(store.states(rdoc()), ["starting", "ready", "running", "ready"]);
  const doc = store.get(resultPath(PORTAL, CLASS, "demo"));
  assert.equal(doc.status, "done");
  assert.equal(doc.requested_by, USER);
  assert.deepEqual(doc.package, { name: "demo", version: "1.0.0", checksum: "sha256:abc" });
  assert.equal(store.get(`researcher_dashboard/${PORTAL}/classes/${CLASS}`).data.answers, 201);
});

test("requested_by comes from the session payload, not the request body", async () => {
  const runner = await started();
  await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS,
    requested_by: "someone-else"
  });
  await runner.currentAnalysis?.done;
  assert.equal(store.get(resultPath(PORTAL, CLASS, "demo")).requested_by, USER);
});

test("a second analysis is refused with 409 and writes nothing", async () => {
  let release;
  const runner = await started({
    stepOverrides: { pullData: () => new Promise((r) => (release = r)) }
  });
  const body = {
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  };
  await runner.startPackage(body);
  const before = store.writes.length;

  await assert.rejects(
    () => runner.startPackage({ ...body, package: { name: "other", version: "1.0.0", checksum: "sha256:def" } }),
    (err) => err instanceof HookError && err.status === 409
  );
  assert.equal(store.writes.length, before, "a refusal must leave Firestore untouched");
  assert.equal(store.get(resultPath(PORTAL, CLASS, "other")), undefined);

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
      runner.startPackage({
        scope: { kind: "class", class_hash: CLASS },
        package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
        class_tokens: CLASS_TOKENS
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
    {},
    {
      scope: { kind: "cohort" } },
    {
      scope: { kind: "class", class_hash: CLASS } },
    {
      scope: { kind: "class", class_hash: CLASS },
      package: { name: "d", version: "1", checksum: "c" }
    },
    {
      scope: { kind: "class", class_hash: CLASS },
      package: { name: "d", version: "1", checksum: "c" },
      class_tokens: {}
    },
    {
      scope: { kind: "class", class_hash: CLASS },
      package: { name: "d", version: "1", checksum: "c" },
      class_tokens: ["rs-class-token"]
    },
    {
      scope: { kind: "class", class_hash: CLASS },
      package: { name: "d", version: "1", checksum: "c" },
      class_tokens: { "report-service-dev": "" }
    }
  ]) {
    await assert.rejects(
      () => runner.startPackage(body),
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
  await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  });
  await runner.currentAnalysis?.done;

  const doc = store.get(resultPath(PORTAL, CLASS, "demo"));
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
  await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  });
  await runner.currentAnalysis?.done;

  const doc = store.get(resultPath(PORTAL, CLASS, "demo"));
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
  await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  });

  const inFlight = runner.currentAnalysis.done;
  await runner.terminate();
  assert.equal(runner.state, "terminated");
  assert.equal(store.get(resultPath(PORTAL, CLASS, "demo")).status, "failed");
  assert.match(store.get(resultPath(PORTAL, CLASS, "demo")).error, /terminated during analysis/);
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
    () => runner.startPackage({}),
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

// Every status document carries platform_id because report-service's rules check it
// against the token's claim rather than trusting the {portal} path segment. A runner
// that omitted it would have every write denied, and only against real rules.
test("every status document carries platform_id", async () => {
  const runner = await started();
  await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  });
  await runner.currentAnalysis?.done;

  for (const path of [rdoc(), `researcher_dashboard/${PORTAL}/classes/${CLASS}`,
                      resultPath(PORTAL, CLASS, "demo")]) {
    assert.equal(store.get(path).platform_id, PLATFORM_ID, `${path} has no platform_id`);
  }
});

// Two /analyze calls that arrive together must not both pass the one-at-a-time guard:
// the check and the claim have to be on the same synchronous turn.
test("two concurrent analyses cannot both claim the VM", async () => {
  const runner = await started({
    stepOverrides: { resolvePackage: async () => ({ expected_duration_seconds: 60 }) }
  });
  const body = (name) => ({
    scope: { kind: "class", class_hash: CLASS },
    package: { name, version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  });

  const results = await Promise.allSettled([runner.startPackage(body("first")), runner.startPackage(body("second"))]);
  const accepted = results.filter((r) => r.status === "fulfilled");
  const refused = results.filter((r) => r.status === "rejected");
  assert.equal(accepted.length, 1, "exactly one analysis may be accepted");
  assert.equal(refused.length, 1);
  assert.equal(refused[0].reason.status, 409);
});

// A refusal after the claim has to release it, or one rejected request leaves the VM
// reporting "already running" forever with no analysis to finish.
test("an analysis refused after the claim leaves the VM able to accept the next one", async () => {
  let clock = Date.now();
  const runner = await started({
    now: () => clock,
    stepOverrides: { resolvePackage: async () => ({ expected_duration_seconds: 3600 }) }
  });
  clock += 7.5 * 60 * 60 * 1000;
  await assert.rejects(
    () => runner.startPackage({
      scope: { kind: "class", class_hash: CLASS },
      package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
      class_tokens: CLASS_TOKENS
    }),
    (err) => err instanceof HookError && err.status === 409
  );
  assert.equal(runner.currentAnalysis, null, "the refused request must not hold the VM");
});

// The session token carries no class_hash, so report-service's rules refuse it on the
// class and analysis documents. The runner therefore has to exchange that class's own
// token and write those documents through it, not through the launch session.
test("class-scoped documents are written on the class token, not the session token", async () => {
  const classStores = [];
  const runner = await started({
    makeStore: ({ appName }) => {
      const s = new MemoryStore();
      s.appName = appName;
      if (appName?.includes(CLASS)) classStores.push(s);
      return s;
    }
  });
  await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  });
  await runner.currentAnalysis?.done;

  assert.equal(classStores.length, 1, "one signed-in connection per class");
  assert.deepEqual(classStores[0].signedInWith, [CLASS_TOKENS["report-service-dev"]]);
  const paths = classStores[0].writes.map((w) => w.path);
  assert.ok(paths.includes(resultPath(PORTAL, CLASS, "demo")), "the analysis doc goes out on the class token");
  assert.ok(paths.some((p) => p.endsWith(`classes/${CLASS}`)), "the class doc goes out on the class token");
});

test("an analysis whose class_tokens omit the status project is refused", async () => {
  const runner = await started();
  await assert.rejects(
    () => runner.startPackage({
      scope: { kind: "class", class_hash: CLASS },
      package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
      class_tokens: { "collaborative-learning-staging": "clue-only" }
    }),
    (err) => err instanceof HookError && err.status === 400 && /report-service-dev/.test(err.message)
  );
});

// One document per class and package means a failing run writes over a good one. The
// last display stays readable with the failure beside it, rather than the page going
// blank because the newest run happened to fail.
test("a failed run leaves the previous display readable", async () => {
  const body = {
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  };

  // One runner and one store across both runs: the point is what the second run does
  // to the document the first one wrote.
  let attempt = 0;
  const runner = await started({
    stepOverrides: {
      runPackage: async () => {
        attempt += 1;
        if (attempt === 2) throw new Error("package exited 1");
        return { version: 1, summary: "first run", sections: [] };
      }
    }
  });

  await runner.startPackage(body);
  await runner.currentAnalysis?.done;
  const display = store.get(resultPath(PORTAL, CLASS, "demo")).display;
  assert.ok(display, "the first run produced a display");

  await runner.startPackage(body);
  await runner.currentAnalysis?.done;

  const doc = store.get(resultPath(PORTAL, CLASS, "demo"));
  assert.equal(doc.status, "failed");
  assert.match(doc.error, /package exited 1/);
  assert.deepEqual(doc.display, display, "the last good display survives the failure");
});

// The document id is the package name, so a name with a slash would write into a
// nested collection instead of the class's results.
test("a package name that is not a single path segment is refused", async () => {
  const runner = await started();
  await assert.rejects(
    () => runner.startPackage({
      scope: { kind: "class", class_hash: CLASS },
      package: { name: "evil/../other", version: "1.0.0", checksum: "sha256:abc" },
      class_tokens: CLASS_TOKENS
    }),
    (err) => err instanceof HookError && err.status === 400 && /single path segment/.test(err.message)
  );
});

// The mint is the only gate on which class a researcher may read, so the runner checks
// that the token it was handed says what the request says. A launcher bug that sent the
// wrong class's token would otherwise pull that class's student work into this
// researcher's prefix and hand it to their package.
function jwtWith(claims) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64({ uid: "u", claims })}.sig`;
}

test("a class token naming a different class is refused", async () => {
  const runner = await started();
  await assert.rejects(
    () => runner.startPackage({
      scope: { kind: "class", class_hash: CLASS },
      package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
      class_tokens: {
        "report-service-dev": jwtWith({ platform_user_id: USER, class_hash: "a-different-class" })
      }
    }),
    (err) => err instanceof HookError && err.status === 400 && /not the requested class/.test(err.message)
  );
});

test("a class token belonging to another researcher is refused", async () => {
  const runner = await started();
  await assert.rejects(
    () => runner.startPackage({
      scope: { kind: "class", class_hash: CLASS },
      package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
      class_tokens: {
        "report-service-dev": jwtWith({ platform_user_id: "999", class_hash: CLASS })
      }
    }),
    (err) => err instanceof HookError && err.status === 400 && /another researcher/.test(err.message)
  );
});

test("a token whose claims cannot be read is left to sign-in to reject", async () => {
  const runner = await started();
  const res = await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: { "report-service-dev": "not-a-jwt" }
  });
  await runner.currentAnalysis?.done;
  assert.equal(res.package, "demo");
});

test("a replacement session token for another researcher is refused", async () => {
  const runner = await started();
  await assert.rejects(
    () => runner.refreshToken({ session_token: jwtWith({ platform_user_id: "999" }) }),
    (err) => err instanceof HookError && err.status === 400 && /another researcher/.test(err.message)
  );
});

test("refresh-token replaces the report-server credential when one is sent", async () => {
  const logins = [];
  const runner = await started({
    stepOverrides: {
      installCredential: async ({ token, sessionToken, store }) => {
        if (token) logins.push(token);
        if (sessionToken && store?.signIn) await store.signIn(sessionToken);
      }
    }
  });
  await runner.refreshToken({
    session_token: jwtWith({ platform_user_id: USER }),
    report_server_token: "fresh-report-server-token"
  });
  assert.deepEqual(logins.slice(-1), ["fresh-report-server-token"]);
});

// Criterion 19: publishing a new version and asking for it runs that version with no
// image rebuild, and the result records what ran.
test("the result records the package name, version and checksum that ran", async () => {
  const runner = await started();
  await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS },
    package: { name: "class-counts", version: "2.0.0", checksum: "sha256:beef" },
    class_tokens: CLASS_TOKENS
  });
  await runner.currentAnalysis?.done;

  const doc = store.get(resultPath(PORTAL, CLASS, "class-counts"));
  assert.deepEqual(doc.package, { name: "class-counts", version: "2.0.0", checksum: "sha256:beef" });
  assert.equal(doc.status, "done");
});
