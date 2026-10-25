# Implementation Plan: The CLUE Dataflow analysis in the demo

**Jira**: https://concord-consortium.atlassian.net/browse/RD-18
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

Two commits, each passing `tsc --noEmit`, `npm test` and `npm run build` on its own. Commands run in `app/` with Node 22 (`deploy-app.yml`'s version).

## Implementation Plan

### The demo page alerts on redacted replay links

**Summary**: The click handler and the host it checks (R5), installed by `main.tsx`, with its tests. It needs no CLUE content, so it comes first and the second step's link test can import its host.

**Files affected**:
- `app/demo/redacted-links.ts` (new): `REDACTED_HOST`, `REDACTED_MESSAGE`, `catchRedactedLinks`
- `app/demo/main.tsx`: installs it
- `app/tests/demo-redacted-links.test.ts` (new)

**Estimated diff size**: ~70 lines

`app/demo/redacted-links.ts`:

```ts
// The host every replay link in the demo's CLUE result points at. `.invalid` is reserved and never
// resolves, so a link to it reaches nothing even when it is opened some way no page event sees.
export const REDACTED_HOST = "redacted.demo.link.invalid";

export const REDACTED_MESSAGE =
  "The demo's replay links are redacted. On a real class, each opens the student's document in CLUE at that point in its history.";

// The renderer keeps a result's https links and opens them in a new tab, so the demo page stops a
// click on a redacted one before the browser follows it. A middle-click arrives as an auxclick.
export function catchRedactedLinks(target: Document, say: (message: string) => void): () => void {
  const handle = (event: MouseEvent) => {
    if (event.type === "auxclick" && event.button !== 1) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(link instanceof HTMLAnchorElement) || link.hostname !== REDACTED_HOST) return;
    event.preventDefault();
    say(REDACTED_MESSAGE);
  };
  target.addEventListener("click", handle, true);
  target.addEventListener("auxclick", handle, true);
  return () => {
    target.removeEventListener("click", handle, true);
    target.removeEventListener("auxclick", handle, true);
  };
}
```

The `button !== 1` guard keeps a right-click, which some browsers also report as an auxclick, from raising the alert over the context menu. Capture phase, so the check runs before anything else on the page sees the click; the result's links have no click handler of their own (`COMPONENTS.a` in `ResultMarkdown.tsx`).

`app/demo/main.tsx`: import it beside `World`, and install it once at module level, above `createRoot`, outside React so StrictMode's double effects cannot install it twice:

```ts
import { catchRedactedLinks } from "./redacted-links";
...
catchRedactedLinks(document, (message) => window.alert(message));
```

`app/tests/demo-redacted-links.test.ts` (jsdom, the suite's default). Each test builds its own links in `document.body`, installs the handler with a `vi.fn()` for `say`, removes it in `afterEach`, and dispatches `new MouseEvent(type, { bubbles: true, cancelable: true, button })`, reading `dispatchEvent`'s return for whether it was prevented:

- **A click on a redacted link, landing on text inside it, is prevented and says why**: `<a href="https://redacted.demo.link.invalid/x"><span>open</span></a>`, dispatched on the span; prevented, `say` called once with `REDACTED_MESSAGE`. Fails if `preventDefault` is dropped, or if the handler reads `event.target` without `closest`.
- **A middle-click is caught, a right-click is not**: auxclick with button 1 is prevented and says; auxclick with button 2 is neither. Fails if the auxclick listener is dropped, or the button guard is.
- **Links to any other host are left alone**: `https://example.com/` and `https://redacted.demo.link.invalid.example.com/`, clicked; neither prevented, `say` never called. Fails if the host check is dropped or loosened to a prefix match.
- **Removing it stops it**: after the remover runs, a click on a redacted link is not prevented.

Each test asserts `say`'s call count, so none passes by asserting over nothing.

---

### The CLUE class scenario with REPORT-189's redacted page

**Summary**: The page (R3, R4), the CLUE class and its catalog (R1, R2), the scenario, the prose (R8) and their tests, leaving the Wildfire class as it is (R7).

**Files affected**:
- `app/demo/clue-dataflow.md` (new): the preview with its link origin rewritten
- `app/demo/markdown.ts`: re-exports it; `MODEL_USE`'s comment
- `app/demo/scenarios.ts`: `pkg`'s version, the CLUE row, scope, output and world, the scenario
- `app/README.md`: the demo section
- `app/tests/demo-clue.test.tsx` (new)

**Estimated diff size**: ~1,362 lines of page plus ~130 of code and tests

**The page.** Generated, not hand-edited, from the oob preview Doug reviewed:

```bash
sed 's#https://collaborative-learning\.concord\.org/#https://redacted.demo.link.invalid/#g' \
  ~/oob/global/streams/researcher-dashboard/report-189-display-preview.md > app/demo/clue-dataflow.md
```

The result is 69,541 bytes. Its em-dashes and `--` are the package's own output and stay.

**`markdown.ts`.** The file's header, which describes every result as shaped like what a package writes, becomes:

```ts
// Result markdown for the demo's packages: wildfire-responses' open-response tables, activity-model-use's
// longer multi-section report and the smaller packages' results, shaped like what those packages write,
// and the CLUE Dataflow package's own page for a real class, redacted.
```

`MODEL_USE`'s comment becomes `// wildfire-simulation-use's report in the layout and wording of a real run, with every number made up.` (its "so nothing from a real class is in this repo" is no longer true of the repo). Below it:

```ts
// The CLUE Dataflow package's page for a real class, redacted: every id is a placeholder, and every
// replay link points at REDACTED_HOST (redacted-links.ts).
export { default as CLUE_DATAFLOW } from "./clue-dataflow.md?raw";
```

**`scenarios.ts`.**

`pkg` takes the version as a last parameter, defaulting to today's `"1.2.0"`, so the Wildfire rows are unchanged and the CLUE row can carry the manifest's:

```ts
function pkg(identity: string, title: string, over: Partial<PackageRow> = {}, description: string | null = null, version = "1.2.0"): PackageRow {
  ...
    current_version: { version, title, description }, ...over
```

After `OUTPUTS`, so `ROWS` keeps `catalog_id`s 1 to 4 (R7):

```ts
// A CLUE class, apart from the Wildfire one: the CLUE package applies only to CLUE assignments, and
// the Wildfire packages never to them.
const CLUE_SCOPE: Scope = {
  kind: "class", id: 591, name: "Dataflow, period 4", class_hash: "demo591", platform_user_id: 200,
  teachers: [{ id: 4, name: "Jordan Teacher" }],
  cohorts: [{ id: 5, name: "Spring 2026 pilot" }],
  project_ids: [22], assignment_fingerprint: "v1:demo-clue",
  assignments: [
    { offering_id: 1301, runnable_id: 912, name: "Brain-Inspired Robotics: Dataflow", url: "https://collaborative-learning.concord.org/?unit=brain", tool: "CLUE" }
  ]
};

// As the package's manifest (studies/clue-dataflow-systematicity in cc-data-studies) names it. The
// class card names a project only from a catalog row's `project`, so the row carries the class's.
const CLUE_ROW = pkg("official/clue-dataflow-systematicity", "CLUE Dataflow: trial and error vs. systematicity",
  { official: true, project: { id: 22, name: "CLUE Demo Project" } },
  "For one CLUE class, the Dataflow study's detection of trial-and-error and systematic editing: each stage's summary, every episode, and sampled episodes described cycle by cycle with links that open CLUE at them.",
  "1.0.0");

// The summary is the page's first totals line, which is what the package writes to summary.txt.
const CLUE_OUTPUTS = new Map([[packageKey(CLUE_ROW.identity), { summary: "episodes: 23 (6 systematic, 17 trial-and-error)", display: CLUE_DATAFLOW }]]);
```

`row` and `finished` look the CLUE package up too, so `done()` can build its result; the Wildfire worlds still carry only `OUTPUTS`:

```ts
const row = (identity: string) => [...ROWS, CLUE_ROW].find((r) => r.identity === identity)!;

function finished(identity: string, startedAgoMin: number, now: number, display?: string): Finished {
  const output = (OUTPUTS.get(packageKey(identity)) ?? CLUE_OUTPUTS.get(packageKey(identity)))!;
  ...
```

The world, after `base`:

```ts
function clue(now: number): WorldState {
  return {
    ...base(now),
    scope: CLUE_SCOPE,
    profile: {
      assignment_urls: CLUE_SCOPE.assignments.map((a) => a.url), interactive_urls: [],
      assignment_fingerprint: CLUE_SCOPE.assignment_fingerprint, derived_at: stamp(now - 10 * MIN)
    },
    rows: [CLUE_ROW],
    outputs: CLUE_OUTPUTS,
    counts: { data: { answers: 0, logs: 262802, last_pull_at: stamp(now - 41 * MIN), log_freshness_at: stamp(now - 6 * 60 * MIN) } },
    // Every save predates the run, or the page would find the result behind and re-run it on open.
    activity: activity(now, [45, 90]),
    results: new Map([done(CLUE_ROW.identity, 40, now)])
  };
}
```

`answers: 0`: a CLUE class has no Activity Player answers. `logs` is the page's `log events` total, which is what the package's `counts.json` reports (`stages.COUNTS` counts the same `log_events` table) and the runner writes, so the Current Status card and the page agree; a test asserts it. The run started 40 minutes ago and the newest save is 45 minutes old, so `isBehind` is false and nothing re-runs on open. The runner, failing map and knobs come from `base` unchanged.

`project` on an official row changes nothing else: `groupPackages` files any `official` row under Official before it looks at `project`, and only project-group rows feed the group's `Project:` tag.

The scenario, between `edge` and `info`:

```ts
{
  key: "clue",
  label: "A CLUE class",
  about: "A CLUE class with one CLUE assignment. Its one analysis, **CLUE Dataflow: trial and error vs. systematicity**, has finished: its result is the page the package wrote for a real class, with every student, document and other id replaced and no names or free text. Its replay links are redacted, so clicking one opens nothing. Press Run to watch it run again.",
  world: clue
},
```

**`app/README.md`.** In "The demo page": the scenario list gains "a CLUE class", and after that paragraph:

> The CLUE class's result is the CLUE Dataflow package's page for a real class, with every id replaced by a placeholder. Its replay links point at `redacted.demo.link.invalid`, a host that never resolves, and the demo page answers a click on one with an alert rather than opening it (`demo/redacted-links.ts`).

**`app/tests/demo-clue.test.tsx`** (jsdom, for the renderer test):

```ts
const CLUE = "official/clue-dataflow-systematicity", KEY = packageKey(CLUE);
const links = [...CLUE_DATAFLOW.matchAll(/\]\((https?:[^)\s]+)\)/g)].map((m) => new URL(m[1]));
```

- **Every replay link points at the redacted host (R4)**: `links` has length 46 (two per episode, 23 episodes), none has a hostname other than `REDACTED_HOST` (imported from `redacted-links.ts`), and the text holds no `collaborative-learning.concord.org`. Fails on the preview unrewritten, or on a host typo in either file.
- **The renderer keeps every redacted link (R3, R6's premise)**: `render(<ResultMarkdown markdown={CLUE_DATAFLOW} />)` gives 46 anchors, all on `REDACTED_HOST`. Fails if the host were one `keepUrl` drops.
- **The CLUE class lists the CLUE Dataflow analysis alone (R2)**: the `clue` world's rows mapped to `[identity, official, visibility, applies, runnable, version, title, description, project]` equal one tuple, with the manifest's version, title and description and `{ id: 22, name: "CLUE Demo Project" }`, the scope's `project_ids` are `[22]`, and the page's first line is `# ` plus that title.
- **It opens settled (R1, R3)**: the `clue` world has learner activity (size above zero), and `isBehind(result, newestActivity(activity))` is false for its `done` result. Fails if a save is moved after the run's start (with `[35, 90]` it fails), which would make the page re-run the analysis on open.
- **Its logs count is the page's (R1)**: `counts.data.logs` equals the number in the page's `log events: <n> rows` line. Fails if either drifts.
- **It opens finished, with the page's first totals line as its summary (R3)**: the result for `KEY` is `done`, its display is `CLUE_DATAFLOW`, and its summary equals `CLUE_DATAFLOW.split("```\n")[1].split("\n")[0]`. Fails if the summary drifts from the page.
- **Run lands the same page again (R3)**: as `demo-world.test.ts`'s `watched`, with fake timers: `runPackage(CLUE, "1.0.0")`; after `4 * STEP` (past the demo portal's 300 ms delay and into the first stage) the result is `running`, and after another `20 * STEP` it is `done` with the same display and summary. Fails if the CLUE world does not carry `CLUE_OUTPUTS`, since the run would land `Finished.` and an empty display.
- **The scenario sits before the info pages (R1)**: `SCENARIOS.map((s) => s.key).slice(-3)` is `["clue", "info", "withdrawn"]`, and the `clue` world's scope id differs from every Wildfire world's.
- **The Wildfire scenarios are unchanged (R7)**: over every scenario with a world other than `clue` (asserting there are 8 first: `ready`, `running`, `failed`, `long`, `quiet`, `first`, `edge`, `withdrawn`), the rows as `[identity, catalog_id]` pairs equal the four Wildfire packages at ids 1 to 4. Fails if the CLUE row is built before `ROWS`, or added to `ROWS`.

**R6, on the build** (after `npm run build`; expect no output from the first loop and a count above zero from the second line):

```bash
for f in $(grep -oE '(src|href)="\./assets/[^"]+\.js"' dist/index.html | sed -E 's/.*"\.\/([^"]+)"/\1/'); do
  grep -lE 'redacted\.demo\.link\.invalid|trial and error vs\. systematicity|replay links are redacted' "dist/$f"
done
grep -c 'redacted\.demo\.link\.invalid' dist/assets/demo-*.js
```

`dist/index.html` names `main-*.js` and the shared chunk Rollup calls `styles-*.js`; reading the files it names, rather than a `main-*` glob, is what covers the shared chunk.

## Open Questions

### RESOLVED: Judgment call: install the handler at module level, or in a `Demo` effect?
**Options considered**:
- A) Module level in `main.tsx`, once, for the page's life.
- B) A `useEffect` in `Demo`, removed on unmount.

