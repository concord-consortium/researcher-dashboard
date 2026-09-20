# Researcher Dashboard app

The page a researcher lands on from the portal's Research Classes table. One `index.html`;
the feature is selected by `?page=`, the way portal-report selects its dashboard by query.

```sh
npm ci
npm run dev      # vite dev server
npm test         # vitest
npm run build    # tsc --noEmit && vite build
```

## How it is launched

The portal builds the launch URL, so the app is never configured with a portal: it learns
which one it belongs to from the `class` parameter.

```
index.html?page=analyze-class
          &class=https://<portal>/api/v1/classes/<id>
          &token=<short-lived OAuth grant>
          &researcher=true
```

Anything the app cannot serve, an unknown `page`, a missing or rejected token, or a `class`
that is not a portal class API URL, renders the info page rather than a broken feature. A
bookmarked launch URL whose grant has expired is the ordinary way to arrive there.

## Running against a local portal

Set `RESEARCHER_DASHBOARD_URL` in the portal's environment to this dev server's
`index.html` and launch from the portal as usual:

```sh
# in the rigse checkout
RESEARCHER_DASHBOARD_URL=http://localhost:5173/index.html docker compose up
```

Nothing needs configuring on this side. The portal's own CORS allowlist already covers
`/api/v1/researcher_dashboard/*` for any origin, so the dev server can call it.

The portal also needs a `Client` record whose `app_id` is `researcher-dashboard`
(`ResearcherDashboard::Launch::CLIENT_APP_ID`), or the launch refuses with `NotConfigured`
rather than sending you to a page that cannot authenticate.

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
| the portal | class metadata, a Firebase token per project, and the call that starts a run |
| `report-service-dev` | the researcher status document and the class's results |
| `collaborative-learning-staging` | the live CLUE document count |

Two Firebase projects means two sign-ins: a custom token is signed by one project's service
account and cannot be exchanged in another.

## Deploy

`.github/workflows/deploy-app.yml` publishes to `models-resources/researcher-dashboard/` on
every push that touches `app/`, assuming an AWS role through OIDC rather than storing a key.
A branch lands at `branch/<name>/`, a tag at `version/<tag>/`.
