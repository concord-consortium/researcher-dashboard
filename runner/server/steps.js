import { spawn } from "node:child_process";
import { portalHost } from "./config.js";
import fs from "node:fs";
import path from "node:path";
import { preparePackage, readPackageCounts, readPackageResult } from "./package-env.js";
import { fetchPackage } from "./package-fetch.js";
import { killPackageProcesses, runSandboxed } from "./sandbox.js";
import { log } from "./log.js";

// The things a package run does, kept behind one interface so the lifecycle, the pull
// loop and the sync contract can be tested without cc-data or a sandbox.

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

export function makeSteps({ login = ccDataLogin } = {}) {
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
