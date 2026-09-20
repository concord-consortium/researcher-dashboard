import { describe, expect, it } from "vitest";
import { emulatorsFromEnv, paths, portalSegment } from "../src/shell/firebase";

describe("portalSegment", () => {
  // The convention CLUE and report-service already use for portal-keyed collections.
  // Hostnames cannot contain an underscore, so the two forms round-trip exactly.
  it("is the portal host with its dots as underscores", () => {
    expect(portalSegment("https://learn.portal.staging.concord.org"))
      .toBe("learn_portal_staging_concord_org");
  });

  it("drops the port, which is not part of the segment CLUE writes", () => {
    expect(portalSegment("http://localhost:3000")).toBe("localhost:3000");
  });
});

describe("paths", () => {
  const at = paths("https://learn.portal.staging.concord.org");

  it("puts every document under the portal's own segment", () => {
    expect(at.researcher("200"))
      .toBe("researcher_dashboard/learn_portal_staging_concord_org/researchers/200");
    expect(at.results("abc"))
      .toBe("researcher_dashboard/learn_portal_staging_concord_org/classes/abc/results");
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
