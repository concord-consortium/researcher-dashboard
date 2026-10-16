# RD-6 pass 1: class activity and the automatic re-run

**Jira**: https://concord-consortium.atlassian.net/browse/RD-6
**Repo**: https://github.com/concord-consortium/researcher-dashboard
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

**Pass**: 1 of 2. On `main` at `fc658fa`, which merged RD-3 pass 2 (PR #4), since this pass changes the page RD-3 pass 2 builds. Pass 2 follows CLUE-693 and is not this pass: the app's CLUE activity listener only, with no runner change and no incremental pull (Doug, 2026-10-14). Packages read CLUE only through cc-data (REPORT-152), and every run pulls fresh.

## Overview

Show how many students saved work in the last few minutes, and re-run a researcher's finished packages automatically as soon as students have saved work since the run read the class's data. Both read REPORT-153's per-learner activity documents through the dashboard's existing Firebase sign-in.

## Project Owner Overview

A researcher with the dashboard open during a lesson wants to see that the class is working and to have their results keep up without pressing Run again. After this pass the page shows "3 students active in the last 5 minutes", says plainly that it counts students who saved an answer (a student reading or thinking saves nothing, so it is not "logged in"), and, when a student saves new work after a finished package read the class's data, re-runs that package by itself, straight away. Saves made while a re-run is going give exactly one more run after it, never a loop, and the last finished result stays on screen until the new one is ready. A researcher who comes back to a page that was closed for an hour gets the same single catch-up re-run.

This is the dashboard half of "a number that moves on the page" and the loop REPORT-158's Wildfire package is built to make visible. It covers Activity Player classes, where REPORT-153's trigger writes the activity; CLUE classes wait for CLUE-693.

## Background

**The design.** `final-design.md` 14: per-learner activity documents written by Firestore triggers; the dashboard listens, the VM stays a worker; re-run on input difference; the activity count is a read over the same documents, labeled "active in the last N minutes", with N a constant chosen once real write cadence exists. Jira RD-6 is the scope; pass 1 needs only REPORT-153.

**What REPORT-153 provides** (spec `a4ec346` on report-service `master` `1c3df21`, implementation planned for 2026-10-16): in report-service's Firestore, `researcher_dashboard/{portal}/activity/{class_hash}/users/{platform_user_id}`, one document per learner who has made a qualifying answer write in the class, with exactly `lastActivityAt` (server timestamp of the last recorded write), `writeCount` (a change signal only) and `changed` (offering id to server timestamp). A qualifying write is a non-anonymous answer that changed in some field other than `created` and `interactive_state_history_id` (which the Activity Player sets on every save); deletes and `move_student_work` moves do not count, and a collaborator's copy of the owner's answer counts as the collaborator's activity (its R3). Deliveries are retried on failure (its R1), so a lost delivery does not leave a save unrecorded; a retry can only over-report, with a `lastActivityAt` later than the save, which costs at most one extra re-run ("Why `started_at` is a sound comparison"). A researcher token for the class may `get` and `list` (R7); a listener on an empty collection receives an empty snapshot (R9). Its Technical Notes ask RD-6 to listen to the whole collection and compute the window on a timer, and to say how it handles the laptop's clock against server time.

**What RD-3 pass 2 provides** (merged to `main` as `fc658fa`, this branch's base; closed spec `specs/RD-3-pass-2-run-and-result.md`): `DashboardServices.watchClass(scope, listeners)` mints one class-scoped researcher Firebase token, signs in once, opens the profile, runner, scope-document and results listeners, and returns one function that stops all four (a listener that cannot start stops those already started, and the promise rejects); `ClassDashboard` calls that function as soon as the page becomes an info page. A second watcher is not an option: a second custom-token sign-in on the same named Firebase app replaces the first under the other listeners (RD-3 pass 2 session, channel #181). The page sends the run request through `Api` (R5, R6), offers Run per `runOffer` (R7), keeps per-row request state (`requests` in `runs.ts`: pending, a refusal, or an accepted Resume, each but pending shown only while the result's `updated_at` is the one it was made against), and lists the rows of `groupPackages`' groups (R21). Its CSP's `connect-src` already allows `https://firestore.googleapis.com` (R25), and `app/tests/no-writes.test.ts` fails if the app imports any Firestore write function (R2).

**What the result already records.** A claimed result carries `started_at`, the server time of the claim, written with `stage: "starting"` before the `prepare_package` and `run_package` stages, so before the package makes any of its own pulls (RD-4 pass 2 R43, R45; `ClassDocuments.claim` in `runner/server/status.js` on RD-4 pass 2's branch at `d2b402e`), and REPORT-143's rules refuse a runner write that sets `started_at` to anything but the server's time (its R22a, on report-service `master`). The finish writes `status: "done"` and `finished_at` and leaves `started_at` alone.

**The previous result stays visible through a re-run** (Doug, 2026-10-11, channel #202). The function's queued write replaces the result whole and the runner's claim clears `summary` and `display`, so REPORT-143's queued write copies the last `done` run into a `previous` field, `{package, image_version, summary, display, started_at, finished_at}`, carrying an existing `previous` forward when the result being re-queued is `failed` (its R8a; merged, deployed and Done). RD-4 pass 2's claim, stage, finish and failure writes are named-field merges and leave it alone. RD-3 pass 2 renders the latest finished result (`latestFinished`: the result itself when `done`, otherwise `previous`) on the row and in an open view, which stays open and updates in place when the re-run finishes (its R9, R15). This pass depends on both and changes neither.

**The comparison is a time, not counts.** The activity documents report per-learner server times (`lastActivityAt`), not answer, log or CLUE document counts, so the comparison they support is some learner's `lastActivityAt` later than the moment the run began reading the class. That moment is already on the result as `started_at`, on the same server clock, so R7 uses it and the runner writes nothing new (Doug, 2026-10-11; see Open Questions).

**Why `started_at` is a sound comparison.** The package pulls answers live from report-service's Firestore through report-server (checked at stage 4: report-service's bulk read, `functions/src/api/bulk-read.ts` `readAnswersEndpoint`, queries `answers` in Firestore by `remote_endpoint` on every page, so cc-data's `get answers` sees writes up to the moment it reads; nothing goes through the S3 copy). REPORT-153 stamps `lastActivityAt` with the server time of the trigger's write, which is after the answer write it records. So a learner whose `lastActivityAt` is at or before `started_at` saved that work before the claim, and so before the pull, which then read it; a learner whose `lastActivityAt` is later saved after the claim, or saved just before it with the trigger landing after it, and either way the next re-run covers it. The second case costs at most one extra re-run, never a missed change.

**The page today has no live count.** `final-design.md` 14 says "the live count the page shows today is the live CLUE document count". That was the spike's page; RD-3 pass 1 deleted it, and nothing on `main` or in RD-3 pass 2 counts CLUE documents (`grep -ri clue app/src` finds only comments). There is nothing to remove or relabel.

## Requirements

### The activity listener

- **R1. One more listener on `watchClass`'s sign-in.** `watchClass` opens a fifth listener, on the collection `researcher_dashboard/<portal segment>/activity/<scope.class_hash>/users`, with the same portal segment and class hash the profile path uses, and its returned function stops all five. No second token, sign-in or watcher is added. The page reads each document's `lastActivityAt`; `writeCount` and `changed` are not read in this pass.
- **R2. Read-only, as before.** The page still never writes Firestore and asks for no Firebase token beyond RD-3 pass 2's; `app/tests/no-writes.test.ts` passes unchanged. The CSP is unchanged.
- **R3. A refused or failed activity listener** (before REPORT-153's rules are deployed, the path matches no rule), or a `watchClass` that fails as a whole (its token, its sign-in, or a listener that cannot start), shows "Class activity could not be read." in the Class activity section, shows no count, and starts no automatic re-run. The other four listeners and the rest of the page are unaffected. The activity listener stops with the others when the page becomes an info page.

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
  - the row has no request pending and no refusal showing (RD-3 pass 2 R6's `requests`).
  A `queued`, `running`, stuck or `failed` result is never behind, and neither is a row with no result: the first run of a package is always the researcher's, and a failed result does not re-run on its own (Doug, 2026-10-11), so a package that fails every time cannot loop through a lesson.
- **R8. Coalescing, with no delay and no floor** (Doug, 2026-10-11). The page requests a re-run as soon as a package is behind. It sends one automatic request per finished result: it remembers the `updated_at` of the result it last requested for, and sends nothing more for that result, so the snapshots that arrive before the queued result does cannot repeat the request. While the re-run is queued or running the package is outstanding, so a request would append nothing (REPORT-143 R5, R8), and the page sends none; activity in that time is picked up when the re-run finishes, by comparing with the re-run's own `started_at`. So saves during a run give exactly one more run after it. There is no minimum interval: a per-package one is an optional REPORT-172 manifest value, and a package that declares none has none.
- **R9. The request is the Run request.** An automatic re-run sends exactly RD-3 pass 2's R5 request for that one row, at the row's `current_version.version`, so it may run a newer version than the result it replaces, as Run would. A refusal is shown on the row as R6 shows one, and R7 then keeps the row from being retried until its result changes.
- **R10. It never navigates.** An automatic request that meets a token near expiry or a 401 does not re-authorize (which would navigate the page away under a researcher who pressed nothing). Automatic re-runs stop for the page's life, and the Class activity section says "Automatic re-runs have stopped because your sign-in has expired. Run any package to sign in again." as a status message, so a screen reader announces it. Run itself keeps RD-3 pass 2's behavior. A young-token refusal is treated the same way.
- **R11. One more run per burst, never a loop.** A re-run's own result gets a new `started_at` at its claim, after every save the page had seen when it requested, so the finished re-run is behind only if a learner saved after it began. On load, a result already behind is requested at once, which covers the researcher returning to a class that worked while the page was closed.
- **R12. What the page says about it.**
  - Under the Class activity count, when the activity listener is answering and automatic re-runs have not stopped: "Your finished packages re-run on their own as soon as students save new work."
  - On a row whose latest finished result has a `started_at` earlier than some learner's `lastActivityAt`, while the row is neither queued nor running nor being or about to be requested (its result failed, automatic re-runs stopped, a refusal is showing, or Run is disabled): "Students have saved work since this result."
  - The opened result shows "Includes every save before <started_at>, when this run began reading the class's data." for the finished run it shows (RD-3 pass 2's `latestFinished`), as a local date and time, which is what the comparison used (Doug, 2026-10-16). It does not say later saves are left out: the package reads after the claim, so a later save may be in the result too. A `previous` copied from a result without `started_at` may lack it (REPORT-143 R8a leaves absent fields out), and then the line is omitted.
  - **A re-run announces only its outcome** (Doug, 2026-10-16). On a row that has a finished result, the request, queued and running lines show but are outside the row's live region, so a screen reader hears only the new summary, a refusal or a failure. The same holds for the lines above the list that name the running package. A first run, with no finished result, announces each step as before. The rule is the row's state, so it holds after a reload and in another tab, and it applies to a Run press on a finished row too.
  - An open result is re-run like any other: RD-3 pass 2's view keeps showing the finished run through the re-run and shows the new one in place, so nothing here holds it back. Its view closes only when no finished result is left, which happens only to a result queued before REPORT-143 wrote `previous`.

### Prose and tests

- **R13.** `app/README.md`'s "What it reads" table gains the activity collection, its portal row says the run request is also sent on its own for a finished package that is behind (R7), and the README says what the count counts and when a package re-runs on its own. The info page's "What it can show" gains the class's recent activity. The class header's ownership line becomes "Your results and counts on this page are your own: another researcher of this class sees their own runs. Class activity is the same for every researcher of this class." (Doug, 2026-10-16), since the activity count is the one thing on the page that is shared.
- **R14.** The app's suite (vitest, jsdom), each test named so that deleting the line it guards fails it:
  - R1's path from the scope's class hash and the staging portal, and `watchClass`'s returned function stopping five listeners, with one token call and one sign-in.
  - R3: after a snapshot, a refusal removes the count and shows the line; a refusal before any snapshot shows the line and requests nothing.
  - R5 with two documents inside the window and one outside (so counting every document fails), one in the future, and one without `lastActivityAt`; R4 as `windowLabel(10)` reading "in the last 10 minutes", and the page's label equal to `windowLabel(ACTIVE_WINDOW_MINUTES)`, so a hardcoded "5" in either fails.
  - R6's count falling from 2 to 1 to 0 on fake timers with no new snapshot.
  - R7's eligibility: each exclusion on its own (not listed, Run disabled, `queued`, `running`, `failed`, no result, `started_at` absent, activity at exactly `started_at`, a pending request, a refusal showing) and the one case that is behind.
  - R8: one request as soon as a learner's write later than `started_at` arrives, with no timer; one request, not two, across two activity snapshots that both arrive before the queued result; after the re-run goes queued, running and `done` with a `started_at` earlier than a save made during it, exactly one more request at once.
  - R10: an automatic request meeting `SessionExpired` calls no `onExpired`, shows the stopped line in a status message and requests nothing more.
  - R11: the re-run's result, `done` with a `started_at` later than every activity time, requests nothing.
  - R12's announcements: on a row with a finished result, "Requesting…" and a running line are outside any live region and the new summary is inside it; on a row with none, the running line is inside it.
  - R12's texts: the Class activity line; "Students have saved work since this result." on a `failed` result over a `previous` older than the newest save, and not on a `done` row that is being requested; the opened result's line from the shown run's `started_at`.

## Technical Notes

- **Files**: `app/src/shell/firebase.ts` (`activityPath`), `app/src/shell/services.ts` (`watchClass`'s fifth listener, `ClassListeners.activity`, `refused("activity")`), a new `app/src/shell/activity.ts` (the pure count, expiry and behind functions and the constants; it uses `runs.ts`'s `Finished`, `latestFinished`, `millis`, `rowState`, `runOffer` and `RunRequest` and adds nothing there), a new `app/src/components/ClassActivity.tsx`, `app/src/pages/ClassDashboard.tsx` (the section and the automatic request), `app/src/components/PackageList.tsx` (R12's out-of-date line on listed rows), `app/src/components/ResultView.tsx` (R12's line), `app/src/pages/Info.tsx`, `app/README.md`, tests. Nothing outside `app/`.
- **Clock.** The count compares server times with the laptop's clock (R5), so a laptop clock off by k shifts the window by k; NTP keeps that to well under a second on a working laptop, and a clock running behind cannot hide a learner (future times count). The re-run comparison uses no client clock at all (R7). The page cannot read server time: it makes no Firestore write, and the `Date` header is not exposed to cross-origin `fetch`.
- **Who pays.** Each researcher with the dashboard open re-runs their own results on their own VM; two researchers watching one class run twice, as they would pressing Run. Two tabs of one researcher both request, and the function appends nothing for a package already outstanding (REPORT-143 R8).
- **Who pays, with no floor.** In an active class a package re-runs back to back, one run after another, for each researcher watching; that is the intent (Doug, 2026-10-11). The VM runs one package at a time, so several packages in a busy class take turns, and a manual Run of another package waits its turn behind them. REPORT-172's optional minimum interval is the bound for a package that is heavy or calls a model.
- **Rows don't move.** With re-runs finishing back to back, an order by most recent run would reshuffle a group under the researcher's pointer every time one finishes. So every group sorts by title (Doug, 2026-10-11): RD-3 pass 2's R13, Official included, and freshness stays on each row's "Finished <time>".
- **Prerequisites for the staging check, not for the tests**:
  - Already true: REPORT-143 (with `previous`) is merged, deployed to report-service-dev and Done; RD-4 pass 2's runner is on the QA stack (0.2.3 since 2026-10-15); RD-3 pass 2's staging check passed, and it is merged and deployed to `branch/main/`.
  - REPORT-153 deployed to report-service-dev with R7's rules. This waits on REPORT-153's PR approval, and its deploy must carry REPORT-170: REPORT-170 is on report-service-dev from its unmerged branch, so a `researcherDashboard` deploy from any other base removes it. It is not a given on 2026-10-16.
  - This branch's build's redirect URI, `https://models-resources.concord.org/researcher-dashboard/branch/pass-1-activity-and-rerun/index.html`, added to the staging "Researcher Dashboard" client (client 14), which lists only `branch/main/index.html` since RD-3 pass 2's merge. Doug adds it before the check. The portal matches it exactly and answers an unregistered URI with a 500; remove it once the PR merges.

### The contract REPORT-158 builds on

REPORT-158's Done when ("with a student writing an answer on the demo class, the automatic re-run produces output that visibly changes") holds when:

- the researcher has the dashboard open on the class, with REPORT-153 deployed for that portal's report-service project;
- the package has already run once for that researcher in that class and its result is `done` (the first run is a manual Run);
- its row is listed and runnable (official, applying to the class);
- a student then saves a changed, non-anonymous Activity Player answer in the class.

The page requests a re-run as soon as it sees that write, at the package's current version. Saves made while that re-run is queued or running give exactly one more re-run, as soon as it finishes. Throughout, the row and an open result keep showing the last finished result, and the new one replaces it when it is `done`. The package is run from scratch with a fresh pull, so it must read current data on every run and never reuse an earlier run's answers (`wildfire-responses` already re-reads its Student ID Mapping run with `get report --refresh` and fetches answers each time). Nothing tells the package it is a re-run, and it needs nothing new from the runner; the result's `finished_at` is the server's time of the re-run, and a time the package prints is the VM's clock. CLUE activity does not trigger a re-run until CLUE-693 and a later pass.

### The staging check

On class 590 as `dougresearcher`, from the branch build, after the prerequisites: the Class activity section reads "0 students active in the last 5 minutes" (or the class's real count) with its note; run `projects/20/wildfire-responses` by hand and let it finish; as a staging student of class 590, save a changed answer; within seconds the count rises by one, and the row reads "Requesting…", then queued, running and done, once, with the previous summary showing throughout and an open result staying open; the opened result's "Includes every save before" time is after the student's save; no second re-run follows with no further saves; a save made while the re-run is running gives exactly one more after it; five minutes after the save the count falls back without a reload. Nothing in the check terminates the VM: an API terminate of an awake VM arrives as `/suspend` then termination (RD-4 pass 2 R23), so the row reads paused, then stuck, then failed once the watchdog's lease fails it, and a failed result is not re-run on its own (R7).

### Clauses covered

| Jira clause (pass 1's part) | Requirement |
|---|---|
| The app listens to the per-learner activity documents through the page's one Firestore watcher | R1 to R3 |
| Behind when some learner's `lastActivityAt` is later than the result's `started_at`; the runner records nothing extra | R7 |
| Re-runs with the ordinary Run request, only while the dashboard is open, only for a done result | R7, R9 |
| Coalesced, no delay and no minimum gap; one automatic request per finished result | R8, R11 |
| On load the difference arrives at once; the returning researcher is the same case | R11 |
| The opened result says which moment the class's data was read from | R12 |
| The count, in a window that is one constant, labeled "active in the last N minutes" with what it counts | R4 to R6 |
| A student's save causes exactly one automatic re-run per finished result rather than a loop | R8, R11, R14 |

## Out of Scope

- RD-6 pass 2 (Doug, 2026-10-14): the CLUE activity listener only (a second, separately named Firebase app signed in to CLUE's project, and a class using both platforms counting each learner once and taking the newest save from either), with no runner change. Nothing here reads `changed` or `writeCount`.
- A control to turn automatic re-runs off, or a per-package declaration of which inputs a package reads (the manifest has none; every finished, listed, runnable package re-runs on answer activity).
- Logged-in counts, which nothing can compute; the class-activity page of `final-design.md` 15.2; teacher-facing activity.
- Any change to report-service, rigse, report-server, the runner or REPORT-153's contract.
- A manifest declaration of whether a package re-runs on its own, how often, and on which sources. REPORT-172, in the backlog, gated on the first package that makes a model call and on the first CLUE package a class using both platforms would re-run on Activity Player activity. Until then every finished, listed, runnable package re-runs on answer activity. That holds for unreviewed packages too, now that `unreviewed_runs` is on for staging (RIGSE-363, 2026-10-15): an automatic re-run only repeats a package the researcher already ran by hand, as themselves and with their own storage credentials. REPORT-172's manifest value also carries an optional per-package minimum interval, for a package that is heavy or calls a model; the default is none. `clue_prepull` is not a source declaration, and since RD-4 pass 2 the runner acts on none.
- Logs as a re-run trigger. Logs reach Athena 2 to 26 hours late and have no trigger, so a logs package re-runs only on answer activity, over logs that may not hold those actions yet, until REPORT-150's route gives logs a freshness the page can watch.
- Closing or transitioning RIGSE-360 or RIGSE-361.

## Open Questions

### RESOLVED: Does the runner still write `inputs` on the result, and if so in which pass?
**Context**: `final-design.md` 14 designed `inputs: {clue_documents, answers, logs, log_freshness_at}` as what a re-run compares against, but the listeners report times, not counts (Background).
**Options considered**:
- A) No runner change. The page compares with `started_at` (R7), and the opened result states it (R12).
- B) The runner records an activity watermark, `inputs: {activity_at}`, at the claim. It selects the same saves as A.
- C) The designed counts, from `counts.json` and the runner's CLUE count: comparable with nothing the listeners report.

**Decision**: A (Doug, 2026-10-11, stage 8), after checking it against the CLUE and future-package work:
- **CLUE.** `started_at` precedes every read a run makes, including a package's own CLUE reads through cc-data (RD-4 pass 2 deleted the runner's CLUE pre-pull), so it serves CLUE-693's documents as it serves REPORT-153's. CLUE's `lastActivityAt` is CLUE's project's server time; a few milliseconds of disagreement with report-service's clock can cost an extra re-run, not hide a save, since the claim precedes the read by seconds.
- **RD-6 pass 2.** No later pass needs `inputs` either: pass 2 is the CLUE listener only, with no runner change and no incremental pull (Doug, 2026-10-14), and a CLUE save makes a result behind by the same `started_at` comparison.
- **Future packages.** What a re-run should be triggered by, and whether a costly package (a model call, a long run) should re-run on its own at all, is the package author's to declare in the manifest, since the runner cannot observe what a package reads through cc-data. That is REPORT-172 (Out of Scope), which also carries an optional per-package minimum interval.

### RESOLVED: Judgment call: what counts as "behind"
**Options considered**:
- A) Any learner's `lastActivityAt` later than the result's `started_at`.
- B) Any `writeCount` that changed since the page loaded.

**Decision**: A. B misses the returning researcher (the page has nothing earlier to compare with), and REPORT-153 R5 says `writeCount` can double-count and is a change signal only. A compares two server times and needs no memory across loads.

### RESOLVED: Re-run timing, and what the page shows during a re-run
**Context**: A delay and a floor are needed only if a re-run hides the last result until it finishes.
**Options considered**:
- A) The fixed delay and floor.
- B) Coalescing: re-run as soon as a finished result is behind, and once more after a run if students saved during it; keep the last finished result visible throughout.

**Decision**: B (Doug, 2026-10-11), with a per-package minimum interval as an optional REPORT-172 value. With it:
- **Where the last result lives** (Doug, with the recommendation): the function's queued write copies the last `done` run into `previous` (REPORT-143), and RD-3 pass 2 renders it. The page alone remembering it fails on a reload or a second tab, which with back-to-back re-runs would be common; keeping `summary` and `display` on the document through the re-run would show one version's output under another's `package`; splitting the document into a finished part and a `run` part reads more naturally but moves `status`, which the watchdog's queries and index, the rules, `/work` and every runner write key on.
- **Failed results** (Doug, with the recommendation): never re-run on their own (R7). With no floor, a package that fails every time would otherwise run on every save; the row shows the last good result, the failure and R12's out-of-date line, with Run beside it.

### RESOLVED: Judgment call: an automatic request never re-authorizes
**Options considered**:
- A) Stop automatic re-runs on an expired session and say so (R10).
- B) Re-authorize as Run does.

