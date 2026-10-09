# RD-3 pass 1: the launch and the package list

**Jira**: https://concord-consortium.atlassian.net/browse/RD-3

**Status**: **Closed**

**Pass**: 1 of 3. Passes 2 and 3 stack on this branch (sprint 28); RD-1 production's branch stacks on pass 3's.

## Overview

Replace the spike's placeholder page with the start of the real dashboard: the app launches itself from the portal's "Researcher Dashboard" link with the OAuth2 code flow, shows the class it was opened on, and lists the analysis packages that apply to that class, grouped by where they come from. Nothing runs yet; running and results are passes 2 and 3.

A researcher who follows "Researcher Dashboard" on a class in the portal today lands on the spike's page, which expects a token in the link that the portal no longer sends, so it shows only the "how to open it" page, and that page still points at a link named "Analyze Class". After this pass the same click signs the researcher in through the portal, shows the class (its name, teachers, cohorts and assignments) and lists the packages that suit it: Official ones, the class's project's own, the researcher's own, and a collapsed Community group that warns that a stranger's package runs with the researcher's access to student data.

This is the first of three passes because the page can reach a researcher long before the runner can. It needs nothing from the runner, the VM or any student data: which packages apply is decided from the class's authored content, which the portal and report-service already know. Grouping by provenance rather than by platform (RIGSE-360) and patterns plus visibility rather than a per-class catalog (RIGSE-363) are the two changes the PM should see as changes. RIGSE-359 to RIGSE-363 stay open: they are the PI's acceptance stories, and nothing here closes them.

## Requirements

### The launch

- **R1. The launch grammar is `authDomain`, `classId` and `loginHint`.** The app reads no other launch parameter: not `page`, `class`, `token` or `researcher`. A query without both an `authDomain` and a `classId` matching `^[1-9][0-9]*$` renders the info page and makes no request. A bookmarked spike link (`?page=analyze-class&class=...&token=...`) is such a query, and no compatibility shim is added for it (`final-design.md` 4).
- **R2. `authDomain` is checked against an allowlist compiled into the build before anything is requested.** It is parsed as a URL and its origin (scheme, host, port; the trailing slash the portal sends is not part of it) must equal an allowlisted portal's origin exactly. Each allowlisted portal carries the report-server URL and the report-service Firebase project the app uses with it, so no parameter decides where a credential is sent. A non-matching or unparsable `authDomain` renders the info page, saying the link is not for a portal this dashboard serves, and makes no request. The deployed build allowlists the staging portal only (`https://learn.portal.staging.concord.org`, report-server `https://report-server.concordqa.org`, Firebase project `report-service-dev`); a dev server may add one local portal from its environment, taking only http or https origins, and a production build never reads that environment.
- **R3. The authorize request.** The app makes a PKCE verifier (RFC 7636: 43 to 128 unreserved characters from a cryptographic random source), its S256 challenge (unpadded base64url of the SHA-256), and a random `state`, stores `{state, verifier, authDomain, classId, loginHint}` in `sessionStorage` under one key named for the dashboard (`researcher-dashboard:pending-launch`), and navigates to `<portal>/auth/oauth_authorize` with `client_id=researcher-dashboard`, `response_type=code`, `redirect_uri`, `state`, `code_challenge`, `code_challenge_method=S256`, `context=class:<classId>`, and `login_hint=<loginHint>` when `loginHint` is present and matches `^[1-9][0-9]*$`. No `scope` is sent, so the token carries the client's configured capabilities. `redirect_uri` is the page's own origin and path with no query or fragment, a path ending in `/` taking `index.html` (the form the `ExternalReport` URL and the redirect URIs are registered in), which must be one of the `Client`'s registered redirect URIs: an unregistered one is a 500 from the portal, not a redirect (checked live, 2026-10-09).
- **R4. `classId` is read in two places only:** R1's check and R3's `context`. Everything after the redirect (which class is shown, which `class_hash` the listeners key on, what is refreshed) comes from the token's scope through rigse's scope endpoint. This holds by construction rather than by a test: only the launch and callback handling see the launch, and the dashboard page is given nothing but the portal's configuration and the token, so no code after the redirect can read `classId`. A test asserting the page shows the scope's class could not fail.
- **R5. The callback.** A query carrying `state` with `code` or `error` is the portal's redirect back. The stored pending entry is read and removed in the same step, so it is used once, and the address bar is replaced at once (`history.replaceState`, no new history entry): with the pending launch's query when there is one, otherwise with the bare path. So no `code` or `error` stays in the URL or history whatever happens next, and a reload starts a fresh launch. A missing entry or a `state` that does not equal the stored one renders the info page ("this sign-in could not be completed; launch the dashboard again from the portal") and redeems nothing. `error=access_denied` renders the info page saying the researcher does not have research access to this class; any other `error` renders it with the error's name. Anything the launch or the callback throws (storage that refuses a write, no WebCrypto) renders the sign-in page above rather than a blank one.
- **R6. The token exchange.** `POST <portal>/oauth/token`, form-encoded, with `grant_type=authorization_code`, `client_id`, `code`, `code_verifier` and the same `redirect_uri`, no credentials mode. A 200 carries `{access_token, token_type, expires_in, scope}`; anything else renders the info page.
- **R7. The access token lives in memory only.** It is never written to `sessionStorage`, `localStorage`, IndexedDB, a cookie, the URL or a log. The verifier and `state` live in `sessionStorage` only between R3 and R5. The app does not decode, verify or read claims from the token: it holds it and presents it.
- **R8. Expiry and refusal.** When the app is about to call rigse or report-server and its token is within a minute of `expires_in`, or when either answers 401, the app re-authorizes by running R3 again from the launch it holds. Nothing re-authorizes on a timer: re-authorizing follows a call, and after load this pass calls out only to list again when the profile's URLs change (R14), so only that navigates a page the researcher is reading away. The Firebase session R10 signs in renews itself, so an idle page keeps its listener. With the portal session still alive the portal sends it straight back; with it expired (it idles out after 90 minutes) the researcher sees the portal's login first. A token less than a minute old that is refused with a 401, or is already within a minute of expiry, renders the info page instead, so a misconfigured verifier or a portal issuing short tokens cannot loop the browser. A 403 from rigse's dashboard endpoints (the researcher check failed after the token was issued, or the capability is missing) renders the info page saying research access to this class was withdrawn, and does not re-authorize. rigse's Firebase token call (R10) answers its own researcher check with a 400 and keeps 403 for a token it will not take at all, so its refusals show their message rather than that page. A 404 from the scope endpoint (the class no longer exists) renders the info page. Any other failure names what failed: the server's own `message` when it sent one, otherwise that the portal could not be reached, that the package catalog could not be reached (R21), or, for the Firebase token, sign-in and listener, R11's line that the class's profile could not be read.

