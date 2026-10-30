# researcher-dashboard: production configuration for the web app

**Jira**: https://concord-consortium.atlassian.net/browse/RD-20

**Status**: **Closed**

## Overview

The Researcher Dashboard web app (`app/`) had only ever been built for the staging portal. One build now serves learn.concord.org as well, with production's report-server and Firebase projects, and a released version is published to a fixed production URL, `https://models-resources.concord.org/researcher-dashboard/index.html`.

## Project Owner Overview

Researchers on learn.concord.org could not use the dashboard: the app recognized only the staging portal, and nothing published it anywhere production could link to. This was the last piece of the first production release; the portal, report-server, report-service functions, the runner stack and the packages ship before it, and the app's release (RD-2) waits on it.

A single build accepts launches from both portals, and each launch talks only to its own portal's servers. A tagged version can be checked at its own path, then published to the production address by a release run on Doug's go. Staging works as before.

## Requirements

### Portals and Firebase

- **R1.** `DEPLOYED` (`app/src/shell/portals.ts`) has a learn.concord.org entry beside the unchanged staging entry: report-server `https://report-server.concord.org`, Firebase project `report-service-pro`, CLUE `{ firebaseApp: "collaborative-learning", projectId: "collaborative-learning-ec215" }`.
- **R2.** `firebase.ts` has the `report-service-pro` web config, the values Activity Player and portal-report ship, its API key in the file's `atob` form.
- **R3.** A test asserts every `DEPLOYED` entry's `firebaseProject` and `clue.projectId` have a web config.
- **R4.** A test asserts, for a launch from each deployed portal, that every request carrying the access token goes to that portal or its report-server, that the Firebase tokens are minted from that portal for its report-service and CLUE apps, and that sign-in is to its own projects. Expectations come from a literal table, so a value crossed between the entries fails it.
- **R5.** `portalFor` resolves learn.concord.org; look-alike origins (another scheme, port, or a suffix host) are refused.
- **R6.** The build's CSP `connect-src` lists both portals and both report-servers, derived from `DEPLOYED` with no change to `csp.ts`.

### Production publishing

- **R7.** With `DEPLOY_PATH` set, the build also writes `dist/index-top.html`: `index.html`, CSP included, with each reference to the build's own files prefixed by `DEPLOY_PATH/`, so it works once copied to the prefix root. Without `DEPLOY_PATH` nothing extra is written. A test builds both ways.
- **R8.** Every link and asset works from `<deploy path>/index.html`, from a root copy of `index-top.html`, and on the dev server. The Info page's demo link reaches `<deploy path>/demo/`, and its "deployed at" line names the deploy path the files came from, not the prefix root.
- **R9.** App releases are tagged `app-x.y.z`, deploying to `version/app-x.y.z/`; `x.y.z` must be `app/package.json`'s version (shown in the About box), and a tag naming any other version fails the deploy workflow before anything is published.
- **R10.** `deploy-app.yml` deploys `app-*` tag pushes and branch pushes that touch `app/` or the workflow. A runner tag does not deploy the app (GitHub ignores path filters on tag pushes).
- **R11.** A push to `main` deploys `branch/main/` and, through `topBranches`, `index-main.html` at the prefix root, a root-level copy of `main` to check before a release. The workflow's header says what the action does with tags and top branches.
- **R12.** The manual Release Production workflow copies a deployed tag's `version/<tag>/index-top.html` to `researcher-dashboard/index.html`, under the existing `researcher-dashboard` deploy role.
- **R13.** The production portal's Client redirect URI and ExternalReport URL are both `https://models-resources.concord.org/researcher-dashboard/index.html`. Recorded for RD-2 and the production plan's step 7; creating the rows is out of scope.

### Documentation and checks

- **R14.** `app/README.md` names both portals in its launch section, and its Deploy section describes the tag form, `index-top.html`, `index-main.html`, the release workflow and the production URL. The top-level README gives the app's tag form.
- **R15.** The typecheck, the test suite and the build pass.
- **R16.** The deployed files are checked live, as listed under Staging checks below. *(Not yet run at close: the before-merge check needs the branch deployed, and the after-merge check needs the merge.)*

## Staging checks

Plain page loads in Playwright, with no launch and no portal change: they check what the tests cannot, the deployed files. Sign-in is not checked, since this change leaves the OAuth and launch code as it was, and the tests cover which servers and projects each portal's launch reaches.

**Before merge, on the branch deploy** (`https://models-resources.concord.org/researcher-dashboard/branch/production-config/index.html`, no query string, which shows the info page):
1. The page loads with no console errors except the existing `/favicon.ico` 404, and no CSP refusals.
2. The footer reads `deployed at models-resources.concord.org/researcher-dashboard/branch/production-config/`.
3. "Open the demo" opens `branch/production-config/demo/?scenario=ready`, and the demo loads.
4. `branch/production-config/index-top.html` is published, and its three references start with `branch/production-config/assets/`.

**After merge, before RD-2's release, on `https://models-resources.concord.org/researcher-dashboard/index-main.html`:**
1. The merge's Deploy app run published it.
2. The same checks as above, with the footer reading `deployed at models-resources.concord.org/researcher-dashboard/branch/main/`, not the prefix root, and the demo link opening `branch/main/demo/?scenario=ready`. This is the first live load of a root copy (R7, R8).

## Technical Notes

