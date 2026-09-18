import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import test from "node:test";
import { portalHost } from "../server/config.js";
import { CLUE_PROJECT, ccDataLogin, makeSteps } from "../server/steps.js";

// Stands in for the cc-data process: records how it was invoked and what was
// written to its stdin, then closes with the given exit code.
function fakeSpawn({ code = 0, stderr = "" } = {}) {
  const calls = [];
  const spawnFn = (cmd, args) => {
    const child = new EventEmitter();
    const call = { cmd, args, stdin: "" };
    calls.push(call);
    child.stdin = {
      end: (data) => {
        call.stdin = String(data ?? "");
        setImmediate(() => {
          if (stderr) child.stderr.emit("data", stderr);
          child.emit("close", code);
        });
      }
    };
    child.stderr = new EventEmitter();
    return child;
  };
  return { spawnFn, calls };
}

test("portalHost restores the host from the Firestore path segment", () => {
  assert.equal(portalHost("learn_portal_staging_concord_org"), "learn.portal.staging.concord.org");
  assert.equal(portalHost("learn_concord_org"), "learn.concord.org");
});

test("the token is written to stdin, never to the argument list", async () => {
  const { spawnFn, calls } = fakeSpawn();
  await ccDataLogin({
    token: "secret-report-service-token",
    portal: "learn_portal_staging_concord_org",
    spawnFn
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [
    "login",
    "--portal",
    "learn.portal.staging.concord.org",
    "--token",
    "-"
  ]);
  assert.equal(calls[0].stdin, "secret-report-service-token");
  // The argument list is visible in /proc to every user on the VM, including the
  // analysis user that runs fetched packages.
  assert.ok(
    !calls[0].args.some((a) => a.includes("secret-report-service-token")),
    "the token must never appear in argv"
  );
});

test("a rejected token fails /run with cc-data's reason", async () => {
  const { spawnFn } = fakeSpawn({ code: 1, stderr: "error: token rejected by report server" });
  await assert.rejects(
    () => ccDataLogin({ token: "bad", portal: "learn_concord_org", spawnFn }),
    /cc-data login exited 1: error: token rejected/
  );
});

test("installCredential installs the report-service token and signs Firebase in", async () => {
  const seen = [];
  const signedIn = [];
  const steps = makeSteps({ login: async (args) => seen.push(args) });
  await steps.installCredential({
    token: "report-token",
    sessionToken: "session-token",
    portal: "learn_concord_org",
    store: { signIn: async (t) => signedIn.push(t) }
  });

  assert.deepEqual(seen, [{ token: "report-token", portal: "learn_concord_org" }]);
  assert.deepEqual(signedIn, ["session-token"]);
});

test("a token refresh re-signs in without reinstalling the report-service token", async () => {
  const seen = [];
  const signedIn = [];
  const steps = makeSteps({ login: async (args) => seen.push(args) });
  // /refresh-token carries only a session token, so cc-data must not be touched.
  await steps.installCredential({
    sessionToken: "fresh",
    store: { signIn: async (t) => signedIn.push(t) }
  });

  assert.deepEqual(seen, []);
  assert.deepEqual(signedIn, ["fresh"]);
});

// Every analysis step is implemented now; what is left of notYet is nothing, so the
// test that asserted the stubs announced themselves is gone rather than weakened.

test("runPackage runs the entrypoint as the analysis uid with only the named environment", async () => {
  const calls = [];
  const dir = await mkdtemp(path.join(tmpdir(), "rd-steps-"));
  const outputDir = path.join(dir, "out");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "display.json"), JSON.stringify({ version: 1, summary: "ok" }));
  fs.writeFileSync(path.join(dir, "run.py"), "");

  const steps = makeSteps();
  const display = await steps.runPackage({
    manifest: { name: "class-counts", version: "1.0.0", entrypoint: "run.py", dir },
    paths: { outputDir },
    env: { HOME: "/work/home/class-counts", CC_DATA_LOCAL: "/data/classes/x" },
    uid: 1000,
    timeoutMs: 1000,
    proxyUrl: "http://10.201.0.1:8123",
    exec: async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: "", stderr: "" };
    }
  });

  assert.deepEqual(display, { version: 1, summary: "ok" });
  const [call] = calls;
  // ip netns exec into the prepared namespace, then setpriv: the sandbox, not a spawn.
  assert.equal(call.command, "ip");
  assert.ok(call.args.includes("netns") && call.args.includes("analysis"));
  assert.ok(call.args.includes("--reuid=1000"));
  assert.ok(call.args.includes("--no-new-privs"));
  assert.ok(call.args.includes("python3.11"));
  // Replaced, not extended: a package inherits nothing from the runner's process, which
  // holds the report-service token in its own HOME.
  // Exactly what package-env named, plus the proxy, which is the only route out of the
  // namespace and is how cc-data reaches report-server.
  assert.deepEqual(Object.keys(call.options.env).sort(),
    ["CC_DATA_LOCAL", "HOME", "HTTPS_PROXY", "https_proxy"]);
  assert.equal(call.options.env.HTTPS_PROXY, "http://10.201.0.1:8123");
  assert.ok(!("AWS_REGION" in call.options.env), "nothing is inherited from the runner's process");
  await rm(dir, { recursive: true, force: true });
});