### The class

- **R9. The class metadata.** `GET <portal>/api/v1/researcher_dashboard/scope` with the bearer. A `kind` other than `class` renders the info page, since this shell renders class scopes only. The page shows the class `name`, the teachers' names, the cohorts' names, and the assignments, each by `name` (or "Untitled" when null) with its `tool` when present. Its `id` is neither shown nor used, and `class_hash`, `platform_user_id`, `project_ids` and `assignment_fingerprint` are used as R10 to R16 say.
- **R10. One Firebase sign-in.** `GET <portal>/api/v1/jwt/firebase?firebase_app=<the portal's Firebase project>&class_hash=<scope's class_hash>&researcher=true` with the bearer, then a custom-token sign-in to that project with **in-memory persistence**. Firebase's default browser persistence is IndexedDB with cross-tab sync (`getAuth` in `@firebase/auth` 10.14.1 asks for `indexedDBLocalPersistence` first), so two tabs on two classes would replace each other's sign-in and one tab's reads would start failing its rules, and a refresh token for a researcher's Firebase session would outlive the tab in the storage of `models-resources.concord.org`, an origin every Concord SPA deployed there shares. Pass 1 signs in to report-service's project only; nothing signs in to CLUE's.
- **R11. One Firestore document, read and never written.** The app listens to `researcher_dashboard/<portal segment>/classes/<class_hash>`, where the portal segment is `authDomain`'s host with `.` replaced by `_`. It reads no other Firestore path in this pass and writes none, ever. A listener on one document is a `get` under the rules: the spike's ruleset deployed on `report-service-dev` (2026-09-18, read through the Firebase Rules API on 2026-10-09) has `allow get` on `classes/{classHash}` for a researcher token whose `class_hash` matches, a missing document included, and REPORT-143's rules keep that grant, and it is what lets the list follow the refresh R12 asks for. A listener the rules refuse shows a line saying the class's profile could not be read, in place of the list, rather than leaving the section empty.

### The profile refresh

- **R12. At most one refresh per page load, and only when needed.** After the first snapshot of the class document, the app calls `POST <portal>/api/v1/researcher_dashboard/refresh_profile` (no body, the bearer) when the document is missing, or its `assignment_fingerprint` differs from the scope's, or its `derived_at` is absent or older than the build's maximum profile age, 24 hours. Otherwise it calls nothing. The fingerprint is compared as an opaque string. Later snapshots never trigger a second refresh in the same page load, so a derivation that fails cannot drive a loop. The app never calls report-service's deriver itself.
- **R13. The refresh's answers.** 202 needs nothing further: the listener sees the document when the function writes it. 422 (more than 500 distinct assignment URLs or 256 KiB of them) and 503 (the refresh path is not configured) show rigse's `message` in place of the package list when there is no profile to list from, or as a line above a list built from the existing profile. 401 and 403 are R8's.

