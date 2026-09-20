import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { afterEach, beforeEach } from "node:test";
import { loadEnv } from "../server/config.js";
import { makeSteps } from "../server/steps.js";
import { HookError, Runner } from "../server/runner.js";
import { buildRunner } from "../server/index.js";
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
  report_server_url: "https://report-server.example.org",
  report_server_token: "forwarded-report-server-token"
});

function steps(overrides = {}) {
  return {
    signIn: async () => {},
    installCredential: async () => {},
    resolvePackage: async () => ({ expected_duration_seconds: 60 }),
    pullData: async () => ({ clue_documents: 12 }),
    // The package prepares nothing real in these tests; what matters is that the runner
    // hands it paths and takes counts back. It does create the class's data directory,
    // because the real one does and because that directory is what the synced tree
    // carries and what the status doc's class list is read from.
    preparePackage: async ({ workRoot, dataRoot, classHash, packageName }) => {
      const dataDir = path.join(dataRoot, "classes", classHash);
      mkdirSync(dataDir, { recursive: true });
      return {
        paths: {
          outputDir: path.join(workRoot, "out", packageName),
          home: path.join(workRoot, "home", packageName),
          dataDir
        },
        env: {}
      };
    },
    // Writes into the class's data directory the way the real package does, with its
    // run-id state file. It matters because an object store has no directories: a class
    // reaches the next VM only as the files under it.
    runPackage: async ({ paths }) => {
      if (paths?.dataDir) writeFileSync(path.join(paths.dataDir, "runs.json"), "{}");
      return { version: 1, summary: "ok", sections: [] };
    },
    // The AP and log counts come from the package, which made those pulls.
    readPackageCounts: async () => ({ answers: 201, logs: 490 }),
    // The real one: it only reads the synced tree, which these tests have on disk, and
    // a stub would make the classes the status doc reports untestable here.
    heldClasses: makeSteps().heldClasses,
    ...overrides
  };
}

function build({ stepOverrides = {}, now, envOverrides = {}, makeStore, revokeReportServerToken } = {}) {
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
    revokeReportServerToken: revokeReportServerToken ?? (async () => true),
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

test("/run installs the forwarded credential, pulls down, and reaches ready", async () => {
  let installed = null;
  const runner = build({ stepOverrides: { installCredential: async (args) => { installed = args; } } });
  await runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });

  assert.equal(runner.state, "ready");
  // Straight from the payload, with no AWS call anywhere on this path, which is what
  // lets the execution role hold no secretsmanager:GetSecretValue.
  assert.equal(installed.token, "forwarded-report-server-token");
  assert.equal(installed.portal, PORTAL);
  assert.deepEqual(store.states(rdoc()), ["starting", "ready"]);
  assert.equal(store.get(rdoc()).microvm_id, "mvm-1");
});

// The premise the sandbox's egress rests on: a package may read the credential the VM
// holds, and that is only safe when it is the requesting researcher's own. A VM with
// none has no safe world to run a package in, so it refuses to start rather than
// starting without one.
test("/run refuses a payload carrying no forwarded credential", async () => {
  const runner = build();
  const without = JSON.stringify({ ...JSON.parse(PAYLOAD), report_server_token: undefined });

  await assert.rejects(
    () => runner.run({ microvmId: "mvm-1", runHookPayload: without }),
    /report_server_token/
  );
  assert.equal(runner.state, null);
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
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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

// Which image a VM is running is the first question about a VM that is behaving oddly,
// and the page reading this document cannot call get-microvm to ask AWS.
test("the status doc says which image version the VM is running", async () => {
  const runner = build({ envOverrides: { imageVersion: "22.0" } });
  await runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });

  assert.equal(store.get(rdoc()).image_version, "22.0");
});

// `classes` is what the status bar answers "which classes can this VM serve" with, and
// nothing else in the document says it: the result documents live under the class, not
// under the researcher.
test("the status doc lists a class once a package has been accepted for it", async () => {
  const runner = await started();
  await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  });
  await runner.currentAnalysis?.done;

  assert.deepEqual(store.get(rdoc()).classes, [CLASS]);
});

test("the status doc lists every class the VM holds, not only the last one", async () => {
  const other = "64727df0".repeat(6);
  const runner = await started();
  for (const [classHash, name] of [[CLASS, "demo"], [other, "other"]]) {
    await runner.startPackage({
      scope: { kind: "class", class_hash: classHash, class_id: 111 },
      package: { name, version: "1.0.0", checksum: "sha256:abc" },
      class_tokens: CLASS_TOKENS
    });
    await runner.currentAnalysis?.done;
  }

  assert.deepEqual(store.get(rdoc()).classes, [other, CLASS].sort());
});

