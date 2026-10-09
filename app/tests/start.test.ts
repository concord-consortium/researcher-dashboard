import { afterEach, describe, expect, it, vi } from "vitest";
import { reauthorizer, start, type StartDeps } from "../src/shell/start";

const STAGING = "https://learn.portal.staging.concord.org";
const PAGE = { origin: "https://models-resources.concord.org", pathname: "/researcher-dashboard/branch/main/index.html" };
const LINK = `?authDomain=${encodeURIComponent(`${STAGING}/`)}&classId=223&loginHint=200`;

type Deps = StartDeps & { navigated: string[]; replaced: string[] };

function deps(
  search: string,
  { storage = sessionStorage, body = { access_token: "at", expires_in: 28800 } as unknown, ok = true } = {}
): Deps {
  const navigated: string[] = [], replaced: string[] = [];
  return {
    search, location: PAGE, storage, navigated, replaced,
    navigate: (u) => navigated.push(u), replaceUrl: (u) => replaced.push(u),
    fetchImpl: vi.fn(async () => ({ ok, status: ok ? 200 : 400, json: async () => body })) as unknown as typeof fetch,
    now: () => 5000, devPortal: null
  };
}

async function launch(): Promise<string> {
  const out = deps(LINK);
  expect(await start(out)).toEqual({ kind: "redirecting" });
  return new URL(out.navigated[0]).searchParams.get("state")!;
}

afterEach(() => sessionStorage.clear());

describe("start", () => {
  it("sends a launch to the allowlisted portal's authorize endpoint", async () => {
    const out = deps(LINK);
    expect(await start(out)).toEqual({ kind: "redirecting" });
    const url = new URL(out.navigated[0]);
    expect(url.origin + url.pathname).toBe(`${STAGING}/auth/oauth_authorize`);
    expect(url.searchParams.get("redirect_uri")).toBe(`${PAGE.origin}${PAGE.pathname}`);
    expect(url.searchParams.get("context")).toBe("class:223");
  });

  it("requests nothing for a portal outside the allowlist", async () => {
    const out = deps("?authDomain=https%3A%2F%2Fevil.test%2F&classId=1");
    expect(await start(out)).toEqual({ kind: "info", reason: "unknown-portal" });
    expect(out.navigated).toEqual([]);
  });

  it("renders the info page with no launch at all", async () => {
    expect(await start(deps(""))).toEqual({ kind: "info", reason: "no-launch" });
  });

  it("renders the sign-in page, not a blank one, when the launch throws", async () => {
    const refusing = { setItem() { throw new DOMException("denied", "SecurityError"); } } as unknown as Storage;
    const out = deps(LINK, { storage: refusing });
    expect(await start(out)).toEqual({ kind: "info", reason: "sign-in-failed" });
    expect(out.navigated).toEqual([]);
  });

  it("redeems the code it was sent back with, then clears it from the address bar", async () => {
    const state = await launch();
    const back = deps(`?code=c1&response_type=code&state=${state}`);
    expect(await start(back)).toMatchObject({ kind: "ready", launch: { classId: "223" }, token: { accessToken: "at" } });
    expect(back.replaced).toEqual([`${PAGE.pathname}${LINK}`]);
  });

  it("keeps the token out of every Web Storage", async () => {
    const state = await launch();
    await start(deps(`?code=c1&state=${state}`));
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it("refuses a callback whose state it did not send, and clears it from the address bar", async () => {
    await launch();
    const back = deps("?code=c1&state=forged");
    expect(await start(back)).toEqual({ kind: "info", reason: "sign-in-failed" });
    expect(back.fetchImpl).not.toHaveBeenCalled();
    expect(back.replaced).toEqual([PAGE.pathname]);
  });

  // A reload then starts a fresh launch instead of replaying a spent code.
  it("puts the launch back in the address bar when the sign-in fails", async () => {
    const denied = deps(`?error=access_denied&state=${await launch()}`);
    await start(denied);
    expect(denied.replaced).toEqual([`${PAGE.pathname}${LINK}`]);
    const refused = deps(`?code=c1&state=${await launch()}`, { body: { error: "invalid_grant" }, ok: false });
    await start(refused);
    expect(refused.replaced).toEqual([`${PAGE.pathname}${LINK}`]);
  });

  it("reads access_denied as no research access, and names any other error", async () => {
    expect(await start(deps(`?error=access_denied&state=${await launch()}`))).toEqual({ kind: "info", reason: "access-denied" });
    expect(await start(deps(`?error=server_error&state=${await launch()}`)))
      .toEqual({ kind: "info", reason: "authorize-error", detail: "server_error" });
  });

  it("reports a refused exchange", async () => {
    const state = await launch();
    expect(await start(deps(`?code=c1&state=${state}`, { body: { error: "invalid_grant" }, ok: false })))
      .toEqual({ kind: "info", reason: "sign-in-failed", detail: "invalid_grant" });
  });
});

describe("reauthorizer", () => {
  const PORTAL = { origin: STAGING, reportServer: "https://report-server.concordqa.org", firebaseProject: "report-service-dev" };
  const LAUNCH = { authDomain: `${STAGING}/`, classId: "223", loginHint: null };

  it("starts one authorization however often it is called, so the stored state is the one sent", async () => {
    const out = deps("");
    const again = reauthorizer(out, PORTAL, LAUNCH, vi.fn());
    again();
    again();
    await vi.waitFor(() => expect(out.navigated.length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(out.navigated).toHaveLength(1);
    const pending = JSON.parse(sessionStorage.getItem("researcher-dashboard:pending-launch")!);
    expect(new URL(out.navigated[0]).searchParams.get("state")).toBe(pending.state);
  });

  it("reports an authorization that cannot start", async () => {
    const refusing = { setItem() { throw new DOMException("denied", "SecurityError"); } } as unknown as Storage;
    const onFailure = vi.fn();
    reauthorizer(deps("", { storage: refusing }), PORTAL, LAUNCH, onFailure)();
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
  });
});