### The package list

- **R14. The list call.** When the class document exists, the app calls `POST <report-server>/api/v1/packages/list` with the bearer, `Content-Type: application/json` and `{"scope_urls": [...]}`: the document's `assignment_urls` followed by its `interactive_urls`, as stored, not deduplicated or trimmed, which is the same set RD-4 pass 2's runner sends to `applies` (its R34). It lists again only when either array changes, not on every snapshot; the previous list is taken away while the new call is pending, and only the answer to the latest call is rendered: an earlier call that answers late is discarded.
- **R15. No profile, no list.** Until the first snapshot, and while the class document is missing, the page says it is reading the class's activities, in place of the list; while a list call is pending, it says it is listing the packages that apply. R13 replaces that line when the refresh was refused. When the document has `truncated: true`, a line says the class's content was too large to read completely, so a package may be missing from the list.
- **R16. Only `applies: true` rows are listed.** A package matching nothing is absent rather than shown in a second state. Archived packages are never in report-server's answer, so the app has no archived rule in this pass.
- **R17. Grouping by provenance**, each row in the first group it qualifies for, in this order:
  1. **Official**: `official` is true.
  2. **One section per project of the scope**: `visibility` is `project` and `project.id` is in the scope's `project_ids`, headed by `project.name`, or "Project <id>" when report-server could not name it. report-server returns a project-visible package only to a holder of a grant on its project, so these are the scope's projects the researcher holds a grant on.
  3. **Mine**: `mine` is true (report-server's `administers?`: the researcher's own `users/<id>` packages, and `projects/<id>` packages on a project they hold a grant on), at any visibility.
  4. **Community**: `visibility` is `public`, not official and not mine.

  A row in none of them (a project-visible package on a project the scope does not belong to, not the researcher's) is not listed. A group with no rows is not rendered. Project sections appear in the order of the scope's `project_ids`.
- **R18. Order within a group:** by title, `current_version.title` falling back to `name`, compared case-insensitively. Jira's "official first" holds by construction, since R17 puts every official row under Official, so no sort key expresses it. (Pass 2 orders every group but Official by most recently run, once it reads results.)
- **R19. Community is collapsed by default** as a disclosure control whose label names the group and its count, and its expanded body opens with the disclosure (`final-design.md` 5.6 and 11.3): these packages are not reviewed by Concord; running one runs a stranger's code with your access to student data, and nothing stops it sending that data elsewhere. Every other group is expanded.
- **R20. A row** shows the title, `current_version.version`, `current_version.description` and the identity. This pass shows no result state and no run control; both are pass 2's. It does not read `runnable`: report-server marks every non-official package unrunnable while its `unreviewed_runs` setting is off, and how a row says so belongs with the run control.
- **R21. Empty and failed lists.** No applicable package renders "No packages apply to this class yet." A list call that fails renders a line in place of the list: report-server's `message` for a 4xx or 5xx with one, otherwise that the package catalog could not be reached. A failure that never reaches the app as a response (CORS, network) is the second case. 401 is R8's.

### What the page says and is called

- **R22. The renames of `final-design.md` 3 that this pass can make.** `ANALYZE_CLASS`, `pageFor` and `AnalyzeClass.tsx` are deleted; the page is `ClassDashboard.tsx`. No "Analyze Class", "Analyzing" or "Analyses" text remains in `app/`. ("Run", "Running <package>" and "Results" arrive with the controls and results of passes 2 and 3.)
- **R23. The info page** names the portal's link as it is labeled, "Researcher Dashboard", on a project's Research Classes page, and describes what the dashboard shows without the "Analyze Class" feature name. It keeps showing the build version and deployed path. It renders a reason for each refusal above: no launch, an unrecognized portal, a sign-in that could not be completed, access denied, access withdrawn, a class that no longer exists, an unsupported scope kind, and an expired or refused token that could not be renewed.
- **R24. What this pass orphans is deleted, with its tests.** With the spike page gone, nothing calls `Portal.runPackage`, `Display.tsx`, `shell/display.ts`, `shell/status.ts`, the CLUE project's config, `watchClueDocuments`, `inClass`, or `paths().researcher` and `paths().results`, and the 409-retry goes with the page that held it (Jira: deleted rather than extended). The JSON `display` parser is not kept for pass 3: results are now markdown (`final-design.md` 9), and pass 3 brings the renderer.
- **R25. Prose this pass invalidates is updated.** `app/README.md`'s launch section (the `?page=&class=&token=` URL, "RESEARCHER_DASHBOARD_URL", the "What it reads" table) and the root `README.md`'s first line ("The Analyze Class researcher dashboard"), the one file outside `app/` this pass touches. RD-4 pass 2 rewrites the same line, so this pass uses its wording, and whichever branch merges second merges that line cleanly.

### Accessibility

- **R26. The page is navigable by keyboard and by a screen reader.** The class name is the page's one `h1`; each group is a section under its own heading, its rows a list. Community's heading sits outside its disclosure, which is a native control (`<details>` and `<summary>`) operable from the keyboard, whose expanded state assistive technology reports and whose label carries the count. A heading inside `<summary>` is not reliably a heading to a screen reader, since `summary` is exposed as a button-like control whose children are presentational. The status lines (loading the class or the failure in its place, reading the class's activities, listing the packages, a refused refresh, a failed list, a truncated profile) are in a polite live region, so a change is announced without moving focus. Every info page reason is text, not color alone.

### Tests

- **R27.** The app's suite (vitest, jsdom) covers, without a network: R1's refusals; R2's allowlist (an exact-origin match, a lookalike host, a different scheme, a port, the trailing slash); R3's authorize URL, parameter by parameter, and a challenge equal to RFC 7636 appendix B's for its verifier; R5's state mismatch and missing entry, and that the entry is gone after one use; R6's exchange body and the replaced URL; R5's launch that throws; R7's token in no Web Storage after a full launch; R8's re-authorize on 401, the young-token stop, the 403 page and each unreachable line; R12's exactly one refresh for each of missing, changed fingerprint and old `derived_at`, and none for a current profile or on a second snapshot; R14's body and its re-list only on a URL change; R16 to R19's filtering, grouping, order and collapsed Community with its disclosure; R10's in-memory persistence; R11's refused listener; R26's headings, list and native disclosure. Each test names the line whose deletion it catches.

## Technical Notes

- **rigse's side, as merged** (`master` `9f948f6c0`). Authorize is `GET /auth/oauth_authorize`; unauthenticated it redirects to the login page with `app_name` and comes back to itself. `login_hint` that does not match the signed-in user shows a mismatch page with "continue" and "switch user". The code lives five minutes and is single use. `POST /oauth/token` accepts form or JSON and answers RFC 6749 errors (`invalid_grant` 400); for a public scoped client it signs an RS256 access token with `aud` naming the portal and report-server, TTL eight hours (`SignedJwt::SCOPED_ACCESS_TOKEN_TTL`), `Cache-Control: no-store`. CORS: `/oauth/token` POST (preflight answered for `content-type`, checked live), `/api/v1/researcher_dashboard/*` GET and POST, `/api/v1/jwt/*` GET, all from any origin with any headers. The dashboard controller's refusals are `{success: false, response_type: "ERROR", message, details}`: 401 for a credential that does not verify or is unscoped, 403 for a context that is not a class, a missing capability or a failed researcher check, 404 for a class that no longer exists.
- **The scope endpoint's body**: `{kind, id, name, class_hash, platform_user_id, teachers: [{id, name}], cohorts: [{id, name}], project_ids, assignment_fingerprint, assignments: [{offering_id, runnable_id, name, url, tool}]}` (`speccing.md`, RIGSE-368's contracts). `refresh_profile` answers 202 `{queued: true, assignment_fingerprint}`.
- **The profile document** (REPORT-142): `platform_id`, `assignment_urls`, `interactive_urls`, `content_urls`, `unread`, `assignment_fingerprint`, `derived_at` and `requested_at` (timestamps), `truncated`. Written whole by the function only.
- **The list row** (report-server `PackageJSON.index/1`, plus REPORT-167's `applies`): `catalog_id, identity, origin, name, maintainer, visibility, official, runnable, mine, project: {id, name} | null, current_version: {version, checksum, title, description, urls, clue_prepull, expected_duration_seconds, published_at}, applies`. An access-token read lists official, public, the researcher's own, and project-visible packages on their granted projects (`Packages.list_visible/1`); `mine` is `administers?`, which is true for every `projects/*` package when the researcher is a site admin (`allowed` is `:all`), so a site admin's Mine group can be long. That is report-server's definition and the app does not second-guess it.
- **CORS on the list** (`CatalogCors`, read at `64c0c09`). It sends a bearer-carrying answer only to an origin in `PACKAGES_CORS_ORIGINS`; REPORT-167 extends it to answer the JSON POST's preflight. Staging's `PackagesCorsOrigins` on `report-service-qa` is empty (read 2026-10-09), and a preflight from `https://models-resources.concord.org` asking for `authorization` is refused 403 today. So the deployed app's list fails on staging until that parameter includes `https://models-resources.concord.org`. A request with no `Origin` (curl) passes untouched, so only a browser check finds this.
- **The `Client`'s redirect URIs.** Staging's `researcher-dashboard` `Client` registers `.../researcher-dashboard/branch/main/index.html` only. `redirect_uris` is a space-separated list, so a branch build launched before the merge needs its own URL added in the admin UI (`.../branch/pass-1-launch-and-package-list/index.html`: the deploy action drops the branch's leading `RD-3-`); without it, the portal answers 500.
- **The Firebase app name** in `jwt/firebase` is a rigse `FirebaseApp` row; staging's `report-service-dev` row is the one the spike's page used.
- **Existing seams kept:** `shell/firebase.ts`'s per-project named apps, emulator wiring (`VITE_FIRESTORE_EMULATOR` with `VITE_AUTH_EMULATOR`), `portalSegment` and `watchDoc`; `Portal`'s injected `fetchImpl` and its error handling, which keeps the server's own `message`; `build-info.ts`; `vite.config.ts`'s relative `base`, so the same build serves under any `branch/` or `version/` path and `redirect_uri` is derived from where it is served.
- **Checked by running it (2026-10-09, throwaway code, deleted).** Under the app's vitest and jsdom: WebCrypto's SHA-256 with unpadded base64url reproduces RFC 7636 appendix B's challenge, and 32 random bytes encode to a 43-character verifier rigse's `PKCE_VALUE` accepts; `initializeAuth(app, {persistence: inMemoryPersistence})` followed by `getAuth(app)` returns the same instance and takes `connectAuthEmulator`; `history.replaceState` rewrites the query without a history entry. Against staging: the authorize request with `context` redirects to the login page with `app_name=Researcher Dashboard`, without `context` it comes back with `error=invalid_request&state=...`, with an unregistered `redirect_uri` it is a 500; `POST /oauth/token` with a form body and a bad code answers 400 `{"error":"invalid_grant"}`; the token endpoint's preflight from the app's origin passes and report-server's bearer preflight is refused 403.
- **Local tooling.** On this machine Node is under nvm, not asdf: `PATH=$HOME/.nvm/versions/node/v22.17.1/bin:$PATH npm ci && npm test`. `npm run lint` fails, since `eslint` is not a dependency.

### Prerequisites outside this repository

None of these block the spec; each blocks the staging check of the implementation, and none is this pass's code.

- **REPORT-167 deployed to report-server staging** (tracker 2.3): the list route and its CORS preflight. Done 2026-10-09, report-server `1.13.0-pre.1` (#123).
- **`PackagesCorsOrigins` on `report-service-qa`** set to `https://models-resources.concord.org`, a parameter-only update like `PortalPublicKeys`'s (2026-10-07). Production's later, with RD-1 production.
- **The class-profile half of report-service on staging** (`plan.md` sprint 27 ops steps): the functions' `PORTAL_PUBLIC_KEYS` PR, the `researcherDashboard` and `deriveProfileWorker` deploy with `RD_AUTHORING_HOSTS`, and rigse's `ResearcherDashboardFunctionURL`. Without them the refresh answers 503 and no class has a profile, so the list never renders.
- **Nothing from REPORT-143.** The `classes/{class_hash}` `get` is already granted by the spike's ruleset deployed on `report-service-dev` (R11). `report-service`'s `master` has no dashboard rules at all, so a rules deploy from `master` before REPORT-143 lands would remove the grant; REPORT-143's deploy restores it in its final form.
- **This branch's URL among the staging `Client`'s redirect URIs**, for a check before the merge.
- **A staging class with the Wildfire module assigned** and a researcher grant reaching it, and at least one package published there, for the list to have something to show. Done 2026-10-09: class 590, "Researcher Dashboard Wildfire", in project 20, assigning material 604 only (#108), and `projects/20/wildfire-responses` 1.0.0 published official (`catalog_id` 2, #119).

### Clauses covered

Jira's clauses for the whole story, and which pass carries each.

| Clause | Pass |
|---|---|
| Launch: `authDomain` allowlist, code flow with PKCE, token in memory, re-authorize on expiry (Jira's `?token=`/`iss` wording is superseded by `final-design.md` 4) | 1 |
| `page` optional / unrecognized page to the info page (superseded: the launch has no page, `final-design.md` 4); no shim for `page=analyze-class` | 1 |
| Scope metadata call | 1 |
| `POST /api/v1/packages/list` with `scope_urls`; only `applies: true` listed; no matcher in the app | 1 |
| `classes/{class_hash}` listener for the profile, read for the profile and nothing else | 1 |
| Conditional profile refresh through rigse, never the deriver | 1 |
| Grouping (Official, project, Mine, Community), Community collapsed with the disclosure | 1 |
| Order: official by title, then most recently run | 1 (by title; official first by R17's grouping), 2 (most recently run) |
| Archived package not listed | 1 (report-server's answer) |
| `ClassDashboard.tsx` rename; info page's link name | 1 |
| Package-key and identity handling asserted against REPORT-167's `fixtures/package-contract.json` | 2 (the first pass that derives a `package_key`) |
| Listeners on `classes/{h}/researchers/{uid}`, its `results/`, `runners/{uid}`; row state not run, queued with position, running with stage, done, failed; queued as a runner fact; 409-retry gone | 2 (the 409-retry is deleted in 1 with the spike page) |
| The line saying results and counts are this researcher's own | 2 |
| "Run", "Running <package>" labels | 2 |
| `stuck` from `running` beside `suspended` | 3 |
| `display.md` rendering: no raw HTML parsed, scheme allowlist, sanitizer behind it, CSP `<meta>` first in `<head>`, `img-src`; `summary.txt` as text; freshness on the row; "Results" heading | 3 |
| Counts above the list from the researcher's scope document | 3 |
| A result citing an archived package renders with the archived note | 3 |
| Never write Firestore; never hold a runner-claim token; no per-class enable UI | every pass |

## Out of Scope

- Running a package, the result and runner listeners, row states, the queue, the session state (pass 2).
- The markdown renderer, its CSP, `stuck`, counts, freshness, the archived note on results (pass 3).
- The live CLUE document count and any CLUE sign-in; RIGSE-360's live log and student counts, which have no story yet (`plan.md`, "What this order costs").
- Production portals in the allowlist, production Firebase config, and production `Client`/`ExternalReport` rows (RD-1 production).
- Any change to rigse, report-server, report-service functions or their stack parameters; the prerequisites above are ops steps or other stories.
- Closing or transitioning RIGSE-359 to RIGSE-363.

## Staging check

Passed on 2026-10-09 against the branch build at `93ca767`, as `dougresearcher` (user 200), launched from class 590's "Researcher Dashboard" link on project 20's Research Classes page with the path changed to `branch/pass-1-launch-and-package-list`:

1. The code flow came back to the launch query with no `code` in the address bar.
2. The page showed class 590, "Researcher Dashboard Wildfire", with its teacher, cohorts and its one assignment.
3. The profile was missing: "Reading this class's activities…" showed, one `refresh_profile` answered 202, and the list replaced it within seconds. A reload listed at once with no `refresh_profile`.
4. The list's request carried the bearer, and as `scope_urls` the assignment URL followed by the three derived interactive URLs (multiple choice, open response, the Wildfire model). report-server answered from the app's origin, and Official listed `projects/20/runner-smoke` and `projects/20/wildfire-responses`, both `applies: true`. On class 223, `runner-smoke` was `applies: false` and absent.
5. After the launch, `sessionStorage` and `localStorage` were empty, the app set no cookie, and the only IndexedDB database was Firebase's heartbeat store, which holds a date.
6. With class 223 open in a second tab, class 590's tab kept its list and logged no listener error.

Once PR #3 merges, the branch's redirect URI comes off the staging `Client`.

## Decisions

### Requirements

#### A listener on the class document, rather than a single `get`
**Context**: `plan.md` and `fy26-sprint-26.md` describe pass 1 as "one read of `classes/{class_hash}`"; the Jira description has a listener on it.
**Options considered**:
- A) One `onSnapshot` listener on that one document.
- B) One `getDoc`, and the list stays as it was until a reload.

**Decision**: A. The refresh is asynchronous, so after asking for one, a single `get` leaves the page on the missing or stale profile until the researcher reloads, and a first launch on a class would never show a list without a reload. A one-document listener is a `get` under the rules, reads the same single document, and is what "one read" was contrasting with: a Firestore-free pass (R11).

#### `classId` goes into the authorize request
**Context**: Channel #59 says the app must not use `classId`. The authorize request needs a context.
**Options considered**:
- A) Forward it as `context=class:<classId>` and read it nowhere else.
- B) Send no context.

**Decision**: A. B was checked live on staging: rigse refuses it with `invalid_request`. `final-design.md` 4 says `classId` is what the app asks for and the token's `context` is what it holds, which R4 makes testable (R3, R4).

#### Delete the spike's display and status code now rather than leave it for passes 2 and 3
**Context**: Deleting `AnalyzeClass.tsx` leaves `Display.tsx`, `display.ts`, `status.ts` and the CLUE wiring with no caller.
**Options considered**:
- A) Delete them with their tests (R24).
- B) Keep them for passes 2 and 3 to adapt.

**Decision**: A. Their contracts are the spike's: `display` as JSON sections where results are now markdown, the status document at `researchers/` where it is now `runners/` with a `queue`, a 409 queue the design deletes. Passes 2 and 3 write against the new contracts, and dead modules with passing tests read as supported code.

#### 24 hours as the profile's maximum age
**Context**: R12. `final-design.md` 5.5 says re-authored activity content is caught by "the configured maximum age" and gives no value. Shorter catches a re-authored activity sooner and costs a derivation (up to 500 public fetches) per class per period, shared by every researcher of the class.
**Options considered**:
- A) 24 hours, a build constant.
- B) 1 hour.
- C) 7 days.

