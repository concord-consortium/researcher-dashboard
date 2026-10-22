# RD-6 pass 2: CLUE activity

**Jira**: https://concord-consortium.atlassian.net/browse/RD-6
**Repo**: https://github.com/concord-consortium/researcher-dashboard
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

The dashboard counts active students and re-runs finished results from the activity documents report-service writes for Activity Player answers. This pass adds the matching documents the CLUE app writes (CLUE-693), read from CLUE's own Firebase project, so a CLUE student's save counts in the same number and makes a finished result re-run exactly as an Activity Player save does.

## Project Owner Overview

RD-6 pass 1 gave the dashboard a live "active in the last 5 minutes" count, per-assignment activity (RD-12) and automatic re-runs, but only for Activity Player work, because only report-service recorded activity. CLUE-693 makes the CLUE app record the same per-student document in CLUE's own Firebase project after each saved change. This pass has the dashboard read those documents too and fold them into the same numbers, so a class using CLUE, or both platforms, shows one count in which each student appears once.

Nothing changes on the runner or the portal. The dashboard signs in to CLUE's Firebase project with a second researcher token the portal already knows how to mint, and only listens. It closes RD-6.

## Background

**Pass 1, as built** (`specs/RD-6-pass-1-activity-and-rerun.md`, extended by RD-12 at this branch's base `b9a72f5`). `DashboardServices.watchClass` (`app/src/shell/services.ts`) mints one researcher Firebase token for the class from the portal (`portal.firebaseToken(config.firebaseProject, class_hash)`, which calls `GET /api/v1/jwt/firebase?firebase_app=<row>&class_hash=<hash>&researcher=true`), signs in to report-service's project as a Firebase app named for that project (`signIn` in `app/src/shell/firebase.ts`), and starts five listeners, the fifth on `researcher_dashboard/{portal}/activity/{class_hash}/users`. The page holds the result as `activity: Map<string, Activity>` keyed by document id, and everything downstream reads that one map: `activeCount` and `nextChangeIn` (the header's count), `newestActivity` with `isBehind`, `behindRows` and `outOfDate` (the re-run loop), `assignmentActivity` (RD-12's per-assignment table) and the Student Saves card (`ClassActivity.tsx`).

**CLUE-693, as built** (collaborative-learning PR #3050, head `d2b55b80d`, closed spec `specs/CLUE-693-the-client-written-activity-document.md`, read-only here). The CLUE app writes `researcher_dashboard/{escapeKey(user.portal)}/activity/{user.classHash}/users/{user.id}` in CLUE's Firestore with a merge `set` of `lastActivityAt` and `changed.{offeringId}` as server timestamps and `writeCount` incremented, after a counted change's history upload and RTDB content save both land, at most once every 5 seconds. Its rules (`firestore.rules` lines 833 to 857 at `d2b55b80d`) allow `create, update` only to a `learner` token whose `platform_user_id` equals the document id, whose `class_hash` equals the path's and whose `platform_id` host equals the `{portal}` segment, and allow `get, list` to any `researcher` token whose `class_hash` matches. Nothing deletes a document. Same path, same field names and types as REPORT-153's documents in report-service's project.

**Which project.** CLUE has two Firebase projects, chosen per launch by the `firebaseEnv` URL parameter (`src/lib/firebase-config.ts` at `d2b55b80d`):

| CLUE environment | Portal `firebase_apps` row | Firebase project id |
|---|---|---|
| staging (`firebaseEnv=staging`) | `collaborative-learning-staging` | `collaborative-learning-staging` |
| production (the default) | `collaborative-learning` | `collaborative-learning-ec215` |

The row name and the project id differ in production. The runner held this same pairing in `runner/server/firebase-projects.js` until RD-4 pass 2 deleted it (`82a3296`), with report-service-dev paired to CLUE staging and report-service-pro to CLUE production. A CLUE offering launched from the staging portal without `firebaseEnv=staging` writes its activity to production CLUE (the spike's criterion 10 note: only the staging offerings named "(staging FB)" carry the parameter).

**One student, one id.** REPORT-153 keys each document by the answer's `platform_user_id`; CLUE-693's rule requires the document id to equal the learner token's `platform_user_id`. Both are the portal user id, so a student who works on both platforms has the same document id in both projects, and the `{portal}` segments agree (CLUE's `escapeKey` and the dashboard's `portalSegment` both turn the host's dots into underscores).

**Verified on an emulator** (throwaway, deleted): a private Firestore and Auth emulator running CLUE's rules at `d2b55b80d`, the Firebase web SDK 10.14.1 the app uses, and unsigned custom tokens with the claims rigse mints (`FirebaseTokenClaims.identity` plus `user_type: "researcher"` and `class_hash`). Two named apps in one process signed in to two project ids with separate in-memory auth; the CLUE app's listener on the class's `users` collection delivered an empty snapshot on attach, then a learner's write (a CLUE-693-shaped merge `set` under a `learner` token) arrived as a second snapshot, while the other app stayed signed in; a researcher token for another class was refused with `permission-denied`.

**What the rest of the code assumes.** `activity.ts`'s header comment, RD-6 pass 1's spec ("What REPORT-153 provides", and the `started_at` argument), RD-12's spec (its "Testing an unreadable `changed` time" decision says only REPORT-153's trigger writes `changed` and no client may write the documents), `app/README.md` ("What it reads", and "Every one is written by report-service's functions, the runner or the watchdog"), the Student Saves card ("saved an answer in this class's Activity Player assignments") and `ClassDashboard.tsx`'s n/a comment ("since its trigger was deployed") all say or assume report-service is the only writer. The CLUE research (clue-activity #838) asked for a CLUE paragraph in each.

## Requirements

### Configuration

- **R1. Each portal names its CLUE project.** `PortalConfig` names the CLUE Firebase project the portal's CLUE launches write to and the portal `firebase_apps` row that signs a token for it, as two values, since they differ in production. The staging entry in `DEPLOYED` names row `collaborative-learning-staging` and project `collaborative-learning-staging`, and `firebase.ts`'s config map gains that project's public client config (the values in CLUE's `firebase-config.ts`). It also gains CLUE production's, project `collaborative-learning-ec215`, which no portal entry reaches until the production portal is added; that entry names row `collaborative-learning` with project `collaborative-learning-ec215`, and R1's field comment states the pairing so it is not taken from the row's name. A dev portal (`devPortal`) names its CLUE project from the environment the way it names report-service's (row and project the same name, as `VITE_DEV_FIREBASE_PROJECT` is today), and a dev server without it names no dev portal, as today when any value is missing. Nor does one whose CLUE project equals its report-service project: the app keeps one Firebase app per project id, so the second sign-in would replace the first. The local portal then needs a `firebase_apps` row of that name, as it does for report-service's; `app/README.md`'s dev command names the variable.
- **R2. One project per portal.** The dashboard reads one CLUE project per portal: the staging portal reads CLUE staging only. Activity from an offering launched without `firebaseEnv=staging` lands in production CLUE and is not shown on the staging dashboard; `app/README.md` says so.

