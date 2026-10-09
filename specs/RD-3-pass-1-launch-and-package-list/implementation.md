# Implementation Plan: RD-3 pass 1, the launch and the package list

**Jira**: https://concord-consortium.atlassian.net/browse/RD-3
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## The throwaway build

Every step below was built as throwaway code in this worktree on `main` at `e363311` and then reverted. The whole build is the branch oob file `stage-verification/stage5-throwaway-build.patch` (researcher-dashboard, `RD-3-pass-1-launch-and-package-list`), 30 files, +1,194 and -1,079 lines, which `git apply --check` accepts on `e363311`. On it `tsc --noEmit` is clean, `vitest run` passes 61 tests in 9 files, and `vite build` succeeds. The implementation should start from it and split it into the steps below; the code shown here is that build's, corrected where a review changed it, and where a file is not shown in full, the patch holds it. The patch changes no `styles.css` and no README; their steps describe those changes.

Run everything with Node 22 from nvm: `PATH=$HOME/.nvm/versions/node/v22.17.1/bin:$PATH`.

## Implementation Plan

### Delete the spike page and what only it used

**Summary**: R22, R24 and R23's link name. The spike's page, its renderer, its status logic and the CLUE wiring go, with their tests. Until the next step the app renders the info page for every query, which is what `main` already does for the link the portal sends today. A pure deletion step reviews in minutes and keeps the next one about new code only.

