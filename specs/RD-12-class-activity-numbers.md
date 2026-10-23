# The class's activity numbers on the Info tab

**Jira**: https://concord-consortium.atlassian.net/browse/RD-12

**Status**: **Closed**

## Overview

The Info tab shows, for each of the class's assignments, how many students have saved work in it and when it last changed, and the Student Saves card shows how many students have saved work and when the latest save was. The numbers come from the activity documents the page already listens to, and an assignment with no recorded saves says "n/a" rather than a misleading zero.

## Requirements

### What is read

- **R1. No new read.** The numbers come from the activity documents the page already listens to, including their `changed` maps. No new listener, request, token or Firestore write; `app/tests/no-writes.test.ts` passes unchanged and the CSP is unchanged.
- **R2. Per assignment.** For each assignment in `scope.assignments`, its students are the learners whose `changed` map has a time under that assignment's `offering_id` (as a string key), and its last change is the latest of those times. `writeCount` is not read.

### The Assignments card

- **R3. A table.** The Assignments card shows a table with the columns "Assignment", "Students who saved work" and "Last change", one row per assignment in the scope's order. The first column is the assignment's name ("Untitled" when it has none) and its tool (" · Activity Player" for `ActivityPlayer`, otherwise the tool as given), as the list showed them. The last change uses `Time`, capitalized, with the full date and time as its tooltip.
- **R4. Before the numbers are known.** Before the first activity snapshot, both activity columns show "…". When the activity listener is refused (Student Saves already says "Class activity could not be read."), both show "unknown".
- **R5. n/a.** An assignment with no learner who has a recorded save in it shows "n/a" in both activity columns, never 0. Each "n/a" has the title "No student saves have been recorded for that assignment." and no underline. Whenever at least one row shows "n/a", a footnote under the table reads "**n/a**: No student saves have been recorded for that assignment." With every assignment showing numbers, there is no footnote.

### The Student Saves card

- **R6. Two lines once anything is recorded.** When the class has at least one activity document, the card shows "Students who have saved work" (the number of documents) and "Latest save" (the newest `lastActivityAt`, through `Time`, capitalized; "unknown" when no document has a readable one) above its existing text. With no documents, the card shows only its existing text.

### Behavior

- **R7. Live, not announced.** The numbers change with each activity snapshot, as the active count does, and are not in a live region.
- **R8. Nothing else changes.** The header, the active count, Current Status, automatic re-runs and the Analytics tab are unchanged.

### The demo, the docs and the tests

- **R9. Demo scenarios.** The base scenario's learners have `changed` maps across both demo assignments, with every last save at least 45 minutes old, so nobody is active. New scenarios: "A past class" (last saves about 40 days ago), "A class from before activity was recorded" (no activity documents), and "One assignment from before activity was recorded" (saves in the first assignment only). "Student saves" marks a random assignment as changed for the learner it saves.
- **R10. README.** "What it reads" says each learner's activity document gives the server time of their last save and of their last change in each assignment. "Active students and automatic re-runs" gains a paragraph on the Assignments card's numbers, what "n/a" means, and that only Activity Player saves are recorded until the CLUE listener is added.
- **R11. Tests.** A unit test of the per-assignment numbers with learners whose times differ per assignment (so keeping the last time seen, or counting every learner, fails it), a missing `changed`, and a `changed` without the assignment's key. Dashboard tests: the table's rows and columns from a snapshot; "…" before it and "unknown" after a refusal; "n/a" on exactly the assignments with no saves, with its title, and the footnote only then; no footnote when every assignment has saves; the Student Saves lines with documents and their absence without. The two existing tests that read the assignment list ("shows the class, its teachers, cohorts and assignments", "names an untitled assignment") read the table's first column instead.
- **R12. Staging check (Done when).** *(Not run yet: it waits on Doug's go once the branch build is up.)* On staging, the Researcher Dashboard Wildfire class's Info tab shows, for its Activity Player assignment, the number of students who have saved work since recording began and the time of the last change; a test student's save raises the number or moves the time without a reload; an assignment nobody has saved in since recording began shows "n/a" with its footnote; and the Student Saves card's two lines match. Asserted by tests.

## Technical Notes

- **Files.** `app/src/shell/activity.ts` (`Activity` gains `changed`; `assignmentActivity`), `app/src/pages/ClassDashboard.tsx` (the table), `app/src/components/ClassActivity.tsx` (the two lines), `app/src/styles.css`, `app/demo/scenarios.ts`, `app/demo/world.ts`, `app/README.md`, tests.
- **Server times.** Every time shown is the server's, from the trigger. The page compares none of them with its own clock.
- **The 500-key cap.** A learner whose `changed` map is full gains no new assignment key, so a class with more than 500 assignments could undercount the later ones. Real classes have tens.
- **"n/a" covers two cases** that the page cannot tell apart: nobody has saved in the assignment since recording began, and the work was saved only before recording began. The footnote's wording is true of both.

## Out of Scope

- The log count: REPORT-150's route, its `count_only` form, and any change to the Current Status card's Logs lines.
- A total of saves or actions: `writeCount` is not a count.
- A "recorded since" date, or backfilling activity documents for work saved before the triggers were deployed.
- CLUE activity: RD-6 pass 2's listener. When it lands, these numbers include CLUE learners with no change here, provided CLUE-693's `changed` keys are offering ids as REPORT-153's are.
- Per-student activity, or activity by page or question.

## Not Yet Implemented

- The staging check (R12): not run. It needs the branch build's URL on the staging Researcher Dashboard client's redirect URIs and the Researcher Dashboard external report, on Doug's go, put back to `branch/main` afterward.

## Decisions

### Drop the live log count and show the activity numbers instead
**Context**: RD-12 was filed on 2026-10-18 as the page's live log count from REPORT-150's recent-logs route, to meet RIGSE-360's "Number of log records accessible" and "the log count should increase". The route counts only 00:00 UTC yesterday onward, so a past class would read 0, and the page's existing Logs number is frozen at a class's first analysis (`class-counts` and `ap-counts` reuse their first Student Actions run).
**Options considered**:
- A) The live log count, labeled as recent.
- B) Drop RD-12 altogether.
- C) Turn RD-12 into the display of the activity numbers, which no story covered.