### Reading

- **R3. A second sign-in.** `watchClass` mints a second researcher token for the class from the same portal, with `firebase_app` set to the portal's CLUE row, `researcher=true` and the class hash (no runner claim, no new rigse endpoint), signs in to the CLUE project as its own Firebase app, named for that project and separate from report-service's, and listens to the same `activity/{class_hash}/users` path there.
- **R4. One map, each student once.** The page still receives one activity map keyed by portal user id. A learner with documents in both projects is one entry, whose `lastActivityAt` is the later of the two and whose `changed` holds, per assignment key, the later of the two times. A learner in one project only is that document. Every reader of the map (the active count and its expiry timer, the re-run loop and the out-of-date line, RD-12's per-assignment table, the Student Saves card) is unchanged and counts the merged map.
- **R5. The map arrives when both sources have.** The page's activity stays undefined (showing "…", no count, no re-runs) until each source has delivered its first snapshot or been refused (its mint, sign-in or listener failed), so the first count never shows one platform's students and then jumps. After that, a snapshot from either source re-merges with the other's latest.
- **R6. CLUE saves re-run results.** A CLUE save makes a finished result behind, and re-runs it, exactly as an Activity Player save does: `isBehind` compares the merged map's newest `lastActivityAt` with the result's `started_at`. No re-run code changes.

### Refusals

- **R7. A refused source.** A refused source (its mint, sign-in or listener failed) leaves the other's numbers and re-runs in place: the count, RD-12's table and the re-run loop read the readable source alone, and the Student Saves card names what could not be read ("CLUE activity could not be read." or "Activity Player activity could not be read."). Both refused behaves as a refused activity listener does today: no count, "Class activity could not be read.", no automatic re-runs. The header count carries no note. While one source is refused and RD-12's table shows its footnote, the footnote adds a line naming the refused platform: "Activity Player activity could not be read, so its assignments may also show n/a." or the same with CLUE. The profile, runner, counts and results listeners never depend on the CLUE sign-in: a CLUE mint, sign-in or listener failure never stops or blocks them.

### Who counts

- **R8. Membership.** No filter: every document in either project counts, as pass 1 counts every REPORT-153 document. CLUE's rule accepts a write only from a learner token for this class writing its own document, and rigse mints that only for a learner of an offering of the class.

### Text

- **R9. The page says both platforms.** The Student Saves card's explanation names both: students who saved work in this class's Activity Player or CLUE assignments within the window. Text that says "answer" where a CLUE save is meant says "work".
- **R10. The prose names both writers.** `activity.ts`'s comment on `Activity`, `ClassDashboard.tsx`'s comment on the n/a footnote, `app/README.md`'s "What it reads" table (a CLUE row: the class's learner activity in the portal's CLUE project; the portal row's Firebase token becomes one per project), its Assignments card paragraph ("Only Activity Player saves are recorded until the CLUE listener is added") and its "The app writes none of the Firebase documents" paragraph (the CLUE app writes the CLUE documents), and a CLUE paragraph in RD-6 pass 1's spec ("What REPORT-153 provides") and RD-12's spec (the unreadable `changed` decision: CLUE's rule also pins `changed` times to `request.time`, so the decision holds) say that CLUE's app writes the same documents in CLUE's project.

### Tests and checks

- **R11. Unit tests**, each named for the line it guards: the CLUE token is minted with the CLUE row and the class hash and signed in to the CLUE project; the CLUE listener is on the activity path in that project; the merge takes the later `lastActivityAt` and the later time per `changed` key, and counts a learner on both platforms once; the map stays undefined until both first snapshots; one refused source keeps the other's count and names itself, and both refused remove the count (R7); stopping `watchClass` stops all six listeners; a failed CLUE mint leaves the other listeners running. `no-writes.test.ts` and `csp.test.ts` pass unchanged (the CLUE project uses the same Identity Toolkit, Secure Token and Firestore hosts, so the CSP needs no new host).
- **R12. Staging check (Done when).** On the staging dashboard, a staging student in a "(staging FB)" CLUE offering of a class edits a text tile; within seconds the header's count includes them, RD-12's row for that offering shows them, and a finished result re-runs exactly once. A student who also saved in an Activity Player assignment of the class counts once. It runs on this branch's staging build (`branch/pass-2-clue-activity/`, since the deploy action drops the Jira key), and needs CLUE-693's rules and index deployed to CLUE staging and a CLUE build with the recorder (CLUE-693's deploy order, steps 1 and 2).

## Technical Notes

- **Files**: `app/src/shell/portals.ts` (R1), `app/src/shell/firebase.ts` (R1's client config), `app/src/shell/services.ts` (R3, R5, R7), `app/src/shell/activity.ts` (R4's merge, R10's comment), `app/src/components/ClassActivity.tsx` (R9), `app/src/pages/ClassDashboard.tsx` (R7's page state, R10's comment), `app/README.md` (R2, R10), the two closed specs (R10), tests. Nothing outside `app/` and `specs/`. No runner, rigse, CLUE or cloud change.
- **The `started_at` argument for CLUE.** CLUE-693 writes `lastActivityAt` only after the change's history upload and content save have landed, so a package read after `started_at` sees the change, and the argument RD-6 pass 1 makes for REPORT-153 holds. Two CLUE writes can precede their save: the 30 s timeout while the tab is open, and `pagehide`. A run that starts between such a write and its save misses that change until the next save; this is CLUE-693's accepted cost, and no CLUE package reads CLUE data before REPORT-110 and REPORT-152 anyway. `lastActivityAt` and `started_at` are server times from two Google projects.
- **Who writes CLUE documents.** Only a `learner` token whose `class_hash` is this class's: the portal mints that only for a learner of an offering of the class (`jwt_controller.rb` `firebase`, `learner.offering.clazz.class_hash`), and a teacher cannot hold a learner in their own class without also being a portal student (`students_controller.rb` refuses a class sign-up while signed in as a teacher).
- **Students on older CLUE builds, or launched from an offering pinned to a `/version/` URL, record nothing** (CLUE-693 R14), so their assignments show RD-12's n/a until they reach a release with the recorder. The existing footnote ("No student saves have been recorded for that assignment.") stays true.
- **Opening a CLUE document can record a save.** Tiles that change a document as it opens (a backfilled text tile title, a row height) record entries CLUE-693 counts (its decision "Entries a tile records as it opens"), so a CLUE student who opens a problem document without editing it can appear in the count once. The Student Saves card's "A student reading or thinking saves nothing" stays true of reading after the open.
- **Cost.** One more token mint and Firebase sign-in per page load, and one more collection listener per open dashboard. The CLUE collection holds at most one small document per learner of the class.

## Out of Scope

- The runner, rigse, CLUE and report-service: no change in any (Doug, 2026-10-14). Packages read CLUE data only through cc-data (REPORT-152).
- Production's portal entry: `DEPLOYED` holds no production portal and `firebase.ts` no `report-service-pro` config. No item in `plan.md`'s Production list or the landing tracker adds them; whichever change does names CLUE production as R1 states.
- Reading production CLUE from the staging dashboard (R2).
- Reading the `changed` map for an incremental re-run (RD-8, backlog).
- A per-package minimum interval between automatic re-runs (REPORT-172, backlog).

## Open Questions

### RESOLVED: Membership: filter the activity documents to known students and leave out teachers?
**Context**: The stream notes (landing tracker 10.3, from CLUE-693's first spec, #260 and #262) ask that the CLUE listener count only ids known to be the class's students and leave out the class's teachers, because a `uid` in the activity collection was not proof of membership. That was true of the trigger design, which recorded teachers and unchecked uploader stamps. CLUE-693's client-written rule now accepts only a `learner` token for this class writing its own document (Technical Notes, "Who writes CLUE documents"). The app has no list of the class's students: the portal's scope carries `teachers` (with portal user ids) but no students, and pass 1 counts every Activity Player document unfiltered.
**Options considered**:
- A) No filter: the rules prove each CLUE document is a learner of the class, as REPORT-153's trigger does for Activity Player, and both platforms are treated alike.
- B) Drop the ids in `scope.teachers` from the merged map on both platforms: cheap, but a guard against a state the rules make impossible.
- C) Filter to the class's student ids: needs a student list in rigse's scope endpoint, outside this pass's app-only scope.

**Recommendation**: A. The concern the note answered is gone with the trigger, and B would be the kind of guard RD-12 declined for a state the rules rule out.

**Decision**: A (Doug, 2026-10-22). The guard answered the trigger design, which recorded teachers and unchecked uploader stamps; CLUE-693's client-written rule now refuses both, and both platforms are treated alike (R8).

### RESOLVED: Partial reads: what the page shows when one source is refused
**Context**: Today a refused activity listener blanks the count, the Student Saves card and RD-12's table ("Class activity could not be read.") and stops automatic re-runs. With two sources, one can fail while the other works: CLUE's read rule (`1e9c2dfe1`) ships in PR #3050 and is not yet deployed, so until CLUE staging's rules deploy, every CLUE read is refused, and a portal without the CLUE row refuses the mint.
**Options considered**:
- A) All or nothing: either refusal makes the whole activity unreadable. Never shows a number missing a platform, but this pass then must deploy after CLUE-693's rules, and a CLUE outage also hides Activity Player activity and stops its re-runs.
- B) Partial: show the readable source's numbers and keep its re-runs, with a line naming what could not be read ("CLUE activity could not be read." or "Activity Player activity could not be read."). The page can ship before CLUE's rules deploy. The line shows where the activity problem shows today, the Info tab's Student Saves card; the header count on the Analytics tab carries no note.
- C) B, with a marker on the header count while a source is refused.

