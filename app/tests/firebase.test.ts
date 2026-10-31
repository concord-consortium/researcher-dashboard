import { describe, expect, it } from "vitest";
import { activityPath, classPath, emulatorsFromEnv, firebaseConfig, portalSegment, resultsPath, runnerPath, scopeDocPath } from "../src/shell/firebase";
import { DEPLOYED } from "../src/shell/portals";

describe("portalSegment", () => {
  // The convention CLUE and report-service already use for portal-keyed collections.
  // Hostnames cannot contain an underscore, so the two forms round-trip exactly.
  it("is the portal host with its dots as underscores", () => {
    expect(portalSegment("https://learn.portal.staging.concord.org"))
      .toBe("learn_portal_staging_concord_org");
  });

  it("keeps the port, as report-service's own segment does", () => {
    expect(portalSegment("http://localhost:3000")).toBe("localhost:3000");
  });
});

describe("classPath", () => {
  it("puts the class document under the portal's own segment", () => {
    expect(classPath("https://learn.portal.staging.concord.org", "abc"))
      .toBe("researcher_dashboard/learn_portal_staging_concord_org/classes/abc");
  });
});

describe("activityPath", () => {
  it("puts the class's learner activity under the portal's own segment", () => {
    expect(activityPath("https://learn.portal.staging.concord.org", "abc"))
      .toBe("researcher_dashboard/learn_portal_staging_concord_org/activity/abc/users");
  });
});

describe("the researcher's own paths", () => {
  const portal = "https://learn.portal.staging.concord.org";
  const root = "researcher_dashboard/learn_portal_staging_concord_org";

  it("puts the session under the portal, by platform user id", () => {
    expect(runnerPath(portal, 200)).toBe(`${root}/runners/200`);
  });

  it("puts the scope document and its results under the class, by platform user id", () => {
    expect(scopeDocPath(portal, "abc", 200)).toBe(`${root}/classes/abc/researchers/200`);
    expect(resultsPath(portal, "abc", 200)).toBe(`${root}/classes/abc/researchers/200/results`);
  });
});

describe("emulatorsFromEnv", () => {
  it("uses the emulators when both are named", () => {
    expect(emulatorsFromEnv({ VITE_FIRESTORE_EMULATOR: "127.0.0.1:8080", VITE_AUTH_EMULATOR: "127.0.0.1:9099" }))
      .toEqual({ firestore: "127.0.0.1:8080", auth: "127.0.0.1:9099" });
  });

  it("uses the real projects when neither is named", () => {
    expect(emulatorsFromEnv({})).toBeNull();
  });

  // Half-configured is the dangerous case: signing in against the real Auth while reading
  // a local Firestore fails in a way that reads as a rules problem rather than a config one.
  it("refuses to use one without the other", () => {
    expect(emulatorsFromEnv({ VITE_FIRESTORE_EMULATOR: "127.0.0.1:8080" })).toBeNull();
    expect(emulatorsFromEnv({ VITE_AUTH_EMULATOR: "127.0.0.1:9099" })).toBeNull();
  });
});

describe("firebaseConfig", () => {
  it.each(["report-service-dev", "report-service-pro", "collaborative-learning-staging", "collaborative-learning-ec215"])("keys the %s entry by its own project id and auth domain", (id) => {
    expect(firebaseConfig(id).projectId).toBe(id);
    expect(firebaseConfig(id).authDomain).toBe(`${id}.firebaseapp.com`);
  });

  // A deployed portal whose project has no config would launch, mint a token and then fail at sign-in.
  it("has a config for every deployed portal's report-service and CLUE projects", () => {
    expect(DEPLOYED.length).toBeGreaterThan(1);
    for (const portal of DEPLOYED) {
      for (const project of [portal.firebaseProject, portal.clue.projectId]) {
        expect(firebaseConfig(project).projectId, portal.origin).toBe(project);
      }
    }
  });
});
