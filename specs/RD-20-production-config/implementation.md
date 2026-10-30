# Implementation Plan: researcher-dashboard: production configuration for the web app

**Jira**: https://concord-consortium.atlassian.net/browse/RD-20
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

### Add learn.concord.org and its Firebase config

**Summary**: The production portal entry and the `report-service-pro` web config, with the tests that make a missing config or a crossed value between the two portals fail (R1 to R6). One commit, because the entry without its config fails at sign-in and the config without the entry is dead.

**Files affected**:
- `app/src/shell/portals.ts`: the learn.concord.org entry
- `app/src/shell/firebase.ts`: the `report-service-pro` config
- `app/tests/launch.test.ts`: production resolves; look-alikes of it are refused
- `app/tests/firebase.test.ts`: every deployed entry has both configs
- `app/tests/services.test.ts`: per-portal destinations of every bearer and every sign-in

**Estimated diff size**: ~110 lines

`portals.ts`, after the staging entry:

```ts
  {
    origin: "https://learn.concord.org",
    reportServer: "https://report-server.concord.org",
    firebaseProject: "report-service-pro",
    clue: { firebaseApp: "collaborative-learning", projectId: "collaborative-learning-ec215" }
  }
```

The `clue` field's comment already cites this pairing as its example; it stays as it is.

`firebase.ts`, beside `report-service-dev` (values from activity-player `src/firebase-db.ts` and portal-report `js/db.ts`, which agree):

```ts
  "report-service-pro": {
    apiKey: atob("QUl6YVN5Qm1OU2EyVXozRGFFd0tjbHN2SFBCd2Z1Y1NtWldBQXpn"),
    authDomain: "report-service-pro.firebaseapp.com",
    databaseURL: "https://report-service-pro.firebaseio.com",
    projectId: "report-service-pro",
    storageBucket: "report-service-pro.appspot.com",
    messagingSenderId: "22386066971",
    appId: "1:22386066971:web:e0cdec7cb0f0893a8a5abe"
  },
```

`launch.test.ts`, in `describe("portalFor")`:
- In "refuses anything but the exact origin", the `https://learn.concord.org/` line goes (it is now allowed) and production look-alikes join the staging ones: `https://learn.concord.org.evil.test/`, `http://learn.concord.org/`, `https://learn.concord.org:8443/`, and `https://concord.org/`. The production entry's own values are asserted by the services test below, so they are not written out a third time here.

`firebase.test.ts`, in the existing `describe("firebaseConfig")`: `"report-service-pro"` joins the `it.each` list that checks each config's `projectId` and `authDomain`, and beside it:

```ts
  // A deployed portal whose project has no config would launch, mint a token and then fail at sign-in.
  it("has a config for every deployed portal's report-service and CLUE projects", () => {
    expect(DEPLOYED.length).toBeGreaterThan(1);
    for (const portal of DEPLOYED) {
      for (const project of [portal.firebaseProject, portal.clue.projectId]) {
        expect(firebaseConfig(project).projectId, portal.origin).toBe(project);
      }
    }
  });
```

Mutation it catches: deleting the `report-service-pro` block throws `no Firebase config for report-service-pro`. `firebaseConfig` is already imported by the file; `DEPLOYED` is added.

`services.test.ts`, a literal table of what each deployed portal's launch may reach, and a `describe.each` over it. The existing tests keep their hand-made `CONFIG`, whose `rs.test` server and production CLUE pairing are there to tell the two halves of a call apart:

```ts
// Written out rather than read from DEPLOYED, so an entry with another portal's value fails.
const DESTINATIONS = [
  { origin: "https://learn.portal.staging.concord.org", reportServer: "https://report-server.concordqa.org",
    firebaseProject: "report-service-dev", clueApp: "collaborative-learning-staging", clueProject: "collaborative-learning-staging" },
  { origin: "https://learn.concord.org", reportServer: "https://report-server.concord.org",
    firebaseProject: "report-service-pro", clueApp: "collaborative-learning", clueProject: "collaborative-learning-ec215" }
];

it("checks every deployed portal's destinations below", () => {
  expect(DEPLOYED.map((p) => p.origin)).toEqual(DESTINATIONS.map((d) => d.origin));
});

describe.each(DESTINATIONS)("a launch from $origin", (expected) => {
  it("sends the access token only to that portal and its report-server, and signs in only to its projects", async () => {
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      const app = new URL(url).searchParams.get("firebase_app");
      return { ok: true, status: 200, json: async () => ({ token: `token-${app}`, packages: [] }) };
    });
    vi.stubGlobal("fetch", fetchImpl);
    const { makeServices } = await import("../src/shell/services");
    const services = makeServices(portalFor(`${expected.origin}/`)!, TOKEN);
    const stop = await services.watchClass(SCOPE, listenersOn());
    await services.reportServer.listPackages([]);
    await settle();

    const calls = fetchImpl.mock.calls.map(([url, init]) => ({ url: new URL(url), auth: init?.headers }));
    expect(calls.length).toBe(3);
    for (const { url, auth } of calls) {
      expect([expected.origin, expected.reportServer]).toContain(url.origin);
      expect(auth).toMatchObject({ Authorization: `Bearer ${TOKEN.accessToken}` });
    }
    expect(calls.filter(({ url }) => url.origin === expected.reportServer).map(({ url }) => url.pathname)).toEqual(["/api/v1/packages/list"]);
    expect(calls.filter(({ url }) => url.origin === expected.origin).map(({ url }) => url.searchParams.get("firebase_app")).sort())
      .toEqual([expected.clueApp, expected.firebaseProject].sort());
    expect(signIn.mock.calls.map(([project, token]) => [project, token]).sort()).toEqual([
      [expected.clueProject, `token-${expected.clueApp}`],
      [expected.firebaseProject, `token-${expected.firebaseProject}`]
    ].sort());
    stop();
  });
});
```

It goes through `portalFor` with the portal's trailing-slash `authDomain`, as `start.ts` does, so it covers the lookup and the entry together. Mutations it catches (each run in stage 7): production's `reportServer` set to staging's, and production's CLUE project set to staging's; a portal added to `DEPLOYED` without a row fails the coverage test. The length check keeps a fetch that never happened from passing the loop. `DEPLOYED` and `portalFor` are imported from `../src/shell/portals`.

---

### Publish an index-top.html and resolve links against the deploy path

**Summary**: The build writes `index-top.html` when `DEPLOY_PATH` is set, and the Info page's demo link and "deployed at" line are resolved against where the app's files are rather than where the HTML is (R7, R8). One commit: the root copy is only usable with both halves.

**Files affected**:
- `app/vite.config.ts`: an `index-top` build plugin beside `csp()`
- `app/src/build-info.ts`: `DEPLOY_ROOT`
- `app/src/pages/Info.tsx`: the demo link and `deployPath()` read `DEPLOY_ROOT`
- `app/tests/index-top.test.ts` (new): the built `index-top.html`
- `app/tests/build-info.test.ts` (new): `DEPLOY_ROOT` is the app root
- `app/tests/app.test.tsx`: the demo link's expected `href`, and the footer's deploy path

**Estimated diff size**: ~135 lines

`vite.config.ts`, beside `csp`:

```ts
// The copy of index.html a release puts at the prefix root, where `./assets/...` would miss: each
// reference to the build's own files carries the path this build is deployed to, which
// s3-deploy-action passes as DEPLOY_PATH (`version/<tag>` or `branch/<name>`). Post-order, because
// Vite adds index.html to the bundle, policy included, only in its own generateBundle; and the
// policy's `base-uri 'none'` rules out a <base> instead.
const indexTop = (): Plugin => ({
  name: "researcher-dashboard-index-top",
  apply: "build",
  enforce: "post",
  generateBundle(_options, bundle) {
    const deployPath = process.env.DEPLOY_PATH;
    if (!deployPath) return;
    const index = bundle["index.html"];
    if (index?.type !== "asset") throw new Error("index-top.html needs the built index.html");
    this.emitFile({
      type: "asset",
      fileName: "index-top.html",
      source: String(index.source).replace(/(src|href)="\.\//g, `$1="${deployPath}/`)
    });
  }
});
```

and `plugins: [react(), csp(), indexTop()]`. The `base: "./"` comment above `defineConfig` gains the root copy as a third place the same build is served from, and its example path becomes `version/app-1.2.3/`, the tag form R9 sets.

`build-info.ts`:

```ts
// Where this build's files are, whichever page loaded them: `<prefix>/version/<tag>/` for both
// that path's own index.html and the copy a release puts at the prefix root, and `/` on the dev
// server. Correct only because this module sits one level below the app root in source and is
// bundled one level below it in `assets/`. Ignored by Vite, which otherwise rewrites the URL on
// the dev server.
export const DEPLOY_ROOT: string = new URL(/* @vite-ignore */ "..", import.meta.url).href;
```

`Info.tsx`:
- The demo link: `href={demo ? "?scenario=ready" : new URL("demo/?scenario=ready", DEPLOY_ROOT).href}`. The demo page's own link stays page-relative, since it is always served from its deploy path.
- `deployPath()` becomes:

```ts
function deployPath(): string {
  const root = new URL(DEPLOY_ROOT);
  return `${root.host}${root.pathname}`;
}
```

Its comment says the line names where the build's files are, the versioned path the deploy published, even when a release serves the page from the prefix root.

`build-info.test.ts`, in the node environment: under jsdom, Vitest resolves any `new URL(rel, import.meta.url)` to `http://localhost:3000/`, so `"."` and `".."` give the same answer there and the test could not fail. The test's own `new URL` needs `/* @vite-ignore */` too, or Vite rewrites it to an `@fs` path.

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEPLOY_ROOT } from "../src/build-info";

describe("DEPLOY_ROOT", () => {
  // tests/ and src/ are both one level below the app root, as assets/ is in a build.
  it("is the app root, one level above the module", () => {
    expect(DEPLOY_ROOT).toBe(new URL(/* @vite-ignore */ "../", import.meta.url).href);
  });
});
```

Mutation it catches: `"."` in place of `".."` (gives `src/`), or the module moved a level deeper.

`app.test.tsx`: the first expectation becomes

```ts
    const href = screen.getByRole("link", { name: "Open the demo" }).getAttribute("href")!;
    expect(href).toBe(new URL("demo/?scenario=ready", DEPLOY_ROOT).href);
    expect(href).toMatch(/^[a-z]+:\/\/.*\/demo\/\?scenario=ready$/);