**Recommendation**: B. A Wildfire class should not lose its count and re-runs to a CLUE problem, and the named line keeps the partial number from passing for the whole.

**Decision**: B (Doug, 2026-10-22). A Wildfire class keeps its count and re-runs through a CLUE problem, and the pass can deploy before CLUE-693's rules reach CLUE staging (a CLUE read under CLUE's `master` rules is refused with `permission-denied`, checked on the emulator). A marker on the header count (option C) was not taken.

### RESOLVED: Production CLUE config now, or with the production portal?
**Context**: The stream notes say the app needs CLUE's Firebase settings per environment, staging and production. The app has no production portal: `DEPLOYED` holds only the staging portal, and `firebase.ts`'s config map holds only `report-service-dev` (no `report-service-pro`). A production CLUE entry would be unreachable until RD-1 production adds the production portal. The notes also name production as `collaborative-learning`, which is the portal row; the project id is `collaborative-learning-ec215`.
**Options considered**:
- A) Staging only now; the production portal entry (RD-1 production) adds row `collaborative-learning` with project `collaborative-learning-ec215` and its client config, beside `report-service-pro`'s.
- B) Add production CLUE's client config now, unused until the production portal entry.

**Recommendation**: A. It follows `report-service-pro`'s absence, and keeps the production pairing (row and project id differ) with the change that can test it.

