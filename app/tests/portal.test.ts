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
  it("sends the launch grant as the bearer on every call", async () => {
    const { portal, calls } = portalWith(jsonResponse({ id: 111 }));
    await portal.getClass("111");
    const headers = calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("asks the portal it was launched from, not a configured one", async () => {
    const { portal, calls } = portalWith(jsonResponse({ id: 111 }));
    await portal.getClass("111");
    expect(calls[0][0]).toBe(`${ORIGIN}/api/v1/researcher_dashboard/classes/111`);
  });

  it("returns the class as the portal described it", async () => {
    const info = {
      id: 111, name: "Scotts Class A", class_hash: "abc", platform_user_id: 200,
      teacher_names: ["Scott C"], cohort_names: ["Spike"],
      assignments: [{ id: 1, runnable_id: 2, name: "CLUE", platform: null }]
    };
    const { portal } = portalWith(jsonResponse(info));
    expect(await portal.getClass("111")).toEqual(info);
  });

  describe("firebaseToken", () => {
    it("names the app, the class and the researcher flag", async () => {
      const { portal, calls } = portalWith(jsonResponse({ token: "custom" }));
      const token = await portal.firebaseToken("report-service-dev", "the-hash");

      expect(token).toBe("custom");
      const url = new URL(calls[0][0]);
      expect(url.pathname).toBe("/api/v1/jwt/firebase");
      expect(url.searchParams.get("firebase_app")).toBe("report-service-dev");
      expect(url.searchParams.get("class_hash")).toBe("the-hash");
      // Without this the portal mints a plain token and the class-scoped rules refuse it.
      expect(url.searchParams.get("researcher")).toBe("true");
    });
  });

  describe("runPackage", () => {
    it("posts the run and returns where the result will be", async () => {
      const accepted = { package: "class-counts", doc_path: "researcher_dashboard/p/classes/c/results/class-counts" };
      const { portal, calls } = portalWith(jsonResponse(accepted));

      const result = await portal.runPackage({
        class_id: 111,
        package: { name: "class-counts", version: "1.0.5", checksum: "sha256:abc" },
        firebase_project: "report-service-dev",
        firebase_apps: ["report-service-dev"]
      });

      expect(result).toEqual(accepted);
      expect(calls[0][1]?.method).toBe("POST");
      expect(JSON.parse(String(calls[0][1]?.body)).class_id).toBe(111);
    });
  });

  describe("when the portal refuses", () => {
    it("carries the portal's own message rather than inventing one", async () => {
      const { portal } = portalWith(
        jsonResponse({ message: "You do not have access to the requested class as a researcher" }, 403)
      );
      await expect(portal.getClass("111")).rejects.toThrow(/do not have access/);
    });

    // The app's answer to an expired grant is always "relaunch from the portal", which is
    // a different thing to say than "something went wrong".
    it("marks 401 and 403 as a credential problem", async () => {
      for (const status of [401, 403]) {
        const { portal } = portalWith(jsonResponse({ message: "no" }, status));
        const error = (await portal.getClass("111").catch((e) => e)) as PortalError;
        expect(error.unauthorized).toBe(true);
      }
    });

    it("does not mark a server error as a credential problem" , async () => {
      const { portal } = portalWith(jsonResponse({ message: "boom" }, 500));
      const error = (await portal.getClass("111").catch((e) => e)) as PortalError;
      expect(error.unauthorized).toBe(false);
    });

    it("still fails when the body is not json", async () => {
      const broken = {
        ok: false, status: 502,
        json: async () => { throw new Error("not json"); }
      } as unknown as Response;
      const { portal } = portalWith(broken);
      await expect(portal.getClass("111")).rejects.toThrow(PortalError);
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
      return Promise.resolve(jsonResponse({ id: 111 }));
    });
    vi.stubGlobal("fetch", stub);

    await new Portal(ORIGIN, TOKEN).getClass("111");

    expect(calls).toEqual([`${ORIGIN}/api/v1/researcher_dashboard/classes/111`]);
    vi.unstubAllGlobals();
  });
});
