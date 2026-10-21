# Implementation Plan: The class's activity numbers on the Info tab

**Jira**: https://concord-consortium.atlassian.net/browse/RD-12
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

The code below is the prototype Doug reviewed on the demo page (2026-10-21), with the cleanups a review would ask for: the list's orphaned CSS deleted, the new rules placed with the Info card's, the refused-listener state (R4), and the Student Saves line computed outside JSX.

### The per-assignment numbers

**Summary**: R1 and R2 as a pure function, with its unit test. Nothing renders it yet.

**Files affected**:
- `app/src/shell/activity.ts`: `Activity` gains `changed`; `assignmentActivity`.
- `app/tests/activity.test.ts`: a `describe("assignmentActivity")`.

**Estimated diff size**: ~50 lines

The `Activity` comment and type become:

```ts
// A learner's activity document, written by report-service; `changed` maps each assignment's portal
// offering id to when the learner last changed it. `writeCount` is a change signal only, never a count.
export interface Activity { lastActivityAt?: Stamp; changed?: Record<string, Stamp> }

export interface AssignmentActivity { offeringId: number; students: number; last: number | null }

// Per assignment, the learners who have saved work in it and when it last changed, from `changed`.
export function assignmentActivity(docs: Map<string, Activity>, offeringIds: number[]): AssignmentActivity[] {
  return offeringIds.map((offeringId) => {
    let students = 0, last: number | null = null;
    for (const doc of docs.values()) {
      const at = millis(doc.changed?.[String(offeringId)]);
      if (at === null) continue;
      students += 1;
      if (last === null || at > last) last = at;
    }
    return { offeringId, students, last };
  });
}
```

Tests (`stamp` from `./fixtures`):
- Three learners: A changed 9 at 300 and 10 at 100; B changed 9 at 200; C changed 10 at 500. For `[9, 10, 11]` the answer is `[{9, 2, 300}, {10, 2, 500}, {11, 0, null}]`. The times differ per learner and per assignment, so a version that keeps the last time seen (200 for 9) or counts every learner fails.
- A learner with no `changed`, and one whose `changed` lacks the assignment, count for nothing for it. (Every `changed` value is a server timestamp written by the trigger, so no unreadable value is tested.)
- An empty map gives 0 and null for every id, in the order given.

---

### The Info tab's activity numbers

**Summary**: R3 to R8, R10 and R11's dashboard tests: the Assignments card becomes the table with "…", "unknown" and "n/a" and its footnote, Student Saves gains its two lines, and the README says so.

**Files affected**:
- `app/src/pages/ClassDashboard.tsx`: the table, `NOT_RECORDED`, `NotRecorded`, `AssignmentTool`.
- `app/src/components/ClassActivity.tsx`: the two lines.
- `app/src/styles.css`: the table and footnote rules replace the `.info-card .assignments` rules.
- `app/README.md`: "What it reads" and "Active students and automatic re-runs".
- `app/tests/class-dashboard.test.tsx`, `app/tests/class-activity.test.tsx`.

**Estimated diff size**: ~200 lines

`ClassDashboard.tsx`. `Time` is imported with the other components (`import { Time } from "../components/Time";`) and `assignmentActivity` beside `behindRows`. Module level, after `ACTIVITY_REFUSED`:

```tsx
const NOT_RECORDED = "No student saves have been recorded for that assignment.";

const NotRecorded = () => <abbr title={NOT_RECORDED}>n/a</abbr>;

const AssignmentTool = ({ tool }: { tool: string | null }) =>
  tool ? <span className="tool"> · {tool === "ActivityPlayer" ? "Activity Player" : tool}</span> : null;
```

After `const newest = …`:

```tsx
  const perAssignment = useMemo(() => new Map((activity && scope ? assignmentActivity(activity, scope.assignments.map((a) => a.offering_id)) : [])
    .map((a) => [a.offeringId, a])), [activity, scope]);
  // An assignment with no recorded saves, as for one worked on only before activity was recorded,
  // shows n/a rather than a zero.
  const unrecorded = Boolean(activity && scope?.assignments.some((a) => !perAssignment.get(a.offering_id)?.students));
  // Before the first snapshot, and after the listener is refused, the activity columns say so.
  const pending = activityProblem ? "unknown" : "…";
```

The Assignments card's `<ul className="assignments">` becomes:

```tsx
              <table className="assignment-activity">
                <thead><tr><th scope="col">Assignment</th><th scope="col">Students who saved work</th><th scope="col">Last change</th></tr></thead>
                <tbody>
                  {scope.assignments.map((a) => {
                    const worked = perAssignment.get(a.offering_id);
                    return (
                      <tr key={a.offering_id}>
                        <td>{a.name ?? "Untitled"}<AssignmentTool tool={a.tool} /></td>
                        <td>{!activity ? pending : worked?.students ? worked.students : <NotRecorded />}</td>
                        <td>{!activity ? pending : worked?.last != null ? <Time ms={worked.last} capitalized /> : <NotRecorded />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {unrecorded && <p className="footnote"><abbr>n/a</abbr>: {NOT_RECORDED}</p>}
```

`ClassActivity.tsx` imports `newestActivity` and `Time`; inside the component, before the return, `const latest = activity ? newestActivity(activity) : null;`, and at the top of the `activity &&` fragment:

```tsx
        {activity.size > 0 && (
          <dl className="facts">
            <div><dt>Students who have saved work</dt><dd>{activity.size}</dd></div>
            <div><dt>Latest save</dt><dd>{latest === null ? "unknown" : <Time ms={latest} capitalized />}</dd></div>
          </dl>
        )}
```

The component's comment ("What the count in the header means, and whether finished packages re-run on their own.") gains "and how many students have saved work, and when".

`styles.css`: the four `.info-card .assignments` rules and their two comments (lines 239 to 246 today) are deleted, since nothing else uses the class, and in their place:

```css
.assignment-activity { width: 100%; border-collapse: collapse; }
.assignment-activity th { text-align: left; font-size: 0.8rem; font-weight: 700; color: var(--muted); padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--line); }
.assignment-activity td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
.assignment-activity tr:last-child td { border-bottom: 0; }
.assignment-activity tbody tr:hover td { background-color: var(--cc-teal-light7); }
.assignment-activity td:nth-child(2) { width: 12rem; }
.assignment-activity td:nth-child(3) { width: 12rem; white-space: nowrap; }
.assignment-activity abbr[title] { text-decoration: none; }
.info-card .footnote { margin: 0.5rem 0 0; font-size: 0.8rem; color: var(--muted); }
.info-card .footnote abbr { text-decoration: none; font-weight: 700; }
```

The row hover keeps the tint the list's items had.

`README.md`:
- "What it reads", the Firebase row's last clause becomes "one document per learner with the server time of their last save and of their last change in each assignment".
- "Active students and automatic re-runs" gains, after its first paragraph: "The Info tab's Assignments card shows, for each assignment, how many learners have saved work in it and when it last changed, from the same documents. An assignment with no recorded save shows n/a, since activity is recorded only from the day its trigger was deployed: work saved before then is not counted. Only Activity Player saves are recorded until the CLUE listener is added."

Tests, in `class-dashboard.test.tsx` (`SCOPE` gains a second assignment in the test, offering 10, by overriding `scope`):
- The two existing assignment tests read the table: `within(screen.getByRole("table")).getAllByRole("row")[1]` has cells "Wildfire · Activity Player", and the untitled one "Untitled".
- Before any snapshot, both activity cells read "…"; after `refuseActivity()`, "unknown".
- A snapshot where learner A changed 9 at `NOW - 60_000` and learner B changed 9 at `NOW - 120_000`: the row for 9 reads "2" and `formatTime(NOW - 60_000)` capitalized; the row for 10 reads "n/a" twice, each `abbr` with the title; the footnote reads "n/a: No student saves have been recorded for that assignment."
- A snapshot where both assignments have saves: no "n/a" and no footnote (fails if the footnote is unconditional).
- An empty snapshot: every row "n/a" and the footnote.

In `class-activity.test.tsx`: with two documents, "Students who have saved work" is 2 and "Latest save" is the newer one's time; with a document lacking `lastActivityAt` only, "unknown"; with no documents, neither line.

---

### The demo's activity scenarios

**Summary**: R9: the demo page shows each case. Depends on the previous step only for what it renders.

**Files affected**:
- `app/demo/scenarios.ts`: `changed` maps, the base data, three scenarios.
- `app/demo/world.ts`: `save()` marks an assignment changed.

**Estimated diff size**: ~45 lines

