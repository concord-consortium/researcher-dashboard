# Implementation Plan: RD-3 pass 2, the run and its result

**Jira**: https://concord-consortium.atlassian.net/browse/RD-3
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

Eight commits on `RD-3-pass-2-run-and-result`, each passing `npm test` and `npm run build` in `app/` on its own. The markdown renderer and the Content-Security-Policy are their own commits, for a focused review (Doug, 2026-10-11). Local tooling as pass 1: `PATH=$HOME/.nvm/versions/node/v22.17.1/bin:$PATH`, then `npm ci && npm test && npm run build` in `app/`.

### Package keys, the run request and resolve

**Summary**: The shell calls this pass adds, with no page change: the package key of an identity, `Portal.runPackage`, `ReportServer.resolve`, and `runnable` on the list row. Covers R5's request, R9's key derivation and R21's call.

**Files affected**:
- `app/src/shell/packages.ts`: `packageKey`, `identityOfKey`
- `app/src/shell/portal.ts`: `PackageRow.runnable`, `Portal.runPackage`, `ReportServer.resolve`, `Resolved`
- `fixtures/package-contract.json` (repository root): added only if RD-4 pass 2 has not merged; the exact bytes of report-service `master`'s file, as `runner/scripts/contract.mjs sync` would write them
- `app/tests/packages.test.ts`, `app/tests/portal.test.ts`, `app/tests/fixtures.ts`

**Estimated diff size**: ~120 lines

```ts
// packages.ts
// The result document's id: the identity with "/" as "__", which the function and the runner
// derive the same way, so the page can find a result without being told its path.
export function packageKey(identity: string): string {
  return identity.replaceAll("/", "__");
}

export function identityOfKey(key: string): string {
  return key.replaceAll("__", "/");
}
```

```ts
// portal.ts
export interface PackageRow {
  // ...pass 1's fields
  runnable: boolean;
}

export interface Resolved { archived: boolean }

// Portal
runPackage(identity: string, version: string): Promise<unknown> {
  return this.api.request("/api/v1/researcher_dashboard/run_package", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packages: [{ identity, version }] })
  });
}

// ReportServer
resolve(identity: string, version: string): Promise<Resolved> {
  const query = new URLSearchParams({ identity, version });
  return this.api.request<Resolved>(`/api/v1/packages/resolve?${query}`);
}
```

`fixtures.ts`'s `row()` gains `runnable: true`.

**Tests**:
- `packages.test.ts`: `packageKey` equals `key` for every `package_key` case of `../../fixtures/package-contract.json` (read with `readFileSync` and `new URL(..., import.meta.url)`), after asserting the case list is not empty; `identityOfKey(packageKey(x)) === x` for every valid `identity` case. Deleting `replaceAll` for `replace` fails on a case with two slashes, which both fixture cases have.
- `portal.test.ts`: `runPackage` posts exactly `{"packages":[{"identity":"projects/20/w","version":"1.0.0"}]}` with the bearer and the JSON content type to the portal's origin; `resolve` GETs `/api/v1/packages/resolve?identity=projects%2F20%2Fw&version=1.0.0` at report-server with the bearer.

---

### One sign-in, four listeners

**Summary**: `watchProfile` becomes `watchClass`, which mints one Firebase token, signs in once, and opens the profile, runner, scope-document and results listeners, returning one unsubscribe. `ClassDashboard` holds what they deliver and shows R3's lines. Covers R1 to R3.

**Files affected**:
- `app/src/shell/firebase.ts`: `runnerPath`, `scopeDocPath`, `resultsPath`, `watchCollection`
- `app/src/shell/runs.ts` (new): the document types
- `app/src/shell/services.ts`: `watchClass` replaces `watchProfile`
- `app/src/pages/ClassDashboard.tsx`: state for `runner`, `counts`, `results`, and the two refusal lines
- `app/tests/no-writes.test.ts` (new): R2's source test
- `app/tests/services.test.ts`, `app/tests/firebase.test.ts`, `app/tests/class-dashboard.test.tsx`, and `app/tests/app.test.tsx`, whose fake services carry `watchProfile` today and fail `tsc` (which checks `tests/`) once the field is gone

**Estimated diff size**: ~230 lines

```ts
// runs.ts
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
```

```ts
// firebase.ts
export function runnerPath(portalOrigin: string, platformUserId: number): string {
  return `researcher_dashboard/${portalSegment(portalOrigin)}/runners/${platformUserId}`;
}
export function scopeDocPath(portalOrigin: string, classHash: string, platformUserId: number): string {
  return `${classPath(portalOrigin, classHash)}/researchers/${platformUserId}`;
}
export function resultsPath(portalOrigin: string, classHash: string, platformUserId: number): string {
  return `${scopeDocPath(portalOrigin, classHash, platformUserId)}/results`;
}

// Each document by its id, which for results is the package key.
export function watchCollection<T>(
  db: Firestore, path: string, onValue: (docs: Map<string, T>) => void, onError: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, path),
    (snapshot) => onValue(new Map(snapshot.docs.map((d) => [d.id, d.data() as T]))),
    (error) => {
      console.error(`listener on ${path} failed`, error);
      onError(error);
    }
  );
}
```

