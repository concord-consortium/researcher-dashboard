import { describe, expect, it } from "vitest";
import { launchQuery, parseCallback, parseLaunch } from "../src/shell/launch";
import { devPortal, portalFor } from "../src/shell/portals";

const STAGING = "https://learn.portal.staging.concord.org";
// The link external report 79 launches on staging, as found on 2026-10-09.
const LINK = `?authDomain=${encodeURIComponent(`${STAGING}/`)}&classId=223&loginHint=200`;

describe("parseLaunch", () => {
  it("reads the three parameters the portal sends", () => {
    expect(parseLaunch(LINK)).toEqual({ authDomain: `${STAGING}/`, classId: "223", loginHint: "200" });
  });

  it("needs a portal and a class id", () => {
    expect(parseLaunch("?classId=223")).toBeNull();
    expect(parseLaunch(`?authDomain=${STAGING}`)).toBeNull();
    expect(parseLaunch(`?authDomain=${STAGING}&classId=0`)).toBeNull();
    expect(parseLaunch(`?authDomain=${STAGING}&classId=22a`)).toBeNull();
  });

  // The spike's link: no compatibility shim, so it is simply not a launch.
  it("ignores the spike's launch grammar", () => {
    expect(parseLaunch("?page=analyze-class&class=https%3A%2F%2Fp%2Fapi%2Fv1%2Fclasses%2F1&token=t&researcher=true")).toBeNull();
  });

  it("drops a login hint that is not a user id", () => {
    expect(parseLaunch(`?authDomain=${STAGING}&classId=1&loginHint=x`)?.loginHint).toBeNull();
  });

  it("round-trips through launchQuery", () => {
    expect(parseLaunch(launchQuery(parseLaunch(LINK)!))).toEqual(parseLaunch(LINK));
  });
});

describe("parseCallback", () => {
  it("reads a code or an error, each with its state", () => {
    expect(parseCallback("?code=c&response_type=code&state=s")).toEqual({ state: "s", code: "c" });
    expect(parseCallback("?error=access_denied&state=s")).toEqual({ state: "s", error: "access_denied" });
    expect(parseCallback("?code=c")).toBeNull();
    expect(parseCallback(LINK)).toBeNull();
  });
});

describe("portalFor", () => {
  it("matches the allowlisted origin, trailing slash or not", () => {
    expect(portalFor(`${STAGING}/`)?.reportServer).toBe("https://report-server.concordqa.org");
    expect(portalFor(STAGING)?.firebaseProject).toBe("report-service-dev");
  });

  // This decides where a credential is sent, so near misses are refusals.
  it("refuses anything but the exact origin", () => {
    expect(portalFor("https://learn.portal.staging.concord.org.evil.test/")).toBeNull();
    expect(portalFor("http://learn.portal.staging.concord.org/")).toBeNull();
    expect(portalFor("https://learn.portal.staging.concord.org:8443/")).toBeNull();
    expect(portalFor("https://learn.concord.org/")).toBeNull();
    expect(portalFor("not a url")).toBeNull();
  });

  it("adds a local portal only on a dev server", () => {
    const env = { VITE_DEV_PORTAL: "http://localhost:3000/", VITE_DEV_REPORT_SERVER: "http://localhost:4000", VITE_DEV_FIREBASE_PROJECT: "demo" };
    expect(devPortal({ ...env, DEV: false })).toBeNull();
    const local = devPortal({ ...env, DEV: true });
    expect(portalFor("http://localhost:3000/", local)?.reportServer).toBe("http://localhost:4000");
    expect(portalFor("http://localhost:3000/")).toBeNull();
  });

  it("takes no local portal from a setting that is not a URL, and keeps only origins", () => {
    const env = { DEV: true, VITE_DEV_REPORT_SERVER: "http://localhost:4000/", VITE_DEV_FIREBASE_PROJECT: "demo" };
    expect(devPortal({ ...env, VITE_DEV_PORTAL: "localhost:3000" })).toBeNull();
    expect(devPortal({ ...env, VITE_DEV_PORTAL: "127.0.0.1:3000" })).toBeNull();
    expect(devPortal({ ...env, VITE_DEV_PORTAL: "http://localhost:3000/" })?.reportServer).toBe("http://localhost:4000");
  });
});