**Decision**: A. A changed assignment set is caught on the next launch by the fingerprint whatever the age, so the age bound only covers an activity re-authored in place, which is rare during a study and almost never matters within a day. One derivation per class per day is cheap (the deriver fetches public authoring JSON five at a time with a 15-second timeout, `derive-profile.ts`), while an hour would re-derive on most working sessions for no change. It is one constant in the build config, so it can move without a design change.

#### The staging-only allowlist
**Context**: R2. Production's portals cannot launch the dashboard until RD-1 production creates their `Client` rows and report-server's `PackagesCorsOrigins` there, and production's Firebase config is not in the app.
**Options considered**:
- A) Staging only in this pass; RD-1 production adds `learn.concord.org` (and the NGSS portal, if it gets the dashboard) with report-server and `report-service-pro`.
- B) Add production's entries now, unusable until RD-1 production's ops steps.

**Decision**: A. RD-1 production is the line that owns "a production launch end to end from the portal link to a rendered result", and its values (production report-server's URL as rigse's `REPORT_SERVER_URL` holds it, `report-service-pro`'s web config) are not recorded anywhere this pass can check. An entry nobody can exercise is a guess that looks configured. The allowlist is one map, so adding a portal is one entry.

#### The Firestore prerequisite named the wrong rules
**Decision**: The spec said the `classes/{class_hash}` read waited on REPORT-143's rules, which are not implemented. The ruleset deployed on `report-service-dev` (the spike's, 2026-09-18, fetched through the Firebase Rules API) already grants it, and `master`'s `firestore.rules` has no dashboard block. R11 and the prerequisites now say so, including that a rules deploy from `master` before REPORT-143 would remove the grant.

