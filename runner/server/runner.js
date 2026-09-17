import path from "node:path";
import { log, setContext, timed } from "./log.js";
import { parseRunHookPayload, researcherPrefix } from "./config.js";
import { verifySandbox } from "./sandbox.js";
import { STATES, VmState } from "./state.js";
import { StatusWriter } from "./status.js";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

export class HookError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Orchestrates the VM's lifecycle. Everything that touches the world is injected:
// the sync backend, the Firestore store, the Secrets Manager read, and the three
// analysis steps. That is what lets the tests drive the real state sequences
// without S3, Firestore or cc-data.
export class Runner {
  #vm = new VmState();
  #analysis = null;
  #expiresAt = null;

  constructor({ env, makeStore, makeSyncer, readSecret, steps, netGuard = verifySandbox, now = () => Date.now() }) {
    this.env = env;
    // The store and the syncer are built in /run, not here: the Firebase project
    // and the bucket are per-VM values that arrive in runHookPayload, so neither
    // can be constructed before that payload exists.
    this.makeStore = makeStore;
    this.store = null;
    this.makeSyncer = makeSyncer;
    this.readSecret = readSecret;
    this.steps = steps;
    this.netGuard = netGuard;
    this.now = now;
    this.payload = null;
    this.syncer = null;
    this.status = null;
    this.microvmId = null;
  }

  get state() {
    return this.#vm.state;
  }

  get expiresAt() {
    return this.#expiresAt;
  }

  get currentAnalysis() {
    return this.#analysis;
  }