```ts
// services.ts
export interface ClassListeners {
  profile: (profile: Profile | null) => void;
  runner: (runner: Runner | null) => void;
  counts: (counts: Counts | null) => void;
  results: (results: Map<string, Result>) => void;
  // Which listener the rules refused, so the page can say what it could not read.
  refused: (which: "profile" | "runner" | "counts" | "results") => void;
}

export interface DashboardServices {
  portal: Portal;
  reportServer: ReportServer;
  // One Firebase token and one sign-in for the scope's class, then the four documents the page
  // reads. Resolves to a function that stops all four.
  watchClass: (scope: Scope, on: ClassListeners) => Promise<() => void>;
  now: () => number;
}

// makeServices
async watchClass(scope, on) {
  const customToken = await portal.firebaseToken(config.firebaseProject, scope.class_hash);
  const db = await signIn(config.firebaseProject, customToken, emulatorsFromEnv(...));
  const uid = scope.platform_user_id;
  const stops = [
    watchDoc<Profile>(db, classPath(config.origin, scope.class_hash), on.profile, () => on.refused("profile")),
    watchDoc<Runner>(db, runnerPath(config.origin, uid), on.runner, () => on.refused("runner")),
    watchDoc<Counts>(db, scopeDocPath(config.origin, scope.class_hash, uid), on.counts, () => on.refused("counts")),
    watchCollection<Result>(db, resultsPath(config.origin, scope.class_hash, uid), on.results, () => on.refused("results"))
  ];
  return () => stops.forEach((stop) => stop());
}
```

In `ClassDashboard`, the profile effect becomes the class effect, with the same cancel-and-stop shape and the same `info` dependency, so all four stop on an info page. New state: `runner` (`Runner | null`), `counts` (`Counts | null | undefined`), `results` (`Map<string, Result>`, empty at first), and `runsProblem`, `countsProblem` (strings). `refused("profile")` sets pass 1's `profileProblem`; `"results"` and `"runner"` set `runsProblem` to "Your runs could not be read."; `"counts"` sets `countsProblem` to "Your counts could not be read.". Both lines render in the Packages section's live region beside pass 1's.

**Tests**:
- `services.test.ts` (its `vi.mock` of `firebase.ts` gains `watchCollection` beside `watchDoc`): the existing test becomes `watchClass`'s: one `jwt/firebase` call, one `signIn`, and `watchDoc` called with the class, runner and scope-document paths and `watchCollection` with the results path, each built from `SCOPE.platform_user_id` (200) and `SCOPE.class_hash`; the returned function calls all four stops. Changing any path's segment fails it.
- `firebase.test.ts`: the three path builders for the staging portal.
- `no-writes.test.ts` (R2): reads every file under `app/src/` and fails if any imports `setDoc`, `updateDoc`, `addDoc`, `deleteDoc`, `writeBatch` or `runTransaction` from `firebase/firestore`, or builds a `jwt/firebase` query without `researcher: "true"`; it first asserts it read `shell/firebase.ts`, so a wrong directory cannot pass it. Adding a `setDoc` import to any source file fails it.
- `class-dashboard.test.tsx`: the fake gains `watchClass`, keeping pass 1's `snapshot` and `refuse` helpers for the profile and adding `runner`, `counts`, `results` pushers and `refuseRuns`, `refuseCounts`. New cases: each refusal's line; the unsubscribe is called when a 403 turns the page into the withdrawn page (pass 1's case, now for the one function that stops all four).

---

### Row state, the queue and stuck

**Summary**: Pure functions from the documents to what a row and the session line say, with no React, so every rule of R7 to R14 is a unit test. Covers R7, R8, R9, R12 and R14's text. R13 needs no code: pass 1's `groupPackages` already orders every group by title, and stays as it is.

**Files affected**:
- `app/src/shell/runs.ts`: the functions below
- `app/tests/runs.test.ts` (new)

**Estimated diff size**: ~300 lines, about two thirds tests

```ts
// runs.ts

// The states in which the session will take queued work without being asked again. A runner
// document with a queue and no state is what a launch that failed leaves behind.
const TAKING = ["starting", "ready", "running", "suspending", "suspended"];

export function sessionTakes(runner: Runner | null): boolean {
  return TAKING.includes(runner?.state ?? "");
}

const millis = (stamp: Stamp | null | undefined) => stamp?.toMillis() ?? null;

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
// replacing. RD-6 imports this name.
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
  prepare_package: "preparing the package", run_package: "running the package"
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

// R14's line above the list. `titleOf` names a package of this class by its key, or returns null;
// `requesting` is whether any run request from the page is in flight.
export function sessionLines(runner: Runner | null, classHash: string, results: Map<string, Result>,
  titleOf: (key: string) => string | null, requesting: boolean): string[] { /* R14, case by case */ }
```

`sessionLines` returns R14's sentences: none with no document or no `state`; one for `starting`, `ready`, `running` (this class's `current_package` by `titleOf(key) ?? identityOfKey(key)` while `results.get(key)` is absent or `running`, "Your machine is starting its next package." once it is `done` or `failed`, or the other-class sentence); two for `suspending`/`suspended` with a non-empty `queue`; for `terminated` and `failed`, the second sentence when any of `results` is `queued` and `requesting` is false.