**Decision**: A. `Demo` never unmounts, StrictMode runs effects twice in development, and the handler has no state; B adds a cleanup path nothing exercises.

### RESOLVED: Judgment call: give `pkg` a version parameter, or override `current_version` in `over`?
**Options considered**:
- A) A trailing `version` parameter defaulting to `"1.2.0"`.
- B) `{ current_version: { version: "1.0.0", title, description } }` in `over`, repeating the title and description already passed.

**Decision**: A. B states the title and description twice in one call; A keeps every existing call as it is.

### RESOLVED: The CLUE class's project name
**Decision** (Doug): the Info tab's class card shows the CLUE class's project as "CLUE Demo Project", not "Project 22". The name rides on the official CLUE row, since `projectNames` reads names only from catalog rows. Checked in a browser: the card reads "CLUE Demo Project" and the row still groups as Official, with no project group.

## Self-Review

Roles: Senior Engineer, Commit Reviewer, Test Writer, Product Manager, Operator; a second pass added a Senior Engineer, a comment audit and a Product Manager read. Every claim below was checked by building both steps for real as throwaway code (deleted): after the first step alone, `tsc` and its 4 tests passed; after both, `tsc`, the full suite (393 tests, 382 before; the two tests the second pass added below were run separately, the suite at 384 with only them in place) and `npm run build` passed, and R6's grep printed nothing for the dashboard's files and 47 for `demo-*.js` (46 links and the constant).