- **Production values, checked against their sources:**
  - `ReportServerURL` on the portal is the audience of the scoped token, so the app's `reportServer` and the production portal's `ReportServerURL` must both be exactly `https://report-server.concord.org`.
  - `firebaseProject` is both the portal `firebase_app` name the app asks a token for and the project it signs in to (`services.ts`). Activity Player on learn.concord.org already uses the `report-service-pro` row, and CLUE production the `collaborative-learning` row, whose project is `collaborative-learning-ec215` (CLUE's `src/lib/firebase-config.ts`).
  - `CLIENT_ID` is `researcher-dashboard` for every portal (`oauth.ts`).
- **Why the URL names `index.html`:** `redirectUriFor` turns a trailing-slash path into `.../index.html` and the portal matches redirect URIs exactly.
- **Why it is under `models-resources/researcher-dashboard/`:** the shared `S3-deploy-by-role-tag` policy grants the role only `models-resources/${aws:PrincipalTag/RepoName}/*`. Its trust policy allows any ref of the repository, so tag pushes and a manual run can both assume it.
- **s3-deploy-action (v1 = v1.8.0):** a branch lands at `branch/<name>/` less a leading Jira key, a tag at `version/<tag>/`; it never writes the prefix's `index.html`. `topBranches` copies a branch's `index-top.html` to `index-<branch>.html`. Index files get `no-cache, max-age=0`, and an S3-to-S3 `aws s3 cp` keeps that header on the released `index.html`.
- **What depends on where the HTML is:** only the built `index.html`'s three `./assets/` references and the Info page's demo link. Every other reference is module-relative. The CSP's `base-uri 'none'` rules out a `<base href>`.
- **`DEPLOY_ROOT`** (`build-info.ts`) is `new URL("..", import.meta.url)`, correct because the module sits one level below the app root in source and is bundled one level below it in `assets/`. `/* @vite-ignore */` keeps Vite from rewriting it to an `@fs` path on the dev server.
- **The `index-top` plugin is post-order:** Vite adds `index.html` to the bundle, CSP included, only in its own `generateBundle`.
- **Testing `DEPLOY_ROOT`:** under jsdom, Vitest resolves any `new URL(rel, import.meta.url)` to `http://localhost:3000/`, so its test runs in the node environment. The footer test moves the page to `/researcher-dashboard/index.html` so the page and `DEPLOY_ROOT` differ.
- **Dependencies outside this repository** (production plan): report-server's CORS must allow `https://models-resources.concord.org` (step 4), and the production portal's Client and ExternalReport rows (step 7) must exist before a production launch works.
- `npm run lint` cannot run: eslint is not among the app's dependencies, and CI does not lint.

## Out of Scope

- Creating the production portal's Client and ExternalReport rows, and deploying the other pieces of the release (`production-plan.md`).
- Running the production release itself, tagging `app-0.1.0` and publishing it: RD-2.
- A dedicated host or CloudFront distribution for the dashboard.
- Restricting `runner.yml` or `cloudformation.yml` to their own tags; they run tests only.
- Removing the staging entry, or choosing the portal per build instead of one build serving both.
- The `/favicon.ico` 404 seen on staging.

## Decisions

### Requirements

### The production URL is the prefix root's `index.html`
The deploy role can write only under `models-resources/researcher-dashboard/`, and the portal matches the redirect URI that `redirectUriFor` builds exactly. Rejected: the bare `.../researcher-dashboard/` form, and a dedicated host.

### App tags are `app-x.y.z`
The repository releases the app and runner separately, and the deploy workflow's tag filter needs to tell them apart. Rejected: `v0.1.0`.

### The release is a separate manual workflow
Doug's choice: Concord's other SPAs (activity-player, CLUE, portal-report) release this way, every production change stays on his go, and a tag can be launched at `version/<tag>/` first. The story's "from a deploy of `main` or a tag" is met as a tag deploy followed by the release run. Rejected: a tag push publishing directly, and the root following `main`.

### The demo link resolves against the app's deploy path at run time
One bundle serves both HTML files. Rejected: a second release copy of `demo/index-top.html`, and dropping the link from the root copy.

### The "deployed at" line names where the files are
From a root copy, `window.location` would hide which version is live, the question the line exists to answer.

### An app tag must match `package.json`'s version
The About box shows `package.json`'s version, so an unchecked tag could release a build that names the wrong version. The check sits in the job the deploy job needs.

### The staging checks are page loads, split around the merge
Doug's call: no sign-in check and no portal change, since the OAuth and launch code are unchanged and the tests cover each portal's destinations; the live checks cover only the deployed files. `index-main.html` exists only once `main` moves, so before merge the branch deploy is checked and R7's build test covers the root copy. The footer and demo link are on the info page, which a load with no query string shows.

### Implementation

### The deploy root is computed from `import.meta.url` in `build-info.ts`
Checked in a build served as a root copy and on the dev server. Rejected: reading the entry `<script>`'s `src` (depends on DOM order and Vite's tag injection), and a build-time constant from `DEPLOY_PATH` (wrong for a local build, and the two HTML files share one bundle).

### `index-top.html` is written only when `DEPLOY_PATH` is set
Without a deploy path there is no correct prefix, and a file that looks releasable but is not is worse than none.

### The per-portal test checks the shipped entries against a literal table
Reading expectations from the entry under test could not fail on a crossed entry (shown by mutation); hand-written configs would test only the test's own values. A coverage test fails when a portal is added without a row.

### The `report-service-pro` check joins the existing `firebaseConfig` tests
`firebase.test.ts` already had a `describe("firebaseConfig")` whose `it.each` checks each config's `projectId` and `authDomain`; `report-service-pro` joins its list beside the new every-deployed-portal test.
