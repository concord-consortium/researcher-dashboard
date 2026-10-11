# RD-3 pass 2: the run and its result

**Jira**: https://concord-consortium.atlassian.net/browse/RD-3
**Repo**: https://github.com/concord-consortium/researcher-dashboard
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

**Pass**: 2 of 2, the last. Passes 2 and 3 of the original plan were merged into this one (Doug, 2026-10-11): they share their gates and their day, and nothing uses the queue without the result. Branched from `main` at `c857971`, which has pass 1 merged. One PR, with the markdown renderer and the Content-Security-Policy in their own commits. It closes RD-3 in Jira.

## Overview

Let a researcher run a package from the dashboard and see what happened: each package row shows this researcher's result for it (not run, queued with its position, running with its stage, done with a summary, failed with a reason, or stuck), the researcher's counts sit above the list, and opening a finished result renders the package's markdown safely under a Content-Security-Policy.

## Project Owner Overview

After pass 1, a researcher who opens the dashboard sees the class and the packages that suit it, and can do nothing with them. This pass adds the Run control and everything that follows a click: the row says the package is queued and where it is in line, then which stage it is running, then the one-line summary and when it finished, or why it failed. Opening a finished row shows the full result the package wrote. If the machine running a package stops partway through, the row says so at once rather than reading "Running" for minutes until the system notices. The page also says, in one line, that these results and counts are the researcher's own: a colleague on the same class sees their own runs.

The result is markdown written by code fetched from the catalog, shown on a page that holds the researcher's portal sign-in and access to student data, so it is rendered so that nothing in it can run or reach another site: no HTML from the result is ever interpreted, links and images are limited to safe kinds, and the page carries a browser security policy that blocks any request to a site the dashboard does not use. This is what the PI's first approval story, RIGSE-359 (a real Wildfire launch with its result), needs from the app; she approves it on staging, and nothing here closes it.

## Background

`final-design.md` 6.1, 6.2, 7.2(d), 7.3, 8, 9 and 10 are the design; the Jira description of RD-3 is the scope, and pass 1's closed spec (`specs/RD-3-pass-1-launch-and-package-list.md`) maps its clauses to passes. Every clause pass 1 left to passes 2 and 3 is this pass's (see "Clauses covered" below).

**What exists on `main` (pass 1).** `main.tsx` resolves the launch with `start()` and renders `App`, which builds `DashboardServices` (`shell/services.ts`) from the portal's config and the in-memory token, and renders `ClassDashboard`. The page loads the scope from rigse, signs in to report-service's Firebase project with a class-scoped researcher custom token (in-memory persistence), listens to one document, `classes/{class_hash}`, asks rigse for a profile refresh at most once, and lists packages from report-server with `POST /api/v1/packages/list`. `Api` (`shell/portal.ts`) carries the bearer, the one-minute expiry margin and the young-401 rule for both servers; `ClassDashboard.refused(error, show, from)` turns a failure into page state, and only rigse's 403 renders the withdrawn page. `PackageList` groups rows (Official, one per project, Mine, Community collapsed with its disclosure) and orders each group by title. A row shows title, version, description and identity, and no state or control. The spike's run path, its `Display.tsx`, its status document reader and its 409 retry were deleted in pass 1.

**What the app now reads, and who writes it.** Everything is under `researcher_dashboard/{portal}/` in report-service's Firestore, where `{portal}` is the portal host with dots as underscores (pass 1's `portalSegment`):