**Files affected**:
- `app/src/pages/AnalyzeClass.tsx`, `app/src/components/Display.tsx`, `app/src/shell/display.ts`, `app/src/shell/status.ts`, and `app/src/shell/launch.ts`, whose spike grammar (`ANALYZE_CLASS`, `pageFor`, `classRef`) only `App` read: deleted.
- `app/tests/analyze-class.test.tsx`, `app/tests/display.test.ts`, `app/tests/status.test.ts`, `app/tests/launch.test.ts`: deleted.
- `app/src/shell/portal.ts`: `runPackage`, `RunPackageResult`, `getClass`, `ClassInfo`, `Assignment` and `PortalError.unauthorized` deleted (the class step adds the scope's types).
- `app/src/shell/firebase.ts`: the `collaborative-learning-staging` config, `watchCollection`, `inClass` and `Paths`/`paths()` deleted; `classPath(portalOrigin, classHash)` added; the header comment says one project, report-service's.
- `app/src/App.tsx`, `app/src/main.tsx`: `App` takes no props and renders `<Info />`.
- `app/src/pages/Info.tsx`: no `reason` prop, since the expired-link case went with the spike's grammar; "use the Researcher Dashboard link"; "What it can show" describes the package list without the "Analyze Class" name.
- `app/tests/app.test.tsx`, `app/tests/portal.test.ts`, `app/tests/firebase.test.ts`: cases for what was deleted removed; `classPath` tested; a test that the info page contains no "Analy" text.

**Estimated diff size**: ~-700, +40

In `styles.css`, `.result-list`, `.queued`, `.summary`, `.platform`, the `button` rules and `--accent`, and the `table` and `dl` rules lose their only users here and are deleted; the other rules stay.

---

### The allowlist and the authorization request

**Summary**: R1 to R3 and R23. A launch link is checked against the allowlist and sent to the portal's authorize endpoint with PKCE, resolved before React renders. Kept outside React because the pending launch is single use and StrictMode runs effects twice. After this step a launch reaches the portal's sign-in, and the portal's redirect back renders the info page (a callback carries no `authDomain`, so it is not a launch), which the next step replaces.

**Files affected**:
- `app/src/shell/portals.ts`: new. The allowlist, `devPortal(env)`, `portalFor(authDomain, extra)`.
- `app/src/shell/launch.ts`: new. `parseLaunch`.
- `app/src/shell/oauth.ts`: new. PKCE, `redirectUriFor`, `authorizeUrl`, `startAuthorization`.
- `app/src/shell/start.ts`: new. `start(deps)`'s launch branch, its catch, and `reauthorize(deps, portal, launch)`; `Start` without its `ready` case or `detail`, and `InfoReason` with only the reasons this step can reach (`no-launch`, `unknown-portal`, `sign-in-failed`); each later step adds its own.
- `app/src/App.tsx`, `app/src/main.tsx`: rewritten, `App` rendering `info` and `redirecting` and `main.tsx` rendering what `start(deps)` resolves to. `main.tsx` below is the next step's: until `Start` has its `ready` case, `started.kind === "ready"` does not compile (TS2367).
- `app/src/pages/Info.tsx`: takes `InfoReason`, one sentence per reason in a `role="status"` paragraph.
- Tests: `launch.test.ts` (new), `oauth.test.ts` and `start.test.ts` (the authorize cases), `app.test.tsx`.

**Estimated diff size**: ~+400 including tests

---

### The callback, the token and the class

**Summary**: R4 to R9. The callback redeems its code, the token is held in memory, and a first `ClassDashboard` loads the scope and shows the class. `ClassDashboard` receives only the services built from the portal's configuration and the token, never the launch, which is what makes R4 hold by construction.

**Files affected**:
- `app/src/shell/launch.ts`: `parseCallback`, `launchQuery`.
- `app/src/shell/oauth.ts`: `takePending`, `exchangeCode`, `TokenError`, `Token`.
- `app/src/shell/start.ts`: the callback branch, `Start`'s `ready` case and `detail`, and the reasons the callback and the page reach.
- `app/src/pages/Info.tsx`: the optional `detail`.
- `app/src/shell/portal.ts`: `Api` (bearer, expiry, 401 as `SessionExpired`), `ApiError` replacing `PortalError`, `Portal.scope()`, the `Scope` and `Assignment` types.
- `app/src/shell/services.ts`: new, with `portal` only in this step.
- `app/src/App.tsx`'s optional `services` prop, which `app.test.tsx` uses to render a signed-in class.
- `app/src/pages/ClassDashboard.tsx`: new. The scope load, the header and assignments, the info reasons for 403, 404, an unsupported `kind` and a young 401.
- `app/src/App.tsx`: the `ready` case and the `reauthorize` prop.
- `app/src/main.tsx`: the `again` callback, passed to `App` as `reauthorize`.
- `app/src/styles.css`: `.tool`, muted as `.platform` was, for the assignments' tool.
- Tests: `oauth.test.ts` and `start.test.ts` (the callback cases), `portal.test.ts` (rewritten for `Api` and `Portal`), `class-dashboard.test.tsx` (scope cases), `fixtures.ts`.

**Estimated diff size**: ~+400 including tests

The code for both steps follows, file by file.

`portals.ts`:

```ts
export interface PortalConfig {
  origin: string;
  reportServer: string;
  // The report-service Firebase project whose dashboard tree this portal's classes live in.
  firebaseProject: string;
}

const DEPLOYED: PortalConfig[] = [
  {
    origin: "https://learn.portal.staging.concord.org",
    reportServer: "https://report-server.concordqa.org",
    firebaseProject: "report-service-dev"
  }
];

export const PROFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// A dev server may add one local portal, so the app can be run against a local rigse and
// report-server. A production build never reads these.
export function devPortal(env: Record<string, string | boolean | undefined>): PortalConfig | null {
  if (env.DEV !== true) return null;
  const origin = env.VITE_DEV_PORTAL, reportServer = env.VITE_DEV_REPORT_SERVER;
  const firebaseProject = env.VITE_DEV_FIREBASE_PROJECT;
  if (typeof origin !== "string" || typeof reportServer !== "string" || typeof firebaseProject !== "string") {
    return null;
  }
  return { origin: new URL(origin).origin, reportServer, firebaseProject };
}

export function portalFor(authDomain: string, extra: PortalConfig | null = null): PortalConfig | null {
  let origin: string;
  try {
    origin = new URL(authDomain).origin;
  } catch {
    return null;
  }
  return [...DEPLOYED, ...(extra ? [extra] : [])].find((p) => p.origin === origin) ?? null;
}
```

`launch.ts`:

```ts
export interface Launch { authDomain: string; classId: string; loginHint: string | null; }
export type Callback = { state: string; code: string } | { state: string; error: string };

const ID = /^[1-9][0-9]*$/;

export function parseLaunch(search: string): Launch | null {
  const params = new URLSearchParams(search);
  const authDomain = params.get("authDomain");
  const classId = params.get("classId");
  if (!authDomain || !classId || !ID.test(classId)) return null;
  const loginHint = params.get("loginHint");
  return { authDomain, classId, loginHint: loginHint && ID.test(loginHint) ? loginHint : null };
}

export function parseCallback(search: string): Callback | null {
  const params = new URLSearchParams(search);
  const state = params.get("state");
  if (!state) return null;
  const code = params.get("code");
  if (code) return { state, code };
  const error = params.get("error");
  return error ? { state, error } : null;
}

export function launchQuery(launch: Launch): string {
  const params = new URLSearchParams({ authDomain: launch.authDomain, classId: launch.classId });
  if (launch.loginHint) params.set("loginHint", launch.loginHint);
  return `?${params}`;
}
```

`oauth.ts`:

```ts
export const CLIENT_ID = "researcher-dashboard";
const PENDING_KEY = "researcher-dashboard:pending-launch";

export interface Pending extends Launch { state: string; verifier: string; }
export interface Token { accessToken: string; expiresAt: number; issuedAt: number; }

function base64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomValue(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// The page's own address without a query, which is what the Client registers. The portal
// matches it exactly, so a directory URL takes the index.html it was registered with.
export function redirectUriFor(location: { origin: string; pathname: string }): string {
  const path = location.pathname.endsWith("/") ? `${location.pathname}index.html` : location.pathname;
  return `${location.origin}${path}`;
}

export function authorizeUrl(portalOrigin: string, launch: Launch, redirectUri: string, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID, response_type: "code", redirect_uri: redirectUri, state,
    code_challenge: challenge, code_challenge_method: "S256", context: `class:${launch.classId}`
  });
  if (launch.loginHint) params.set("login_hint", launch.loginHint);
  return `${portalOrigin}/auth/oauth_authorize?${params}`;
}

export async function startAuthorization(
  portalOrigin: string, launch: Launch, redirectUri: string, storage: Storage, navigate: (url: string) => void
): Promise<void> {
  const pending: Pending = { ...launch, state: randomValue(), verifier: randomValue() };
  storage.setItem(PENDING_KEY, JSON.stringify(pending));
  navigate(authorizeUrl(portalOrigin, launch, redirectUri, pending.state, await challengeFor(pending.verifier)));
}

// The pending launch whose state this callback carries, or null. Removed either way, so a
// replayed callback finds nothing.
export function takePending(storage: Storage, state: string): Pending | null {
  const raw = storage.getItem(PENDING_KEY);
  storage.removeItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as Pending;
    return pending.state === state ? pending : null;
  } catch {
    return null;
  }
}

export class TokenError extends Error {}

export async function exchangeCode(
  portalOrigin: string, code: string, verifier: string, redirectUri: string, fetchImpl: typeof fetch, now: number
): Promise<Token> {
  const response = await fetchImpl(`${portalOrigin}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: CLIENT_ID, code, code_verifier: verifier, redirect_uri: redirectUri })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.access_token !== "string" || typeof body?.expires_in !== "number") {
    throw new TokenError(body?.error ?? `the token endpoint answered ${response.status}`);
  }
  return { accessToken: body.access_token, issuedAt: now, expiresAt: now + body.expires_in * 1000 };
}
```

A `URLSearchParams` body is sent as `application/x-www-form-urlencoded`, a CORS-simple request, so the token endpoint needs no preflight; rigse's preflight for it passes anyway (checked live).

`start.ts`:

```ts
export type InfoReason =
  | "no-launch" | "unknown-portal" | "sign-in-failed" | "access-denied" | "authorize-error"
  | "withdrawn" | "class-gone" | "unsupported-scope" | "expired";