**Decision**: B, with the pairing stated in R1 (Doug, 2026-10-22). CLUE production's client config goes in now; the row and project id differ, so R1 and the field's comment name both, and the production portal entry, which holds the row, comes with production.

### RESOLVED: Judgment call: merge in the services layer, or keep two maps on the page?
**Context**: The page could hold two activity maps and have every reader take both, or receive one merged map.
**Options considered**:
- A) Merge before the page: every reader and its tests stay as they are.
- B) Two maps on the page: each reader learns about platforms.

**Decision**: A. No reader needs to know which platform a save came from; R4's merge is one pure function.

### RESOLVED: Judgment call: read only the staging CLUE project from the staging portal
**Context**: A staging-portal CLUE offering without `firebaseEnv=staging` writes to production CLUE.
**Options considered**:
- A) One project per portal, documented (R2).
- B) Read both CLUE projects from the staging portal: a third sign-in, a staging portal minting tokens for production CLUE, and production data on a staging page.

**Decision**: A. It is the pairing the runner used (report-service-dev with CLUE staging), and the staging test offerings meant for Firebase work carry the parameter.

### RESOLVED: Judgment call: hold the first count until both sources arrive
**Context**: The two listeners' first snapshots arrive at different times.
**Options considered**:
- A) Wait for both (R5).
- B) Show whichever arrives first and update.