```

so a revert to the page-relative `"demo/?scenario=ready"` fails (checked in stage 7). The demo-mode and expired cases are unchanged.

A new case checks the footer from a page whose path is not the app root, as the root copy's is:

```ts
  it("names the path its files were deployed to, not the page's own", () => {
    window.history.pushState({}, "", "/researcher-dashboard/index.html");
    try {
      render(<App start={{ kind: "info", reason: "no-launch" }} reauthorize={none} />);
      const root = new URL(DEPLOY_ROOT);
      expect(screen.getByRole("heading", { name: "Build info" }).nextElementSibling!.textContent)
        .toContain(`deployed at ${root.host}${root.pathname}.`);
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
```

Under jsdom `DEPLOY_ROOT` is `http://localhost:3000/` while the page is at `/researcher-dashboard/`, so a revert of `deployPath()` to `window.location` fails it (`deployed at localhost:3000/researcher-dashboard/.`).

`index-top.test.ts`, `// @vitest-environment node`, building as `csp.test.ts` does:

```ts
const build_ = async (deployPath?: string) => {
  const saved = process.env.DEPLOY_PATH;
  if (deployPath) process.env.DEPLOY_PATH = deployPath; else delete process.env.DEPLOY_PATH;
  try {
    return (await build({ configFile, logLevel: "silent", build: { write: false } }) as Rollup.RollupOutput).output;
  } finally {
    if (saved === undefined) delete process.env.DEPLOY_PATH; else process.env.DEPLOY_PATH = saved;
  }
};

it("writes an index-top.html whose references to the build's files carry the deploy path", async () => {
  const output = await build_("version/app-9.9.9");
  const source = (name: string) => String((output.find((o) => o.fileName === name) as Rollup.OutputAsset).source);
  const top = source("index-top.html"), index = source("index.html");
  const refs = [...top.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  expect(refs.length).toBeGreaterThanOrEqual(3);
  const files = new Set(output.map((o) => o.fileName));
  for (const ref of refs) {
    expect(ref.startsWith("version/app-9.9.9/"), ref).toBe(true);
    expect(files.has(ref.slice("version/app-9.9.9/".length)), ref).toBe(true);
  }
  expect(top.replaceAll('="version/app-9.9.9/', '="./')).toBe(index);
}, 60_000);

it("writes no index-top.html without a deploy path", async () => {
  expect((await build_()).some((o) => o.fileName === "index-top.html")).toBe(false);
}, 60_000);
```

Mutations it catches (each run in stage 7): `href` dropped from the rewrite (a reference left unprefixed), an `index-top.html` emitted without a deploy path, and `enforce: "post"` removed, without which `index.html` is not yet in the bundle when the hook runs.

---

### Deploy app tags and add the production release

**Summary**: `deploy-app.yml` deploys `app-*` tags that match `app/package.json`'s version and no others, its header says what the action does, a manual workflow publishes a tag at the production URL, and the READMEs describe all of it (R9 to R14). Workflow and docs only; no app code. The release is a separate manual workflow (Doug, 2026-10-30).

**Files affected**:
- `.github/workflows/deploy-app.yml`: triggers and header comment
- `.github/workflows/release-production.yml` (new)
- `app/README.md`: Deploy and launch sections
- `README.md`: the app's tag form under Release lines

**Estimated diff size**: ~80 lines

`deploy-app.yml` trigger:

```yaml
on:
  push:
    # Branches only when the app or this workflow changes. GitHub ignores path filters on tag
    # pushes, so tags are limited by name instead: an `app-*` tag is an app release and a
    # runner tag is not.
    branches: ["**"]
    tags: ["app-*"]
    paths:
      - "app/**"
      - ".github/workflows/deploy-app.yml"
```

In the `build_test` job, after `npm ci` (the job's working directory is `app`), so a tag whose version is not the app's fails before the `s3_deploy` job, which needs this one, publishes anything (R9):

```yaml
      # An app tag names the version package.json gives the build, which the About box shows.
      - if: startsWith(github.ref, 'refs/tags/app-')
        run: test "$GITHUB_REF_NAME" = "app-$(node -p 'require("./package.json").version')"
```

Header comment, replacing the second paragraph's last clause: a branch lands at `branch/<name>/` and a tag at `version/<tag>/`; the build also writes `index-top.html` there, which `topBranches` copies to `index-<branch>.html` at the prefix root (so `main` gives `index-main.html`, a root-level copy to check before a release), and `release-production.yml` copies a tag's to the prefix's `index.html`, the production URL. Nothing in this workflow writes `index.html` at the root.

`release-production.yml` (Concord's release pattern, as in activity-player's `release_production.yml`):

```yaml
# Publishes a deployed app tag at the production URL,
# https://models-resources.concord.org/researcher-dashboard/index.html, by copying the tag's
# index-top.html (written by its deploy-app run) over the prefix's index.html. The index file
# keeps the no-cache header the deploy gave it, so the release shows at once.
name: Release Production
run-name: Release Production ${{ inputs.version }}

on:
  workflow_dispatch:
    inputs:
      version:
        description: The app tag to release, such as app-0.1.0
        required: true

permissions:
  id-token: write
  contents: read

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::612297603577:role/researcher-dashboard
          aws-region: us-east-1
      # The input is passed through the environment rather than spliced into the script.
      - env:
          VERSION: ${{ inputs.version }}
        run: |
          [[ "$VERSION" =~ ^app-[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "not an app tag: $VERSION" >&2; exit 1; }
          aws s3 cp "s3://models-resources/researcher-dashboard/version/$VERSION/index-top.html" \
            "s3://models-resources/researcher-dashboard/index.html"
```

`aws s3 cp` fails when the tag was never deployed, which leaves the released file untouched.

`app/README.md`:
- Launch section: "`authDomain` must be a portal in the allowlist compiled into the build (`src/shell/portals.ts`): staging's `learn.portal.staging.concord.org` and production's `learn.concord.org`, each with its own report-server and Firebase projects."
- Deploy section: its opening sentence ("on every push that touches `app/`") says branch pushes that touch `app/` or the workflow, and `app-*` tag pushes; app tags are `app-x.y.z`, where `x.y.z` is `package.json`'s `version` (a tag that differs fails the deploy), and deploy to `version/<tag>/`; the build writes `index-top.html` when s3-deploy-action passes `DEPLOY_PATH`; `main` also publishes `index-main.html` at the prefix root; the production URL is `https://models-resources.concord.org/researcher-dashboard/index.html`, published from a deployed tag by the Release Production workflow; and the production portal's Client redirect URI and ExternalReport both name that URL.

`README.md` Release lines: the app's line notes its git tag form, `app-x.y.z`, which is also the path it deploys to.

## Staging checks

R16's live checks. Neither needs code. Each portal change is made on Doug's go, read back after saving, and put back afterwards. Doug types every credential. The staging portal's `researcher-dashboard` Client (client 14) and its "Researcher Dashboard" ExternalReport (report 79, launched from class 590) normally name `https://models-resources.concord.org/researcher-dashboard/branch/main/index.html`.

**Before merge, on the branch deploy:**
1. Add `https://models-resources.concord.org/researcher-dashboard/branch/production-config/index.html` to client 14's redirect URIs, beside `main`, and point report 79 at it.
2. Launch from class 590 as a researcher, then check two things:
   - It signs in and renders the class: Info tab, Assignments card, packages listed.
   - The console shows no errors except the existing `/favicon.ico` 404, and no CSP refusals.
3. Open the same URL with no query string, which shows the info page (the build footer and the demo link are only on that page, not on a launched class), and check two more:
   - The footer reads `deployed at models-resources.concord.org/researcher-dashboard/branch/production-config/`.
   - The "Open the demo" link opens `branch/production-config/demo/?scenario=ready`.
4. Confirm `branch/production-config/index-top.html` was uploaded and that its three references start with `branch/production-config/assets/`.
5. Put report 79 back to `branch/main/index.html` and remove the branch URI from client 14.

**After merge, before RD-2's release, on `index-main.html`:**
1. Confirm the merge's Deploy app run published `https://models-resources.concord.org/researcher-dashboard/index-main.html`.
2. Add that URL to client 14's redirect URIs and point report 79 at it.
3. Launch the same way, then open `index-main.html` with no query string, and check the same four things. Two expectations differ from the branch check:
   - The footer reads `deployed at models-resources.concord.org/researcher-dashboard/branch/main/`, not the prefix root.
   - The demo link opens `branch/main/demo/?scenario=ready`.
4. Put report 79 back to `branch/main/index.html` and remove `index-main.html` from client 14.

`branch/main/index.html` launching as before is the check that staging still works (the story's done-when).

## Open Questions

### RESOLVED: Judgment call: where the deploy root is computed
**Options considered**:
- A) `new URL("..", import.meta.url)` in `build-info.ts`, with `/* @vite-ignore */`.
- B) Read it off the entry `<script>`'s `src` at run time.
- C) A build-time constant from `DEPLOY_PATH`.

**Decision**: A. Stage 4 checked it in a build served as a root copy and on the dev server. B depends on DOM order and Vite's tag injection; C is wrong for `index.html` at its own path in local builds and tests, and would differ between the two HTML files that share one bundle.

### RESOLVED: Judgment call: when `index-top.html` is written
**Options considered**:
- A) Only when `DEPLOY_PATH` is set.
- B) Always, defaulting the path to `.`.