#### A trailing-slash URL would derive an unregistered `redirect_uri`
**Decision**: `Client#check_redirect_uri` matches a registered URI exactly and an unregistered one is a 500 (checked live). A page reached at `.../branch/main/` would send `.../branch/main/`. R3 now appends `index.html` to a path ending in `/`.

#### Timer-driven re-authorization would navigate a reader away
**Decision**: R8 re-authorized "before `expires_in` runs out", a full-page redirect in the middle of reading, and after the portal's 90-minute idle timeout a redirect to its login page. Pass 1 calls rigse and report-server only at load and on a profile change, and the Firebase session renews itself. R8 now re-authorizes only on a call made with a token about to expire, or on a 401.

#### A late list answer could overwrite a newer one
**Decision**: R14 re-lists when the profile's URLs change, which happens while the first call can still be in flight (the refresh lands a few seconds after launch). R14 now renders only the latest call's answer.

#### An absent `derived_at` was not covered by R12
**Decision**: R12 now treats an absent `derived_at` as old.

#### The app's origin is shared with every SPA on `models-resources`
**Decision**: `deploy-app.yml` publishes to the shared `models-resources` bucket, so `sessionStorage` and IndexedDB belong to an origin other Concord apps also run on. R3 names its storage key for the dashboard, and R10's rationale now includes that a persisted Firebase session would sit in that shared storage.