export type Start =
  | { kind: "info"; reason: InfoReason; detail?: string }
  | { kind: "redirecting" }
  | { kind: "ready"; portal: PortalConfig; launch: Launch; token: Token };

export interface StartDeps {
  search: string;
  location: { origin: string; pathname: string };
  storage: Storage;
  navigate: (url: string) => void;
  replaceUrl: (url: string) => void;
  fetchImpl: typeof fetch;
  now: () => number;
  devPortal: PortalConfig | null;
}

export async function reauthorize(deps: StartDeps, portal: PortalConfig, launch: Launch): Promise<void> {
  await startAuthorization(portal.origin, launch, redirectUriFor(deps.location), deps.storage, deps.navigate);
}

// Whatever the launch throws (storage that refuses a write, no WebCrypto) is the sign-in page,
// never a blank one.
export function start(deps: StartDeps): Promise<Start> {
  return resolveStart(deps).catch((): Start => ({ kind: "info", reason: "sign-in-failed" }));
}

async function resolveStart(deps: StartDeps): Promise<Start> {
  const callback = parseCallback(deps.search);
  if (callback) {
    const pending = takePending(deps.storage, callback.state);
    if (!pending) return { kind: "info", reason: "sign-in-failed" };
    if ("error" in callback) {
      return callback.error === "access_denied"
        ? { kind: "info", reason: "access-denied" }
        : { kind: "info", reason: "authorize-error", detail: callback.error };
    }
    const portal = portalFor(pending.authDomain, deps.devPortal);
    if (!portal) return { kind: "info", reason: "unknown-portal" };
    const redirectUri = redirectUriFor(deps.location);
    try {
      const token = await exchangeCode(portal.origin, callback.code, pending.verifier, redirectUri, deps.fetchImpl, deps.now());
      const launch: Launch = { authDomain: pending.authDomain, classId: pending.classId, loginHint: pending.loginHint };
      // The code leaves the address bar and the history; a reload starts a fresh launch.
      deps.replaceUrl(`${deps.location.pathname}${launchQuery(launch)}`);
      return { kind: "ready", portal, launch, token };
    } catch (error) {
      if (error instanceof TokenError) return { kind: "info", reason: "sign-in-failed", detail: error.message };
      return { kind: "info", reason: "sign-in-failed" };
    }
  }

  const launch = parseLaunch(deps.search);
  if (!launch) return { kind: "info", reason: "no-launch" };
  const portal = portalFor(launch.authDomain, deps.devPortal);
  if (!portal) return { kind: "info", reason: "unknown-portal" };
  await reauthorize(deps, portal, launch);
  return { kind: "redirecting" };
}
```

`main.tsx`:

```tsx
const deps: StartDeps = {
  search: window.location.search,
  location: window.location,
  storage: window.sessionStorage,
  navigate: (url) => window.location.assign(url),
  replaceUrl: (url) => window.history.replaceState(null, "", url),
  fetchImpl: (input, init) => globalThis.fetch(input, init),
  now: Date.now,
  devPortal: devPortal(import.meta.env as unknown as Record<string, string | boolean | undefined>)
};