**Decision**: A. B would show a smaller count, and could request a re-run from a partial newest time, for the fraction of a second before the second snapshot.

## Self-Review

Roles: Senior Engineer, Security Engineer, QA Engineer, DevOps Engineer, Education Researcher, WCAG Accessibility Expert. Each finding was checked against the code at `b9a72f5` and CLUE at `d2b55b80d`; those that did not hold were dropped.

### Senior Engineer

#### RESOLVED: R5 never settles when a source is refused
R5 held the map until both first snapshots, but a refused source never delivers one (`onSnapshot` ends after its error callback), so a CLUE refusal would leave the count at "…" forever. R5 now settles on a first snapshot or a refusal.

### DevOps Engineer

#### RESOLVED: the dev portal needs a CLUE row
`devPortal` (`portals.ts`) returns null when any of its variables is missing, and `app/README.md`'s dev command names only three. R1 now names the CLUE variable, the local `firebase_apps` row it needs, and the README line.

### QA Engineer

#### RESOLVED: where R12 runs
R12 named no build. It runs on the branch's staging deploy, whose path drops the Jira key (`s3-deploy-action`).

### Education Researcher

#### RESOLVED: opening a CLUE document counts
CLUE-693 counts entries tiles record as a document opens (its decision A on that question), so "saved work" includes one save on opening. A Technical Note says so; the card's wording stays, since it is about reading after the open.

### Security Engineer

No finding. The CLUE row comes from the build's allowlisted `PortalConfig`, never a parameter, and the mint goes to the same allowlisted portal origin with the same bearer; rigse's `class:researcher-read` context check applies to it as to the first mint. The app still imports no Firestore write.

### WCAG Accessibility Expert

No finding. R9 changes only text in an existing paragraph; the count stays out of a live region, and a refusal line goes in the card's existing `aria-live="polite"` region.

A second pass (Education Researcher, Technical Writer) checked its findings against `0983be1` with the plan's page changes applied as throwaway code, then reverted.

### Education Researcher (second pass)

#### RESOLVED: a refused source's assignments read as having no saves
Under R7, with CLUE refused, the merged map holds only Activity Player documents, so RD-12's table shows n/a for every CLUE assignment and the footnote says "No student saves have been recorded for that assignment." (`ClassDashboard.tsx`: `unrecorded` and `NotRecorded` read only the map). Checked on the throwaway build with a CLUE-tool assignment: `["n/a", "n/a"]` and the footnote, beside "CLUE activity could not be read." in the Student Saves card. A researcher reading the table alone would take the CLUE assignment as untouched. It changes what R7's settled partial read shows.
- A) Leave it: the Student Saves card on the same tab names the refused source.
- B) While a source is refused, the footnote adds "Assignments on a platform whose activity could not be read also show n/a."
- C) Show "unknown" for the refused platform's assignments, by `Assignment.tool`. Needs the tool value CLUE assignments carry, which nothing in this repo pins (only `"ActivityPlayer"` appears).

**Decision**: B, for either platform (Doug, 2026-10-22): the footnote names the refused platform, Activity Player or CLUE, since either refusal turns that platform's assignments into n/a (R7).

### Technical Writer

#### RESOLVED: R10 missed two README lines
R10 named the "What it reads" CLUE row and the writers paragraph, but not the Assignments card paragraph ("Only Activity Player saves are recorded until the CLUE listener is added", false once this pass lands) or the portal row's single Firebase token. R10 now names both.