| Document | Written by | Fields the page reads |
|---|---|---|
| `runners/{platform_user_id}`, the session | the function at launch (`state: "starting"`, `microvm_id`, `started_at`) and on every append (`queue`); the runner (`ready`, `running`, `suspending`, `suspended`, `terminated`, `failed` with `error`); the watchdog (`terminated`, `current_package: null`, `queue` kept, when the VM is gone, whether it fails a lost run's result there (R17) or finds the VM gone (R19a), and only while `microvm_id` is that VM and `state` is not already `terminated` or `failed`) | `state`, `current_package` (`{class_hash, package_key}` or null), `queue` (`{class_hash, package_key}` pairs, queued only, never the running one, across every class of this researcher), `microvm_id`, `error`, `updated_at` (server time on every runner and function write, REPORT-143 R22a) |
| `classes/{h}/researchers/{platform_user_id}`, the scope document | the runner, after each successful run, replacing `data` whole | `data: {answers, logs, last_pull_at, log_freshness_at}`; any of `answers`, `logs`, `log_freshness_at` can be absent; `last_pull_at` is always there |
| `classes/{h}/researchers/{platform_user_id}/results/{package_key}`, one per package | the function on queue (`status: "queued"`, `queued_at`, `updated_at`, `package`, and `previous`: a full replace, which copies the last `done` run into `previous` as `{package, image_version, summary, display, started_at, finished_at}`, carries an existing `previous` forward over a `failed` result, and writes none for a first run, REPORT-143 R8a); the runner on claim (`running`, `stage: "starting"`, `microvm_id`, `heartbeat_seconds: 60`, `started_at`, `summary: null`, `display: null`), per stage (`prepare_package`, `run_package`), every 60 seconds while it runs (a heartbeat merging only `platform_id` and `updated_at`), on finish (`done`, `stage: "done"`, `summary`, `display`, `finished_at`) or failure (`failed`, `error`, `finished_at`, `stage` left where it failed); the watchdog (`failed` with one of two reasons, R17's and R17a's, merging `status`, `error`, `finished_at` and `updated_at`, so `previous` survives). No runner write touches `previous`: the claim, stage, heartbeat, finish and failure writes are named-field merges (RD-4 pass 2 R44) | `status`, `stage`, `package: {identity, version, checksum}`, `microvm_id`, `queued_at`, `started_at`, `finished_at`, `updated_at` (server time on every write), `error`, `summary`, `display`, `previous` |

Sources: REPORT-143 as merged on report-service `master` at `bfbda61` (its closed spec `specs/REPORT-143-vm-endpoints-and-watchdog.md`, R5, R7, R8, R8a, R17, R17a, R18, R19, R19a, R22, R22a; `run-package.ts`, `ensure-vm.ts` and `watchdog.ts`; "For RD-3" in `speccing.md`), and RD-4 pass 2's spec at `0573e43` (R8, R20, R22, R23, R40, R41, R43 to R46).

**The run request.** The app sends `POST <portal>/api/v1/researcher_dashboard/run_package` with the bearer and exactly `{"packages": [{"identity", "version"}]}` (rigse's `RunRequest`: 1 to 20 packages, no other key, no identity twice). rigse checks the class and the `class:researcher-run` capability, resolves each package at report-server's `GET /api/v1/packages/resolve` with the app's own token (taking the checksum from the catalog, refusing an unrunnable one with 409 "`<identity>@<version>` cannot be run" and an unresolvable one with 409), mints the runner tokens, and posts to the function, which appends to the queue, writes each appended result `queued`, writes the runner document's `queue`, and makes sure a VM exists. rigse answers 202 `{queue, appended, vm}` as soon as the function accepts the work, and never waits for a VM. Refusals use rigse's envelope `{success: false, response_type: "ERROR", message, details}`: 400 for a body it will not take, 403 for the researcher check or capability, 404 for a class that no longer exists, 409 for a package that cannot be run or resolved or a queue at its cap of 20 outstanding, 502 for a malformed upstream answer or a VM step that failed after the work was queued, 503 when the dashboard is not configured, 504 "report-service did not answer in time; the packages may already be queued".

**What a run needs before it produces a result.** REPORT-143 deployed to report-service-dev with its rules (tracker 2.6) and RD-4 pass 2's runner released to the QA stack (3.4). Before the runner is released, a run launches a VM that never calls `/work` and stays up to its eight-hour cap (`plan.md`, "What the runner's results look like"). Before REPORT-143's rules are deployed, report-service-dev runs the spike's ruleset, which grants `get` on `classes/{class_hash}` and nothing under `runners/` or `classes/{h}/researchers/`, so every listener this pass adds is refused there.

## Requirements

### The listeners

- **R1. Three more listeners, on the same Firebase sign-in as pass 1's profile listener.** The page listens to `runners/<scope.platform_user_id>`, to `classes/<scope.class_hash>/researchers/<scope.platform_user_id>`, and to the collection `classes/<scope.class_hash>/researchers/<scope.platform_user_id>/results` (a query on the whole collection, which REPORT-143's rules grant as `list` to that researcher of that class). The portal segment and class hash are those pass 1's profile path uses, and `platform_user_id` is the scope endpoint's, never a launch parameter. No other Firestore path is read.
- **R2. The page never writes Firestore,** never holds a token carrying the runner claim, and asks rigse for no Firebase token other than pass 1's `researcher=true` class token.
- **R3. A listener the rules refuse** shows a line in the Packages section's live region naming what could not be read ("Your runs could not be read.", "Your counts could not be read."), and the rows render as if no result existed, with their Run controls. A refused profile listener keeps pass 1's behavior. All four listeners stop as soon as the page becomes an info page, as pass 1's does (pass 1 R11).

### Running a package

- **R4. A Run control on each row** of the package list, labeled "Run" with the row's title as its accessible name ("Run Wildfire responses"). Activating it sends R5's request for that one package at the row's `current_version.version`. There is no multi-package control; the request's list is always one entry.
- **R5. The request.** `POST <portal>/api/v1/researcher_dashboard/run_package`, through `Api` (so the bearer, the expiry margin and the young-401 rule are pass 1's), with `Content-Type: application/json` and `{"packages": [{"identity": <row.identity>, "version": <row.current_version.version>}]}`, nothing else.
- **R6. Its answers.** A 202 needs nothing further: the result and runner listeners show the queue. While the request is in flight the control is disabled and the row says "Requesting…". Any refusal is shown on that row, as one line, until the next request from that row or until its result changes after the refusal arrived (the function writes `queued` before it asks for a VM, so a 502 from the VM step or a 504 reaches the page after the row's result has already changed): rigse's `message` for a 4xx or 5xx carrying one (409's "cannot be run", a queue at its cap, 502, 503 and 504 included), otherwise "The portal could not be reached." A 401, or a token about to expire, re-authorizes as pass 1 R8 says, which navigates away; the run was not requested and the researcher runs it again on return. A 403 renders pass 1's withdrawn page. A 404 renders pass 1's class-gone page.
- **R7. When Run is offered.** The control is disabled, with a visible reason beside it, when:
  - the row's `runnable` is false: "Only official packages can be run here for now." (A listed row is never archived, so for a listed row `runnable: false` means report-server's `unreviewed_runs` setting is off and the package is not official.)
  - the row's result is `running`, or `queued` while the session will take it (R8): no reason line is needed, since the state says why.

  - the row is stuck (R12) on a VM that is not merely paused: "It can be run again once it is marked failed." A `running` result is outstanding (REPORT-143 R5), so a request for it appends nothing and the new VM it might launch has nothing of this package to do; only the watchdog's `failed` makes it runnable again.

  It is enabled for a row with no result, a `done` or `failed` result (a re-run, which REPORT-143 R8 appends and writes `queued` again), a `queued` result the session will not take (R8), and a stuck row whose runner document says `suspended` with the result's `microvm_id`. On that last row the control is labeled "Resume" (accessible name "Resume <title>"), since the request wakes the paused VM (`ensureVm` resumes a `SUSPENDED` VM) and the VM finishes the interrupted run (RD-4 pass 2 R20); nothing else wakes it, because the watchdog resumes a suspended VM only for queued work (REPORT-143 R19). Once a Resume request is accepted, the row reads "Resuming: it will continue within a minute or two." with the control disabled and no reason line, until the result is next written (normally the run's first heartbeat, RD-4 pass 2 R44a), or for at most three minutes, after which it reads R12's paused state again with Resume enabled. `/resume` writes nothing, so without this the row would read paused, with Resume offered, for the whole wake.
- **R8. Queued work nobody will take can be restarted.** A `queued` result is one the session will take while the runner document's `state` is `starting`, `ready`, `running`, `suspending` or `suspended`. Otherwise (no runner document; a document with `queue` and no `state`, which is what the function leaves when the first launch fails after the work was queued, since it writes `queue` on append and `state: "starting"` only once `RunMicrovm` has answered; or a session the watchdog or a hook ended as `terminated` or `failed`) nothing relaunches on its own (REPORT-143, "For RD-3"), so the row keeps its Run control, and a request for it launches a VM even though the function skips the package as already queued. The row says "Queued, waiting for a machine: run it to start one." in place of a position, except while a run request from that row is in flight: the function writes `queued` before it launches, so a first run reads as waiting for the whole launch (up to tens of seconds) unless the request is counted, and the row then reads as R9's plain Queued.

### The row's state

- **R9. Each row shows this researcher's result for its package,** found by package key: the row's identity with every `/` replaced by `__`, which is how the function and the runner key the result document. The key derivation is asserted against every `package_key` case of REPORT-167's `fixtures/package-contract.json`. The states:
  - **Not run**: no result document. "Not run."
  - **Queued**: `status: "queued"`. "Queued, number <n> in line." where n is the 1-based index of `{class_hash: scope.class_hash, package_key}` in the runner document's `queue`. When the pair is not in `queue` (the function and the runner both write it, so it can lag by one write), "Queued." with no number. R8's wording when nothing will take it.
  - **Running**: `status: "running"`. "Running <title>: <stage>." with the stage as words: `starting` "starting", `prepare_package` "preparing the package", `run_package` "running the package", and any other value as written.
  - **Done**: `status: "done"`. The `summary` as plain text (or "Finished." when it is null), and "Finished <finished_at>" as a local date and time. A "Show result" control opens the result (R15).
  - **Failed**: `status: "failed"`. "Failed: <error>." and "<finished_at>" when present. The error is shown as text, whatever it says: the watchdog's two reasons (R17's "The machine running it stopped before the run finished; run it again." and R17a's "No VM took this package before its VM's life ended; run it again") are reasons like any other, and the Run control offers the re-run.
  - **Stuck**: R12.

  **The latest finished result stays on the row through a re-run.** `latestFinished(result)` is the result itself when it is `done`, otherwise its `previous`, or none. When a row's result is not `done` and it has a latest finished result, the row shows that result (its summary as text, "Finished <finished_at>" and "Show result"), and the state above becomes the re-run's, prefixed "Updating: " ("Updating: queued, number 2 in line.", "Updating: running Wildfire responses: preparing the package.", "Updating: interrupted: the machine running it stopped partway. This is being checked."). A failed re-run reads "The latest re-run failed: <error>. Showing the result from <latest finished_at>." over the kept result, whatever the reason, R17a's "No VM took this package…" included. With no latest finished result, the states read as listed above.
- **R10. The version.** When the shown finished result's `package.version` differs from the row's `current_version.version`, the row says which version the result is from ("from 1.0.0").
- **R11. Each row's state line is in a polite live region,** so a queued row moving to running, and running to done, is announced without moving focus. R6's "Requesting…" and refusal line are in the same region, so a refused run is announced too.
- **R12. Stuck.** A result reading `running` while the session says the VM that claimed it is no longer running it is shown as stuck at once, without waiting for the watchdog: "Interrupted: the machine running it stopped partway. This is being checked.", or, when the runner document says `suspended` with the result's `microvm_id`, "Paused partway through: resume it to finish." with R7's Resume control. Any other stuck row's control is disabled with R7's reason. It is stuck when the runner document exists, the result's `updated_at` is not later than the session's mark, and either the document's `microvm_id` differs from the result's (a newer VM holds the session, so the one that claimed it is gone), or they match and its `state` is `suspended`, `terminated` or `failed`. `suspending` is not stuck (the runner is flushing, and the next state decides), and a missing runner document is not stuck (nothing says the VM stopped). A result written after the session's last write came from a VM that is running it, which is what a resumed VM does: it finishes the package that was running when it was suspended before writing its status again (RD-4 pass 2 R20, R8), so its heartbeat, within a minute of the resume, and its stage and finish writes clear the stuck state. When the watchdog writes the result `failed`, the row shows R9's Failed state. **The session's mark** is the runner document's `updated_at` in the first snapshot the page saw with the document's current `state` and `microvm_id`; a snapshot that changes neither keeps it. The function moves `updated_at` on every run request, appended or not, without changing the state, and a resumed VM writes nothing to the document until the interrupted run finishes, so comparing with the latest `updated_at` would show a resumed run as paused again, with Resume offered, whenever any run was requested, until its next heartbeat. A page loaded during that window has only the latest `updated_at` to go on, and can show it for up to that minute.
- **R13. Order within a group.** Every group, Official included, stays ordered by title as pass 1 orders it (pass 1 R18), whatever the results say (Doug, 2026-10-11). With RD-6's automatic re-runs, an order by finish time would reshuffle a group each time a re-run finished, moving a row from under the researcher's pointer and losing a screen reader user's place, and recency would say which re-run finished last rather than what the researcher uses. Freshness is on each row instead (R23).

### The session

- **R14. One line above the list says what the researcher's machine is doing,** from the runner document, in the Packages section's live region:
  - no document, or one with no `state`: nothing above the list (R8's line is on each queued row).
  - `starting`: "Starting a machine for your runs…"
  - `ready`: "Your machine is ready."
  - `running` with `current_package` in this class: "Running <title>." (the title of the listed row with that key, or the identity rebuilt from the key, `__` as `/`, when the package is not listed) while that package's result is `running` or not yet read; once it is `done` or `failed`, "Your machine is starting its next package." The runner changes `current_package` only at its next claim or its drained `ready` (RD-4 pass 2 R8), and before the next claim it fetches, verifies and checks the next package, so the document names a finished package for seconds after the row says it finished. In another class: "Running a package for another of your classes."
  - `suspending` or `suspended`: "Your machine is paused." and, when `queue` is not empty, "Queued packages will start within a couple of minutes." (REPORT-143 R19 resumes a suspended VM with queued work within about a minute.)
  - `terminated`: "Your machine has stopped." and, when any of this class's results is `queued` and no run request from the page is in flight, R8's sentence.
  - `failed`: "Your machine stopped with an error: <error>." and the same.

### The result

- **R15. Opening a result.** "Show result", on any row with a latest finished result (R9), opens that finished result in the Results section (R20), replacing any result open before, and moves keyboard focus to the opened result's heading, the package's title. A "Close" control closes it and returns focus to the row's "Show result". The opened result shows the title, the version it ran, "Finished <finished_at>", the summary as text, and `display` rendered as markdown (R16 to R18). It stays open through a re-run: queuing, running or failing a re-run leaves it showing the same finished result, and when the re-run lands `done` the view shows the new result in place with "Updated <finished_at>" in a polite live region, without moving focus. If the result has no latest finished result any longer (one queued before the function wrote `previous`), the view closes and focus moves to the Results heading.
- **R16. Raw HTML is never parsed.** The markdown parser is configured so that HTML in the source is not recognized as HTML at all: `<script>`, `<img src=x onerror=...>`, `<iframe>` and every other tag or comment in `display` render as literal text, and no element is ever produced from them. It is not parsed and then cleaned. The result is rendered as React elements; nothing in the app assigns `innerHTML` or uses `dangerouslySetInnerHTML`.
- **R17. Links and images are allowlisted by scheme.** A link's URL is kept only when its scheme is `https`, `http` or `mailto`; any other (`javascript:`, `data:`, `vbscript:`, `file:` and relative URLs among them) renders the link's text with no link. A kept link opens in a new tab with `rel="noopener noreferrer"`. An image is kept only when its URL is a `data:` URL of type `image/png`, `image/jpeg`, `image/gif` or `image/webp`, which makes no request; any other image, a remote one above all, renders its alt text and no element that loads anything.
- **R18. A sanitizer runs behind both,** over the tree the renderer is about to produce, allowing only the elements CommonMark and GitHub-flavored tables, strikethrough and task lists produce, and only the attributes those need (`href`, `src`, `alt`, `title`, a table cell's alignment, a list's `start`, a task list's disabled checkbox and whether it is checked), with the URL schemes R17 allows and no others: `http`, `https` and `mailto` for `href`, `data` for `src`. It is defense in depth: R16 and R17 are what keep script and remote content out, and a test asserts each holds with the sanitizer removed.
- **R19. `summary` is text,** never markdown: `**bold**` in a summary shows its asterisks, on the row and in the opened result.

### What the page says

- **R20. Results and counts.** Above the package groups, a "Your counts" block reads the scope document's `data`: "Answers <n>" and "Logs <n>", each "not reported" when absent, and "From your last run, <last_pull_at>" and "Logs current to <log_freshness_at>" when present. With no scope document the block says "No runs yet." A Results section (`h2` "Results") follows the package groups and holds the opened result (R15) and R21's rows. With neither, it says "Open a finished package's result to read it here.", so the heading never sits over nothing and the section does not appear and disappear as results open and close.
- **R21. Results for packages no longer listed.** A result whose `package.identity` matches no row the page shows in a group, once the list has answered, renders under Results, in "Packages no longer listed" (`h3`), with the identity, version, R9's state and R15's "Show result", and a note. A package the list returned but the page does not show in a group (pass 1 R16, R17) takes its note from the list's row: "This package no longer applies to this class." for `applies: false`, and "This package is not offered in any of this class's groups." for one that applies and fits no group (a project-visible package of a project the class is not in). For a package the list did not return, the app asks `GET <report-server>/api/v1/packages/resolve?identity=&version=` (the result's) once per identity per page load, with the bearer, and says "This package has been archived." for `archived: true` and "This package is no longer available to you." for a 404; the list returns every visible package that is not archived, so no other answer has a note. Any other answer shows no note and still renders the result. There is no Run control on these rows, so R8's waiting row reads "Queued, waiting for a machine." and R12's paused row "Paused partway through.", without the instruction to press a control the row does not have. While the list is loading or failed, no result is placed here, since every result would look unlisted.
- **R22. Ownership.** One line under the class's header: "Results and counts on this page are your own. Another researcher of this class sees their own runs." (`final-design.md` 8.)
- **R23. Freshness sits on the row:** each done or failed row shows its own `finished_at`; there is no banner over the list dating it, beyond the counts block's own `last_pull_at`.
- **R24. The renames left from pass 1.** "Run", "Running <package>" and "Results" are the labels (R4, R9, R20). No "Analyze Class", "Analyzing" or "Analyses" text exists in `app/` (pass 1 R22 still holds). The info page's "What it can show" lists running a package, its result and the counts, as well as the package list.

### The Content-Security-Policy

- **R25. The built `index.html` carries a Content-Security-Policy as a `<meta http-equiv="Content-Security-Policy">`, the first element in `<head>`,** so it ships in the same build as the renderer it bounds and covers staging as well as production (`final-design.md` 10). Its directives:
  - `default-src 'none'`
  - `script-src 'self'`
  - `style-src 'self'`
  - `img-src 'self' data:`
  - `connect-src 'self'` plus every allowlisted portal's origin and report-server origin (from `portals.ts`), and the three Google endpoints the Firebase Auth and Firestore web SDKs call with in-memory persistence and a custom token: `https://identitytoolkit.googleapis.com`, `https://securetoken.googleapis.com` and `https://firestore.googleapis.com` (R26)
  - `font-src 'self'`, `manifest-src 'self'`
  - `base-uri 'none'`, `form-action 'none'`, `object-src 'none'`, `frame-src 'none'`

  The directives a meta tag cannot carry (`frame-ancestors`, `sandbox`, reporting) are not included.
- **R26. One source of truth.** The `connect-src` origins are derived from the build's portal allowlist and Firebase configuration, not typed a second time, and a test asserts every allowlisted portal and report-server origin appears in the built policy. The Firebase hosts are named once, in the module that builds the policy (the build config must import them, and the Firebase config's module imports the SDK).
- **R27. The dev server serves no policy** (Vite's development preamble is an inline script), and a production build always does.

### Prose

- **R28.** `app/README.md`'s "What it reads" table gains the run request, the resolve call and the three listeners; the README says the build carries the CSP and where its origins come from. Pass 1's spec header ("Passes 2 and 3 stack on this branch") is left as the closed record it is.

### Accessibility

- **R29.** Every Run and Show result control is a native `<button>` with an accessible name that includes the package's title; a disabled Run is `aria-disabled="true"` with its click ignored, never the native `disabled`, so pressing it keeps focus on it and Tab still reaches it, and it carries its reason as visible text associated with it (`aria-describedby`). The counts block and the Results section are headed sections. Opening and closing a result moves focus as R15 says. Headings in a result's `display` render below the opened result's own heading, a markdown level 1 as `h4` and every deeper level one further, capped at `h6`, so a package's `#` never becomes a second `h1` on the page. State is never conveyed by color alone.

### Tests

- **R30.** The app's suite (vitest, jsdom) covers, without a network, each named so that deleting the line it guards fails it:
  - R2 as a source test: no file under `app/src/` imports a Firestore write function, and the one Firebase token call carries `researcher=true`.
  - R1's three paths, from the scope's `platform_user_id` and `class_hash`; R3's refused listener lines and all four listeners stopping on an info page.
  - R5's request body exactly, through `Api`; R6's 202, a 409 message on the row, the unreachable line, 401 re-authorizing, 403 the withdrawn page, 404 the class-gone page; a 502 that arrives after the row's `queued` snapshot still shown, and gone at the next result change; R8's waiting sentence absent while that row's request is in flight.
  - R7's disabled cases (unrunnable, running, queued with a live session, stuck on a newer VM and stuck on a terminated one, each stuck case with its reason) and enabled cases (no result, done, failed, R8's queued with no session and with a terminated one, and Resume on a stuck row suspended on the same VM).
  - R9's package key against every `package_key` case of `fixtures/package-contract.json`; each state's text; the queue position counting entries of another class before it; the lagging queue's "Queued."; R10's version note against the shown result's version; `latestFinished` for `done`, for a queued, running and failed result with and without `previous`, and for no result; a re-run's "Updating: " lines and the failed re-run's line over the kept summary, with "Show result" still offered.
  - R12: stuck for a different `microvm_id`, for `suspended`, `terminated` and `failed`; not stuck for `suspending`, for `running` and `ready` on the same VM, with no runner document, or with `suspended` when the result's `updated_at` is later than the session's mark; then failed when the result turns `failed`. The mark kept through a snapshot that moves only `updated_at`, so a resumed run beating after the suspend stays running when another row's request moves the runner document; a new mark when `state` or `microvm_id` changes.
  - R7's Resuming state: after Resume's 202, "Resuming: …" with the control disabled; gone at the result's next write; back to paused with Resume enabled after three minutes with no write (fake timers, so dropping the timeout fails it).
  - R8's will-take test: a runner document with `queue` and no `state` keeps the Run control on a queued row.
  - R13: a group's order is by title with results whose finish times run the other way, so ordering by finish time fails it.
  - R14's lines, including "starting its next package" when `current_package` names a result that is `done`, and no R8 sentence under `terminated` while a request is in flight.
  - R15's focus moves; an open result staying open, focus unmoved, when it is re-queued, runs and fails; its in-place update with "Updated <time>" when the re-run lands `done`; and its close, with focus on the Results heading, when no finished result is left.
  - R16 to R19 against one hostile `display`: a `<script>` tag, an `<img onerror>`, an `<iframe>`, a `javascript:` link, a remote image and a `data:image/svg+xml` image. The rendered DOM holds no `script`, `iframe` or `img` with a non-`data:` source, no attribute starting `on`, and no `href` outside the allowlist, and the HTML shows as text. Those are the assertions that make "makes no outbound request" testable in jsdom, which loads no subresource either way, so a spy on `fetch` or `Image` would pass whatever the renderer did; in a browser, the CSP's `img-src` is what blocks a remote image, and the staging check watches for one. The same assertions run with the sanitizer bypassed, proving R16 and R17 hold alone. A `data:image/png` image and an `https` link do render, so a renderer that drops everything cannot pass.
  - R20's counts with absent keys; R21's four notes (the two from the list's row with no resolve call, archived and 404 from resolve), and the unlisted rows' absence while the list is pending; R22's line.
  - R29's heading levels: a `#` and a `##` in `display` render as `h4` and `h5`.
  - R25 to R27: a build-time test that the built `index.html`'s first `<head>` element is the CSP meta, that its directives are R25's, and that `connect-src` includes every allowlisted origin.

## Technical Notes

- **Files this pass touches**: `app/src/pages/ClassDashboard.tsx`, `app/src/components/PackageList.tsx`, `app/src/shell/services.ts`, `app/src/shell/firebase.ts`, `app/src/shell/portal.ts`, `app/src/shell/packages.ts`, `app/src/pages/Info.tsx`, `app/index.html` or `app/vite.config.ts` (the CSP), `app/src/styles.css`, `app/README.md`, new modules for the run state, the result view and the markdown renderer, and their tests. Nothing outside `app/` except the contract fixture (below).
- **The contract fixture.** RD-4 pass 2 adds `fixtures/package-contract.json` at the repository root, a byte-identical copy of report-service's, kept by `runner/scripts/contract.mjs`; it is not on `main` yet. R9's test reads that file. If RD-4 pass 2 has not merged when this pass is implemented, this pass adds the same bytes (`contract.mjs`'s source, report-service `master`), which merges cleanly against RD-4 pass 2's identical add. `deploy-app.yml` runs on `app/**` only, so a fixture change alone does not run the app's tests; `contract:check` is the runner's guard on the copy.
- **report-server's resolve** (`GET /api/v1/packages/resolve`, `PackageController.resolve`) is a catalog read route under `CatalogCors`, answering the bearer from an origin in `PACKAGES_CORS_ORIGINS` (staging: `https://models-resources.concord.org`, O9) with `{catalog_id, identity, version, checksum, expected_duration_seconds, clue_prepull, archived, runnable, reason}`; 404 when the package does not exist or the reader may not see it. Archived packages still resolve.
- **Timestamps** are Firestore `Timestamp`s and are read with `toMillis()`, as pass 1's `derived_at` is.
- **The watchdog's reasons are text only.** Its failure merges only `status`, `error`, `finished_at` and `updated_at`, with `error` one of two sentences (`MACHINE_STOPPED` and `NOT_CLAIMED` in `watchdog.ts`); no code is stored. The app shows `error` (R9) and needs nothing else.
- **The `queued` snapshot usually arrives before rigse answers.** `queuePackages` commits the queue and the `queued` results in one transaction, and only then does `makeRunPackage` call `ensureVm`, whose launch path makes three upstream calls of up to 10 seconds each before `recordLaunch` writes `state: "starting"` (`run-package.ts`, `ensure-vm.ts` at `bfbda61`). So a row is `queued` while its request is still in flight (R8's exception), and a refusal from the VM step lands after the result changed (R6's rule). A request that appends nothing (R8's restart, a Resume) changes no result, and the runner document's `updated_at` moves on every request (`queuePackages` merges `queue` and `updated_at` whatever it appended).

- **Checked by running it (2026-10-11, throwaway code, deleted).** In a copy of the app at `c857971` with react-markdown 9.1.0, remark-gfm 4.0.1 and rehype-sanitize 6.0.0 added:
  - A Vite plugin with `apply: "build"` and `transformIndexHtml` `{order: "post"}` returning the meta tag with `injectTo: "head-prepend"` put the policy first in the built `<head>`, ahead of `<meta charset>`, and the dev server had none. With `injectTo: "head"` it lands after Vite's own tags, which a test catches; `order: "post"` makes no difference to where it lands (second review pass, below). The policy was built from `portals.ts`'s allowlist and the three Firebase hosts.
  - The built pass 1 shell (the info page) and a page rendering a GFM table, a `data:image/png` image, a remote image, a `javascript:` link, a `<script>` and an `<img onerror>` ran in Chromium under the policy with no CSP violation. The table cells' alignment applied (React sets `style` through the CSSOM, which `style-src 'self'` allows), the PNG loaded, the hostile HTML showed as text, and the remote image and the `javascript:` link rendered as plain text. With the sanitizer's `src` protocols set to `data` only, the `data:` image survived it.
  - A vitest test that calls Vite's `build({write: false})` and reads the emitted `index.html` ran in 2.5 seconds, but only under `// @vitest-environment node`: under jsdom, esbuild refuses to start ("`new TextEncoder().encode("") instanceof Uint8Array` is incorrectly false").

### Prerequisites outside this repository

None blocks the spec or the implementation's tests; each blocks the staging check.

- **REPORT-143 deployed to report-service-dev from `master` with its rules** (tracker 2.6), or every listener this pass adds is refused (Background). Its indexes need not be built for the app; they serve the watchdog. `master` carries R8a's `previous`, without which a re-run would show no earlier result and an open result would close when re-queued (R15's fallback).
- **RD-4 pass 2's runner released to the QA stack** (3.4), or a run never leaves `queued` and its VM stays up to eight hours.
- **The app's branch build's redirect URI on the staging `Client`**, as for pass 1 (O10), for a check before the merge: `.../branch/pass-2-run-and-result/index.html`.

### The staging check

On class 590 as `dougresearcher`, from the branch build, on 2026-10-15 with `wildfire-responses` 1.0.0, before 1.1.0 is published (REPORT-158, 2026-10-19, changes the wording and adds an answer to class 590, #210): run `projects/20/wildfire-responses`; the row reads queued with its number, then each stage, then done with "6 open responses from 3 learners." and a time; run it again with the result open, and the row keeps that summary under "Updating: " while the open view stays put and then reads "Updated <time>"; the opened result renders `display.md` with the CSP in force (no console CSP violation over a full launch, run and open); the counts block reads "Answers 9" with logs as reported; a second run of `runner-smoke` shows the queue's numbers while the first runs. Stuck is checked alongside RD-4 pass 2's "suspend mid-run" staging check (3.4): with the dashboard open, the row reads stuck as soon as the runner document says `suspended`, and failed once the watchdog writes it, which for a VM left suspended is the package's declared duration plus 10 minutes after the run's last heartbeat (REPORT-143 R17).

### Clauses covered

Jira's clauses that pass 1 left to passes 2 and 3, now all this pass's:

| Clause | Requirement |
|---|---|
| Package-key and identity handling asserted against `fixtures/package-contract.json` | R9, R30 |
| Listeners on `classes/{h}/researchers/{uid}`, its `results/`, `runners/{uid}` | R1 to R3 |
| Row state: not run, queued with position, running with stage, done, failed; queued as a runner fact | R9, R11 |
| The line saying results and counts are this researcher's own | R22 |
| "Run", "Running <package>", "Results" | R4, R9, R20, R24 |
| `stuck` from `running` beside `suspended`, before the watchdog | R12 |
| `display.md`: no raw HTML parsed, scheme allowlist, sanitizer behind, CSP `<meta>` first in `<head>`, `img-src`; `summary.txt` as text | R16 to R19, R25 to R27 |
| Freshness on the row | R23 |
| Counts above the list from the researcher's scope document | R20 |
| A result citing an archived package renders with the archived note | R21 |
| Order: official first by title, then most recently run | R13: superseded, every group by title (Doug, 2026-10-11) |
| Never write Firestore; never hold a runner-claim token; no per-class enable UI | R2 |

## Out of Scope

- Running several packages in one request, or a "run all" control (R4).
- RD-6's live activity count and the re-run loop; any CLUE read: packages read CLUE only through cc-data, and no scope document carries a CLUE count (Doug, 2026-10-14).
- Production portals in the allowlist and production Firebase config (RD-1 production), and the app's `index-top.html` for production's root URL (`final-design.md` item 12; an open decision for Doug, owned by RD-1 production).
- Any change to rigse, report-server, report-service functions or rules, or the runner.
- A CloudFront response-headers policy (`frame-ancestors`, reporting); `final-design.md` 10 leaves it for later.
- Sharing a result with another researcher (`final-design.md` 8's extension point).
- Closing or transitioning RIGSE-359 to RIGSE-363.

## Open Questions

### RESOLVED: Judgment call: what makes a running result stuck
**Context**: Jira and `final-design.md` 7.2(d) say "`running` beside `suspended`". A VM can also be gone with the document saying `terminated` or `failed`, or replaced by a newer VM.
**Options considered**:
- A) Only `running` beside `suspended`.
- B) `running` while the runner document says the claiming VM is not running it: a different `microvm_id`, or the same with `suspended`, `terminated` or `failed`.

**Decision**: B (R12). Jira's done-when names "a run interrupted by a terminated VM", which A cannot show; a newer `microvm_id` means a run request launched a VM because the old one was gone. `suspending` and a missing document stay not stuck, since neither says the VM stopped.

### RESOLVED: Judgment call: images in a result
**Context**: R17. A remote image is the exfiltration channel `final-design.md` 10 names; a package has no way to ship an image file, since `display` is one Firestore string.
**Options considered**:
- A) No images at all.
- B) `data:` images of four raster types only, with `img-src 'self' data:`.

**Decision**: B. A `data:` image makes no request, so it is no channel, and a small chart inside the 64 KiB cap is the one image a package can usefully carry. SVG is excluded because an SVG document is the image type that can carry script; as an `<img>` it would not run, but nothing needs it.

### RESOLVED: Judgment call: "most recently run" means the last finish

Superseded: R13 orders every group by title (Doug, 2026-10-11, from RD-6 pass 1's #219).

**Context**: R13. A run's `started_at` or `queued_at` would move a row to the top the moment it is claimed or queued.
**Options considered**:
- A) `finished_at`, descending; never-finished rows after, by title.
- B) The latest of `queued_at`, `started_at` and `finished_at`.

**Decision**: A, so a row does not jump while the researcher is watching it run.

### RESOLVED: Low confidence: the Firebase hosts `connect-src` must allow
**Context**: R25 and R26 named "the Google endpoints the Firebase Auth and Firestore web SDKs call" without listing them. A missing host blocks sign-in or the listeners in the deployed build only, since tests run without a policy.
**Options considered**:
- A) Read them from the SDK as installed (`firebase` 10.14.1) and pin the list, then confirm against Google under the policy.
- B) `https://*.googleapis.com`.

