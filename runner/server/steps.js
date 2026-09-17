import { spawn } from "node:child_process";
import { readClue } from "./clue-reader.js";
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

// The Firebase project holding CLUE's documents. It is not the project the status
// documents live in, so the reader signs in separately with its own class token.
export const CLUE_PROJECT = "collaborative-learning-staging";

export function makeSteps({ login = ccDataLogin, readClueFn = readClue } = {}) {
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

    // One sign-in per class per project, kept for the VM's life: the class token is
    // good for an hour but the Firebase session it is exchanged for outlives it.
    pullData: async ({ classHash, classTokens, manifest, portal, dataRoot, makeStore }) => {
      const counts = {};
      const required = manifest?.required_inputs ?? [];

      if (required.includes("clue_documents")) {
        const token = classTokens?.[CLUE_PROJECT];
        if (!token) {
          throw new Error(`the package requires clue_documents but no class token for ${CLUE_PROJECT} was sent`);
        }
        const store = makeStore({ projectId: CLUE_PROJECT });
        await store.signIn(token);
        const read = await readClueFn({ store, portal, classHash, dataRoot });
        // Only the contracted key reaches the class document, whose `data` block is
        // {answers, logs, clue_documents, last_pull_at, log_freshness_at}. The richer
        // counts the reader gathers are in its log line, and the package reads the
        // corpus itself for anything it wants to display.
        counts.clue_documents = read.clue_documents;
      } else {
        // Criterion 5: an AP class declares no clue_documents input, and the skip is
        // visible rather than silent so a missing count can be told from a skipped pull.
        log.info("clue.skipped", { class_hash: classHash, reason: "clue_documents not in required_inputs" });
      }

      return counts;
    },

    runPackage: notYet("running a package")
  };
}
