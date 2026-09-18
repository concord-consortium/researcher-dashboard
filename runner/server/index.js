import http from "node:http";
import { loadEnv } from "./config.js";
import { FirestoreStore } from "./firestore.js";
import { log } from "./log.js";
import { HookError, Runner } from "./runner.js";
import { makeSecretReader } from "./secrets.js";
import { LogStore, MemoryStore } from "./status.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createEgressProxy } from "./egress-proxy.js";
import { HOST_ADDR, PROXY_PORT, setupNamespace } from "./netns.js";
import { makeSteps } from "./steps.js";

const execFileAsync = promisify(execFile);

// The image installs `unzip`; using it rather than a Node library keeps the package
// path free of a dependency that would have to be trusted with untrusted archives.
// -o so a re-fetch overwrites, and the destination is created by the caller.
async function unzipArchive(archive, dest) {
  await execFileAsync("unzip", ["-q", "-o", archive, "-d", dest], { timeout: 60_000 });
}
import { DirBackend, S3Backend, Syncer } from "./sync/index.js";

// Lambda posts every lifecycle and build hook under this prefix, on the port
// declared as Hooks.Port in the stack.
const HOOK_PREFIX = "/aws/lambda-microvms/runtime/v1";

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new HookError(400, `body is not valid JSON: ${err.message}`);
  }
}

export function createServer({ runner, env }) {
  const routes = {
    // The image build hook. It answers before /run has happened, because at build
    // time there is no VM yet: this only says the process is up and listening.
    [`POST ${HOOK_PREFIX}/ready`]: async () => ({ status: 200, body: { ready: true } }),
    [`POST ${HOOK_PREFIX}/run`]: async (req) => {
      const body = await readJson(req);
      return { status: 200, body: await runner.run(body) };
    },
    [`POST ${HOOK_PREFIX}/resume`]: async () => ({ status: 200, body: await runner.resume() }),
    [`POST ${HOOK_PREFIX}/suspend`]: async () => ({ status: 200, body: await runner.suspend() }),
    [`POST ${HOOK_PREFIX}/terminate`]: async () => ({
      status: 200,
      body: await runner.terminate()
    }),
    // 202, not 200: the document exists and the work has started, but the analysis
    // is still running when this returns.
    // The result document is keyed by package name, so the caller already knows the
    // path it is asking to have recomputed. Named for the package rather than the page
    // that first asked: "analyze class" is one caller of this, not what it is.
    "POST /run-package": async (req) => ({ status: 202, body: await runner.startPackage(await readJson(req)) }),
    "POST /refresh-token": async (req) => ({
      status: 200,
      body: await runner.refreshToken(await readJson(req))
    }),
    "GET /": async () => ({
      status: 200,
      body: {
        state: runner.state,
        microvm_id: runner.microvmId,
        current_package: runner.currentAnalysis?.packageName ?? null,
        expires_at: runner.expiresAt ? new Date(runner.expiresAt).toISOString() : null,
        sync_backend: env.backend
      }
    })
  };

  return http.createServer(async (req, res) => {
    const key = `${req.method} ${req.url.split("?")[0]}`;
    const handler = routes[key];
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (!handler) return send(404, { error: "not found" });

    try {
      const { status, body } = await handler(req);
      send(status, body);
    } catch (err) {
      const status = err instanceof HookError ? err.status : 500;
      // A non-200 from a lifecycle hook is how the runner refuses to let Lambda
      // record a transition it cannot stand behind, so it is logged as the
      // meaningful event it is rather than swallowed.
      log.error("hook.failed", { route: key, status, error: err.message });
      send(status, { error: err.message, ...(err.extra ?? {}) });
    }
  });
}

export function buildRunner(env) {
  const dir = env.backend === "DIR";
  return new Runner({
    env,
    makeStore: ({ projectId }) => {
      if (env.statusBackend === "LOG") return new LogStore();
      if (env.statusBackend === "MEMORY" || dir) return new MemoryStore();
      return new FirestoreStore({ projectId });
    },
    makeSyncer: ({ bucket, prefix, root }) =>
      new Syncer({
        root,
        intervalMs: env.syncIntervalMs,
        backend: dir
          ? new DirBackend(`${env.syncDir}/${prefix}`)
          : new S3Backend({ bucket, prefix })
      }),
    // Packages are fetched from the same bucket the data syncs to, under scripts/, so
    // one execution role permission covers both.
    makePackageBackend: ({ bucket }) =>
      dir
        ? new DirBackend(`${env.syncDir}/scripts`)
        : new S3Backend({ bucket, prefix: "scripts" }),
    unzip: unzipArchive,
    // Skipped in DIR mode, which runs on a laptop with no namespaces and no need for
    // one: there is no execution role there to protect.
    startEgress: dir ? null : async () => {
      const { proxyUrl } = await setupNamespace({ proxyPort: PROXY_PORT });
      const proxy = createEgressProxy({ allowlist: env.egressAllowlist });
      await new Promise((resolve) => proxy.listen(PROXY_PORT, HOST_ADDR, resolve));
      return proxyUrl;
    },
    readSecret: dir ? async () => "dir-mode-token" : makeSecretReader(),
    steps: makeSteps()
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = loadEnv();
  const runner = buildRunner(env);
  createServer({ runner, env }).listen(env.port, () =>
    log.info("server.listening", { port: env.port, backend: env.backend })
  );
}