test("runPackage fails when the package wrote no readable display.json", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "rd-steps-"));
  const outputDir = path.join(dir, "out");
  fs.mkdirSync(outputDir, { recursive: true });

  const steps = makeSteps();
  await assert.rejects(
    () => steps.runPackage({
      manifest: { name: "class-counts", version: "1.0.0", entrypoint: "run.py", dir },
      paths: { outputDir },
      env: {},
      uid: 1000,
      exec: async () => ({ stdout: "", stderr: "" })
    }),
    /no readable display.json/
  );
  await rm(dir, { recursive: true, force: true });
});

test("pullData reads CLUE with the class token for CLUE's own project", async () => {
  const calls = [];
  const signedIn = [];
  const steps = makeSteps({
    readClueFn: async (args) => {
      calls.push(args);
      return { clue_documents: 22, clue_history_entries: 27135, clue_users: 7 };
    }
  });

  const counts = await steps.pullData({
    classHash: "abc",
    classTokens: { [CLUE_PROJECT]: "clue-token", "report-service-dev": "rs-token" },
    manifest: { required_inputs: ["clue_documents"] },
    portal: "learn_portal_staging_concord_org",
    dataRoot: "/data",
    makeStore: ({ projectId }) => ({ projectId, signIn: async (t) => signedIn.push([projectId, t]) })
  });

  // The report-service token would sign in but read nothing: CLUE's documents are in
  // CLUE's project, and a token signed by the wrong project cannot be exchanged there.
  assert.deepEqual(signedIn, [[CLUE_PROJECT, "clue-token"]]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].classHash, "abc");
  assert.equal(calls[0].portal, "learn_portal_staging_concord_org");
  assert.equal(calls[0].dataRoot, "/data");
  // The class document's data block is a pinned contract, so the reader's extra
  // counts stay in its logs rather than widening it a field at a time.
  assert.deepEqual(counts, { clue_documents: 22 });
});

test("pullData skips the CLUE read when the package does not require it", async () => {
  let called = false;
  const steps = makeSteps({ readClueFn: async () => { called = true; return {}; } });

  const counts = await steps.pullData({
    classHash: "abc",
    classTokens: { "report-service-dev": "rs-token" },
    manifest: { required_inputs: ["answers"] },
    portal: "p",
    dataRoot: "/data",
    makeStore: () => assert.fail("no store should be made for a skipped read")
  });

  assert.equal(called, false, "the AP fixture class has no CLUE documents to read");
  assert.deepEqual(counts, {});
});

test("pullData fails loudly when CLUE is required but its class token is missing", async () => {
  const steps = makeSteps({ readClueFn: async () => assert.fail("must not read without a token") });
  await assert.rejects(
    () => steps.pullData({
      classHash: "abc",
      classTokens: { "report-service-dev": "rs-token" },
      manifest: { required_inputs: ["clue_documents"] },
      portal: "p",
      dataRoot: "/data",
      makeStore: () => assert.fail("no store should be made")
    }),
    /requires clue_documents but no class token for collaborative-learning-staging/
  );
});

test("STATUS_BACKEND selects the store and rejects anything else", async () => {
  const { loadEnv } = await import("../server/config.js");
  assert.equal(loadEnv({}).statusBackend, "FIRESTORE");
  assert.equal(loadEnv({ STATUS_BACKEND: "log" }).statusBackend, "LOG");
  assert.throws(() => loadEnv({ STATUS_BACKEND: "firestor" }), /must be FIRESTORE, LOG or MEMORY/);
});

test("LogStore records the state sequence without attempting a sign-in", async () => {
  const { LogStore } = await import("../server/status.js");
  const store = new LogStore();
  // A placeholder session token must not be exchanged: there is no portal to have
  // minted it, so a sign-in could only fail and take /run down with it.
  assert.equal(await store.signIn("placeholder"), null);
  await store.merge("researcher_dashboard/p/researchers/439", { state: "ready" });
});