const root = createRoot(document.getElementById("root")!);
start(deps).then((started) => {
  const again = () => {
    if (started.kind === "ready") void reauthorize(deps, started.portal, started.launch);
  };
  root.render(<StrictMode><App start={started} reauthorize={again} /></StrictMode>);
});
```

`App.tsx` renders `Info` for `info`, "Signing in…" for `redirecting`, and `<ClassDashboard services={makeServices(portal, token)} onExpired={reauthorize} />` for `ready`, memoized so a re-render does not rebuild the services; it takes an optional `services` prop so a test can inject fakes.

`portal.ts`'s `Api.request` is the old `Portal.request` with two checks in front of the response handling; the `fetchImpl` wrapper and its comment carry over unchanged:

```ts
const EXPIRY_MARGIN_MS = 60_000;

async request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (this.now() > this.token.expiresAt - EXPIRY_MARGIN_MS) throw new SessionExpired(false);
  const response = await this.fetchImpl(`${this.origin}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${this.token.accessToken}` }
  });
  if (response.status === 401) {
    throw new SessionExpired(this.now() - this.token.issuedAt < EXPIRY_MARGIN_MS);
  }
  // ...the existing body and ApiError handling
}
```

`ClassDashboard` in this step holds the scope effect and `refused(error, show)`, the one place a refusal is turned into page state; with the portal its only caller here, every non-`ApiError` shows "The portal could not be reached.", and the profile step adds the third argument. In its final form, `refused(error, show, from)`, `from` is `"portal"`, `"report-server"` or `"firebase"` (the Firebase token, the sign-in and the listener): `SessionExpired` that is young sets the `expired` info reason, otherwise calls `onExpired`; an `ApiError` 403 from the portal sets `withdrawn` (R8: the researcher check failed), while one from anywhere else shows its message like any other refusal (R21); another `ApiError` shows its message; anything else shows the line `from` names, "The portal could not be reached.", "The package catalog could not be reached." or "This class's profile could not be read.", one map whose last entry the listener's `onError` also shows. A 404 from the scope endpoint sets `class-gone`, and a `kind` other than `class` sets `unsupported-scope`. The line shown while the scope loads, and a failure in its place, is a `role="status"` paragraph inside the loading `<main>` (R26).

Tests, each named for what it catches: `start.test.ts` launches with `classId=223` and checks the authorize URL's origin, `redirect_uri` and `context`; redeems a callback and checks `replaceUrl`'s argument; checks `sessionStorage.length` and `localStorage.length` are 0 after a full launch (catches storing the token); refuses a forged state without calling `fetch`; maps `access_denied`; reports `invalid_grant`; renders `sign-in-failed` when the storage throws on write (catches deleting `start`'s `catch`). `oauth.test.ts` asserts RFC 7636 appendix B's challenge, the verifier against rigse's `PKCE_VALUE`, every authorize parameter, `login_hint` omitted when absent, `redirectUriFor` for a file and a directory path, `takePending` used once and cleared on a forged state, and the form body of the exchange. `launch.test.ts` covers R1 and R2, including the spike's link, a lookalike host, `http:`, a port and the dev portal only when `DEV` is true. `portal.test.ts` covers the bearer, a token inside the margin never sent, young and old 401s, and the server's message kept. `class-dashboard.test.tsx` renders the scope's name, teachers and assignments, the withdrawn and expired pages, and a `TypeError` from the scope call as "The portal could not be reached." in a status region (catches the fallback naming the catalog, which the throwaway build did). The throwaway build's "shows the class the token's scope names" case passes a scope whose `id` differs from any launch, which the page never sees, so it is kept as a rendering test only and not claimed for R4.

---

### The class profile and its refresh

**Summary**: R10 to R13. One Firebase sign-in with in-memory persistence, one listener on the class document, and at most one refresh per page load.

**Files affected**:
- `app/src/shell/firebase.ts`: `signIn` creates the app's auth with `initializeAuth(app, { persistence: inMemoryPersistence })` before any `getAuth`, and passes that instance to `connectAuthEmulator`. `watchDoc` takes an `onError` callback beside its logging, so a refused listener reaches the page instead of only the console.
- `app/src/shell/portal.ts`: `Portal.firebaseToken` (the existing call, on `Api`) and `Portal.refreshProfile()` (`POST`, no body).
- `app/src/shell/packages.ts`: new, with `Profile` and `needsRefresh` in this step.
- `app/src/shell/portals.ts`: `PROFILE_MAX_AGE_MS`.
- `app/src/shell/services.ts`: `watchProfile(scope, onValue)`.
- `app/src/pages/ClassDashboard.tsx`: the profile and refresh effects, and the status region's "Reading this class's activities…", refresh-refused and profile-unreadable lines.
- Tests: `firebase-sign-in.test.ts` (new), `packages.test.ts` (`needsRefresh`), `portal.test.ts` (`firebaseToken`, `refreshProfile`), `class-dashboard.test.tsx` (refresh cases).

**Estimated diff size**: ~+250 including tests

```ts
// firebase.ts, inside signIn's first-time branch
// In memory, not Firebase's default IndexedDB: that store is shared by every tab and by
// every app on this origin, so a second tab on another class would replace this one's
// sign-in, and a researcher's session would outlive the page.
const auth = initializeAuth(app, { persistence: inMemoryPersistence });
if (emulators) {
  const [host, port] = emulators.firestore.split(":");
  connectFirestoreEmulator(getFirestore(app), host, Number(port));
  connectAuthEmulator(auth, `http://${emulators.auth}`, { disableWarnings: true });
}
```

```ts
// packages.ts
export interface Profile {
  assignment_urls?: string[];
  interactive_urls?: string[];
  assignment_fingerprint?: string;
  derived_at?: { toMillis(): number } | null;
  truncated?: boolean;
}

