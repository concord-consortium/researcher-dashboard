import { log, redact } from "./log.js";

// Document paths. Firestore alternates collection and document, so each of these has an
// even number of segments.
export function runnerPath(portal, platformUserId) {
  return `researcher_dashboard/${portal}/runners/${platformUserId}`;
}

export function classPath(portal, classHash) {
  return `researcher_dashboard/${portal}/classes/${classHash}`;
}

// The scope document for one researcher of one class, which holds that researcher's
// counts: two researchers of a class see different data.
export function scopePath(portal, classHash, platformUserId) {
  return `${classPath(portal, classHash)}/researchers/${platformUserId}`;
}

// One document per researcher per package per class, holding that package's latest run.
export function resultPath(portal, classHash, platformUserId, docId) {
  return `${scopePath(portal, classHash, platformUserId)}/results/${docId}`;
}

// Well under a hook's 60 seconds: a status write that hangs must not take the VM with it.
export const STATUS_WRITE_TIMEOUT_MS = 10_000;

export function bounded(promise, ms = STATUS_WRITE_TIMEOUT_MS, what = "status write") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// The status document, written through the session store. Every write carries
// platform_id, which the rules check against the token's claim rather than trusting the
// {portal} path segment, and a server-time updated_at, which the rules require.
//
// A hook's write is bounded and never fails the hook: a failure is logged and kept, and
// the next write that succeeds reports it.
export class RunnerStatus {
  #failures = [];

  constructor({ store, portal, platformUserId, platformId }) {
    this.store = store;
    this.portal = portal;
    this.platformUserId = platformUserId;
    this.platformId = platformId;
  }

  get path() {
    return runnerPath(this.portal, this.platformUserId);
  }

  // `onlyIf` is tested against the stored document in a transaction, and the write is
  // skipped, returning null, when it fails.
  async write(fields, { onlyIf } = {}) {
    const sent = this.#failures;
    const doc = {
      platform_id: this.platformId,
      ...fields,
      updated_at: this.store.serverTimestamp(),
      // Every write carries the list, empty once reported, so a reported failure is cleared.
      status_write_failures: sent
    };
    if (onlyIf) {
      if (!(await bounded(this.store.mergeIf(this.path, onlyIf, doc)))) return null;
    } else {
      await bounded(this.store.merge(this.path, doc));
    }
    // Only what this write carried: a failure recorded while it was in flight waits for the next.
    this.#failures = this.#failures.filter((failure) => !sent.includes(failure));
    log.info("status.runner", { state: doc.state ?? null });
    return doc;
  }

  // For the hooks: never throws, since losing the VM is worse than a document that lags.
  async writeFromHook(hook, fields, { onlyIf } = {}) {
    try {
      const doc = await this.write(fields, { onlyIf });
      if (!doc) log.warn(`${hook}.runner_doc_skipped`, { state: fields.state ?? null });
      return doc;
    } catch (err) {
      const error = redact(err.message);
      log.error("status.write_failed", { hook, error });
      // The last ten, so a status document that cannot be written for a while stays small.
      this.#failures = [...this.#failures, { hook, error }].slice(-10);
      return null;
    }
  }
}

// A class's documents for this researcher, written through that class's store: the
// session token carries no class_hash, so report-service's rules refuse it on these.
export class ClassDocuments {
  constructor({ store, portal, classHash, platformUserId, platformId }) {
    this.store = store;
    this.portal = portal;
    this.classHash = classHash;
    this.platformUserId = platformUserId;
    this.platformId = platformId;
  }