### Test Writer

#### RESOLVED: The re-run test checked too early, and miscounted the Wildfire scenarios
As first written, the re-run test looked for `running` one step after Run, but the demo portal waits 300 ms before queueing, so the result was still the finished one; and the Wildfire guard asserted 7 scenarios where there are 8. Both failed when built. The test list now waits `4 * STEP` and asserts 8, naming them.

#### RESOLVED: Every named test fails under its mutation
Checked on the built code. First step: dropping `preventDefault`, `closest`, the auxclick listener, the button guard, the host check, or the remover's click line, and loosening the host check to a prefix, each fail a test. Second step: one link left on the CLUE host, a drifted summary, the CLUE world without `CLUE_OUTPUTS`, version `1.2.0`, the row not official, and the CLUE block moved above `ROWS` each fail a test.

### Product Manager

#### RESOLVED: "September class" beside 2024 and 2025 dates
The page's dates run from February 2024 to April 2025; "September" is when the corpus was pulled (clue-cc-data #1042), not when the work was done. The scenario's `about` said "a real September class", which reads as the class's term. It now says "a real class"; R8 matches.

### Senior Engineer (second pass)

#### RESOLVED: The CLUE scenario opened by re-running its analysis
With activity at 35 and 90 minutes and the run started 40 minutes ago, `isBehind` (`src/shell/activity.ts`) was true, and the dashboard's automatic re-run fired on load: in a browser the row went to "Starting up" then "Running" within two seconds, so R3's "opens finished" did not hold (the World test missed it, since the World never re-runs on its own). Activity is now `[45, 90]`, with a test; browser check showed the row idle and finished. The new test and the logs test each failed with the old values.