#### No accessibility requirement for a new page
**Decision**: The spec had none for a page of grouped lists with a collapsed group and changing status lines. R26 adds the heading structure, a native disclosure for Community and a polite live region for status, and R27 tests them.

#### Every unreachable server read as the package catalog
**Decision**: The throwaway build's `refused` fell back to "The package catalog could not be reached." for any error that was not an `ApiError`, so a network failure on the scope call, or a Firebase sign-in that failed, said the catalog was unreachable (both checked with throwaway tests). R8 now names what failed, and R21 keeps the catalog line for the list alone.

#### A launch that throws left a blank page
**Decision**: `start()` rejects when `sessionStorage.setItem` throws (checked with a throwaway test), and `main.tsx` renders only on success. R5 now renders the sign-in page for anything the launch or callback throws.

#### R8 said a reading page is never navigated away from
**Decision**: A profile whose URLs change re-lists (R14), and with an expired token that call re-authorizes, which navigates. R8 now says that is the one case. Its duplicated "with the portal session still alive" and R9's "not shown or used beyond display" are fixed with it.

#### R18's "official first" could never apply
**Decision**: R17 puts every official row under Official, so no other group holds one and Official holds nothing else. Deleting the sort key left the throwaway build's 61 tests green. R18 now orders by title and says why "official first" holds by construction, and the clauses table says so.