**Decision**: A. The app's production build at `c857971` names `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` and `firestore.googleapis.com` as request hosts; the bundle's other Google hosts (`apis.google.com`, `www.google.com/recaptcha`, the identity toolkit sandboxes) belong to popup, redirect, reCAPTCHA and emulator flows that `initializeAuth` with in-memory persistence and a custom token never loads. Checked 2026-10-11 with a throwaway page built from the app's own `firebase` and `firebaseConfig("report-service-dev")`, served by `vite preview` under R25's policy with those three hosts, in Chromium (Playwright): `signInWithCustomToken` reached Identity Toolkit and came back `auth/invalid-custom-token` (a server answer, not a CSP block), a document listener and a collection listener under `researcher_dashboard/` reached Firestore and came back `permission-denied`, and a remote `Image` was blocked with "violates ... img-src 'self' data:". `securetoken.googleapis.com` is the ID token refresh, which only a successful sign-in reaches; the staging check covers it, and an hour's session refresh with it. R25 lists the three.

### RESOLVED: Low confidence: whether a markdown library can refuse HTML at the parser
**Context**: R16 requires HTML not to be recognized at all, rather than parsed and dropped.
**Options considered**:
- A) remark (micromark) with its HTML constructs disabled, rendered to React elements, with `rehype-sanitize` behind.
- B) markdown-it with `html: false`, rendered to a string, then DOMPurify and `dangerouslySetInnerHTML`.

