# RD-6 pass 2: CLUE activity

**Jira**: https://concord-consortium.atlassian.net/browse/RD-6

**Status**: **Closed**

## Overview

The dashboard counts active students and re-runs finished results from the activity documents report-service writes for Activity Player answers. This pass adds the matching documents the CLUE app writes (CLUE-693), read from CLUE's own Firebase project, so a CLUE student's save counts in the same number and makes a finished result re-run exactly as an Activity Player save does. A class on both platforms shows one count in which each student appears once. Nothing changes on the runner or the portal: the dashboard signs in to CLUE's project with a second researcher token the portal already mints, and only listens. It closes RD-6.

## Requirements

### Configuration

- **R1. Each portal names its CLUE project.** `PortalConfig` names the CLUE Firebase project the portal's CLUE launches write to and the portal `firebase_apps` row that signs a token for it, as two values, since they differ in production. The staging entry in `DEPLOYED` names row `collaborative-learning-staging` and project `collaborative-learning-staging`, and `firebase.ts`'s config map holds that project's public client config (the values in CLUE's `src/lib/firebase-config.ts`). It also holds CLUE production's, project `collaborative-learning-ec215`, which no portal entry reaches until the production portal is added; that entry names row `collaborative-learning` with project `collaborative-learning-ec215`, and the field's comment states the pairing so it is not taken from the row's name. A dev portal (`devPortal`) names its CLUE project from `VITE_DEV_CLUE_FIREBASE_PROJECT` (row and project the same name), and a dev server without it, or with one equal to its report-service project, names no dev portal and logs a warning naming the variable: the app keeps one Firebase app per project id, so the second sign-in would replace the first. The local portal needs a `firebase_apps` row of that name; `app/README.md`'s dev command names the variable.
- **R2. One project per portal.** The staging portal reads CLUE staging only. Activity from an offering launched without `firebaseEnv=staging` lands in production CLUE and is not shown on the staging dashboard; `app/README.md` says so.

### Reading

