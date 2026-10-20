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
    await expect(apiWith(broken).api.request("/x")).rejects.toEqual(new ApiError(null, 502, "/x"));
    await expect(apiWith(broken).api.request("/x")).rejects.toMatchObject({ reason: null, message: "/x failed" });
  });
});

describe("Portal", () => {
  it("asks /auth/user who signed in, and names them from its first and last names, with the username", async () => {
    const { api, fetchImpl } = apiWith(respond({ provider: "concord_id", id: "1", extra: { first_name: "Dana", last_name: "Researcher", full_name: "Full Name", username: "dresearcher" } }));
    expect(await new Portal(api).user()).toEqual({ name: "Dana Researcher", username: "dresearcher" });
    const [url, init] = call(fetchImpl);
    expect(url).toBe("https://portal.test/auth/user");
    expect(init.method).toBeUndefined();
    expect(init.headers).toEqual({ Authorization: "Bearer at-1" });
  });

  it("reads a name outside ASCII", async () => {
    expect((await new Portal(apiWith(respond({ extra: { first_name: "Zoë", last_name: "Ñúñez" } })).api).user())?.name).toBe("Zoë Ñúñez");
  });

  it("names the user from whichever name it has, with no username", async () => {
    expect(await new Portal(apiWith(respond({ extra: { first_name: " Dana ", last_name: "" } })).api).user()).toEqual({ name: "Dana", username: null });
  });

  it("names nobody from an answer with no name, even with a username", async () => {
    expect(await new Portal(apiWith(respond({ extra: { username: "dresearcher" } })).api).user()).toBeNull();
    expect(await new Portal(apiWith(respond({ id: "1" })).api).user()).toBeNull();
    expect(await new Portal(apiWith(respond(null)).api).user()).toBeNull();
  });

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

  it("runs one package at one version, and sends nothing else", async () => {
    const { api, fetchImpl } = apiWith(respond({ queue: [], appended: [], vm: "launched" }, 202));
    await new Portal(api).runPackage("projects/20/w", "1.0.0");
    const [url, init] = call(fetchImpl);
    expect(url).toBe("https://portal.test/api/v1/researcher_dashboard/run_package");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"packages":[{"identity":"projects/20/w","version":"1.0.0"}]}');
    expect(init.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer at-1" });
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

  it("resolves one version of a package by its identity", async () => {
    const { api, fetchImpl } = apiWith(respond({ archived: true }), undefined, "https://rs.test");
    expect(await new ReportServer(api).resolve("projects/20/w", "1.0.0")).toEqual({ archived: true });
    const [url, init] = call(fetchImpl);
    expect(url).toBe("https://rs.test/api/v1/packages/resolve?identity=projects%2F20%2Fw&version=1.0.0");
    expect(init.method).toBeUndefined();
    expect(init.headers).toEqual({ Authorization: "Bearer at-1" });
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