**Decision**: A. Checked 2026-10-11 with throwaway code (react-markdown 9.1.0 on micromark 4.0.3, remark-gfm 4.0.1, rehype-sanitize 6.0.0): a remark plugin adding the micromark extension `{disable: {null: ["htmlFlow", "htmlText"]}}` makes `<script>`, `<img src=x onerror=...>`, `<b>`, `<iframe>` and a comment render as escaped text, with or without the sanitizer, and GFM tables, task lists and strikethrough still render. Rendering to React elements means no `innerHTML` anywhere, which B needs. Two findings fed the requirements: `rehype-sanitize`'s default schema strips every `data:` image source (its `src` protocols are `http` and `https`), so R18 names its schemes; and a URL refused by the transform leaves an `<a>` with no `href` and an `<img>` with no `src`, so the renderer has to replace those with plain text for R17 to hold as written.

### RESOLVED: Low confidence: R8's restart for queued work with no session
**Context**: R8 assumes a run request for a package already queued still makes the function ensure a VM.
**Options considered**:
- A) Keep R8 as written, confirmed against the function's code.
- B) Drop the restart and rely on the watchdog's eight-hour `NOT_CLAIMED`.

**Decision**: A. `makeRunPackage` (`run-package.ts`, report-service `master` at `bfbda61`) calls `deps.ensureVm` after `queuePackages` whatever was appended, and `ensureVm` (`ensure-vm.ts`) launches when `GetMicrovm` says the recorded VM is gone or `TERMINATED`, resumes it when `SUSPENDED`, and otherwise leaves it. REPORT-143 R8 keeps that shape (it changes only what counts as outstanding). B would leave a researcher looking at "Queued" for up to eight hours with nothing to press.