export function needsRefresh(profile: Profile | null, scope: Scope, now: number, maxAgeMs: number): boolean {
  if (!profile) return true;
  if (profile.assignment_fingerprint !== scope.assignment_fingerprint) return true;
  const derived = profile.derived_at?.toMillis();
  return derived === undefined || now - derived > maxAgeMs;
}
```

```ts
// services.ts
async watchProfile(scope, onValue) {
  const customToken = await portal.firebaseToken(config.firebaseProject, scope.class_hash);
  const db = await signIn(config.firebaseProject, customToken,
    emulatorsFromEnv(import.meta.env as unknown as Record<string, string | undefined>));
  return watchDoc<Profile>(db, classPath(config.origin, scope.class_hash), onValue, onError);
}
```

`watchProfile` takes `(scope, onValue, onError)`; the page passes an `onError` that sets `profileProblem` to "This class's profile could not be read.", shown in the status region in place of "Reading this class's activities…", and the list stays hidden. The throwaway build's `watchDoc` only logged, so this is the one behavior here the patch does not have.

```tsx
// ClassDashboard.tsx
const [profile, setProfile] = useState<Profile | null | undefined>(undefined); // undefined: no snapshot yet
const refreshed = useRef(false);

useEffect(() => {
  if (!scope) return;
  let stop: (() => void) | null = null;
  let canceled = false;
  services.watchProfile(scope, setProfile)
    .then((unsubscribe) => { if (canceled) unsubscribe(); else stop = unsubscribe; })
    .catch((error) => { if (!canceled) refused(error, setFailure, "firebase"); });
  return () => { canceled = true; stop?.(); };
}, [scope, services]);

useEffect(() => {
  if (!scope || profile === undefined || refreshed.current) return;
  refreshed.current = true;
  if (!needsRefresh(profile, scope, services.now(), PROFILE_MAX_AGE_MS)) return;
  services.portal.refreshProfile().catch((error) => refused(error, setRefreshProblem, "portal"));
}, [scope, profile, services]);
```

The `refreshed` ref is set on the first snapshot whatever it decides, so a later snapshot can never trigger a refresh. A Firestore `Timestamp` has `toMillis()`, which is all `Profile` asks of `derived_at`.

Tests: the sign-in test mocks `firebase/auth` and asserts `initializeAuth` received `{ persistence: inMemoryPersistence }` (catches reverting to `getAuth`'s default). `needsRefresh` for missing, changed, undated, old and current. In the page: a missing profile refreshes once; two stale snapshots, each a new object with an older fingerprint as `snapshot.data()` gives, refresh once (catches deleting the ref; a second `null` snapshot cannot, since React skips a state update to the same value and the effect does not run again, checked against the throwaway build); a changed fingerprint refreshes once; a failed sign-in shows "This class's profile could not be read."; a current profile on two snapshots never refreshes; a 422 with no profile shows rigse's message; a listener whose `onError` fires shows the unreadable line and no reading line (catches dropping the callback).

---

### The package list

**Summary**: R14 to R21 and R26. The list call, filtering and grouping, the collapsed Community group with its disclosure, and the status region.

**Files affected**:
- `app/src/shell/portal.ts`: `ReportServer.listPackages(scopeUrls)` and the `PackageRow` type.
- `app/src/shell/packages.ts`: `scopeUrls`, `titleOf`, `Group`, `groupPackages`.
- `app/src/shell/services.ts`: `reportServer`.
- `app/src/components/PackageList.tsx`: new.
- `app/src/pages/ClassDashboard.tsx`: the list effect, the truncated and list-failure lines, `PackageList`.
- `app/src/styles.css`: `.package-rows`, `.description`, `.identity`, `.community`, `.disclosure`.
- Tests: `packages.test.ts` (grouping, order, `scopeUrls`), `portal.test.ts` (the list request), `class-dashboard.test.tsx` (list cases).

**Estimated diff size**: ~+300 including tests

```ts
// packages.ts
// The same set the runner sends to `applies`, so a package offered here is not refused
// there for a difference in URLs.
export function scopeUrls(profile: Profile): string[] {
  return [...(profile.assignment_urls ?? []), ...(profile.interactive_urls ?? [])];
}