**Decision**: C (Doug, 2026-10-21). The log line was how the team expected to detect activity before activity was recorded; REPORT-153's and CLUE-693's activity documents now do that, and the page read only `lastActivityAt`, for the five-minute count.

---

### Where the numbers go
**Context**: The Info tab has Assignments and Student Saves cards already.
**Options considered**:
- A) A new card.
- B) The Assignments card as a table, plus two lines in Student Saves.

**Decision**: B (prototype on the demo page, accepted by Doug).

---

### What an assignment with nothing recorded shows
**Context**: Activity is recorded only from the day a trigger was deployed (REPORT-153 on staging since 2026-10-16, not yet in production), so a class or assignment worked on before then has no activity documents, and a 0 would read as "nobody worked on this".
**Options considered**:
- A) A per-portal "recorded since" date in the headers.
- B) A one-time backfill of activity documents from existing answers.
- C) Drop the columns when the class has no documents.
- D) Keep the columns and show "n/a" with a title and a footnote.

**Decision**: D (Doug). C was tried on the demo page first and replaced.

---

### n/a per class or per assignment
**Context**: One assignment can have recorded saves while another was worked on only before recording began.
**Options considered**:
- A) n/a only when the class has no documents.
- B) n/a for each assignment with no recorded save.

**Decision**: B (Doug).

---

### How n/a looks
**Context**: The first version showed "N/A" with a dotted underline and a two-sentence explanation.
**Options considered**:
- A) "N/A", dotted underline, the longer text.
- B) Lowercase "n/a", no underline, one sentence.

**Decision**: B (Doug): "No student saves have been recorded for that assignment.", as both the title and the footnote.

---

### Student Saves lines with no documents
**Context**: With no activity documents the two new lines would read 0 and unknown.
**Options considered**:
- A) Show them with n/a.
- B) Hide them.

**Decision**: B (prototype, accepted by Doug).

---

### What the columns show after a refused listener
**Context**: Found in review of the prototype: a refused activity listener leaves the activity undefined, so the columns would show "…" for the page's life.
**Options considered**:
- A) Keep "…".
- B) "unknown", beside Student Saves' "Class activity could not be read."

**Decision**: B (R4).

---

### The list's CSS
**Context**: The Assignments card's `.info-card .assignments` rules are unused once it is a table.
**Options considered**:
- A) Leave them.
- B) Delete them, place the table's rules with the Info card's, and keep the list's row hover tint.

**Decision**: B.

---

### Testing an unreadable `changed` time
**Context**: The spec first asked for a test with an unreadable `changed` value. Building it showed `millis` throws on a value that is not a Firestore Timestamp, and that no such value can exist: only REPORT-153's trigger writes `changed`, always as server timestamps, and no client may write the documents.
**Options considered**:
- A) Guard `assignmentActivity` against non-Timestamp values.
- B) Test a `changed` without the assignment's key instead.

**Decision**: B. A guard for a value the rules make impossible would be dead code. RD-6 pass 2 adds CLUE's app as a second writer, in CLUE's project; its rule also requires every `changed` time to equal `request.time`, so the decision holds.

---

### Test fixtures that can fail
**Context**: A fixture with one time for every learner cannot tell keeping the last time seen from keeping the latest, and a test that only shows n/a cannot catch a footnote shown unconditionally.
**Options considered**:
- A) Simple fixtures.
- B) Times that differ per learner and per assignment, and a dashboard snapshot with no n/a.

**Decision**: B. Six mutations (the last time seen instead of the latest, counting every learner, the footnote always shown, no "unknown", the Student Saves lines always shown, 0 in place of n/a) each fail the suite.

---

### n/a for keyboard and touch users
**Context**: A title attribute cannot be reached by keyboard or touch.
**Options considered**:
- A) The title alone.
- B) The title and a visible footnote with the same text.

**Decision**: B.