### RESOLVED: Judgment call: R13 sorts by the latest finished result, and the page-remembered finish goes

Superseded: R13 orders every group by title (Doug, 2026-10-11, from RD-6 pass 1's #219).

**Context**: #204 (Doug-approved) adds `previous` to the result and offered sorting by `latestFinished(...).finished_at` as optional.
**Options considered**:
- A) Sort by `latestFinished(result).finished_at`, and delete `rememberFinished` and the page's `finished` map.
- B) Keep the page-remembered finish beside `previous`.

**Decision**: A. `previous` holds the last finish on a reload and in a second tab, which the page's memory never did, so B keeps code whose only job is now done better by the document. The one behavior that moves: a package whose only run failed sorts by title rather than by its failure time, since it has no finished result to show either.

## Self-Review

Stage 3, unattended. Roles: Senior Engineer (consistency with REPORT-143, RD-4 pass 2 and the function as built), Security Engineer, QA Engineer, the researcher using the page, and a WCAG accessibility reviewer. Each finding was checked against the code or the other specs before it was written; findings that did not survive were dropped.

### Senior Engineer

#### RESOLVED: R8 read a runner document with no `state` as a live session
`queuePackages` (`run-package.ts:201` at `bfbda61`) merges `{queue, platform_id, updated_at}` into the runner document on every append, and `ensureVm` writes `state: "starting"` only after `RunMicrovm` answers (`recordLaunch`, `ensure-vm.ts:232-239`). A first launch that fails therefore leaves a document with a queue and no state, which R8's "exists and is not `terminated` or `failed`" counted as a session that would take the work, hiding the Run control the researcher needs. R8 now names the states that mean a session will take it, and R30 tests the stateless document.

