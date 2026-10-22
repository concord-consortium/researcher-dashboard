# Implementation Plan: RD-6 pass 2: CLUE activity

**Jira**: https://concord-consortium.atlassian.net/browse/RD-6
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

The plan follows Doug's answers to the requirements' three questions (2026-10-22): no membership filter, partial reads named per source, and CLUE production's client config added now with its pairing stated.

## Implementation Plan

### Name each portal's CLUE project

**Summary**: `PortalConfig` gains the portal's CLUE project and the `firebase_apps` row that signs for it (R1, R2); the staging entry names CLUE staging and `firebase.ts` gains its client config. Nothing reads the new field yet; the one behavior change is that a dev server without `VITE_DEV_CLUE_FIREBASE_PROJECT` names no dev portal.

**Files affected**:
- `app/src/shell/portals.ts`: the `clue` field, the staging entry, `devPortal`
- `app/src/shell/firebase.ts`: CLUE staging's client config
- `app/README.md`: the dev command
- `app/tests/launch.test.ts`, `app/tests/start.test.ts`, `app/tests/services.test.ts`, `app/tests/app.test.tsx`, `app/demo/main.tsx`: the new field in their configs

**Estimated diff size**: ~70 lines

`portals.ts`:

```ts
export interface PortalConfig {
  origin: string;
  reportServer: string;
  // The report-service Firebase project whose dashboard tree this portal's classes live in.
  firebaseProject: string;
  // The CLUE Firebase project this portal's CLUE launches record activity in, and the portal's
  // `firebase_apps` row that signs a token for it. The two differ for CLUE production (row
  // `collaborative-learning`, project `collaborative-learning-ec215`), so both are named, as
  // CLUE's own src/lib/firebase-config.ts pairs them.
  clue: { firebaseApp: string; projectId: string };
}

export const DEPLOYED: PortalConfig[] = [
  {
    origin: "https://learn.portal.staging.concord.org",
    reportServer: "https://report-server.concordqa.org",
    firebaseProject: "report-service-dev",
    clue: { firebaseApp: "collaborative-learning-staging", projectId: "collaborative-learning-staging" }
  }
];
```

`devPortal` reads `VITE_DEV_CLUE_FIREBASE_PROJECT` beside `VITE_DEV_FIREBASE_PROJECT`, returns null when it is missing, and also when it equals `VITE_DEV_FIREBASE_PROJECT`: `signIn` keeps one Firebase app per project id, so one project for both would sign the second token in over the first.

```ts
  const firebaseProject = env.VITE_DEV_FIREBASE_PROJECT, clueProject = env.VITE_DEV_CLUE_FIREBASE_PROJECT;
  if (typeof origin !== "string" || typeof reportServer !== "string" || typeof firebaseProject !== "string"
    || typeof clueProject !== "string" || clueProject === firebaseProject) {
    return null;
  }
  const portal = httpOrigin(origin), server = httpOrigin(reportServer);
  return portal && server
    ? { origin: portal, reportServer: server, firebaseProject, clue: { firebaseApp: clueProject, projectId: clueProject } }
    : null;
```