**Decision**: A. Without a deploy path there is no correct prefix, and a file that looks releasable but is not is worse than none.

### RESOLVED: Judgment call: the per-portal test checks the shipped entries against a literal table
**Options considered**:
- A) `describe.each(DEPLOYED)`, reading each launch's expected destinations from the entry under test.
- B) Hand-written `PortalConfig`s passed straight to `makeServices`.
- C) A literal table of each portal's expected destinations, with the entry under test looked up through `portalFor`.

**Decision**: C. A cannot fail on a crossed entry, since the expectations move with the values (see the QA entry below). B tests the test's own values and never the shipped ones. C runs the shipped entries through the real lookup and fails when any of them names another portal's value, and its coverage test fails when a portal is added without a row.

## Self-Review

Stage 7 applied the first two steps as throwaway code (since deleted): with both in place `tsc --noEmit`, the full suite (35 files, 446 tests) and `npm run build` passed, and with only the first step its three test files and the typecheck passed.

### QA Engineer

#### RESOLVED: The per-portal services test could not fail on a crossed entry
As first written it read its expectations from the `DEPLOYED` entry under test, so setting production's `reportServer` and `firebaseProject` to staging's values left it green (run in stage 7). Fixed in place: a literal `DESTINATIONS` table, plus a test that it covers every deployed origin. Both crossed-value mutations now fail it, and the duplicate production-values test in `launch.test.ts` is dropped.

