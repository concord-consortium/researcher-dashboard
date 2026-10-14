import { log, setContext, timed } from "./log.js";
import { VM_LIFE_SECONDS, defaultChainState, parseRunHookPayload, researcherPrefix } from "./config.js";
import { verifySandbox } from "./sandbox.js";
import { STATES, VmState, canTransition } from "./state.js";
import { ClassDocuments, RunnerStatus, bounded } from "./status.js";
import { askApplies, revokeOwnToken } from "./report-server.js";
import { CHECKSUM, declaresPatterns, IDENTITY, PACKAGE_DOC_ID, VERSION, packageDocId } from "./package-fetch.js";

const EIGHT_HOURS_MS = VM_LIFE_SECONDS * 1000;
// Kept back from the window for the last flush and the /terminate hook at the VM's cap.
export const WINDOW_RESERVE_MS = 5 * 60_000;
// The watchdog's margin on a declared duration, and the in-VM timeout's.
export const PACKAGE_TIMEOUT_MARGIN_MS = 10 * 60_000;
// /work refuses the VM until the function has recorded its launch, one transaction after
// RunMicrovm returns, so a 409 this soon after /run is retried.
export const LAUNCH_RECORD_WINDOW_MS = 60_000;
export const LAUNCH_RETRY_MS = 5_000;
export const CLAIM_ATTEMPTS = 3;
export const TOKEN_TIMEOUT_MS = 15_000;
// The report-server revocation in /terminate, inside the hook's 60 seconds.
export const REVOKE_TIMEOUT_MS = 10_000;
// How long a package past its bound has, once killed, for its step to end.
export const PACKAGE_END_TIMEOUT_MS = 10_000;
// A claim's heartbeat_seconds and the interval its beats are written at, which the
// watchdog's lease is five of. report-service's rules allow 30 to 120.
export const HEARTBEAT_SECONDS = 60;
// The reason every lost run is failed with, by this runner and by the watchdog alike.
export const LOST_RUN_REASON = "The machine running it stopped before the run finished; run it again.";

export class HookError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref?.());

const everyInterval = (ms, fn) => {
  const timer = setInterval(fn, ms);
  return () => clearInterval(timer);
};

// Orchestrates the VM's lifecycle and its pull loop. Everything that touches the world is
// injected: the stores, the function, the storage credentials, the sync and package
// backends, the egress setup and the package steps. That is what lets the tests drive the
// real sequences without S3, Firestore, report-service or cc-data.
export class Runner {
  #vm = new VmState();
  // The package running now, and the class store it writes its result through.
  #run = null;
  // This request's session: the store the status document is written through.
  #session = null;
  // This request's class stores, by class hash. Never kept past the next /work.
  #classStores = new Map();
  // Each resume starts a new epoch; a loop or a call from an earlier one stands down.
  #epoch = 0;
  #loop = null;
  #expiresAt = null;
  #readyAt = null;
  #ready = false;
  #suspendSeen = false;
  #terminating = false;
  // Failed claim attempts per queued entry, for this awake period: cleared when the
  // entry's result is written and on every resume.
  #claimFailures = new Map();
  // Verified manifests, or the fetch under way, by identity, version and checksum, which
  // never change for the VM's life, so a re-plan does not fetch and unpack the archive again.
  #manifests = new Map();
  // report-server's yes for a class, identity and version, for this awake period.
  #applies = new Set();
  // The last state the loop wrote, so an idle poll does not rewrite an unchanged document.
  #lastWritten = null;

  constructor({ env, makeStore, makeSyncer, makePackageBackend, makeStorage = () => null, makeFunctionClient, steps, unzip, startEgress, netGuard = verifySandbox, revokeReportServerToken = revokeOwnToken, askAppliesRoute = askApplies, now = () => Date.now(), sleep = sleepFor, startTimer = everyInterval, processEnv = process.env }) {
    this.env = env;
    this.processEnv = processEnv;
    // The store, the syncer and the function client are built in /run, not here: the
    // Firebase project, the bucket and the function's URL are per-VM values that arrive
    // in runHookPayload.
    this.makeStore = makeStore;
    this.makeSyncer = makeSyncer;
    this.makePackageBackend = makePackageBackend;
    this.makeStorage = makeStorage;
    this.makeFunctionClient = makeFunctionClient;
    this.unzip = unzip;
    // Builds the package namespace and starts the egress proxy. Injected so the tests
    // need neither root nor a network, and so DIR mode can skip it.
    this.startEgress = startEgress;
    this.steps = steps;
    this.netGuard = netGuard;
    this.revokeReportServerToken = revokeReportServerToken;
    this.askApplies = askAppliesRoute;
    this.now = now;
    this.sleep = sleep;
    // Separate from `sleep`, which the loop waits on: the heartbeat ticks beside it.
    this.startTimer = startTimer;
    this.payload = null;
    this.syncer = null;
    this.storage = null;
    this.status = null;
    this.microvmId = null;
  }

