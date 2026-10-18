import assert from "node:assert/strict";
import test from "node:test";
import { firebaseConfig, knownProjects } from "../server/firebase-projects.js";

// Both environments' report-service projects, so a production image needs no runner change.
test("the runner knows report-service's project in both environments, and nothing else", () => {
  assert.deepEqual(knownProjects().sort(), ["report-service-dev", "report-service-pro"]);
});

test("every config carries what the SDK needs to sign in", () => {
  for (const project of knownProjects()) {
    const config = firebaseConfig(project);
    assert.equal(config.projectId, project, `${project} config names a different project`);
    // A Web API key is what identitytoolkit keys the sign-in on; "unused" only works
    // against an emulator, so a placeholder here would pass every emulator test and
    // fail against the real project.
    assert.match(config.apiKey, /^AIza[0-9A-Za-z_-]{35}$/, `${project} apiKey is not a real key`);
    assert.ok(config.authDomain, `${project} has no authDomain`);
  }
});

test("an unconfigured project fails by name rather than at sign-in", () => {
  assert.throws(() => firebaseConfig("report-service-qa"), /No Firebase config for project report-service-qa/);
});
