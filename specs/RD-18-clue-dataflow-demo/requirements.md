# The CLUE Dataflow analysis in the demo

**Jira**: https://concord-consortium.atlassian.net/browse/RD-18
**Repo**: https://github.com/concord-consortium/researcher-dashboard
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

The demo page gains a CLUE class whose catalog lists REPORT-189's CLUE Dataflow analysis, with a redacted copy of the page that package wrote for a real class as its result, so the CLUE work can be shown in the product without a live class.

## Project Owner Overview

The demo page is what we show PIs and the project team: the real dashboard over a made-up class and simulated runs. Today its only class is a Wildfire class, so the first CLUE analysis (REPORT-189, Scott's trial-and-error vs. systematicity detection) cannot be seen in it, and in the real product that analysis is listed only for CLUE classes.

This story adds a CLUE class to the demo's scenario menu. Its catalog lists the CLUE Dataflow analysis, finished, with the page the package produced for a September class near the median size, with every id replaced by a placeholder and no names or free text. The page's replay links would open a student's document in CLUE; in the demo they point at a domain that never resolves, and clicking one says the links are redacted. The Wildfire class and the dashboard itself are unchanged.

## Background

RD-9 built the demo page (`app/demo/`): `main.tsx` mounts the real `App` over canned services from `world.ts`, and `scenarios.ts` defines the scenarios the panel offers, all over one Wildfire class (`SCOPE`, class 590, two Activity Player assignments) and one catalog (`ROWS`, four packages). `markdown.ts` holds the canned results; `model-use.md` is imported with Vite's `?raw`. A finished run writes the result `OUTPUTS` holds for its package key, so pressing Run in any scenario walks the package through the runner's stages and lands that result.

REPORT-189 (branch `REPORT-189-clue-dataflow-package` in cc-data-studies) is the package `studies/clue-dataflow-systematicity`. Its manifest names it `clue-dataflow-systematicity`, version `1.0.0`, title "CLUE Dataflow: trial and error vs. systematicity", and applies only where every assignment URL matches `*//collaborative-learning.concord.org/*`. It writes `display.md` and `summary.txt`, whose one line is the page's first totals line (`render.py`'s `summary`); the runner keeps that line, trimmed, as the result's summary (`runner/server/package-env.js`).

REPORT-189's session rendered the page for the September class nearest the median page size (9 documents, 23 episodes) and redacted it into oob as `global/streams/researcher-dashboard/report-189-display-preview.md` (clue-cc-data #1042). Doug reviewed it for PII and cleared it to be pushed and deployed. Its 46 replay links (a start and an end link for each of the 23 episodes) still point at `https://collaborative-learning.concord.org/`, with `CLASS` and `OFFERING` placeholders in their query.

`app/src/components/ResultMarkdown.tsx` is the renderer every result goes through. Its `keepUrl` keeps only `http:`, `https:` and `mailto:` hrefs, its sanitizer schema keeps only `href` and `title` on a link, and every link opens in a new tab (`target="_blank"`). So a result cannot carry a link that does nothing; a demo link is made harmless by its host (`redacted.demo.link.invalid`, under the reserved `.invalid` TLD) and by a click handler the demo page adds outside the renderer.

Checked while writing this (throwaway vitest, deleted): the preview with its link origin rewritten, imported with `?raw` and rendered by `ResultMarkdown`, keeps all 46 links, each with host `redacted.demo.link.invalid` and `target="_blank"`; it renders one 22-column table and opens with the result contents list; a capture-phase `click` listener on `document` that calls `preventDefault` for that host sees the click and leaves it prevented for every later listener. The rewritten file is 69,541 bytes.

Checked before planning (stage 4, throwaway implementation over these requirements, deleted):

- **Bundle split (R6).** `npm run build` with the scenario, the `?raw` import and the handler in place: the CLUE page and the handler land only in the `demo-*.js` chunk. `dist/index.html` loads `main-*.js` and modulepreloads the shared chunk (named `styles-*.js` by Rollup, though it holds the shared app code), and neither contains the redacted host, the page title or the alert text. The check has to read the files `dist/index.html` names, not a `main-*` glob.
- **Clicks in a browser (R5).** Against `vite preview` of that build (so under the built CSP), at `/demo/?scenario=clue#analytics/official__clue-dataflow-systematicity`: the result renders 46 links on the redacted host; a click, a middle-click, a Ctrl-click and Enter on a focused link each raised the alert once, opened no page and made no request to either host. No console errors on `?scenario=ready` or `?scenario=clue`.
- **Re-run (R3).** In the World with fake timers, Run on the CLUE row goes queued to running, keeping the finished result as `previous`, and ends done with the same summary and the 69,401-character display.
- **R7.** The existing suite (382 tests) passed with the throwaway in place.

