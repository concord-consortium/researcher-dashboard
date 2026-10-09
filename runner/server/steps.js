import { spawn } from "node:child_process";
import { readClue } from "./clue-reader.js";
import { portalHost } from "./config.js";
import fs from "node:fs";
import path from "node:path";
import { clueProjectFor, portalFirebaseApp } from "./firebase-projects.js";
import { preparePackage, readPackageCounts, readPackageResult } from "./package-env.js";
import { fetchPackage } from "./package-fetch.js";
import { killPackageProcesses, runSandboxed } from "./sandbox.js";
import { customTokenClaims } from "./status.js";
import { log } from "./log.js";

// The things a package run does, kept behind one interface so the lifecycle, the pull
// loop and the sync contract can be tested without cc-data, CLUE or a sandbox.

// `--token -` reads from stdin. The bare `--token <value>` form would put the
// report-service token in the process list, where the package user could read it.
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

// Who fetched the CLUE corpus, which a package branches on (final-design.md section 13):
// the runner's pre-pull until RD-5 flips it to cc-data.
export const CLUE_SOURCE = "firebase";

// A CLUE token this close to its expiry is not worth a sign-in that will fail.
export const CLUE_TOKEN_MARGIN_MS = 2 * 60_000;

// Enough of a package's output to read a failure from, and bounded because it reaches
// CloudWatch: a package that prints its whole corpus should cost a truncated log line
// rather than the log group.
const PACKAGE_OUTPUT_LIMIT = 4000;

function tail(text) {
  const value = String(text ?? "").trim();
  return value.length > PACKAGE_OUTPUT_LIMIT ? `...${value.slice(-PACKAGE_OUTPUT_LIMIT)}` : value;
}

function logPackageOutput(identity, result, level) {
  log[level]("package.output", {
    stdout: tail(result?.stdout),
    stderr: tail(result?.stderr)
  });
}

// The CLUE class token for this environment, refused before a sign-in when it cannot
// work. rigse mints it at the request and the function passes it through (REPORT-143
// Q1), so work queued behind an hour of other packages finds it expired.
export function clueToken({ classTokens, firebaseProject, now = Date.now() }) {
  const project = clueProjectFor(firebaseProject);
  const row = portalFirebaseApp(project);
  const token = classTokens?.[row];
  if (!token) throw new Error(`the package asks for the CLUE pre-pull but rigse sent no class token for ${row}`);
  const exp = customTokenExpiry(token);
  if (exp !== null && exp - now < CLUE_TOKEN_MARGIN_MS) {
    const minutes = Math.round((now - (exp - 3600_000)) / 60_000);
    throw new ClueTokenExpired(minutes);
  }
  return { project, token };
}

export class ClueTokenExpired extends Error {
  constructor(minutes) {
    super(`The CLUE credential for this run was issued when the run was requested, ${minutes} minutes ago, and has expired, since a CLUE credential lasts an hour. Run the package again.`);
  }
}

function customTokenExpiry(token) {
  try {
    const [, payload] = String(token).split(".");
    const exp = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).exp;
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function makeSteps({ login = ccDataLogin, readClueFn = readClue } = {}) {
  return {
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

    preparePackage: async (args) =>
      preparePackage({ ...args, login, portalHost: portalHost(args.portal) }),

    // Run as the package uid, through the sandbox, so what it reports is what the
    // package will see rather than what the runner sees.
    probeWritable: async ({ uid, dir, exec }) =>
      runSandboxed({
        uid,
        command: "/bin/sh",
        args: ["-c", `id -u; stat -c '%u %g %a' ${dir} ${dir}/.. ${dir}/../..; : > ${dir}/.rd-probe && echo WRITABLE && rm -f ${dir}/.rd-probe`],
        ...(exec ? { exec } : {})
      }),

    readPackageCounts: async ({ outputDir }) => readPackageCounts(outputDir),

    // The classes this VM holds pulled data for, read from the synced tree rather than
    // remembered: the tree is what `/run` syncs down from the researcher's prefix, so it
    // already carries every class an earlier VM of theirs opened.
    heldClasses: async ({ dataRoot }) => {
      try {
        return fs.readdirSync(path.join(dataRoot, "classes"), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort();
      } catch {
        return [];
      }
    },

    // The one read the runner makes for a package, and only when it asks: cc-data cannot
    // read CLUE yet, and the credential that can must never reach package code. The store
    // is this package's alone and closed after the read.
    pullData: async ({ classHash, classTokens, manifest, portal, dataRoot, makeStore, firebaseProject, now }) => {
      if (manifest?.clue_prepull !== true) {
        log.info("clue.skipped", { class_hash: classHash, reason: "the package does not ask for the CLUE pre-pull" });
        return {};
      }
      const { project, token } = clueToken({ classTokens, firebaseProject, now: now?.() });
      const store = makeStore({ projectId: project });
      try {
        try {
          await store.signIn(token);
        } catch (err) {
          // Identity Toolkit refuses a custom token past its hour; the clock check above
          // catches most of these, and this says the same when the VM's clock did not.
          throw new Error(`The CLUE credential for this run could not be used, most likely because it was issued when the run was requested, over an hour ago, and a CLUE credential lasts an hour. Run the package again. (${err.code ?? err.message})`);
        }
        const claims = await store.claims();
        if (claims?.class_hash && claims.class_hash !== classHash) {
          throw new Error(`the CLUE class token names class ${claims.class_hash}, not ${classHash}`);
        }
        const read = await readClueFn({ store, portal, classHash, dataRoot });
        return { clue_documents: read.clue_documents };
      } finally {
        await store.close?.().catch(() => {});
      }
    },

    // The entrypoint runs as the package uid in the sandbox, with the environment
    // package-env named and nothing inherited from the runner's own process.
    runPackage: async ({ manifest, paths, env, uid, timeoutMs, proxyUrl, exec }) => {
      const entrypoint = path.resolve(manifest.dir, manifest.entrypoint);
      const interpreter = entrypoint.endsWith(".py") ? "python3.11" : entrypoint;
      const args = entrypoint.endsWith(".py") ? [entrypoint] : [];

      // A package's own output is the only account of what it did, and the runner is
      // the only thing positioned to keep it: the sandbox has no route to CloudWatch
      // and the VM's disk dies with it.
      let result;
      try {
        result = await runSandboxed({
          uid,
          command: interpreter,
          args,
          env,
          cwd: manifest.dir,
          timeout: timeoutMs,
          proxyUrl,
          ...(exec ? { exec } : {})
        });
      } catch (err) {
        logPackageOutput(manifest.name, err, "error");
        throw err;
      } finally {
        // Before the output is read, so nothing of the package's is left to change it.
        await killPackageProcesses({ uid, ...(exec ? { exec } : {}) });
      }
      logPackageOutput(manifest.name, result, "info");
      return readPackageResult(paths.outputDir);
    }
  };
}

export { customTokenClaims };
