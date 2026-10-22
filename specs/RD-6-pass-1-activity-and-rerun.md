# RD-6 pass 1: class activity and the automatic re-run

**Jira**: https://concord-consortium.atlassian.net/browse/RD-6

**Status**: **Closed**

**Pass**: 1 of 2. Built on `main` at `595e1f7`, after `fc658fa` merged RD-3 pass 2 (PR #4), since this pass changes the page RD-3 pass 2 builds. Pass 2 follows CLUE-693: the app's CLUE activity listener only, with no runner change and no incremental pull (Doug, 2026-10-14). Packages read CLUE only through cc-data (REPORT-152), and every run pulls fresh.

## Overview

Show how many students saved work in the last few minutes, and re-run a researcher's finished packages automatically as soon as students have saved work since the run read the class's data. Both read REPORT-153's per-learner activity documents through the dashboard's existing Firebase sign-in.

## Project Owner Overview

A researcher with the dashboard open during a lesson wants to see that the class is working and to have their results keep up without pressing Run again. The page shows "3 students active in the last 5 minutes", says plainly that it counts students who saved an answer (a student reading or thinking saves nothing, so it is not "logged in"), and, when a student saves new work after a finished package read the class's data, re-runs that package by itself, straight away. Saves made while a re-run is going give exactly one more run after it, never a loop, and the last finished result stays on screen until the new one is ready. A researcher who comes back to a page that was closed for an hour gets the same single catch-up re-run.

This is the dashboard half of "a number that moves on the page" and the loop REPORT-158's Wildfire package is built to make visible. It covers Activity Player classes, where REPORT-153's trigger writes the activity; CLUE classes wait for CLUE-693.

## Requirements

### The activity listener

- **R1. One more listener on `watchClass`'s sign-in.** `watchClass` opens a fifth listener, on the collection `researcher_dashboard/<portal segment>/activity/<scope.class_hash>/users`, with the same portal segment and class hash the profile path uses, and its returned function stops all five. No second token, sign-in or watcher is added. The page reads each document's `lastActivityAt`; `writeCount` and `changed` are not read in this pass.
- **R2. Read-only, as before.** The page still never writes Firestore and asks for no Firebase token beyond RD-3 pass 2's; `app/tests/no-writes.test.ts` passes unchanged. The CSP is unchanged.
- **R3. A refused or failed activity listener** (before REPORT-153's rules are deployed, the path matches no rule), or a `watchClass` that fails as a whole (its token, its sign-in, or a listener that cannot start), shows "Class activity could not be read." in the Class activity section, in a polite live region, shows no count, and starts no automatic re-run. The other four listeners and the rest of the page are unaffected. The activity listener stops with the others when the page becomes an info page.

### The count

- **R4. The window is one constant**, `ACTIVE_WINDOW_MINUTES = 5`, and every label naming the window is built from it.
- **R5. The count** is the number of activity documents whose `lastActivityAt` is no earlier than the page's clock minus the window. A `lastActivityAt` later than the page's clock (a laptop clock running behind the server's) counts as active. A document without a readable `lastActivityAt` is not counted.
- **R6. What the page says.** A section headed "Class activity" (`h2`), directly after the class header, before RD-3 pass 2's Assignments section:
  - before the first snapshot, nothing below the heading but R3's line if it applies;
  - otherwise "<n> students active in the last 5 minutes" ("1 student", "0 students"), and beside it, as a separate line: "Counts students who saved an answer in this class's Activity Player assignments in that time. A student reading or thinking saves nothing, so this is not a count of who is logged in. It is the same for every researcher of this class."
  - The count is recomputed when a snapshot arrives and when the earliest counted learner leaves the window, so it falls to zero on its own when the class goes quiet, without a reload.
  - The count is not in a live region, so a busy class does not produce a stream of announcements.

### The automatic re-run

- **R7. When a package is behind.** A row's package is behind when all of these hold:
  - its row is in a group (RD-3 pass 2 R21's listed set) and `runOffer` enables Run for it;
  - its result is `done` and carries `started_at`;
  - some activity document's `lastActivityAt` is later than that `started_at` (both server times, so the laptop's clock plays no part);
  - the row has no request pending, accepted and awaiting its queued result, or refused and still showing (RD-3 pass 2 R6's `requests`).
  Nothing is behind once the page has become an info page (access withdrawn, the class gone, an expired sign-in), even if the package list answers after it. A `queued`, `running`, stuck or `failed` result is never behind, and neither is a row with no result: the first run of a package is always the researcher's, and a failed result does not re-run on its own (Doug, 2026-10-11), so a package that fails every time cannot loop through a lesson.
- **R8. Coalescing, with no delay and no floor** (Doug, 2026-10-11). The page requests a re-run as soon as a package is behind. It sends one automatic request per finished result: it remembers the `updated_at` of the result it last requested for, and sends nothing more for that result, so the snapshots that arrive before the queued result does cannot repeat the request. While the re-run is queued or running the package is outstanding, so a request would append nothing (REPORT-143 R5, R8), and the page sends none; activity in that time is picked up when the re-run finishes, by comparing with the re-run's own `started_at`. So saves during a run give exactly one more run after it. There is no minimum interval: a per-package one is an optional REPORT-172 manifest value, and a package that declares none has none.
- **R9. The request is the Run request.** An automatic re-run sends exactly RD-3 pass 2's R5 request for that one row, at the row's `current_version.version`, so it may run a newer version than the result it replaces, as Run would. A refusal is shown on the row as R6 shows one, and R7 then keeps the row from being retried until its result changes.
- **R10. It never navigates.** An automatic request that meets a token near expiry or a 401 does not re-authorize (which would navigate the page away under a researcher who pressed nothing). Automatic re-runs stop, and the Class activity section says so as a status message, so a screen reader announces it: "Automatic re-runs have stopped because your sign-in has expired. Run any package to sign in again." for an expired token, and "Automatic re-runs have stopped because your sign-in could not be renewed. Launch the dashboard again from the portal." for a refusal of a token issued under a minute ago, which Run cannot renew either (it shows RD-3 pass 2's expired page). Run itself keeps RD-3 pass 2's behavior: it signs in again, which starts a new page with automatic re-runs on, and a Run that succeeds without signing in again (a 401 that passed) turns them back on in place, asking again for each package whose automatic request the sign-in refused.
- **R11. One more run per burst, never a loop.** A re-run's own result gets a new `started_at` at its claim, after every save the page had seen when it requested, so the finished re-run is behind only if a learner saved after it began. On load, a result already behind is requested at once, which covers the researcher returning to a class that worked while the page was closed.
- **R12. What the page says about it.**
  - Under the Class activity count, when the activity listener is answering and automatic re-runs have not stopped: "Your finished packages re-run on their own as soon as students save new work."
  - On a row whose latest finished result has a `started_at` earlier than some learner's `lastActivityAt`, while the row is neither queued nor running nor being or about to be requested (its result failed, automatic re-runs stopped, a refusal is showing, an accepted Run gave no new result within 3 minutes, or Run is disabled): "Students have saved work since this result."
  - The opened result shows "Includes every save before <started_at>, when this run began reading the class's data." for the finished run it shows (RD-3 pass 2's `latestFinished`), as a local date and time, on its own line. It does not say later saves are left out: the package reads after the claim, so a later save may be in the result too. A `previous` copied from a result without `started_at` may lack it (REPORT-143 R8a leaves absent fields out), and then the line is omitted.
  - **A re-run announces only its outcome.** On a row that has a finished result, the request, accepted, queued and running lines show but are outside the row's live region, so a screen reader hears only the new summary, a refusal or a failure. The same holds for the lines above the list that name the running package, and for Unlisted rows. A first run, with no finished result, announces each step. The rule is the row's state, so it holds after a reload and in another tab, and it applies to a Run press on a finished row too.
  - An open result is re-run like any other: RD-3 pass 2's view keeps showing the finished run through the re-run and shows the new one in place. Its view closes only when no finished result is left, which happens only to a result queued before REPORT-143 wrote `previous`.

### Prose and tests

- **R13.** `app/README.md`'s "What it reads" table gains the activity collection, its portal row says the run request is also sent on its own for a finished package that is behind, and a "Class activity and automatic re-runs" section says what the count counts and when a package re-runs on its own. The info page's "What it can show" gains the class's recent activity. The class header's ownership line is "Your results and counts on this page are your own: another researcher of this class sees their own runs. Class activity is the same for every researcher of this class."
- **R14.** The app's suite (vitest, jsdom), each test named so that deleting the line it guards fails it: R1's path and five stops with one token call and one sign-in; R3's refusal before and after a snapshot; R4 and R5's window and count, including a mocked window constant; R6's count falling on fake timers with no snapshot, and a timer capped for a save far in the future; R7's exclusions each on its own; R8's single request, the coalesced extra run and no repeat across snapshots; R10's stop; R11's no-request after a clean re-run; R12's announcements and texts, including the gap between an accepted request and its queued result.

## Technical Notes

- **Files**: `app/src/shell/firebase.ts` (`activityPath`), `app/src/shell/services.ts` (the fifth listener, `ClassListeners.activity`, `refused("activity")`), `app/src/shell/activity.ts` (the pure count, expiry and behind functions and the constants), `app/src/shell/rerun.ts` (`useAutoRerun`), `app/src/shell/runs.ts` (`RunRequest`'s `requested` entry), `app/src/components/ClassActivity.tsx`, `app/src/pages/ClassDashboard.tsx`, `app/src/components/PackageList.tsx` (`quietUpdate`, `StateRegion`'s `quiet` and `aside`, the out-of-date line), `app/src/components/Unlisted.tsx`, `app/src/components/ResultView.tsx`, `app/src/components/ResultMarkdown.tsx` (`memo`), `app/src/pages/Info.tsx`, `app/README.md`, `app/src/styles.css`, tests. Nothing outside `app/`.
- **Why `started_at` is a sound comparison.** `started_at` is the server time of the runner's claim, written with `stage: "starting"` before `prepare_package` and `run_package`, so before the package makes any of its own pulls (RD-4 pass 2 R43, R45), and REPORT-143's rules refuse a runner write that sets it to anything but the server's time. The package pulls answers live from report-service's Firestore through report-server. REPORT-153 stamps `lastActivityAt` with the server time of its trigger's write, after the answer write it records, and retries a failed delivery. So a learner whose `lastActivityAt` is at or before `started_at` saved before the pull, which then read it; a later one either saved after the claim or had its trigger (or a retry) land after it, and either way the next re-run covers it. The worst case is one extra re-run, never a missed change.
- **What REPORT-153 provides.** One document per learner who has made a qualifying answer write in the class, with `lastActivityAt`, `writeCount` (a change signal only) and `changed`. A qualifying write is a non-anonymous answer that changed in some field other than `created` and `interactive_state_history_id`; deletes and `move_student_work` moves do not count, and a collaborator's copy of the owner's answer counts as the collaborator's activity. A researcher token for the class may `get` and `list`.
- **CLUE (RD-6 pass 2).** The CLUE app writes the same documents in CLUE's own Firebase project (CLUE-693), after a change's history upload and content save land, and the page merges them per learner with report-service's (`specs/RD-6-pass-2-clue-activity.md`).
- **Clock.** The count compares server times with the laptop's clock (R5), so a laptop clock off by k shifts the window by k, and a clock running behind cannot hide a learner. The re-run comparison uses no client clock. The page cannot read server time: it makes no Firestore write, and the `Date` header is not exposed to cross-origin `fetch`. The count's timer is capped at `setTimeout`'s longest delay, since a longer one fires at once.
- **Who pays.** Each researcher with the dashboard open re-runs their own results on their own VM; two researchers watching one class run twice, as they would pressing Run, and two tabs of one researcher both request while the function appends nothing for a package already outstanding (REPORT-143 R8). In an active class a package re-runs back to back for each researcher watching; that is the intent (Doug, 2026-10-11). The VM runs one package at a time, so several packages in a busy class take turns. REPORT-172's optional minimum interval is the bound for a package that is heavy or calls a model.
- **Rows don't move.** Every group sorts by title (Doug, 2026-10-11; RD-3 pass 2's R13), so re-runs finishing back to back do not reshuffle a group under the researcher's pointer.
- **Prerequisites for the staging check**: REPORT-153 deployed to report-service-dev with its activity rule, from a base that carries REPORT-170; and this branch's build's redirect URI, `https://models-resources.concord.org/researcher-dashboard/branch/pass-1-activity-and-rerun/index.html`, on the staging "Researcher Dashboard" client (client 14), which matches exactly and answers an unregistered URI with a 500. Remove the URI once the PR merges.
- **The staging check.** On class 590 as `dougresearcher`, from the branch build: the Class activity section reads the class's count with its note; run `projects/20/wildfire-responses` by hand and let it finish; as a staging student of class 590, save a changed answer; within seconds the count rises by one, and the row reads "Requesting…", then queued, running and done, once, with the previous summary showing throughout and an open result staying open; the opened result's "Includes every save before" time is after the student's save; no second re-run follows with no further saves; a save made while the re-run is running gives exactly one more after it; five minutes after the save the count falls back without a reload. Nothing in the check terminates the VM.
- **The contract REPORT-158 builds on.** Its Done when holds when the researcher has the dashboard open on the class with REPORT-153 deployed, the package has already run once for that researcher in that class and is `done`, its row is listed and runnable, and a student then saves a changed, non-anonymous Activity Player answer. The package is run from scratch with a fresh pull, so it must read current data on every run; nothing tells it it is a re-run.
- **Local checks before close** (2026-10-16): the real `ClassDashboard`, Firebase sign-in and five listeners, mounted in a throwaway page against the Firestore and Auth emulators with REPORT-153's rules, with the portal and report-server faked. An empty collection read as 0 students; one save made one request, further saves before the queued result none; a save during the run made exactly one more at its finish; a clean finish made none; a save nearly five minutes old left the count on its own timer; a token for another class showed "Class activity could not be read." and requested nothing; a reload over a behind result made one request under StrictMode. The re-run's lines sat outside the live region and its outcome inside. The built `index.html`'s CSP was byte-identical to `main`'s.

## Out of Scope

- RD-6 pass 2 (Doug, 2026-10-14): the CLUE activity listener only (a second, separately named Firebase app signed in to CLUE's project, and a class using both platforms counting each learner once and taking the newest save from either), with no runner change. Nothing here reads `changed` or `writeCount`.
- A control to turn automatic re-runs off, or a per-package declaration of which inputs a package reads (every finished, listed, runnable package re-runs on answer activity).
- Logged-in counts, which nothing can compute; the class-activity page of `final-design.md` 15.2; teacher-facing activity.
- Any change to report-service, rigse, report-server, the runner or REPORT-153's contract.
- A manifest declaration of whether a package re-runs on its own, how often, and on which sources: REPORT-172, in the backlog, which also carries an optional per-package minimum interval (default none). Until then every finished, listed, runnable package re-runs on answer activity, unreviewed packages included now that `unreviewed_runs` is on for staging: an automatic re-run only repeats a package the researcher already ran by hand, as themselves.
- Logs as a re-run trigger. Logs reach Athena 2 to 26 hours late and have no trigger, so a logs package re-runs only on answer activity until REPORT-150's route gives logs a freshness the page can watch.
- Closing or transitioning RIGSE-360 or RIGSE-361.

## Decisions

### Requirements

### Does the runner write `inputs` on the result?
**Context**: `final-design.md` 14 designed `inputs: {clue_documents, answers, logs, log_freshness_at}` as what a re-run compares against, but the activity documents report per-learner times, not counts.
**Options considered**:
- A) No runner change: compare with `started_at`, and the opened result states it.
- B) The runner records an activity watermark, `inputs: {activity_at}`, at the claim; it selects the same saves as A.
- C) The designed counts, which nothing the listeners report can be compared with.

**Decision**: A (Doug, 2026-10-11). `started_at` precedes every read a run makes, CLUE reads through cc-data included, so it serves CLUE-693's documents too; no later pass needs `inputs`. What a re-run is triggered by, and whether a costly package re-runs at all, is the package author's to declare (REPORT-172).

---

### What counts as "behind"
**Options considered**:
- A) Any learner's `lastActivityAt` later than the result's `started_at`.
- B) Any `writeCount` that changed since the page loaded.

**Decision**: A. B misses the returning researcher, and `writeCount` can double-count; A compares two server times and needs no memory across loads.

---

### Re-run timing, and what the page shows during a re-run
**Context**: A delay and a floor are needed only if a re-run hides the last result until it finishes.
**Options considered**:
- A) A fixed delay and a minimum interval.
- B) Coalescing: re-run as soon as a finished result is behind, once more after a run if students saved during it, and keep the last finished result visible throughout.

