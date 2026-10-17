# Researcher Dashboard app

The page a researcher lands on from the "Researcher Dashboard" link on a project's Research
Classes page: the class, the packages that apply to it, and the researcher's own runs of them.
A researcher runs a package from its row, follows it through the queue to its result, and opens
the result the package wrote.

```sh
npm ci
npm run dev      # vite dev server
npm run demo     # the dev server, opened on the demo page below
npm test         # vitest
npm run build    # tsc --noEmit && vite build
```

## How it is launched

The portal's link names where to sign in, which class to ask for, and who is asking:

```
index.html?authDomain=<portal>&classId=<id>&loginHint=<user id>
```

`authDomain` must be a portal in the allowlist compiled into the build
(`src/shell/portals.ts`), which also names the report-server and Firebase project the app
uses with it; anything else renders the info page and requests nothing. The app is an OAuth2
public client: it sends the browser to the portal's authorize endpoint with a PKCE challenge
and `context=class:<classId>`, redeems the code it is sent back with at `/oauth/token`, and
holds the access token in memory only. The class it shows is the one the token is bound to.
A token about to expire, or refused with a 401, sends the browser through the authorization
again, unless the refused token is under a minute old, which renders the info page instead.

## The demo page

`demo/index.html`, served by the dev server at `/demo/`, mounts the real `App` and its pages
over canned services (`demo/world.ts`), for working on the page's look with hot reload. It signs
in nowhere and reaches no portal, report-server or Firebase. A panel picks the state (several
packages, a package running, a failed run, a long result, no active students, the info pages and
more, from `demo/scenarios.ts`), and the state is kept in the URL's `state` parameter (`/demo/?state=failed`). Run presses
and a "Student saves" button drive a simulated runner through the queued, running and finished
writes the real one makes, at a step time the panel sets.

The production build takes only `index.html`, so nothing under `demo/` ships. That is
deliberate: invented results must never reach a researcher (see `src/pages/Info.tsx`).

## Running against a local portal

The local rigse needs:

- `PORTAL_SIGNING_KEY`, `PORTAL_SIGNING_KEY_ID` and `REPORT_SERVER_URL`, or the authorize request
  comes back with `error=server_error`;
- `RESEARCHER_DASHBOARD_FUNCTION_URL` naming a report-service functions deployment, or the
  profile refresh and the run request answer 503 and no class gets a profile to list from;
- a `Client` with app id `researcher-dashboard`, type `public`, scopes
  `class:researcher-read class:researcher-run packages:read`, and the dev server's
  `http://localhost:5173/index.html` among its redirect URIs, which the portal matches exactly;
- an `ExternalReport` for classes, supporting researchers, whose URL is that page and whose
  client is that `Client`.

The local report-server needs `http://localhost:5173` in `PACKAGES_CORS_ORIGINS`, or it
refuses the bearer on the package list and resolve calls from the dev server.

Then name the local portal for the dev server. A production build never reads these:

```sh
VITE_DEV_PORTAL=http://localhost:3000 \
VITE_DEV_REPORT_SERVER=http://localhost:4000 \
VITE_DEV_FIREBASE_PROJECT=report-service-dev \
npm run dev
```

The Firebase project needs an entry in `src/shell/firebase.ts`'s config map unless the
emulator below is used.

## Running against the Firestore emulator

Both variables are required together. Naming only one is refused: signing in against the
real Auth while reading a local Firestore fails in a way that reads as a rules problem
rather than a configuration one.

```sh
VITE_FIRESTORE_EMULATOR=127.0.0.1:8080 VITE_AUTH_EMULATOR=127.0.0.1:9099 npm run dev
```

The web SDK ignores `FIRESTORE_EMULATOR_HOST`, which only the admin SDK reads, so the
connection is made explicitly, exactly as `runner/server/firestore.js` does it. An emulator
accepts any API key, so a project it has never heard of still works and needs no entry in
the config map.

The tokens still come from the portal, which signs with a real service account. Against the
emulator that is fine, because an emulator accepts any signature.

## What it reads

| | |
|---|---|
| the portal | the class's scope, a Firebase token for the class, a profile refresh when the profile is missing or stale, and a run request for one package when Run or Resume is pressed, or on its own for a finished package students have saved work since |
| report-server | the package list, each package marked as applying to the class or not, and a resolve of a package a result names that the list no longer returns |
| the portal's report-service Firebase project | the class's authored URL profile document; the researcher's session (`runners/<platform user id>`); their scope document with its counts; their results for the class, one per package; and the class's learner activity (`activity/<class hash>/users`), one document per learner with the server time of their last save |

The app writes none of the Firebase documents. Every one is written by report-service's
functions, the runner or the watchdog, and the app only listens.

## Class activity and automatic re-runs

The Class activity count is the number of learners whose last save falls within the window
`ACTIVE_WINDOW_MINUTES` in `src/shell/activity.ts` sets, by the laptop's clock. It counts saved answers, so a student
reading or thinking is not in it, and it is the same for every researcher of the class.

While the page is open, a package whose result is done and whose run started before some
learner's last save is re-run on its own, with the same request Run sends. Both times are the
server's. The page asks once per finished result, so saves made while a re-run is queued or
running give one more run after it, not a loop. A failed result, a package never run by hand,
and a package the page cannot run are not re-run on their own. An automatic request that finds
the sign-in expired stops automatic re-runs for the page's life rather than signing in again.

## Content-Security-Policy

The built `index.html` carries a Content-Security-Policy as its first `<head>` element, a
`<meta http-equiv>` added by a build-only plugin in `vite.config.ts`. A package's result is
markdown written by fetched code, and the policy bounds what the page can load and reach
whatever that markdown says: images only from the page or `data:`, and connections only to
the page, the allowlisted portals and their report-servers (from `src/shell/portals.ts`), and
the Firebase hosts named in `src/shell/csp.ts`. A portal added to the allowlist is added to
the policy by the same build. The dev server serves no policy, since Vite's development
preamble is an inline script.

## Deploy

`.github/workflows/deploy-app.yml` publishes to `models-resources/researcher-dashboard/` on
every push that touches `app/`, assuming an AWS role through OIDC rather than storing a key.
A branch lands at `branch/<name>/`, less a leading ticket key such as `RD-3-`, and a tag at `version/<tag>/`.

A branch build can be launched on staging only once its URL is among the staging
`researcher-dashboard` `Client`'s redirect URIs; an unregistered redirect URI is a portal
error, not a redirect.