export interface Group { key: string; heading: string; rows: PackageRow[]; collapsed: boolean; }

export function titleOf(row: PackageRow): string {
  return row.current_version.title || row.name;
}

// Official first needs no key: every official row is in the Official group.
function byTitle(a: PackageRow, b: PackageRow): number {
  return titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: "base" });
}

// The heading is where the researcher's claim on a package comes from, so each row goes in
// the first group it qualifies for and there is no badge to read.
export function groupPackages(rows: PackageRow[], scope: Scope): Group[] {
  const official: PackageRow[] = [], mine: PackageRow[] = [], community: PackageRow[] = [];
  const projects = new Map<number, PackageRow[]>(scope.project_ids.map((id) => [id, []]));

  for (const row of rows.filter((r) => r.applies)) {
    if (row.official) official.push(row);
    else if (row.visibility === "project" && row.project && projects.has(row.project.id)) projects.get(row.project.id)!.push(row);
    else if (row.mine) mine.push(row);
    else if (row.visibility === "public") community.push(row);
  }

  const groups: Group[] = [{ key: "official", heading: "Official", rows: official, collapsed: false }];
  for (const [id, projectRows] of projects) {
    const name = projectRows.find((r) => r.project?.name)?.project?.name;
    groups.push({ key: `project-${id}`, heading: name ?? `Project ${id}`, rows: projectRows, collapsed: false });
  }
  groups.push({ key: "mine", heading: "Mine", rows: mine, collapsed: false });
  groups.push({ key: "community", heading: "Community", rows: community, collapsed: true });

  return groups
    .filter((g) => g.rows.length > 0)
    .map((g) => ({ ...g, rows: [...g.rows].sort(byTitle) }));
}
```

`ReportServer.listPackages` POSTs `JSON.stringify({ scope_urls })` with `Content-Type: application/json` through the same `Api`, and returns `body.packages`. `PackageRow` declares only the fields this pass reads (`catalog_id`, `identity`, `name`, `visibility`, `official`, `mine`, `project`, `current_version.{version,title,description}`, `applies`).

```tsx
// ClassDashboard.tsx: listed again only when the URLs change, and only the latest answer is kept.
const urls = profile ? scopeUrls(profile) : null;
const urlsKey = urls ? JSON.stringify(urls) : null;
useEffect(() => {
  if (!urlsKey) return;
  let current = true;
  services.reportServer.listPackages(JSON.parse(urlsKey) as string[])
    .then((listed) => { if (current) { setRows(listed); setListProblem(null); } })
    .catch((error) => { if (current) refused(error, setListProblem, "report-server"); });
  return () => { current = false; };
}, [urlsKey, services]);
```

The effect depends on the serialized URLs rather than on `profile`, so a snapshot that changes only `derived_at` does not list again; the cleanup's `current = false` is what discards a late answer.

`PackageList.tsx` renders each expanded group as `<section aria-labelledby>` with an `h3` and a `<ul>` of rows (title, version, description, identity in `<code>`), and Community as:

```tsx
<section aria-labelledby={headingId}>
  <h3 id={headingId}>{group.heading}</h3>
  <details className="community">
    <summary>Show {group.rows.length} community {group.rows.length === 1 ? "package" : "packages"}</summary>
    <p className="disclosure">
    These packages are not reviewed by Concord. Running one runs a stranger's code with your
      access to student data, and nothing stops it sending that data elsewhere.
    </p>
    <Rows rows={group.rows} />
  </details>