  #result(docId) {
    return resultPath(this.portal, this.classHash, this.platformUserId, docId);
  }

  #stamped(fields) {
    return { platform_id: this.platformId, ...fields, updated_at: this.store.serverTimestamp() };
  }

  // The authored URL profile the function derived for this class, or null.
  async profile() {
    return this.store.get(classPath(this.portal, this.classHash));
  }

  // The claim: the result says running, which is what takes it out of /work's answer and
  // what the watchdog reads. It clears the last run's summary and display, so a result
  // only ever describes the run its `package` names.
  async claim(docId, { pkg, imageVersion, microvmId, expectedDurationSeconds, heartbeatSeconds }) {
    await bounded(this.store.merge(this.#result(docId), this.#stamped({
      status: "running",
      stage: "starting",
      package: pkg,
      image_version: imageVersion,
      microvm_id: microvmId,
      expected_duration_seconds: expectedDurationSeconds,
      heartbeat_seconds: heartbeatSeconds,
      started_at: this.store.serverTimestamp(),
      finished_at: null,
      error: null,
      summary: null,
      display: null
    })));
  }

  // Proof that the run is alive, which the watchdog's lease reads from updated_at.
  async beat(docId) {
    await this.store.merge(this.#result(docId), this.#stamped({}));
  }

  async stage(docId, stage) {
    await bounded(this.store.merge(this.#result(docId), this.#stamped({ stage })));
  }

  // Every field of a finished result in one call, so nothing on it can describe another run.
  // Unbounded, as is `failed`: a write the caller stopped waiting for can still land.
  async done(docId, { pkg, imageVersion, summary, display }) {
    await this.store.merge(this.#result(docId), this.#stamped({
      status: "done",
      stage: "done",
      package: pkg,
      image_version: imageVersion,
      summary,
      display,
      error: null,
      finished_at: this.store.serverTimestamp()
    }));
  }

  // A run that failed, its stage left at the one it failed in. The reason reaches the
  // researcher's page, so it is redacted.
  async failed(docId, { pkg, error }) {
    await this.store.merge(this.#result(docId), this.#stamped({
      status: "failed",
      error: redact(error),
      package: pkg,
      finished_at: this.store.serverTimestamp()
    }));
  }

  // A package refused before any claim: it never ran, so nothing of the last run's is left
  // beside the refusal. started_at stays, since the rules refuse clearing it.
  async refused(docId, { pkg, error }) {
    await this.store.merge(this.#result(docId), this.#stamped({
      status: "failed",
      stage: null,
      error: redact(error),
      package: pkg,
      summary: null,
      display: null,
      finished_at: this.store.serverTimestamp()
    }));
  }

  // This researcher's counts for this class. Nothing per researcher goes on the class's
  // own document, which holds the authored profile and nothing else.
  async counts({ answers, logs, logFreshnessAt }) {
    const data = { last_pull_at: this.store.serverTimestamp() };
    if (answers !== undefined) data.answers = answers;
    if (logs !== undefined) data.logs = logs;
    const freshness = logFreshnessAt ? new Date(logFreshnessAt) : null;
    if (freshness && !Number.isNaN(freshness.getTime())) data.log_freshness_at = this.store.timestamp(freshness);
    // `data` is replaced whole, so a count this run did not report is absent rather than
    // an earlier run's.
    await bounded(this.store.replaceFields(scopePath(this.portal, this.classHash, this.platformUserId), {
      platform_id: this.platformId,
      data
    }));
  }
}

const isMap = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && value !== SERVER_TIME;

function deepMerge(existing, fields) {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(fields)) {
    merged[key] = isMap(value) && isMap(existing[key]) ? deepMerge(existing[key], value) : value;
  }
  return merged;
}

// What the in-memory store writes where Firestore would put the server's time.
export const SERVER_TIME = Object.freeze({ serverTime: true });

// A Firebase custom token's payload, read without verifying it.
function customTokenPayload(token) {
  try {
    const [, payload] = String(token).split(".");
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// The claims it carries. Only the in-memory store uses them, standing in for what
// Firebase would verify at sign-in.
function customTokenClaims(token) {
  return customTokenPayload(token)?.claims ?? null;
}

// In-memory store used by the tests and by SYNC_BACKEND=DIR local runs, where no
// Firebase project is reachable. It records writes in order so a test can assert
// the sequence of states.
export class MemoryStore {
  constructor({ docs } = {}) {
    // Shared across stores when given, as one Firestore is shared by every connection.
    this.docs = docs ?? new Map();
    this.writes = [];
    this.signedInWith = [];
    this.closed = false;
  }

  async signIn(customToken) {
    if (this.closed) throw new Error("store is closed");
    this.signedInWith.push(customToken);
    return { user: { uid: "memory" } };
  }

  async claims() {
    return customTokenClaims(this.signedInWith.at(-1)) ?? {};
  }

  async idToken() {
    if (!this.signedInWith.length) throw new Error("this store has not signed in");
    return `id-token-for:${this.signedInWith.at(-1)}`;
  }

  // Firestore's merge: a nested map merges into the stored one, and anything else,
  // arrays included, replaces it.
  async merge(path, fields) {
    if (this.closed) throw new Error("store is closed");
    this.docs.set(path, deepMerge(this.docs.get(path) ?? {}, fields));
    this.writes.push({ op: "merge", path, doc: { ...fields } });
  }

  async replaceFields(path, fields) {
    if (this.closed) throw new Error("store is closed");
    this.docs.set(path, { ...(this.docs.get(path) ?? {}), ...fields });
    this.writes.push({ op: "replaceFields", path, doc: { ...fields } });
  }

  async mergeIf(path, test, fields) {
    if (this.closed) throw new Error("store is closed");
    if (!test(this.docs.get(path) ?? null)) return false;
    await this.merge(path, fields);
    return true;
  }

  serverTimestamp() {
    return SERVER_TIME;
  }

  timestamp(date) {
    return date.toISOString();
  }

  async close() {
    this.closed = true;
  }

  // Synchronous, so a test can read a document straight back; `await` accepts it too.
  get(path) {
    return this.docs.get(path) ?? null;
  }
}