  #requireStarted() {
    if (!this.payload) throw new HookError(409, "VM has not completed /run");
  }

  // Lambda's /run. The payload is the only per-VM configuration, so a bad one fails
  // here rather than letting the VM serve traffic it cannot attribute.
  async run({ microvmId, runHookPayload }) {
    this.microvmId = microvmId ?? null;
    this.payload = parseRunHookPayload(runHookPayload);
    setContext({ researcher: this.payload.platform_user_id, microvm_id: this.microvmId });

    this.store = this.makeStore({ projectId: this.payload.firebase_project });
    this.status = new StatusWriter({
      store: this.store,
      portal: this.payload.portal,
      platformUserId: this.payload.platform_user_id
    });

    // Before anything else, and fatal if it fails. A package running as the
    // analysis user can otherwise read execution-role credentials straight from
    // IMDS, so a VM whose sandbox does not hold must not reach ready.
    await timed("run.verify_sandbox", {}, () => this.netGuard({ uid: this.env.analysisUid }));

    this.#expiresAt = this.now() + EIGHT_HOURS_MS;
    this.#vm.to(STATES.STARTING);
    await this.status.researcher({
      state: STATES.STARTING,
      microvm_id: this.microvmId,
      started_at: new Date(this.now()).toISOString(),
      expires_at: new Date(this.#expiresAt).toISOString(),
      classes: [],
      current_analysis: null
    });

    this.syncer = this.makeSyncer({
      bucket: this.payload.bucket,
      prefix: researcherPrefix(this.payload.platform_user_id),
      root: this.env.dataRoot
    });

    await timed("run.pull_down", {}, () => this.syncer.pullDown());
    const token = await timed("run.read_secret", {}, () =>
      this.readSecret(this.payload.secret_name)
    );
    await timed("run.install_credential", {}, () =>
      this.steps.installCredential({
        token,
        sessionToken: this.payload.session_token,
        portal: this.payload.portal,
        store: this.store
      })
    );

    // Started only once the VM can actually serve, so a tick can never race the
    // pull that is still writing the tree it would scan.
    this.syncer.start();

    this.#vm.to(STATES.READY);
    await this.status.researcher({ state: STATES.READY });
    return { state: this.#vm.state };
  }

  // Validation order matters: every refusal below happens before the analysis
  // document is created, so a refused request leaves Firestore untouched.
  async analyze(body) {
    this.#requireStarted();
    const { analysis_id: analysisId, scope, package: pkg, class_token: classToken } = body ?? {};

    if (!analysisId || typeof analysisId !== "string") {
      throw new HookError(400, "analysis_id is required");
    }
    if (!scope || scope.kind !== "class" || typeof scope.class_hash !== "string") {
      throw new HookError(400, "scope must be {kind: 'class', class_hash}");
    }
    if (!pkg?.name || !pkg?.version || !pkg?.checksum) {
      throw new HookError(400, "package must carry name, version and checksum");
    }
    if (typeof classToken !== "string" || classToken === "") {
      throw new HookError(400, "class_token is required");
    }
    if (this.#analysis) {
      throw new HookError(409, "an analysis is already running on this VM", {
        analysis_id: this.#analysis.analysisId
      });
    }

    // Resolving the package is what yields its declared duration, so it has to
    // precede the expiry check. It writes nothing to Firestore.
    const manifest = await this.steps.resolvePackage({ pkg });
    const expectedMs = (manifest.expected_duration_seconds ?? 0) * 1000;
    const remainingMs = this.#expiresAt - this.now();
    if (remainingMs < expectedMs) {
      throw new HookError(
        409,
        `VM expires in ${Math.floor(remainingMs / 1000)}s, less than the package's expected ${manifest.expected_duration_seconds}s`
      );
    }

    const classHash = scope.class_hash;
    setContext({ class_hash: classHash, analysis_id: analysisId });
    await this.status.analysisCreated(classHash, analysisId, {
      pkg,
      requestedBy: this.payload.platform_user_id
    });

    this.#vm.to(STATES.RUNNING);
    await this.status.researcher({ state: STATES.RUNNING, current_analysis: analysisId });

    const record = { analysisId, classHash, classToken, manifest, pkg };
    this.#analysis = record;
    // The caller gets 202 as soon as the document exists; the work continues here.
    record.done = this.#runAnalysis(record).catch((err) =>
      log.error("analyze.unhandled", { error: err.message })
    );

    return {
      analysis_id: analysisId,
      doc_path: `researcher_dashboard/${this.payload.portal}/classes/${classHash}/analyses/${analysisId}`
    };
  }

  async #runAnalysis(record) {
    const { analysisId, classHash } = record;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`analysis exceeded ${this.env.analysisTimeoutMs}ms`)),
        this.env.analysisTimeoutMs
      );
    });

    try {
      const result = await Promise.race([this.#analysisSteps(record), timeout]);
      await this.status.classCounts(classHash, result.counts);
      await this.status.analysisDone(classHash, analysisId, result.display);
    } catch (err) {
      log.error("analyze.failed", { error: err.message });
      await this.status.analysisFailed(classHash, analysisId, err.message);
    } finally {
      // Cleared rather than unref'd: unref would stop the timeout firing whenever
      // nothing else holds the loop, and leaving it armed would keep a handle alive
      // for the full timeout after a fast analysis.
      clearTimeout(timer);
      this.#analysis = null;
      setContext({ class_hash: null, analysis_id: null });
      // An analysis failure is the analysis's, not the VM's: the VM is still able
      // to serve, so it returns to ready. Only a failed sync makes the VM failed.
      if (!this.#vm.isTerminal && this.#vm.state === STATES.RUNNING) {
        this.#vm.to(STATES.READY);
        await this.status.researcher({ state: STATES.READY, current_analysis: null });
      }
    }
  }

  async #analysisSteps(record) {
    const { analysisId, classHash, classToken, manifest } = record;
    const stage = async (name, fn) => {
      await this.status.analysisStage(classHash, analysisId, name);
      return timed(`analyze.${name}`, {}, fn);
    };

    const counts = await stage("pull", () =>
      this.steps.pullData({ classHash, classToken, dataRoot: this.env.dataRoot })
    );
    const display = await stage("run_package", () =>
      this.steps.runPackage({
        manifest,
        classHash,
        dataRoot: this.env.dataRoot,
        outputDir: path.join(this.env.workRoot, "out", analysisId)
      })
    );
    // Syncing here rather than only at suspend is what bounds the hook's work: a
    // crash after this point loses at most the next analysis, not this one.
    await stage("sync", async () => {
      const result = await this.syncer.flushAndVerify("analyze");
      if (!result.ok) throw new Error(result.reason);
    });

    return { counts, display };
  }

  async suspend() {
    this.#requireStarted();
    this.#vm.to(STATES.SUSPENDING);
    await this.status.researcher({ state: STATES.SUSPENDING });

    const result = await this.syncer.flushAndVerify("suspend");
    if (!result.ok) {
      this.#vm.to(STATES.FAILED);
      await this.status.researcher({ state: STATES.FAILED, error: result.reason });
      throw new HookError(500, result.reason);
    }

    this.syncer.stop();
    this.#vm.to(STATES.SUSPENDED);
    await this.status.researcher({ state: STATES.SUSPENDED });
    return { state: this.#vm.state, ...result };
  }

  async resume() {
    this.#requireStarted();
    this.#vm.to(STATES.READY);
    this.syncer.start();
    await this.status.researcher({ state: STATES.READY });
    return { state: this.#vm.state };
  }

  async terminate() {
    this.#requireStarted();
    // A VM torn down mid-analysis leaves a document that would otherwise read
    // `running` forever, so it is failed here before the VM stops writing.
    if (this.#analysis) {
      const { classHash, analysisId } = this.#analysis;
      await this.status.analysisFailed(classHash, analysisId, "VM terminated during analysis");
      this.#analysis = null;
    }

    const result = await this.syncer.flushAndVerify("terminate");
    this.syncer.stop();
    if (!result.ok) {
      this.#vm.to(STATES.FAILED);
      await this.status.researcher({ state: STATES.FAILED, error: result.reason });
      throw new HookError(500, result.reason);
    }

    this.#vm.to(STATES.TERMINATED);
    await this.status.researcher({ state: STATES.TERMINATED });
    return { state: this.#vm.state, ...result };
  }

  // Lets the portal hand a running VM a fresh session token without a relaunch,
  // for when the custom token's hour expires under a long session.
  async refreshToken(body) {
    this.#requireStarted();
    const token = body?.session_token;
    if (typeof token !== "string" || token === "") {
      throw new HookError(400, "session_token is required");
    }
    this.payload.session_token = token;
    await this.steps.installCredential({ sessionToken: token, store: this.store });
    log.info("refresh_token.ok", {});
    return { ok: true };
  }
}
