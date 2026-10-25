# The CLUE Dataflow analysis in the demo

**Jira**: https://concord-consortium.atlassian.net/browse/RD-18

**Status**: **Closed**

## Overview

The demo page gains a CLUE class whose catalog lists REPORT-189's CLUE Dataflow analysis, with a redacted copy of the page that package wrote for a real class as its result, so the CLUE work can be shown in the product without a live class.

## Project Owner Overview

The demo page is what we show PIs and the project team: the real dashboard over a made-up class and simulated runs. Until now its only class was a Wildfire class, so the first CLUE analysis (REPORT-189, Scott's trial-and-error vs. systematicity detection) could not be seen in it, and in the real product that analysis is listed only for CLUE classes.

The demo's scenario menu now has a CLUE class. Its catalog lists the CLUE Dataflow analysis, finished, with the page the package produced for a real class near the median size, with every id replaced by a placeholder and no names or free text. The page's replay links would open a student's document in CLUE; in the demo they point at a domain that never resolves, and clicking one says the links are redacted. The Wildfire class and the dashboard itself are unchanged.

## Requirements

- **R1. A CLUE class scenario.** `SCENARIOS` has a scenario with key `clue` (`/demo/?scenario=clue`), listed after "Edge cases" and before the two info pages. Its world is a made-up CLUE class: its own scope (class id, name and `class_hash` distinct from the Wildfire class's; made-up teachers and cohorts; one project, which the Info tab's class card names "CLUE Demo Project"), one assignment on `https://collaborative-learning.concord.org/` with tool `CLUE`, a matching profile, made-up learner activity, and the runner suspended. Its logs count is the page's own `log events` total (262,802), and a re-run adds nothing to its counts, so the Current Status card and the page agree. No learner saved after the finished run began, so the page does not find the result behind and re-run it on open.
- **R2. The CLUE Dataflow analysis in that catalog.** The CLUE scenario's catalog is one row, `official/clue-dataflow-systematicity`: official, public, applies and runnable, with project `{ id: 22, name: "CLUE Demo Project" }`, version `1.0.0`, and the title and description verbatim from the package's `manifest.json`. No Wildfire package is listed in the CLUE class, and the CLUE package is listed in no Wildfire scenario.
- **R3. Its canned result.** The scenario opens with the analysis finished. Its `display` is `app/demo/clue-dataflow.md`, the oob preview (`global/streams/researcher-dashboard/report-189-display-preview.md`) with every `https://collaborative-learning.concord.org/` replaced by `https://redacted.demo.link.invalid/` and no other byte changed. Its `summary` is `episodes: 23 (6 systematic, 17 trial-and-error)`, the page's first totals line. Running the analysis again lands the same display and summary.
- **R4. Every replay link is redacted.** Every link in `clue-dataflow.md` has host `redacted.demo.link.invalid`, and the file holds no `collaborative-learning.concord.org`. A test asserts both, after asserting there are links at all.
- **R5. The demo page catches redacted links.** A click or middle-click on a link to `redacted.demo.link.invalid` is prevented and shows an alert saying the demo's replay links are redacted. Links to any other host are left alone. The handler lives in `app/demo/redacted-links.ts`, installed by `main.tsx`; the host it checks and the host R4's test checks are one constant.
- **R6. The dashboard is unchanged.** Nothing under `app/src/` changes, `ResultMarkdown.tsx` included. The built dashboard (`dist/index.html` and the scripts it loads) contains neither the redacted host nor any of the CLUE page's text.
- **R7. The Wildfire class is unchanged.** Every existing scenario's scope, catalog (including each row's `catalog_id`), results and behavior are as before.
- **R8. Prose the change invalidates.** `markdown.ts`'s header and its `MODEL_USE` comment no longer say nothing from a real class is in the repo. `app/README.md`'s demo section names the CLUE class and says its replay links are redacted. The CLUE scenario's `about` says the result is the package's page for a real class with every id replaced, and that its replay links are redacted.
- **R9. Checks.** `tsc --noEmit`, `npm test` and `npm run build` pass. Tests cover R1 to R5 and R7's catalog half. R6 is checked on the build output with this grep (no output from the loop, a count above zero from the last line):

