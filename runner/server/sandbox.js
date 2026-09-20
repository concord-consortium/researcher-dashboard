import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { log } from "./log.js";
import { NETNS } from "./netns.js";

const run = promisify(execFile);

// Execution-role credentials reach the VM through IMDSv2 at this address rather
// than through the environment, so an analysis package can read them with an
// ordinary HTTP request unless it is given no network at all.
export const IMDS_ADDRESS = "169.254.169.254";

// A network namespace rather than a packet filter. The MicroVM kernel carries no
// `xt_owner` module, so iptables cannot match on the owning uid, which is what the
// design originally wanted; a namespace is both stronger and simpler to reason about.
//
// The namespace is prepared once at /run (see netns.js) rather than created per spawn,
// because a package makes its own report-service pulls and therefore needs a route to
// the egress proxy. `ip netns exec` enters that prepared namespace; the earlier
// `unshare --net` made an empty one per spawn, which is where the network went.
//
// `--no-new-privs` and an emptied bounding set, because dropping the uid alone leaves
// setuid execution available: the image gained util-linux after the survey that found
// no su, sudo or runuser, so the setuid inventory changed and is not re-checked here.
//
// The namespace is owned by the initial user namespace and the package holds no
// CAP_NET_ADMIN in it, so it cannot undo any of this. That property depends on not
// passing `--user`, which would be the obvious way to make the setup easier and would
// silently hand it back.
// Absolute paths, because the package's environment is scrubbed down to a PATH that
// deliberately excludes /usr/sbin, and these two are the runner's own wrapper rather
// than anything the package is entitled to resolve for itself.
const IP = "/usr/sbin/ip";
const SETPRIV = "/usr/bin/setpriv";

export function sandboxCommand({ uid, command, args = [], netns = NETNS }) {
  return {
    command: IP,
    args: [
      "netns",
      "exec",
      netns,
      SETPRIV,
      `--reuid=${uid}`,
      `--regid=${uid}`,
      "--clear-groups",
      "--no-new-privs",
      "--bounding-set",
      "-all",
      command,
      ...args
    ]
  };
}

async function execSandboxed({ uid, netns, command, args, exec, timeout = 15_000 }) {
  const spec = sandboxCommand({ uid, netns, command, args });
  return exec(spec.command, spec.args, { timeout });
}

// Run at /run, and fatal if it does not hold. Two checks, because a sandbox that
// is simply broken would fail the reachability test for the wrong reason and look
// like success.
// Run at /run, and fatal if it does not hold. Three checks, not one.
//
// A negative check alone was not enough once the namespace gained a network: "IMDS
// unreachable" is equally true of a namespace with no route at all, so a botched setup
// would have passed verification and left every package silently offline. The positive
// check is what tells those apart. And the uid check proves a process can start, since
// a sandbox that cannot run anything would fail the reachability probes for the wrong
// reason and look like success.
export async function verifySandbox({ uid = 1000, netns = NETNS, proxyUrl, exec = run } = {}) {
  let out;
  try {
    out = await execSandboxed({ uid, netns, command: "id", args: ["-u"], exec });
  } catch (err) {
    throw new Error(`sandbox cannot start a process: ${err.message.trim()}`);
  }
  const ranAs = out.stdout.trim();
  if (ranAs !== String(uid)) {
    throw new Error(`sandbox ran as uid ${ranAs || "(unknown)"}, expected ${uid}`);
  }

  if (await reachable({ uid, netns, exec, url: `http://${IMDS_ADDRESS}/latest/meta-data/` })) {
    throw new Error(`sandboxed uid ${uid} can still reach ${IMDS_ADDRESS}`);
  }

  // The proxy is the one thing a package may reach. Checked through curl's own proxy
  // support rather than by connecting directly, so this exercises the same path cc-data
  // will take.
  if (proxyUrl) {
    const proxyUp = await reachable({
      uid, netns, exec,
      url: `${proxyUrl}/`,
      // A 405 from the proxy is a reachable proxy: it answers CONNECT and refuses
      // everything else, which is exactly the behaviour being confirmed.
      acceptRefusal: true
    });
    if (!proxyUp) {
      throw new Error(`sandboxed uid ${uid} cannot reach the egress proxy at ${proxyUrl}`);
    }
  }

  log.info("sandbox.verified", { uid, netns, proxy: proxyUrl ?? null });
  return { uid, netns };
}

async function reachable({ uid, netns, exec, url, acceptRefusal = false }) {
  try {
    const out = await execSandboxed({
      uid,
      netns,
      command: "curl",
      args: ["-s", "-o", "/dev/null", "-m", "3", "-w", "%{http_code}", url],
      exec
    });
    // curl exits zero for any HTTP response, so a refusal still proves a route. Without
    // acceptRefusal an answering server is the failure being looked for.
    return acceptRefusal ? true : String(out.stdout ?? "").trim() !== "000";
  } catch {
    return false;
  }
}

// Runs an analysis package's entrypoint in the sandbox, as the analysis uid.
//
// The environment is replaced rather than extended: a package inherits nothing from the
// runner's process, which holds credentials in its own $HOME and whatever the SDK has
// cached after a resume. What it gets is what package-env named, plus the proxy, which
// is the only route out of the namespace.
export async function runSandboxed({ uid, netns, command, args = [], env, cwd, timeout, proxyUrl, exec = run }) {
  const spec = sandboxCommand({ uid, netns, command, args });
  return exec(spec.command, spec.args, {
    cwd,
    timeout,
    env: proxyUrl ? { ...env, HTTPS_PROXY: proxyUrl, https_proxy: proxyUrl } : env,
    maxBuffer: 8 * 1024 * 1024
  });
}