**Decision**: A. Re-authorizing navigates to the portal and back; a page that does that on its own, while the researcher is reading a result, loses their place for a request they did not make. Run still re-authorizes, so one press restores both.

### RESOLVED: Low confidence: five minutes as the window
**Context**: `final-design.md` 14 says the window should be chosen "once the documents exist and there is real write cadence to look at". They do not exist until REPORT-153 deploys on 2026-10-16, the day this pass is implemented.
**Options considered**:
- A) Ship 5 minutes and revisit after a staging lesson's cadence is visible.
- B) Hold the count until a cadence has been measured.

**Decision**: A (stage 2, no decision needed from Doug). The value lives in one constant and every label is built from it (R4), so changing it is a one-line change with no test or prose to chase; holding the count back would leave RIGSE-360's live count with nothing to show the PI. Five minutes is about one Activity Player page of work, and the staging check reads the count against a real save.

## Self-Review, 2026-10-16

Roles: Product Manager (against RD-6's current Jira description), Education Researcher, QA Engineer. Each finding was checked against `main` at `fc658fa`, REPORT-143 on report-service `master` and RD-4 pass 2's runner, and the R14 case was run against implementation.md's code in a throwaway copy of `app/` (deleted afterward). Findings that need code are in implementation.md's Self-Review, 2026-10-16.

### Product Manager

#### RESOLVED: The page header and the README say things this pass makes untrue
Doug, 2026-10-16: the header names Class activity as shared (R13); the README's portal row also names the automatic request.

#### RESOLVED: The spec still records the RD-6 text and drafts it has replaced
Fixed: the clauses table is rewritten against the current Jira description, Background's `inputs` paragraph and the Open Questions are compressed, the done to-do and the draft narrative are deleted, and both files' earlier Self-Review sections are removed.

### Education Researcher

#### RESOLVED: "Read the class's data from <time>" can read as a cutoff it is not
Doug, 2026-10-16: "Includes every save before <time>, when this run began reading the class's data." (R12), which states what is guaranteed and claims nothing about later saves.

### QA Engineer

#### RESOLVED: R14's R3 case, as worded, fails against the planned code and tests something Firestore never does
Verified from the code (the activity handler sets state whenever called; Firestore delivers nothing after an error). Fixed: R14's R3 case and the page test are reworded to a snapshot, then a refusal.