</section>
```

The heading stays outside `<summary>`: `summary` is exposed as a button-like control whose children are presentational, so a heading inside it is not reliably a heading to a screen reader. The throwaway build put the `h3` inside; its test finds the disclosure by its summary text and the heading by role, so both change with this.

No groups renders "No packages apply to this class yet." The page wraps its status lines in one `<div className="status" aria-live="polite">`, and renders `PackageList` only when there is a profile, rows and no list problem.

Tests: grouping puts an official row that is also mine under Official, a project-visible row on the scope's project under that project, one on another project nowhere, a public stranger's under Community, and an `applies: false` row nowhere; project headings follow `project_ids` and fall back to "Project <id>"; order is by title ignoring case, with titles that only a case-sensitive comparison would order differently (`"apple"` before `"Banana"`); an empty title falls back to `name`. In the page: the list body is the profile's URLs in order, a snapshot changing only `derived_at` does not list again, a URL change does; a held first answer released after a second is not rendered (catches removing the `current` check); Community is an `h3` followed by a closed `<details>` whose summary names the count and whose body carries the disclosure, and Official is an `h3`; "no packages apply" and the truncated line; a `TypeError` from the list shows "could not be reached"; a report-server 403 shows its message and not the withdrawn page (catches routing every 403 to `withdrawn`, which the throwaway build did); an old `SessionExpired` calls `onExpired` once.

---

### The READMEs

**Summary**: R25. The prose this pass invalidates.

**Files affected**:
- `app/README.md`: "How it is launched" shows `?authDomain=<portal>&classId=<id>&loginHint=<user id>` and describes the code flow, the allowlist in `src/shell/portals.ts`, and the token held in memory. "Running against a local portal" replaces `RESEARCHER_DASHBOARD_URL` (gone since RIGSE-368) with what is needed now: a `Client` with app id `researcher-dashboard`, type `public`, scopes `class:researcher-read class:researcher-run packages:read`, the dev server's `http://localhost:5173/index.html` among its redirect URIs, an `ExternalReport` pointing at it, and `VITE_DEV_PORTAL`, `VITE_DEV_REPORT_SERVER` and `VITE_DEV_FIREBASE_PROJECT` for the dev server. "What it reads" becomes the portal (the scope, the Firebase token, the profile refresh), report-server (the package list) and report-service's Firebase project (the class's profile document); the CLUE row and "two sign-ins" paragraph go. A line under Deploy says a branch build is launched on staging only if its URL is among the staging `Client`'s redirect URIs.
- `README.md`: the first line reads "The Researcher Dashboard: a browser app and the runner that runs a package for it."

**Estimated diff size**: ~60

## Open Questions

### RESOLVED: A report-server 403 on the list
**Context**: The throwaway build's `refused()` sent every 403 to the withdrawn page, where R21 shows report-server's message.
**Options considered**:
- A) Show report-server's message; only rigse's 403 renders the withdrawn page.
- B) Render the withdrawn page for every 403.

**Decision**: A (Doug, 2026-10-09). Only rigse's 403 means the researcher check failed. `refused` takes which server refused, as above.

### RESOLVED: Judgment call: resolve the launch before React renders
**Context**: The callback must redeem its code exactly once.
**Options considered**:
- A) A plain async `start()` in `main.tsx`, then render the result.
- B) A `useEffect` in `App` with a ref guarding against StrictMode's second run.

**Decision**: A. Under StrictMode, B's effect runs twice in development and the second run finds the pending entry already removed, so it needs a guard whose only job is to undo React's development check; and a component that navigates away during render is awkward to test. A keeps every side effect of the launch in one function with injected dependencies, which `start.test.ts` exercises without rendering anything.

### RESOLVED: Judgment call: one `Api` class for both servers
**Context**: rigse and report-server take the same bearer and both need the expiry and 401 handling.
**Options considered**:
- A) `Api` holds origin, token and `fetch`, and `Portal` and `ReportServer` are thin wrappers over it.
- B) Keep `Portal.request` and give `ReportServer` its own copy.

**Decision**: A. The expiry margin and the young-401 rule have to agree for both servers, and one implementation is the only way to keep them agreeing. `PortalError` becomes `ApiError`, since it is no longer the portal's alone.

### RESOLVED: Judgment call: inject a services object into the page rather than mock modules
**Context**: `ClassDashboard` talks to rigse, report-server and Firestore.
**Options considered**:
- A) `DashboardServices` passed as a prop, with `makeServices(config, token)` building the real one.
- B) `vi.mock` the Firebase and fetch modules in the page tests.

**Decision**: A. The page tests drive snapshots by hand (missing, then present; URLs changed; an answer held back), which needs control of the listener callback that a module mock gives only awkwardly. The one thing that needs a module mock, the persistence argument to `initializeAuth`, has its own small test.

## The staging check

