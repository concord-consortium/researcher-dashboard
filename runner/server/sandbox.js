import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { log } from "./log.js";

const run = promisify(execFile);

// Execution-role credentials reach the VM through IMDSv2 at this address rather
// than through the environment, so an analysis package can read them with an
// ordinary HTTP request unless it is given no network at all.
export const IMDS_ADDRESS = "169.254.169.254";

// A network namespace rather than a packet filter. The MicroVM kernel carries no
// `xt_owner` module, so iptables cannot match on the owning uid, and matching on
// the destination alone would leave the rest of the internet reachable. An empty
// netns has only a down loopback interface, which is both stronger and exactly
// what the design asks for: a package reads files and writes files, and anything
// needing the network is done by the runner on its behalf.
export function sandboxCommand({ uid, command, args = [] }) {
  return {
    command: "unshare",
    args: [
      "--net",
      "--",
      "setpriv",
      `--reuid=${uid}`,
      `--regid=${uid}`,
      "--clear-groups",
      command,
      ...args
    ]
  };
}

async function execSandboxed({ uid, command, args, exec, timeout = 15_000 }) {
  const spec = sandboxCommand({ uid, command, args });
  return exec(spec.command, spec.args, { timeout });
}

// Run at /run, and fatal if it does not hold. Two checks, because a sandbox that
// is simply broken would fail the reachability test for the wrong reason and look
// like success.
export async function verifySandbox({ uid = 1000, exec = run } = {}) {
  let out;
  try {
    out = await execSandboxed({ uid, command: "id", args: ["-u"], exec });
  } catch (err) {
    throw new Error(`sandbox cannot start a process: ${err.message.trim()}`);
  }
  const ranAs = out.stdout.trim();
  if (ranAs !== String(uid)) {
    throw new Error(`sandbox ran as uid ${ranAs || "(unknown)"}, expected ${uid}`);
  }

  let reachable = false;
  try {
    await execSandboxed({
      uid,
      command: "curl",
      args: ["-s", "-m", "3", "-o", "/dev/null", `http://${IMDS_ADDRESS}/latest/meta-data/`],
      exec
    });
    reachable = true;
  } catch {
    // A failure here is the point: the sandboxed process has no route to anything.
  }
  if (reachable) {
    throw new Error(`sandboxed uid ${uid} can still reach ${IMDS_ADDRESS}`);
  }

  log.info("sandbox.verified", { uid });
  return { uid };
}

// Runs an analysis package's entrypoint in the sandbox, as the analysis uid.
//
// The environment is replaced rather than extended: a package inherits nothing from the
// runner's process, which holds the report-service token in its own $HOME and, after a
// resume, whatever the SDK has cached. What it gets is what package-env named.
export async function runSandboxed({ uid, command, args = [], env, cwd, timeout, exec = run }) {
  const spec = sandboxCommand({ uid, command, args });
  return exec(spec.command, spec.args, {
    cwd,
    timeout,
    env,
    maxBuffer: 8 * 1024 * 1024
  });
}
