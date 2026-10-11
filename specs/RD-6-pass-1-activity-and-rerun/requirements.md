# RD-6 pass 1: class activity and the automatic re-run

**Jira**: https://concord-consortium.atlassian.net/browse/RD-6
**Repo**: https://github.com/concord-consortium/researcher-dashboard
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

**Pass**: 1 of 2. Stacked on RD-3 pass 2's branch (`RD-3-pass-2-run-and-result`, spec commit `97d0849`), since this pass changes the page RD-3 pass 2 builds; branches stack in implementation order within this repository (RD-3 pass 2 on 2026-10-15, this pass on 2026-10-16). Pass 2 follows CLUE-693 and is not this pass: the app's CLUE activity listener, and the incremental pull that uses the changed-keys map as a manifest, built on the runner's CLUE reader (Doug, 2026-10-11).

## Overview

Show how many students saved work in the last few minutes, and re-run a researcher's finished packages automatically as soon as students have saved work since the run read the class's data. Both read REPORT-153's per-learner activity documents through the dashboard's existing Firebase sign-in.

## Project Owner Overview

A researcher with the dashboard open during a lesson wants to see that the class is working and to have their results keep up without pressing Run again. After this pass the page shows "3 students active in the last 5 minutes", says plainly that it counts students who saved an answer (a student reading or thinking saves nothing, so it is not "logged in"), and, when a student saves new work after a finished package read the class's data, re-runs that package by itself, straight away. Saves made while a re-run is going give exactly one more run after it, never a loop, and the last finished result stays on screen until the new one is ready. A researcher who comes back to a page that was closed for an hour gets the same single catch-up re-run.

This is the dashboard half of "a number that moves on the page" and the loop REPORT-158's Wildfire package is built to make visible. It covers Activity Player classes, where REPORT-153's trigger writes the activity; CLUE classes wait for CLUE-693.

## Background

**The design.** `final-design.md` 14: per-learner activity documents written by Firestore triggers; the dashboard listens, the VM stays a worker; re-run on input difference; the activity count is a read over the same documents, labeled "active in the last N minutes", with N a constant chosen once real write cadence exists. Jira RD-6 is the scope; Doug split it on 2026-10-09: pass 1 is "the app's activity listeners, the active-in-the-last-N-minutes count and the re-run loop, plus the runner writing `inputs` on the result", needing only REPORT-153.

**What REPORT-153 provides** (spec `b2cc91c`, approved, implemented 2026-10-16): in report-service's Firestore, `researcher_dashboard/{portal}/activity/{class_hash}/users/{platform_user_id}`, one document per learner who has made a qualifying answer write in the class, with exactly `lastActivityAt` (server timestamp of the last recorded write), `writeCount` (a change signal only) and `changed` (offering id to server timestamp). A qualifying write is a non-anonymous answer whose content changed; deletes, `move_student_work` moves, collaborators' copies and identical re-saves do not count. A researcher token for the class may `get` and `list` (R7); a listener on an empty collection receives an empty snapshot (R9). Its Technical Notes ask RD-6 to listen to the whole collection and compute the window on a timer, and to say how it handles the laptop's clock against server time.

**What RD-3 pass 2 provides** (this branch's base, `specs/RD-3-pass-2-run-and-result/`): `DashboardServices.watchClass(scope, listeners)` mints one class-scoped researcher Firebase token, signs in once, opens the profile, runner, scope-document and results listeners, and returns one function that stops all four; `ClassDashboard` calls it as soon as the page becomes an info page. A second watcher is not an option: a second custom-token sign-in on the same named Firebase app replaces the first under the other listeners (RD-3 pass 2 session, channel #181). The page sends the run request through `Api` (R5, R6), offers Run per `runOffer` (R7), keeps per-row request state (`requests`: pending, or a refusal shown until the result changes), and builds the listed set from `groupPackages` (R21). Its CSP's `connect-src` already allows `https://firestore.googleapis.com` (R25), and `app/tests/no-writes.test.ts` fails if the app imports any Firestore write function (R2).

**What the result already records.** A claimed result carries `started_at`, the server time of the claim, written before the run's `pull` stage begins (RD-4 pass 2 R43, R45; `ClassDocuments.claim` in `runner/server/status.js` on RD-4 pass 2's branch at `9397abd`, followed by `docs.stage(docId, "pull")` in `runner.js` `#steps`), and REPORT-143's rules refuse a runner write that sets `started_at` to anything but the server's time (its R22a, `d0f913b`). The finish writes `status: "done"` and `finished_at` and leaves `started_at` alone.

