import { spawn } from "node:child_process";
import { readClue } from "./clue-reader.js";
import { portalHost } from "./config.js";
import fs from "node:fs";
import path from "node:path";
import { preparePackage, readPackageCounts } from "./package-env.js";
import { fetchPackage } from "./package-fetch.js";
import { runSandboxed } from "./sandbox.js";
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
export function ccDataLogin({ token, portal, home, uid, spawnFn = spawn }) {
  return new Promise((resolve, reject) => {
    const host = portalHost(portal);
    // `home` and `uid` log the package in as itself, in its own HOME: cc-data owns the
    // shape of its credential store and it has changed before, so writing that file by
    // hand is a guess that fails as NOT_AUTHENTICATED with the token sitting right there.
    const child = spawnFn("cc-data", ["login", "--portal", host, "--token", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      ...(home ? { env: { HOME: home, PATH: "/usr/local/bin:/usr/bin:/bin" } } : {}),
      ...(typeof uid === "number" ? { uid, gid: uid } : {})
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
    // The Firebase session the status documents are written through. Separate from the
    // cc-data credential below: they are unrelated credentials on unrelated schedules,
    // and this one has to be in place before anything is written.
    signIn: async ({ store, sessionToken }) => {
      if (sessionToken && store?.signIn) await store.signIn(sessionToken);
    },

    installCredential: async ({ token, portal }) => {
      if (token && portal) await login({ token, portal });
    },
    // Fetched and verified before anything is unpacked: the package is code the runner
    // did not write, and the checksum is what stands between the catalog's claim and
    // whatever happens to be at that key.
    resolvePackage: async ({ pkg, backend, workRoot, unzip }) => {
      const { manifest, dir } = await fetchPackage({ backend, pkg, workRoot, unzip });
      return { ...manifest, dir };
    },

    // Everything the package needs before it runs: its own HOME outside the synced data
    // root with the researcher's cc-data credential in it, the class's data directory,
    // and an output directory. The package makes the AP and log pulls itself, so this
    // is what makes that possible; CLUE stays in the runner because its credential must
    // not reach package code.
    preparePackage: async ({ workRoot, dataRoot, classHash, classId, packageName, portal, reportServerToken, uid, proxyUrl }) =>
      preparePackage({
        login,
        workRoot,
        dataRoot,
        classHash,
        classId,
        packageName,
        portalHost: portalHost(portal),
        token: reportServerToken,
        uid,
        proxyUrl
      }),

    // Run as the analysis uid, through the sandbox, so what it reports is what the
    // package will see rather than what the runner sees. A package that cannot write
    // its own data directory fails deep inside its own code with an errno.
    probeWritable: async ({ uid, dir, exec }) =>
      runSandboxed({
        uid,
        command: "/bin/sh",
        args: ["-c", `id -u; stat -c '%u %g %a' ${dir} ${dir}/.. ${dir}/../..; : > ${dir}/.rd-probe && echo WRITABLE && rm -f ${dir}/.rd-probe`],
        ...(exec ? { exec } : {})
      }),

    // The package pulled the data, so it knows the answer and log counts, and it cannot
    // write Firestore. It leaves them in counts.json and the runner merges them with
    // its own clue_documents count into the class document's data block.
    readPackageCounts: async ({ outputDir }) => readPackageCounts(outputDir),

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

    // The entrypoint runs as the analysis uid in the sandbox, with the environment
    // package-env named and nothing inherited from the runner's own process. Its
    // display.json is the result; counts.json is read separately by the caller.
    runPackage: async ({ manifest, paths, env, uid, timeoutMs, proxyUrl, exec }) => {
      const entrypoint = path.resolve(manifest.dir, manifest.entrypoint);
      const interpreter = entrypoint.endsWith(".py") ? "python3.11" : entrypoint;
      const args = entrypoint.endsWith(".py") ? [entrypoint] : [];

      await runSandboxed({
        uid,
        command: interpreter,
        args,
        env,
        cwd: manifest.dir,
        timeout: timeoutMs,
        proxyUrl,
        ...(exec ? { exec } : {})
      });

      const displayFile = path.join(paths.outputDir, "display.json");
      let display;
      try {
        display = JSON.parse(fs.readFileSync(displayFile, "utf8"));
      } catch (err) {
        throw new Error(`package wrote no readable display.json: ${err.message}`);
      }
      return display;
    }
  };
}