- **R3. A second sign-in.** `watchClass` mints a second researcher token for the class from the same portal, with `firebase_app` set to the portal's CLUE row, `researcher=true` and the class hash (no runner claim, no new rigse endpoint), signs in to the CLUE project as its own Firebase app, named for that project, and listens to the same `activity/{class_hash}/users` path there.
- **R4. One map, each student once.** The page receives one activity map keyed by portal user id. A learner with documents in both projects is one entry, whose `lastActivityAt` is the later of the two and whose `changed` holds, per assignment key, the later of the two times. Every reader of the map (the active count and its expiry timer, the re-run loop and the out-of-date line, RD-12's per-assignment table, the Student Saves card) is unchanged and counts the merged map.
- **R5. Each source shows as it lands.** The page's activity stays undefined (showing "…", no count, no re-runs) only until either source has delivered documents. From then the page shows the merge of the sources that have, and a snapshot from either re-merges with the other's latest, so a slow or hanging source never holds the other's count, table or re-runs. The count can grow once the second source lands. While a source has not yet answered and RD-12's table shows its footnote, the footnote adds "CLUE activity is still loading, so its assignments may also show n/a." (or the same with Activity Player). CLUE is refused when its mint, sign-in or listener fails, and report-service when its activity listener is refused; a failed report-service mint, sign-in or listener start rejects the whole watch (R7).
- **R6. CLUE saves re-run results.** A CLUE save makes a finished result behind, and re-runs it, exactly as an Activity Player save does: `isBehind` compares the merged map's newest `lastActivityAt` with the result's `started_at`. No re-run code changes.

### Refusals

- **R7. A refused source.** A refused source leaves the other's numbers and re-runs in place: the count, RD-12's table and the re-run loop read the readable source alone, and the Student Saves card names what could not be read ("CLUE activity could not be read." or "Activity Player activity could not be read."). Both refused behaves as a refused activity listener did before: no count, "Class activity could not be read.", no automatic re-runs. The header count carries no note. While one source is refused and RD-12's table shows its footnote, the footnote adds a line naming the refused platform: "Activity Player activity could not be read, so its assignments may also show n/a." or the same with CLUE. RD-12's cells wait at "…" while neither source has documents and one can still answer, and say "unknown" only once no activity can arrive (both refused, or the watch failed: report-service's mint, sign-in or a listener start). The profile, runner, counts and results listeners never depend on the CLUE sign-in: a CLUE mint, sign-in or listener failure never stops or blocks them.

### Who counts

- **R8. Membership.** No filter: every document in either project counts, as pass 1 counts every REPORT-153 document. CLUE's rule accepts a write only from a learner token for this class writing its own document, and rigse mints that only for a learner of an offering of the class.

### Text

- **R9. The page says both platforms.** The Student Saves card's explanation: students who saved work in this class's Activity Player or CLUE assignments within the window.
- **R10. The prose names both writers.** `activity.ts`'s comment on `Activity`, `ClassDashboard.tsx`'s comment on the n/a footnote, `app/README.md` (the "What it reads" table's CLUE row and one Firebase token per project, the Assignments card paragraph, the writers paragraph, the active-students paragraph), and a CLUE paragraph in RD-6 pass 1's spec ("What REPORT-153 provides") and RD-12's spec (the unreadable `changed` decision, which holds because CLUE's rule also pins `changed` times to `request.time`).

### Tests and checks

- **R11. Unit tests**, each able to fail on the line it guards: the CLUE token is minted with the CLUE row and the class hash and signed in to the CLUE project (with a config whose row and project differ, so a swap fails); the CLUE listener is on the activity path in that project; the merge takes the later `lastActivityAt` and the later time per `changed` key in either order, and counts a learner on both platforms once; each source is handed on as it lands, without waiting for the other, and a source still loading is named in the footnote; one refused source keeps the other's count and names itself, and both refused remove the count; the footnote names whichever platform is refused; stopping `watchClass` stops every listener started, including a running CLUE listener when a report-service listener cannot start, and nothing CLUE-side starts when the page stops the watch while CLUE's token or sign-in is pending; a failed CLUE mint leaves the other listeners running; nothing CLUE-side starts or is refused once report-service's sign-in has failed. `no-writes.test.ts` and `csp.test.ts` pass unchanged (the CLUE project uses the same Identity Toolkit, Secure Token and Firestore hosts).
- **R12. Staging check (Done when).** On the staging dashboard, a staging student in a "(staging FB)" CLUE offering of a class edits a text tile; within seconds the header's count includes them, RD-12's row for that offering shows them, and a finished result re-runs exactly once. A student who also saved in an Activity Player assignment of the class counts once. It runs on the branch's staging build (`branch/pass-2-clue-activity/`). *(Not yet run: see Not Yet Implemented.)*

## Technical Notes

- **Files**: `app/src/shell/portals.ts` and `firebase.ts` (R1), `app/src/shell/services.ts` (R3, R5, R7), `app/src/shell/activity.ts` (`mergeActivity`, `activitySources`), `app/src/components/ClassActivity.tsx` (R9), `app/src/pages/ClassDashboard.tsx` (per-source refusals, R10), `app/README.md`, the RD-6 pass 1 and RD-12 specs, tests. No runner, rigse, CLUE or cloud change.
- **CLUE-693's contract** (collaborative-learning PR #3050, `d2b55b80d`): `activity-recorder.ts` writes `researcher_dashboard/{escapeKey(user.portal)}/activity/{user.classHash}/users/{user.id}` with a merge `set` of `lastActivityAt` and `changed.{user.offeringId}` as server timestamps and `writeCount` incremented, at most once every 5 s, after a counted change's history upload and content save land. Its rules allow writes only from a `learner` token for its own document and class, and `get, list` to a `researcher` token whose `class_hash` matches. Same path, fields and types as REPORT-153's documents.
- **Which project.** CLUE staging is row and project `collaborative-learning-staging`; CLUE production is row `collaborative-learning`, project `collaborative-learning-ec215`. The runner held the same pairing until RD-4 pass 2 deleted it (`82a3296`).
- **One student, one id.** REPORT-153 keys documents by `platform_user_id`, and CLUE-693's rule requires the document id to equal the learner token's `platform_user_id`, so a student on both platforms has one id; both projects' `{portal}` segments turn the host's dots into underscores.
- **The `started_at` argument for CLUE.** CLUE-693 writes `lastActivityAt` only after the change's history upload and content save have landed, so RD-6 pass 1's argument holds. Two CLUE writes can precede their save (the 30 s timeout while the tab is open, and `pagehide`); a run starting in between misses that change until the next save, CLUE-693's accepted cost.
- **The CLUE side runs beside report-service's.** `watchClass` starts the CLUE mint first so the two mints run side by side, and a `stopped` flag, checked after the CLUE mint and after the CLUE sign-in, keeps a watch that has stopped (or whose report-service side failed) from starting a CLUE sign-in, a listener or a refusal. A sign-in already under way when the watch stops still completes on the project's shared Firebase app; the watch restarts only for the same scope, so such a late token carries the same class and researcher.
- **Students on older CLUE builds, or launched from an offering pinned to a `/version/` URL, record nothing** (CLUE-693 R14), so their assignments show RD-12's n/a until they reach a release with the recorder.
- **Opening a CLUE document can record a save** (CLUE-693's "Entries a tile records as it opens"), so a CLUE student who opens a problem document without editing it can appear in the count once.
- **Checked on a private emulator**, with CLUE's rules at `d2b55b80d` and the app's own `signIn`, `watchCollection` and `activitySources`: two named apps sign in to report-service-dev and CLUE staging side by side; a CLUE-shaped learner write merges with a report-service document for the same student, counted once with the later save and both assignments' changes; under CLUE's `master` rules (no read rule) the CLUE source is refused and report-service's documents still arrive alone.
- **Cost.** One more token mint and Firebase sign-in per page load, and one more collection listener per open dashboard.

## Out of Scope

- The runner, rigse, CLUE and report-service: no change in any (Doug, 2026-10-14). Packages read CLUE data only through cc-data (REPORT-152).
- Production's portal entry: `DEPLOYED` holds no production portal and `firebase.ts` no `report-service-pro` config. No item in `plan.md`'s Production list or the landing tracker adds them; whichever change does names CLUE production as R1 states.
- Reading production CLUE from the staging dashboard (R2).
- Reading the `changed` map for an incremental re-run (RD-8, backlog).
- A per-package minimum interval between automatic re-runs (REPORT-172, backlog).

## Not Yet Implemented

- R12's staging check: it needs CLUE-693's rules and index deployed to CLUE staging and a CLUE build with the recorder (CLUE-693's deploy order, steps 1 and 2). Until CLUE's read rule is deployed, every CLUE read is refused, so the staging dashboard shows the Activity Player count with "CLUE activity could not be read.".

## Decisions

### Membership: filter the activity documents to known students and leave out teachers?
**Context**: The stream notes asked the CLUE listener to count only ids known to be the class's students and leave out teachers, because the trigger design CLUE-693 first had recorded teachers and unchecked uploader stamps. The client-written rule now accepts only a learner token for the class writing its own document, and the scope carries no student list.
**Options considered**:
- A) No filter, as pass 1 does for Activity Player.
- B) Drop `scope.teachers` ids: a guard against a state the rules rule out.
- C) Filter to student ids: needs a student list from rigse.

**Decision**: A (Doug, 2026-10-22). The concern went with the trigger, and both platforms are treated alike (R8).

---

### Partial reads: what the page shows when one source is refused
**Context**: With two sources, one can fail while the other works. CLUE's read rule is not deployed yet, so every CLUE read is refused until it is (checked on the emulator against CLUE's `master` rules).
**Options considered**:
- A) All or nothing: either refusal blanks the activity and stops re-runs.
- B) Partial: the readable source's numbers and re-runs stay, with a line naming what could not be read.
- C) B, with a marker on the header count.

