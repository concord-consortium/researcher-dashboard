import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassDashboard } from "../src/pages/ClassDashboard";
import type { Profile } from "../src/shell/packages";
import { ApiError, SessionExpired, type PackageRow, type Portal, type ReportServer, type Resolved, type Scope } from "../src/shell/portal";
import type { Activity } from "../src/shell/activity";
import { formatTime, type Counts, type Result, type Runner } from "../src/shell/runs";
import type { ClassListeners, DashboardServices } from "../src/shell/services";
import pkg from "../package.json";
import { row, SCOPE, stamp } from "./fixtures";

// The page keeps its place in the URL's fragment, which outlives a test.
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

const NOW = 100 * 24 * 3600 * 1000;
const WILDFIRE = row({ title: "Wildfire open responses", official: true, identity: "projects/20/wildfire-responses" });
const KEY = "projects__20__wildfire-responses";
const CURRENT: Profile = {
  assignment_urls: ["https://ap.test/?activity=1"], interactive_urls: ["https://qi.test/open-response/"],
  assignment_fingerprint: SCOPE.assignment_fingerprint, derived_at: stamp(NOW - 1000)
};

function services(over: {
  scope?: () => Promise<Scope>;
  refresh?: () => Promise<unknown>;
  watch?: () => Promise<() => void>;
  list?: (urls: string[]) => Promise<PackageRow[]>;
  run?: (identity: string, version: string) => Promise<unknown>;
  resolve?: (identity: string, version: string) => Promise<Resolved>;
} = {}) {
  let on: ClassListeners | null = null;
  const unsubscribe = vi.fn();
  const refreshProfile = vi.fn(over.refresh ?? (async () => ({ queued: true })));
  const listPackages = vi.fn(over.list ?? (async () => [WILDFIRE]));
  const runPackage = vi.fn(over.run ?? (async () => ({ queue: [], appended: [], vm: "launched" })));
  const resolve = vi.fn(over.resolve ?? (async () => ({ archived: false })));
  const fake: DashboardServices = {
    portal: { scope: over.scope ?? (async () => SCOPE), refreshProfile, runPackage } as unknown as Portal,
    reportServer: { listPackages, resolve } as unknown as ReportServer,
    watchClass: vi.fn(over.watch ?? (async (_scope, listeners) => { on = listeners; return unsubscribe; })),
    now: () => NOW
  };
  return {
    fake, refreshProfile, listPackages, runPackage, resolve, unsubscribe,
    snapshot: (p: Profile | null) => act(() => on!.profile(p)),
    refuse: () => act(() => on!.refused("profile")),
    runner: (r: Runner | null) => act(() => on!.runner(r)),
    counts: (c: Counts | null) => act(() => on!.counts(c)),
    results: (r: Map<string, Result>) => act(() => on!.results(r)),
    refuseRuns: (which: "runner" | "results" = "results") => act(() => on!.refused(which)),
    refuseCounts: () => act(() => on!.refused("counts")),
    activity: (a: Map<string, Activity>) => act(() => on!.activity(a)),
    refuseActivity: () => act(() => on!.refused("activity"))
  };
}

function mount(s: ReturnType<typeof services>, onExpired = vi.fn()) {
  render(<ClassDashboard services={s.fake} onExpired={onExpired} />);
  return onExpired;
}

async function mounted(s: ReturnType<typeof services>, onExpired = vi.fn()) {
  mount(s, onExpired);
  await screen.findByRole("heading", { level: 1, name: SCOPE.name });
  await vi.waitFor(() => expect(s.fake.watchClass).toHaveBeenCalled());
  return onExpired;
}