```bash
for f in $(grep -oE '(src|href)="\./assets/[^"]+\.js"' dist/index.html | sed -E 's/.*"\.\/([^"]+)"/\1/'); do
  grep -lE 'redacted\.demo\.link\.invalid|trial and error vs\. systematicity|replay links are redacted' "dist/$f"
done
grep -c 'redacted\.demo\.link\.invalid' dist/assets/demo-*.js
```

## Technical Notes

- `ResultMarkdown.tsx` keeps only `http:`, `https:` and `mailto:` hrefs, keeps only `href` and `title` on a link, and opens every link in a new tab, so a result cannot carry a link that does nothing. The demo's links are made harmless by their host, under the reserved `.invalid` TLD, and by a capture-phase `click` and `auxclick` listener on `document` that the demo page adds outside the renderer. A right-click also arrives as an auxclick, so only button 1 is caught.
- The package list hides rows with `applies` false, so per-world `rows` and `outputs` keep the two classes' catalogs apart. `pkg()` numbers `catalog_id` in call order, so the CLUE row is built after `ROWS`. `groupPackages` files any official row under Official before it looks at `project`, and the class card takes project names only from catalog rows, which is why the CLUE row carries the class's project.
- A finished result whose `started_at` is older than the newest learner save is behind (`isBehind`, `src/shell/activity.ts`), and the dashboard re-runs a behind official row on load. The CLUE world's saves are 45 and 90 minutes old against a run started 40 minutes ago.
- `dist/index.html` loads `main-*.js` and modulepreloads a shared chunk Rollup names `styles-*.js`; R6's grep reads the files index.html names rather than a `main-*` glob, so it covers the shared chunk.
- A finished demo run adds the world's `pulled` answers and logs to its counts (`world.ts`). The Wildfire worlds add 3 and 40; the CLUE world adds nothing, since its page is fixed.
- The tool string `CLUE` on the assignment is assumed; it is display-only.
- The page's headings carry the package's em-dashes, kept byte-identical (R3).
- The demo ships at `demo/` under every deployment, so the page becomes public on deploy. Doug reviewed the preview for PII and cleared it for deploy.
- The page is 69,541 bytes, over `main`'s 64 KiB `DISPLAY_LIMIT_BYTES` in the runner. RD-15 (branch `RD-15-raise-display-limit`) raises it to 440 KiB. The demo never goes through the runner, so nothing here depends on RD-15, but a real run of this package for this class needs it.

## Out of Scope

- Any change to the dashboard itself, its markdown renderer or its sanitizer (`app/src/`).
- Changing the preview's content beyond the link origin: its redaction is REPORT-189's and was reviewed by Doug.
- Other CLUE packages, or the Wildfire packages' applicability in the CLUE class.
- Blocking a redacted link opened from the browser's context menu: no page event fires for it, and the `.invalid` host never resolves, so it reaches nothing.

## Decisions

### Requirements

### The scenario opens with the analysis finished
A PI demo should show the page without waiting through a simulated run; Run still lands the same page. Rejected: opening never run.

### Only the replay links' origin is rewritten
One mechanical substitution anyone can re-run against the preview; each link stays distinct, and the query holds only placeholders. Rejected: a bare redacted URL for every link.

### The CLUE world lists the CLUE row alone
Rows with `applies` false are never shown, so one five-row catalog would add rows nothing displays and change the Wildfire worlds. Rejected: one shared catalog with `applies` per class.

### The info page's "Nothing in it is real student data." stays
Doug chose to keep `Info.tsx` and `Brand.tsx` as they are: the redaction removes every identifier, so the sentence reads as identifiable data, and the scenario's `about` says the page came from a real class. Rejected: changing the sentence here, or in a follow-up story.

### The class card names the project "CLUE Demo Project"
Doug's call, over the default "Project 22". The name rides on the official CLUE row.

### Implementation

### The handler is installed once, at module level in `main.tsx`
`Demo` never unmounts and StrictMode runs effects twice in development; an effect would add a cleanup path nothing uses. Rejected: a `useEffect` in `Demo`.

### `pkg` takes a trailing `version` parameter, defaulting to `"1.2.0"`
Keeps every Wildfire call as it is. Rejected: overriding `current_version` in `over`, which repeats the title and description.

### The CLUE world's activity predates its run, and its logs count is the page's
A save newer than the run's start makes the scenario re-run on open (seen in a browser with a save 35 minutes old), and any other logs count contradicts the page. Tests pin both.