## Requirements

- **R1. A CLUE class scenario.** `SCENARIOS` gains a scenario with key `clue` (so `/demo/?scenario=clue` opens it), listed in the panel after "Edge cases" and before the two info pages. Its world is a made-up CLUE class: its own scope (class id, name and `class_hash` distinct from the Wildfire class's; teachers and cohorts made up like the Wildfire class's; one project, which the Info tab's class card names "CLUE Demo Project"), one assignment whose URL is on `https://collaborative-learning.concord.org/` with tool `CLUE`, a profile whose `assignment_urls` is that URL, made-up answers count and learner activity, and the runner suspended. Its logs count is the page's own `log events` total (262,802), the number the package's `counts.json` reports and the runner writes to the scope document, so the Current Status card and the page agree. No learner saved after the finished run began, so the page does not mark the result out of date and re-run it on its own when the scenario opens.
- **R2. The CLUE Dataflow analysis in that catalog.** The CLUE scenario's catalog is one row, `official/clue-dataflow-systematicity`: official, public, applies and runnable, with project `{ id: 22, name: "CLUE Demo Project" }` (the class's project, so the class card can name it), with `current_version` version `1.0.0` and the title and description verbatim from REPORT-189's `manifest.json`. No Wildfire package is listed in the CLUE class, and the CLUE package is listed in no Wildfire scenario.
- **R3. Its canned result.** The scenario opens with the analysis finished. Its `display` is `app/demo/clue-dataflow.md`, which is the oob preview with every `https://collaborative-learning.concord.org/` replaced by `https://redacted.demo.link.invalid/` and no other byte changed. Its `summary` is `episodes: 23 (6 systematic, 17 trial-and-error)`, the page's first totals line, as the runner would keep it. Running the analysis again in the scenario lands the same display and summary.
- **R4. Every replay link is redacted.** Every link in `clue-dataflow.md` has host `redacted.demo.link.invalid`, and the file holds no `collaborative-learning.concord.org`. A test asserts both, after asserting there are links at all.
- **R5. The demo page catches redacted links.** While the demo page is open, a click (or middle-click) on any link whose host is `redacted.demo.link.invalid` is prevented and shows an alert saying the demo's replay links are redacted, so nothing opens. Links to any other host are left alone. The handler lives in `app/demo/` and is installed by `main.tsx`; the host it checks and the host R4's test checks are one constant.
- **R6. The dashboard is unchanged.** Nothing under `app/src/` changes, `ResultMarkdown.tsx` included. The built dashboard (`dist/index.html` and the scripts it loads) contains neither the redacted host nor any of the CLUE page's text.
- **R7. The Wildfire class is unchanged.** Every existing scenario's scope, catalog (including each row's `catalog_id`), results and behavior are as before.
- **R8. Prose the change invalidates.** `markdown.ts`'s comment on `MODEL_USE` no longer says nothing from a real class is in the repo. `app/README.md`'s demo section names the CLUE class among the scenarios and says its replay links are redacted. The CLUE scenario's `about` says the result is the package's page for a real class with every id replaced, and that its replay links are redacted.
- **R9. Checks.** `tsc --noEmit`, `npm test` and `npm run build` pass. New tests cover R2 to R5 and R7's catalog half (no Wildfire scenario lists the CLUE package, and `ROWS` keeps its `catalog_id`s). R6 is checked on the build output with a grep the implementation spec names, since the test suite does not build.

## Technical Notes

