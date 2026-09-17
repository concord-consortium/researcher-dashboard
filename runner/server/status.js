import { log } from "./log.js";

// Document paths from design.md Contracts. Firestore alternates collection and
// document, so each of these has an even number of segments.
export function researcherPath(portal, platformUserId) {
  return `researcher_dashboard/${portal}/researchers/${platformUserId}`;
}

export function classPath(portal, classHash) {
  return `researcher_dashboard/${portal}/classes/${classHash}`;
}

export function analysisPath(portal, classHash, analysisId) {
  return `${classPath(portal, classHash)}/analyses/${analysisId}`;
}

// Writes the three documents the dashboard reads. The store is injected so the
// tests drive the real state sequences against an in-memory double, and so the
// Firestore emulator can stand in before todo 13 deploys the rules.
export class StatusWriter {
  constructor({ store, portal, platformUserId }) {
    this.store = store;
    this.portal = portal;
    this.platformUserId = platformUserId;
  }

  #now() {
    return new Date().toISOString();
  }

  async researcher(fields) {
    const path = researcherPath(this.portal, this.platformUserId);
    const doc = { ...fields, updated_at: this.#now() };
    await this.store.merge(path, doc);
    log.info("status.researcher", { state: doc.state ?? null });
    return doc;
  }

  // Counts describe the class rather than the researcher who pulled them, so this
  // is last-writer-wins by design and carries who wrote it.
  async classCounts(classHash, data) {
    const path = classPath(this.portal, classHash);
    await this.store.merge(path, {
      data: { ...data, last_pull_at: this.#now() },
      last_pulled_by: this.platformUserId
    });
  }

  // The runner creates the analysis document, and only once it has accepted the
  // work, so there is no `requested` state and a refused /analyze writes nothing.
  // requested_by comes from the session token the VM holds, never from the request.
  async analysisCreated(classHash, analysisId, { pkg, requestedBy }) {
    const now = this.#now();
    await this.store.set(analysisPath(this.portal, classHash, analysisId), {
      status: "running",
      stage: "starting",
      created_at: now,
      updated_at: now,
      finished_at: null,
      error: null,
      package: pkg,
      requested_by: requestedBy,
      requested_at: now,
      display: null
    });
  }

  async analysisStage(classHash, analysisId, stage) {
    await this.store.merge(analysisPath(this.portal, classHash, analysisId), {
      stage,
      updated_at: this.#now()
    });
  }

  async analysisDone(classHash, analysisId, display) {
    const now = this.#now();
    await this.store.merge(analysisPath(this.portal, classHash, analysisId), {
      status: "done",
      stage: "done",
      display,
      error: null,
      finished_at: now,
      updated_at: now
    });
  }

  async analysisFailed(classHash, analysisId, error) {
    const now = this.#now();
    await this.store.merge(analysisPath(this.portal, classHash, analysisId), {
      status: "failed",
      error,
      finished_at: now,
      updated_at: now
    });
  }
}

// In-memory store used by the tests and by SYNC_BACKEND=DIR local runs, where no
// Firebase project is reachable. It records writes in order so a test can assert
// the sequence of states, which is what criteria 2, 8, 11 and 13 turn on.
export class MemoryStore {
  constructor() {
    this.docs = new Map();
    this.writes = [];
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
