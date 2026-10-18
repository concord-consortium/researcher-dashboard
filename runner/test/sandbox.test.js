import assert from "node:assert/strict";
import test from "node:test";
import { IMDS_ADDRESS, freezePackageProcesses, sandboxCommand, thawPackageProcesses, verifySandbox } from "../server/sandbox.js";

// Answers `id -u` with whatever uid the scenario claims, and either reaches IMDS
// or refuses to, so both halves of the verification can be driven independently.
function fakeExec({ ranAs = "1000", imdsReachable = false, proxyReachable = true, startFails = false } = {}) {
  const calls = [];
  const exec = async (command, args) => {
    const line = [command, ...args].join(" ");
    calls.push(line);
    if (startFails) throw new Error("ip: Operation not permitted");
    if (args.includes("id")) return { stdout: `${ranAs}\n`, stderr: "" };
    if (args.includes("curl")) {
      // curl exits zero for any HTTP response and writes the status; 000 is no
      // response at all, which is what an unreachable destination looks like.
      if (line.includes(IMDS_ADDRESS)) {
        if (imdsReachable) return { stdout: "200", stderr: "" };
        throw new Error("curl: (7) Failed to connect");
      }
      if (proxyReachable) return { stdout: "405", stderr: "" };
      throw new Error("curl: (7) Failed to connect");
    }
    return { stdout: "", stderr: "" };
  };
  return { exec, calls };
}

test("a sandboxed command enters the prepared namespace as the package uid", () => {
  const spec = sandboxCommand({ uid: 1000, command: "python3.11", args: ["run.py"] });
  // Absolute: the package's PATH excludes /usr/sbin on purpose, and this wrapper is
  // the runner's, so it must not be resolved through the environment handed to the
  // package. Spawning it by bare name fails with ENOENT only on a real VM.
  assert.equal(spec.command, "/usr/sbin/ip");
  assert.deepEqual(spec.args, [
    "netns",
    "exec",
    "package",
    "/usr/bin/setpriv",
    "--reuid=1000",
    "--regid=1000",
    "--clear-groups",
    // Dropping the uid alone leaves setuid execution available, and the image gained
    // util-linux after the survey that found no su, sudo or runuser.
    "--no-new-privs",
    "--bounding-set",
    "-all",
    "python3.11",
    "run.py"
  ]);
});

test("verification passes when the sandbox starts and cannot reach the metadata service", async () => {
  const { exec, calls } = fakeExec();
  assert.deepEqual(await verifySandbox({ uid: 1000, exec }), { uid: 1000, netns: "package" });
  assert.ok(calls.some((c) => c.includes("id -u")), "it must prove a process actually ran");
  assert.ok(calls.some((c) => c.includes(IMDS_ADDRESS)), "it must probe the metadata service");
});

test("a sandbox that still reaches the metadata service fails, which is the whole point", async () => {
  const { exec } = fakeExec({ imdsReachable: true });
  await assert.rejects(
    () => verifySandbox({ uid: 1000, exec }),
    new RegExp(`can still reach ${IMDS_ADDRESS}`)
  );
});

test("a sandbox that cannot start a process fails rather than passing by accident", async () => {
  // Without this check a broken unshare would fail the reachability probe for the
  // wrong reason and be indistinguishable from a working sandbox.
  const { exec } = fakeExec({ startFails: true });
  await assert.rejects(() => verifySandbox({ uid: 1000, exec }), /cannot start a process/);
});

test("a sandbox that runs as the wrong uid fails", async () => {
  const { exec } = fakeExec({ ranAs: "0" });
  await assert.rejects(() => verifySandbox({ uid: 1000, exec }), /ran as uid 0, expected 1000/);
});

// The check that a namespace with no route at all would otherwise pass. "IMDS
// unreachable" is equally true of a sandbox that can reach nothing, so without this a
// botched veth setup verifies clean and every package is silently offline.
test("a sandbox that cannot reach the egress proxy fails verification", async () => {
  const { exec } = fakeExec({ proxyReachable: false });
  await assert.rejects(
    () => verifySandbox({ uid: 1000, proxyUrl: "http://10.201.0.1:8123", exec }),
    /cannot reach the egress proxy/
  );
});

test("verification passes when the proxy answers and the metadata service does not", async () => {
  const { exec, calls } = fakeExec();
  await verifySandbox({ uid: 1000, proxyUrl: "http://10.201.0.1:8123", exec });
  assert.ok(calls.some((c) => c.includes("10.201.0.1:8123")), "it must probe the proxy");
  assert.ok(calls.every((c) => c.startsWith("/usr/sbin/ip netns exec package")),
    "every probe runs inside the namespace, or it proves nothing about the package");
});

// Answers each pgrep from `left`, an exit code meaning it found nothing, and records every
// command it was asked to run.
function pgrepExec({ left = [1] } = {}) {
  const calls = [];
  const exec = async (command, args) => {
    calls.push([command, ...args].join(" "));
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

const noPause = async () => {};

test("a freeze stops every process of the package uid, again until none is runnable", async () => {
  const { exec, calls } = pgrepExec({ left: ["4242", 1] });
  await freezePackageProcesses({ uid: 1000, exec, sleep: noPause });
  assert.match(calls[0], /^\/usr\/bin\/setpriv --reuid=1000 --regid=1000 .* \/usr\/bin\/kill -STOP -1$/);
  // A stopped process is in state T, so it is not counted.
  assert.equal(calls[1], "/usr/bin/pgrep -u 1000 --runstates R,S,D");
  assert.equal(calls.filter((c) => c.endsWith("kill -STOP -1")).length, 2);
});

test("a freeze that cannot stop the package, or cannot check, fails", async () => {
  await assert.rejects(freezePackageProcesses({ uid: 1000, sleep: noPause, exec: pgrepExec({ left: ["4242", "4242", "4242", "4242", "4242"] }).exec }), /5 stops did not stop/);
  await assert.rejects(freezePackageProcesses({ uid: 1000, sleep: noPause, exec: pgrepExec({ left: [Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" })] }).exec }), /could not check/);
});

test("a freeze waits between its attempts, so a process inside a write can stop", async () => {
  const events = [];
  const { exec } = pgrepExec({ left: ["4242", "4242", 1] });
  const recording = (...args) => { if (args[0] === "/usr/bin/pgrep") events.push("check"); return exec(...args); };
  await freezePackageProcesses({ uid: 1000, exec: recording, sleep: async (ms) => { events.push(`pause:${ms}`); } });
  assert.deepEqual(events, ["check", "pause:200", "check", "pause:200", "check"]);
});

test("a thaw continues every process of the package uid, and nothing to continue is not a failure", async () => {
  const { exec, calls } = pgrepExec();
  await thawPackageProcesses({ uid: 1000, exec });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^\/usr\/bin\/setpriv --reuid=1000 --regid=1000 .* \/usr\/bin\/kill -CONT -1$/);
  await thawPackageProcesses({ uid: 1000, exec: async () => { throw Object.assign(new Error("kill exited 1"), { code: 1 }); } });
  await assert.rejects(thawPackageProcesses({ uid: 1000, exec: async () => { throw Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }); } }), /ENOENT/);
});
