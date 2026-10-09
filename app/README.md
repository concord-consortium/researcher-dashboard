# Researcher Dashboard app

The page a researcher lands on from the "Researcher Dashboard" link on a project's Research
Classes page: the class, and the packages that apply to it.

```sh
npm ci
npm run dev      # vite dev server
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

## Running against a local portal

The local rigse needs:

- `PORTAL_SIGNING_KEY`, `PORTAL_SIGNING_KEY_ID` and `REPORT_SERVER_URL`, or the authorize request
  comes back with `error=server_error`;
- `RESEARCHER_DASHBOARD_FUNCTION_URL` naming a report-service functions deployment, or the
  profile refresh answers 503 and no class gets a profile to list from;
- a `Client` with app id `researcher-dashboard`, type `public`, scopes
  `class:researcher-read class:researcher-run packages:read`, and the dev server's
  `http://localhost:5173/index.html` among its redirect URIs, which the portal matches exactly;
- an `ExternalReport` for classes, supporting researchers, whose URL is that page and whose
  client is that `Client`.

The local report-server needs `http://localhost:5173` in `PACKAGES_CORS_ORIGINS`, or it
refuses the package list's bearer from the dev server.

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
| the portal | the class's scope, a Firebase token for the class, and a profile refresh when the profile is missing or stale |
| report-server | the package list, each package marked as applying to the class or not |
| the portal's report-service Firebase project | the class's authored URL profile document, read and never written |

## Deploy

`.github/workflows/deploy-app.yml` publishes to `models-resources/researcher-dashboard/` on
every push that touches `app/`, assuming an AWS role through OIDC rather than storing a key.
A branch lands at `branch/<name>/`, a tag at `version/<tag>/`.

A branch build can be launched on staging only once its URL is among the staging
`researcher-dashboard` `Client`'s redirect URIs; an unregistered redirect URI is a portal
error, not a redirect.
