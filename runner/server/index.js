import http from "node:http";
import { loadEnv } from "./config.js";
import { FirestoreStore } from "./firestore.js";
import { log } from "./log.js";
import { HookError, Runner } from "./runner.js";
import { makeSecretReader } from "./secrets.js";
import { MemoryStore } from "./status.js";
import { makeSteps } from "./steps.js";
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
    "POST /analyze": async (req) => ({ status: 202, body: await runner.analyze(await readJson(req)) }),
    "POST /refresh-token": async (req) => ({
      status: 200,
      body: await runner.refreshToken(await readJson(req))
    }),
    "GET /": async () => ({
      status: 200,
      body: {
        state: runner.state,
        microvm_id: runner.microvmId,
        current_analysis: runner.currentAnalysis?.analysisId ?? null,
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
    // DIR mode keeps the status documents in memory so `make run-hook` drives the
    // whole lifecycle with no Firebase project and no AWS account.
    makeStore: ({ projectId }) => (dir ? new MemoryStore() : new FirestoreStore({ projectId })),
    makeSyncer: ({ bucket, prefix, root }) =>
      new Syncer({
        root,
        intervalMs: env.syncIntervalMs,
        backend: dir
          ? new DirBackend(`${env.syncDir}/${prefix}`)
          : new S3Backend({ bucket, prefix })
      }),
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
