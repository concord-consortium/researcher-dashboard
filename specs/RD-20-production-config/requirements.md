# researcher-dashboard: production configuration for the web app

**Jira**: https://concord-consortium.atlassian.net/browse/RD-20
**Repo**: https://github.com/concord-consortium/researcher-dashboard
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

The Researcher Dashboard web app (`app/`) has only ever been built for the staging portal. This story makes one build serve learn.concord.org as well, with production's report-server and Firebase projects, and gives it a production URL that a released version is published to.

## Project Owner Overview

Researchers on learn.concord.org cannot use the dashboard yet: the app only recognizes the staging portal, and nothing publishes it anywhere production can link to. This is the last piece of the first production release; every other piece (portal, report-server, report-service functions, the runner stack and the packages) ships before it, and the app's release (RD-2) waits on it.

When this is done, a single build accepts launches from both portals, each launch talks only to its own portal's servers, and a tagged version can be published to a fixed production address that the production portal's link points at. Staging keeps working exactly as it does now.

## Background

The app trusts a portal only if it is listed in `DEPLOYED` in `app/src/shell/portals.ts`. Each entry names the portal origin, its report-server, the report-service Firebase project, and the CLUE Firebase app and project. Everything the app sends a bearer to comes from the matching entry (`portalFor`), and the build's Content-Security-Policy is derived from the whole list (`app/src/shell/csp.ts`, applied by the plugin in `app/vite.config.ts`). Today the list holds only `learn.portal.staging.concord.org`, and `app/tests/launch.test.ts` asserts that `https://learn.concord.org/` is refused.