#### RESOLVED: R12 called a resumed run stuck for its whole remaining length
RD-4 pass 2 R20 has a resumed VM finish the package that was running when it was suspended before it takes the queue, and R8 writes the status document only on a claim or a drained queue, so the document can say `suspended` while the run's stage and finish writes keep landing. R12 would have shown "stuck" over a run that then finished `done`, and its wording promised a failure that might not come. R12 now requires the result's `updated_at` to be no later than the runner document's, and the wording says the run is being checked rather than that it will fail.

### QA Engineer

#### RESOLVED: R30's no-request assertions could not fail
jsdom does not load subresources, and rendering markdown to React elements constructs no `Image` and calls no `fetch`, so a `fetch` spy and an `Image` count pass with any renderer, a remote `<img>` included. R30 now rests "makes no outbound request" on the DOM assertions (no element that would load a non-`data:` source) and says the browser-level block is the CSP's, watched in the staging check.

### Second review pass (2026-10-11, unattended)

Roles: the researcher using the page, the Senior Engineer (consistency with REPORT-143 at `1d9a677`, RD-4 pass 2 at `9397abd`, rigse `master` and report-server as built), the Security Engineer, and a WCAG accessibility reviewer. Each finding below was confirmed against that code, and where it says so, by throwaway code run in a copy of the app with react-markdown 9.1.0, remark-gfm 4.0.1 and rehype-sanitize 6.0.0 (deleted afterward). Findings that did not survive the check were dropped.