#### RESOLVED: The DEPLOY_ROOT test could not fail under jsdom
Under the suite's default jsdom environment both `DEPLOY_ROOT` and the test's expectation came out as `http://localhost:3000/` whatever the relative path, so replacing `".."` with `"."` passed. Fixed in place: the test runs in the node environment, where both are real `file:` URLs and the mutation fails.

---

### Commit reviewer

#### RESOLVED: `enforce: "post"` is load-bearing, not a nicety
Without it the plugin's `generateBundle` runs before Vite's HTML plugin has added `index.html` to the bundle, so it throws. The plugin's comment says why it is post-order and `index-top.test.ts` fails without it.

---

### Spec consistency reviewer

#### RESOLVED: The per-portal test's judgment call described the version the review replaced
The Open Questions entry still chose `describe.each(DEPLOYED)` with expectations read from the entry, the design the QA entry above showed could not fail, while the plan's `services.test.ts` uses the literal `DESTINATIONS` table. Fixed in place: the entry now records the table, looked up through `portalFor`, as the decision and why the other two lose.

#### RESOLVED: The firebaseConfig test would have been a second describe of the same name
`app/tests/firebase.test.ts` already has `describe("firebaseConfig")`, whose `it.each` checks `projectId` and `authDomain` for the three configs it names. The plan added a new block of the same name and left `report-service-pro` out of the list, so the new config's `authDomain` went unchecked. Fixed in place: the new test goes in the existing block and `report-service-pro` joins the `it.each` list.

---

### Release Engineer

#### RESOLVED: Nothing kept an app tag and the app's own version in step
See requirements.md's entry of the same name. Fixed in place: the deploy step adds the `build_test` check that an `app-*` tag is `app-` plus `package.json`'s version, and the README's Deploy section says so.

---

### Staging operator

#### RESOLVED: The footer check was listed on a page that has no footer
The before-merge list checked the "deployed at" footer after a launch, but the build footer is only on the info page (`Info.tsx`), which `ClassDashboard.tsx` renders only for an info reason, never on a launched class; a no-launch visit is what shows it (`start.ts`, `no-launch`). Fixed in place: the footer and demo link are checked on the same URL opened with no query string, in both staging lists.

---

### Test writer

#### RESOLVED: The footer's deploy path had no test
R8's "deployed at" change had none: under jsdom the page and `DEPLOY_ROOT` are both at `localhost:3000/`, so reverting `deployPath()` to `window.location` left the suite green. Fixed in place: an `app.test.tsx` case moves the page to `/researcher-dashboard/index.html` first. Checked with throwaway code: it passes with the planned `Info.tsx` and fails with `deployPath()` reverted.

---

### Next engineer reading the README

#### RESOLVED: Two lines still quoted the old trigger and tag form
`app/README.md`'s Deploy section opens "on every push that touches `app/`", which stops being true once `app-*` tags deploy whatever they touch, and the `base: "./"` comment in `vite.config.ts` gives `version/v1.2.3/` as its example, a tag form R9 rules out. Fixed in place: the README step rewrites that sentence and the `vite.config.ts` step changes the example to `version/app-1.2.3/`.