Not a commit. After REPORT-167 is on report-server staging, `PackagesCorsOrigins` on `report-service-qa` names `https://models-resources.concord.org`, this branch's URL is among the staging `Client`'s redirect URIs, and the class-profile half of report-service is deployed (requirements, "Prerequisites outside this repository"):

1. As a researcher with a grant reaching class 223, follow its "Researcher Dashboard" link from project 20's Research Classes page, with the link's path changed from `branch/main` to this branch's.
2. The page shows class 223's name, teachers, cohorts and assignments, and the address bar holds the launch query with no `code`.
3. On a class with no profile, "Reading this class's activities…" gives way to the list within a minute, and the network panel shows exactly one `refresh_profile`; a reload shows the list at once and no `refresh_profile`.
4. The list's request carries the bearer and the profile's URLs, and a package published to staging with a pattern the class matches is listed under its group; one with a pattern it does not match is absent.
5. `sessionStorage`, `localStorage` and IndexedDB for the origin hold no access token and no Firebase session after the launch.
6. A second tab on another class leaves the first tab's page working.

Post the result to the stream channel.

## Self-Review

Roles: commit reviewer, test writer, Security Engineer, Senior Engineer, operator, WCAG Accessibility Expert. Each finding was checked against the throwaway build or `main`'s code before it was written, and each had one defensible correction, applied in place.

### Commit reviewer

#### RESOLVED: The OAuth step was over the size guideline
"The OAuth launch" was about +700 lines with tests. It is now two steps of about +400 each: the allowlist and the authorization request, then the callback, the token and the class. The first compiles and runs alone: a callback has no `authDomain`, so it renders the info page until the second step.

### Test writer

#### RESOLVED: R4's planned test could not fail
`ClassDashboard` in the throwaway build receives only `services` and `onExpired`; the `Launch` never reaches it (checked in the patch). A test that the page shows the scope endpoint's class rather than the launch's is true by construction. R4 now states the structural guarantee, R27 no longer claims a test for it, and the step says the page receives no launch.

### Senior Engineer

#### RESOLVED: A refused profile listener left the packages section silently empty
`watchDoc`'s error callback only logs (`app/src/shell/firebase.ts` on `main`), and the page renders nothing for a profile that never arrives: no reading line, no list, no reason. R11 now asks for a line, and the profile step adds `onError` to `watchDoc` and a test.

### WCAG Accessibility Expert

#### RESOLVED: Community's heading sat inside `<summary>`
The throwaway build's `<summary><h3>…</h3></summary>` puts the heading inside a control whose children are presentational. The heading now precedes the disclosure in its own section, and the summary's text names the count.

### Operator

#### RESOLVED: No staging check was written down
The requirements name prerequisites "for the staging check of the implementation", and no step said what that check is. "The staging check" above lists it, including the two things only a browser can show: the CORS preflight on the list, and that nothing persists in the origin's storage.

### Fresh review (2026-10-09)

A second review by a session that did not write the spec, in the roles requirements.md's fresh review names, against the throwaway build applied to `e363311` (61 tests reproduced) with throwaway tests and mutations, all deleted. Each finding had one defensible correction, applied in place.

#### RESOLVED: Test writer: the refresh-once test could not fail
Its second snapshot was `null` again. React skips a state update to the same value, so the refresh effect never re-ran, and deleting the `refreshed` ref left the suite green. Two distinct stale profiles catch it: with the ref deleted, the refresh was called twice. The profile step's tests now say so.

#### RESOLVED: Test writer: no test could catch deleting the official sort key
Every official row is grouped under Official (R18), so `byOfficialThenTitle`'s first comparison never decided anything, and deleting it left the suite green. The key is deleted and the comparator is `byTitle`.

#### RESOLVED: Commit reviewer: step two's `main.tsx` did not compile
It was "rewritten as below", and the code below tests `started.kind === "ready"`, which TypeScript refuses (TS2367) while `Start` has no `ready` case, which the next step adds. Step two now renders what `start` resolves to, and the `again` callback moves to the next step with `App`'s `reauthorize` prop.

#### RESOLVED: Senior Engineer: the patch has no stylesheet changes, and the class step used an unstyled class
The patch changes neither `styles.css` nor the READMEs, and the first step deleted `.platform` while the class step renders the tool as `.tool`, which no rule styles. The throwaway build section says what the patch lacks, and the class step adds `.tool`.

#### RESOLVED: Senior Engineer: `refused` and `start` changed with requirements.md's fresh findings
`refused` takes `"firebase"` beside the two servers and names what could not be reached, and `start` catches whatever its launch throws. Both have tests that catch the throwaway build's behavior.

#### RESOLVED: Global rules: a process section and a British spelling
"Stage 8" recorded how a decision was reached; it is now a resolved question with the decision. The code's `cancelled` is `canceled`.