#### RESOLVED: The Current Status card's logs contradicted the page
The plan's 4,210 logs sat beside a page whose first stage says 262,802 log event rows, the same count the package writes to `counts.json` for the runner. The world now carries the page's number, with a test asserting the two agree.

#### RESOLVED: The page is over main's display limit
69,541 bytes exceeds main's 64 KiB `DISPLAY_LIMIT_BYTES`; RD-15 raises it. Recorded in Technical Notes; the demo itself bypasses the runner.

### Commit Reviewer (comment audit)

#### RESOLVED: `markdown.ts`'s header would describe the CLUE page as made to look like package output
Its header says every result is "shaped like what the packages write"; the plan now rewrites it to name the CLUE page as the package's own.

### Product Manager (second pass)

#### RESOLVED: The info page tells visitors the demo holds no real student data
`src/pages/Info.tsx`'s "Try the demo" panel says "Nothing in it is real student data.", while the CLUE result is a redacted page computed from a real class's work. Options were to keep the sentence (A), change it in this story (B), or leave it to a follow-up story (C).

**Decision**: A (Doug). The redaction removes every identifier, so "real student data" reads as identifiable data; the CLUE scenario's `about` says the page came from a real class. `Info.tsx` and `Brand.tsx` stay unchanged, and R6 stands.

### Commit Reviewer

#### RESOLVED: The steps are independent in order
The first step needs nothing from the second; the second's link test imports `REDACTED_HOST` from the first. Each step compiled and passed on its own (above).
