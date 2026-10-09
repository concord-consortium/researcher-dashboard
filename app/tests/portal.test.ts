import { describe, expect, it, vi } from "vitest";
import { Portal, PortalError } from "../src/shell/portal";

const ORIGIN = "https://portal.test";
const TOKEN = "grant-abc";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as unknown as Response;
}

function portalWith(response: Response) {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    return response;
  }) as unknown as typeof fetch;
  return { portal: new Portal(ORIGIN, TOKEN, fetchImpl), calls };
}

describe("Portal", () => {
  it("sends the grant as the bearer", async () => {
    const { portal, calls } = portalWith(jsonResponse({ token: "custom" }));
    await portal.firebaseToken("report-service-dev", "the-hash");
    const headers = calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  describe("firebaseToken", () => {
    it("names the app, the class and the researcher flag", async () => {
      const { portal, calls } = portalWith(jsonResponse({ token: "custom" }));
      const token = await portal.firebaseToken("report-service-dev", "the-hash");

      expect(token).toBe("custom");
      const url = new URL(calls[0][0]);
      expect(url.origin).toBe(ORIGIN);
      expect(url.pathname).toBe("/api/v1/jwt/firebase");
      expect(url.searchParams.get("firebase_app")).toBe("report-service-dev");
      expect(url.searchParams.get("class_hash")).toBe("the-hash");
      // Without this the portal mints a plain token and the class-scoped rules refuse it.
      expect(url.searchParams.get("researcher")).toBe("true");
    });
  });

  describe("when the portal refuses", () => {
    it("carries the portal's own message rather than inventing one", async () => {
      const { portal } = portalWith(
        jsonResponse({ message: "You do not have access to the requested class_hash as a researcher" }, 400)
      );
      await expect(portal.firebaseToken("report-service-dev", "h")).rejects.toThrow(/do not have access/);
    });

    it("still fails when the body is not json", async () => {
      const broken = {
        ok: false, status: 502,
        json: async () => { throw new Error("not json"); }
      } as unknown as Response;
      const { portal } = portalWith(broken);
      await expect(portal.firebaseToken("report-service-dev", "h")).rejects.toThrow(PortalError);
    });
  });
});

// The default fetch is the one path no other test here covers, because every one of them
// injects a stub. Calling a bare `fetch` reference as a method of the Portal instance is
// rejected by browsers with "Illegal invocation", which only shows up in a real one.
describe("the default fetch", () => {
  it("calls the global fetch with the global as its receiver", async () => {
    const calls: string[] = [];
    const stub = vi.fn(function (this: unknown, url: string) {
      // A real browser fetch throws unless `this` is the window; asserting the receiver is
      // what makes this test fail when the implementation stores a bare reference.
      if (this !== globalThis && this !== undefined) throw new TypeError("Illegal invocation");
      calls.push(url);
      return Promise.resolve(jsonResponse({ token: "custom" }));
    });
    vi.stubGlobal("fetch", stub);

    await new Portal(ORIGIN, TOKEN).firebaseToken("report-service-dev", "h");

    expect(calls).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
