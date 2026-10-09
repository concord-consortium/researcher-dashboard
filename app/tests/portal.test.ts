import { afterEach, describe, expect, it, vi } from "vitest";
import { Api, ApiError, Portal, ReportServer } from "../src/shell/portal";

const TOKEN = { accessToken: "at-1", issuedAt: 0, expiresAt: 8 * 3600 * 1000 };

function respond(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function apiWith(response: Response, now = 10 * 60 * 1000, origin = "https://portal.test") {
  const fetchImpl = vi.fn(async () => response);
  return { api: new Api(origin, TOKEN, fetchImpl as unknown as typeof fetch, () => now), fetchImpl };
}

function call(fetchImpl: ReturnType<typeof vi.fn>) {
  return fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
}

describe("Api", () => {
  it("sends the access token as the bearer", async () => {
    const { api, fetchImpl } = apiWith(respond({}));
    await new Portal(api).scope();
    expect(call(fetchImpl)[0]).toBe("https://portal.test/api/v1/researcher_dashboard/scope");
    expect((call(fetchImpl)[1].headers as Record<string, string>).Authorization).toBe("Bearer at-1");
  });

  it("asks for a new token rather than send one about to expire", async () => {
    const { api, fetchImpl } = apiWith(respond({}), TOKEN.expiresAt - 30_000);
    await expect(api.request("/x")).rejects.toMatchObject({ young: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // A portal issuing tokens that expire within the margin would otherwise send the browser back
  // to it for another such token forever.
  it("stops rather than authorizing again when a fresh token is already near expiry", async () => {
    const short = { accessToken: "at-1", issuedAt: 0, expiresAt: 30_000 };
    const fetchImpl = vi.fn();
    const api = new Api("https://portal.test", short, fetchImpl as unknown as typeof fetch, () => 1_000);
    await expect(api.request("/x")).rejects.toMatchObject({ young: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("tells a 401 on a fresh token from one on an old token", async () => {
    await expect(apiWith(respond({}, 401), 10_000).api.request("/x")).rejects.toMatchObject({ young: true });
    await expect(apiWith(respond({}, 401)).api.request("/x")).rejects.toMatchObject({ young: false });
  });

  it("keeps the server's message on a refusal", async () => {
    await expect(apiWith(respond({ message: "You do not have access" }, 403)).api.request("/x"))
      .rejects.toEqual(new ApiError("You do not have access", 403));
  });

  it("still fails when the body is not json", async () => {
    const broken = { ok: false, status: 502, json: async () => { throw new Error("not json"); } } as unknown as Response;
    await expect(apiWith(broken).api.request("/x")).rejects.toEqual(new ApiError("/x failed", 502));
  });
});

describe("Portal", () => {
  it("asks for a Firebase token for the scope's class, as a researcher", async () => {
    const { api, fetchImpl } = apiWith(respond({ token: "custom" }));
    expect(await new Portal(api).firebaseToken("report-service-dev", "hash1")).toBe("custom");
    const url = new URL(call(fetchImpl)[0]);
    expect(url.pathname).toBe("/api/v1/jwt/firebase");
    expect(Object.fromEntries(url.searchParams)).toEqual({ firebase_app: "report-service-dev", class_hash: "hash1", researcher: "true" });
  });

  it("refreshes the profile with no body", async () => {
    const { api, fetchImpl } = apiWith(respond({ queued: true }, 202));
    await new Portal(api).refreshProfile();
    expect(call(fetchImpl)[0]).toBe("https://portal.test/api/v1/researcher_dashboard/refresh_profile");
    expect(call(fetchImpl)[1]).toMatchObject({ method: "POST" });
    expect(call(fetchImpl)[1].body).toBeUndefined();
  });
});

describe("ReportServer", () => {
  it("lists with the scope's URLs as a JSON body", async () => {
    const { api, fetchImpl } = apiWith(respond({ packages: [] }), undefined, "https://rs.test");
    expect(await new ReportServer(api).listPackages(["a", "b"])).toEqual([]);
    expect(call(fetchImpl)[0]).toBe("https://rs.test/api/v1/packages/list");
    expect(call(fetchImpl)[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(call(fetchImpl)[1].body as string)).toEqual({ scope_urls: ["a", "b"] });
    expect((call(fetchImpl)[1].headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});

// Every other test injects a stub. Calling a bare `fetch` reference as a method of the Api is
// rejected by browsers with "Illegal invocation", which only shows up in a real one.
describe("the default fetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the global fetch with the global as its receiver", async () => {
    const stub = vi.fn(function (this: unknown) {
      if (this !== globalThis && this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(respond({}));
    });
    vi.stubGlobal("fetch", stub);
    await new Api("https://portal.test", TOKEN, undefined, () => 0).request("/x");
    expect(stub).toHaveBeenCalledTimes(1);
  });
});
