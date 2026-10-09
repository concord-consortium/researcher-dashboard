import { describe, expect, it, vi } from "vitest";
import { authorizeUrl, challengeFor, exchangeCode, randomValue, redirectUriFor, takePending, TokenError } from "../src/shell/oauth";

const LAUNCH = { authDomain: "https://portal.test/", classId: "223", loginHint: "200" };

describe("PKCE", () => {
  it("derives RFC 7636 appendix B's challenge from its verifier", async () => {
    expect(await challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  // rigse's AccessGrant::PKCE_VALUE.
  it("makes verifiers the portal accepts, never the same twice", () => {
    const a = randomValue(), b = randomValue();
    expect(a).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(a).not.toBe(b);
  });
});

describe("authorizeUrl", () => {
  it("asks for the class as the context, with PKCE and no scope", () => {
    const url = new URL(authorizeUrl("https://portal.test", LAUNCH, "https://app.test/index.html", "st", "ch"));
    expect(url.origin + url.pathname).toBe("https://portal.test/auth/oauth_authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "researcher-dashboard", response_type: "code", redirect_uri: "https://app.test/index.html",
      state: "st", code_challenge: "ch", code_challenge_method: "S256", context: "class:223", login_hint: "200"
    });
  });

  it("sends no login hint when the link had none", () => {
    const url = new URL(authorizeUrl("https://portal.test", { ...LAUNCH, loginHint: null }, "r", "s", "c"));
    expect(url.searchParams.has("login_hint")).toBe(false);
  });
});

describe("redirectUriFor", () => {
  it("is the page without its query, as the Client registers it", () => {
    expect(redirectUriFor({ origin: "https://m.test", pathname: "/rd/branch/main/index.html" })).toBe("https://m.test/rd/branch/main/index.html");
    expect(redirectUriFor({ origin: "https://m.test", pathname: "/rd/branch/main/" })).toBe("https://m.test/rd/branch/main/index.html");
  });
});

describe("takePending", () => {
  it("returns the launch whose state matches, once", () => {
    sessionStorage.setItem("researcher-dashboard:pending-launch", JSON.stringify({ ...LAUNCH, state: "s1", verifier: "v" }));
    expect(takePending(sessionStorage, "s1")?.verifier).toBe("v");
    expect(takePending(sessionStorage, "s1")).toBeNull();
  });

  it("refuses another state, and still forgets the entry", () => {
    sessionStorage.setItem("researcher-dashboard:pending-launch", JSON.stringify({ ...LAUNCH, state: "s1", verifier: "v" }));
    expect(takePending(sessionStorage, "forged")).toBeNull();
    expect(sessionStorage.getItem("researcher-dashboard:pending-launch")).toBeNull();
  });
});

describe("exchangeCode", () => {
  it("posts the code and verifier as a form and holds the token's expiry", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ access_token: "at", token_type: "Bearer", expires_in: 28800 }) }));
    const token = await exchangeCode("https://portal.test", "code1", "ver1", "https://app.test/index.html", fetchImpl as unknown as typeof fetch, 1000);
    expect(token).toEqual({ accessToken: "at", issuedAt: 1000, expiresAt: 1000 + 28800 * 1000 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://portal.test/oauth/token");
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      grant_type: "authorization_code", client_id: "researcher-dashboard", code: "code1", code_verifier: "ver1", redirect_uri: "https://app.test/index.html"
    });
  });

  it("throws the endpoint's error", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) }));
    await expect(exchangeCode("https://p", "c", "v", "r", fetchImpl as unknown as typeof fetch, 0)).rejects.toEqual(new TokenError("invalid_grant"));
  });
});
