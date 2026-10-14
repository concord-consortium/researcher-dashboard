import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
  await ccDataLogin({ token: "secret-report-service-token", portal: "learn_portal_staging_concord_org", spawnFn });
  assert.deepEqual(calls[0].args, ["login", "--portal", "learn.portal.staging.concord.org", "--token", "-"]);
  assert.equal(calls[0].stdin, "secret-report-service-token");
  assert.ok(!calls[0].args.some((a) => a.includes("secret-report-service-token")), "the token must never appear in argv");
});

test("a rejected token fails with cc-data's reason", async () => {
  const { spawnFn } = fakeSpawn({ code: 1, stderr: "error: token rejected by report server" });
  await assert.rejects(() => ccDataLogin({ token: "bad", portal: "learn_concord_org", spawnFn }), /cc-data login exited 1: error: token rejected/);
});

test("installCredential installs the report-service token and nothing else", async () => {
  const seen = [];
  const steps = makeSteps({ login: async (args) => seen.push(args) });
  await steps.installCredential({ token: "report-token", portal: "learn_concord_org" });
  assert.deepEqual(seen, [{ token: "report-token", portal: "learn_concord_org" }]);
});

// ---- runPackage ----------------------------------------------------------------

async function withPackageDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "rd-steps-"));
  const outputDir = path.join(dir, "out");
  fs.mkdirSync(outputDir, { recursive: true });
  try {
    return await fn(dir, outputDir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("runPackage runs the entrypoint as the package uid with only the named environment", async () => {
  await withPackageDir(async (dir, outputDir) => {
    const calls = [];
    fs.writeFileSync(path.join(outputDir, "display.md"), "# ok");
    fs.writeFileSync(path.join(outputDir, "summary.txt"), "ok\n");
    const result = await makeSteps().runPackage({
      manifest: { name: "class-counts", version: "1.0.0", entrypoint: "run.py", dir },
      paths: { outputDir },
      env: { HOME: "/work/home/x", CC_DATA_LOCAL: "/data/classes/x" },
      uid: 1000,
      timeoutMs: 1000,
      proxyUrl: "http://10.201.0.1:8123",
      exec: async (command, args, options) => { calls.push({ command, args, options }); return { stdout: "", stderr: "" }; }
    });
    assert.deepEqual(result, { display: "# ok", summary: "ok" });
    const [call] = calls;
    assert.equal(call.command, "/usr/sbin/ip");
    assert.ok(call.args.includes("netns") && call.args.includes("package"));
    assert.ok(call.args.includes("--reuid=1000") && call.args.includes("--no-new-privs"));
    assert.deepEqual(Object.keys(call.options.env).sort(), ["CC_DATA_LOCAL", "HOME", "HTTPS_PROXY", "https_proxy"]);
  });
});

test("runPackage fails when the package wrote no display.md, and ignores a display.json", async () => {
  await withPackageDir(async (dir, outputDir) => {
    fs.writeFileSync(path.join(outputDir, "display.json"), JSON.stringify({ version: 1 }));
    await assert.rejects(
      () => makeSteps().runPackage({ manifest: { name: "x", version: "1.0.0", entrypoint: "run.py", dir }, paths: { outputDir }, env: {}, uid: 1000, exec: async () => ({ stdout: "", stderr: "" }) }),
      /wrote no display.md/
    );
  });
});

// Answers the package's run, then the kills and checks that follow it, from `left`: what
// pgrep finds after each kill, an exit code 1 meaning nothing.
function processExec({ left = [1], run = async () => ({ stdout: "", stderr: "" }), onPackage, onKill } = {}) {
  const calls = [];
  const exec = async (command, args, options) => {
    calls.push([command, ...args].join(" "));
    if (command === "/usr/sbin/ip") { const out = await run(); onPackage?.(); return out; }
    if (args.includes("/usr/bin/kill")) onKill?.();
    if (command === "/usr/bin/pgrep") {
      const next = left.shift();
      if (typeof next === "number") throw Object.assign(new Error(`pgrep exited ${next}`), { code: next });
      if (next instanceof Error) throw next;
      return { stdout: next, stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };
  return { exec, calls };
}

test("after a run every process of the package uid is killed before its output is read", async () => {
  await withPackageDir(async (dir, outputDir) => {
    // The display only exists once the kill has run, so a read before the kill finds none.
    const { exec, calls } = processExec({ onKill: () => fs.writeFileSync(path.join(outputDir, "display.md"), "# after kill") });
    const result = await makeSteps().runPackage({ manifest: { name: "x", version: "1.0.0", entrypoint: "run.py", dir }, paths: { outputDir }, env: {}, uid: 1000, exec });
    assert.equal(result.display, "# after kill");
    assert.equal(calls.length, 3);
    assert.match(calls[1], /^\/usr\/bin\/setpriv --reuid=1000 --regid=1000 .* \/usr\/bin\/kill -KILL -1$/);
    // A zombie of the uid runs nothing, and nothing reaps it when the runner is PID 1.
    assert.equal(calls[2], "/usr/bin/pgrep -u 1000 --runstates R,S,D,T,t");
  });
});

test("the package's processes are killed again until none is left", async () => {
  await withPackageDir(async (dir, outputDir) => {
    fs.writeFileSync(path.join(outputDir, "display.md"), "# ok");
    const { exec, calls } = processExec({ left: ["4242", 1] });
    await makeSteps().runPackage({ manifest: { name: "x", version: "1.0.0", entrypoint: "run.py", dir }, paths: { outputDir }, env: {}, uid: 1000, exec });
    assert.equal(calls.filter((c) => c.includes("kill -KILL -1")).length, 2);
  });
});

test("a package whose processes will not die fails, and so does one that cannot be checked", async () => {
  await withPackageDir(async (dir, outputDir) => {
    fs.writeFileSync(path.join(outputDir, "display.md"), "# ok");
    const args = { manifest: { name: "x", version: "1.0.0", entrypoint: "run.py", dir }, paths: { outputDir }, env: {}, uid: 1000 };
    await assert.rejects(makeSteps().runPackage({ ...args, exec: processExec({ left: ["4242", "4242", "4242", "4242", "4242"] }).exec }), /5 kills did not stop/);
    await assert.rejects(makeSteps().runPackage({ ...args, exec: processExec({ left: [Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })] }).exec }), /could not check/);
  });
});

test("a package that fails or times out still has its processes killed", async () => {
  await withPackageDir(async (dir, outputDir) => {
    const { exec, calls } = processExec({ run: async () => { throw Object.assign(new Error("timed out"), { killed: true, stdout: "", stderr: "" }); } });
    await assert.rejects(makeSteps().runPackage({ manifest: { name: "x", version: "1.0.0", entrypoint: "run.py", dir }, paths: { outputDir }, env: {}, uid: 1000, exec }), /timed out/);
    assert.ok(calls.some((c) => c.endsWith("kill -KILL -1")));
  });
});

function captureLog(run) {
  const lines = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { lines.push(String(chunk)); return true; };
  return Promise.resolve().then(run).finally(() => { process.stdout.write = original; }).then(() => lines.map((l) => JSON.parse(l)));
}

test("runPackage logs what the package printed, truncated from the head", async () => {
  await withPackageDir(async (dir, outputDir) => {
    fs.writeFileSync(path.join(outputDir, "display.md"), "# ok");
    const lines = await captureLog(() => makeSteps().runPackage({
      manifest: { name: "class-counts", version: "1.0.0", entrypoint: "run.py", dir }, paths: { outputDir }, env: {}, uid: 1000, timeoutMs: 1000,
      exec: processExec({ run: async () => ({ stdout: `${"x".repeat(9000)}THE END`, stderr: "dataset: x" }) }).exec
    }));
    const output = lines.find((l) => l.event === "package.output");
    assert.ok(output.stdout.length < 9000 && output.stdout.endsWith("THE END"));
    assert.equal(output.stderr, "dataset: x");
  });
});

test("a package that fails has its output logged before the failure is raised", async () => {
  await withPackageDir(async (dir, outputDir) => {
    const failure = Object.assign(new Error("exited 1"), { stdout: "", stderr: "cc-data: NOT_AUTHENTICATED" });
    const lines = await captureLog(async () => {
      await assert.rejects(makeSteps().runPackage({ manifest: { name: "x", version: "1.0.0", entrypoint: "run.py", dir }, paths: { outputDir }, env: {}, uid: 1000, timeoutMs: 1000, exec: processExec({ run: async () => { throw failure; } }).exec }), /^Error: exited 1$|^exited 1$/);
    });
    const output = lines.find((l) => l.event === "package.output");
    assert.equal(output.level, "error");
    assert.equal(output.stderr, "cc-data: NOT_AUTHENTICATED");
  });
});

test("STATUS_BACKEND selects the store and rejects anything else", async () => {
  const { loadEnv } = await import("../server/config.js");
  assert.equal(loadEnv({}).statusBackend, "FIRESTORE");
  assert.equal(loadEnv({ STATUS_BACKEND: "memory" }).statusBackend, "MEMORY");
  // A store that signs nothing in cannot pass /run's claims check, so LOG is no backend.
  assert.throws(() => loadEnv({ STATUS_BACKEND: "log" }), /must be FIRESTORE or MEMORY/);
  assert.throws(() => loadEnv({ STATUS_BACKEND: "firestor" }), /must be FIRESTORE or MEMORY/);
});
