import assert from "node:assert/strict";
import test from "node:test";
import { IMDS_ADDRESS, sandboxCommand, verifySandbox } from "../server/sandbox.js";

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

test("a sandboxed command enters the prepared namespace as the analysis uid", () => {
  const spec = sandboxCommand({ uid: 1000, command: "python3.11", args: ["run.py"] });
  // Absolute: the package's PATH excludes /usr/sbin on purpose, and this wrapper is
  // the runner's, so it must not be resolved through the environment handed to the
  // package. Spawning it by bare name fails with ENOENT only on a real VM.
  assert.equal(spec.command, "/usr/sbin/ip");
  assert.deepEqual(spec.args, [
    "netns",
    "exec",
    "analysis",
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
  assert.deepEqual(await verifySandbox({ uid: 1000, exec }), { uid: 1000, netns: "analysis" });
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
  assert.ok(calls.every((c) => c.startsWith("/usr/sbin/ip netns exec analysis")),
    "every probe runs inside the namespace, or it proves nothing about the package");
});
