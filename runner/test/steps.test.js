import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { portalHost } from "../server/config.js";
import { ccDataLogin, makeSteps } from "../server/steps.js";

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

test("the analysis steps announce themselves as unimplemented rather than silently passing", () => {
  const steps = makeSteps();
  for (const name of ["resolvePackage", "pullData", "runPackage"]) {
    assert.throws(() => steps[name]({}), /is not implemented yet/, name);
  }
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