describe("ClassDashboard", () => {
  it("shows the class, its teachers, cohorts and assignments", async () => {
    await mounted(services());
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("heading", { level: 1, name: SCOPE.name })).toBeDefined();
    expect(within(banner).getByText(/T\. Teacher · Spike cohort/)).toBeDefined();
    expect(within(banner).getByRole("img", { name: "Concord Consortium" })).toBeDefined();
    infoTab();
    expect(screen.getByRole("listitem").textContent).toBe("Wildfire · ActivityPlayer");
  });

  it("names an untitled assignment", async () => {
    mount(services({ scope: async () => ({ ...SCOPE, assignments: [{ ...SCOPE.assignments[0], name: null, tool: null }] }) }));
    fireEvent.click(await screen.findByRole("tab", { name: "Info" }));
    expect((await screen.findByRole("listitem")).textContent).toBe("Untitled");
  });

  it("opens on the Packages tab and moves between tabs with the arrow keys, at their own addresses", async () => {
    await mounted(services());
    const packages = screen.getByRole("tab", { name: "Packages" }), info = screen.getByRole("tab", { name: "Info" });
    expect(packages.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").id).toBe(packages.getAttribute("aria-controls"));
    expect(screen.queryByRole("heading", { name: "Assignments" })).toBeNull();
    packages.focus();
    fireEvent.keyDown(packages, { key: "ArrowRight" });
    expect(info.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(info);
    expect([packages.tabIndex, info.tabIndex]).toEqual([-1, 0]);
    expect(window.location.hash).toBe("#info");
    expect(screen.getByRole("heading", { name: "Assignments" })).toBeDefined();
    fireEvent.keyDown(info, { key: "ArrowRight" });
    expect(packages.getAttribute("aria-selected")).toBe("true");
    expect(window.location.hash).toBe("#packages");
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
    await old.snapshot({ ...CURRENT, derived_at: stamp(0) });
    expect(old.refreshProfile).toHaveBeenCalledTimes(1);
    cleanup();
    const current = services();
    await mounted(current);
    await current.snapshot(CURRENT);
    await current.snapshot({ ...CURRENT, derived_at: stamp(NOW) });
    expect(current.refreshProfile).not.toHaveBeenCalled();
  });

  it("shows the portal's reason when the refresh is refused", async () => {
    const s = services({ refresh: async () => { throw new ApiError("This class has 600 distinct assignment URLs", 422); } });
    await mounted(s);
    await s.snapshot(null);
    expect(await screen.findByText(/600 distinct assignment URLs/)).toBeDefined();
    expect(screen.queryByText(/reading this class's activities/i)).toBeNull();
  });

  it("says the profile could not be read when the listener is refused, and does not take that for a missing profile", async () => {
    const s = services();
    await mounted(s);
    await s.refuse();
    expect(screen.getByText("This class's profile could not be read.")).toBeDefined();
    expect(s.refreshProfile).not.toHaveBeenCalled();
  });

  it("says none of the class's documents could be read when the sign-in fails", async () => {
    await mounted(services({ watch: async () => { throw new Error("auth/network-request-failed"); } }));
    expect(await screen.findByText("This class's profile, your runs and your counts could not be read.")).toBeDefined();
    expect(screen.getByText("Class activity could not be read.")).toBeDefined();
  });

  // jwt/firebase answers the researcher check with a 400 and keeps 403 for a token it will not
  // take at all, so neither is the withdrawn page.
  it("shows the Firebase token call's refusals as its messages", async () => {
    await mounted(services({ watch: async () => {
      throw new ApiError("You do not have access to the requested class_hash as a researcher", 400);
    } }));
    expect(await screen.findByText(/do not have access to the requested class_hash/)).toBeDefined();
    cleanup();
    await mounted(services({ watch: async () => { throw new ApiError("This token may not be used here", 403); } }));
    expect(await screen.findByText("This token may not be used here")).toBeDefined();
    expect(screen.queryByText(/withdrawn/)).toBeNull();
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
    await s.snapshot({ ...CURRENT, derived_at: stamp(NOW) });
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

  it("offers a filter pill for All and each group, with its count, and lists only the pressed one's packages", async () => {
    const s = services({ list: async () => [row({ title: "Stranger's", visibility: "public" }), row({ title: "Ours", official: true }),
      row({ title: "Theirs", official: true }), row({ title: "Project's", visibility: "project", project: { id: 20, name: "Wildfire Research" } })] });
    await mounted(s);
    await s.snapshot(CURRENT);
    await screen.findByText("Ours");
    const pills = within(screen.getByRole("group", { name: "Filter packages" })).getAllByRole("button");
    expect(pills.map((p) => [p.textContent, p.getAttribute("aria-pressed")])).toEqual([
      ["All 4", "true"], ["Official 2", "false"], ["Community 1", "false"], ["Wildfire Research 1", "false"]
    ]);
    fireEvent.click(pills[1]);
    expect(pills[1].getAttribute("aria-pressed")).toBe("true");
    expect([...document.querySelectorAll(".title")].map((e) => e.textContent)).toEqual(["Ours", "Theirs"]);
  });

  it("asks before running a community package, from its card, with Run held until Confirm or Cancel", async () => {
    const stranger = row({ title: "Stranger's", visibility: "public", runnable: true, identity: "users/9/stranger" });
    const s = services({ list: async () => [WILDFIRE, stranger] });
    await listed(s);
    const card = () => screen.getByText("Stranger's", { selector: ".title" }).closest("li")!;
    const run = () => within(card()).getByRole("button", { name: "Run Stranger's" });
    expect(screen.queryByText(/not reviewed by Concord/)).toBeNull();
    run().focus();
    fireEvent.click(run());
    const ask = within(card()).getByRole("group", { name: "Run a community package?" });
    expect(within(ask).getByText(/stranger's code with your access to student data/)).toBeDefined();
    expect(document.activeElement).toBe(within(ask).getByRole("button", { name: "Confirm" }));
    expect(run().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(run());
    expect(s.runPackage).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(within(card()).queryByRole("group", { name: "Run a community package?" })).toBeNull();
    expect(document.activeElement).toBe(run());
    expect(s.runPackage).not.toHaveBeenCalled();
    fireEvent.click(run());
    await act(async () => { fireEvent.click(within(card()).getByRole("button", { name: "Confirm" })); });
    expect(s.runPackage).toHaveBeenCalledWith("users/9/stranger", "1.0.0");
    expect(within(card()).queryByRole("group", { name: "Run a community package?" })).toBeNull();
  });

  it("asks the same way from a community package's subheader, and runs an official package without asking", async () => {
    const stranger = row({ title: "Stranger's", visibility: "public", runnable: true, identity: "users/9/stranger" });
    const s = services({ list: async () => [WILDFIRE, stranger] });
    await listed(s);
    fireEvent.click(screen.getByRole("link", { name: "Stranger's" }));
    const view = document.querySelector(".package-view") as HTMLElement;
    fireEvent.click(within(view).getByRole("button", { name: "Run Stranger's" }));
    await act(async () => { fireEvent.click(within(view).getByRole("button", { name: "Confirm" })); });
    expect(s.runPackage).toHaveBeenCalledTimes(1);
    fireEvent.click(within(view).getByRole("link", { name: "All Packages" }));
    await act(async () => { fireEvent.click(runButton()); });
    expect(s.runPackage).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("group", { name: "Run a community package?" })).toBeNull();
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

  it("says it is reading the class before the first snapshot arrives", async () => {
    await mounted(services());
    expect(screen.getByText(/reading this class's activities/i)).toBeDefined();
  });

  it("announces the packages' status lines politely", async () => {
    await mounted(services());
    const line = screen.getByText(/reading this class's activities/i);
    expect(line.closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
  });

  it("takes the old list away while the list for new URLs is pending, and says so", async () => {
    let calls = 0;
    const s = services({ list: async () => (++calls === 1 ? [row({ title: "Old", official: true })] : new Promise<PackageRow[]>(() => {})) });
    await mounted(s);
    await s.snapshot(CURRENT);
    await screen.findByText("Old");
    await s.snapshot({ ...CURRENT, interactive_urls: [] });
    expect(screen.queryByText("Old")).toBeNull();
    expect(screen.getByText(/listing the packages that apply/i)).toBeDefined();
  });

  it("stops the class's listeners once the page says access was withdrawn", async () => {
    const s = services({ refresh: async () => { throw new ApiError("You do not have access to this class as a researcher", 403); } });
    await mounted(s);
    await s.snapshot(null);
    expect(await screen.findByText(/access to this class has been withdrawn/)).toBeDefined();
    expect(s.unsubscribe).toHaveBeenCalledTimes(1);
    expect(s.fake.watchClass).toHaveBeenCalledTimes(1);
  });

  it("renders the class-gone page when the refresh finds no class", async () => {
    const s = services({ refresh: async () => { throw new ApiError("The class this token was issued for no longer exists", 404); } });
    await mounted(s);
    await s.snapshot(null);
    expect(await screen.findByText("This class no longer exists.")).toBeDefined();
    expect(s.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("reads a refused document as absent, so each row keeps its Run control", async () => {
    const s = services();
    await listed(s);
    await s.runner({ state: "running", microvm_id: "vm-1", updated_at: stamp(1), current_package: { class_hash: SCOPE.class_hash, package_key: KEY } });
    await s.results(new Map([[KEY, wildfire({ status: "running", microvm_id: "vm-1", updated_at: stamp(5) })]]));
    await s.counts({ data: { answers: 9 } });
    expect(runButton().getAttribute("aria-disabled")).toBe("true");
    expect(within(screen.getByRole("banner")).getByText("Running Wildfire open responses.")).toBeDefined();
    expect(countOf("Answers")).toBe("9");
    await s.refuseRuns("results");
    expect(wildfireRow().querySelector(".status-pill")!.textContent).toBe("Not run");
    expect(runButton().getAttribute("aria-disabled")).toBeNull();
    await s.refuseRuns("runner");
    expect(within(screen.getByRole("banner")).queryByText("Running Wildfire open responses.")).toBeNull();
    await s.refuseCounts();
    expect(countOf("Answers")).toBeNull();
  });

  it("shows no result's state once the session is refused, whatever the results say", async () => {
    const queued = row({ title: "Queued package", official: true, identity: "projects/20/queued" });
    const s = services({ list: async () => [WILDFIRE, queued] });
    await listed(s);
    await s.runner({ state: "running", microvm_id: "vm-1", updated_at: stamp(1), queue: [{ class_hash: SCOPE.class_hash, package_key: "projects__20__queued" }] });
    const results = new Map([
      [KEY, wildfire({ status: "running", microvm_id: "vm-1", updated_at: stamp(5) })],
      ["projects__20__queued", wildfire({ package: { identity: queued.identity, version: "1.0.0", checksum: "c" } })]
    ]);
    await s.results(results);
    await s.refuseRuns("runner");
    await s.results(new Map(results));
    for (const title of ["Wildfire open responses", "Queued package"]) {
      const item = screen.getByText(title, { selector: ".title" }).closest("li")!;
      expect(item.querySelector(".status-pill")!.textContent, title).toBe("Not run");
      expect(within(item).getByRole("button", { name: `Run ${title}` }).getAttribute("aria-disabled"), title).toBeNull();
    }
  });

  it("says which of the researcher's documents could not be read, and still lists the packages", async () => {
    const s = services();
    await mounted(s);
    await s.snapshot(CURRENT);
    await s.refuseRuns("runner");
    expect(screen.getByText("Your runs could not be read.").closest("[aria-live]")).not.toBeNull();
    await s.refuseCounts();
    expect(screen.getByText("Your current status could not be read.").closest("[aria-live]")).not.toBeNull();
    expect(await screen.findByText("Wildfire open responses")).toBeDefined();
    cleanup();
    const results = services();
    await mounted(results);
    await results.refuseRuns("results");
    expect(screen.getByText("Your runs could not be read.")).toBeDefined();
    expect(screen.queryByText("Your current status could not be read.")).toBeNull();
  });

  it("says the class activity could not be read when its listener is refused, and reads the rest", async () => {
    const s = services();
    await mounted(s);
    await s.activity(new Map([["301", { lastActivityAt: stamp(NOW) }]]));
    expect(document.querySelector(".active-count")?.getAttribute("title")).toMatch(/^1 student active/);
    await s.refuseActivity();
    expect(screen.getByText("Class activity could not be read.")).toBeDefined();
    expect(document.querySelector(".active-count")).toBeNull();
    expect(screen.queryByText("Your runs could not be read.")).toBeNull();
    await s.snapshot(CURRENT);
    await s.counts({ data: { answers: 12 } });
    await s.results(new Map([[KEY, wildfire({ status: "done", summary: "Twelve answers read." })]]));
    expect(await screen.findByText("Twelve answers read.")).toBeDefined();
    expect(countOf("Answers")).toBe("12");
  });
});

// A deferred answer, so a test can look at the page while a request is in flight.
function deferred<T>() {
  let resolve: (value: T) => void = () => {}, reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const WILDFIRE_PACKAGE = { identity: WILDFIRE.identity, version: "1.0.0", checksum: "c" };

function wildfire(over: Partial<Result> = {}): Result {
  return { status: "queued", package: WILDFIRE_PACKAGE, updated_at: stamp(10), ...over };
}

// The value Current Status gives for `label`, or null when it gives none.
const countOf = (label: string) =>
  [...document.querySelectorAll(".counts dt")].find((dt) => dt.textContent === label)?.nextElementSibling?.textContent ?? null;

const infoTab = () => fireEvent.click(screen.getByRole("tab", { name: "Info" }));

async function listed(s: ReturnType<typeof services>, onExpired = vi.fn()) {
  await mounted(s, onExpired);
  await s.snapshot(CURRENT);
  await screen.findByText("Wildfire open responses");
  return onExpired;
}

const wildfireRow = () => screen.getByText("Wildfire open responses", { selector: ".title" }).closest("li")!;
const wildfireLine = () => wildfireRow().querySelector(".state")!;
const runButton = () => within(wildfireRow()).getByRole("button", { name: /^(Run|Resume) Wildfire open responses$/ });

describe("running a package", () => {
  it("asks the portal to run the row's package at its current version, and says so while it asks", async () => {
    const answer = deferred<unknown>();
    const s = services({ run: () => answer.promise });
    await listed(s);
    runButton().focus();
    fireEvent.click(runButton());
    expect(s.runPackage).toHaveBeenCalledWith("projects/20/wildfire-responses", "1.0.0");
    expect(within(wildfireLine() as HTMLElement).getByText("Requesting…")).toBeDefined();
    expect(runButton().getAttribute("aria-disabled")).toBe("true");
    expect(runButton().hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(runButton());
    fireEvent.click(runButton());
    expect(s.runPackage).toHaveBeenCalledTimes(1);
    await act(async () => answer.resolve({ queue: [], appended: [KEY], vm: "launched" }));
    expect(screen.queryByText("Requesting…")).toBeNull();
  });

  it("reads as plain Queued, without asking for a run, while its own request is launching the runner", async () => {
    const answer = deferred<unknown>();
    const s = services({ run: () => answer.promise });
    await listed(s);
    fireEvent.click(runButton());
    await s.runner({ queue: [{ class_hash: SCOPE.class_hash, package_key: KEY }], updated_at: stamp(10) });
    await s.results(new Map([[KEY, wildfire()]]));
    expect(wildfireLine().querySelector("p")!.textContent).toBe("Queued, number 1 in line.");
    expect(screen.queryByText(/run it to start one/)).toBeNull();
    await act(async () => answer.resolve({}));
    expect(wildfireLine().querySelector("p")!.textContent).toBe("Queued, waiting for a runner: run it to start one.");
  });

  it("does not ask for a run in the header while one is being requested", async () => {
    const answer = deferred<unknown>();
    const s = services({ run: () => answer.promise });
    await listed(s);
    await s.runner({ state: "terminated", queue: [{ class_hash: SCOPE.class_hash, package_key: KEY }] });
    await s.results(new Map([[KEY, wildfire()]]));
    const status = () => document.querySelector(".runner")!.textContent;
    expect(status()).toContain("Queued, waiting for a runner: run it to start one.");
    fireEvent.click(runButton());
    expect(status()).toContain("Your runner has stopped.");
    expect(status()).not.toContain("run it to start one");
    await act(async () => answer.resolve({}));
    expect(status()).toContain("Queued, waiting for a runner: run it to start one.");
  });

  it("shows a refusal on its row until the result changes", async () => {
    const other = row({ title: "Other package", official: true });
    const s = services({
      list: async () => [WILDFIRE, other],
      run: async () => { throw new ApiError("projects/20/wildfire-responses@1.0.0 cannot be run", 409); }
    });
    await listed(s);
    await s.results(new Map([[KEY, wildfire({ status: "done", summary: "Earlier", updated_at: stamp(5) })]]));
    fireEvent.click(runButton());
    const message = await within(wildfireLine() as HTMLElement).findByText("projects/20/wildfire-responses@1.0.0 cannot be run");
    expect(message.className).toBe("error");
    expect(screen.getAllByText(/cannot be run/)).toHaveLength(1);
    await s.results(new Map([[KEY, wildfire({ status: "done", summary: "Earlier", updated_at: stamp(5) })]]));
    expect(screen.getByText(/cannot be run/)).toBeDefined();
    await s.results(new Map([[KEY, wildfire({ updated_at: stamp(6) })]]));
    expect(screen.queryByText(/cannot be run/)).toBeNull();
  });

  it("shows a refusal from the runner's launch that arrives after the package was queued", async () => {
    const answer = deferred<unknown>();
    const s = services({ run: () => answer.promise });
    await listed(s);
    fireEvent.click(runButton());
    await s.results(new Map([[KEY, wildfire({ updated_at: stamp(20) })]]));
    await act(async () => answer.reject(new ApiError("report-service could not start a machine", 502)));
    expect(within(wildfireLine() as HTMLElement).getByText("report-service could not start a machine")).toBeDefined();
    await s.results(new Map([[KEY, wildfire({ updated_at: stamp(21) })]]));
    expect(screen.queryByText("report-service could not start a machine")).toBeNull();
  });

  it("says the portal could not be reached when its refusal carries no message", async () => {
    const s = services({ run: async () => { throw new ApiError(null, 502, "/api/v1/researcher_dashboard/run_package"); } });
    await listed(s);
    fireEvent.click(runButton());
    expect(await within(wildfireLine() as HTMLElement).findByText("The portal could not be reached.")).toBeDefined();
    expect(screen.queryByText(/run_package failed/)).toBeNull();
  });

  it("says the portal could not be reached on the row", async () => {
    const s = services({ run: async () => { throw new TypeError("Failed to fetch"); } });
    await listed(s);
    fireEvent.click(runButton());
    expect(await within(wildfireLine() as HTMLElement).findByText("The portal could not be reached.")).toBeDefined();
  });

  it("re-authorizes on a 401, and renders the withdrawn and class-gone pages", async () => {
    const expired = services({ run: async () => { throw new SessionExpired(false); } });
    const onExpired = await listed(expired);
    fireEvent.click(runButton());
    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
    cleanup();
    const withdrawn = services({ run: async () => { throw new ApiError("You do not have access to this class as a researcher", 403); } });
    await listed(withdrawn);
    fireEvent.click(runButton());
    expect(await screen.findByText(/access to this class has been withdrawn/)).toBeDefined();
    cleanup();
    const gone = services({ run: async () => { throw new ApiError("Not found", 404); } });
    await listed(gone);
    fireEvent.click(runButton());
    expect(await screen.findByText("This class no longer exists.")).toBeDefined();
    expect(screen.queryByText("Wildfire open responses")).toBeNull();
    expect(screen.queryByText("Not found")).toBeNull();
  });

  describe("resuming a paused run", () => {
    afterEach(() => { vi.useRealTimers(); });

    const paused = { state: "suspended", microvm_id: "vm-1", updated_at: stamp(100) };
    const run = (over: Partial<Result> = {}) => wildfire({ status: "running", stage: "run_package", microvm_id: "vm-1", updated_at: stamp(90), ...over });

    it("says it is resuming until the run writes again", async () => {
      const s = services();
      await listed(s);
      await s.runner(paused);
      await s.results(new Map([[KEY, run()]]));
      expect(wildfireLine().querySelector("p")!.textContent).toBe("Paused partway through: resume it to finish.");
      fireEvent.click(runButton());
      await vi.waitFor(() => expect(wildfireLine().querySelector("p")!.textContent).toBe("Resuming: it will continue within a minute or two."));
      expect(s.runPackage).toHaveBeenCalledTimes(1);
      expect(runButton().getAttribute("aria-disabled")).toBe("true");
      await s.results(new Map([[KEY, run({ updated_at: stamp(150) })]]));
      expect(wildfireLine().querySelector("p")!.textContent).toBe("Running Wildfire open responses: running the package.");
      await s.runner({ ...paused, state: "suspending", updated_at: stamp(160) });
      await s.runner({ ...paused, updated_at: stamp(170) });
      expect(wildfireLine().querySelector("p")!.textContent).toBe("Paused partway through: resume it to finish.");
      expect(runButton().getAttribute("aria-disabled")).toBeNull();
    });

    it("offers Resume again after three minutes with no write", async () => {
      const s = services();
      await listed(s);
      vi.useFakeTimers();
      await s.runner(paused);
      await s.results(new Map([[KEY, run()]]));
      fireEvent.click(runButton());
      await act(async () => { await Promise.resolve(); });
      expect(wildfireLine().querySelector("p")!.textContent).toBe("Resuming: it will continue within a minute or two.");
      await act(async () => { vi.advanceTimersByTime(3 * 60_000 - 1); });
      expect(wildfireLine().querySelector("p")!.textContent).toBe("Resuming: it will continue within a minute or two.");
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(wildfireLine().querySelector("p")!.textContent).toBe("Paused partway through: resume it to finish.");
      expect(runButton().getAttribute("aria-disabled")).toBeNull();
    });

    it("leaves no timer behind when the page goes during a resume", async () => {
      const s = services();
      await listed(s);
      vi.useFakeTimers();
      await s.runner(paused);
      await s.results(new Map([[KEY, run()]]));
      fireEvent.click(runButton());
      await act(async () => { await Promise.resolve(); });
      expect(vi.getTimerCount()).toBe(1);
      cleanup();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("starts no timer for a Resume answered after the page went", async () => {
      const answer = deferred<unknown>();
      const s = services({ run: () => answer.promise });
      await listed(s);
      vi.useFakeTimers();
      await s.runner(paused);
      await s.results(new Map([[KEY, run()]]));
      fireEvent.click(runButton());
      cleanup();
      await act(async () => { answer.resolve({ queue: [], appended: [], vm: "resumed" }); await Promise.resolve(); });
      expect(s.runPackage).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("keeps a run the paused runner resumed running when another request moves the session document", async () => {
      const s = services();
      await listed(s);
      await s.runner(paused);
      await s.results(new Map([[KEY, run({ updated_at: stamp(150) })]]));
      await s.runner({ ...paused, updated_at: stamp(200) });
      expect(wildfireLine().querySelector("p")!.textContent).toBe("Running Wildfire open responses: running the package.");
    });
  });
});

describe("what the page says of the researcher's own runs", () => {
  it("marks the runner's line as an error, in the header, only while the runner has failed", async () => {
    const s = services();
    await listed(s);
    const badge = () => within(screen.getByRole("banner")).getByText(/^Your runner /).closest(".badge")!;
    await s.runner({ state: "failed", error: "no capacity" });
    expect(badge().classList.contains("error")).toBe(true);
    await s.runner({ state: "suspended" });
    expect(badge().classList.contains("error")).toBe(false);
  });

  it("says what the researcher's runner is doing", async () => {
    const s = services();
    await listed(s);
    await s.runner({ state: "running", current_package: { class_hash: SCOPE.class_hash, package_key: KEY } });
    const line = within(screen.getByRole("banner")).getByText("Running Wildfire open responses.");
    expect(line.closest("[aria-live]")).not.toBeNull();
    expect(screen.getByRole("banner").contains(line)).toBe(true);
  });

  it("shows the researcher's counts, and says when there are none", async () => {
    const s = services();
    await mounted(s);
    infoTab();
    expect(screen.getByRole("heading", { level: 2, name: "Current Status" })).toBeDefined();
    expect(countOf("Answers")).toBeNull();
    await s.counts({ data: { answers: 9, logs: 18195, last_pull_at: stamp(1000), log_freshness_at: stamp(2000) } });
    expect(screen.getByRole("heading", { level: 2, name: "Current Status" })).toBeDefined();
    expect(countOf("Logs")).toBe((18195).toLocaleString());
    expect(countOf("Logs current to")).toBe(formatTime(2000));
    await s.counts({ data: { answers: 9, last_pull_at: stamp(1000) } });
    expect(countOf("Answers")).toBe("9");
    expect(countOf("Logs")).toBe("not reported");
    expect(countOf("Your last run")).toBe(formatTime(1000));
    expect(countOf("Logs current to")).toBeNull();
    await s.counts(null);
    expect(within(screen.getByRole("heading", { name: "Current Status" }).closest("section")!).getByText("No runs yet.")).toBeDefined();
  });

  it("repeats the header's runner line and active count in Current Status, out of any live region", async () => {
    const s = services();
    await mounted(s);
    infoTab();
    expect(countOf("Runner")).toBeNull();
    await s.runner({ state: "suspended", queue: [{ class_hash: SCOPE.class_hash, package_key: KEY }] });
    await s.activity(new Map([["301", { lastActivityAt: stamp(NOW) }], ["302", { lastActivityAt: stamp(NOW - 3600_000) }]]));
    expect(countOf("Runner")).toBe("Your runner is paused. Queued packages will start within a couple of minutes.");
    expect(countOf("Active students")).toBe("1 (last 5 minutes)");
    expect(document.querySelector(".counts")!.closest("[aria-live]")).toBeNull();
  });

  it("says the results and counts are the researcher's own, in the header's About dialog", async () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
    HTMLDialogElement.prototype.showModal = showModal;
    await mounted(services());
    const dialog = document.querySelector("dialog.about") as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    fireEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "About this page" }));
    expect(within(dialog).getByRole("heading", { level: 2 }).textContent).toBe(`Researcher Dashboard v${pkg.version}`);
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
    expect(within(dialog).getByText(/^Your runs are your own\./).closest("p")!.textContent).toMatch(/Another researcher of this class sees only their own runs\.$/);
    expect(within(dialog).getByText(/^Class activity is shared\./).closest("p")!.textContent).toMatch(/the same for every\s+researcher of this class\.$/);
  });
});

describe("opening a package", () => {
  const SECOND = row({ title: "Second package", official: true, identity: "projects/20/second" });
  const SECOND_KEY = "projects__20__second";
  const done = (identity: string, summary: string, finishedAt: number, over: Partial<Result> = {}): Result => ({
    status: "done", package: { identity, version: "1.0.0", checksum: "c" }, summary, display: `# ${summary}`,
    finished_at: stamp(finishedAt), updated_at: stamp(finishedAt), ...over
  });
  const link = (name: string) => screen.getByRole("link", { name });
  const view = () => document.querySelector(".package-view") as HTMLElement;
  const result = () => view().querySelector(".result-view") as HTMLElement;
  const title = (name: string) => within(view()).getByRole("heading", { level: 2, name });
  const allPackages = () => fireEvent.click(within(view()).getByRole("link", { name: "All Packages" }));
  const unlistedRow = (identity: string) => screen.getByText(identity, { selector: ".identity" }).closest("li")!;

  it("says the opened result includes every save before the start of the run it shows, through a re-run", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, done(WILDFIRE.identity, "Earlier", 1000, { started_at: stamp(900) })]]));
    fireEvent.click(link("Wildfire open responses"));
    const line = `Includes every save before ${formatTime(900)}, when this run began reading the class's data.`;
    const when = () => view().querySelector(".result-when")!;
    expect(when().getAttribute("title")).toBe(line);
    expect(when().textContent).toBe(`Version 1.0.0 · Finished ${formatTime(1000)} ${line}`);
    const previous = { package: WILDFIRE_PACKAGE, summary: "Earlier", started_at: stamp(900), finished_at: stamp(1000) };
    await s.results(new Map([[KEY, wildfire({ status: "running", started_at: stamp(5000), updated_at: stamp(5000), previous })]]));
    expect(when().getAttribute("title")).toBe(line);
  });

  it("opens a package with its title focused at its own address, its result shown, and the list gone", async () => {
    const s = services({ list: async () => [WILDFIRE, SECOND] });
    await listed(s);
    await s.results(new Map([
      [KEY, done(WILDFIRE.identity, "6 open responses from 3 learners.", 1000)],
      [SECOND_KEY, done(SECOND.identity, "Second summary", 2000)]
    ]));
    fireEvent.click(link("Second package"));
    expect(document.activeElement).toBe(title("Second package"));
    expect(window.location.hash).toBe(`#packages/${SECOND_KEY}`);
    expect(within(result()).getByRole("heading", { level: 3, name: "Second summary" })).toBeDefined();
    expect(within(view()).getByText("Second summary", { selector: ".state p" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "All Packages" })).toBeNull();
    expect(screen.queryByText("Wildfire open responses")).toBeNull();
  });

  it("goes back to All Packages, from its link or the browser's Back, with focus on the package's link", async () => {
    const s = services({ list: async () => [WILDFIRE, SECOND] });
    await listed(s);
    fireEvent.click(link("Second package"));
    allPackages();
    expect(window.location.hash).toBe("#packages");
    expect(document.activeElement).toBe(link("Second package"));
    fireEvent.click(link("Wildfire open responses"));
    window.history.replaceState(null, "", "#packages");
    await act(async () => { window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(view()).toBeNull();
    expect(document.activeElement).toBe(link("Wildfire open responses"));
  });

  it("opens the package the address names once the list has loaded, and the list for one it does not know", async () => {
    window.history.replaceState(null, "", `#packages/${KEY}`);
    const s = services();
    await listed(s);
    expect(title("Wildfire open responses")).toBeDefined();
    cleanup();
    window.history.replaceState(null, "", "#packages/projects__20__nowhere");
    await listed(services());
    expect(view()).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "All Packages" })).toBeDefined();
  });

  it("runs a package from its subheader, and says it has no result until one lands", async () => {
    const s = services();
    await listed(s);
    fireEvent.click(link("Wildfire open responses"));
    expect(within(view()).getByText("Not run.")).toBeDefined();
    expect(within(view()).getByText("No result yet.")).toBeDefined();
    await act(async () => { fireEvent.click(within(view()).getByRole("button", { name: "Run Wildfire open responses" })); });
    expect(s.runPackage).toHaveBeenCalledWith(WILDFIRE.identity, WILDFIRE.current_version.version);
    await s.results(new Map([[KEY, done(WILDFIRE.identity, "First summary", 1000)]]));
    expect(within(result()).getByRole("heading", { level: 3, name: "First summary" })).toBeDefined();
  });

  it("puts Copy and Download after Run for a result with markdown, and neither for one without", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, done(WILDFIRE.identity, "Summary", 1000)]]));
    fireEvent.click(link("Wildfire open responses"));
    const controls = view().querySelector(".package-bar .controls")!;
    expect([...controls.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Run", "Copy", "Download"]);
    await s.results(new Map([[KEY, done(WILDFIRE.identity, "Summary", 2000, { display: null })]]));
    expect(within(view()).queryByRole("button", { name: "Copy" })).toBeNull();
    expect(within(view()).queryByRole("button", { name: "Download" })).toBeNull();
  });

  it("stays open on the same result through a re-run, and shows the new one in place when it lands", async () => {
    const s = services();
    await listed(s);
    const first = done(WILDFIRE.identity, "Earlier summary", 1000);
    await s.results(new Map([[KEY, first]]));
    fireEvent.click(link("Wildfire open responses"));
    const heading = document.activeElement;
    const previous = { package: first.package, summary: first.summary, display: first.display, finished_at: first.finished_at };
    for (const over of [{ status: "queued" }, { status: "running", stage: "run_package" }, { status: "failed", error: "boom" }] as const) {
      await s.results(new Map([[KEY, wildfire({ ...over, previous, updated_at: stamp(1100) })]]));
      expect(within(result()).getByRole("heading", { level: 3, name: "Earlier summary" })).toBeDefined();
      expect(document.activeElement).toBe(heading);
      expect(within(result()).getByRole("status").textContent).toBe("");
    }
    await s.results(new Map([[KEY, done(WILDFIRE.identity, "Newer summary", 3000, { previous })]]));
    expect(within(result()).getByRole("heading", { level: 3, name: "Newer summary" })).toBeDefined();
    expect(within(result()).getByRole("status").textContent).toBe(`Updated ${formatTime(3000)}`);
    expect(document.activeElement).toBe(heading);
  });

  it("stays open, focus unmoved, when the session and results listeners are refused", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, done(WILDFIRE.identity, "Earlier summary", 1000)]]));
    fireEvent.click(link("Wildfire open responses"));
    const heading = document.activeElement;
    await s.refuseRuns("runner");
    await s.refuseRuns("results");
    expect(within(result()).getByRole("heading", { level: 3, name: "Earlier summary" })).toBeDefined();
    expect(document.activeElement).toBe(heading);
  });

  it("names the package's own group in the breadcrumb, whose link filters the list to it, and All Packages clears the filter", async () => {
    const s = services({ list: async () => [WILDFIRE, SECOND, row({ title: "My own", mine: true })] });
    await listed(s);
    const crumbs = () => [...view().querySelectorAll(".breadcrumb a, .breadcrumb h2")].map((e) => e.textContent);
    const titles = () => [...document.querySelectorAll(".title")].map((e) => e.textContent);
    fireEvent.click(link("My own"));
    expect(crumbs()).toEqual(["All Packages", "Mine", "My own"]);
    fireEvent.click(within(view()).getByRole("link", { name: "Mine" }));
    expect(titles()).toEqual(["My own"]);
    expect(within(screen.getByRole("group", { name: "Filter packages" })).getByRole("button", { name: /^Mine/ }).getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(link("My own"));
    fireEvent.click(link("My own"));
    allPackages();
    expect(titles()).toEqual(["Second package", "Wildfire open responses", "My own"]);
    expect(document.activeElement).toBe(link("My own"));
    fireEvent.click(link("Second package"));
    expect(crumbs()).toEqual(["All Packages", "Official", "Second package"]);
  });

  it("stays open, saying there is no result, when no finished result is left", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, done(WILDFIRE.identity, "Earlier summary", 1000)]]));
    fireEvent.click(link("Wildfire open responses"));
    await s.results(new Map([[KEY, wildfire()]]));
    expect(result()).toBeNull();
    expect(within(view()).getByText("No result yet.")).toBeDefined();
    expect(title("Wildfire open responses")).toBeDefined();
  });

  it("lists results of packages the list returned but the page does not show, with the list's reason", async () => {
    const gone = row({ title: "Gone", official: true, applies: false, identity: "projects/20/gone" });
    const elsewhere = row({ title: "Elsewhere", visibility: "project", project: { id: 99, name: "Other" }, identity: "projects/99/elsewhere" });
    const s = services({ list: async () => [WILDFIRE, gone, elsewhere] });
    await listed(s);
    await s.results(new Map([
      ["projects__20__gone", done(gone.identity, "Gone summary", 1000)],
      ["projects__99__elsewhere", done(elsewhere.identity, "Elsewhere summary", 1000)]
    ]));
    const section = screen.getByRole("region", { name: "Packages no longer listed" });
    expect(within(unlistedRow(gone.identity)).getByText("This package no longer applies to this class.")).toBeDefined();
    expect(within(unlistedRow(elsewhere.identity)).getByText("This package is not offered in any of this class's groups.")).toBeDefined();
    expect(within(section).getAllByRole("listitem")).toHaveLength(2);
    expect(s.resolve).not.toHaveBeenCalled();
  });

  it("asks about packages the list did not return, once each, and notes the archived and the gone", async () => {
    const s = services({
      resolve: async (identity) => {
        if (identity === "projects/20/archived") return { archived: true };
        throw new ApiError("Not found", 404);
      }
    });
    await listed(s);
    const unlisted = new Map([
      ["projects__20__archived", done("projects/20/archived", "Archived summary", 1000)],
      ["users__7__hidden", done("users/7/hidden", "Hidden summary", 1000)]
    ]);
    await s.results(unlisted);
    await s.results(new Map(unlisted));
    expect(await within(unlistedRow("projects/20/archived")).findByText("This package has been archived.")).toBeDefined();
    expect(await within(unlistedRow("users/7/hidden")).findByText("This package is no longer available to you.")).toBeDefined();
    expect(s.resolve).toHaveBeenCalledTimes(2);
    expect(s.resolve).toHaveBeenCalledWith("projects/20/archived", "1.0.0");
  });

  it("notes nothing for any other answer, and re-authorizes on an expired token", async () => {
    const s = services({ resolve: async () => { throw new ApiError("Server error", 500); } });
    await listed(s);
    await s.results(new Map([["users__7__hidden", done("users/7/hidden", "Hidden summary", 1000)]]));
    await vi.waitFor(() => expect(s.resolve).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(unlistedRow("users/7/hidden").querySelector(".notice")).toBeNull();
    cleanup();
    const expired = services({ resolve: async () => { throw new SessionExpired(false); } });
    const onExpired = await listed(expired);
    await expired.results(new Map([["users__7__hidden", done("users/7/hidden", "Hidden summary", 1000)]]));
    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
  });

  it("opens an unlisted result with its note and no Run, and the way back lands on its link", async () => {
    const s = services({ resolve: async () => { throw new ApiError("Not found", 404); } });
    await listed(s);
    await s.results(new Map([["users__7__hidden", done("users/7/hidden", "Hidden summary", 1000)]]));
    await within(unlistedRow("users/7/hidden")).findByText("This package is no longer available to you.");
    fireEvent.click(link("users/7/hidden"));
    expect(document.activeElement).toBe(title("users/7/hidden"));
    expect(within(view()).getByText("This package is no longer available to you.")).toBeDefined();
    expect(within(view()).queryByRole("button", { name: /^(Run|Resume) / })).toBeNull();
    allPackages();
    expect(document.activeElement).toBe(link("users/7/hidden"));
  });

  it("offers no Run on an unlisted result, and words a waiting one without asking for a run", async () => {
    const s = services({ resolve: async () => ({ archived: false }) });
    await listed(s);
    await s.runner({ state: "terminated" });
    await s.results(new Map([["users__7__hidden", wildfire({ package: { identity: "users/7/hidden", version: "1.0.0", checksum: "c" } })]]));
    const section = screen.getByRole("region", { name: "Packages no longer listed" });
    expect(within(section).getByText("Queued, waiting for a runner.")).toBeDefined();
    expect(within(section).queryByRole("button", { name: /^(Run|Resume) / })).toBeNull();
  });

  it("does not announce an unlisted package's re-run until it finishes", async () => {
    const s = services();
    await listed(s);
    const pkg = { identity: "users/7/hidden", version: "1.0.0", checksum: "c" };
    await s.results(new Map([["users__7__hidden", wildfire({
      package: pkg, status: "running", previous: { package: pkg, summary: "Hidden summary", finished_at: stamp(500) }
    })]]));
    expect(within(unlistedRow("users/7/hidden")).getByText(/^Updating: running/).closest("[aria-live]")).toBeNull();
    await s.results(new Map([["users__7__hidden", done("users/7/hidden", "Newer hidden summary", 2000)]]));
    expect(within(unlistedRow("users/7/hidden")).getByText("Newer hidden summary").closest("[aria-live]")).not.toBeNull();
  });

  it("places no result there while the list is pending or after it failed", async () => {
    const pending = services({ list: () => new Promise<PackageRow[]>(() => {}) });
    await mounted(pending);
    await pending.snapshot(CURRENT);
    await pending.results(new Map([[KEY, done(WILDFIRE.identity, "Summary", 1000)]]));
    expect(screen.queryByText("Packages no longer listed")).toBeNull();
    cleanup();
    const failed = services({ list: async () => { throw new TypeError("Failed to fetch"); } });
    await mounted(failed);
    await failed.snapshot(CURRENT);
    await screen.findByText("The package catalog could not be reached.");
    await failed.results(new Map([[KEY, done(WILDFIRE.identity, "Summary", 1000)]]));
    expect(screen.queryByText("Packages no longer listed")).toBeNull();
    expect(failed.resolve).not.toHaveBeenCalled();
  });
});

describe("the automatic re-run", () => {
  const learner = (at: number) => new Map([["301", { lastActivityAt: stamp(at) }]]);
  const doneAt = (started: number, over: Partial<Result> = {}) =>
    wildfire({ status: "done", summary: "Earlier", started_at: stamp(started), updated_at: stamp(started + 100), ...over });
  const OUT_OF_DATE = "Students have saved work since this result.";

  it("requests a behind result once, at once, with the row's identity and version", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    expect(s.runPackage).not.toHaveBeenCalled();
    await s.activity(learner(2000));
    await vi.waitFor(() => expect(s.runPackage).toHaveBeenCalledTimes(1));
    expect(s.runPackage).toHaveBeenCalledWith(WILDFIRE.identity, WILDFIRE.current_version.version);
    await s.activity(learner(3000));
    expect(s.runPackage).toHaveBeenCalledTimes(1);
  });

  it("requests nothing more once the re-run's result has no save after its start", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.activity(learner(2000));
    await vi.waitFor(() => expect(s.runPackage).toHaveBeenCalledTimes(1));
    await s.results(new Map([[KEY, wildfire({ updated_at: stamp(30_000) })]]));
    await s.results(new Map([[KEY, wildfire({ status: "running", started_at: stamp(40_000), updated_at: stamp(40_000) })]]));
    await s.results(new Map([[KEY, doneAt(40_000)]]));
    expect(s.runPackage).toHaveBeenCalledTimes(1);
  });

  it("runs once more after a re-run during which a learner saved", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.activity(learner(2000));
    await vi.waitFor(() => expect(s.runPackage).toHaveBeenCalledTimes(1));
    await s.results(new Map([[KEY, wildfire({ status: "running", started_at: stamp(40_000), updated_at: stamp(40_000) })]]));
    await s.activity(learner(45_000));
    expect(s.runPackage).toHaveBeenCalledTimes(1);
    await s.results(new Map([[KEY, doneAt(40_000)]]));
    await vi.waitFor(() => expect(s.runPackage).toHaveBeenCalledTimes(2));
  });

  it("requests nothing for activity at the result's start", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.activity(learner(1000));
    expect(s.runPackage).not.toHaveBeenCalled();
  });

  it("requests at once on load for a result already behind", async () => {
    const s = services();
    await mounted(s);
    await s.activity(learner(2000));
    await s.results(new Map([[KEY, doneAt(1000)]]));
    expect(s.runPackage).not.toHaveBeenCalled();
    await s.snapshot(CURRENT);
    await screen.findByText("Wildfire open responses");
    await vi.waitFor(() => expect(s.runPackage).toHaveBeenCalledTimes(1));
  });

  it("does not re-run a failed result, and says it is out of date", async () => {
    const s = services();
    await listed(s);
    const previous = { package: WILDFIRE_PACKAGE, summary: "Earlier", started_at: stamp(1000), finished_at: stamp(1500) };
    await s.results(new Map([[KEY, wildfire({ status: "failed", error: "It broke.", started_at: stamp(3000), previous })]]));
    await s.activity(learner(2000));
    expect(s.runPackage).not.toHaveBeenCalled();
    expect(within(wildfireRow()).getByText(OUT_OF_DATE)).toBeDefined();
  });

  it("stops on an expired sign-in without signing in again, and says so", async () => {
    const s = services({ run: async () => { throw new SessionExpired(false); } });
    const onExpired = await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.activity(learner(2000));
    expect(await screen.findByText(/Automatic re-runs have stopped/)).toBeDefined();
    expect(onExpired).not.toHaveBeenCalled();
    expect(within(wildfireRow()).getByText(OUT_OF_DATE)).toBeDefined();
    await s.results(new Map([[KEY, doneAt(1000, { updated_at: stamp(9000) })]]));
    await s.activity(learner(5000));
    expect(s.runPackage).toHaveBeenCalledTimes(1);
  });

  it("sends one request when Run is pressed while the automatic one is in flight", async () => {
    const answer = deferred<unknown>();
    const s = services({ run: () => answer.promise });
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.activity(learner(2000));
    await vi.waitFor(() => expect(s.runPackage).toHaveBeenCalledTimes(1));
    fireEvent.click(runButton());
    expect(s.runPackage).toHaveBeenCalledTimes(1);
  });

  it("shows Requesting, outside the row's live region, and no out-of-date line while the request is in flight", async () => {
    const answer = deferred<unknown>();
    const s = services({ run: () => answer.promise });
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.activity(learner(2000));
    const requesting = await within(wildfireRow()).findByText("Requesting…");
    expect(requesting.closest("[aria-live]")).toBeNull();
    expect(within(wildfireRow()).queryByText(OUT_OF_DATE)).toBeNull();
  });

  it("keeps the row quiet between the accepted request and the queued result", async () => {
    const answer = deferred<unknown>();
    const s = services({ run: () => answer.promise });
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.activity(learner(2000));
    await within(wildfireRow()).findByText("Requesting…");
    await act(async () => answer.resolve({ queue: [], appended: [], vm: "launched" }));
    expect(within(wildfireRow()).queryByText("Requesting…")).toBeNull();
    expect(within(wildfireRow()).queryByText(OUT_OF_DATE)).toBeNull();
    expect(within(wildfireRow()).getByText("Earlier").closest("[aria-live]")).toBeNull();
    await s.results(new Map([[KEY, doneAt(40_000)]]));
    expect(within(wildfireRow()).getByText("Earlier").closest("[aria-live]")).not.toBeNull();
  });

  it("still re-runs and announces the outcome when the re-run finishes before its request is answered", async () => {
    const answer = deferred<unknown>();
    const s = services({ run: () => answer.promise });
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.activity(learner(2000));
    await vi.waitFor(() => expect(s.runPackage).toHaveBeenCalledTimes(1));
    await s.results(new Map([[KEY, wildfire({ status: "running", started_at: stamp(30_000), updated_at: stamp(30_000) })]]));
    await s.results(new Map([[KEY, doneAt(30_000, { summary: "Newer" })]]));
    await act(async () => answer.resolve({ queue: [], appended: [], vm: "launched" }));
    expect(within(wildfireRow()).getByText("Newer").closest("[aria-live]")).not.toBeNull();
    await s.activity(learner(40_000));
    await vi.waitFor(() => expect(s.runPackage).toHaveBeenCalledTimes(2));
  });

  it("ends an accepted Run's hold after three minutes with no new result, and does not request again", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    vi.useFakeTimers();
    try {
      await s.activity(learner(2000));
      await act(async () => { await Promise.resolve(); });
      expect(s.runPackage).toHaveBeenCalledTimes(1);
      await act(async () => { vi.advanceTimersByTime(3 * 60_000 - 1); });
      expect(within(wildfireRow()).queryByText(OUT_OF_DATE)).toBeNull();
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(within(wildfireRow()).getByText(OUT_OF_DATE)).toBeDefined();
      expect(within(wildfireRow()).getByText("Earlier").closest("[aria-live]")).not.toBeNull();
      await s.activity(learner(3000));
      expect(s.runPackage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says a sign-in that could not be renewed needs a new launch, and a Run then shows the expired page", async () => {
    let calls = 0;
    const s = services({ run: async () => { calls += 1; throw new SessionExpired(true); } });
    const onExpired = await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.activity(learner(2000));
    expect(await screen.findByText(/sign-in could not be renewed\. Launch the dashboard again from the portal\./)).toBeDefined();
    expect(screen.queryByText(/Run any package to sign in again/)).toBeNull();
    fireEvent.click(runButton());
    expect(await screen.findByText(/Launch the dashboard again from the portal/, { selector: "main p" })).toBeDefined();
    expect(calls).toBe(2);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("starts automatic re-runs again when a pressed Run succeeds after they stopped", async () => {
    let refuse = true;
    const s = services({ run: async () => {
      if (refuse) { refuse = false; throw new SessionExpired(false); }
      return { queue: [], appended: [], vm: "launched" };
    } });
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.activity(learner(2000));
    expect(await screen.findByText(/Automatic re-runs have stopped/)).toBeDefined();
    fireEvent.click(runButton());
    await vi.waitFor(() => expect(screen.queryByText(/Automatic re-runs have stopped/)).toBeNull());
    expect(screen.getByText("Your finished packages re-run on their own as soon as students save new work.")).toBeDefined();
    await s.results(new Map([[KEY, doneAt(4000)]]));
    await s.activity(learner(5000));
    await vi.waitFor(() => expect(s.runPackage).toHaveBeenCalledTimes(3));
  });

  it("asks again for a package whose automatic request met the expired sign-in once a pressed Run succeeds", async () => {
    const other = row({ title: "Other package", official: true, identity: "projects/20/other" });
    const otherPackage = { identity: other.identity, version: "1.0.0", checksum: "c" };
    let refusals = 2;
    const s = services({
      list: async () => [WILDFIRE, other],
      run: async () => {
        if (refusals > 0) { refusals -= 1; throw new SessionExpired(false); }
        return { queue: [], appended: [], vm: "launched" };
      }
    });
    await listed(s);
    await s.results(new Map([
      [KEY, doneAt(1000)],
      ["projects__20__other", { ...doneAt(1000), package: otherPackage }]
    ]));
    await s.activity(learner(2000));
    expect(await screen.findByText(/Automatic re-runs have stopped/)).toBeDefined();
    expect(s.runPackage).toHaveBeenCalledTimes(2);
    const otherRow = screen.getByText("Other package", { selector: ".title" }).closest("li")!;
    fireEvent.click(within(otherRow).getByRole("button", { name: "Run Other package" }));
    await vi.waitFor(() => expect(s.runPackage).toHaveBeenCalledTimes(4));
    expect(s.runPackage.mock.calls.slice(2).map((c) => c[0]).sort()).toEqual([other.identity, WILDFIRE.identity].sort());
  });

  it("sends nothing once access is withdrawn, even when the package list answers after", async () => {
    const list = deferred<PackageRow[]>();
    const s = services({
      list: () => list.promise,
      refresh: async () => { throw new ApiError("You do not have access to this class as a researcher", 403); }
    });
    await mounted(s);
    await s.activity(learner(2000));
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.snapshot({ ...CURRENT, derived_at: stamp(NOW - 2 * 24 * 3600 * 1000) });
    expect(await screen.findByText(/access to this class has been withdrawn/)).toBeDefined();
    await act(async () => list.resolve([WILDFIRE]));
    expect(s.runPackage).not.toHaveBeenCalled();
  });

  it("shows a refusal and retries only once the result changes", async () => {
    const s = services({ run: async () => { throw new ApiError("projects/20/wildfire-responses@1.0.0 cannot be run", 409); } });
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.activity(learner(2000));
    expect(await within(wildfireRow()).findByText(/cannot be run/)).toBeDefined();
    await s.activity(learner(3000));
    await s.results(new Map([[KEY, doneAt(1000)]]));
    expect(s.runPackage).toHaveBeenCalledTimes(1);
    await s.results(new Map([[KEY, doneAt(1000, { updated_at: stamp(7000) })]]));
    await vi.waitFor(() => expect(s.runPackage).toHaveBeenCalledTimes(2));
  });

  it("requests nothing when the activity listener is refused before any snapshot", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, doneAt(1000)]]));
    await s.refuseActivity();
    expect(screen.getByText("Class activity could not be read.")).toBeDefined();
    expect(s.runPackage).not.toHaveBeenCalled();
  });

  it("does not announce the line naming the package a re-run is running, and does for a first run", async () => {
    const s = services();
    await listed(s);
    const runner: Runner = { state: "running", current_package: { class_hash: SCOPE.class_hash, package_key: KEY } };
    await s.runner(runner);
    await s.results(new Map([[KEY, wildfire({ status: "running", previous: { package: WILDFIRE_PACKAGE, summary: "Earlier" } })]]));
    expect(within(screen.getByRole("banner")).getByText("Running Wildfire open responses.").closest("[aria-live]")).toBeNull();
    await s.results(new Map([[KEY, wildfire({ status: "running" })]]));
    expect(within(screen.getByRole("banner")).getByText("Running Wildfire open responses.").closest("[aria-live]")).not.toBeNull();
  });
});