**Tests** (`runs.test.ts`, with a `stamp(ms)` helper):
- `sessionTakes`: true for each of the five states; false for none, `{queue: [...]}` with no state, `terminated`, `failed`.
- `nextMark`: the same object back for a snapshot that moves only `updated_at` (fails if the mark always takes the latest); a new mark, at the new `updated_at`, when `state` changes and when `microvm_id` changes; `null` for no runner.
- `isStuck`: true for a different `microvm_id`, and for the same VM `suspended`, `terminated`, `failed`; false for `suspending`, `running`, `ready`, no runner, a non-running result, and `suspended` with the result's `updated_at` one millisecond later than the mark. That case fails if the timestamp guard is deleted; the different-VM case fails if the id comparison is. `suspended` with the result at 100, the runner document at 110 and a mark at 90 is not stuck (fails if the mark is ignored), and with no mark it is (the reload fallback).
- `queuePosition`: 2 when one entry of another class precedes it (so counting only this class's entries fails), `null` when absent.
- `latestFinished`: the result for `done`; `previous` for queued, running and failed results that carry one; `null` for those without, and for no result. Returning `result` for every status fails the failed-with-`previous` case; returning `previous` for `done` fails the first.
- `rowState`: each kind; a queued result with a terminated session is `waiting`.
- `rowState`: a stuck result is `resumable` for `suspended` on the same VM, and not for a newer VM or `terminated`.
- `runOffer`: R7's disabled cases (unrunnable, running, queued with a live session, stuck and not resumable, the last with its reason) and enabled ones (none, done, failed, queued and waiting, stuck and resumable).
- `sessionLines`: each R14 case, including the other-class `current_package`, a package of this class that is not listed (the identity rebuilt from its key), a `current_package` whose result is `done` (fails if the result is not consulted), and `terminated` with a queued result and `requesting` true (no second sentence).

---

### The Run control and each row's state

**Summary**: The page wiring: `PackageList` renders each row's state, Run control and reason, the page sends the run request and shows its refusals, the session line and the counts block sit above the groups, and the ownership line under the header. Covers R4, R6, R10, R11, R14, R20's counts, R22, R24 and R29's row half.

**Files affected**:
- `app/src/components/PackageList.tsx`: a `Row` component with state, version note, Run and Show result
- `app/src/components/Counts.tsx` (new)
- `app/src/pages/ClassDashboard.tsx`: the run handler, request state, session line, counts, ownership line
- `app/src/pages/Info.tsx`: "What it can show"
- `app/src/styles.css`
- `app/tests/class-dashboard.test.tsx`, `app/tests/package-list.test.tsx` (new), `app/tests/app.test.tsx` (the info page's list)

**Estimated diff size**: ~380 lines, about half tests

`PackageList` takes `{rows, scope, results, runner, requests, onRun, onShow}`; `requests` is a `Map<string, RunRequest>` keyed by package key, where `RunRequest` is `{pending: true} | {message: string; at: number | null} | {resuming: true; at: number | null}` (not `Request`, which would shadow the DOM's). It also takes the page's `mark`, for `rowState`, and `onRun(row, resume)` says whether the row offered Resume. It groups with pass 1's `groupPackages(rows, scope)`, which orders every group by title (R13).

The row (`<li>`, inside pass 1's list): the title, version and description as pass 1; then
- when `latestFinished(result)` is not null: its summary as text, "Finished <time>" and R10's "from <version>" (the finished result's version against the row's);
- `<div className="state" aria-live="polite">` holding a `<p>` with R9's text for `rowState(...)` (a `waiting` queued state reads as plain Queued while the row's request is pending, R8): alone when the result is `done` or there is no finished result, prefixed "Updating: " for a queued, running or stuck re-run over a finished result, and as "The latest re-run failed: <error>. Showing the result from <time>." for a failed one; and, in the same region (R11), "Requesting…" while the request is pending, or the request's message (`className="error"`) while the result's `updated_at` still equals the request's `at`; a `resuming` request whose `at` still equals the result's `updated_at` replaces the paused text with R7's "Resuming: it will continue within a minute or two.";
- a `<button type="button">` "Run", `aria-label={`Run ${title}`}`, or "Resume" with `aria-label={`Resume ${title}`}` on a resumable stuck row (the same request), `aria-disabled="true"` per `runOffer`, while the request is pending, or while it reads as resuming, with `onClick` returning early then (never the native `disabled`, which drops focus to `body`, R29), `aria-describedby` pointing at the reason's `id` when there is one;
- the reason, `<p id=... className="reason">`, when `runOffer` gives one;
- when `latestFinished(result)` is not null, `<button>` "Show result", `aria-label={`Show result for ${title}`}` (the visible label first and whole, WCAG 2.5.3), calling `onShow(key)`, with a ref the page keeps for R15's focus return.

The run handler in `ClassDashboard`:

```ts
// The results as of the latest snapshot, for a handler that resumes after an await; the
// `results` its render closed over is older.
const latestResults = useRef(results);
useEffect(() => { latestResults.current = results; }, [results]);

const forget = (key: string, request?: RunRequest) =>
  setRequests((r) => {
    if (request && r.get(key) !== request) return r;
    const next = new Map(r); next.delete(key); return next;
  });

async function run(row: PackageRow, resume: boolean) {
  const key = packageKey(row.identity);
  setRequests((r) => new Map(r).set(key, { pending: true }));
  try {
    await services.portal.runPackage(row.identity, row.current_version.version);
    if (!resume) return forget(key);
    const resuming: RunRequest = { resuming: true, at: latestResults.current.get(key)?.updated_at?.toMillis() ?? null };
    setRequests((r) => new Map(r).set(key, resuming));
    setTimeout(() => forget(key, resuming), RESUME_WAIT_MS);
  } catch (error) {
    // Keyed to the result as the refusal finds it: the queued write lands before a VM step fails.
    const at = latestResults.current.get(key)?.updated_at?.toMillis() ?? null;
    refused(error, (message) => setRequests((r) => new Map(r).set(key, { message, at })), "portal");
  }
}
```

The runner listener keeps the mark beside the document: `on.runner` sets `runner` and `setMark((m) => nextMark(m, runner))`. A late timeout after the page has gone is a no-op, since `forget` only drops the entry it set.

The session line is `sessionLines(runner, scope.class_hash, results, titleForKey, [...requests.values()].some((r) => "pending" in r))`, where `titleForKey` looks the key up among the grouped rows.

`refused` gains one rule, `ApiError` 404 from the portal renders `class-gone`, so the run request's 404 and a refresh's 404 behave as the scope's already does, and the scope effect's own 404 branch (`ClassDashboard.tsx:54`) is deleted, since `refused` now covers it; pass 1's "renders the class-gone page on a 404" test keeps guarding it. Its other rules already give R6's 401, young-token, 403 and unreachable handling.

`Counts` renders R20's block from `counts` (`undefined` before the first snapshot renders nothing; `null` renders "No runs yet."), formatting each timestamp with `formatTime(ms) = new Date(ms).toLocaleString()`, which `runs.ts` exports and the row uses too. The ownership line is a `<p className="ownership">` under the header's meta line. The session lines join the Packages section's live region.

`Info.tsx`'s "What it can show" gains two items: running a package and seeing its result; and the counts from your own runs.

**Tests**:
- `package-list.test.tsx`: R13, a group whose rows' finish times run against their titles still renders in title order; each state's text on a row; the "from 1.0.0" note against the shown result's version; a queued and a running re-run with `previous` showing the previous summary, "Show result" and the "Updating: " line; a failed re-run's line over the kept summary; Run disabled with its reason for `runnable: false` (and the reason is the button's description); Run disabled for running and for queued with a live session, enabled for queued with no session; a disabled Run is `aria-disabled="true"`, not `disabled`, and clicking it calls no `onRun` (fails if the early return goes; `toBeDisabled()` does not see `aria-disabled`, so assert the attribute); "Show result" absent with no finished result.
- `class-dashboard.test.tsx`: Run calls `runPackage` with the row's identity and current version; "Requesting…" while it is pending, inside the row's live region, with focus still on the Run button (fails with the native `disabled`); a 409's message on that row only, inside the same region, gone once the result's `updated_at` changes; a 502 rejected after a `queued` snapshot for that row still shows, and goes at the next snapshot (fails with `at` read before the await); Resume's 202 makes the row read "Resuming: …" with the control disabled, a result snapshot with a new `updated_at` turns it to the running stage, and with fake timers three minutes without one bring back the paused text and an enabled Resume; a runner snapshot that moves only `updated_at` past a resumed run's last beat leaves the row running (fails if the page passes no mark); while the request is pending with that `queued` snapshot and no runner state, the row reads "Queued." and not R8's sentence; a 401 calls `onExpired`; a 403 renders the withdrawn page; a 404 the class-gone page; a `TypeError` "The portal could not be reached." on the row; the session line from a runner snapshot; the counts block with `logs` absent ("not reported") and with no document; the ownership line.
- `app.test.tsx`: the info page's list names running a package.

---

### The markdown renderer

**Summary**: The one place a result's markdown becomes elements, in its own commit for review: remark with micromark's HTML constructs disabled, GFM, a URL transform that keeps only R17's schemes, components that turn a refused link or image into text and shift headings below the result's own (R29), and `rehype-sanitize` with a schema allowing only R18's elements, attributes and schemes. Nothing uses it until the next step. Covers R16 to R18 and R19's half that is about rendering.

**Files affected**:
- `app/package.json`, `app/package-lock.json`: `react-markdown` `^9.1.0`, `remark-gfm` `^4.0.1`, `rehype-sanitize` `^6.0.0`; `rehype-raw` `^7.0.0` as a dev dependency, for the schema's own test
- `app/src/components/ResultMarkdown.tsx` (new)
- `app/tests/result-markdown.test.tsx` (new)

**Estimated diff size**: ~170 lines

```tsx
import Markdown, { type Components, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { type Options as SanitizeSchema } from "rehype-sanitize";
import type { ReactNode } from "react";
import type { Processor } from "unified";

// A result is markdown written by fetched code, shown on a page holding the researcher's bearer
// and a Firebase session for student data. HTML in it is never recognized as HTML: micromark's
// HTML constructs are switched off, so a tag is text before anything else sees it.
function noHtml(this: Processor) {
  const data = this.data() as { micromarkExtensions?: unknown[] };
  (data.micromarkExtensions ??= []).push({ disable: { null: ["htmlFlow", "htmlText"] } });
}

const LINK = /^(https?:|mailto:)/i;
// A data: image makes no request; SVG is left out because it is the image type that can carry script.
const IMAGE = /^data:image\/(png|jpeg|gif|webp)[;,]/i;

export const keepUrl: UrlTransform = (url, _key, node) =>
  node.tagName === "img" ? (IMAGE.test(url) ? url : "") : LINK.test(url) ? url : "";

// Behind the transform, not instead of it: only what CommonMark and GFM's tables, strikethrough
// and task lists produce. Not built on GitHub's default schema, which also allows <picture> and
// <source srcset>, a remote load with no protocol check, should HTML ever reach the tree.
export const SCHEMA: SanitizeSchema = {
  strip: ["script"],
  clobberPrefix: "user-content-",
  clobber: ["name", "id"],
  tagNames: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "pre", "code", "em",
    "strong", "a", "img", "hr", "br", "table", "thead", "tbody", "tr", "th", "td", "del", "input"],
  attributes: {
    a: ["href", "title"], img: ["src", "alt", "title"], th: ["align"], td: ["align"], ol: ["start"],
    input: [["type", "checkbox"], ["disabled", true], "checked"]
  },
  required: { input: { type: "checkbox", disabled: true } },
  protocols: { href: ["http", "https", "mailto"], src: ["data"] }
};

// The opened result's title is an h3, so a package's "#" is an h4 (R29).
const HEADINGS = ["h4", "h5", "h6", "h6", "h6", "h6"] as const;

const COMPONENTS: Components = {
  a: ({ href, children }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>,
  img: ({ src, alt }) => src ? <img src={src} alt={alt ?? ""} /> : <span>{alt}</span>,
  ...Object.fromEntries(HEADINGS.map((Tag, i) => [`h${i + 1}`, ({ children }: { children?: ReactNode }) => <Tag>{children}</Tag>]))
};

export function ResultMarkdown({ markdown, sanitize = true }: { markdown: string; sanitize?: boolean }) {
  return (
    <div className="result-markdown">
      <Markdown remarkPlugins={[noHtml, remarkGfm]} rehypePlugins={sanitize ? [[rehypeSanitize, SCHEMA]] : []}
        urlTransform={keepUrl} components={COMPONENTS}>
        {markdown}
      </Markdown>
    </div>
  );
}
```

The `sanitize` prop exists for R30's proof that R16 and R17 hold alone; nothing else passes it.

**Tests** (`result-markdown.test.tsx`), over one hostile document holding a `<script>` block, `<img src=x onerror=alert(1)>`, an `<iframe>`, `[x](javascript:alert(1))`, `[y](javascript:void('https:'))`, `[r](/relative)`, `![remote](https://evil.test/b.png)`, `![svg](data:image/svg+xml;base64,PHN2Zz4=)`, `![png](data:image/png;base64,...)`, `[ok](https://concord.org)`, a GFM table and a task list, each run with the sanitizer on and off:
- no `script`, `iframe` or `object` element; every `img` has a `data:image/png` source and there is exactly one; no element has an attribute whose name starts with `on`; every `href` matches `LINK`;
- the text `<script>` and `onerror=alert(1)` appears in the rendered text;
- the refused link's and images' text ("x", "remote", "svg") appears, not as a link or image;
- the `https` link renders with `target="_blank"` and `rel="noopener noreferrer"`, the table renders a `table` with its cells' alignment, the task list a disabled checkbox checked for `[x]` and not for `[ ]`, and a `#` and a `##` render as `h4` and `h5`.
- `SCHEMA` itself, rendered through react-markdown directly with `rehypePlugins={[rehypeRaw, [rehypeSanitize, SCHEMA]]}` and no `noHtml`, `rehype-raw` standing in for an HTML parser that R16 failed to switch off: `<picture><source srcset="https://evil.test/a.png">` and `<details>` come out with no `source`, `picture` or `details` element. Building `SCHEMA` on `defaultSchema` fails it.

Mutations each fails (run 2026-10-11 against this step's code in a copy of the app): removing `noHtml` (the escaped `<script>` text disappears); `LINK` without its `^` (the `javascript:void('https:')` link keeps its `href` with the sanitizer off); `IMAGE` admitting `svg+xml` (a second `img` appears, in both runs, since the sanitizer's `data` protocol admits any `data:` source); and the `img` component's fallback replaced by an `<img>` with no source (an `img` without a `data:image/png` source appears).

---

### The Results section

**Summary**: Opening a done result, rendering it with the renderer, and listing results whose package is no longer listed with the resolve note. Covers R15, R19, R20's Results section, R21, R23 and R29's focus half.

**Files affected**:
- `app/src/components/ResultView.tsx` (new): the opened result
- `app/src/components/Unlisted.tsx` (new): "Packages no longer listed"
- `app/src/pages/ClassDashboard.tsx`: `openKey`, the focus refs, the resolve effect and its notes
- `app/src/styles.css`
- `app/tests/class-dashboard.test.tsx`, `app/tests/result-view.test.tsx` (new)

**Estimated diff size**: ~300 lines

`ClassDashboard` state: `open: {key: string; shownAt: number | null} | null`, where `shownAt` is the `finished_at` millis of the finished result the view opened on, a `showButtons` ref (`Map<string, HTMLElement>`, filled by the rows of both `PackageList` and `Unlisted`), a ref on the Results heading (`tabIndex={-1}`), and `notes: Map<string, string | null>` keyed by identity with an `asked` ref (`Set<string>`).
- `onShow(key)` sets `open` with `latestFinished(results.get(key))`'s `finished_at` millis.
- The view renders `latestFinished(results.get(open.key))`, so a re-run's queued, running and failed writes leave it showing the same finished result, and a new `done` shows in place. When that finished result's `finished_at` is later than `shownAt`, the view shows "Updated <time>" in a `role="status"` line; focus does not move.
- An effect on `results` closes `open` and focuses the Results heading only when `latestFinished` for the open key is null (a result queued before the function wrote `previous`).
- `ResultView` is rendered with `key={open.key}`, so opening another result while one is open mounts a new view and its mount effect moves focus again; it gets the title (the listed row's, or the identity), the finished result, the `updated` time when there is one, and `onClose`; it renders `<section aria-labelledby>` with an `h3` holding the title, `tabIndex={-1}`, focused in a mount effect; the version, "Finished <time>", the summary in a `<p>` as text, and `<ResultMarkdown markdown={finished.display ?? ""} />`; and a "Close" button that calls `onClose`, which clears `open` and focuses the row's Show result button.
- The unlisted results are `[...results].filter(([, r]) => !listed.has(r.package.identity))`, where `listed` is the set of identities in `groupPackages(rows, scope)`'s groups (membership only, so no order is needed), not in `rows`: the list returns `applies: false` rows and rows in no group, which the page does not show (R21). Computed only when `rows` is non-null and the list did not fail. An identity found in `rows` takes its note from that row with no call: `applies: false` gives "This package no longer applies to this class.", otherwise "This package is not offered in any of this class's groups.". For an identity not in `rows`, an effect asks `services.reportServer.resolve(identity, version)` once per identity not in `asked`: `archived` gives "This package has been archived.", an `ApiError` 404 "This package is no longer available to you.", anything else `null` (no note). A `SessionExpired` goes through `refused` like any call. `Unlisted` renders R21's rows with R9's state text, the latest finished result and Show result, and no Run; a waiting queued state reads "Queued, waiting for a machine." and a stuck one "Paused partway through." or R12's interrupted line, without R8's and R12's instructions.
- The Results section is `<section aria-labelledby="results-heading"><h2 id="results-heading">Results</h2>…</section>` after the Packages section, holding `ResultView` when open and `Unlisted` when there are unlisted results; with neither, it says "Open a finished package's result to read it here."

**Tests**:
- `class-dashboard.test.tsx`: Show result opens the view with the title focused; Show result on a second done row while the first is open moves focus to the second title (fails without the `key`); Close returns focus to that row's button; a result snapshot turning the open result `queued` with `previous`, then `running`, then `failed` leaves the view open on the same summary with focus where it was; a new `done` shows in place with "Updated <time>" and focus unmoved; a snapshot turning it `queued` with no `previous` closes the view and focuses the Results heading; results of a row the list returned with `applies: false` and of one that applies in no group show under "Packages no longer listed" with their row notes and no resolve call; results of identities the list did not return show with the archived and 404 notes (one resolve call per identity across two snapshots, which fails if the `asked` guard is removed); none has a Run, and a waiting queued one reads without "run it to start one"; nothing is placed there while the list is pending or after it failed.
- `class-dashboard.test.tsx` also: the Results section's placeholder line with nothing open and nothing unlisted, and its absence once a result is opened.
- `result-view.test.tsx`: `**bold**` in a summary shows its asterisks; the display renders through `ResultMarkdown` (a heading in the markdown becomes a heading element).

---

### The Content-Security-Policy

**Summary**: The policy, built from the portal allowlist and the Firebase hosts, injected by a build-only Vite plugin as the first element of `<head>`, in its own commit. Covers R25 to R27.

**Files affected**:
- `app/src/shell/csp.ts` (new): `FIREBASE_HOSTS`, `contentSecurityPolicy(portals)`
- `app/src/shell/portals.ts`: `DEPLOYED` exported
- `app/vite.config.ts`: the plugin
- `app/tests/csp.test.ts` (new)

**Estimated diff size**: ~110 lines

```ts
// csp.ts
import type { PortalConfig } from "./portals";

// The hosts the Firebase Auth and Firestore web SDKs call, signing in with a custom token and
// in-memory persistence. A popup, redirect or reCAPTCHA flow would need more, and the app has none.
export const FIREBASE_HOSTS = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firestore.googleapis.com"
];

// `img-src` is the directive that matters most: an image is a request to any host at render time.
export function contentSecurityPolicy(portals: PortalConfig[]): string {
  const connect = new Set(["'self'", ...portals.flatMap((p) => [p.origin, p.reportServer]), ...FIREBASE_HOSTS]);
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src ${[...connect].join(" ")}`,
    "font-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-src 'none'"
  ].join("; ");
}
```

```ts
// vite.config.ts
import { contentSecurityPolicy } from "./src/shell/csp";
import { DEPLOYED } from "./src/shell/portals";

// A <meta> rather than a CloudFront header, so the policy ships with the renderer it bounds and
// covers every path the build is served from. Build only: the dev server's preamble is inline.
const csp = (): Plugin => ({
  name: "researcher-dashboard-csp",
  apply: "build",
  transformIndexHtml: () => [{
    tag: "meta",
    attrs: { "http-equiv": "Content-Security-Policy", content: contentSecurityPolicy(DEPLOYED) },
    injectTo: "head-prepend"
  }]
});
// plugins: [react(), csp()]
```

The config's existing header comment and `define` stay.

**Tests** (`csp.test.ts`, `// @vitest-environment node`, since esbuild refuses to start under jsdom):
- `contentSecurityPolicy(DEPLOYED)` has R25's directives exactly, and its `connect-src` holds every `DEPLOYED` origin and report-server and each `FIREBASE_HOSTS` entry.
- Vite's `build({ configFile: <app>/vite.config.ts, logLevel: "silent", build: { write: false } })`, then the emitted `index.html`'s first `<head>` element is the CSP meta and its `content` equals `contentSecurityPolicy(DEPLOYED)`. Moving the tag with `injectTo: "head"` fails it (checked in stage 4, and again in the second review pass). About 2.5 seconds.

---

### The README

**Summary**: The prose the pass invalidates. Covers R28.

**Files affected**:
- `app/README.md`: the first paragraph says the page runs packages and shows their results; "What it reads" gains the run request (portal), resolve (report-server), and the runner, scope and results documents (report-service's Firebase project), and says the app writes none of them; a short "Content-Security-Policy" section says the built page carries the policy as its first `<head>` element, that its `connect-src` comes from `src/shell/portals.ts` and `src/shell/csp.ts`, and that the dev server has none
- The root `README.md` is RD-4 pass 2's to rewrite. If RD-4 pass 2 has merged first, its `fixtures/` line ("which the runner's grammar and duration ceiling are tested against") gains "and the app's package keys"; if not, this pass adds no line, and the fixture's line is RD-4 pass 2's to word with both consumers when it rebases.

**Estimated diff size**: ~30 lines

## Open Questions

### RESOLVED: Judgment call: one `watchClass` rather than a second watcher beside `watchProfile`
**Context**: The three new listeners need the same Firebase sign-in as the profile.
**Options considered**:
- A) Replace `watchProfile` with `watchClass`, one token and one sign-in for all four.
- B) Keep `watchProfile` and add `watchRuns`.

**Decision**: A. B mints a second custom token and signs in a second time on the same named app, which replaces the first sign-in under the profile listener; and `watchProfile` would have no caller once A exists, so keeping both leaves dead code.

### RESOLVED: Judgment call: a refusal shown on the row is cleared by the result changing
**Context**: R6 says a refusal stays "until the next request from that row or until its result changes".
**Options considered**:
- A) Keep the result's `updated_at` at the time of the request beside the message, and show the message only while it is unchanged.
- B) Clear messages in an effect on `results`.