### The researcher using the page (second pass)

#### RESOLVED: Run on a stuck row never runs the package again
R7 and R12 offer Run on a stuck row as a re-run, but REPORT-143 R8 skips a package as already queued while it is outstanding, and R5 counts a `running` result as outstanding, so the request appends nothing and writes no `queued` result. `makeRunPackage` still calls `ensureVm` (`run-package.ts`), and `/work` hands out queued packages only (REPORT-143 R5), so what Run does depends on why the row is stuck:
- the runner document says `suspended` on the same VM: `ensureVm` resumes it, the VM finishes the interrupted run (RD-4 pass 2 R20), and since `/resume` writes nothing, the row keeps reading stuck and R14 keeps saying "Your machine is paused." until the run's next write, which for a run suspended in `run_package` is its finish. Run is the only thing that wakes this VM, since the watchdog resumes a suspended VM only for queued work (REPORT-143 R19).
- a newer `microvm_id`, or `terminated` or `failed`: `ensureVm` launches a VM when the recorded one is gone, which has nothing of this package to do, and the row stays stuck, Run still enabled, until the watchdog fails the result: about 7 to 9 minutes after the run's last heartbeat when its VM is gone or awake, or the declared duration plus 10 minutes when it is suspended (REPORT-143 R17). The researcher can press it again and nothing visible changes.

Recommendation: keep Run on a stuck row only when the runner document says `suspended` with the result's `microvm_id`, worded as a resume ("Paused partway through: run it to resume."), and disable it on the other stuck rows with the reason "It can be run again once it is marked failed." R30's R7 and R12 cases change to match. Resolved with the recommendation (Doug, 2026-10-11): R7 and R12 now offer Resume only on a stuck row suspended on the same VM, disable the control with the reason on every other stuck row, and R30 tests both.

#### RESOLVED: A re-run moves its row as soon as it is queued
Superseded: the page-remembered finish is gone with #204's `previous`, and R13 now orders every group by title (Doug, 2026-10-11).

R13 says a queued or running row keeps its place until its run finishes, and the RESOLVED judgment call chose `finished_at` so a row does not jump while it runs. A re-run is the case it misses: the function writes the queued result with a full `set` and no merge (`queuePackages` in `run-package.ts`, REPORT-143 R8 keeping that shape), so the old `finished_at` is gone, and the runner's claim writes `finished_at: null` (`ClassDocuments.claim` in RD-4 pass 2's `status.js`). A finished row at the top of Mine therefore drops to the by-title tail the moment Run is pressed, and comes back to the top when the run finishes, which is the jump the decision was made to avoid.

Recommendation: keep a page-local `Map<package_key, number>` of the last `finished_at` each result showed, and sort a result with no `finished_at` by that remembered value, so a re-run holds its row's place on this page; a reload sorts it with the unfinished rows until it finishes. The alternative is to reword R13 to say a re-run moves twice. Resolved with the recommendation (Doug, 2026-10-11): R13 now has the page remember each package's last `finished_at` and sort a result without one by it, and R30 tests a re-run holding its place.

### Senior Engineer (second pass)

