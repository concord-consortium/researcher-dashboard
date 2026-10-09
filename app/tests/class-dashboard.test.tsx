import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassDashboard } from "../src/pages/ClassDashboard";
import type { Profile } from "../src/shell/packages";
import { ApiError, SessionExpired, type PackageRow, type Portal, type ReportServer, type Scope } from "../src/shell/portal";
import type { DashboardServices } from "../src/shell/services";
import { row, SCOPE } from "./fixtures";

afterEach(cleanup);

const NOW = 100 * 24 * 3600 * 1000;
const CURRENT: Profile = {
  assignment_urls: ["https://ap.test/?activity=1"], interactive_urls: ["https://qi.test/open-response/"],
  assignment_fingerprint: SCOPE.assignment_fingerprint, derived_at: { toMillis: () => NOW - 1000 }
};

function services(over: {
  scope?: () => Promise<Scope>;
  refresh?: () => Promise<unknown>;
  watch?: () => Promise<() => void>;
  list?: (urls: string[]) => Promise<PackageRow[]>;
} = {}) {
  let push: (p: Profile | null) => void = () => {};
  let fail: (e: Error) => void = () => {};
  const refreshProfile = vi.fn(over.refresh ?? (async () => ({ queued: true })));
  const listPackages = vi.fn(over.list ?? (async () => [row({ title: "Wildfire open responses", official: true })]));
  const fake: DashboardServices = {
    portal: { scope: over.scope ?? (async () => SCOPE), refreshProfile } as unknown as Portal,
    reportServer: { listPackages } as unknown as ReportServer,
    watchProfile: vi.fn(over.watch ?? (async (_scope, onValue, onError) => { push = onValue; fail = onError; return () => {}; })),
    now: () => NOW
  };
  return {
    fake, refreshProfile, listPackages,
    snapshot: (p: Profile | null) => act(() => push(p)),
    refuse: () => act(() => fail(new Error("permission-denied")))
  };
}

function mount(s: ReturnType<typeof services>, onExpired = vi.fn()) {
  render(<ClassDashboard services={s.fake} onExpired={onExpired} />);
  return onExpired;
}

async function mounted(s: ReturnType<typeof services>, onExpired = vi.fn()) {
  mount(s, onExpired);
  await screen.findByRole("heading", { level: 1, name: SCOPE.name });
  return onExpired;
}