**Decision**: A, with `at` read when the refusal arrives, not when the request is sent (third review pass): the queued write lands before a VM step can fail, so a request-time `at` hid every 502 and 504. It is a comparison at render with no effect and no extra state transitions.

### RESOLVED: Judgment call: the Firebase hosts live in `csp.ts`, not beside the Firebase config
**Context**: R26 said "named once, beside the Firebase config". `vite.config.ts` must import them, and `firebase.ts` imports the Firebase SDK, which the config has no reason to load.
**Options considered**:
- A) `csp.ts` owns `FIREBASE_HOSTS`, with the reason in a comment.
- B) Export them from `firebase.ts` and have the config import the SDK modules.

**Decision**: A. The hosts are a property of the policy, named once; R26's wording is updated to "named once, in the module that builds the policy".

### RESOLVED: Low confidence: `react-markdown` 9's types for `urlTransform`'s node and the component props
**Context**: The renderer step's code was run as JavaScript in stage 4, not type-checked.
**Options considered**:
- A) Type-check the step's code against the installed packages before stage 8.
- B) Leave it to implementation.

**Decision**: A, done 2026-10-11: the step's `ResultMarkdown.tsx`, copied verbatim from this spec into a copy of the app at `c857971` with the three packages installed (react-markdown 9.1.0, remark-gfm 4.0.1, rehype-sanitize 6.0.0), passed `tsc --noEmit` over `src`, `tests` and `vite.config.ts`.

