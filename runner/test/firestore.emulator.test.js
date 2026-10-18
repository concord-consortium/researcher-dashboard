import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";
import { Timestamp } from "firebase/firestore";
import { FirestoreStore } from "../server/firestore.js";
import { HEARTBEAT_SECONDS } from "../server/runner.js";
import { ClassDocuments, RunnerStatus, resultPath, runnerPath, scopePath } from "../server/status.js";

// Skipped unless the emulators are up, so the default `npm test` stays hermetic; CI's
// emulator job sets RD_REQUIRE_EMULATOR, which turns a missing emulator into a failure.
// No security rules are loaded, so the emulator allows every read and write: this checks
// server timestamps and the conditional write, not report-service's rules.
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const REQUIRED = process.env.RD_REQUIRE_EMULATOR === "1";
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-researcher-dashboard";

const PORTAL = "learn_portal_staging_concord_org";
const PLATFORM_ID = "https://learn.portal.staging.concord.org";
const USER = "439";
const CLASS = "7be899cf".repeat(6);

// The Auth emulator does not verify the signature, so a custom token can be built here
// rather than minted by the portal or the function.
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

test("the emulators are up wherever this suite is required", { skip: !REQUIRED }, () => {
  assert.ok(FIRESTORE && AUTH, "RD_REQUIRE_EMULATOR is set, but FIRESTORE_EMULATOR_HOST or FIREBASE_AUTH_EMULATOR_HOST is not");
});

const IDENTITY = { platform_id: PLATFORM_ID, platform_user_id: 439, user_type: "researcher", researcher_dashboard_runner: true };

describe("the runner's writes against the Firestore and Auth emulators", { skip: !FIRESTORE || !AUTH }, () => {
  const emulators = { firestore: FIRESTORE, auth: AUTH };
  let session;
  let klass;

  // The emulator's first write can take about fifteen seconds, longer than a status write
  // is allowed, so one unbounded write warms it first.
  before(async () => {
    session = new FirestoreStore({ projectId: PROJECT, emulators });
    await session.signIn(customToken(IDENTITY));
    klass = new FirestoreStore({ projectId: PROJECT, emulators });
    await klass.signIn(customToken({ ...IDENTITY, class_hash: CLASS }));
    await session.merge(runnerPath(PORTAL, USER), { platform_id: PLATFORM_ID, updated_at: session.serverTimestamp() });
  }, { timeout: 60_000 });

  after(async () => {
    await session?.close();
    await klass?.close();
  });

  test("the claims Firebase verified are the ones the runner checks", async () => {
    const claims = await session.claims();
    assert.equal(claims.researcher_dashboard_runner, true);
    assert.equal(claims.platform_user_id, 439, "a number, as rigse mints it");
    assert.equal(claims.class_hash, undefined, "the session token carries no class");
    assert.match(await session.idToken(true), /^ey/);
  });

  test("the status document is written with the server's time", async () => {
    const status = new RunnerStatus({ store: session, portal: PORTAL, platformUserId: USER, platformId: PLATFORM_ID });
    await status.write({ state: "ready", current_package: null, queue: [] });
    const doc = await session.get(runnerPath(PORTAL, USER));
    assert.equal(doc.state, "ready");
    assert.ok(doc.updated_at instanceof Timestamp);
  });

  test("a claim, a stage, a heartbeat and a finish land as one result, with Firestore timestamps", async () => {
    const docs = new ClassDocuments({ store: klass, portal: PORTAL, classHash: CLASS, platformUserId: USER, platformId: PLATFORM_ID });
    const pkg = { identity: "users/136/class-counts", version: "1.0.0", checksum: `sha256:${"ab".repeat(32)}` };
    await docs.claim("users__136__class-counts", { pkg, imageVersion: "24.0", microvmId: "mvm-emulator", expectedDurationSeconds: 120, heartbeatSeconds: HEARTBEAT_SECONDS });
    await docs.stage("users__136__class-counts", "prepare_package");
    const claimed = await klass.get(resultPath(PORTAL, CLASS, USER, "users__136__class-counts"));
    await docs.beat("users__136__class-counts");
    const beat = await klass.get(resultPath(PORTAL, CLASS, USER, "users__136__class-counts"));
    assert.equal(beat.status, "running");
    assert.equal(beat.heartbeat_seconds, HEARTBEAT_SECONDS);
    assert.ok(beat.started_at.isEqual(claimed.started_at), "a beat leaves started_at alone");
    await docs.done("users__136__class-counts", { pkg, imageVersion: "24.0", summary: "12 documents", display: "# Counts" });
    const result = await klass.get(resultPath(PORTAL, CLASS, USER, "users__136__class-counts"));
    assert.equal(result.status, "done");
    assert.equal(result.display, "# Counts");
    assert.equal(result.microvm_id, "mvm-emulator");
    assert.ok(result.started_at instanceof Timestamp && result.finished_at instanceof Timestamp);
  });

  test("a guarded runner-document write lands only while the document records this VM", async () => {
    const status = new RunnerStatus({ store: session, portal: PORTAL, platformUserId: USER, platformId: PLATFORM_ID });
    await status.write({ state: "running", microvm_id: "mvm-emulator" });
    assert.equal(await status.write({ state: "terminated" }, { onlyIf: (doc) => doc?.microvm_id === "mvm-other" }), null);
    assert.equal((await session.get(runnerPath(PORTAL, USER))).state, "running");
    assert.ok(await status.write({ state: "terminated" }, { onlyIf: (doc) => doc?.microvm_id === "mvm-emulator" }));
    assert.equal((await session.get(runnerPath(PORTAL, USER))).state, "terminated");
  });

  test("the counts land on the researcher's scope document", async () => {
    const docs = new ClassDocuments({ store: klass, portal: PORTAL, classHash: CLASS, platformUserId: USER, platformId: PLATFORM_ID });
    await docs.counts({ answers: 201, logs: 490, logFreshnessAt: "2026-08-26T00:00:00Z" });
    const doc = await klass.get(scopePath(PORTAL, CLASS, USER));
    assert.equal(doc.data.answers, 201);
    assert.ok(doc.data.last_pull_at instanceof Timestamp);
    assert.ok(doc.data.log_freshness_at instanceof Timestamp);

    // A later run that reports only answers leaves none of the earlier run's other counts.
    await docs.counts({ answers: 7 });
    const later = await klass.get(scopePath(PORTAL, CLASS, USER));
    assert.deepEqual(Object.keys(later.data).sort(), ["answers", "last_pull_at"]);
    assert.equal(later.platform_id, PLATFORM_ID);
  });
});