**The previous result stays visible through a re-run** (Doug, 2026-10-11, channel #202 and this session). Today the function's queued write replaces the result whole (`run-package.ts:176`) and the runner's claim clears `summary` and `display`, so a re-run would hide the last result until it finished. REPORT-143 changes the queued write to copy the last `done` run into a `previous` field, `{package, image_version, summary, display, started_at, finished_at}`, carrying an existing `previous` forward when the result being re-queued is `failed`; RD-4 pass 2's claim, stage, finish and failure writes are named-field merges and leave it alone. RD-3 pass 2 renders the latest finished result (the result itself when `done`, otherwise `previous`) on the row and in an open view, which stays open and updates in place when the re-run finishes. This pass depends on both and changes neither.

**The `inputs` field, checked against what the listeners report.** `final-design.md` 9 and 14 and the Jira text have the runner write `inputs: {clue_documents, answers, logs, log_freshness_at}` on the result, as "what a re-run compares against". That cannot be the comparison: the activity listeners report per-learner server times (`lastActivityAt`), not answer, log or CLUE document counts, so there is nothing on the page to compare those four numbers with. What the activity documents support is a time comparison: some learner's `lastActivityAt` later than the moment the run began reading the class. That moment is already on the result as `started_at`, on the same server clock. The re-run comparison in R7 therefore uses `started_at`, and the runner writes no `inputs` field (Doug, 2026-10-11; see Open Questions).

**Why `started_at` is a sound comparison.** The package pulls answers live from report-service's Firestore through report-server (checked at stage 4: report-service's bulk read, `functions/src/api/bulk-read.ts` `readAnswersEndpoint`, queries `answers` in Firestore by `remote_endpoint` on every page, so cc-data's `get answers` sees writes up to the moment it reads; nothing goes through the S3 copy). REPORT-153 stamps `lastActivityAt` with the server time of the trigger's write, which is after the answer write it records. So a learner whose `lastActivityAt` is at or before `started_at` saved that work before the claim, and so before the pull, which then read it; a learner whose `lastActivityAt` is later saved after the claim, or saved just before it with the trigger landing after it, and either way the next re-run covers it. The second case costs at most one extra re-run, never a missed change.

**The page today has no live count.** `final-design.md` 14 says "the live count the page shows today is the live CLUE document count". That was the spike's page; RD-3 pass 1 deleted it, and nothing on `main` or in RD-3 pass 2 counts CLUE documents (`grep -ri clue app/src` finds only comments). There is nothing to remove or relabel.

## Requirements

### The activity listener

- **R1. One more listener on `watchClass`'s sign-in.** `watchClass` opens a fifth listener, on the collection `researcher_dashboard/<portal segment>/activity/<scope.class_hash>/users`, with the same portal segment and class hash the profile path uses, and its returned function stops all five. No second token, sign-in or watcher is added. The page reads each document's `lastActivityAt`; `writeCount` and `changed` are not read in this pass.
- **R2. Read-only, as before.** The page still never writes Firestore and asks for no Firebase token beyond RD-3 pass 2's; `app/tests/no-writes.test.ts` passes unchanged. The CSP is unchanged.
- **R3. A refused or failed activity listener** (before REPORT-153's rules are deployed, the path matches no rule) shows "Class activity could not be read." in the Class activity section, shows no count, and starts no automatic re-run. The other four listeners and the rest of the page are unaffected. The activity listener stops with the others when the page becomes an info page.

### The count

- **R4. The window is one constant**, `ACTIVE_WINDOW_MINUTES = 5`, and every label naming the window is built from it.
- **R5. The count** is the number of activity documents whose `lastActivityAt` is no earlier than the page's clock minus the window. A `lastActivityAt` later than the page's clock (a laptop clock running behind the server's) counts as active. A document without a readable `lastActivityAt` is not counted.
- **R6. What the page says.** A section headed "Class activity" (`h2`), between the class header and the Packages section:
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
- **R10. It never navigates.** An automatic request that meets a token near expiry or a 401 does not re-authorize (which would navigate the page away under a researcher who pressed nothing). Automatic re-runs stop for the page's life, and the Class activity section says "Automatic re-runs have stopped because your sign-in has expired. Run any package to sign in again." Run itself keeps RD-3 pass 2's behavior. A young-token refusal is treated the same way.
- **R11. One more run per burst, never a loop.** A re-run's own result gets a new `started_at` at its claim, after every save the page had seen when it requested, so the finished re-run is behind only if a learner saved after it began. On load, a result already behind is requested at once, which covers the researcher returning to a class that worked while the page was closed.
- **R12. What the page says about it.**
  - Under the Class activity count, when the activity listener is answering and automatic re-runs have not stopped: "Your finished packages re-run on their own as soon as students save new work."
  - On a row whose latest finished result has a `started_at` earlier than some learner's `lastActivityAt`, while the row is neither queued nor running nor about to be requested (its result failed, automatic re-runs stopped, a refusal is showing, or Run is disabled): "Students have saved work since this result."
  - The opened result shows "Read the class's data from <started_at>" for the finished run it shows (RD-3 pass 2's `latestFinished`), as a local date and time, which is what the comparison used. A `previous` copied from a result without `started_at` may lack it (REPORT-143 R8a leaves absent fields out), and then the line is omitted.
  - An open result is re-run like any other: RD-3 pass 2's view keeps showing the finished run through the re-run and shows the new one in place, so nothing here holds it back. Its view closes only when no finished result is left, which happens only to a result queued before REPORT-143 wrote `previous`.

### Prose and tests

- **R13.** `app/README.md`'s "What it reads" table gains the activity collection, and the README says what the count counts and when a package re-runs on its own. The info page's "What it can show" gains the class's recent activity.
- **R14.** The app's suite (vitest, jsdom), each test named so that deleting the line it guards fails it:
  - R1's path from the scope's class hash and the staging portal, and `watchClass`'s returned function stopping five listeners, with one token call and one sign-in.
  - R3: the refused line, no count, and no request scheduled after activity arrives on a refused listener.
  - R5 with two documents inside the window and one outside (so counting every document fails), one in the future, and one without `lastActivityAt`; R4 as `windowLabel(10)` reading "in the last 10 minutes", and the page's label equal to `windowLabel(ACTIVE_WINDOW_MINUTES)`, so a hardcoded "5" in either fails.
  - R6's count falling from 2 to 1 to 0 on fake timers with no new snapshot.
  - R7's eligibility: each exclusion on its own (not listed, Run disabled, `queued`, `running`, `failed`, no result, `started_at` absent, activity at exactly `started_at`, a pending request, a refusal showing) and the one case that is behind.
  - R8: one request as soon as a learner's write later than `started_at` arrives, with no timer; one request, not two, across two activity snapshots that both arrive before the queued result; after the re-run goes queued, running and `done` with a `started_at` earlier than a save made during it, exactly one more request at once.
  - R10: an automatic request meeting `SessionExpired` calls no `onExpired`, shows the stopped line and requests nothing more.
  - R11: the re-run's result, `done` with a `started_at` later than every activity time, requests nothing.
  - R12's texts: the Class activity line; "Students have saved work since this result." on a `failed` result over a `previous` older than the newest save, and not on a `done` row that is being requested; the opened result's line from the shown run's `started_at`.

## Technical Notes

- **Files**: `app/src/shell/firebase.ts` (`activityPath`), `app/src/shell/services.ts` (`watchClass`'s fifth listener, `ClassListeners.activity`, `refused("activity")`), `app/src/shell/runs.ts` (`RunRequest` moves here; RD-3 pass 2's `Finished` type, with `started_at`, and its `latestFinished` are used, not added), a new `app/src/shell/activity.ts` (the pure count, expiry and behind functions and the constants), `app/src/pages/ClassDashboard.tsx` (the section and the automatic request), `app/src/components/PackageList.tsx` (R12's out-of-date line), the result view (R12's line), `app/src/pages/Info.tsx`, `app/README.md`, tests. Nothing outside `app/`.
- **Clock.** The count compares server times with the laptop's clock (R5), so a laptop clock off by k shifts the window by k; NTP keeps that to well under a second on a working laptop, and a clock running behind cannot hide a learner (future times count). The re-run comparison uses no client clock at all (R7). The page cannot read server time: it makes no Firestore write, and the `Date` header is not exposed to cross-origin `fetch`.
- **Who pays.** Each researcher with the dashboard open re-runs their own results on their own VM; two researchers watching one class run twice, as they would pressing Run. Two tabs of one researcher both request, and the function appends nothing for a package already outstanding (REPORT-143 R8).
- **Who pays, with no floor.** In an active class a package re-runs back to back, one run after another, for each researcher watching; that is the intent (Doug, 2026-10-11). The VM runs one package at a time, so several packages in a busy class take turns, and a manual Run of another package waits its turn behind them. REPORT-172's optional minimum interval is the bound for a package that is heavy or calls a model.
- **Rows don't move.** With re-runs finishing back to back, an order by most recent run would reshuffle a group under the researcher's pointer every time one finishes. So every group sorts by title (Doug, 2026-10-11): RD-3 pass 2's R13 since `97d0849`, Official included, and freshness stays on each row's "Finished <time>".
- **Prerequisites for the staging check, not for the tests**: REPORT-143 (with `previous`) deployed to report-service-dev with its rules (tracker 2.6), REPORT-153 deployed there with R7's rules (7.1), RD-4 pass 2's runner released (3.4), and RD-3 pass 2's staging check passed (5.5).

### The contract REPORT-158 builds on

REPORT-158's Done when ("with a student writing an answer on the demo class, the automatic re-run produces output that visibly changes") holds when:

- the researcher has the dashboard open on the class, with REPORT-153 deployed for that portal's report-service project;
- the package has already run once for that researcher in that class and its result is `done` (the first run is a manual Run);
- its row is listed and runnable (official, applying to the class);
- a student then saves a changed, non-anonymous Activity Player answer in the class.

The page requests a re-run as soon as it sees that write, at the package's current version. Saves made while that re-run is queued or running give exactly one more re-run, as soon as it finishes. Throughout, the row and an open result keep showing the last finished result, and the new one replaces it when it is `done`. The package is run from scratch with a fresh pull, so it must read current data on every run and never reuse an earlier run's answers (`wildfire-responses` already re-reads its Student ID Mapping run with `get report --refresh` and fetches answers each time). Nothing tells the package it is a re-run, and it needs nothing new from the runner; the result's `finished_at` is the server's time of the re-run, and a time the package prints is the VM's clock. CLUE activity does not trigger a re-run until CLUE-693 and a later pass.

### The staging check

On class 590 as `dougresearcher`, from the branch build, after the prerequisites: the Class activity section reads "0 students active in the last 5 minutes" (or the class's real count) with its note; run `projects/20/wildfire-responses` by hand and let it finish; as a staging student of class 590, save a changed answer; within seconds the count rises by one, and the row reads "Requesting…", then queued, running and done, once, with the previous summary showing throughout and an open result staying open; the opened result's "Read the class's data from" time is after the student's save; no second re-run follows with no further saves; a save made while the re-run is running gives exactly one more after it; five minutes after the save the count falls back without a reload.

### Clauses covered

| Jira clause (pass 1's part) | Requirement |
|---|---|
| The app listens to the per-learner activity documents | R1 to R3 |
| Re-runs when what the listeners report differs from what its last result recorded | R7, R11 |
| Debounced and with a minimum interval, or an active class becomes a continuous run loop | R8, R11: coalesced instead, with no delay or floor (Doug, 2026-10-11); a minimum interval is REPORT-172's optional manifest value |
| On load the difference arrives at once; the returning researcher is the same case | R11 |
| The activity count, a read over the same documents, in a window that is one constant | R4, R5 |
| "Active in the last N minutes", and beside it that it counts students who wrote something | R6 |
| A student's edit causes exactly one re-run rather than a loop | R8, R11, R14 |
| The result records what it compared against | R12's opened-result line, from `started_at` |
| The runner writes `inputs` onto the result | dropped (Doug, 2026-10-11): `started_at` is the comparison; see Open Questions |

## Out of Scope

- RD-6 pass 2 (Doug, 2026-10-11): the CLUE activity listener (a second, separately named Firebase app signed in to CLUE's project, and a class using both platforms counting each learner once across the two collections), and the incremental pull, built on the runner's CLUE reader with the changed-keys map as its manifest; nothing here reads `changed` or `writeCount`. When RD-5 retires that reader, it carries the incremental pull onto `cc-data get clue-*`.
- A control to turn automatic re-runs off, or a per-package declaration of which inputs a package reads (the manifest has none; every finished, listed, runnable package re-runs on answer activity).
- Logged-in counts, which nothing can compute; the class-activity page of `final-design.md` 15.2; teacher-facing activity.
- Any change to report-service, rigse, report-server, the runner or REPORT-153's contract.
- A manifest declaration of whether a package re-runs on its own, how often, and on which sources. REPORT-172, in the backlog, gated on the first package that makes a model call and on the first CLUE package a class using both platforms would re-run on Activity Player activity. Until then every finished, listed, runnable package re-runs on answer activity. That holds for unreviewed packages too, once `unreviewed_runs` is on for RIGSE-363: an automatic re-run only repeats a package the researcher already ran by hand, as themselves and with their own storage credentials. REPORT-172's manifest value also carries an optional per-package minimum interval, for a package that is heavy or calls a model; the default is none. `clue_prepull` is not a source declaration: it names the pre-pull that RD-5 retires.
- Logs as a re-run trigger. Logs reach Athena 2 to 26 hours late and have no trigger, so a logs package re-runs only on answer activity, over logs that may not hold those actions yet, until REPORT-150's route gives logs a freshness the page can watch.
- Closing or transitioning RIGSE-360 or RIGSE-361.

## Open Questions

### RESOLVED: Does the runner still write `inputs` on the result, and if so in which pass?
**Context**: Doug scoped "the runner writing `inputs` on the result" into this pass, after `final-design.md` 14. The designed `inputs: {clue_documents, answers, logs, log_freshness_at}` cannot be what a re-run compares against: the listeners report learners' `lastActivityAt` times, not counts. The comparison the documents support is a server time at or before the pull, which the result already carries as `started_at` (Background). The runner code is RD-4 pass 2's, implemented and unmerged at `9397abd`.
**Options considered**:
- A) No runner change. The page compares with `started_at` (R7), and the opened result states it (R12).
- B) The runner records an activity watermark, `inputs: {activity_at}`, read at the claim with its class store and written with the finish (about 60 lines in RD-4 pass 2's `firestore.js`, `status.js` and `runner.js`), as an amendment before RD-4 pass 2's 2026-10-14 release or in this pass with a second release. It selects the same saves as A.
- C) The designed counts, from `counts.json` and the runner's CLUE count: comparable with nothing the listeners report.

**Decision**: A (Doug, 2026-10-11, stage 8), after checking it against the CLUE and future-package work:
- **CLUE.** `started_at` precedes every read a run makes, the runner's CLUE pre-pull (`steps.js` `pullData`, in the `pull` stage) and a package's own `cc-data get clue-*` reads once REPORT-109 to 111 and RD-5 retire the pre-pull, so it serves CLUE-693's documents as it serves REPORT-153's. CLUE's `lastActivityAt` is CLUE's project's server time; a few milliseconds of disagreement with report-service's clock can cost an extra re-run, not hide a save, since the claim precedes the read by seconds.
- **RD-6 pass 2.** A per-result `inputs` cannot serve the incremental pull: the function's queued write replaces the result whole (`run-package.ts:176`), so a re-run's claim never sees the last run's fields, and the corpus it would update incrementally is per class, not per package. Pass 2 needs a per-class "last pulled" time kept with the pulled data, and should target `cc-data get clue-*` rather than the runner's reader if REPORT-109 to 111 land first.
- **Future packages.** What a re-run should be triggered by, and whether a costly package (a model call, a long run) should re-run on its own at all, is the package author's to declare in the manifest, since the runner cannot observe what a package reads through cc-data. That is REPORT-172 (Out of Scope), which also carries an optional per-package minimum interval.

`final-design.md` 9 and 14 and RD-6's Jira text drop `inputs`, for marvin-scratch-t.

### RESOLVED: Judgment call: what counts as "behind"
**Options considered**:
- A) Any learner's `lastActivityAt` later than the result's `started_at`.
- B) Any `writeCount` that changed since the page loaded.

**Decision**: A. B misses the returning researcher (the page has nothing earlier to compare with), and REPORT-153 R5 says `writeCount` can double-count and is a change signal only. A compares two server times and needs no memory across loads.

### RESOLVED: Re-run timing, and what the page shows during a re-run
**Context**: The first version of this spec delayed a re-run 30 seconds and held it to at least 5 minutes after the last one (or the declared duration, if longer), recorded as a judgment call; #188 then credited that floor to Doug, wrongly. A floor was needed only because a re-run hid the last result until it finished.
**Options considered**:
- A) The fixed delay and floor.
- B) Coalescing: re-run as soon as a finished result is behind, and once more after a run if students saved during it; keep the last finished result visible throughout.

**Decision**: B (Doug, 2026-10-11, channel #202), with a per-package minimum interval as an optional REPORT-172 value. Then, in this session:
- **Where the last result lives** (Doug, with the recommendation): the function's queued write copies the last `done` run into `previous` (REPORT-143), and RD-3 pass 2 renders it. The page alone remembering it fails on a reload or a second tab, which with back-to-back re-runs would be common; keeping `summary` and `display` on the document through the re-run would show one version's output under another's `package`; splitting the document into a finished part and a `run` part reads more naturally but moves `status`, which the watchdog's queries and index, the rules, `/work` and every runner write key on.
- **Failed results** (Doug, with the recommendation): never re-run on their own (R7). With no floor, a package that fails every time would otherwise run on every save; the row shows the last good result, the failure and R12's out-of-date line, with Run beside it.
- **R12a is retired:** an open result no longer closes when it is re-run, so nothing holds it back.

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

## Self-Review

Stage 3, unattended. Roles: the researcher using the page, Senior Engineer (consistency with RD-3 pass 2, RD-4 pass 2, REPORT-143 and REPORT-153 as spec'd and built), QA Engineer, Security Engineer, and a WCAG accessibility reviewer. Each finding was checked against the code or the specs it cites before it was written; findings that did not survive were dropped.

### The researcher using the page

#### RESOLVED: An automatic re-run would close the result the researcher is reading
RD-3 pass 2 R15 closed the open view when its result changed, and the function's queued write replaces the result whole (`run-package.ts:176`), so an automatic request would shut the document under a researcher reading it. First fixed by holding an open result back from re-running; since #202 the last finished result stays visible through a re-run (REPORT-143's `previous`, rendered by RD-3 pass 2), which removes the cause.

### QA Engineer

#### RESOLVED: R14's test of R4 could not be written
"Changing the constant in a test build" is not something a vitest case can do with an exported `const`. Fixed in R14: the label is a function of the minutes, tested with another value, and the page's text is asserted equal to that function of the constant.