`scenarios.ts`:

```ts
const DAY = 24 * 60 * MIN;
const minutes = (count: number, from: number, step: number) => Array.from({ length: count }, (_, i) => from + i * step);

// Learners whose last saves were the given minutes ago, in the first assignment, with every other
// learner also saving in the second 20 minutes before that.
function activity(now: number, minutesAgo: number[]): Map<string, Activity> {
  return new Map(minutesAgo.map((m, i) => {
    const last = now - m * MIN;
    const changed = { "1255": stamp(last), ...(i % 2 ? { "1256": stamp(last - 20 * MIN) } : {}) };
    return [`learner-${i + 1}`, { lastActivityAt: stamp(last), changed }];
  }));
}
```

`base(now)`'s activity becomes `activity(now, minutes(18, 45, 37))`. Before the info-page scenarios:

```ts
  {
    key: "past",
    label: "A past class",
    about: "A class whose students last saved work weeks ago: nobody is active, but the Info tab still shows who worked in each assignment and when.",
    world: (now) => ({ ...base(now), activity: activity(now - 40 * DAY, minutes(22, 30, 90)),
      results: new Map([done("official/wildfire-responses", 300, now)]) })
  },
  {
    key: "before",
    label: "A class from before activity was recorded",
    about: "Students answered weeks ago, before the dashboard recorded activity, so there are no activity documents: the Assignments card shows n/a in each assignment's activity columns, with a footnote saying why.",
    world: (now) => ({ ...base(now), activity: new Map(),
      counts: { data: { answers: 117, logs: 18195, last_pull_at: stamp(now - 40 * DAY), log_freshness_at: stamp(now - 41 * DAY) } },
      results: new Map([done("official/wildfire-responses", 40 * 24 * 60, now)]) })
  },
  {
    key: "mixed",
    label: "One assignment from before activity was recorded",
    about: "Students saved work in the first assignment since the dashboard began recording activity; the second was worked on only before then, so its activity columns show n/a.",
    world: (now) => ({ ...base(now),
      activity: new Map(minutes(12, 45, 37).map((m, i) => [`learner-${i + 1}`, { lastActivityAt: stamp(now - m * MIN), changed: { "1255": stamp(now - m * MIN) } }])) })
  },
```

`world.ts`, `save()`:

```ts
    const offering = this.state.scope.assignments[Math.floor(Math.random() * this.state.scope.assignments.length)].offering_id;
    const was = this.state.activity.get(learner);
    this.state.activity = new Map(this.state.activity).set(learner,
      { lastActivityAt: stamp(Date.now()), changed: { ...was?.changed, [String(offering)]: stamp(Date.now()) } });
```

`demo-world.test.ts` gains one test: after `save("learner-1")`, the learner's document has a `changed` entry at the save's time for one of the scope's offering ids, and keeps its earlier entries.

---

### Staging check

**Summary**: R12, the story's Done when. No code; on Doug's go after the branch build is up.

1. The branch build's `index.html` URL is added to the staging Researcher Dashboard client's redirect URIs and the Researcher Dashboard external report's URL is pointed at it (Doug's go, through the portal admin forms), and both are put back to `branch/main` afterward.
2. Launch the dashboard on the Researcher Dashboard Wildfire class and open Info: the Assignments table and Student Saves lines match the class's activity documents in report-service-dev.
3. As a test student of the class, save a changed answer: within seconds the assignment's number rises (or its last change moves) and "Latest save" moves, without a reload.
4. An assignment with no save since 2026-10-16 shows "n/a" with its footnote.

## Self-Review

- **Commit reviewer:** each step builds and passes on its own: the first adds an unused export, the second renders it, the third only touches the demo. The two existing assignment tests change in the step that changes the markup.
- **Test writer:** the unit fixture's times differ per learner and per assignment, and the dashboard tests include a snapshot with no "n/a", so a footnote shown unconditionally or a per-class "n/a" fails.
- **WCAG:** the table has a header row with `scope="col"`; "n/a" carries its meaning in visible text (the footnote) as well as the title, which a keyboard or touch user cannot reach; nothing new is in a live region.
- **Prose the change invalidates:** the README's Firebase row and activity section, and `ClassActivity`'s and `Activity`'s comments, are all updated in their steps. The About dialog's "The class's teachers, assignments and your counts are on the Info tab" stays true.