describe("ClassDashboard", () => {
  it("shows the class, its teachers, cohorts and assignments", async () => {
    await mounted(services());
    expect(screen.getByText(/T\. Teacher · Spike cohort/)).toBeDefined();
    expect(screen.getByRole("listitem").textContent).toBe("Wildfire · ActivityPlayer");
  });

  it("names an untitled assignment", async () => {
    mount(services({ scope: async () => ({ ...SCOPE, assignments: [{ ...SCOPE.assignments[0], name: null, tool: null }] }) }));
    expect((await screen.findByRole("listitem")).textContent).toBe("Untitled");
  });

  it("announces the loading line, and a failure in its place", async () => {
    mount(services({ scope: async () => { throw new TypeError("Failed to fetch"); } }));
    expect(screen.getByRole("status").textContent).toBe("Loading the class…");
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("The portal could not be reached."));
  });

  it("shows the portal's own message for a refusal it explains", async () => {
    mount(services({ scope: async () => { throw new ApiError("The Researcher Dashboard is not fully configured", 503); } }));
    expect(await screen.findByText(/not fully configured/)).toBeDefined();
  });

  it("renders the withdrawn page on the portal's 403", async () => {
    mount(services({ scope: async () => { throw new ApiError("You do not have access to this class as a researcher", 403); } }));
    expect(await screen.findByText(/access to this class has been withdrawn/)).toBeDefined();
  });

  it("renders the class-gone page on a 404", async () => {
    mount(services({ scope: async () => { throw new ApiError("The class this token was issued for no longer exists", 404); } }));
    expect(await screen.findByText(/class no longer exists/)).toBeDefined();
  });

  it("opens classes only", async () => {
    mount(services({ scope: async () => ({ ...SCOPE, kind: "cohort" }) }));
    expect(await screen.findByText(/opens classes only/)).toBeDefined();
  });

  it("re-authorizes on an expired token, and stops on a fresh one refused", async () => {
    const onExpired = mount(services({ scope: async () => { throw new SessionExpired(false); } }));
    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
    cleanup();
    const stop = mount(services({ scope: async () => { throw new SessionExpired(true); } }));
    expect(await screen.findByText(/could not be renewed/)).toBeDefined();
    expect(stop).not.toHaveBeenCalled();
  });

  it("refreshes a missing profile once, and says it is reading the class", async () => {
    const s = services();
    await mounted(s);
    await s.snapshot(null);
    expect(s.refreshProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/reading this class's activities/i)).toBeDefined();
    await s.snapshot(CURRENT);
    expect(screen.queryByText(/reading this class's activities/i)).toBeNull();
  });

  // Each snapshot is a new object, as Firestore's are; a repeated null would not re-run the
  // effect at all.
  it("refreshes once across stale snapshots", async () => {
    const s = services();
    await mounted(s);
    await s.snapshot({ ...CURRENT, assignment_fingerprint: "v1:old" });
    await s.snapshot({ ...CURRENT, assignment_fingerprint: "v1:old" });
    expect(s.refreshProfile).toHaveBeenCalledTimes(1);
  });

  it("refreshes an old profile, and never a current one", async () => {
    const old = services();
    await mounted(old);
    await old.snapshot({ ...CURRENT, derived_at: { toMillis: () => 0 } });
    expect(old.refreshProfile).toHaveBeenCalledTimes(1);
    cleanup();
    const current = services();
    await mounted(current);
    await current.snapshot(CURRENT);
    await current.snapshot({ ...CURRENT, derived_at: { toMillis: () => NOW } });
    expect(current.refreshProfile).not.toHaveBeenCalled();
  });

  it("shows the portal's reason when the refresh is refused", async () => {
    const s = services({ refresh: async () => { throw new ApiError("This class has 600 distinct assignment URLs", 422); } });
    await mounted(s);
    await s.snapshot(null);
    expect(await screen.findByText(/600 distinct assignment URLs/)).toBeDefined();
    expect(screen.queryByText(/reading this class's activities/i)).toBeNull();
  });

  it("says the profile could not be read when the listener is refused", async () => {
    const s = services();
    await mounted(s);
    await s.refuse();
    expect(screen.getByText("This class's profile could not be read.")).toBeDefined();
    expect(s.refreshProfile).not.toHaveBeenCalled();
  });

  it("says the profile could not be read when the sign-in fails", async () => {
    await mounted(services({ watch: async () => { throw new Error("auth/network-request-failed"); } }));
    expect(await screen.findByText("This class's profile could not be read.")).toBeDefined();
  });

  it("shows the Firebase token's refusal rather than the withdrawn page", async () => {
    await mounted(services({ watch: async () => { throw new ApiError("Missing firebase_app parameter", 403); } }));
    expect(await screen.findByText("Missing firebase_app parameter")).toBeDefined();
  });

  it("lists nothing until the profile exists, then lists with its URLs", async () => {
    const s = services();
    await mounted(s);
    await s.snapshot(null);
    expect(s.listPackages).not.toHaveBeenCalled();
    await s.snapshot(CURRENT);
    expect(s.listPackages).toHaveBeenCalledWith(["https://ap.test/?activity=1", "https://qi.test/open-response/"]);
    expect(await screen.findByText("Wildfire open responses")).toBeDefined();
  });

  it("lists again only when the URLs change", async () => {
    const s = services();
    await mounted(s);
    await s.snapshot(CURRENT);
    await s.snapshot({ ...CURRENT, derived_at: { toMillis: () => NOW } });
    expect(s.listPackages).toHaveBeenCalledTimes(1);
    await s.snapshot({ ...CURRENT, interactive_urls: [] });
    expect(s.listPackages).toHaveBeenCalledTimes(2);
  });

  it("keeps only the latest list answer", async () => {
    let release: (rows: PackageRow[]) => void = () => {};
    const first = new Promise<PackageRow[]>((r) => { release = r; });
    let calls = 0;
    const s = services({ list: async () => (++calls === 1 ? first : [row({ title: "Newer", official: true })]) });
    await mounted(s);
    await s.snapshot(CURRENT);
    await s.snapshot({ ...CURRENT, interactive_urls: [] });
    await screen.findByText("Newer");
    await act(async () => release([row({ title: "Stale", official: true })]));
    expect(screen.queryByText("Stale")).toBeNull();
  });

  it("puts Community under its own heading, behind a closed native disclosure that carries the warning", async () => {
    const s = services({ list: async () => [row({ title: "Stranger's", visibility: "public" }), row({ title: "Ours", official: true })] });
    await mounted(s);
    await s.snapshot(CURRENT);
    const heading = await screen.findByRole("heading", { level: 3, name: "Community" });
    const section = heading.closest("section")!;
    const details = section.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(within(section).getByText("Show 1 community package").tagName).toBe("SUMMARY");
    expect(within(details).getByText(/stranger's code with your\s+access to student data/)).toBeDefined();
    expect(within(details).getByText("Stranger's")).toBeDefined();
    expect(screen.getByRole("heading", { level: 3, name: "Official" })).toBeDefined();
  });

  it("says when nothing applies, and when the profile is incomplete", async () => {
    const s = services({ list: async () => [row({ official: true, applies: false })] });
    await mounted(s);
    await s.snapshot({ ...CURRENT, truncated: true });
    expect(await screen.findByText(/no packages apply to this class yet/i)).toBeDefined();
    expect(screen.getByText(/too large to read completely/i)).toBeDefined();
  });

  it("names a catalog it could not reach", async () => {
    const s = services({ list: async () => { throw new TypeError("Failed to fetch"); } });
    await mounted(s);
    await s.snapshot(CURRENT);
    expect(await screen.findByText("The package catalog could not be reached.")).toBeDefined();
  });

  it("shows report-server's message for its 403, not the withdrawn page", async () => {
    const s = services({ list: async () => { throw new ApiError("This origin may not read the catalog with a bearer.", 403); } });
    await mounted(s);
    await s.snapshot(CURRENT);
    expect(await screen.findByText(/may not read the catalog/)).toBeDefined();
    expect(screen.queryByText(/withdrawn/)).toBeNull();
  });

  it("re-authorizes when the list finds the token expired", async () => {
    const s = services({ list: async () => { throw new SessionExpired(false); } });
    const onExpired = await mounted(s);
    await s.snapshot(CURRENT);
    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
  });

  it("takes the list away when the listener fails after it rendered", async () => {
    const s = services();
    await mounted(s);
    await s.snapshot(CURRENT);
    await screen.findByText("Wildfire open responses");
    await s.refuse();
    expect(screen.getByText("This class's profile could not be read.")).toBeDefined();
    expect(screen.queryByText("Wildfire open responses")).toBeNull();
  });
});
