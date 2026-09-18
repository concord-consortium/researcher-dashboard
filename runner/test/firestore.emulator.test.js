import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before, describe } from "node:test";
import { doc, getDoc } from "firebase/firestore";
import { loadEnv } from "../server/config.js";
import { FirestoreStore } from "../server/firestore.js";
import { Runner } from "../server/runner.js";
import { resultPath, classPath, researcherPath } from "../server/status.js";
import { DirBackend, Syncer } from "../server/sync/index.js";

// Skipped unless the emulators are up, so the default `npm test` stays hermetic.
// `make test-emulator` starts them and sets these.
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-researcher-dashboard";

const PORTAL = "learn_portal_staging_concord_org";
const USER = "439";
const CLASS = "7be899cf".repeat(6);

// The Auth emulator does not verify the signature, so a custom token can be built
// here rather than minted by the portal. The claims are the session runner token's
// from design.md: no class_hash, and the runner claim that the rules key on.
function customToken(claims) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: "none", typ: "JWT" }),
    b64({
      iss: `runner@${PROJECT}.iam.gserviceaccount.com`,
      sub: `runner@${PROJECT}.iam.gserviceaccount.com`,
      aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
      iat: now,
      exp: now + 3600,
      uid: `researcher-${USER}`,
      claims
    }),
    ""
  ].join(".");
}

const SESSION_TOKEN = customToken({
  platform_user_id: USER,
  platform_id: "https://learn.portal.staging.concord.org",
  user_type: "researcher",
  researcher_dashboard_runner: true
});

describe("status writes against the Firestore emulator", { skip: !FIRESTORE || !AUTH }, () => {
  let work;
  let store;
  let runner;

  before(async () => {
    work = await mkdtemp(path.join(tmpdir(), "rd-emu-"));
    store = new FirestoreStore({
      projectId: PROJECT,
      emulators: { firestore: FIRESTORE, auth: AUTH }
    });
    const env = {
      ...loadEnv({ SYNC_BACKEND: "DIR", SYNC_DIR: path.join(work, "remote") }),
      dataRoot: path.join(work, "data"),
      workRoot: path.join(work, "work"),
      analysisTimeoutMs: 5000
    };
    runner = new Runner({
      env,
      makeStore: () => store,
      makeSyncer: ({ root }) =>
        new Syncer({ backend: new DirBackend(path.join(work, "remote")), root }),
      readSecret: async () => "report-service-token",
      netGuard: async () => ({ uid: 1000, binary: "stub" }),
      steps: {
        installCredential: async ({ sessionToken, store: s }) => {
          if (sessionToken) await s.signIn(sessionToken);
        },
        resolvePackage: async () => ({ expected_duration_seconds: 5 }),
        pullData: async () => ({ answers: 201, logs: 490, clue_documents: 12 }),
        runPackage: async () => ({
          version: 1,
          summary: "12 documents, 201 answers",
          sections: [{ title: "Counts", markdown: "ok" }]
        })
      }
    });
  });

  after(async () => {
    await rm(work, { recursive: true, force: true });
  });

  const read = async (p) => (await getDoc(doc(store.db, p))).data();

  test("signing in with a custom token carries the runner claims", async () => {
    await runner.run({
      microvmId: "mvm-emulator",
      runHookPayload: JSON.stringify({
        session_token: SESSION_TOKEN,
        platform_user_id: USER,
        portal: PORTAL,
        firebase_project: PROJECT,
        bucket: "researcher-dashboard-runner-staging",
        secret_name: "researcher-dashboard-runner-staging/report-service-token"
      })
    });

    const token = await store.auth.currentUser.getIdTokenResult();
    assert.equal(token.claims.researcher_dashboard_runner, true);
    assert.equal(token.claims.platform_user_id, USER);
    assert.equal(token.claims.class_hash, undefined, "the session token carries no class");
  });

  test("the researcher document reaches ready with the launch fields", async () => {
    const researcher = await read(researcherPath(PORTAL, USER));
    assert.equal(researcher.state, "ready");
    assert.equal(researcher.microvm_id, "mvm-emulator");
    assert.ok(researcher.expires_at, "expires_at drives the /analyze duration refusal");
    assert.ok(researcher.updated_at);
  });

  test("an analysis writes a real document that reads back as done", async () => {
    await runner.startPackage({
      scope: { kind: "class", class_hash: CLASS, class_id: 111 },
      package: { name: "demo", version: "1.0.0", checksum: "sha256:abc" },
      class_tokens: {
        "report-service-dev": customToken({
          platform_user_id: USER,
          user_type: "researcher",
          researcher_dashboard_runner: true,
          class_hash: CLASS
        })
      }
    });
    await runner.currentAnalysis?.done;

    const analysis = await read(resultPath(PORTAL, CLASS, "demo"));
    assert.equal(analysis.status, "done");
    assert.equal(analysis.requested_by, USER);
    assert.deepEqual(analysis.package, {
      name: "demo",
      version: "1.0.0",
      checksum: "sha256:abc"
    });
    // display is the contract the dashboard app renders from, so it has to
    // survive the round trip through Firestore intact.
    assert.equal(analysis.display.summary, "12 documents, 201 answers");
    assert.deepEqual(analysis.display.sections, [{ title: "Counts", markdown: "ok" }]);

    const klass = await read(classPath(PORTAL, CLASS));
    assert.equal(klass.data.answers, 201);
    assert.equal(klass.last_pulled_by, USER);
    assert.ok(klass.data.last_pull_at);
  });

  test("suspend and resume are durable, not just in-memory", async () => {
    await runner.suspend();
    assert.equal((await read(researcherPath(PORTAL, USER))).state, "suspended");
    await runner.resume();
    assert.equal((await read(researcherPath(PORTAL, USER))).state, "ready");
  });
});