**Decision**: B (Doug, 2026-10-11), with a per-package minimum interval as an optional REPORT-172 value. The last result lives in REPORT-143's `previous`, which survives a reload and a second tab; failed results never re-run on their own, so a package that always fails cannot run on every save.

---

### An automatic request never re-authorizes
**Options considered**:
- A) Stop automatic re-runs on an expired session and say so.
- B) Re-authorize as Run does.

**Decision**: A. Re-authorizing navigates to the portal and back, losing the researcher's place for a request they did not make; one press of Run restores both.

---

### Five minutes as the window
**Options considered**:
- A) Ship 5 minutes and revisit once a staging lesson's cadence is visible.
- B) Hold the count until a cadence has been measured.

**Decision**: A. The value is one constant that every label is built from, so changing it is a one-line change; holding the count back would leave RIGSE-360's live count with nothing to show.

---

### The class header's ownership line
**Context**: The header said every result and count on the page was the researcher's own, but the activity count is shared.
**Options considered**:
- A) Name Class activity as the shared exception.
- B) Narrow the claim to runs and results.
- C) Leave it, with the note under the count correcting it.

**Decision**: A (Doug, 2026-10-16), with the note under the count keeping its own sentence.

---

### The wording of the opened result's time
**Context**: `started_at` is the claim, before the package reads anything, so a save after it can be in the result; "Read the class's data from <time>" read as a cutoff.
**Options considered**:
- A) "Began reading the class's data at <time>".
- B) "Includes every save before <time>, when this run began reading the class's data".
- C) Keep "Read the class's data from <time>".

