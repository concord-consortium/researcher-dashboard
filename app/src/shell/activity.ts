import type { PackageRow } from "./portal";
import { packageKey } from "./packages";
import {
  latestFinished, millis, rowState, runOffer,
  type Result, type RunRequest, type Runner, type SessionMark, type Stamp
} from "./runs";

// A learner's activity document, written by report-service; `changed` maps each assignment's portal
// offering id to when the learner last changed it. `writeCount` is a change signal only, never a count.
export interface Activity { lastActivityAt?: Stamp; changed?: Record<string, Stamp> }

export interface AssignmentActivity { offeringId: number; students: number; last: number | null }

// Per assignment, the learners who have saved work in it and when it last changed, from `changed`.
export function assignmentActivity(docs: Map<string, Activity>, offeringIds: number[]): AssignmentActivity[] {
  return offeringIds.map((offeringId) => {
    let students = 0, last: number | null = null;
    for (const doc of docs.values()) {
      const at = millis(doc.changed?.[String(offeringId)]);
      if (at === null) continue;
      students += 1;
      if (last === null || at > last) last = at;
    }
    return { offeringId, students, last };
  });
}

export const ACTIVE_WINDOW_MINUTES = 5;
const WINDOW_MS = ACTIVE_WINDOW_MINUTES * 60_000;

export const windowLabel = (minutes: number) => `in the last ${minutes} minutes`;

// Learners who saved work within the window of the page's clock. A time ahead of that clock
// is a laptop running behind the server, and still counts.
export function activeCount(docs: Map<string, Activity>, now: number, windowMs = WINDOW_MS): number {
  let n = 0;
  for (const doc of docs.values()) {
    const at = millis(doc.lastActivityAt);
    if (at !== null && at >= now - windowMs) n += 1;
  }
  return n;
}

// Milliseconds until the earliest counted learner leaves the window, or null when nobody is counted.
export function nextChangeIn(docs: Map<string, Activity>, now: number, windowMs = WINDOW_MS): number | null {
  let soonest: number | null = null;
  for (const doc of docs.values()) {
    const at = millis(doc.lastActivityAt);
    if (at === null || at < now - windowMs) continue;
    const leaves = at + windowMs - now;
    soonest = soonest === null ? leaves : Math.min(soonest, leaves);
  }
  return soonest;
}

export function newestActivity(docs: Map<string, Activity>): number | null {
  let newest: number | null = null;
  for (const doc of docs.values()) {
    const at = millis(doc.lastActivityAt);
    if (at !== null && (newest === null || at > newest)) newest = at;
  }
  return newest;
}

// A finished result whose run began reading the class before some learner's last save. Both
// times are the server's.
export function isBehind(result: Result | undefined, newest: number | null): boolean {
  const started = millis(result?.started_at);
  return result?.status === "done" && started !== null && newest !== null && newest > started;
}

// The listed rows the page would re-run now, by package key, with the result's updated_at,
// which is what the hook requests once per result.
export function behindRows({ listed, results, runner, mark, classHash, newest, requests }: {
  listed: PackageRow[]; results: Map<string, Result>; runner: Runner | null; mark: SessionMark | null;
  classHash: string; newest: number | null; requests: Map<string, RunRequest>;
}): Map<string, { row: PackageRow; at: number | null }> {
  const behind = new Map<string, { row: PackageRow; at: number | null }>();
  for (const row of listed) {
    const key = packageKey(row.identity);
    const result = results.get(key);
    if (held(requests.get(key), result) || !isBehind(result, newest)) continue;
    if (!runOffer(row.runnable, rowState(result, runner, mark, classHash, key)).enabled) continue;
    behind.set(key, { row, at: millis(result?.updated_at) });
  }
  return behind;
}

// A request in flight, or a refusal, Resume or accepted Run the row is still tied to: each holds
// only while the result's updated_at is still the one it was made against.
function held(request: RunRequest | undefined, result: Result | undefined): boolean {
  if (!request) return false;
  if ("pending" in request) return true;
  return request.at === millis(result?.updated_at);
}

// The latest finished result's run began reading the class before some learner's last save, and
// nothing is about to replace it. `behind` is behindRows' answer while automatic re-runs are on,
// else empty; `requesting` is whether a request from the row is in flight or accepted with its
// queued result still to come.
export function outOfDate(key: string, result: Result | undefined, newest: number | null,
  behind: Map<string, unknown>, requesting: boolean): boolean {
  if (!result || requesting || result.status === "queued" || result.status === "running" || behind.has(key)) return false;
  const started = millis(latestFinished(result)?.started_at);
  return started !== null && newest !== null && newest > started;
}
