import { afterEach, describe, expect, it } from "vitest";
import { start, type StartDeps } from "../src/shell/start";

const STAGING = "https://learn.portal.staging.concord.org";
const PAGE = { origin: "https://models-resources.concord.org", pathname: "/researcher-dashboard/branch/main/index.html" };
const LINK = `?authDomain=${encodeURIComponent(`${STAGING}/`)}&classId=223&loginHint=200`;

function deps(search: string, storage: Storage = sessionStorage): StartDeps & { navigated: string[] } {
  const navigated: string[] = [];
  return { search, location: PAGE, storage, navigated, navigate: (u) => navigated.push(u), devPortal: null };
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

  it("keeps the state it sent, to check the portal's answer against", async () => {
    const out = deps(LINK);
    await start(out);
    const pending = JSON.parse(sessionStorage.getItem("researcher-dashboard:pending-launch")!);
    expect(pending).toMatchObject({ authDomain: `${STAGING}/`, classId: "223", loginHint: "200" });
    expect(new URL(out.navigated[0]).searchParams.get("state")).toBe(pending.state);
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
    const out = deps(LINK, refusing);
    expect(await start(out)).toEqual({ kind: "info", reason: "sign-in-failed" });
    expect(out.navigated).toEqual([]);
  });
});