`app/src/shell/firebase.ts` holds the web configs for `report-service-dev` (staging's report-service project), `collaborative-learning-staging` and, already, `collaborative-learning-ec215` (CLUE production). It has no `report-service-pro`.

`.github/workflows/deploy-app.yml` publishes with `concord-consortium/s3-deploy-action@v1` (currently v1.8.0) to `models-resources/researcher-dashboard/`. Reading that action's source:

- A branch deploys to `branch/<name>/` (less a leading Jira key) and a tag to `version/<tag>/`. Nothing in the action ever writes the prefix's own `index.html`.
- `topBranches: ["main"]` copies `branch/main/index-top.html` to `index-main.html` at the prefix root, not to `index.html`, and only for the `index-top.html` files the build emitted. The app emits none, so today that setting does nothing. The workflow's header comment ("copies a top branch to the prefix root") overstates it.
- The action sets `DEPLOY_PATH` (`version/<tag>` or `branch/<name>`) in the build's environment so a build can write an `index-top.html` whose references carry that path.

Concord's other SPAs on `models-resources` (activity-player, CLUE, portal-report) release a version with a separate `workflow_dispatch` workflow that copies `version/<tag>/index-top.html` to the prefix's `index.html`. `https://models-resources.concord.org/researcher-dashboard/` and `.../index.html` answer 404 today; `branch/main/` answers 200.

## Requirements

### Portals and Firebase

- **R1.** `DEPLOYED` gains a learn.concord.org entry beside the unchanged staging entry:
  - `origin: "https://learn.concord.org"`
  - `reportServer: "https://report-server.concord.org"`
  - `firebaseProject: "report-service-pro"`
  - `clue: { firebaseApp: "collaborative-learning", projectId: "collaborative-learning-ec215" }`
- **R2.** `firebase.ts` gains the `report-service-pro` web config, with the values Activity Player and portal-report already ship for that project (API key kept in the file's `atob` form). The existing `collaborative-learning-ec215` config stays as it is.
- **R3.** A test asserts that every `DEPLOYED` entry's `firebaseProject` and `clue.projectId` have a web config in `firebase.ts`, so an entry added without its config fails the suite rather than failing at sign-in.
- **R4.** A test asserts, for a launch from each deployed portal, that every request carrying the access token goes to that entry's `origin` or `reportServer`, that the Firebase tokens are minted from that portal for that entry's `firebaseProject` and `clue.firebaseApp`, and that sign-in is to that entry's `firebaseProject` and `clue.projectId`. The staging and production entries are each checked, so a crossed value between them fails it.
- **R5.** `portalFor("https://learn.concord.org/")` resolves to the production entry; look-alike origins (another scheme, port, or a suffix host) are still refused. The existing staging assertions stay.
- **R6.** The build's Content-Security-Policy `connect-src` lists both portals and both report-servers. This follows from `DEPLOYED` with no change to `csp.ts`; the existing CSP tests keep covering it.

### Production publishing

- **R7.** When the build runs with `DEPLOY_PATH` set, it also writes `dist/index-top.html`: the same document as `dist/index.html` (Content-Security-Policy included) except that each reference to the build's own files is prefixed with `DEPLOY_PATH/`, so the file works once copied to the prefix root. Without `DEPLOY_PATH` (local builds, CI's build-and-test job), no `index-top.html` is written and `index.html` is unchanged. A test builds with a `DEPLOY_PATH` and asserts that every reference in `index-top.html` to the build's own files carries that path and names a file the build wrote, and that the two files differ only in those references.
- **R8.** Every link and asset the app loads works from three places: `<deploy path>/index.html`, a copy of `index-top.html` at the prefix root, and the dev server. In particular the Info page's demo link reaches `<deploy path>/demo/` from the root copy, where a page-relative `demo/` would 404, and the Info footer's "deployed at" names the deploy path the files came from (`.../version/app-0.1.0/`), not the prefix root the copy is served at.
- **R9.** App releases are tagged `app-<x.y.z>` (the README's `app x.y.z` release line, in the form the runner's artifacts already use, `runner-0.1.0`), so `app-0.1.0` deploys to `version/app-0.1.0/` and the build reports `app-0.1.0` as its version. The tag's `x.y.z` is `app/package.json`'s `version`, which the About box shows as `v<version>`: a pushed `app-*` tag that names any other version fails the deploy workflow before anything is published.
- **R10.** `deploy-app.yml` deploys on a push of an `app-*` tag and on branch pushes that touch `app/` or the workflow, as now. A tag that is not `app-*` (a runner tag) does not deploy the app. (GitHub ignores path filters on tag pushes, so without a tag filter every tag would deploy the app.)
- **R11.** A push to `main` still deploys `branch/main/` as now, and, since `index-top.html` now exists, `topBranches` also publishes `index-main.html` at the prefix root, a root-level copy of `main` that exercises R7 and R8 before any release. The workflow's header comment says what the action actually does with tags and top branches.
- **R12.** A manual release workflow publishes a tagged version at the production URL `https://models-resources.concord.org/researcher-dashboard/index.html` by copying `version/<tag>/index-top.html` to `researcher-dashboard/index.html`, run by hand with the tag as input, under the existing `researcher-dashboard` deploy role.
- **R13.** The production portal's Client redirect URI and ExternalReport URL are `https://models-resources.concord.org/researcher-dashboard/index.html`. `redirectUriFor` turns a trailing-slash path into `.../index.html`, so naming `index.html` in both keeps the launch URL and the redirect URI identical. This is recorded for RD-2 and the production plan's step 7; creating the rows is out of scope.

### Documentation and checks

- **R14.** `app/README.md`'s Deploy section describes the tag form, `index-top.html`, `index-main.html`, the release step and the production URL, and its launch section names both portals in the allowlist.
- **R15.** The typecheck, the test suite and the build pass.
- **R16.** Checked on staging (the steps are in implementation.md's Staging checks), each staging Client redirect URI and ExternalReport change made on Doug's go and put back afterwards, as for earlier branch checks:
  - **Before merge**, the branch's own deploy (`branch/production-config/index.html`) launched from the staging portal signs in and renders the class, and its demo link and "deployed at" line are right. This proves the staging entry still works beside the production one.
  - **After merge, before RD-2's release**, `index-main.html` at the prefix root (R11) launched the same way does the same, which is the first live check of the root copy (R7, R8). Before merge, R7's test covers it.

## Technical Notes

- **Values checked against their sources** (2026-10-30), not taken from the inventory alone:
  - `report-server.concord.org` answers 200. rigse's stack template defaults its report URL to `https://report-server.concord.org/reports`, and `ReportServerURL` is the audience of the scoped token carrying `packages:read`, so the app's `reportServer` and the production portal's `ReportServerURL` must be the same string with no trailing slash. The production plan's step 1 sets `ReportServerURL=https://report-server.concord.org`, which matches.
  - `report-service-pro`: the web config is identical in portal-report `js/db.ts` and activity-player `src/firebase-db.ts`. The app uses `firebaseProject` both as the portal `firebase_app` name it asks a token for and as the project it signs in to (`services.ts`). Activity Player on learn.concord.org defaults to `firebase_app=report-service-pro` (`portal-api.ts`), so the production portal has a FirebaseApp row by that name. rigse's README names `report-service-pro` as production's `RESEARCHER_DASHBOARD_FIREBASE_APP`.
  - CLUE: `collaborative-learning/src/lib/firebase-config.ts` pairs production's portal row `collaborative-learning` with project `collaborative-learning-ec215`, and its config matches the one already in `firebase.ts` (CLUE's adds a `measurementId` the app has no use for). CLUE production signs in with that row today, so it exists on learn.concord.org.
  - `CLIENT_ID` is `researcher-dashboard` for every portal (`oauth.ts`), so the production Client uses that name.
- **Paths in Firestore:** `portalSegment("https://learn.concord.org")` is `learn_concord_org`, the segment report-service's functions use for the production portal; nothing in the app changes for it.
- **The build today** (`DEPLOY_PATH=version/v0.1.0 npm run build`, run 2026-10-30): `dist/index.html` references `./assets/main-*.js`, `./assets/styles-*.js` (modulepreload) and `./assets/styles-*.css`. Every other reference is module-relative (`new URL(..., import.meta.url)` for the logo, `./chunk.js` imports, `url(./font)` in CSS), so only those three HTML references and the Info page's `"demo/?scenario=ready"` link depend on where the HTML is. `demo/index.html` is never copied to the root and needs no `index-top`.
- **CSP:** `base-uri 'none'` rules out a `<base href>` in `index-top.html`; the references themselves must carry the path. `script-src 'self'` and `style-src 'self'` allow the prefixed paths, which are same-origin.
- **s3-deploy-action** (v1 = v1.8.0): index files are uploaded with `no-cache, max-age=0`; everything else under `version/` gets a one-year max-age and under `branch/` zero. An S3-to-S3 `aws s3 cp` copies metadata by default, so the released `index.html` keeps `no-cache`.
- **Deploy role:** the shared `S3-deploy-by-role-tag` policy grants `models-resources/${aws:PrincipalTag/RepoName}/*`, so the `researcher-dashboard` role can write the prefix root's `index.html` but nothing outside the prefix. Its trust policy allows any ref of this repository (`repo:...:*`), so tag pushes and a `workflow_dispatch` run can both assume it. This is why the production URL is under `models-resources.concord.org/researcher-dashboard/`: any other host would need a bucket, a policy and a CloudFront distribution this story does not create.
- **Tag pushes and path filters:** GitHub's workflow syntax reference: "Path filters are not evaluated for pushes of tags." The repository's `runner.yml` and `cloudformation.yml` run tests only, so an `app-*` tag running them is harmless and is left alone.
- **Checked with throwaway code** (2026-10-30, deleted afterwards):
  - A post-order Vite plugin's `generateBundle` sees the built `index.html` with the CSP already injected, and an `index-top.html` emitted from it with `./assets/` rewritten to `<DEPLOY_PATH>/assets/` differs in exactly the three references. Without `DEPLOY_PATH` nothing extra is written.
  - Served locally with the build at `rd/version/app-0.1.0/` and that `index-top.html` at `rd/index.html`, the root copy loaded under its CSP with the logo and both Lato faces, and `new URL("..", import.meta.url)` in a module bundled into `assets/` gave `rd/version/app-0.1.0/`. The same page's demo link was `rd/demo/?scenario=ready` and its footer said `deployed at localhost:8123/rd/`, the two R8 defects.
  - On the dev server, `new URL("..", import.meta.url)` is rewritten by Vite to an `@fs` path; with `/* @vite-ignore */` it is left alone and gives `/` from a module in `src/`, and the build keeps it as a runtime expression with no warning.
- **Dependencies outside this repository** (production plan): report-server's `PackagesCorsOrigins` and its API CORS must allow `https://models-resources.concord.org` (step 4), and the portal's Client and ExternalReport rows (step 7) must exist before a production launch works. Neither is this story's.

## Out of Scope

- Creating the production portal's Client and ExternalReport rows, and deploying the other pieces of the release; those are steps in `production-plan.md`.
- Running the production release itself (tagging `app-0.1.0` and publishing it): RD-2.
- A dedicated host or CloudFront distribution for the dashboard.
- Restricting `runner.yml` or `cloudformation.yml` to their own tags.
- Removing the staging entry, or choosing the portal by build environment instead of one build serving both.
- The `/favicon.ico` 404 seen on staging.

## Open Questions

### RESOLVED: Judgment call: what is the production URL?
**Context**: The inventory expected `https://models-resources.concord.org/researcher-dashboard/` and marked it UNSURE.
**Options considered**:
- A) `https://models-resources.concord.org/researcher-dashboard/index.html`, the prefix root the deploy role can write.
- B) The bare `.../researcher-dashboard/` form.
- C) A dedicated host.

