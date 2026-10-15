# Implementation Plan: RD-6 pass 1, class activity and the automatic re-run

**Jira**: https://concord-consortium.atlassian.net/browse/RD-6
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

Written against RD-3 pass 2 as built (`d274bec`, PR #4): every name below (`watchClass`, `ClassListeners`, `runs.ts`'s `rowState`, `runOffer`, `RunRequest`, `latestFinished` and `millis`, `ClassDashboard`'s `run`, `requests`, `grouped` and `listShown`, `PackageList`'s `Row` and `FinishedBlock`, `ResultView`) is in that code. Every step is `app/` only: the runner writes no `inputs` (Doug, 2026-10-11).

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

// watchClass, after the results listener
watchCollection<Activity>(db, activityPath(config.origin, scope.class_hash), on.activity, () => on.refused("activity"))
```

`DashboardServices.watchClass`'s comment says "the four documents" and "stops all four"; both become five.

`ClassDashboard`: `activity: Map<string, Activity> | undefined` (undefined until the first snapshot) and `activityProblem: string | null`. Its `refused` handler today sends every listener other than the profile and counts to "Your runs could not be read.", so the activity branch goes before that fall-through: `if (which === "activity") { setActivity(undefined); return setActivityProblem("Class activity could not be read."); }`. With `activity` undefined the next steps have no data, so nothing is counted or re-run.

**Tests**:
- `firebase.test.ts`: `activityPath` for the staging portal and a class hash.
- `services.test.ts`: `watchCollection` is also called with the activity path; still one `jwt/firebase` call and one `signIn`; the returned function calls five stops (counting the stops fails if the fifth is not pushed).
- `class-dashboard.test.tsx`: the fake's `watchClass` already captures the listeners as `on`, so tests push with `on.activity(...)` and refuse with `on.refused("activity")`; a refusal shows the line, "Your runs could not be read." does not appear (fails if the branch falls through), and the other four listeners' output still renders.
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
    const leaves = Math.max(at, now) + windowMs - now;
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
// replace it. `behind` is behindRows' answer while automatic re-runs are on, else empty.
export function outOfDate(key: string, result: Result | undefined, newest: number | null,
  behind: Map<string, unknown>): boolean {
  if (!result || result.status === "queued" || result.status === "running" || behind.has(key)) return false;
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
- `nextChangeIn`: the earliest counted learner's exit; a future time measured from now; null when none is counted.
- `newestActivity`: the maximum, not the last in the map (a fixture whose last entry is not the newest), and null for an empty map.
- `isBehind`: true for `done` with activity after `started_at`; false for activity equal to it, for `started_at` absent, for each other status, for no activity.
- `behindRows`: the one behind row; each exclusion alone (a pending request, a refusal whose `at` equals the result's `updated_at`, `runnable: false`, a stuck row given a `mark` and a runner on another VM, a row not in `listed`); and a refusal whose `at` is an older `updated_at` does not exclude the row (fails if `held` is reduced to `requests.has`); `at` is the result's `updated_at`.
- `outOfDate`: true for a `failed` result whose `previous.started_at` is older than the newest save; false for a `queued` or `running` result, for a key in `behind`, for no activity after `started_at`, and for no finished run at all.

**Tests** (`rerun.test.tsx`, a probe component, no timers): one request for a behind item on the first render; none for a re-render with a new map holding the same `at` (fails without the `asked` check); one more when the item comes back with a new `at`; none while `stopped`. These were run in a throwaway copy of the app (Open Questions).

---

### The Class activity section

**Summary**: The count on the page, kept current by a timer, with its note and refusal line. Covers R4 to R6, R12's first line, R13's info-page and README lines.

**Files affected**:
- `app/src/components/ClassActivity.tsx` (new)
- `app/src/pages/ClassDashboard.tsx`: the section directly after the class header, before Assignments
- `app/src/pages/Info.tsx`: "What it can show" gains the class's recent activity
- `app/README.md`: the activity collection in "What it reads"; what the count counts; when a package re-runs on its own
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
        {stopped
          ? <p className="error">Automatic re-runs have stopped because your sign-in has expired. Run any package to sign in again.</p>
          : <p>Your finished packages re-run on their own as soon as students save new work.</p>}
      </>}
    </section>
  );
}
```

The effect depends on `wait` and `at`, both recomputed each render, so each tick re-arms it for the next learner's exit; nothing in it reads state it does not list. The section is not a live region (R6).

**Tests** (`class-activity.test.tsx`, fake timers, `now` from `Date.now`):
- the text with two learners, "1 student" with one, and the heading; the label equals `windowLabel(ACTIVE_WINDOW_MINUTES)`.
- 2, then 1, then 0 as each learner's five minutes pass, with no new `activity` prop (fails without the timer).
- the refusal line with no count; nothing but the heading before the first snapshot; the stopped line in place of the re-run line.
- `app.test.tsx`: the info page's list names the class's recent activity.

---

### The automatic re-run on the page

**Summary**: Wire `behindRows` and `useAutoRerun` into `ClassDashboard`, send the Run request for each behind row at once, stop on an expired session, and show the out-of-date line and the opened result's line. Covers R7 to R12 and R14's page cases.

**Files affected**:
- `app/src/pages/ClassDashboard.tsx`: `stopped` state, the `behind` memo, the hook, `run`'s `auto` flag
- `app/src/components/PackageList.tsx`: R12's out-of-date line
- `app/src/components/ResultView.tsx`: "Read the class's data from" for the run it shows
- `app/tests/class-dashboard.test.tsx`, `app/tests/package-list.test.tsx`, `app/tests/result-view.test.tsx`

**Estimated diff size**: ~170 lines, about half tests

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
    const at = latestResults.current.get(key)?.updated_at?.toMillis() ?? null;
    refused(error, (message) => setRequests((r) => new Map(r).set(key, { message, at })), "portal");
  }
}
```

The automatic branch comes before `refused`, which would otherwise show the young-token info page or call `onExpired`, and it applies to a young token too (R10). `Api.request` throws `SessionExpired` before sending when the token is within its margin, and after a 401; either way nothing ran. `stopped` is never cleared within the page's life; Run re-authorizes, which reloads the page. The hook's effect re-runs on every render, since `behind` follows each snapshot and the request callback is a new function each time; the `asked` map is what makes that harmless, so neither needs memoizing for it.

`PackageList` receives `newest` and `behind` in `ListProps`, which `Rows` and `GroupSection` pass on to `Row` through their rest props. `Row` adds `<p className="notice">Students have saved work since this result.</p>` after its `FinishedBlock` when `outOfDate(key, result, newest, behind)` holds (R12). It is not a `FinishedBlock` child, since those render inside its "Finished" line, and not in the row's live region, so a save does not announce on every row. Rows under "Packages no longer listed" (`Unlisted`) are never re-run and get no line: they have no Run to press. `ResultView` appends " · Read the class's data from <formatTime(started_at)>" to its `.when` line ("Version … · Finished …"), from the `Finished` it is given (`ClassDashboard` passes `latestFinished(received.get(open.key))`), and appends nothing when that run has no `started_at`.

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
- The activity listener refused: a behind result never calls `runPackage`.
- `result-view.test.tsx`: "Read the class's data from" with the formatted `started_at` of a `done` result, and of `previous` under a `running` one; no such line for a `previous` without `started_at`.

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

**Decision**: A, one source of truth: a future change to when Run is offered (RD-3 pass 2 R7) changes the automatic path with it. `isBehind`'s own `status === "done"` is what makes queued, running and failed rows not behind; `runOffer` adds `runnable` and the stuck case.

### RESOLVED: Low confidence: the hook requests once per result under re-renders
**Context**: The page re-renders on every snapshot, and `behind` and `auto` are new values each time, so `useAutoRerun`'s effect runs on every render.
**Options considered**:
- A) Run the hook as written before writing the step.
- B) Trust the reasoning.

**Decision**: A, run 2026-10-11 in a throwaway copy of the app at `d5fc47a` (Node 22, its own `npm ci`, deleted); results below in the Self-Review's coalescing entry. An earlier timer-based version of this hook (the 30-second delay and 5-minute floor, retired by #202) was also checked that way, at `4b2eb2f`.

## Self-Review

Stage 7, unattended. Roles: commit reviewer, test writer, Senior Engineer (against RD-3 pass 2's plan at `4b2eb2f`), the researcher using the page. Each finding was checked against RD-3 pass 2's plan or the scratch build before it was written; findings that did not survive were dropped.

### Senior Engineer

#### RESOLVED: A refused automatic request would stop that package re-running for the page's life
RD-3 pass 2 keeps a refusal in `requests` as `{message, at}` and shows it only while the result's `updated_at` equals `at` (its "The Run control and each row's state", `PackageList`'s row); nothing deletes the entry when the result changes. `behindRows` tested `requests.has(key)`, so after one 409 the package was excluded even once its result had moved on, contradicting R9's "until its result changes". Fixed: `held` applies RD-3 pass 2's own showing rule, and `behindRows` and the page test cover a stale refusal.

### Commit reviewer

#### RESOLVED: The stopped path called a helper that does not exist
`run`'s automatic branch called `clear(key)`, which neither this plan nor RD-3 pass 2's defines. Replaced with the delete RD-3 pass 2's 202 branch already does.

### Test writer

#### RESOLVED: The count's tests' clock would not move with fake timers
`ClassActivity` reads `services.now`; RD-3 pass 2's fake services may fix `now` to a constant (pass 1's tests pass a fixed value for the profile age), and then the count would never fall under `vi.advanceTimersByTime`. Its tests pass `Date.now` read at call time.


### Coalescing review (2026-10-11, after #202)

Roles: Senior Engineer (against REPORT-143 at `d0f913b`, RD-4 pass 2 and RD-3 pass 2 at `d5fc47a`), the researcher using the page, the test writer.

#### RESOLVED: Coalescing needs no timer and no runner change
REPORT-143 R5 and R8 skip a package while its result is `queued` or `running`, so a request during a re-run appends nothing, and the runner never queues a package twice; the page compares only `done` results, so a save during a run is caught when it finishes, against that run's `started_at`. What remains is not repeating a request in the gap before the queued snapshot, which `useAutoRerun`'s per-result memory covers. Run in a throwaway copy at `d5fc47a` (Node 22, deleted): a probe under `StrictMode` requested once for a result, not again across re-renders with new maps, the item leaving and returning with the same `updated_at`, and once more for a newer `updated_at`; nothing while stopped. With the `asked` check removed, the test failed.

#### RESOLVED: The previous result must survive every write between two finished runs
The function's queued write replaced the result whole and the runner's claim cleared `summary` and `display`. With REPORT-143 writing `previous` at queue time, the claim, stage, finish and failure writes (`ClassDocuments` in RD-4 pass 2's `status.js`, all named-field merges) leave it alone, so RD-4 pass 2 needs no change. The watchdog's failure write has to keep it too, which REPORT-143 confirms (requirements, Background).
