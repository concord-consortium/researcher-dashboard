import { describe, expect, it } from "vitest";
import { authorizeUrl, challengeFor, randomValue, redirectUriFor } from "../src/shell/oauth";

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