**Decision**: B (Doug, 2026-10-16): it states the guarantee a researcher checking one student's save needs and claims nothing about later saves.

---

### What screen readers hear during automatic re-runs
**Context**: A re-run walks the row's polite live region through every step, and with back-to-back re-runs a screen reader user would hear that for every package all lesson.
**Options considered**:
- A) A re-run announces only its outcome, decided by the row's state.
- B) Only automatic re-runs are quiet, which needs memory a reload or a second tab loses.
- C) Announce every step.

**Decision**: A (Doug, 2026-10-16). The session lines naming the running package follow the same rule.

---

### Implementation

### One automatic request per finished result, remembered by its `updated_at`
**Options considered**:
- A) `useAutoRerun` remembers, per package, the `updated_at` of the result it requested for, and requests again only for a newer one.
- B) Rely on `requests`' pending entry and the function's dedupe.

**Decision**: A. Before the queued snapshot the row is still `done` and behind, so B would send a second request on any snapshot in that gap; A needs no timer. Checked in a throwaway copy under StrictMode, and again against the emulators.

---

### `behindRows` reuses `runOffer`
**Options considered**:
- A) Call `runOffer(row.runnable, rowState(...))`, so whatever disables Run also stops an automatic run.
- B) List the excluded statuses again in `behindRows`.