**Decision**: B (Doug, 2026-10-22). A Wildfire class keeps its count and re-runs through a CLUE problem, and the pass can deploy before CLUE's rules do. The header count carries no note.

---

### A refused source's assignments read as having no saves
**Context**: With one source refused, that platform's assignments show n/a with "No student saves have been recorded for that assignment.", which is untrue: they could not be read.
**Options considered**:
- A) Leave it: the Student Saves card names the refusal.
- B) Add a footnote line naming the refused platform.
- C) Show "unknown" by `Assignment.tool`, whose CLUE value nothing in this repo pins.

**Decision**: B, for either platform (Doug, 2026-10-22).

---

### Production CLUE config now, or with the production portal?
**Context**: The app has no production portal, so a production CLUE entry is unreachable until one is added. The stream notes named production `collaborative-learning`, which is the portal row; the project id is `collaborative-learning-ec215`.
**Options considered**:
- A) Staging only now; production with the production portal entry.
- B) Production's client config now, unused until then.

**Decision**: B, with the pairing stated in R1 and the field's comment (Doug, 2026-10-22).

---

### Merge before the page, or two maps on the page?
**Context**: The page could hold two maps and have every reader take both.
**Options considered**:
- A) Merge before the page.
- B) Two maps on the page.

**Decision**: A. No reader needs to know which platform a save came from, and every reader and its tests stay as they were.