// A resumed VM, and the next VM this researcher launches, inherit the pulled tree from
// S3 rather than a list in memory, so what is on disk after the sync is the answer.
test("a VM that syncs down a researcher's classes reports them at ready", async () => {
  const other = "64727df0".repeat(6);
  const first = await started();
  await first.startPackage({
    scope: { kind: "class", class_hash: other, class_id: 223 },
    package: { name: "other", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  });
  await first.currentAnalysis?.done;
  await first.suspend();

  const next = build({ envOverrides: { dataRoot: path.join(work, "data-2") } });
  await next.run({ microvmId: "mvm-2", runHookPayload: PAYLOAD });

  assert.deepEqual(store.get(rdoc()).classes, [other]);
});

test("requested_by comes from the session payload, not the request body", async () => {
  const runner = await started();
  await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
        scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
      scope: { kind: "class", class_hash: CLASS, class_id: 111 } },
    {
      scope: { kind: "class", class_hash: CLASS, class_id: 111 },
      package: { name: "d", version: "1", checksum: "c" }
    },
    {
      scope: { kind: "class", class_hash: CLASS, class_id: 111 },
      package: { name: "d", version: "1", checksum: "c" },
      class_tokens: {}
    },
    {
      scope: { kind: "class", class_hash: CLASS, class_id: 111 },
      package: { name: "d", version: "1", checksum: "c" },
      class_tokens: ["rs-class-token"]
    },
    {
      scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
  const signedIn = [];
  const runner = await started({
    stepOverrides: { signIn: async (args) => signedIn.push(args) }
  });
  await runner.refreshToken({ session_token: "fresh-token" });

  assert.equal(signedIn.at(-1).sessionToken, "fresh-token");
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
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
      scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
      scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
      scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
      scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
      scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
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
      installCredential: async ({ token }) => { if (token) logins.push(token); }
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
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
    package: { name: "class-counts", version: "2.0.0", checksum: "sha256:beef" },
    class_tokens: CLASS_TOKENS
  });
  await runner.currentAnalysis?.done;

  const doc = store.get(resultPath(PORTAL, CLASS, "class-counts"));
  assert.deepEqual(doc.package, { name: "class-counts", version: "2.0.0", checksum: "sha256:beef" });
  assert.equal(doc.status, "done");
});

// The credential the VM pulled with dies with the VM rather than living until the
// researcher's next launch. It authenticates the revocation with the token being
// revoked, so the VM needs no other standing at report-server.
test("terminate revokes the VM's own report-server credential", async () => {
  const calls = [];
  const runner = build({ revokeReportServerToken: async (args) => { calls.push(args); return true; } });
  await runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });

  await runner.terminate();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].baseUrl, "https://report-server.example.org");
  assert.equal(calls[0].token, "forwarded-report-server-token");
});

// Suspend is not the end of the VM: it resumes holding the same credential and would
// have no way to obtain another.
test("suspend leaves the report-server credential alone", async () => {
  const calls = [];
  const runner = build({ revokeReportServerToken: async (args) => { calls.push(args); return true; } });
  await runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });

  await runner.suspend();

  assert.equal(calls.length, 0);
});

// The VM is going away either way, and an unrevoked token is a residual the design
// already accepts: the researcher's next launch revokes it when it mints the next one.
test("a refused revocation does not fail the terminate hook", async () => {
  const runner = build({ revokeReportServerToken: async () => { throw new Error("report-server down"); } });
  await runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });

  await assert.doesNotReject(() => runner.terminate());
  assert.equal(runner.state, "terminated");
});

// Criterion 21 runs this image on a laptop against staging with the developer's own
// report-server token. Retiring it on teardown would revoke a credential they still want.
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

// report-server filters a run by the portal's numeric class id, and nothing inside the VM
// can derive it from the class hash. Refusing here costs nothing; discovering it missing
// inside a package costs a pull that cannot be made.
test("a scope without a class_id is refused", async () => {
  const runner = await started();

  await assert.rejects(
    () => runner.startPackage({
      scope: { kind: "class", class_hash: CLASS },
      package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
      class_tokens: CLASS_TOKENS
    }),
    (err) => err.status === 400 && /class_id/.test(err.message)
  );
});

// The package makes the AP and log pulls itself, so the id has to reach its environment
// rather than stopping at the runner.
test("the portal class id reaches the package's environment", async () => {
  let prepared = null;
  const runner = build({ stepOverrides: { preparePackage: async (args) => {
    prepared = args;
    return { paths: { home: "/h", outputDir: "/o", dataDir: "/d" }, env: {} };
  } } });
  await runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });

  await runner.startPackage({
    scope: { kind: "class", class_hash: CLASS, class_id: 111 },
    package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
    class_tokens: CLASS_TOKENS
  });
  await runner.currentAnalysis?.done;
  assert.equal(prepared?.classId, 111);
  // The same for the report-server URL, which isolation-probe needs in order to report
  // that report-server is reachable rather than skipping the check.
  assert.equal(prepared?.reportServerUrl, "https://report-server.example.org");
});

// The first status write carries the session token's claims or the rules refuse it, and
// a VM whose /run fails is terminated by Lambda. Signing in later than this reads as a
// permission error from Firestore with nothing to say which step was out of order.
test("signs in before the first status document is written", async () => {
  let existedAtSignIn = "unset";
  const runner = build({
    stepOverrides: {
      signIn: async () => { existedAtSignIn = store.get(researcherPath(PORTAL, USER)); }
    }
  });

  await runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });

  assert.equal(existedAtSignIn, undefined, "signIn ran after the first write");
  assert.ok(store.get(researcherPath(PORTAL, USER)), "no status document was written at all");
});

// Lambda answers run-microvm before the run hook finishes, so a caller can reach
// /run-package while the payload is parsed but the package backend is not built. That
// used to surface as a TypeError and a 500, which reads as a broken VM rather than one
// that is not up yet.
test("/run-package is refused until /run has finished", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const runner = build({ stepOverrides: { installCredential: () => gate } });
  const running = runner.run({ microvmId: "mvm-1", runHookPayload: PAYLOAD });
  await new Promise((r) => setTimeout(r, 10));

  await assert.rejects(
    () => runner.startPackage({
      scope: { kind: "class", class_hash: CLASS, class_id: 111 },
      package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
      class_tokens: CLASS_TOKENS
    }),
    (err) => err instanceof HookError && err.status === 409
  );

  release();
  await running;
});