#### RESOLVED: R21 did not say which rows count as listed
`POST /api/v1/packages/list` returns every package the reader may see with `applies` on each (`PackageJSON.index`), and `groupPackages` drops the `applies: false` rows and rows in no group. Read as "the list's rows", R21 would place a result for such a package nowhere: not in a group and not under "Packages no longer listed". That package is the main case for R21's "This package no longer applies to this class." note. R21 now says "no row the page shows in a group", R30 tests a listed `applies: false` row's result landing there, and the implementation builds the listed set from `groupPackages`'s output.

#### RESOLVED: The document table left out the timestamps R12 compares
R12 compares the result's `updated_at` with the runner document's, but the Background table did not list `updated_at` among the fields the page reads from either. Both rows now name it, with REPORT-143 R22a's rule that every runner write sets it to server time, which is what makes the comparison meaningful (RD-4 pass 2's `RunnerStatus.write` and `ClassDocuments.#stamped` set it on every write; the function's `queuePackages` and `recordLaunch` set it too).

### WCAG accessibility reviewer (second pass)

#### RESOLVED: A package's `#` heading became a second `h1` on the page
`ResultMarkdown` maps only `a` and `img`, so react-markdown renders `#` as `h1` and `##` as `h2` inside the opened result, below the page's `h1`, the Results `h2` and the result's own `h3` title (checked: `# One` rendered `<h1>One</h1>`, and a GFM footnote added an `h2` "Footnotes"). Packages are written by researchers outside Concord, so a `#` title is the likely first line. R29 now requires markdown headings to render from `h4` down, capped at `h6`, R30 tests `#` and `##`, and the renderer maps `h1` to `h6` accordingly (a mapping run in the throwaway copy rendered `h4` and `h5`).

### Security Engineer (second pass)

#### RESOLVED: R18 named the task list's checkbox but not its checked state
The narrowed sanitizer schema the implementation now uses (implementation.md, second pass) allows only the attributes R18 lists, and without `checked` a `- [x]` item renders unchecked. R18 now lists it; a throwaway render with the narrowed schema kept `checked` on the `[x]` item and not on the `[ ]` one.

### Third review pass (2026-10-14)

Roles: the researcher using the page, the Senior Engineer (against report-service `bfbda61`, RD-4 pass 2 at `0573e43`, rigse `master` `9f948f6c0` and report-server as built), the WCAG accessibility reviewer, and the QA Engineer. Each finding was confirmed in that code, and where it says so by throwaway code (deleted). REPORT-143's rules were also run in the Firestore and Auth emulators with a researcher token for class `H`, user 200: the missing runner document, the scope document and the whole results collection were readable, and another researcher's results and runner document were refused, as R1 assumes.

### Senior Engineer (third pass)

#### RESOLVED: R9's re-run example named the deleted `pull` stage
"Updating: pulling the class's data." quoted the stage RD-4 pass 2 R56a deletes (its 2026-10-14 review names this line). The example now uses a real stage in R9's Running wording.

#### RESOLVED: A refusal from the VM step was never shown
`queuePackages` commits the `queued` result before `ensureVm` runs, so a 502 from the launch or a 504 reaches the page after the row's result has already changed, and R6's "until its result changes", keyed to the result at request time, hid it at once. A throwaway render of the specced handler, with the `queued` snapshot pushed before the 502, showed no message; keyed to the result when the refusal arrives, it showed the message and cleared it at the next change. R6 now says "after the refusal arrived", and the Technical Notes' 202 window, which had the order backwards, is rewritten.

#### RESOLVED: "No longer applies" was said of a package that applies
`groupPackages` drops a row that applies but fits no group (a project-visible package of a project outside `scope.project_ids`), and resolve answers it 200 with `archived: false`, so R21 said it no longer applies. A package the list returned now takes its note from the list's row, and resolve is asked only for identities the list did not return, where `archived: true` and 404 are the only answers with a note (`list_visible` returns every visible package that is not archived).

### The researcher using the page (third pass)

#### RESOLVED: A first run read "run it to start one" while it was starting one
With no runner document, or one `terminated` overnight, the `queued` snapshot arrives while the launch is still in flight (`state: "starting"` is written after `RunMicrovm` answers), so the row showed R8's restart sentence beside a disabled Run and "Requesting…" for the whole launch, and R14 added the same sentence under "Your machine has stopped.". R8 and R14 now leave the sentence out while a request is in flight.

#### RESOLVED: The session line said "Running" a package the row said had finished
The runner changes `current_package` only at its next claim or its drained `ready`, and fetches, verifies and checks the next package before claiming it, so R14 read "Running <title>." for seconds after that row read "Finished". R14 now says so only while that result is `running`.

#### RESOLVED: Unlisted rows told the researcher to press a control they do not have
R21's rows have no Run or Resume, but R8's and R12's wording ("run it to start one", "resume it to finish") applied to them. R21 now gives them the wording without the instruction.

#### RESOLVED: A resumed run reads as paused again whenever any run is requested
`queuePackages` merges `updated_at` into the runner document on every request, appended or not, and a resumed VM writes nothing to that document until the interrupted run finishes (RD-4 pass 2 R20, R8), so its state stays `suspended`. Pressing Run on any other row, or in another class, moves the document's `updated_at` past the run's last beat, and R12 shows the resumed row as "Paused partway through: resume it to finish." with Resume enabled until the next beat, up to a minute. Pressing it is harmless (`ensureVm` sees the VM running and does nothing).
- A) Accept it and say so in R12.
- B) The page keeps, per runner `microvm_id`, the `updated_at` at which it first saw `suspended`, and R12 compares the result against that instead of the latest `updated_at`; a page loaded mid-window still shows the stale minute.
Decision (Doug, 2026-10-14): C, B plus a Resuming state. The larger gap was the wake itself: `/resume` writes nothing, so after an accepted Resume the row read paused with Resume offered until the first heartbeat, every time. R7 now shows "Resuming" until the result's next write or three minutes, and R12 compares with the session's mark (B), which a reload resets to the latest `updated_at`, today's behavior.

### WCAG accessibility reviewer (third pass)

#### RESOLVED: A refused run was silent to a screen reader
R11 put only the state line in a live region; the refusal and "Requesting…" were separate lines, so a keyboard user pressing Run heard nothing when rigse said no. R11 now puts both in the row's live region.

#### RESOLVED: Run is disabled while the button has focus
Run is a native `disabled` button while its request is pending and for most of the run that follows (R7), so pressing it drops focus to the page's `body` (checked in Chromium: focus left the button for `body`, though Tab still continued from where it had been), and a disabled button's `aria-describedby` reason is never reached by Tab.
- A) Keep `disabled`, as R29 says now.
- B) Use `aria-disabled="true"` with the click ignored, so the button keeps focus and Tab reaches its reason.
Decision (Doug, 2026-10-14): B. R29 says so; it is a few lines in the row and one assertion per test that checks a disabled Run.
