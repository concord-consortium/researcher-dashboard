import path from "node:path";
import { log, timed } from "../log.js";
import { pendingFiles, scanTree } from "./scan.js";

export { DirBackend } from "./backend-dir.js";
export { S3Backend } from "./backend-s3.js";

// Lifecycle hooks are capped at 60 seconds by Lambda, so a hook can never contain
// a full sync of a researcher's prefix. Instead the syncer pushes continuously and
// the hook flushes what is outstanding and then proves the flush covered the
// current state. `suspended` is written only on that proof; anything else is
// `failed` with the reason, leaving the previous S3 copy untouched.
export class Syncer {
  #uploaded = new Map();
  #timer = null;
  #inFlight = null;

  constructor({ backend, root, intervalMs = 30_000 }) {
    this.backend = backend;
    this.root = root;
    this.intervalMs = intervalMs;
  }

  // Files that have changed since we last saw them land.
  async pending() {
    return pendingFiles(await scanTree(this.root), this.#uploaded);
  }

  // Pushes everything outstanding. Serialized: a scheduler tick that fires while a
  // hook is flushing joins the flush in progress rather than racing it, so two
  // writers never upload the same key at once.
  async flush() {
    if (this.#inFlight) return this.#inFlight;
    this.#inFlight = this.#flushOnce().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #flushOnce() {
    const scanned = await scanTree(this.root);
    const pending = pendingFiles(scanned, this.#uploaded);
    let bytes = 0;
    for (const rel of pending) {
      await this.backend.put(rel, path.join(this.root, rel));
      // Recorded only after the put resolves, so a failed upload leaves the file
      // pending and the next verify refuses to call the flush complete.
      this.#uploaded.set(rel, scanned.get(rel));
      bytes += scanned.get(rel).size;
    }
    return { files: pending.length, bytes };
  }

  // Re-scans rather than trusting the flush's own return value: a file written
  // while the flush ran is still outstanding, and saying otherwise is exactly the
  // false claim of durability this contract exists to prevent.
  async verify() {
    const outstanding = await this.pending();
    return { ok: outstanding.length === 0, outstanding };
  }

  // What the hooks call. Resolves with a reason rather than throwing, because the
  // caller's job is to turn the reason into a state and a status-doc field.
  async flushAndVerify(hook) {
    try {
      const flushed = await timed("sync.flush", { hook }, () => this.flush());
      const { ok, outstanding } = await this.verify();
      if (!ok) {
        return {
          ok: false,
          reason: `sync incomplete: ${outstanding.length} file(s) still outstanding`,
          outstanding
        };
      }
      return { ok: true, ...flushed };
    } catch (err) {
      return { ok: false, reason: `sync failed: ${err.message}` };
    }
  }

  // Pulls the researcher's prefix down. Used by /run, where an empty prefix is the
  // normal first-session case rather than an error.
  async pullDown() {
    const objects = await this.backend.list();
    for (const obj of objects) {
      const dest = path.join(this.root, obj.path);
      await this.backend.get(obj.path, dest);
    }
    // Everything just pulled matches the remote by construction, so seed the
    // record from disk rather than re-uploading all of it on the first flush.
    const scanned = await scanTree(this.root);
    this.#uploaded = scanned;
    return { files: objects.length };
  }

  start() {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      this.flush().catch((err) => log.warn("sync.tick_failed", { error: err.message }));
    }, this.intervalMs);
    // The timer must not hold the process open: the VM's lifetime is Lambda's to
    // decide, not the scheduler's.
    this.#timer.unref?.();
  }

  stop() {
    if (!this.#timer) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }
}