### RESOLVED: Low confidence: a jsdom render of `ResultMarkdown` behaves as the server render did
**Context**: The tests render with Testing Library under vitest's jsdom environment, where ESM-only packages must load.
**Options considered**:
- A) Run the renderer's tests under the app's vitest before stage 8.
- B) Leave it to implementation.

**Decision**: A, done 2026-10-11 in the same copy: a test file with this step's assertions over the hostile document, run with the sanitizer on and off, passed under jsdom (2 tests, 58 ms), and each of the four mutations listed in the step failed it.

## Self-Review

Stage 7, unattended. Roles: the commit reviewer (does each step pass `tsc --noEmit`, `npm test` and `npm run build` without the next), the test writer (can each named test be written against the harness, and does it fail on the mutation it names), the Senior Engineer, and the Security Engineer. Each finding was checked against the code on `main` or the throwaway build before it was written.

### Commit reviewer

#### RESOLVED: The listener step left a test that no longer type-checks
`tests/app.test.tsx:32` builds a `DashboardServices` with `watchProfile`, and `tsconfig.json` includes `tests/`, so removing the field in "One sign-in, four listeners" fails `npm run build` (`tsc --noEmit`) in that commit unless the test changes with it. The step's files now include it, and its `services.test.ts` note says the `vi.mock` of `firebase.ts` must add `watchCollection`.