**Decision**: A. The deploy role can only write under `models-resources/researcher-dashboard/`, so C needs infrastructure outside this story. A and B serve the same file, but `redirectUriFor` turns B into A, and the portal matches redirect URIs exactly, so the Client must name A; the ExternalReport names A too so the two stay identical (R13).

### RESOLVED: Judgment call: how are app tags named?
**Context**: No tag exists yet; the tag becomes the `version/<tag>/` path and the build's reported version.
**Options considered**:
- A) `app-0.1.0`, following the README's per-half release lines and the runner's `runner-0.1.0` artifact name.
- B) `v0.1.0`, as single-app repos do.

**Decision**: A. The repository releases two halves independently; a bare `v0.1.0` would not say which, and a runner tag would then be indistinguishable to the deploy workflow's tag filter (R10).

### RESOLVED: Judgment call: how does the demo link work from the root copy?
**Context**: The Info page links `demo/?scenario=ready` relative to the page, which from the prefix root is `researcher-dashboard/demo/`, a 404.
**Options considered**:
- A) Resolve the link against the app's own deploy path at run time, so one bundle serves both HTML files.
- B) Emit a `demo/index-top.html` and copy it too at release.
- C) Drop the link from the root copy.

**Decision**: A, required by R8; the mechanism is the implementation spec's. B adds a second release copy for one link and C removes something researchers use.