#### R20 was silent on `runnable`
**Decision**: report-server answers `runnable: false` for every non-official package while `PACKAGES_UNREVIEWED_RUNS` is off (`Packages.unrunnable_reason`). R20 now says this pass does not read `runnable`, and that marking an unrunnable row belongs with the run control.

#### The class's loading line and its failure were not announced
**Decision**: `ClassDashboard` renders "Loading the class…", and a failure in its place, as bare text in `<main>`, outside the live region. R26 now includes them.

### Implementation

#### A report-server 403 on the list
**Context**: The throwaway build's `refused()` sent every 403 to the withdrawn page, where R21 shows report-server's message.
**Options considered**:
- A) Show report-server's message; only rigse's 403 renders the withdrawn page.
- B) Render the withdrawn page for every 403.

**Decision**: A (Doug, 2026-10-09). Only rigse's 403 means the researcher check failed. `refused` takes which server refused.

#### Resolve the launch before React renders
**Context**: The callback must redeem its code exactly once.
**Options considered**:
- A) A plain async `start()` in `main.tsx`, then render the result.
- B) A `useEffect` in `App` with a ref guarding against StrictMode's second run.

**Decision**: A. Under StrictMode, B's effect runs twice in development and the second run finds the pending entry already removed, so it needs a guard whose only job is to undo React's development check; and a component that navigates away during render is awkward to test. A keeps every side effect of the launch in one function with injected dependencies, which `start.test.ts` exercises without rendering anything.

