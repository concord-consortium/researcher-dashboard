export interface Stamp { toMillis(): number }
export interface QueueEntry { class_hash: string; package_key: string }

// The researcher's session, written by the function, the runner and the watchdog.
export interface Runner {
  state?: string;
  current_package?: QueueEntry | null;
  queue?: QueueEntry[];
  microvm_id?: string;
  error?: string | null;
  updated_at?: Stamp;
}

export interface PackageRef { identity: string; version: string; checksum: string }

// A finished run: a done result's own fields, or the copy the function keeps in `previous`.
export interface Finished {
  package: PackageRef;
  image_version?: string;
  summary?: string | null;
  display?: string | null;
  started_at?: Stamp | null;
  finished_at?: Stamp | null;
}

export interface Result extends Finished {
  status: "queued" | "running" | "done" | "failed";
  stage?: string;
  microvm_id?: string;
  updated_at?: Stamp;
  error?: string | null;
  // The last done run, which the function copies in when it queues a re-run and carries forward
  // over a failed one; no runner write touches it.
  previous?: Finished | null;
}

// The researcher's scope document; the runner replaces `data` whole, so any count can be absent.
export interface Counts {
  data?: { answers?: number; logs?: number; last_pull_at?: Stamp; log_freshness_at?: Stamp };
}