### RESOLVED: Is the release a separate manual workflow, or does a tag push publish to the production URL directly?
**Context**: The story's done-when says the production URL serves the app "from a deploy of `main` or a tag". s3-deploy-action never writes the prefix's `index.html`, so one of the two has to be added. RD-2 and the production plan's step 7 consume whichever is chosen.
**Options considered**:
- A) A `release-production.yml` `workflow_dispatch` workflow, input a tag, copying `version/<tag>/index-top.html` to `researcher-dashboard/index.html`: the pattern activity-player, CLUE and portal-report use. A tag push deploys `version/<tag>/` for checking; the release is a separate run on Doug's go.
- B) `deploy-app.yml` copies `index-top.html` to the root on every `app-*` tag push, so tagging is releasing.
- C) Root follows `main` (copy `branch/main/index-top.html` to `index.html` on every merge).

**Decision**: A (Doug, 2026-10-30). It matches Concord's other SPAs, keeps every production change on Doug's go, and lets a tagged version be launched at `version/<tag>/` before it is released. B would make a mistaken tag a production change, and C would put every merge on production. The story's "from a deploy of `main` or a tag" is met as a tag deploy followed by the release run.

## Self-Review

### DevOps Engineer

#### RESOLVED: The root copy cannot be checked live before merge
R16 named `index-main.html` as a pre-merge check, but s3-deploy-action publishes `index-main.html` only for a `topBranches` branch, i.e. after `main` moves; a feature branch deploys only to `branch/<name>/`, where `index-top.html` is uploaded but never copied. Fixed in place: R16 splits into the branch deploy before merge and `index-main.html` after merge, and R7 adds a build test so the root copy's references are checked before merge.

---

### Senior Engineer

#### RESOLVED: The Info footer's "deployed at" is wrong from the root copy
`Info.tsx`'s `deployPath()` strips the file name from `window.location.pathname`, so from the released `researcher-dashboard/index.html` it would say `models-resources.concord.org/researcher-dashboard/`, hiding which version is live, the question that line exists to answer. Fixed in place: R8 requires it to name the deploy path the files came from, the same location the demo link needs.

---

### Release Engineer

#### RESOLVED: Nothing kept an app tag and the app's own version in step
The app shows two versions: the About box's `v{APP_VERSION}`, read from `app/package.json` (`build-info.ts`, `Header.tsx`), and the Info footer's `BUILD_VERSION`, the ref name. R9 tied the tag to `x.y.z` but nothing checked it, so tagging `app-0.2.0` without bumping `package.json` would deploy, and could be released, as a build whose About box says `v0.1.0`. The runner has no such gap, since its Makefile names the artifact from its `package.json`. Fixed in place: R9 requires the tag to match `package.json`, and `deploy-app.yml`'s build-and-test job checks it on `app-*` tags, which keeps the deploy job, which needs that job, from publishing a mismatched tag. Checked with throwaway code: the step passes actionlint, and run in `app/` it passes for `app-0.1.0` and fails for `app-0.2.0`. `package.json` is at `0.1.0`, so RD-2's `app-0.1.0` passes.
