import { identityOfKey } from "./packages";

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

// The states in which the session will take queued work without being asked again. A runner
// document with a queue and no state is what a launch that failed leaves behind.
const TAKING = ["starting", "ready", "running", "suspending", "suspended"];

export function sessionTakes(runner: Runner | null): boolean {
  return TAKING.includes(runner?.state ?? "");
}

export const millis = (stamp: Stamp | null | undefined) => stamp?.toMillis() ?? null;

// When the page first saw the session in its current state on its current VM. A run request
// moves the document's `updated_at` without changing either, so it keeps the mark.
export interface SessionMark { state: string | null; microvm_id: string | null; at: number | null }

export function nextMark(prev: SessionMark | null, runner: Runner | null): SessionMark | null {
  if (!runner) return null;
  const state = runner.state ?? null, vm = runner.microvm_id ?? null;
  if (prev && prev.state === state && prev.microvm_id === vm) return prev;
  return { state, microvm_id: vm, at: millis(runner.updated_at) };
}

// A running result whose VM the session says is no longer running it. A result written after
// the session entered its state came from a VM that is running it: a resumed VM finishes the
// package it was running before it writes its status again.
export function isStuck(result: Result, runner: Runner | null, mark: SessionMark | null): boolean {
  if (result.status !== "running" || !runner) return false;
  const resultAt = millis(result.updated_at), runnerAt = mark?.at ?? millis(runner.updated_at);
  if (resultAt !== null && runnerAt !== null && resultAt > runnerAt) return false;
  if (runner.microvm_id !== result.microvm_id) return true;
  return ["suspended", "terminated", "failed"].includes(runner.state ?? "");
}

export function queuePosition(runner: Runner | null, classHash: string, key: string): number | null {
  const index = (runner?.queue ?? []).findIndex((e) => e.class_hash === classHash && e.package_key === key);
  return index < 0 ? null : index + 1;
}

// The finished result a row shows: the result itself when done, otherwise the run a re-run is
// replacing.
export function latestFinished(result: Result | undefined): Finished | null {
  if (!result) return null;
  return result.status === "done" ? result : result.previous ?? null;
}

export type RowState =
  | { kind: "not-run" }
  | { kind: "queued"; position: number | null; waiting: boolean }
  | { kind: "running"; stage: string }
  | { kind: "stuck"; resumable: boolean }
  | { kind: "done"; summary: string | null; finishedAt: number | null }
  | { kind: "failed"; error: string; finishedAt: number | null };

export function rowState(result: Result | undefined, runner: Runner | null, mark: SessionMark | null,
  classHash: string, key: string): RowState {
  if (!result) return { kind: "not-run" };
  switch (result.status) {
    case "queued":
      return { kind: "queued", position: queuePosition(runner, classHash, key), waiting: !sessionTakes(runner) };
    case "running":
      if (!isStuck(result, runner, mark)) return { kind: "running", stage: result.stage ?? "starting" };
      // A paused VM finishes the run when a request wakes it; any other stuck run waits for the watchdog.
      return { kind: "stuck", resumable: runner?.state === "suspended" && runner.microvm_id === result.microvm_id };
    case "done":
      return { kind: "done", summary: result.summary ?? null, finishedAt: millis(result.finished_at) };
    default:
      return { kind: "failed", error: result.error ?? "No reason was given.", finishedAt: millis(result.finished_at) };
  }
}

const STAGES: Record<string, string> = {
  starting: "starting",
  prepare_package: "preparing the package",
  run_package: "running the package"
};

export const stageWords = (stage: string) => STAGES[stage] ?? stage;

// How long an accepted Resume reads as resuming without a write to its result.
export const RESUME_WAIT_MS = 3 * 60_000;

// Whether the row offers Run, and the reason when it does not and the state alone does not say why.
export function runOffer(runnable: boolean, state: RowState): { enabled: boolean; reason?: string } {
  if (!runnable) return { enabled: false, reason: "Only official packages can be run here for now." };
  if (state.kind === "running") return { enabled: false };
  if (state.kind === "stuck" && !state.resumable) return { enabled: false, reason: "It can be run again once it is marked failed." };
  if (state.kind === "queued" && !state.waiting) return { enabled: false };
  return { enabled: true };
}

export const WAITING = "Queued, waiting for a machine: run it to start one.";

// A run request from one row: in flight, refused with a message, or an accepted Resume. `at` is the
// row's result `updated_at` when the answer arrived, and the line lasts until the result changes.
export type RunRequest =
  | { pending: true }
  | { message: string; at: number | null }
  | { resuming: true; at: number | null };

export const formatTime = (ms: number) => new Date(ms).toLocaleString();

// The line above the list. `titleOf` names a package of this class by its key, or returns null;
// `requesting` is whether any run request from the page is in flight.
export function sessionLines(runner: Runner | null, classHash: string, results: Map<string, Result>,
  titleOf: (key: string) => string | null, requesting: boolean): string[] {
  const waiting = () => ([...results.values()].some((r) => r.status === "queued") && !requesting ? [WAITING] : []);
  switch (runner?.state) {
    case "starting":
      return ["Starting a machine for your runs…"];
    case "ready":
      return ["Your machine is ready."];
    case "running": {
      const current = runner.current_package;
      if (!current) return [];
      if (current.class_hash !== classHash) return ["Running a package for another of your classes."];
      const status = results.get(current.package_key)?.status;
      if (status && status !== "running") return ["Your machine is starting its next package."];
      return [`Running ${titleOf(current.package_key) ?? identityOfKey(current.package_key)}.`];
    }
    case "suspending":
    case "suspended":
      return ["Your machine is paused.",
        ...((runner.queue ?? []).length > 0 ? ["Queued packages will start within a couple of minutes."] : [])];
    case "terminated":
      return ["Your machine has stopped.", ...waiting()];
    case "failed":
      return [`Your machine stopped with an error: ${runner.error ?? "no reason was given"}.`, ...waiting()];
    default:
      return [];
  }
}
