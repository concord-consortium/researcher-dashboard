import assert from "node:assert/strict";
import test from "node:test";
import { clueProjectFor, firebaseConfig, knownProjects, portalFirebaseApp } from "../server/firebase-projects.js";

// Both environments' report-service and CLUE projects, so a production image needs no
// runner change.
test("every project a package run touches, in both environments, is configured", () => {
  assert.deepEqual(knownProjects().sort(), [
    "collaborative-learning-ec215",
    "collaborative-learning-staging",
    "report-service-dev",
    "report-service-pro"
  ]);
});

test("every config carries what the SDK needs to sign in and read", () => {
  for (const project of knownProjects()) {
    const config = firebaseConfig(project);
    assert.equal(config.projectId, project, `${project} config names a different project`);
    // A Web API key is what identitytoolkit keys the sign-in on; "unused" only works
    // against an emulator, so a placeholder here would pass every emulator test and
    // fail against the real project.
    assert.match(config.apiKey, /^AIza[0-9A-Za-z_-]{35}$/, `${project} apiKey is not a real key`);
    assert.ok(config.authDomain, `${project} has no authDomain`);
    // RTDB reads need it, and CLUE's staging database URL is not derivable from the
    // project id: it carries a -default-rtdb suffix.
    assert.ok(config.databaseURL?.startsWith("https://"), `${project} has no databaseURL`);
  }
});

// rigse keys class_tokens by FirebaseApp name, and CLUE production's row is not named
// after its project (collaborative-learning/src/lib/firebase-config.ts).
test("each project is paired with the portal firebase_apps row that signs its tokens", () => {
  assert.equal(portalFirebaseApp("report-service-dev"), "report-service-dev");
  assert.equal(portalFirebaseApp("report-service-pro"), "report-service-pro");
  assert.equal(portalFirebaseApp("collaborative-learning-staging"), "collaborative-learning-staging");
  assert.equal(portalFirebaseApp("collaborative-learning-ec215"), "collaborative-learning");
});

// Runner configuration per environment, not a caller parameter.
test("each report-service project names the CLUE project of its environment", () => {
  assert.equal(clueProjectFor("report-service-dev"), "collaborative-learning-staging");
  assert.equal(clueProjectFor("report-service-pro"), "collaborative-learning-ec215");
  assert.throws(() => clueProjectFor("collaborative-learning-staging"), /names no CLUE project/);
});

test("an unconfigured project fails by name rather than at sign-in", () => {
  assert.throws(() => firebaseConfig("report-service-qa"), /No Firebase config for project report-service-qa/);
});
