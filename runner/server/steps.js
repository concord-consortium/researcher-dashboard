import { spawn } from "node:child_process";
import { portalHost } from "./config.js";
import { log } from "./log.js";

// The three things an analysis does, kept behind one interface so the lifecycle,
// the state machine and the sync contract could be built and tested before any of
// them exist.

function notYet(what) {
  return () => {
    throw new Error(`${what} is not implemented yet`);
  };
}

// `--token -` reads from stdin. The bare `--token <value>` form would put the
// report-service token in the process list, where the analysis user could read it.
export function ccDataLogin({ token, portal, spawnFn = spawn }) {
  return new Promise((resolve, reject) => {
    const host = portalHost(portal);
    const child = spawnFn("cc-data", ["login", "--portal", host, "--token", "-"], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        log.info("ccdata.login", { portal: host });
        resolve();
      } else {
        // The token itself is never in cc-data's output, so the stderr is safe to
        // surface; it is where the reason for a rejected token appears.
        reject(new Error(`cc-data login exited ${code}: ${stderr.trim()}`));
      }
    });
    child.stdin.end(token);
  });
}

export function makeSteps({ login = ccDataLogin } = {}) {
  return {
    // Two credentials, both arriving at /run and neither stored in the image: the
    // report-service token goes to cc-data's credential store under $HOME, and the
    // session token signs the Firebase client in. $HOME is outside the synced data
    // root, so neither credential is ever written to S3.
    installCredential: async ({ token, sessionToken, portal, store }) => {
      if (token && portal) await login({ token, portal });
      if (sessionToken && store?.signIn) await store.signIn(sessionToken);
    },
    resolvePackage: notYet("package fetch and checksum verification"),
    pullData: notYet("the AP, log and CLUE pulls"),
    runPackage: notYet("running a package")
  };
}