  get state() {
    return this.#vm.state;
  }

  get expiresAt() {
    return this.#expiresAt;
  }

  get currentRun() {
    return this.#run;
  }

  // The outstanding run as the runner document names it, or null.
  get currentPackage() {
    return this.#run ? { class_hash: this.#run.classHash, package_key: this.#run.docId } : null;
  }

  // Resolves when the pull loop now running stops: drained and suspended, or stood down.
  get loop() {
    return this.#loop;
  }

  #requireStarted() {
    if (!this.#ready) throw new HookError(409, "VM has not completed /run");
  }

  // ---- /run ----------------------------------------------------------------------

  // Lambda's /run. The payload is the only per-VM configuration, so a bad one fails
  // here rather than letting the VM serve traffic it cannot attribute.
  async run({ microvmId, runHookPayload }) {
    // /work, /idle and a claimed result all need the VM's own id.
    // A VM that cannot take work is stopped now rather than left awake.
    if (typeof microvmId !== "string" || microvmId === "") {
      throw new Error("/run's body carries no microvmId, so this VM could take no work");
    }
    this.microvmId = microvmId;
    this.payload = parseRunHookPayload(runHookPayload);
    setContext({ researcher: this.payload.platform_user_id, microvm_id: this.microvmId });
    // The switch is made when the process starts, which is the image build, before the
    // snapshot; this is each VM's own record that it still holds.
    const chain = defaultChainState(this.processEnv);
    if (chain.disabled) log.info("aws.default_chain_disabled", {});
    else log.error("aws.default_chain_enabled", { present: chain.present });
    this.callFunction = this.makeFunctionClient({ baseUrl: this.payload.function_url });

    // Before anything else, and fatal if it fails: a package running as the package
    // user could otherwise read execution-role credentials straight from IMDS.
    if (this.startEgress) {
      this.proxyUrl = await timed("run.start_egress", {}, () => this.startEgress());
    }
    await timed("run.verify_sandbox", {}, () =>
      this.netGuard({ uid: this.env.packageUid, proxyUrl: this.proxyUrl })
    );

    // Before the first status write, which needs the session token's claims. The claims
    // Firebase verified must name this VM's researcher: the S3 prefix is built from it.
    const store = await timed("run.sign_in", {}, () => this.#signIn(this.payload.firebase_project, this.payload.session_token));
    this.#session = store;
    this.status = new RunnerStatus({
      store,
      portal: this.payload.portal,
      platformUserId: this.payload.platform_user_id,
      platformId: this.payload.platform_id
    });

    this.#expiresAt = this.now() + EIGHT_HOURS_MS;
    this.#vm.to(STATES.STARTING);
    await this.status.writeFromHook("run", {
      state: STATES.STARTING,
      microvm_id: this.microvmId,
      image_version: this.env.imageVersion,
      expires_at: store.timestamp(new Date(this.#expiresAt)),
      current_package: null
    });

    // Every S3 call from here on, the pull-down first, goes through the broker's
    // credentials, fetched with this session's ID token.
    const prefix = researcherPrefix(this.payload.platform_user_id);
    this.storage = this.makeStorage({
      bucket: this.payload.bucket,
      prefix,
      fetchCredentials: () => this.#call("storage-credentials", {})
    });
    this.packageBackend = this.makePackageBackend({ bucket: this.payload.bucket, storage: this.storage });
    this.syncer = this.makeSyncer({
      bucket: this.payload.bucket,
      prefix,
      root: this.env.dataRoot,
      storage: this.storage
    });
    if (this.storage) await timed("run.storage_credentials", {}, () => this.storage.client());

    await timed("run.pull_down", {}, () => this.syncer.pullDown());
    await timed("run.install_credential", {}, () =>
      this.steps.installCredential({ token: this.payload.report_server_token, portal: this.payload.portal })
    );

    // Started only once the VM can serve, so a tick can never race the pull that is
    // still writing the tree it would scan.
    this.syncer.start();
    this.#vm.to(STATES.READY);
    this.#ready = true;
    this.#readyAt = this.now();
    await this.status.writeFromHook("run", { state: STATES.READY, scopes: await this.#heldScopes() });

    // The queue is asked for once /run has answered Lambda, which gives it 60 seconds.
    this.#startLoop({ afterResume: false });
    return { state: this.#vm.state };
  }

  // A store signed in with `token`, whose Firebase-verified claims name this VM's
  // researcher and portal and carry the runner claim; and, for a class token, its class.
  async #signIn(projectId, token, classHash = null) {
    const store = this.makeStore({ projectId });
    try {
      await store.signIn(token);
      const claims = await store.claims();
      const refuse = (why) => { throw new Error(`the ${classHash ? `class ${classHash}` : "session"} token ${why}`); };
      if (claims.platform_user_id == null || String(claims.platform_user_id) !== String(this.payload.platform_user_id)) {
        refuse(`names researcher ${claims.platform_user_id}, not ${this.payload.platform_user_id}`);
      }
      if (claims.platform_id !== this.payload.platform_id) refuse(`names portal ${claims.platform_id}, not ${this.payload.platform_id}`);
      if (claims.researcher_dashboard_runner !== true) refuse("carries no runner claim");
      if (classHash && claims.class_hash !== classHash) refuse(`names class ${claims.class_hash}`);
      return store;
    } catch (err) {
      await store.close?.().catch(() => {});
      throw err;
    }
  }

  async #call(route, body, { force = false } = {}) {
    const idToken = await bounded(this.#session.idToken(force), TOKEN_TIMEOUT_MS, "an ID token");
    return this.callFunction(route, { idToken, body });
  }

  async #heldScopes(alsoHolding) {
    const held = await this.steps.heldClasses({ dataRoot: this.env.dataRoot });
    return [...new Set([...held, ...(alsoHolding ? [alsoHolding] : [])])].sort();
  }

  // ---- the pull loop -------------------------------------------------------------

  #startLoop({ afterResume }) {
    const epoch = this.#epoch;
    this.#loop = this.#workLoop(epoch, afterResume).catch((err) => log.error("work.loop_failed", { error: err.message }));
  }

  #current(epoch) {
    return epoch === this.#epoch && !this.#vm.isTerminal;
  }

  // Asks for work, runs it one package at a time, asking again after each, and once
  // nothing is left, keeps asking through the idle period before asking to be
  // suspended. Every answer from an earlier epoch is ignored.
  async #workLoop(epoch, afterResume) {
    let force = afterResume;
    let idleSince = null;
    let refreshed = !afterResume;
    while (this.#current(epoch)) {
      let answer;
      try {
        answer = await this.#call("work", { microvm_id: this.microvmId }, { force });
      } catch (err) {
        if (!this.#current(epoch)) return;
        const launching = err.status === 409 && this.now() - this.#readyAt < LAUNCH_RECORD_WINDOW_MS;
        log.warn("work.failed", { status: err.status ?? null, error: err.message, retry_in_ms: launching ? LAUNCH_RETRY_MS : this.env.idlePollMs });
        await this.sleep(launching ? LAUNCH_RETRY_MS : this.env.idlePollMs);
        continue;
      }
      if (!this.#current(epoch)) return;
      force = false;

      let request;
      try {
        request = await this.#adopt(answer, epoch);
      } catch (err) {
        log.error("work.token_refused", { error: err.message });
        await this.sleep(this.env.idlePollMs);
        continue;
      }

      if (!request) return;

      // After a resume: fresh credentials before the syncer ticks again, and nothing
      // claimed until a package the suspend interrupted has finished.
      if (!refreshed) {
        try {
          this.storage?.markStale();
          if (this.storage) await this.storage.client();
        } catch (err) {
          log.error("storage.credentials_failed", { error: err.message });
          await this.sleep(this.env.idlePollMs);
          continue;
        }
        if (!this.#current(epoch)) return;
        this.syncer.start();
        refreshed = true;
        // A refused suspend left the VM failed; the loop now running puts it back in service.
        if (this.#vm.state === STATES.FAILED) this.#vm.to(STATES.READY);
      }
      if (this.#run) await this.#run.done;
      if (!this.#current(epoch)) return;

      const next = await this.#plan(request, epoch);
      if (!this.#current(epoch)) return;
      if (next) {
        idleSince = null;
        // A claim that could not be written is tried again after one idle poll, not at once.
        if (!(await this.#runPackage(request, next, epoch))) await this.sleep(this.env.idlePollMs);
        continue;
      }

      if (this.#lastWritten !== STATES.READY) {
        const written = await this.status.writeFromHook("work", { state: STATES.READY, current_package: null, queue: [] });
        if (written && this.#current(epoch)) this.#lastWritten = STATES.READY;
      }
      if (this.#vm.state === STATES.RUNNING) this.#vm.to(STATES.READY);
      idleSince ??= this.now();
      if (this.now() - idleSince < this.env.idlePeriodMs) {
        await this.sleep(this.env.idlePollMs);
        continue;
      }

      // The flush the /suspend hook would make, made first, so no suspend depends on the
      // hook being delivered.
      const flushed = await this.syncer.flushAndVerify("idle");
      if (!this.#current(epoch)) return;
      if (!flushed.ok) {
        log.error("sync.failed", { hook: "idle", error: flushed.reason });
        idleSince = this.now();
        continue;
      }
      let idle;
      try {
        idle = await this.#call("idle", { microvm_id: this.microvmId });
      } catch (err) {
        if (!this.#current(epoch)) return;
        log.warn("idle.failed", { status: err.status ?? null, error: err.message });
        idleSince = this.now();
        continue;
      }
      if (!this.#current(epoch)) return;
      if (idle.work_queued) {
        idleSince = null;
        continue;
      }
      if (idle.suspended) {
        log.info("idle.suspended", {});
        return;
      }
      // Declined without work to hand out, most often a run still recorded as running
      // here: wait out another idle period rather than asking again at once.
      log.warn("idle.declined", { answer: idle });
      idleSince = this.now();
    }
  }

  // Adopts a /work answer: a new session store and a new store per class, each signed
  // in with this answer's tokens and checked against this VM's researcher before its
  // first write. The last request's stores are closed, except one a package still uses.
  async #adopt(answer, epoch) {
    if (answer.firebase_project !== this.payload.firebase_project) {
      throw new Error(`/work names project ${answer.firebase_project}, not ${this.payload.firebase_project}`);
    }
    const session = await this.#signIn(this.payload.firebase_project, answer.session_token);
    const classStores = new Map();
    const scopes = answer.scopes ?? {};
    for (const [classHash, { class_tokens: tokens }] of Object.entries(scopes)) {
      const token = tokens?.[this.payload.firebase_project];
      if (!token) {
        log.error("work.class_refused", { class_hash: classHash, error: `no class token for ${this.payload.firebase_project}` });
        continue;
      }
      try {
        classStores.set(classHash, await this.#signIn(this.payload.firebase_project, token, classHash));
      } catch (err) {
        log.error("work.class_refused", { class_hash: classHash, error: err.message });
      }
    }

    // A resume during the sign-ins has started a loop whose stores these must not replace.
    if (!this.#current(epoch)) {
      await Promise.all([session, ...classStores.values()].map((s) => s.close?.().catch(() => {})));
      return null;
    }
    const retiring = [this.#session, ...this.#classStores.values()].filter((s) => s && s !== this.#run?.store);
    this.#session = session;
    this.status.store = session;
    this.#classStores = classStores;
    await Promise.all(retiring.map((s) => s.close?.().catch(() => {})));
    return { packages: answer.packages ?? [], scopes, classStores };
  }

  #docs(classHash, store) {
    return new ClassDocuments({
      store,
      portal: this.payload.portal,
      classHash,
      platformUserId: this.payload.platform_user_id,
      platformId: this.payload.platform_id
    });
  }

  // Everything that can refuse a package without running it, for every package in the
  // answer, in order: the catalog grammar, its class's store and scope, the fetch and
  // checksum, the manifest, the ceiling, applicability and the window. A refused package
  // is written `failed`, never `running`. Returns the first package to run, if any.
  async #plan(request, epoch) {
    const candidates = [];
    // Entries this plan wrote `failed`, which are no longer queued.
    const resolved = new Set();
    for (const entry of request.packages) {
      // A resume stands this plan down: the new loop's plan decides, with its own stores.
      if (!this.#current(epoch)) return null;
      const store = request.classStores.get(entry.class_hash);
      if (!store) continue;
      if ((this.#claimFailures.get(this.#claimKey(entry)) ?? 0) >= CLAIM_ATTEMPTS) continue;
      const docs = this.#docs(entry.class_hash, store);
      const pkg = { identity: entry.identity, version: entry.version, checksum: entry.checksum };
      const refuse = async (error) => {
        if (!this.#current(epoch)) return;
        log.warn("package.refused", { scope: entry.class_hash, package: entry.identity, error });
        try {
          await bounded(docs.failed(docIdOf(entry), { pkg, error }));
          this.#resolved(entry, resolved);
        } catch (err) {
          this.#noteClaimFailure(entry, err, epoch);
        }
      };

      if (!IDENTITY.test(entry.identity ?? "") || !VERSION.test(entry.version ?? "") || !CHECKSUM.test(entry.checksum ?? "")
          || !Number.isInteger(entry.catalog_id) || entry.catalog_id < 1) {
        if (PACKAGE_DOC_ID.test(docIdOf(entry) ?? "")) await refuse("the queued package does not match the catalog's grammar");
        else log.error("package.refused", { error: `unusable identity ${entry.identity} and package key ${entry.package_key}` });
        continue;
      }
      const docId = packageDocId(entry.identity);
      if (entry.package_key !== undefined && entry.package_key !== docId) {
        await refuse(`/work named this package ${entry.package_key}, but its identity is ${docId}`);
        continue;
      }
      const scope = request.scopes[entry.class_hash]?.scope;
      const scopeProblem = checkScope(scope, entry.class_hash);
      if (scopeProblem) {
        await refuse(scopeProblem);
        continue;
      }

      const archiveKey = `${entry.identity}@${entry.version}@${entry.checksum}`;
      // The fetch in flight is shared, so a plan started by a resume never fetches the same
      // archive into the same directory beside it.
      if (!this.#manifests.has(archiveKey)) {
        const fetching = this.steps.resolvePackage({ pkg, backend: this.packageBackend, workRoot: this.env.workRoot, unzip: this.unzip });
        this.#manifests.set(archiveKey, fetching);
        fetching.catch(() => this.#manifests.delete(archiveKey));
      }
      let manifest;
      try {
        manifest = await this.#manifests.get(archiveKey);
      } catch (err) {
        await refuse(err.message);
        continue;
      }
      if (!this.#current(epoch)) return null;
      const declared = manifest.expected_duration_seconds;
      if (declared > this.env.packageMaxDurationSeconds) {
        await refuse(`the package declares ${declared}s, over the runner's ceiling of ${this.env.packageMaxDurationSeconds}s`);
        continue;
      }
      const appliesKey = `${entry.class_hash}/${entry.identity}@${entry.version}`;
      if (declaresPatterns(manifest.urls) && !this.#applies.has(appliesKey)) {
        let verdict;
        try {
          const profile = await docs.profile();
          if (!profile) {
            await refuse("this class's authored profile has not been derived yet; open the dashboard for it and run the package again");
            continue;
          }
          verdict = await this.askApplies({
            baseUrl: this.payload.report_server_url,
            token: this.payload.report_server_token,
            urls: manifest.urls,
            scopeUrls: [...(profile.assignment_urls ?? []), ...(profile.interactive_urls ?? [])]
          });
        } catch (err) {
          if (!this.#current(epoch)) return null;
          log.warn("report_server.refused", { call: "applies", scope: entry.class_hash, package: entry.identity, status: err.status ?? null, error: err.message });
          if (err.refusal) {
            await refuse(`report-server would not check this package against this class: ${err.message}`);
          } else if (this.#noteClaimFailure(entry, err, epoch) >= CLAIM_ATTEMPTS) {
            // Left queued, the package would keep the VM awake until its cap, since /idle
            // declines to suspend while work is queued.
            await refuse(`report-server could not say whether the package applies to this class (${err.message}); run it again`);
          }
          continue;
        }
        if (!verdict.applies) {
          await refuse(`the package does not apply to this class: ${verdict.reason}`);
          continue;
        }
        if (this.#current(epoch)) this.#applies.add(appliesKey);
      }
      candidates.push({ entry, pkg, docId, docs, store, scope, manifest, declared });
    }

    // The window, up front: the answer's declared durations in order, against what the
    // VM has left; from the package the window runs out on, every one is failed.
    if (!this.#current(epoch)) return null;
    const left = this.#expiresAt - WINDOW_RESERVE_MS - this.now();
    let sum = 0;
    let runnable = null;
    for (const candidate of candidates) {
      if (!this.#current(epoch)) return null;
      sum += candidate.declared * 1000;
      if (sum > left) {
        await bounded(candidate.docs.failed(candidate.docId, {
          pkg: candidate.pkg,
          error: `VM window exhausted: ${Math.max(0, Math.floor(left / 1000))}s left, and this package and the ones before it declare ${Math.floor(sum / 1000)}s`
        })).then(() => this.#resolved(candidate.entry, resolved), (err) => this.#noteClaimFailure(candidate.entry, err, epoch));
        continue;
      }
      runnable ??= candidate;
    }
    return runnable && { ...runnable, resolved };
  }

  #claimKey(entry) {
    return `${entry.class_hash}/${entry.identity}`;
  }

  // The entry's result is written, so it starts again from no failed attempts if it is
  // queued again.
  #resolved(entry, resolved) {
    this.#claimFailures.delete(this.#claimKey(entry));
    resolved?.add(this.#claimKey(entry));
  }

  // A failure that settles after a resume belongs to the period the resume ended, whose
  // counts the resume cleared, so it is not charged to the new one.
  #noteClaimFailure(entry, err, epoch) {
    if (!this.#current(epoch)) return 0;
    const key = this.#claimKey(entry);
    const count = (this.#claimFailures.get(key) ?? 0) + 1;
    this.#claimFailures.set(key, count);
    log.error("package.claim_failed", { scope: entry.class_hash, package: entry.identity, attempt: count, error: err.message });
    return count;
  }

  // Beats every HEARTBEAT_SECONDS until stopped, skipping a tick while the last beat is
  // still unsettled. `settled` stops it and waits out a beat in flight.
  #startHeartbeat(docs, docId) {
    let inFlight = null;
    const cancel = this.startTimer(HEARTBEAT_SECONDS * 1000, () => {
      if (inFlight) return;
      inFlight = docs.beat(docId)
        .catch((err) => log.warn("heartbeat.failed", { error: err.message }))
        .finally(() => { inFlight = null; });
    });
    return { cancel, settled: async () => { cancel(); await inFlight; } };
  }

  // While a run is outstanding every runner-document write names it, so a write lost at
  // the claim is repaired by the next one and the document never names an earlier run.
  #runningPackage() {
    return this.#run ? { current_package: this.currentPackage } : {};
  }

  async #runPackage(request, next, epoch) {
    const { entry, pkg, docId, docs, store, scope, manifest, declared, resolved } = next;
    let resolveDone;
    this.#run = { docId, classHash: entry.class_hash, store, docs, pkg, done: new Promise((r) => { resolveDone = r; }) };
    setContext({ scope: entry.class_hash, package: entry.identity });
    try {
      try {
        await docs.claim(docId, { pkg, imageVersion: this.env.imageVersion, microvmId: this.microvmId, expectedDurationSeconds: declared, heartbeatSeconds: HEARTBEAT_SECONDS });
      } catch (err) {
        this.#noteClaimFailure(entry, err, epoch);
        return false;
      }
      this.#resolved(entry);
      // The VM is ending: the hook has written this run failed and the runner document
      // terminated, which may by now name a newer VM, so nothing more is written or run.
      if (this.#terminating) return true;
      // A claim that lands while a hook is suspending or ending the VM runs on regardless;
      // the hook's own state stands until the resume.
      if (this.#vm.state !== STATES.RUNNING && canTransition(this.#vm.state, STATES.RUNNING)) this.#vm.to(STATES.RUNNING);
      // What is still queued: not the claimed entry, nor one this plan failed.
      const queue = request.packages
        .filter((p) => this.#claimKey(p) !== this.#claimKey(entry) && !resolved.has(this.#claimKey(p)))
        .map((p) => ({ class_hash: p.class_hash, package_key: docIdOf(p) }));
      this.#lastWritten = STATES.RUNNING;
      await this.status.writeFromHook("work", {
        state: STATES.RUNNING,
        current_package: this.currentPackage,
        queue,
        scopes: await this.#heldScopes(entry.class_hash)
      });
      // A claim that lands after /terminate gets no beats: the VM is ending.
      if (!this.#terminating) this.#run.heartbeat = this.#startHeartbeat(docs, docId);
      const heartbeat = this.#run.heartbeat;

      const timeoutMs = this.env.packageTimeoutMs ?? declared * 1000 + PACKAGE_TIMEOUT_MARGIN_MS;
      let timer;
      let timedOut = false;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`the package ran past its ${Math.round(timeoutMs / 1000)}s bound`));
        }, timeoutMs);
      });
      const running = this.#steps({ entry, docId, docs, scope, manifest, timeoutMs, cancelled: () => timedOut });
      try {
        const result = await Promise.race([running, timeout]);
        try {
          await docs.counts(result.counts);
        } catch (err) {
          log.error("status.write_failed", { write: "counts", error: err.message });
        }
        await heartbeat?.settled();
        await docs.done(docId, { pkg, imageVersion: this.env.imageVersion, summary: result.summary, display: result.display });
      } catch (err) {
        log.error("package.failed", { error: err.message });
        if (timedOut) await this.#endTimedOutPackage(running);
        await heartbeat?.settled();
        await docs.failed(docId, { pkg, error: err.message })
          .catch((writeErr) => log.error("status.write_failed", { write: "result", error: writeErr.message }));
      } finally {
        clearTimeout(timer);
      }
      return true;
    } finally {
      const run = this.#run;
      this.#run = null;
      setContext({ scope: null, package: null });
      if (this.#vm.state === STATES.RUNNING) this.#vm.to(STATES.READY);
      // A class store the adoption kept for this run goes now.
      if (run && ![...this.#classStores.values()].includes(run.store)) await run.store.close?.().catch(() => {});
      resolveDone();
    }
  }

  // A package past its bound may still be running as the uid the next package runs as, so
  // it is killed, and its step given time to end, before anything else happens.
  async #endTimedOutPackage(running) {
    try {
      await this.steps.killPackageProcesses({ uid: this.env.packageUid });
    } catch (err) {
      log.error("package.kill_failed", { error: err.message });
    }
    await bounded(running.catch(() => {}), PACKAGE_END_TIMEOUT_MS, "the timed-out package's end")
      .catch((err) => log.error("package.kill_failed", { error: err.message }));
  }

  async #steps({ entry, docId, docs, scope, manifest, timeoutMs, cancelled }) {
    const stage = async (name, fn) => {
      if (cancelled()) throw new Error("the package's run was ended before its next stage");
      await docs.stage(docId, name);
      return timed(`package.${name}`, {}, fn);
    };
    const prepared = await stage("prepare_package", () =>
      this.steps.preparePackage({
        workRoot: this.env.workRoot,
        dataRoot: this.env.dataRoot,
        classHash: entry.class_hash,
        docId,
        scope,
        catalogId: entry.catalog_id,
        portal: this.payload.portal,
        token: this.payload.report_server_token,
        reportServerUrl: this.payload.report_server_url,
        bucket: this.payload.bucket,
        storagePrefix: researcherPrefix(this.payload.platform_user_id),
        uid: this.env.packageUid,
        proxyUrl: this.proxyUrl
      })
    );

    // Diagnostic, not a gate: what the package's own uid sees of its data directory.
    try {
      const probe = await this.steps.probeWritable({ uid: this.env.packageUid, dir: prepared.paths.dataDir });
      log.info("package.write_probe", { output: String(probe?.stdout ?? probe ?? "").trim() });
    } catch (err) {
      log.warn("package.write_probe_failed", { error: err.message });
    }

    const written = await stage("run_package", () =>
      this.steps.runPackage({
        manifest,
        paths: prepared.paths,
        env: prepared.env,
        uid: this.env.packageUid,
        timeoutMs,
        proxyUrl: this.proxyUrl
      })
    );

    // The package made the pulls, so it is the one that knows the counts.
    const reported = await this.steps.readPackageCounts({ outputDir: prepared.paths.outputDir });
    return {
      summary: written.summary,
      display: written.display,
      counts: {
        answers: reported.answers,
        logs: reported.logs,
        logFreshnessAt: reported.log_freshness_at
      }
    };
  }

  // ---- the lifecycle hooks -------------------------------------------------------

  async suspend() {
    this.#requireStarted();
    this.#suspendSeen = true;
    this.#vm.to(STATES.SUSPENDING);
    await this.status.writeFromHook("suspend", { state: STATES.SUSPENDING, ...this.#runningPackage() });
    this.syncer.stop();

    // The one hook result that is allowed to fail: a suspend on a sync that cannot be
    // proven is exactly what this contract exists to refuse.
    const result = await this.syncer.flushAndVerify("suspend");
    if (!result.ok) {
      if (this.#vm.state !== STATES.FAILED) this.#vm.to(STATES.FAILED);
      log.error("sync.failed", { hook: "suspend", error: result.reason });
      await this.status.writeFromHook("suspend", { state: STATES.FAILED, error: result.reason, ...this.#runningPackage() });
      // The VM stays awake, and the loop that asked /idle to suspend it has ended, so a new
      // one takes up the work as after a resume.
      this.#lastWritten = null;
      this.#epoch += 1;
      this.#startLoop({ afterResume: true });
      throw new HookError(500, result.reason);
    }
    this.#vm.to(STATES.SUSPENDED);
    // queue is kept by not being written, and current_package is the outstanding run's or
    // left alone: together they tell "paused while idle" from "suspended mid-run".
    await this.status.writeFromHook("suspend", { state: STATES.SUSPENDED, ...this.#runningPackage() });
    return { state: this.#vm.state, ...result };
  }

  // Writes nothing and awaits nothing: the session is stale, and a write on it could hang
  // past the hook's 60 seconds. The loop that follows asks for work with a fresh ID
  // token, adopts new stores and fetches new credentials.
  resume() {
    this.#requireStarted();
    this.#epoch += 1;
    // /suspend wrote suspended, so the next drained answer writes ready again.
    this.#lastWritten = null;
    this.#claimFailures.clear();
    this.#applies.clear();
    if (!this.#suspendSeen) log.warn("lifecycle.resume_without_suspend", {});
    this.#suspendSeen = false;
    this.storage?.markStale();
    this.syncer.stop();
    if (this.#vm.state === STATES.SUSPENDED || this.#vm.state === STATES.FAILED) this.#vm.to(STATES.READY);
    this.#startLoop({ afterResume: true });
    return { state: this.#vm.state };
  }

  async terminate() {
    this.#requireStarted();
    this.#terminating = true;
    this.#epoch += 1;
    // First, so it lands inside the hook's 60 seconds whatever the flush costs: a run
    // outstanding at termination was interrupted, whether or not the flush completes.
    if (this.#run) {
      const { docs, docId, pkg } = this.#run;
      // No wait for a beat in flight: one store sends its writes in order.
      this.#run.heartbeat?.cancel();
      try {
        await bounded(docs.failed(docId, { pkg, error: LOST_RUN_REASON }));
      } catch (err) {
        log.error("status.write_failed", { hook: "terminate", write: "result", error: err.message });
      }
    }

    // Before the sync, because the sync can fail the hook and the credential should
    // stop working whether or not the data made it out.
    try {
      await bounded(this.revokeReportServerToken({
        baseUrl: this.payload.report_server_url,
        token: this.payload.report_server_token
      }), REVOKE_TIMEOUT_MS, "the revocation");
      log.info("terminate.revoked", {});
    } catch (err) {
      // An unrevoked token is a residual the design accepts: it expires after nine hours
      // and the researcher's next launch revokes it.
      log.warn("report_server.refused", { call: "revoke", error: err.message });
    }

    // Only while the document still records this VM: a VM launched since owns it now.
    const onlyIf = (doc) => doc?.microvm_id === this.microvmId;
    this.syncer.stop();
    const result = await this.syncer.flushAndVerify("terminate");
    if (!result.ok) {
      if (this.#vm.state !== STATES.FAILED) this.#vm.to(STATES.FAILED);
      log.error("sync.failed", { hook: "terminate", error: result.reason });
      await this.status.writeFromHook("terminate", { state: STATES.FAILED, error: result.reason, ...this.#runningPackage() }, { onlyIf });
      throw new HookError(500, result.reason);
    }
    this.#vm.to(STATES.TERMINATED);
    await this.status.writeFromHook("terminate", { state: STATES.TERMINATED, ...this.#runningPackage() }, { onlyIf });
    return { state: this.#vm.state, ...result };
  }
}

// An entry's result document id: derived from its identity, or the one /work named when
// the identity is unusable.
function docIdOf(entry) {
  return IDENTITY.test(entry.identity ?? "") ? packageDocId(entry.identity) : entry.package_key;
}

// The scope block rigse sent and /work returns, as the runner writes it into scope.json.
function checkScope(scope, classHash) {
  if (!scope || scope.kind !== "class") return "the queued scope is not a class scope";
  if (scope.id !== classHash) return `the queued scope names ${scope.id}, not ${classHash}`;
  if (!Array.isArray(scope.classes) || scope.classes.length !== 1 || scope.classes[0]?.class_hash !== classHash
      || !Number.isInteger(scope.classes[0]?.class_id) || scope.classes[0].class_id < 1) {
    return "the queued scope's class list is not this class";
  }
  if (!Array.isArray(scope.assignments)) return "the queued scope carries no assignment list";
  return null;
}