---

### Read only the paired CLUE project from each portal
**Context**: A staging-portal CLUE offering without `firebaseEnv=staging` writes to production CLUE.
**Options considered**:
- A) One project per portal, documented (R2).
- B) Read both CLUE projects from staging: a third sign-in and production data on a staging page.

**Decision**: A. It is the pairing the runner used, and the staging offerings meant for Firebase work carry the parameter.

---

### Show each source as it lands, or hold the first count until both answer
**Context**: The two first snapshots arrive at different times. Holding the count until both answered (a refusal counting as an answer) meant a CLUE step that hangs without failing (the token request, the sign-in or the first snapshot, none with a time limit) held the Activity Player count, table and re-runs at "…" (Ethan McElroy's review of #11).
**Options considered**:
- A) Hold until both answer, and accept the hang.
- B) After a timeout, show Activity Player's numbers with a "still waiting for CLUE" note.
- C) After a timeout, treat CLUE as refused.
- D) Show each source as it lands, naming a source still loading in RD-12's footnote (R5).

**Decision**: D (Doug, 2026-10-23). It removes the hang with no timer. A partial map can delay a re-run but never cause a wrong one, since its newest save is never later than the full map's. The cost is a count that can grow when the second source lands, and the footnote line covers the n/a that a still-loading source's assignments show meanwhile.

---

### "…" or "unknown" in RD-12's cells while one source is refused
**Context**: One refusal sets the problem line while the other source may still answer, so reading "unknown" from the problem line showed "unknown" and then numbers.
**Options considered**:
- A) Read "unknown" from the problem line.
- B) Read it from the refusals and the sign-in failure.

**Decision**: B. The cells wait at "…" until no activity can arrive.

---

### The CLUE sign-in runs beside report-service's, not after it
**Context**: `watchClass` could mint and sign in to CLUE after report-service's listeners start, or alongside.
**Options considered**:
- A) Side by side, CLUE's chain started first and cut off by `stopped`.
- B) Sequentially after report-service's.

**Decision**: A. Neither mint waits on the other.

---

### Derive the page's activity from the refusals rather than clear it on refusal
**Context**: The page must know whether both sources are refused.
**Options considered**:
- A) Hold the refused sources and derive the map and the problem line from them.
- B) Clear the map from inside a state updater when the second is refused.

**Decision**: A. No side effect in an updater, and the problem line and the map cannot disagree.

---

### The merge keeps Firestore Timestamps
**Context**: The merge could convert to milliseconds or keep the `Stamp` values.
**Options considered**:
- A) Keep `Stamp`s, comparing with `millis`.
- B) Convert to numbers.

**Decision**: A. Every reader takes `Stamp`s through `millis`, so the merged map has the documents' shape.

---

### Which CLUE pairing the services tests use
**Context**: Staging's row and project share a name, so a test config built from them cannot tell a swap of the two apart.
**Options considered**:
- A) Staging's pairing.
- B) Production's pairing, whose row and project differ.

**Decision**: B. A swap of the row and the project fails the tests; `launch.test.ts` guards `DEPLOYED`'s staging values.
