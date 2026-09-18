import path from "node:path";
import { log, redact, setContext, timed } from "./log.js";
import { parseRunHookPayload, researcherPrefix } from "./config.js";
import { verifySandbox } from "./sandbox.js";
import { PROXY_PORT, setupNamespace } from "./netns.js";
import { STATES, VmState } from "./state.js";
import { StatusWriter } from "./status.js";
import { revokeOwnToken } from "./report-server.js";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

// The claims a runner token carries, read without verifying the signature: Firebase
// verifies it at sign-in, and this is only checking that the token says what the
// request says. A token whose claims cannot be read at all is not rejected here, since
// sign-in is the thing that decides whether it is real.
export function tokenClaims(token) {
  try {
    const [, payload] = String(token).split(".");
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json)?.claims ?? null;
  } catch {
    return null;
  }
}

function isTokenMap(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([app, token]) => app !== "" && typeof token === "string" && token !== "");
}

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
  // One signed-in connection per class, kept for the VM's life. The class token is
  // good for an hour but the Firebase session it is exchanged for outlives it, and a
  // resumed VM keeps it because memory is preserved.
  #classStores = new Map();
  #expiresAt = null;

  constructor({ env, makeStore, makeSyncer, makePackageBackend, readSecret, steps, unzip, startEgress, netGuard = verifySandbox, revokeReportServerToken = revokeOwnToken, now = () => Date.now() }) {
    this.env = env;
    // The store and the syncer are built in /run, not here: the Firebase project
    // and the bucket are per-VM values that arrive in runHookPayload, so neither
    // can be constructed before that payload exists.
    this.makeStore = makeStore;
    // Packages live under their own prefix of the same bucket the researcher's data
    // syncs to, so the backend is built per run like the syncer's; unzip is injected so
    // the tests need neither S3 nor a real archive.
    this.makePackageBackend = makePackageBackend;
    this.unzip = unzip;
    // Builds the analysis namespace and starts the egress proxy. Injected so the tests
    // need neither root nor a network, and so DIR mode can skip it.
    this.startEgress = startEgress;
    this.store = null;
    this.makeSyncer = makeSyncer;
    this.readSecret = readSecret;
    this.steps = steps;
    this.netGuard = netGuard;
    // Injected so the tests need no network and DIR mode can decline to revoke.
    this.revokeReportServerToken = revokeReportServerToken;
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
      platformUserId: this.payload.platform_user_id,
      platformId: this.payload.platform_id,
      classStore: (classHash) => this.#classStores.get(classHash) ?? this.store
    });

    // Before anything else, and fatal if it fails. A package running as the
    // analysis user can otherwise read execution-role credentials straight from
    // IMDS, so a VM whose sandbox does not hold must not reach ready.
    // The namespace and its proxy come up before the sandbox is verified, because the
    // verification now asserts the proxy is reachable as well as that the metadata
    // service is not: without the positive check, a namespace with no route at all
    // would verify clean and leave every package silently offline.
    if (this.startEgress) {
      this.proxyUrl = await timed("run.start_egress", {}, () => this.startEgress());
    }
    await timed("run.verify_sandbox", {}, () =>
      this.netGuard({ uid: this.env.analysisUid, proxyUrl: this.proxyUrl })
    );

    this.#expiresAt = this.now() + EIGHT_HOURS_MS;
    this.#vm.to(STATES.STARTING);
    await this.status.researcher({
      state: STATES.STARTING,
      microvm_id: this.microvmId,
      started_at: new Date(this.now()).toISOString(),
      expires_at: new Date(this.#expiresAt).toISOString(),
      classes: [],
      current_package: null
    });

    this.packageBackend = this.makePackageBackend?.({ bucket: this.payload.bucket });
    this.syncer = this.makeSyncer({
      bucket: this.payload.bucket,
      prefix: researcherPrefix(this.payload.platform_user_id),
      root: this.env.dataRoot
    });

    await timed("run.pull_down", {}, () => this.syncer.pullDown());
    // Forwarding hands the researcher's own token straight down in the payload, so
    // there is nothing to fetch. The Secrets Manager path is the shared site-admin
    // token and stays only until that lands; parseRunHookPayload permits exactly one
    // of the two, so this branch cannot silently take both.
    const forwarded = this.payload.report_server_token;
    const token = forwarded
      ? forwarded
      : await timed("run.read_secret", {}, () => this.readSecret(this.payload.secret_name));
    log.info("run.report_server_credential", { forwarded: Boolean(forwarded) });
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

  // Validation order matters: every refusal below happens before the result document
  // is touched, so a refused request leaves Firestore unchanged.
  async startPackage(body) {
    this.#requireStarted();
    const { scope, package: pkg, class_tokens: classTokens } = body ?? {};

    if (!scope || scope.kind !== "class" || typeof scope.class_hash !== "string") {
      throw new HookError(400, "scope must be {kind: 'class', class_hash}");
    }
    if (!pkg?.name || !pkg?.version || !pkg?.checksum) {
      throw new HookError(400, "package must carry name, version and checksum");
    }
    // The package name is the result document's id, so it has to be a single path
    // segment; a name with a slash would silently write a nested collection.
    if (pkg.name.includes("/") || pkg.name === "." || pkg.name === "..") {
      throw new HookError(400, "package name must be a single path segment");
    }
    // One class token per Firebase project the analysis touches, keyed by FirebaseApp
    // name, since a custom token is signed by one project's service account and cannot
    // be exchanged in another.
    if (!isTokenMap(classTokens)) {
      throw new HookError(400, "class_tokens must map a firebase app name to a token");
    }
    // The mint is the only gate on which class a researcher may read, and the design
    // says so explicitly. This is the second line: a token that names a different class
    // or a different researcher than the request would pull another class's student
    // work into this researcher's prefix and hand it to their package. Cheap to check,
    // and it fails a launcher bug loudly instead of silently mixing corpora.
    for (const [app, token] of Object.entries(classTokens)) {
      const claims = tokenClaims(token);
      if (!claims) continue;
      if (claims.class_hash && claims.class_hash !== scope.class_hash) {
        throw new HookError(400, `the ${app} class token names class ${claims.class_hash}, not the requested class`);
      }
      if (claims.platform_user_id != null
          && String(claims.platform_user_id) !== String(this.payload.platform_user_id)) {
        throw new HookError(400, `the ${app} class token belongs to another researcher`);
      }
    }
    if (this.#analysis) {
      throw new HookError(409, "a package is already running on this VM", {
        package: this.#analysis.packageName
      });
    }
    // Claimed synchronously, before the first await. resolvePackage and
    // resultStarted both yield, so a guard that only set #analysis afterwards let
    // two concurrent /analyze calls past it, and only one of them would then be
    // terminated or cleared. The claim is released on every refusal below, or a
    // rejected request would leave the VM permanently busy.
    const classHash = scope.class_hash;
    const packageName = pkg.name;
    this.#analysis = { packageName, classHash };

    let record;
    try {
      // Resolving the package is what yields its declared duration, so it has to
      // precede the expiry check. It writes nothing to Firestore.
      const manifest = await this.steps.resolvePackage({
        pkg,
        backend: this.packageBackend,
        workRoot: this.env.workRoot,
        unzip: this.unzip
      });
      const expectedMs = (manifest.expected_duration_seconds ?? 0) * 1000;
      const remainingMs = this.#expiresAt - this.now();
      if (remainingMs < expectedMs) {
        throw new HookError(
          409,
          `VM expires in ${Math.floor(remainingMs / 1000)}s, less than the package's expected ${manifest.expected_duration_seconds}s`
        );
      }

      setContext({ class_hash: classHash, package: packageName });
      await this.#signInForClass(classHash, classTokens);
      await this.status.resultStarted(classHash, packageName, {
        pkg,
        requestedBy: this.payload.platform_user_id
      });

      this.#vm.to(STATES.RUNNING);
      await this.status.researcher({ state: STATES.RUNNING, current_package: packageName });

      record = { packageName, classHash, classTokens, manifest, pkg };
      this.#analysis = record;
    } catch (err) {
      this.#analysis = null;
      throw err;
    }

    // The caller gets 202 as soon as the document exists; the work continues here.
    record.done = this.#runAnalysis(record).catch((err) =>
      log.error("analyze.unhandled", { error: err.message })
    );

    return {
      package: packageName,
      doc_path: `researcher_dashboard/${this.payload.portal}/classes/${classHash}/results/${packageName}`
    };
  }

  async #runAnalysis(record) {
    const { packageName, classHash } = record;
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
      await this.status.resultDone(classHash, packageName, result.display);
    } catch (err) {
      log.error("analyze.failed", { error: err.message });
      await this.status.resultFailed(classHash, packageName, redact(err.message));
    } finally {
      // Cleared rather than unref'd: unref would stop the timeout firing whenever
      // nothing else holds the loop, and leaving it armed would keep a handle alive
      // for the full timeout after a fast analysis.
      clearTimeout(timer);
      this.#analysis = null;
      setContext({ class_hash: null, package: null });
      // An analysis failure is the analysis's, not the VM's: the VM is still able
      // to serve, so it returns to ready. Only a failed sync makes the VM failed.
      if (!this.#vm.isTerminal && this.#vm.state === STATES.RUNNING) {
        this.#vm.to(STATES.READY);
        await this.status.researcher({ state: STATES.READY, current_package: null });
      }
    }
  }

  // The session token carries no class_hash, so it cannot write this class's documents:
  // report-service's rules refuse it rather than ignoring the mismatch. This exchanges
  // the class token for that project once and keeps the session.
  async #signInForClass(classHash, classTokens) {
    if (this.#classStores.has(classHash)) return this.#classStores.get(classHash);
    const projectId = this.payload.firebase_project;
    const token = classTokens?.[projectId];
    if (!token) {
      throw new HookError(400, `class_tokens carries no token for ${projectId}, so this class's results cannot be written`);
    }
    const store = this.makeStore({ projectId, appName: `runner-${projectId}-${classHash}` });
    await store.signIn(token);
    this.#classStores.set(classHash, store);
    log.info("status.class_signed_in", { class_hash: classHash, project: projectId });
    return store;
  }

  async #analysisSteps(record) {
    const { packageName, classHash, classTokens, manifest } = record;
    const stage = async (name, fn) => {
      await this.status.resultStage(classHash, packageName, name);
      return timed(`analyze.${name}`, {}, fn);
    };

    // The runner pulls only what needs a credential the package must not hold, which
    // today is CLUE: its class runner token is a Firebase credential, where the
    // report-server token is the researcher's own and can be handed over.
    const counts = await stage("pull", () =>
      this.steps.pullData({
        classHash,
        classTokens,
        manifest,
        portal: this.payload.portal,
        dataRoot: this.env.dataRoot,
        makeStore: this.makeStore
      })
    );

    const prepared = await stage("prepare_package", () =>
      this.steps.preparePackage({
        workRoot: this.env.workRoot,
        dataRoot: this.env.dataRoot,
        classHash,
        packageName,
        portal: this.payload.portal,
        reportServerToken: this.payload.report_server_token,
        uid: this.env.analysisUid
      })
    );

    const display = await stage("run_package", () =>
      this.steps.runPackage({
        manifest,
        paths: prepared.paths,
        env: prepared.env,
        uid: this.env.analysisUid,
        timeoutMs: this.env.analysisTimeoutMs,
        proxyUrl: this.proxyUrl
      })
    );

    // The package made the AP and log pulls, so it knows those counts and cannot write
    // Firestore. Its numbers do not overwrite the runner's own: clue_documents is the
    // runner's, and a package that reports it anyway does not get to claim it.
    const reported = await this.steps.readPackageCounts({ outputDir: prepared.paths.outputDir });
    Object.assign(counts, reported, counts);

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
      const { classHash, packageName } = this.#analysis;
      await this.status.resultFailed(classHash, packageName, "VM terminated during analysis");
      this.#analysis = null;
    }

    // Only the researcher's own forwarded credential. A VM that arrived with
    // `secret_name` is holding the shared account's token, which belongs to every VM
    // and must outlive this one.
    //
    // Before the sync, because the sync can fail the hook and the credential should
    // stop working whether or not the data made it out. Revocation needs nothing from S3.
    if (this.payload.report_server_token) {
      try {
        await this.revokeReportServerToken({
          baseUrl: this.payload.report_server_url,
          token: this.payload.report_server_token
        });
        log.info("terminate.revoked", {});
      } catch (err) {
        // The VM is going either way, and an unrevoked token is a residual the design
        // accepts: the researcher's next launch revokes it when it mints the next one.
        // Failing the hook here would buy nothing and would mark the researcher's
        // document failed for something that is not a data loss.
        log.warn("terminate.revoke_failed", { error: err.message });
      }
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
    const reportServerToken = body?.report_server_token;
    if (typeof token !== "string" || token === "") {
      throw new HookError(400, "session_token is required");
    }
    // A replacement for a different researcher would leave the VM signed in as one
    // principal while writing another's document paths. The rules deny that, so it
    // fails closed either way, but it fails as an opaque permission error much later
    // rather than here where the cause is obvious.
    const claims = tokenClaims(token);
    if (claims?.platform_user_id != null
        && String(claims.platform_user_id) !== String(this.payload.platform_user_id)) {
      throw new HookError(400, "the replacement session token belongs to another researcher");
    }

    this.payload.session_token = token;
    await this.steps.installCredential({ sessionToken: token, store: this.store });

    // The report-server credential is minted per launch and the VM outlives it if it is
    // ever given a shorter life, so /refresh-token carries a replacement for it too.
    if (typeof reportServerToken === "string" && reportServerToken !== "") {
      this.payload.report_server_token = reportServerToken;
      await this.steps.installCredential({
        token: reportServerToken,
        portal: this.payload.portal
      });
    }

    log.info("refresh_token.ok", { report_server_token: Boolean(reportServerToken) });
    return { ok: true };
  }
}
