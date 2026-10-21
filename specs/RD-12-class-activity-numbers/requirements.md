# The class's activity numbers on the Info tab

**Jira**: https://concord-consortium.atlassian.net/browse/RD-12
**Repo**: https://github.com/concord-consortium/researcher-dashboard
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

The Info tab shows, for each of the class's assignments, how many students have saved work in it and when it last changed, and the Student Saves card shows how many students have saved work and when the latest save was. The numbers come from the activity documents the page already listens to, and an assignment with no recorded saves says "n/a" rather than a misleading zero.

## Project Owner Overview

RIGSE-360 asks for a page that shows the class is working: a log count that increases as students act was how we first expected to know about activity, before the dashboard recorded it. Activity is now recorded directly (REPORT-153 for Activity Player saves, CLUE-693 for CLUE), and the header shows how many students saved in the last five minutes. That number is only useful while a lesson runs: on any other day it reads 0. This story puts the rest of what is recorded on the Info tab, so a researcher opening a class on any day can see which assignments students have worked in, how many, and how recently.

Activity has been recorded only since the triggers were deployed, so a class, or an assignment, whose students worked before then has nothing recorded. Such an assignment shows "n/a" with a footnote, never a zero that would read as "nobody worked on this".

## Background

- **Why the story changed (Doug, 2026-10-21).** RD-12 was filed on 2026-10-18 as the page's live log count, read from REPORT-150's recent-logs route, to meet RIGSE-360's "Number of log records accessible" and "Any time a new action is taken in a document the log count should increase". Speccing it showed the route's count covers only 00:00 UTC yesterday to now, so a researcher opening a past class would see 0, and that the log line was how the team expected to detect student activity before activity was recorded. Doug dropped the log count and turned the story into the display of the activity numbers, which no story covered: RD-6 pass 1 reads only `lastActivityAt`, and only for the five-minute count.
- **What the page already reads.** RD-6 pass 1's listener on `researcher_dashboard/<portal>/activity/<class hash>/users` in report-service's Firestore (`app/src/shell/services.ts`), one document per learner, written by REPORT-153's trigger. Each document has `lastActivityAt` (server time of the learner's most recent counted save), `writeCount` (a change signal only: REPORT-153's README says a retried delivery can count one save twice, so it is never shown as a number) and `changed`, a map from each assignment's portal offering id (the answer's `resource_link_id`) to when the learner last changed it, which takes no new key once it holds 500.
- **The Info tab today (RD-9).** Cards for Analyses, Class, Assignments (a list of each assignment's name and tool), Current Status and Student Saves (`ClassDashboard.tsx`, `ClassActivity.tsx`). The assignments come from the class's scope (`scope.assignments`, each with its `offering_id`).
- **When recording started.** REPORT-153 has run on staging (report-service-dev) since 2026-10-16 and is not yet deployed to production (a production-ops step); CLUE-693 is being implemented. Nothing is recorded for work saved before a trigger's deploy.
- **CLUE.** The page reads only report-service's activity documents. CLUE-693 writes documents of the same shape in CLUE's own Firebase project, which RD-6 pass 2 adds a listener for; until then a CLUE assignment has no recorded saves on this page.
- **Prototype.** The design was settled with Doug on the demo page (2026-10-21), including the scenarios R9 names.

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
- **R12. Staging check (Done when).** On staging, the Researcher Dashboard Wildfire class's Info tab shows, for its Activity Player assignment, the number of students who have saved work since recording began and the time of the last change; a test student's save raises the number or moves the time without a reload; an assignment nobody has saved in since recording began shows "n/a" with its footnote; and the Student Saves card's two lines match. Asserted by tests.

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

## Decisions

- **Drop the log count; show the activity numbers instead** (Doug, 2026-10-21). The log line in RIGSE-360 was how the team expected to detect activity before activity was recorded.
- **Numbers on the Assignments and Student Saves cards**, not a new card (prototype, accepted by Doug).
- **"n/a" per assignment, not per class** (Doug): one assignment can have recorded saves while another was worked on only before recording began.
- **Lowercase "n/a", no dotted underline, the footnote's exact text** (Doug).
- **The columns stay when nothing is recorded**, showing "n/a" (Doug), rather than the table falling back to a plain list.
- **The Student Saves lines are hidden with no documents** (prototype, accepted by Doug).