### Senior Engineer

#### RESOLVED: The new 404 rule orphaned the scope effect's own branch
With `refused` rendering `class-gone` for a portal 404, the scope effect's `if (error instanceof ApiError && error.status === 404)` (`ClassDashboard.tsx:54`) duplicates it. The run-control step now deletes it, with pass 1's test still covering the page.

#### RESOLVED: Two smaller naming and wiring gaps in the run-control step
The `groupPackages` half is superseded: R13 orders every group by title (Doug, 2026-10-11), so `groupPackages` takes no results.

The request map's type was named `Request`, which shadows the DOM's global type in that module, and the step never said `PackageList` passes `results` to `groupPackages`, without which R13's order never reaches the page while the row-state step's tests still pass. Both are fixed in the step.

### Second review pass (2026-10-11, unattended)

Roles: the Security Engineer, the WCAG accessibility reviewer, the test writer, and the Senior Engineer. Each finding was confirmed against the code on `main`, the contracts (REPORT-143 at `1d9a677`, RD-4 pass 2 at `9397abd`, report-server as built), or throwaway code in a copy of the app with react-markdown 9.1.0, remark-gfm 4.0.1, rehype-sanitize 6.0.0 and rehype-raw 7.0.0, deleted afterward. After the fixes below, the renderer step's `ResultMarkdown.tsx` and the CSP step's plugin, copied from this spec, passed `tsc --noEmit` over `src`, `tests` and `vite.config.ts`; the renderer's hostile-document assertions passed with the sanitizer on and off; the built `index.html` test passed; and the app's existing 96 tests still passed. Requirements-level findings from this pass are in requirements.md.