**Decision**: A, one source of truth. `isBehind`'s `status === "done"` is what excludes queued, running, stuck and failed rows; for a done row `runOffer` adds only `runnable` today, and is kept so a later change to when Run is offered carries over.

---

### An accepted Run is held until its queued result arrives
**Context**: Found in review. Between the function's 202 and the queued snapshot the row is still `done` and nothing is in flight, so it re-announced its old summary and flashed the out-of-date line.
**Options considered**:
- A) Keep `{ requested: true, at }` in `requests`, tied to the result's `updated_at` when the request was sent, and treat it as in flight.
- B) Count only automatic rows as in flight through `behind`.

**Decision**: A, which covers a pressed Run too and needs no new rule in `held`, which already holds a non-pending entry while `at` matches. It is the one change to `runs.ts` this pass makes, beside renaming `RESUME_WAIT_MS` to `ACCEPTED_WAIT_MS`. The function can answer 202 with nothing appended, for a package it already counts as outstanding, and then no new result comes, so the entry lapses after `ACCEPTED_WAIT_MS` (3 minutes), as Resume's does. A lapsed entry still holds the row out of the automatic path, so the page does not ask again every 3 minutes of a lesson for a request that writes nothing; the row stops reading as requested, shows "Students have saved work since this result." and keeps Run beside it. `at` is taken before the request, not from the answer: a re-run that finishes before its request is answered would otherwise tie the entry to its own finished result, hold the row through later saves and keep its outcome from being announced.

---

### Every save re-renders an open result
**Context**: The activity listener adds a snapshot per learner save, and `ResultMarkdown` parsed the whole result on every render (70 ms per render for a 300-row result under jsdom).
**Options considered**:
- A) `React.memo` on `ResultMarkdown`, whose props an activity snapshot does not change.
- B) Leave it.

**Decision**: A, with a test that mocks react-markdown and counts its renders.
