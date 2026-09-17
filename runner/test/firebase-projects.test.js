import assert from "node:assert/strict";
import test from "node:test";
import { firebaseConfig, knownProjects, portalFirebaseApp } from "../server/firebase-projects.js";

// The runner signs into both, so both have to be configured or an analysis fails at
// sign-in rather than at startup.
test("both projects an analysis touches are configured", () => {
  assert.deepEqual(knownProjects().sort(), ["collaborative-learning-staging", "report-service-dev"]);
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

test("the portal firebase_apps row is paired with each project", () => {
  for (const project of knownProjects()) {
    assert.ok(portalFirebaseApp(project), `${project} names no portal firebase_apps row`);
  }
});

test("an unconfigured project fails by name rather than at sign-in", () => {
  assert.throws(
    () => firebaseConfig("collaborative-learning-ec215"),
    /No Firebase config for project collaborative-learning-ec215/
  );
});
