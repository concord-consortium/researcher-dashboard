import { log } from "./log.js";

// Document paths from design.md Contracts. Firestore alternates collection and
// document, so each of these has an even number of segments.
export function researcherPath(portal, platformUserId) {
  return `researcher_dashboard/${portal}/researchers/${platformUserId}`;
}

export function classPath(portal, classHash) {
  return `researcher_dashboard/${portal}/classes/${classHash}`;
}

// One document per class and package, holding that package's current result for that
// class rather than a record per run. The source data in S3 is overwritten on every
// pull and cc-data's manifest carries its provenance, so a history of results here
// would be snapshots of inputs that no longer exist.
export function resultPath(portal, classHash, packageName) {
  return `${classPath(portal, classHash)}/results/${packageName}`;
}

// Writes the three documents the dashboard reads. The store is injected so the
// tests drive the real state sequences against an in-memory double, and so the
// Firestore emulator can stand in before todo 13 deploys the rules.
export class StatusWriter {
  // Two stores, because the rules distinguish the two token shapes. `store` is signed
  // in with the session token, which carries no class_hash and may write only the
  // researcher document. `classStore(classHash)` is signed in with that class's token,
  // which is the only thing report-service's rules let write the class and analysis
  // documents. Writing those through the session store is denied, not ignored.
  constructor({ store, classStore, portal, platformUserId, platformId }) {
    this.store = store;
    this.classStore = classStore ?? (() => store);
    this.portal = portal;
    this.platformUserId = platformUserId;
    this.platformId = platformId;
  }

  // Every document carries platform_id, because the rules check it against the
  // token's claim rather than trusting the {portal} path segment, the same way the
  // student work rules check it rather than trusting {source}. A merge that omitted
  // it on the first write would create a document the rules then refuse to read.
  #stamped(fields) {
    return { platform_id: this.platformId, ...fields };
  }

  #now() {
    return new Date().toISOString();
  }

  async researcher(fields) {
    const path = researcherPath(this.portal, this.platformUserId);
    const doc = this.#stamped({ ...fields, updated_at: this.#now() });
    await this.store.merge(path, doc);
    log.info("status.researcher", { state: doc.state ?? null });
    return doc;
  }

  // Counts describe the class rather than the researcher who pulled them, so this
  // is last-writer-wins by design and carries who wrote it.
  async classCounts(classHash, data) {
    const path = classPath(this.portal, classHash);
    await this.classStore(classHash).merge(path, this.#stamped({
      data: { ...data, last_pull_at: this.#now() },
      last_pulled_by: this.platformUserId
    }));
  }

  // The runner writes the result document only once it has accepted the work, so a
  // refused request changes nothing. requested_by comes from the session token the VM
  // holds, never from the request, and records who ran it last: the document is shared
  // by every researcher of the class, so overwriting one another is the intent.
  //
  // A merge rather than a set, and display is deliberately absent: a run that is
  // starting must not wipe the last good display, which stays visible until this run
  // produces a new one.
  async resultStarted(classHash, packageName, { pkg, requestedBy }) {
    const now = this.#now();
    await this.classStore(classHash).merge(resultPath(this.portal, classHash, packageName), this.#stamped({
      status: "running",
      stage: "starting",
      updated_at: now,
      finished_at: null,
      error: null,
      package: pkg,
      requested_by: requestedBy,
      requested_at: now
    }));
  }

  async resultStage(classHash, packageName, stage) {
    await this.classStore(classHash).merge(resultPath(this.portal, classHash, packageName), this.#stamped({
      stage,
      updated_at: this.#now()
    }));
  }

  async resultDone(classHash, packageName, display) {
    const now = this.#now();
    await this.classStore(classHash).merge(resultPath(this.portal, classHash, packageName), this.#stamped({
      status: "done",
      stage: "done",
      display,
      error: null,
      finished_at: now,
      updated_at: now
    }));
  }

  // display is not cleared: a failed run leaves the last good result readable, with
  // the failure beside it, rather than blanking the page.
  async resultFailed(classHash, packageName, error) {
    const now = this.#now();
    await this.classStore(classHash).merge(resultPath(this.portal, classHash, packageName), this.#stamped({
      status: "failed",
      error,
      finished_at: now,
      updated_at: now
    }));
  }
}

// Writes every status document to the structured log instead of Firestore. It
// exists for running a VM before the portal can mint a real session token: the
// state sequence stays observable in CloudWatch, and no sign-in is attempted that
// could not succeed. It is not a fallback for a broken Firestore, because a VM
// using it makes no durable claim about its state at all.
export class LogStore {
  async signIn(customToken) {
    log.warn("status.sign_in_skipped", { token_length: customToken?.length ?? 0 });
    return null;
  }

  async set(path, doc) {
    log.info("status.write", { op: "set", path, doc });
  }

  async merge(path, fields) {
    log.info("status.write", { op: "merge", path, doc: fields });
  }
}

// In-memory store used by the tests and by SYNC_BACKEND=DIR local runs, where no
// Firebase project is reachable. It records writes in order so a test can assert
// the sequence of states, which is what criteria 2, 8, 11 and 13 turn on.
export class MemoryStore {
  constructor() {
    this.docs = new Map();
    this.writes = [];
    // Which tokens were exchanged, so a test can assert the class writes went out on
    // the class token rather than the session one.
    this.signedInWith = [];
  }

  async signIn(customToken) {
    this.signedInWith.push(customToken);
    return { user: { uid: "memory" } };
  }

  async set(path, doc) {
    this.docs.set(path, { ...doc });
    this.writes.push({ op: "set", path, doc: { ...doc } });
  }

  async merge(path, fields) {
    const existing = this.docs.get(path) ?? {};
    this.docs.set(path, { ...existing, ...fields });
    this.writes.push({ op: "merge", path, doc: { ...fields } });
  }

  get(path) {
    return this.docs.get(path);
  }

  // The ordered `state` values written to one document, which is how a test spells
  // "passes through starting, ready, running, ready".
  states(path) {
    return this.writes
      .filter((w) => w.path === path && w.doc.state !== undefined)
      .map((w) => w.doc.state);
  }
}