#### One `Api` class for both servers
**Context**: rigse and report-server take the same bearer and both need the expiry and 401 handling.
**Options considered**:
- A) `Api` holds origin, token and `fetch`, and `Portal` and `ReportServer` are thin wrappers over it.
- B) Keep `Portal.request` and give `ReportServer` its own copy.

**Decision**: A. The expiry margin and the young-401 rule have to agree for both servers, and one implementation is the only way to keep them agreeing. `PortalError` becomes `ApiError`, since it is no longer the portal's alone.

#### Inject a services object into the page rather than mock modules
**Context**: `ClassDashboard` talks to rigse, report-server and Firestore.
**Options considered**:
- A) `DashboardServices` passed as a prop, with `makeServices(config, token)` building the real one.
- B) `vi.mock` the Firebase and fetch modules in the page tests.

**Decision**: A. The page tests drive snapshots by hand (missing, then present; URLs changed; an answer held back), which needs control of the listener callback that a module mock gives only awkwardly. The one thing that needs a module mock, the persistence argument to `initializeAuth`, has its own small test.

#### R4's planned test could not fail
**Decision**: `ClassDashboard` in the throwaway build receives only `services` and `onExpired`; the `Launch` never reaches it (checked in the patch). A test that the page shows the scope endpoint's class rather than the launch's is true by construction. R4 now states the structural guarantee, R27 no longer claims a test for it, and the step says the page receives no launch.

#### A refused profile listener left the packages section silently empty
**Decision**: `watchDoc`'s error callback only logs (`app/src/shell/firebase.ts` on `main`), and the page renders nothing for a profile that never arrives: no reading line, no list, no reason. R11 now asks for a line, and the profile step adds `onError` to `watchDoc` and a test.

#### Community's heading sat inside `<summary>`
**Decision**: The throwaway build's `<summary><h3>…</h3></summary>` puts the heading inside a control whose children are presentational. The heading now precedes the disclosure in its own section, and the summary's text names the count.

#### The refresh-once test could not fail
**Decision**: Its second snapshot was `null` again. React skips a state update to the same value, so the refresh effect never re-ran, and deleting the `refreshed` ref left the suite green. Two distinct stale profiles catch it: with the ref deleted, the refresh was called twice. The profile step's tests now say so.

#### No test could catch deleting the official sort key
**Decision**: Every official row is grouped under Official (R18), so `byOfficialThenTitle`'s first comparison never decided anything, and deleting it left the suite green. The key is deleted and the comparator is `byTitle`.