### Security Engineer (second pass)

#### RESOLVED: The sanitizer schema was GitHub's default, not R18's allowlist
`SCHEMA` spread `defaultSchema`, which allows `details`, `summary`, `div`, `kbd`, `ruby`, `picture` and `source` among its 53 tag names, global attributes such as `action`, `method`, `tabIndex`, `width` and `height`, and `cite` and `longDesc` URLs, and checks no protocol on `source`'s `srcSet`. R18 allows only what CommonMark and GFM produce. The gap matters in exactly the case the sanitizer is for: with HTML parsed (`rehype-raw` standing in for an R16 failure), `<picture><source srcset="https://evil.test/a.png"><img src="data:...">` came through the spec's `SCHEMA` intact, a remote image load that only the CSP would then stop. `SCHEMA` is now written out: R18's tags, their attributes (`checked` included, see requirements.md), `href` and `src` protocols only, and `strip`, `clobber` and `required` as the default schema has them. With it the same input lost `picture`, `source` and `details`, and GFM's table alignment, checked and unchecked task items, a list's `start`, strikethrough, the `data:` PNG and an `https` link all still rendered. The renderer's tests gain a case for `SCHEMA` itself, which a schema built on `defaultSchema` fails.

### WCAG accessibility reviewer (second pass)

#### RESOLVED: "Show the result of <title>" did not contain its visible label
WCAG 2.5.3 (Label in Name) needs the visible text "Show result" inside the accessible name, and "Show the result of Wildfire responses" splits it, so a speech user saying "click Show result" may not reach the button. The name is now `Show result for <title>`; "Run <title>" already passes.