- Files: `app/demo/scenarios.ts` (scope, row, output, scenario), `app/demo/markdown.ts` (the `?raw` re-export), new `app/demo/clue-dataflow.md`, `app/demo/main.tsx` (installing the handler), a new small module in `app/demo/` for the handler and its host, `app/README.md`, and new tests in `app/tests/`.
- The package list hides rows with `applies` false (`src/shell/packages.ts`), so per-world rows are what keep the two classes' catalogs apart; a world already carries its own `rows` and `outputs`.
- `pkg()` numbers `catalog_id` in call order, so the CLUE row is built after `ROWS` to leave the Wildfire rows' ids as they are (R7).
- `main.tsx`'s `READY.launch.classId` ("590") is used only to build an authorize request, which the demo never makes, so the CLUE class needs no launch of its own.
- The tool string the portal sends for a CLUE assignment is the portal tool's `name` (`ResearcherDashboard::Scope` in rigse); `CLUE` is assumed and is display-only (`ClassDashboard.tsx` shows it after the assignment name).
- Headings in the page use em-dashes (`## systematic — control (6 shown)`); they are the package's output and stay byte-identical (R3).
- The demo ships at `demo/` under every deployment, so `clue-dataflow.md`'s text becomes public with the next deploy. Doug reviewed the preview for PII and cleared it for push and deploy (orchestrator, 2026-10-25).
- `app/src/components/Brand.tsx`'s demo pill says the demo uses "a made-up class and simulated runs" and that "nothing here reaches a portal or real student data". The CLUE class is made up and nothing is fetched, so it stays true; the result is a redacted real page, which R8's `about` says. `app/src/pages/Info.tsx`'s "Try the demo" panel goes further: "Nothing in it is real student data." It stays: no identifiable student data is in the demo, and the CLUE scenario's `about` says the page came from a real class (decided in the implementation spec's Self-Review, Product Manager).
- A finished result whose `started_at` is older than the newest learner save is behind (`isBehind`, `src/shell/activity.ts`), and the dashboard re-runs a behind official row on its own as soon as the page loads (`behindRows` and `useAutoRerun` in `ClassDashboard.tsx`). The `edge` scenario uses this on purpose; the CLUE world's activity has to predate its result's run, or the scenario opens running rather than finished.
- The page is 69,541 bytes, over the runner's 64 KiB `DISPLAY_LIMIT_BYTES` on main (`runner/server/package-env.js`), which refuses a larger `display.md`. RD-15 (branch `RD-15-raise-display-limit`) raises it to 440 KiB; until that lands, a real run of this package for this class would fail on its size. The demo never goes through the runner, so nothing here depends on RD-15, but "as the runner would keep it" (R3) is true of the summary only once it has landed.

## Out of Scope

- Any change to the dashboard itself, its markdown renderer or its sanitizer (`app/src/`).
- Changing the preview's content beyond the link origin: its redaction is REPORT-189's and was reviewed by Doug.
- Other CLUE packages, or the Wildfire packages' applicability in the CLUE class.
- Blocking a redacted link opened from the browser's context menu ("Open link in new tab"): no page event fires for it, and the `.invalid` host never resolves, so it opens an error page and reaches nothing.

## Open Questions

### RESOLVED: Judgment call: does the CLUE scenario open with the analysis finished or never run?
**Context**: Jira's Done-when says running it shows the page; the story's purpose is that the CLUE work can be seen.
**Options considered**:
- A) Open finished, so View result shows the page at once; Run re-runs it to the same page.
- B) Open never run, so the page appears only after Run.

**Decision**: A. A PI demo should show the page without waiting through a simulated run, and Run still lands the same result, so the Done-when line holds either way.

### RESOLVED: Judgment call: rewrite the whole replay URL, or only its origin?
**Context**: R3 and Jira say every replay link points at the redacted host.
**Options considered**:
- A) Replace only the origin; keep each URL's path and query (placeholders only).
- B) Replace each URL with a bare `https://redacted.demo.link.invalid/`.

**Decision**: A. It is one mechanical substitution anyone can re-run against the preview, each link stays distinct and still shows which document and entry it would open, and the query holds only placeholders and public hostnames.

### RESOLVED: Judgment call: the CLUE row only, or every package with `applies` set per class?
**Context**: In the real product report-server lists every visible package with `applies` per class.
**Options considered**:
- A) The CLUE world's catalog is the CLUE row alone; the Wildfire worlds keep `ROWS`.
- B) One catalog of five rows, with `applies` false for the packages that do not fit each class.

**Decision**: A. Rows with `applies` false are never shown, so B adds rows nothing displays and changes the Wildfire worlds' rows, which R7 keeps as they are.

## Self-Review

Roles: Senior Engineer, QA Engineer, Security Engineer, Education Researcher (data and PII), Product Manager, WCAG Accessibility Expert. Each finding below was checked against the code before it was written.

### QA Engineer

#### RESOLVED: R6 and R7 had no named check
R9 asked for tests of R2 to R5 only, while R6 (no demo code in the dashboard bundle) cannot be a vitest test, since `npm test` never builds, and R7 rested on the existing suite alone, which never looks at the CLUE row. R9 now names R7's catalog assertions as tests and R6 as a grep over the build output.

### Security Engineer

#### RESOLVED: The page becomes public on deploy
The demo is built into every deployment (`vite.config.ts`'s `demo` input), so the CLUE page is public once deployed. Doug's PII review and clearance are now recorded in Technical Notes, so a reviewer does not have to rediscover it.
