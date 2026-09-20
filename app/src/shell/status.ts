// Reading the researcher status document, which the VM writes and the page only reads.
//
// The document is the fast path rather than the truth: a VM that crashed cannot write, so
// it goes on claiming whatever it last said. Lambda's own state is authoritative, and the
// page is not allowed to ask it, so what the page can do is notice that a document has
// stopped moving and offer to relaunch. Everything here is that judgment, kept pure.

export type RunnerState =
  | "starting" | "ready" | "running" | "suspending" | "suspended" | "terminated" | "failed";

export interface ResearcherStatus {
  state: RunnerState;
  current_package?: string | null;
  classes?: string[];
  microvm_id?: string | null;
  image_version?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
}

// A VM writes on every step, so a document that has not moved in this long while claiming
// to be running has almost certainly lost its VM. Long enough to clear a slow CLUE read,
// which is the longest silent step observed at about 16 seconds.
export const UNRESPONSIVE_AFTER_MS = 3 * 60 * 1000;

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

// Only `running` can be unresponsive. A VM that said `suspended` and stopped writing is
// behaving exactly as designed, and offering to relaunch it would be noise.
export function isUnresponsive(status: ResearcherStatus | null, now: number): boolean {
  if (!status || status.state !== "running") return false;
  const updated = timeOf(status.updated_at);
  if (updated === null) return false;
  return now - updated > UNRESPONSIVE_AFTER_MS;
}

// Whole minutes left in the VM's eight hours, or null when the document does not say.
// Floored, so the page never rounds up to a minute the researcher does not have.
export function minutesRemaining(status: ResearcherStatus | null, now: number): number | null {
  const expires = timeOf(status?.expires_at);
  if (expires === null) return null;
  return Math.max(0, Math.floor((expires - now) / 60000));
}

// Whether clicking Analyze now would be refused by the runner, which accepts one package at
// a time and answers 409 to a second. Shown as queued rather than as an error, because
// waiting is the right response and the page can retry when the first finishes.
export function isBusy(status: ResearcherStatus | null): boolean {
  return status?.state === "running";
}

// What the status bar says. Deliberately plain: the state names are the runner's own, and
// inventing friendlier ones would make the logs and the page disagree.
export function describe(status: ResearcherStatus | null, now: number): string {
  if (!status) return "No session yet. Analyzing this class will start one.";
  if (isUnresponsive(status, now)) return "This session has stopped responding.";

  const minutes = minutesRemaining(status, now);
  const left = minutes === null ? "" : ` ${minutes} minutes left in this session.`;
  switch (status.state) {
    case "starting": return `Starting a session.${left}`;
    case "ready": return `Ready.${left}`;
    case "running": return `Running ${status.current_package ?? "an analysis"}.${left}`;
    case "suspending": return `Pausing the session.${left}`;
    case "suspended": return `Paused. Analyzing will resume it.${left}`;
    case "terminated": return "This session has ended. Analyzing will start a new one.";
    case "failed": return "This session failed. Analyzing will start a new one.";
  }
}
