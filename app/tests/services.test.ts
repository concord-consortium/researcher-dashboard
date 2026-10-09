import { describe, expect, it, vi } from "vitest";
import { SCOPE } from "./fixtures";

const signIn = vi.fn(async () => ({ db: true }));
const watchDoc = vi.fn(() => () => {});
vi.mock("../src/shell/firebase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/shell/firebase")>()),
  signIn,
  watchDoc
}));

const CONFIG = { origin: "https://learn.portal.staging.concord.org", reportServer: "https://rs.test", firebaseProject: "report-service-dev" };
const TOKEN = { accessToken: "at", issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER };

describe("makeServices", () => {
  it("watches the scope's class document in the portal's own Firebase project", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ token: "custom" }) }));
    vi.stubGlobal("fetch", fetchImpl);
    try {
      const { makeServices } = await import("../src/shell/services");
      const onValue = vi.fn(), onError = vi.fn();
      await makeServices(CONFIG, TOKEN).watchProfile(SCOPE, onValue, onError);

      const firebaseUrl = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
      expect(firebaseUrl.origin).toBe(CONFIG.origin);
      expect(firebaseUrl.searchParams.get("firebase_app")).toBe("report-service-dev");
      expect(signIn).toHaveBeenCalledWith("report-service-dev", "custom", null);
      expect(watchDoc).toHaveBeenCalledWith(
        { db: true }, "researcher_dashboard/learn_portal_staging_concord_org/classes/hash223", onValue, onError
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