#### RESOLVED: Closing the view on a re-run sent focus to a button that no longer exists
Superseded by #204's `previous`: an open result no longer closes on a re-run (R15), so the close-on-change effect and the focusable state line are gone.

The close-on-change effect focused `showButtons.get(key)`. A done result's `updated_at` changes only when a re-run's `queued` write replaces it (the function's full `set`), and Show result renders only on a done row, so by the time the effect runs that button is gone, and focus would fall to the page's body. The effect now focuses the row's state line, which gets `tabIndex={-1}` and a ref; Close still returns focus to Show result, which exists then. The test turns the open result `queued` and asserts the state line has focus.

#### RESOLVED: Opening a second result while one was open left focus where it was
`ResultView` focuses its heading in a mount effect, and rendered in the same place with no `key`, opening another result only changed its props. A throwaway render confirmed it: with no `key` focus stayed on the other control, and with a `key` the new heading took it. `ResultView` is now rendered with `key={open.key}`, and a test opens a second result while the first is open.

### Senior Engineer (second pass)

#### RESOLVED: The listed set for R21 was undefined, and `rows` is the wrong one
`listed` was never defined. `rows` holds every package the list returned, `applies: false` ones included (`PackageJSON.index`), while the page shows only `groupPackages`'s groups, so a result for a package listed with `applies: false` would render in neither place. `listed` is now the identities in the groups, and the test covers that row. (requirements.md R21 says the same.)

### Test writer (second pass)

#### RESOLVED: Dropping `order: "post"` does not fail the built `index.html` test
The CSP step said moving the tag with `injectTo: "head"` or dropping `order: "post"` fails the test. A throwaway build with the plugin as specced, then without `order: "post"`, then with `injectTo: "head"`, put the policy first in `<head>`, first again, and after Vite's script and stylesheet tags. `order: "post"` changes nothing that can be observed, so no test can guard it; the plugin drops it (a plain `transformIndexHtml` function), the test's claim names only `injectTo`, and requirements.md's Technical Notes say the same.

### Third review pass (2026-10-14)

Roles and method as requirements.md's third pass, whose findings this plan now carries: the run handler reads `at` from the latest results when the refusal arrives, the request line sits in the row's live region, a waiting row and R14 drop R8's sentence while a request is pending, `sessionLines` consults the `current_package`'s result, and `Unlisted` notes the rows the list returned from the row itself.