`firebase.ts`'s `PROJECTS` gains `"collaborative-learning-staging"` and `"collaborative-learning-ec215"` (CLUE production, which no portal entry reaches until production is added), each with the values in CLUE's `src/lib/firebase-config.ts` at `d2b55b80d` (`apiKey` as its `atob(...)` string, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`). The header comment's first sentence becomes: "The Firebase projects this app reads, and the sign-in that gets it in: report-service's, which holds the dashboard tree, and CLUE's, which holds CLUE's activity documents, each with a custom token the portal minted for one class."

`app/README.md`'s dev command adds `VITE_DEV_CLUE_FIREBASE_PROJECT=collaborative-learning-staging \`, and the line after it ("The Firebase project needs an entry in `src/shell/firebase.ts`'s config map unless the emulator below is used.") says that each of the two projects needs an entry there and a `firebase_apps` row of its name in the local portal, and that the two must differ.

**Tests** (`launch.test.ts`):
- the staging entry names CLUE staging's row and project (guards the `DEPLOYED` value);
- a dev env without `VITE_DEV_CLUE_FIREBASE_PROJECT` names no dev portal, and one with it gets `clue: { firebaseApp, projectId }` equal to it;
- a dev env whose CLUE project equals report-service's names no dev portal;
- for each of `report-service-dev`, `collaborative-learning-staging` and `collaborative-learning-ec215`, `firebaseConfig(id).projectId` is `id` and its `authDomain` is `<id>.firebaseapp.com` (guards a copied entry left half-edited, which nothing else would catch for the unreachable production entry).

The two existing `devPortal` tests' env gains `VITE_DEV_CLUE_FIREBASE_PROJECT: "clue-demo"`, without which both fail (`devPortal` returns null). The other test configs and `demo/main.tsx` gain `clue: { firebaseApp: "...", projectId: "..." }` to satisfy the type.

---

### Read CLUE's activity beside report-service's

**Summary**: `watchClass` signs in to the portal's CLUE project with a second researcher token and listens to the class's activity there (R3); the two sources are merged per learner (R4), handed to the page once both have answered (R5), and refused one at a time (R7). The page names a refused source and keeps the other's numbers. Every reader of the activity map is unchanged (R6).

**Files affected**:
- `app/src/shell/activity.ts`: `mergeActivity`, `activitySources`, `ActivitySource`
- `app/src/shell/services.ts`: the CLUE sign-in and sixth listener, the refusal union
- `app/src/pages/ClassDashboard.tsx`: per-source refusals
- `app/tests/activity.test.ts`, `app/tests/services.test.ts`, `app/tests/class-dashboard.test.tsx`

**Estimated diff size**: ~260 lines, about two thirds tests

`activity.ts`:

```ts
// The later of two server times, either of which may be missing.
const later = (a: Stamp | undefined, b: Stamp | undefined): Stamp | undefined =>
  (millis(b) ?? -Infinity) > (millis(a) ?? -Infinity) ? b : a;

// Report-service's and CLUE's documents for one class, as one map. Both are keyed by the portal user
// id, so a learner on both platforms is one entry, with the later save and, per assignment, the later
// change.
export function mergeActivity(a: Map<string, Activity>, b: Map<string, Activity>): Map<string, Activity> {
  const merged = new Map(a);
  for (const [id, doc] of b) {
    const other = merged.get(id);
    if (!other) {
      merged.set(id, doc);
      continue;
    }
    const changed: Record<string, Stamp> = { ...other.changed };
    for (const [key, at] of Object.entries(doc.changed ?? {})) changed[key] = later(changed[key], at) ?? at;
    merged.set(id, { lastActivityAt: later(other.lastActivityAt, doc.lastActivityAt), changed });
  }
  return merged;
}

// Report-service's activity listener, and CLUE's.
export type ActivitySource = "activity" | "clue-activity";

// Each source's latest documents, or null once it is refused. The page gets their merge only once both
// have answered, so the first count never shows one platform's students alone, and nothing once both
// are refused.
export function activitySources(onValue: (docs: Map<string, Activity>) => void) {
  const latest = new Map<ActivitySource, Map<string, Activity> | null>();
  const emit = () => {
    const reportService = latest.get("activity"), clue = latest.get("clue-activity");
    if (reportService === undefined || clue === undefined || (reportService === null && clue === null)) return;
    onValue(mergeActivity(reportService ?? new Map(), clue ?? new Map()));
  };
  return {
    value(source: ActivitySource, docs: Map<string, Activity>) { latest.set(source, docs); emit(); },
    refused(source: ActivitySource) { latest.set(source, null); emit(); }
  };
}
```

The `Activity` comment becomes: "A learner's activity document, written by report-service for Activity Player answers and by the CLUE app for CLUE documents, each in its own Firebase project, at the same path and with the same fields. `changed` maps each assignment's portal offering id to when the learner last changed it. `writeCount` is a change signal only, never a count."

`services.ts`:

```ts
export interface ClassListeners {
  profile: (profile: Profile | null) => void;
  runner: (runner: Runner | null) => void;
  counts: (counts: Counts | null) => void;
  results: (results: Map<string, Result>) => void;
  // Report-service's and CLUE's activity documents merged, once both have answered (activitySources).
  activity: (docs: Map<string, Activity>) => void;
  // Which listener failed, normally refused by the rules, so the page can say what it could not read.
  refused: (which: "profile" | "runner" | "counts" | "results" | ActivitySource) => void;
}

  // A Firebase token and a sign-in for the scope's class in report-service's project, then the five
  // listeners the page reads through, and a second token and sign-in in the portal's CLUE project for
  // its activity. Resolves to a function that stops all six; a report-service listener that cannot start
  // stops the ones already started before the promise rejects. CLUE's side never holds or stops the
  // rest: its failure is a refused "clue-activity".
  watchClass: (scope: Scope, on: ClassListeners) => Promise<() => void>;

    async watchClass(scope, on) {
      const emulators = emulatorsFromEnv(import.meta.env as unknown as Record<string, string | undefined>);
      const sources = activitySources(on.activity);
      const refuse = (source: ActivitySource) => {
        sources.refused(source);
        on.refused(source);
      };
      const path = activityPath(config.origin, scope.class_hash);
      const stops: Array<() => void> = [];
      let stopped = false;
      const stopAll = () => {
        stopped = true;
        stops.forEach((stop) => stop());
      };
      void (async () => {
        const token = await portal.firebaseToken(config.clue.firebaseApp, scope.class_hash);
        const db = await signIn(config.clue.projectId, token, emulators);
        if (stopped) return;
        stops.push(watchCollection<Activity>(db, path, (docs) => sources.value("clue-activity", docs), () => refuse("clue-activity")));
      })().catch((error) => {
        if (stopped) return;
        console.error("CLUE activity could not be read", error);
        refuse("clue-activity");
      });
      try {
        const customToken = await portal.firebaseToken(config.firebaseProject, scope.class_hash);
        const db = await signIn(config.firebaseProject, customToken, emulators);
        const uid = scope.platform_user_id;
        stops.push(watchDoc<Profile>(db, classPath(config.origin, scope.class_hash), on.profile, () => on.refused("profile")));
        stops.push(watchDoc<Runner>(db, runnerPath(config.origin, uid), on.runner, () => on.refused("runner")));
        stops.push(watchDoc<Counts>(db, scopeDocPath(config.origin, scope.class_hash, uid), on.counts, () => on.refused("counts")));
        stops.push(watchCollection<Result>(db, resultsPath(config.origin, scope.class_hash, uid), on.results, () => on.refused("results")));
        stops.push(watchCollection<Activity>(db, path, (docs) => sources.value("activity", docs), () => refuse("activity")));
      } catch (error) {
        stopAll();
        throw error;
      }
      return stopAll;
    },
```

The CLUE chain starts first so the two mints run side by side; a report-service failure sets `stopped` before the CLUE sign-in returns, so no CLUE listener starts behind a rejected `watchClass`.

`ClassDashboard.tsx`: the activity state is renamed `activityDocs` (`setReceived` is already the results setter), refusals are held per source, and `activity` is derived so every existing reader is unchanged:

```ts
const ACTIVITY_REFUSED = "Class activity could not be read.";
const PLATFORM: Record<ActivitySource, string> = { activity: "Activity Player", "clue-activity": "CLUE" };
const sourceRefused = (source: ActivitySource) => `${PLATFORM[source]} activity could not be read.`;

  // undefined until both sources have answered (activitySources); `activity` below is undefined again once both are refused.
  const [activityDocs, setActivityDocs] = useState<Map<string, Activity> | undefined>(undefined);
  const [refusedSources, setRefusedSources] = useState<ActivitySource[]>([]);
  // A failed sign-in, which leaves neither source.
  const [signInProblem, setSignInProblem] = useState<string | null>(null);
  const activity = refusedSources.length === 2 ? undefined : activityDocs;
  const activityProblem = signInProblem
    ?? (refusedSources.length === 2 ? ACTIVITY_REFUSED : refusedSources.length === 1 ? sourceRefused(refusedSources[0]) : null);
```

RD-12's table cells keep "…" while one source is refused and the other has not answered, and say "unknown" only once no activity can arrive, so `pending` reads the refusals rather than the problem line, which one refusal already sets:

```ts
  const pending = signInProblem || refusedSources.length === 2 ? "unknown" : "…";
```

While one source is refused, its platform's assignments show n/a for want of documents, so the footnote under RD-12's table (shown when `unrecorded`) adds a line naming that platform:

```tsx
              {unrecorded && <p className="footnote"><strong>n/a</strong>: {NOT_RECORDED}
                {refusedSources.length === 1 && <> {PLATFORM[refusedSources[0]]} activity could not be read, so its assignments may also show n/a.</>}
              </p>}
```

`activity: setActivityDocs` goes to `watchClass`. In the `watchClass` effect, `setRefusedSources([])` and `setSignInProblem(null)` run before the call, and the refusal handler becomes:

```ts
      refused: (which) => {
        if (which === "profile") return setProfileProblem(PROFILE_REFUSED);
        if (which === "activity" || which === "clue-activity") {
          return setRefusedSources((was) => (was.includes(which) ? was : [...was, which]));
        }
        ...
```

and the sign-in failure's `setActivityProblem(ACTIVITY_REFUSED)` becomes `setSignInProblem(ACTIVITY_REFUSED)`.

**Tests**:
- `activity.test.ts`, `mergeActivity`: a learner in one map only is that document; a learner in both takes the later `lastActivityAt` whichever map holds it (two cases, so "always the second" fails); `changed` keeps keys from both and takes the later time for a shared key; a missing `lastActivityAt` on one side takes the other's; the merged size counts a learner on both platforms once.
- `activity.test.ts`, `activitySources`: nothing is emitted after one source's value alone; after both values, the merge; a later value from either re-emits with the other's latest; one refusal after the other's value emits that value alone; both refused emits nothing more.
- `services.test.ts`, with a config holding CLUE production's pairing (row `collaborative-learning`, project `collaborative-learning-ec215`) so a swap of the two fails: the CLUE mint names the row as `firebase_app`, `researcher=true` and the class hash on the portal origin; `signIn` is called with the CLUE project id and that token; the CLUE listener is a collection on the class's activity path, on the CLUE sign-in's db; stopping stops all six; a refused CLUE listener reaches `on.refused("clue-activity")`; a failed CLUE mint calls `on.refused("clue-activity")` and the five others still start and `watchClass` resolves; a report-service sign-in failure rejects and starts no CLUE listener, and refuses nothing, whether CLUE's sign-in resolves or fails after it. The existing first test's `fetch` and `signIn` counts become two each, and the failing-start cases keep their order with the CLUE mint made to fail.
- `class-dashboard.test.tsx`: "says so before the first snapshot, and after the listener is refused" (the Assignments card) refuses report-service's source and still shows "…", then CLUE's and shows "unknown"; it fails on `pending` read from `activityProblem`. The existing "its listener is refused" test becomes two: one refused source shows its line ("CLUE activity could not be read.") and keeps the count; both refused shows "Class activity could not be read." and removes it, as before. A new `refuseClueActivity` helper beside `refuseActivity`. The footnote test: with an assignment showing n/a and CLUE refused, the footnote ends "CLUE activity could not be read, so its assignments may also show n/a.", and with Activity Player refused instead it names Activity Player (two cases, so a hardcoded platform fails); with nothing refused it has no such line. "requests nothing when the activity listener is refused before any snapshot" refuses both sources, since one refusal now shows "Activity Player activity could not be read."; its no-request assertion is unchanged.

---

### Say that CLUE records activity too

**Summary**: The page and the prose name both writers (R9, R10).

**Files affected**:
- `app/src/components/ClassActivity.tsx`: the explanation
- `app/src/pages/ClassDashboard.tsx`: the n/a comment
- `app/README.md`: "What it reads", the writers paragraph, the active-students section, the staging note (R2)
- `specs/RD-6-pass-1-activity-and-rerun.md`, `specs/RD-12-class-activity-numbers.md`: a CLUE paragraph each
- `app/tests/class-activity.test.tsx`

**Estimated diff size**: ~40 lines

- `ClassActivity.tsx`: "The student count in the header is how many students saved work in this class's Activity Player or CLUE assignments {window}."
- `ClassDashboard.tsx`: the n/a comment becomes "Whether any assignment shows n/a, which brings the footnote; a platform records activity only from the release of its writer on."
- `app/README.md`:
  - "What it reads": the portal row's "a Firebase token for the class" becomes "a Firebase token for the class in each of the portal's report-service and CLUE projects", and the table gains a row: "the portal's CLUE Firebase project | the class's learner activity in CLUE (`activity/<class hash>/users`), the same documents CLUE's app writes for CLUE work, merged with report-service's per learner". The report-service row's activity cell is unchanged.
  - "The app writes none of the Firebase documents. Every one is written by report-service's functions, the runner or the watchdog, and the app only listens." becomes "... Every one is written by report-service's functions, the runner, the watchdog or, for CLUE's activity documents, the CLUE app, and the app only listens."
  - The active-students section: "It counts saved answers" becomes "It counts saved work, in Activity Player or CLUE," and a sentence: "A CLUE student is counted only when launched with CLUE's Firebase project matching the portal's: on staging, an offering launched without `firebaseEnv=staging` records its activity in production CLUE, which the staging dashboard does not read."
  - The Assignments card paragraph: "since activity is recorded only from the day its trigger was deployed: work saved before then is not counted. Only Activity Player saves are recorded until the CLUE listener is added." becomes "since each platform records activity only from the release of its writer (REPORT-153's trigger, CLUE-693's recorder): work saved before then is not counted."
- `specs/RD-6-pass-1-activity-and-rerun.md`, after "What REPORT-153 provides": "**CLUE (RD-6 pass 2).** The CLUE app writes the same documents in CLUE's own Firebase project (CLUE-693), after a change's history upload and content save land, and the page merges them per learner with report-service's (`specs/RD-6-pass-2-clue-activity/`)."
- `specs/RD-12-class-activity-numbers.md`, at the end of "Testing an unreadable `changed` time": "RD-6 pass 2 adds CLUE's app as a second writer, in CLUE's project; its rule also requires every `changed` time to equal `request.time`, so the decision holds."

**Tests**: `class-activity.test.tsx` asserts the explanation names both platforms (it fails on the old "Activity Player assignments" text).

## Open Questions

### RESOLVED: Judgment call: the CLUE sign-in runs beside report-service's, not after it
**Context**: `watchClass` could mint and sign in to CLUE after report-service's listeners start, or alongside.
**Options considered**:
- A) Side by side, CLUE's chain started first and cut off by `stopped`.
- B) After report-service's, sequentially: simpler, but the first count waits for two mints and sign-ins in a row (R5 holds it until CLUE answers).

**Decision**: A. The page's first count waits on the slower of two, not their sum.

### RESOLVED: Judgment call: derive the page's activity rather than clear it on refusal
**Context**: Today `refused("activity")` calls `setActivity(undefined)`. With two sources the page must know whether both are refused.
**Options considered**:
- A) Hold the refused sources and derive `activity` and the problem line from them.
- B) Clear the map inside the refusal handler when the second source is refused, from inside a state updater.

**Decision**: A. No side effect in an updater, and the problem line and the map cannot disagree.

### RESOLVED: Judgment call: the merge keeps Firestore Timestamps
**Context**: The merge could convert to milliseconds or keep the `Stamp` values.
**Options considered**:
- A) Keep `Stamp`s, comparing with `millis`.
- B) Convert to numbers.

**Decision**: A. Every reader of the map takes `Stamp`s through `millis`, so the merged map has the shape the documents have.

## Self-Review

Roles: commit reviewer, test writer, Senior Engineer, operator. The plan's code for the first two steps was applied to this branch as throwaway code (`npm ci`, then `tsc --noEmit` and the full vitest suite, baseline 393 passing), with throwaway tests for the CLUE side of `watchClass`, then reverted.

### Commit reviewer

#### RESOLVED: each step compiles on its own
`tsc --noEmit` was clean after the first step alone and after the second; the third changes only text.

### Test writer

#### RESOLVED: two existing tests the plan did not name
After the first step, `launch.test.ts`'s two `devPortal` tests failed (their env has no CLUE project). After the second, the four failures the plan already rewrites plus "requests nothing when the activity listener is refused before any snapshot", which failed only on its message. Both are now named in the steps.

#### RESOLVED: the CLUE-side tests can be written and can fail
Throwaway tests in the plan's shape passed: the CLUE mint names the CLUE row, `signIn` gets the CLUE project and token, the CLUE listener is on the activity path of the CLUE db, the merge waits for both sources, stop stops six; a failed CLUE mint refuses `clue-activity` while the other five start; a report-service failure starts no CLUE listener even when CLUE's sign-in resolves later. Removing the `stopped` check failed the last. Making the merge always take the second map passed these services tests, which is why the merge's own tests take the later time from each side.

### Senior Engineer

#### RESOLVED: the problem line is on the Info tab only
`ClassActivity`, which shows `activityProblem`, renders only in the Info tab panel (`ClassDashboard.tsx`), so under partial reads B the header count on the Analytics tab would show one platform's number with no note. Doug chose B knowing it (requirements, "Partial reads").

### Operator

No finding. No deploy, stack or rigse change; R12's prerequisites (CLUE-693's staging rules and index, a CLUE build with the recorder) are named in the requirements.

A second pass (Senior Engineer, Technical Writer, commit reviewer) applied the plan's `activity.ts`, `ClassDashboard.tsx` and `services.ts` refusal changes to `0983be1` as throwaway code, with a throwaway Assignments card test holding a CLUE-tool assignment beside Wildfire, then reverted.

### Senior Engineer (second pass)

#### RESOLVED: RD-12's cells said "unknown" while waiting for the other source
`pending` was `activityProblem ? "unknown" : "…"`, and one refusal sets `activityProblem` while R5 still holds the map for the other source, so a CLUE refusal before report-service's first snapshot showed "unknown" in every cell, then numbers. Checked on the throwaway build: `["unknown", "unknown"]` before the report-service snapshot. `pending` now reads the refusals (`["…", "…"]`), and the Assignments card's refusal test covers both steps; it fails with `pending` read from `activityProblem`.

### Technical Writer

#### RESOLVED: README prose the plan did not name
`app/README.md` says "Only Activity Player saves are recorded until the CLUE listener is added" and "activity is recorded only from the day its trigger was deployed" (the Assignments card paragraph), "a Firebase token for the class" (the portal row) and "The Firebase project needs an entry" (after the dev command). Each is now in its step.

### Commit reviewer (second pass)

#### RESOLVED: the first step changes one behavior
Its summary said it changes no behavior, but `devPortal` names no dev portal without the new variable. The summary says so.
