# Implementation Plan: RD-6 pass 1, class activity and the automatic re-run

**Jira**: https://concord-consortium.atlassian.net/browse/RD-6
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

Written against RD-3 pass 2 as merged to `main` (`fc658fa`, PR #4): every name below (`watchClass`, `ClassListeners`, `runs.ts`'s `rowState`, `runOffer`, `RunRequest`, `latestFinished` and `millis`, `ClassDashboard`'s `run`, `requests`, `grouped` and `listShown`, `PackageList`'s `Row` and `FinishedBlock`, `ResultView`) is in that code. Every step is `app/` only: the runner writes no `inputs` (Doug, 2026-10-11).

## Implementation Plan

### The activity listener

**Summary**: `watchClass` opens a fifth listener on the class's activity collection on the same sign-in, and the page holds what it delivers. Covers R1 to R3.

**Files affected**:
- `app/src/shell/firebase.ts`: `activityPath`
- `app/src/shell/activity.ts` (new): the `Activity` type only, in this step
- `app/src/shell/services.ts`: `ClassListeners.activity`, `"activity"` in `refused`'s union, the fifth listener
- `app/src/pages/ClassDashboard.tsx`: `activity` and `activityProblem` state, and an `"activity"` branch in `watchClass`'s `refused`
- `app/tests/firebase.test.ts`, `app/tests/services.test.ts`, `app/tests/class-dashboard.test.tsx`

**Estimated diff size**: ~90 lines

```ts
// firebase.ts
// REPORT-153's per-learner activity documents for the class, one per learner who has saved work.
export function activityPath(portalOrigin: string, classHash: string): string {
  return `researcher_dashboard/${portalSegment(portalOrigin)}/activity/${classHash}/users`;
}
```

```ts
// activity.ts
import type { Stamp } from "./runs";

// REPORT-153's document; `writeCount` and `changed` are not read here.
export interface Activity { lastActivityAt?: Stamp }
```

`started_at` needs no change to `runs.ts`: RD-3 pass 2's `Result` extends its `Finished`, which already carries `started_at?: Stamp | null`.

```ts
// services.ts
export interface ClassListeners {
  // ...RD-3 pass 2's four
  activity: (docs: Map<string, Activity>) => void;
  refused: (which: "profile" | "runner" | "counts" | "results" | "activity") => void;
}

// watchClass, inside its try, after the results listener
stops.push(watchCollection<Activity>(db, activityPath(config.origin, scope.class_hash), on.activity, () => on.refused("activity")));
```

It goes inside `watchClass`'s `try`, so an activity listener that cannot start stops the four already started before the promise rejects, as for the others. `DashboardServices.watchClass`'s comment says "the four documents" and "stops all four"; both become five.

`ClassDashboard`: `activity: Map<string, Activity> | undefined` (undefined until the first snapshot) and `activityProblem: string | null`. When `watchClass` itself rejects (the token call, the sign-in, or a listener that cannot start), its `catch` already shows `UNREACHABLE.firebase` through `refused(error, setProfileProblem, "firebase")`; its `show` callback also sets `activityProblem` to "Class activity could not be read.", so the Class activity section says so rather than staying blank. `UNREACHABLE.firebase` itself is unchanged. Its `refused` handler today sends every listener other than the profile and counts to "Your runs could not be read.", so the activity branch goes before that fall-through: `if (which === "activity") { setActivity(undefined); return setActivityProblem("Class activity could not be read."); }`. With `activity` undefined the next steps have no data, so nothing is counted or re-run.

**Tests**:
- `firebase.test.ts`: `activityPath` for the staging portal and a class hash.
- `services.test.ts`: `watchCollection` is also called with the activity path; still one `jwt/firebase` call (with `researcher=true`) and one `signIn`; the returned function calls five stops (counting the stops fails if the fifth is not pushed); and the activity listener failing to start stops the four started before it and rejects (fails if it is pushed outside the `try`).
- `class-dashboard.test.tsx`: the fake's `watchClass` already captures the listeners as `on`, so tests push with `on.activity(...)` and refuse with `on.refused("activity")`; a refusal shows the line, "Your runs could not be read." does not appear (fails if the branch falls through), and the other four listeners' output still renders. A `watchClass` that rejects shows the activity line beside `UNREACHABLE.firebase`.
- `no-writes.test.ts` is unchanged and passes.

---

### The count, the behind rule and the request hook, as pure code

**Summary**: Everything R4 to R8 and R12's out-of-date rule decide, with no page: the constant, the label, the count, when the count next changes, which rows are behind, which are out of date, and the hook that requests each finished result once. Covers R4, R5, R7, R8, R11's rule and R12's second line.

**Files affected**:
- `app/src/shell/activity.ts`: the functions below
- `app/src/shell/rerun.ts` (new): `useAutoRerun`
- `app/tests/activity.test.ts` (new), `app/tests/rerun.test.tsx` (new)

**Estimated diff size**: ~230 lines, about two thirds tests

```ts
// activity.ts
import type { PackageRow } from "./portal";
import { packageKey } from "./packages";
import {
  latestFinished, millis, rowState, runOffer,
  type Result, type RunRequest, type Runner, type SessionMark, type Stamp
} from "./runs";

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

// The listed rows the page would re-run now, by package key (R7), with the result's updated_at,
// which is what the hook requests once per.
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

// A request in flight, or a refusal or Resume the row still shows: `Row` shows each only while the
// result's updated_at is still the one it was made against.
function held(request: RunRequest | undefined, result: Result | undefined): boolean {
  if (!request) return false;
  if ("pending" in request) return true;
  return request.at === millis(result?.updated_at);
}

// R12: the latest finished result is older than some learner's save, and nothing is about to
// replace it. `behind` is behindRows' answer while automatic re-runs are on, else empty; `pending`
// is whether a request from the row is in flight.
export function outOfDate(key: string, result: Result | undefined, newest: number | null,
  behind: Map<string, unknown>, pending: boolean): boolean {
  if (!result || pending || result.status === "queued" || result.status === "running" || behind.has(key)) return false;
  const started = millis(latestFinished(result)?.started_at);
  return started !== null && newest !== null && newest > started;
}
```

`listed` is the rows in `groupPackages`' groups, which `ClassDashboard` already builds as `grouped` for R21, not `rows`. `latestFinished`, `millis` and `RunRequest` are RD-3 pass 2's, in `runs.ts`; this pass uses them and defines none of them. `millis` returns null for an absent stamp, so a document without `lastActivityAt` is not counted (R5).

```ts
// rerun.ts
import { useEffect, useRef } from "react";

// Requests each behind item once per result (R8): `at` is the result's updated_at, so the snapshots
// that arrive before the queued result cannot repeat the request, and the next finished result,
// with its own updated_at, can be requested again.
export function useAutoRerun<T>(behind: Map<string, { row: T; at: number | null }>, stopped: boolean,
  request: (key: string, row: T) => void): void {
  const asked = useRef(new Map<string, number | null>());
  useEffect(() => {
    if (stopped) return;
    for (const [key, { row, at }] of behind) {
      if (asked.current.has(key) && asked.current.get(key) === at) continue;
      asked.current.set(key, at);
      request(key, row);
    }
  }, [behind, stopped, request]);
}
```

**Tests** (`activity.test.ts`, with a `stamp(ms)` helper):
- `windowLabel(10)` is "in the last 10 minutes".
- `activeCount`: two inside, one outside, one in the future, one without `lastActivityAt` gives 3; one exactly at the window's edge counts.
- `nextChangeIn`: a learner who saved 4 minutes ago leaves in 1 minute (fails if every counted learner is given a full window); the earliest of two counted learners; a future time leaves a window after that time; null when none is counted.
- `newestActivity`: the maximum, not the last in the map (a fixture whose last entry is not the newest), and null for an empty map.
- `isBehind`: true for `done` with activity after `started_at`; false for activity equal to it, for `started_at` absent, for each other status, for no activity.
- `behindRows`: the one behind row; each exclusion alone (a pending request, a refusal whose `at` equals the result's `updated_at`, `runnable: false`, a row not in `listed`); and a refusal whose `at` is an older `updated_at` does not exclude the row (fails if `held` is reduced to `requests.has`); `at` is the result's `updated_at`.
- `outOfDate`: true for a `failed` result whose `previous.started_at` is older than the newest save; false for a `queued` or `running` result, for a key in `behind`, for a `done` result while `pending`, for no activity after `started_at`, and for no finished run at all.

**Tests** (`rerun.test.tsx`, a probe component, no timers): one request for a behind item on the first render; none for a re-render with a new map holding the same `at` (fails without the `asked` check); one more when the item comes back with a new `at`; none while `stopped`. These were run in a throwaway copy of the app (Open Questions).

---

### The Class activity section

**Summary**: The count on the page, kept current by a timer, with its note and refusal line. Covers R4 to R6, R12's first line, R13's info-page and README lines.

**Files affected**:
- `app/src/components/ClassActivity.tsx` (new)
- `app/src/pages/ClassDashboard.tsx`: the section directly after the class header, before Assignments; the header's ownership line (R13)
- `app/src/pages/Info.tsx`: "What it can show" gains the class's recent activity
- `app/README.md`: the activity collection in "What it reads"; the portal row's run request also sent on its own for a behind package; what the count counts; when a package re-runs on its own
- `app/src/styles.css`
- `app/tests/class-activity.test.tsx` (new), `app/tests/app.test.tsx`

**Estimated diff size**: ~140 lines

```tsx
// ClassActivity.tsx
export function ClassActivity({ activity, problem, stopped, now }: {
  activity: Map<string, Activity> | undefined; problem: string | null; stopped: boolean; now: () => number;
}) {
  const [, tick] = useState(0);
  const at = now();
  const wait = activity ? nextChangeIn(activity, at) : null;
  // Re-render when the earliest counted learner leaves the window, so the count falls on its own.
  useEffect(() => {
    if (wait === null) return;
    const timer = setTimeout(() => tick((n) => n + 1), wait + 1);
    return () => clearTimeout(timer);
  }, [wait, at]);
  const n = activity ? activeCount(activity, at) : null;
  return (
    <section aria-labelledby="activity-heading">
      <h2 id="activity-heading">Class activity</h2>
      {problem && <p className="error">{problem}</p>}
      {n !== null && <>
        <p className="active-count">{n} {n === 1 ? "student" : "students"} active {windowLabel(ACTIVE_WINDOW_MINUTES)}</p>
        <p className="note">Counts students who saved an answer in this class's Activity Player assignments in that time. A student reading or thinking saves nothing, so this is not a count of who is logged in. It is the same for every researcher of this class.</p>
        {!stopped && <p>Your finished packages re-run on their own as soon as students save new work.</p>}
      </>}
      <p role="status" className="error">
        {stopped && "Automatic re-runs have stopped because your sign-in has expired. Run any package to sign in again."}
      </p>
    </section>
  );
}
```

The effect depends on `wait` and `at`, both recomputed each render, so each tick re-arms it for the next learner's exit; nothing in it reads state it does not list. The section is not a live region (R6). The stopped line is a status message (R10): its `role="status"` element is always rendered and gains its text when `stopped` is set, which screen readers announce more reliably than an element inserted with its text already in it; `stopped` never clears, so it announces once.

**Tests** (`class-activity.test.tsx`, fake timers, `now` from `Date.now`):
- the text with two learners, "1 student" with one, and the heading; the label equals `windowLabel(ACTIVE_WINDOW_MINUTES)`.
- 2, then 1, then 0 as each learner's five minutes pass, with no new `activity` prop (fails without the timer).
- the refusal line with no count; nothing but the heading before the first snapshot (the status element is empty); with `stopped`, the stopped line inside `getByRole("status")` and no re-run line.
- `app.test.tsx`: the info page's list names the class's recent activity.
- `class-dashboard.test.tsx`: the existing header test asserts R13's new ownership line.

---

### The automatic re-run on the page

**Summary**: Wire `behindRows` and `useAutoRerun` into `ClassDashboard`, send the Run request for each behind row at once, stop on an expired session, and show the out-of-date line and the opened result's line, and keep a re-run's intermediate lines out of the live regions. Covers R7 to R12 and R14's page cases.

**Files affected**:
- `app/src/pages/ClassDashboard.tsx`: `stopped` state, the `behind` memo, the hook, `run`'s `auto` flag
- `app/src/components/PackageList.tsx`: R12's out-of-date line; `StateRegion`'s `quiet`
- `app/src/components/Unlisted.tsx`: passes `quiet`
- `app/src/components/ResultView.tsx`: "Includes every save before" for the run it shows
- `app/src/components/ResultMarkdown.tsx`: `React.memo`
- `app/tests/class-dashboard.test.tsx`, `app/tests/package-list.test.tsx`, `app/tests/result-view.test.tsx`

**Estimated diff size**: ~210 lines, about half tests

```ts
// ClassDashboard
const [stopped, setStopped] = useState(false);
const newest = activity ? newestActivity(activity) : null;
const behind = useMemo(
  () => listShown && scope && !stopped
    ? behindRows({ listed: grouped, results, runner, mark, classHash: scope.class_hash, newest, requests })
    : new Map<string, { row: PackageRow; at: number | null }>(),
  [listShown, stopped, grouped, results, runner, mark, scope, newest, requests]
);
useAutoRerun(behind, stopped, (_key, row) => { void run(row, false, true); });
```

The memo sits with `grouped` and `listedTitles`, after `run` and before the early returns, and guards on `scope` as `grouped` does. `grouped` is empty while the list is loading, and `listShown` is false while the list or the profile failed, so nothing is re-run before the page knows what is listed. `results` is RD-3 pass 2's masked map, empty while a runs listener is refused, so a refused runner or results listener re-runs nothing. `run` keeps its `(row, resume)` signature for `PackageList` and gains a third parameter; an automatic run is never a Resume, since a behind result is `done`:

```ts
async function run(row: PackageRow, resume: boolean, auto = false) {
  // ...RD-3 pass 2's body, with its catch becoming:
  } catch (error) {
    // An automatic request never re-authorizes: that navigates away under a researcher who pressed nothing.
    if (auto && error instanceof SessionExpired) {
      forget(key);
      setStopped(true);
      return;
    }
    const at = millis(latestResults.current.get(key)?.updated_at);
    refused(error, (message) => setRequests((r) => new Map(r).set(key, { message, at })), "portal");
  }
}
```

The automatic branch comes before `refused`, which would otherwise show the young-token info page or call `onExpired`, and it applies to a young token too (R10). `Api.request` throws `SessionExpired` before sending when the token is within its margin, and after a 401; either way nothing ran. `stopped` is never cleared within the page's life; Run re-authorizes, which reloads the page. The hook's effect re-runs on every render, since `behind` follows each snapshot and the request callback is a new function each time; the `asked` map is what makes that harmless, so neither needs memoizing for it.

`PackageList` receives `newest` and `behind` in `ListProps`, which `Rows` and `GroupSection` pass on to `Row` through their rest props. `Row` adds `<p className="notice">Students have saved work since this result.</p>` after its `FinishedBlock` when `outOfDate(key, result, newest, behind, pending)` holds (R12), with the `pending` `Row` already computes. It is not a `FinishedBlock` child, since those render inside its "Finished" line, and not in the row's live region, so a save does not announce on every row. Rows under "Packages no longer listed" (`Unlisted`) are never re-run and get no line: they have no Run to press. `ResultView` adds `<p className="when">Includes every save before {formatTime(started_at)}, when this run began reading the class's data.</p>` after its "Version … · Finished …" line, its own line since the sentence is long, from the `Finished` it is given (`ClassDashboard` passes `latestFinished(received.get(open.key))`), and adds nothing when that run has no `started_at`.

A re-run announces only its outcome (R12). `StateRegion` gains `quiet`; while it is set the line renders outside the polite region, and the region keeps only what is an outcome. A polite region announces additions, not removals, so going quiet says nothing, and the outcome line entering the region when the re-run finishes is announced:

```tsx
// PackageList.tsx
// A re-run of a row that has a finished result announces only its outcome (R12).
export const quietUpdate = (state: RowState, hasFinished: boolean, inFlight: boolean) =>
  hasFinished && (inFlight || state.kind === "queued" || state.kind === "running");

export function StateRegion({ state, line, quiet = false, children }: {
  state: RowState; line: string; quiet?: boolean; children?: ReactNode;
}) {
  return (
    <div className="state">
      {quiet && <p>{line}</p>}
      <div aria-live="polite">
        {!quiet && <p>{line}</p>}
        {state.kind === "failed" && state.finishedAt !== null && <p className="when">{formatTime(state.finishedAt)}</p>}
        {children}
      </div>
    </div>
  );
}
```

`Row` passes `quiet={quietUpdate(state, finished !== null, pending || resuming)}` and renders "Requesting…" before the `StateRegion` when quiet, inside it otherwise; a refusal stays inside, since it is an outcome. `Unlisted` passes `quietUpdate(state, finished !== null, false)`. A stuck row is not quiet: "Paused partway through" asks for a press. Above the list, `ClassDashboard` renders `sessionLines`' "Running <title>." and "Your machine is starting its next package." outside the `.status` region when `latestFinished(results.get(runner.current_package.package_key))` is set, by splitting the lines on that test; the machine's own lines (starting, ready, paused, stopped, failed) stay inside. `ResultView`'s "Updated <time>" status is the open result's outcome and is unchanged.

Every learner's save is now a snapshot that re-renders the page, and with it an open `ResultView`, whose `ResultMarkdown` parses the whole result through react-markdown, remark-gfm and rehype-sanitize on each render. `ResultMarkdown` is exported as `memo(function ResultMarkdown(...))`: its props are a string and a boolean, unchanged by an activity snapshot, so a save no longer re-parses the open result.

**Tests** (`class-dashboard.test.tsx`, the fake services' `runPackage` a spy):
- A done Mine row with `started_at` at 1,000 and an activity snapshot with a learner at 2,000: `runPackage` is called once, at once, with the row's identity and current version.
- A second activity snapshot (a learner at 3,000) before the queued result arrives: still one call.
- The results snapshot then turning the row `queued`, `running` and `done` with `started_at` at 40,000, and no save after it: no second call (R11).
- The same sequence with a save at 45,000 arriving while it runs: exactly one more call when the `done` with `started_at` 40,000 arrives (the coalesced run).
- The same row with the activity at exactly `started_at`: no call.
- An activity snapshot arriving on load with the result already behind: one call (the returning researcher).
- A `failed` result over a `previous` older than the newest save: no call, and the out-of-date line.
- `runPackage` rejecting with `SessionExpired` on the automatic call: `onExpired` not called, the stopped line shows, the out-of-date line shows on that row, and a later learner write calls nothing.
- A manual Run on the behind row before the automatic call resolves: one request in flight, not two (the pending entry holds the row).
- A 409 on the automatic call: the message on the row and no further call while the result is unchanged; then a results snapshot with a new `updated_at`, still `done` and still behind, gets one call.
- An activity snapshot, then `on.refused("activity")`: the count goes and the refusal line shows (fails if the branch's `setActivity(undefined)` is deleted). A refusal before any snapshot shows the line and calls nothing.
- A done, behind row whose automatic `runPackage` has not resolved: "Requesting…" shows and the out-of-date line does not.
- `package-list.test.tsx`: `quietUpdate` for each state with and without a finished result and in flight; a row whose `running` result has a `previous` renders its running line outside `[aria-live]` and, once `done`, its summary inside (fails if `quiet` is ignored); a first run's running line inside; "Requesting…" outside on a finished row, inside on a new one. The existing "puts each row's state in a polite live region" test reads `.state [aria-live]` instead of `.state`.
- `class-dashboard.test.tsx`: with the running package's result over a `previous`, "Running <title>." is outside `[aria-live]`; for a first run it is inside, as the existing test has it.
- `result-markdown.test.tsx`: with react-markdown mocked to count its renders, re-rendering a parent with the same `markdown` renders it once (fails without the `memo`).
- `result-view.test.tsx`: "Includes every save before" with the formatted `started_at` of a `done` result, and of `previous` under a `running` one; no such line for a `previous` without `started_at`.

## Open Questions

### RESOLVED: Judgment call: one automatic request per finished result, remembered by its `updated_at`
**Options considered**:
- A) `useAutoRerun` remembers, per package, the `updated_at` of the result it requested for, and requests again only for a newer one.
- B) Rely on `requests`' pending entry and the function's dedupe.

**Decision**: A. Between the 202 (which clears the pending entry) and the queued snapshot, the row is still `done` and behind, so B would send a second request on any snapshot in that gap; the function would append nothing (REPORT-143 R8), but the page should not depend on that. A needs no timer, since there is no delay to wait for (requirements R8).

### RESOLVED: Judgment call: `behindRows` reuses `runOffer` rather than restating R7's exclusions
**Options considered**:
- A) Call `runOffer(row.runnable, rowState(...))`, so whatever disables Run also stops an automatic run.
- B) List the excluded statuses again in `behindRows`.

**Decision**: A, one source of truth: a future change to when Run is offered (RD-3 pass 2 R7) changes the automatic path with it. `isBehind`'s own `status === "done"` is what makes queued, running, stuck and failed rows not behind; for a done row `runOffer` adds only `runnable` today, and is kept so a later change to when Run is offered carries over.

### RESOLVED: Low confidence: the hook requests once per result under re-renders
**Context**: The page re-renders on every snapshot, and `behind` and `auto` are new values each time, so `useAutoRerun`'s effect runs on every render.
**Options considered**:
- A) Run the hook as written before writing the step.
- B) Trust the reasoning.

**Decision**: A, run 2026-10-11 in a throwaway copy of the app at `d5fc47a` (Node 22, its own `npm ci`, deleted); under `StrictMode` the probe requested once for a result, not again across re-renders with new maps or the item leaving and returning with the same `updated_at`, once more for a newer `updated_at`, and nothing while stopped; with the `asked` check removed the test failed.

## Self-Review, 2026-10-16

Roles: Senior Engineer, QA Engineer, Performance Engineer, WCAG Accessibility Expert. Each finding was checked against `main` at `fc658fa` and, where it could be run, against this plan's code applied verbatim to a throwaway copy of `app/` (Node 22, its own `npm ci`, deleted afterward). With the plan's code applied, `tsc --noEmit` is clean outside the two existing test files the plan already lists (`package-list.test.tsx` and `services.test.ts` need the new props and the fifth listener), and `no-writes.test.ts` passes (2 of 2). Findings that did not survive were dropped. Requirements-only findings are in requirements.md's Self-Review, 2026-10-16.

### Senior Engineer

#### RESOLVED: `nextChangeIn` arms the timer for a full window from now, not for the earliest learner's exit
Verified (returned 300000 for a save 4 minutes old, expected 60000). Fixed: `at + windowMs - now`, and the 4-minute case is in the tests.

#### RESOLVED: The out-of-date line shows on a row while its automatic request is in flight
Verified (`behindRows` drops a pending row, then `outOfDate` is true). Fixed: `outOfDate` takes `pending` and returns false for it; unit and page tests added.

### QA Engineer

#### RESOLVED: The stuck-row exclusion in `behindRows`' tests cannot fail, and `runOffer` adds only `runnable` there
Verified (the stuck case passes with `runOffer` replaced by `row.runnable`). Fixed: the stuck case is dropped from `behindRows`' tests and the Open Question's sentence corrected.

### Performance Engineer

#### RESOLVED: Every activity snapshot re-renders and re-parses an open result's markdown
Verified: with `memo` the parse runs once across a parent re-render, without it twice. Fixed: `ResultMarkdown` is memoized, with a test.

### WCAG Accessibility Expert

#### RESOLVED: Each automatic re-run announces every step in the row's polite live region
Doug, 2026-10-16: a re-run announces only its outcome, decided by the row's state (R12); the session lines naming the running package follow the same rule.

#### RESOLVED: The stopped line appears silently
Fixed: the stopped line is in an always-rendered `role="status"` element (R10), with its test.