import assert from "node:assert/strict";
import test from "node:test";
import { IMDS_ADDRESS, sandboxCommand, verifySandbox } from "../server/sandbox.js";

// Answers `id -u` with whatever uid the scenario claims, and either reaches IMDS
// or refuses to, so both halves of the verification can be driven independently.
function fakeExec({ ranAs = "1000", imdsReachable = false, startFails = false } = {}) {
  const calls = [];
  const exec = async (command, args) => {
    calls.push([command, ...args].join(" "));
    if (startFails) throw new Error("unshare: Operation not permitted");
    if (args.includes("id")) return { stdout: `${ranAs}\n`, stderr: "" };
    if (args.includes("curl")) {
      if (imdsReachable) return { stdout: "", stderr: "" };
      throw new Error("curl: (7) Failed to connect");
    }
    return { stdout: "", stderr: "" };
  };
  return { exec, calls };
}

test("a sandboxed command runs with no network and as the analysis uid", () => {
  const spec = sandboxCommand({ uid: 1000, command: "python3.11", args: ["run.py"] });
  assert.equal(spec.command, "unshare");
  assert.deepEqual(spec.args, [
    "--net",
    "--",
    "setpriv",
    "--reuid=1000",
    "--regid=1000",
    "--clear-groups",
    "python3.11",
    "run.py"
  ]);
});

test("verification passes when the sandbox starts and cannot reach the metadata service", async () => {
  const { exec, calls } = fakeExec();
  assert.deepEqual(await verifySandbox({ uid: 1000, exec }), { uid: 1000 });
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
