import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassDashboard } from "../src/pages/ClassDashboard";
import type { Profile } from "../src/shell/packages";
import { ApiError, SessionExpired, type PackageRow, type Portal, type ReportServer, type Resolved, type Scope } from "../src/shell/portal";
import { formatTime, type Counts, type Result, type Runner } from "../src/shell/runs";
import type { ClassListeners, DashboardServices } from "../src/shell/services";
import { row, SCOPE, stamp } from "./fixtures";

afterEach(cleanup);

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
    refuseCounts: () => act(() => on!.refused("counts"))
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

  it("says the profile could not be read when the sign-in fails", async () => {
    await mounted(services({ watch: async () => { throw new Error("auth/network-request-failed"); } }));
    expect(await screen.findByText("This class's profile could not be read.")).toBeDefined();
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

  it("reads a refused document as absent, so each row keeps its Run control", async () => {
    const s = services();
    await listed(s);
    await s.runner({ state: "running", microvm_id: "vm-1", updated_at: stamp(1), current_package: { class_hash: SCOPE.class_hash, package_key: KEY } });
    await s.results(new Map([[KEY, wildfire({ status: "running", microvm_id: "vm-1", updated_at: stamp(5) })]]));
    await s.counts({ data: { answers: 9 } });
    expect(runButton().getAttribute("aria-disabled")).toBe("true");
    await s.refuseRuns("results");
    expect(wildfireLine().querySelector("p")!.textContent).toBe("Not run.");
    expect(runButton().getAttribute("aria-disabled")).toBeNull();
    await s.refuseRuns("runner");
    expect(screen.queryByText("Running Wildfire open responses.")).toBeNull();
    await s.refuseCounts();
    expect(screen.queryByText("Answers 9")).toBeNull();
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
      expect(item.querySelector(".state p")!.textContent, title).toBe("Not run.");
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
    expect(screen.getByText("Your counts could not be read.").closest("[aria-live]")).not.toBeNull();
    expect(await screen.findByText("Wildfire open responses")).toBeDefined();
    cleanup();
    const results = services();
    await mounted(results);
    await results.refuseRuns("results");
    expect(screen.getByText("Your runs could not be read.")).toBeDefined();
    expect(screen.queryByText("Your counts could not be read.")).toBeNull();
  });
});

// A deferred answer, so a test can look at the page while a request is in flight.
function deferred<T>() {
  let resolve: (value: T) => void = () => {}, reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function wildfire(over: Partial<Result> = {}): Result {
  return { status: "queued", package: { identity: WILDFIRE.identity, version: "1.0.0", checksum: "c" }, updated_at: stamp(10), ...over };
}

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

  it("reads as plain Queued, without asking for a run, while its own request is launching the machine", async () => {
    const answer = deferred<unknown>();
    const s = services({ run: () => answer.promise });
    await listed(s);
    fireEvent.click(runButton());
    await s.runner({ queue: [{ class_hash: SCOPE.class_hash, package_key: KEY }], updated_at: stamp(10) });
    await s.results(new Map([[KEY, wildfire()]]));
    expect(wildfireLine().querySelector("p")!.textContent).toBe("Queued, number 1 in line.");
    expect(screen.queryByText(/run it to start one/)).toBeNull();
    await act(async () => answer.resolve({}));
    expect(wildfireLine().querySelector("p")!.textContent).toBe("Queued, waiting for a machine: run it to start one.");
  });

  it("does not ask for a run above the list while one is being requested", async () => {
    const answer = deferred<unknown>();
    const s = services({ run: () => answer.promise });
    await listed(s);
    await s.runner({ state: "terminated", queue: [{ class_hash: SCOPE.class_hash, package_key: KEY }] });
    await s.results(new Map([[KEY, wildfire()]]));
    const status = () => document.querySelector(".status")!.textContent;
    expect(status()).toContain("Queued, waiting for a machine: run it to start one.");
    fireEvent.click(runButton());
    expect(status()).toContain("Your machine has stopped.");
    expect(status()).not.toContain("run it to start one");
    await act(async () => answer.resolve({}));
    expect(status()).toContain("Queued, waiting for a machine: run it to start one.");
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

  it("shows a refusal from the machine's launch that arrives after the package was queued", async () => {
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

    it("keeps a resumed run running when another request moves the session document", async () => {
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
  it("says what the researcher's machine is doing", async () => {
    const s = services();
    await listed(s);
    await s.runner({ state: "running", current_package: { class_hash: SCOPE.class_hash, package_key: KEY } });
    const line = screen.getByText("Running Wildfire open responses.");
    expect(line.closest("[aria-live]")).not.toBeNull();
  });

  it("shows the researcher's counts, and says when there are none", async () => {
    const s = services();
    await mounted(s);
    expect(screen.queryByRole("heading", { name: "Your counts" })).toBeNull();
    await s.counts({ data: { answers: 9, logs: 4, last_pull_at: stamp(1000), log_freshness_at: stamp(2000) } });
    expect(screen.getByText("Logs 4")).toBeDefined();
    expect(screen.getByText(`Logs current to ${formatTime(2000)}`)).toBeDefined();
    await s.counts({ data: { answers: 9, last_pull_at: stamp(1000) } });
    const section = screen.getByRole("heading", { level: 2, name: "Your counts" }).closest("section")!;
    expect(within(section).getByText("Answers 9")).toBeDefined();
    expect(within(section).getByText("Logs not reported")).toBeDefined();
    expect(within(section).getByText(/^From your last run, /)).toBeDefined();
    expect(within(section).queryByText(/Logs current to/)).toBeNull();
    await s.counts(null);
    expect(within(screen.getByRole("heading", { name: "Your counts" }).closest("section")!).getByText("No runs yet.")).toBeDefined();
  });

  it("says the results and counts are the researcher's own", async () => {
    await mounted(services());
    expect(screen.getByText("Results and counts on this page are your own. Another researcher of this class sees their own runs.")).toBeDefined();
  });
});

describe("the Results section", () => {
  const SECOND = row({ title: "Second package", official: true, identity: "projects/20/second" });
  const SECOND_KEY = "projects__20__second";
  const done = (identity: string, summary: string, finishedAt: number, over: Partial<Result> = {}): Result => ({
    status: "done", package: { identity, version: "1.0.0", checksum: "c" }, summary, display: `# ${summary}`,
    finished_at: stamp(finishedAt), updated_at: stamp(finishedAt), ...over
  });
  const results = () => screen.getByRole("heading", { level: 2, name: "Results" }).closest("section")!;
  const showButton = (title: string) => screen.getByRole("button", { name: `Show result for ${title}` });
  const unlistedRow = (identity: string) => screen.getByText(identity, { selector: ".identity" }).closest("li")!;

  it("says how to open a result while none is open, and not once one is", async () => {
    const s = services();
    await listed(s);
    expect(within(results()).getByText("Open a finished package's result to read it here.")).toBeDefined();
    await s.results(new Map([[KEY, done(WILDFIRE.identity, "6 open responses from 3 learners.", 1000)]]));
    fireEvent.click(showButton("Wildfire open responses"));
    expect(within(results()).queryByText("Open a finished package's result to read it here.")).toBeNull();
  });

  it("opens a result with its title focused, and Close returns focus to its row", async () => {
    const s = services({ list: async () => [WILDFIRE, SECOND] });
    await listed(s);
    await s.results(new Map([
      [KEY, done(WILDFIRE.identity, "6 open responses from 3 learners.", 1000)],
      [SECOND_KEY, done(SECOND.identity, "Second summary", 2000)]
    ]));
    fireEvent.click(showButton("Wildfire open responses"));
    const title = within(results()).getByRole("heading", { level: 3, name: "Wildfire open responses" });
    expect(document.activeElement).toBe(title);
    expect(within(results()).getByText("6 open responses from 3 learners.", { selector: ".summary" })).toBeDefined();
    expect(within(results()).getByRole("heading", { level: 4, name: "6 open responses from 3 learners." })).toBeDefined();
    showButton("Second package").focus();
    fireEvent.click(showButton("Second package"));
    expect(document.activeElement).toBe(within(results()).getByRole("heading", { level: 3, name: "Second package" }));
    showButton("Second package").focus();
    fireEvent.click(showButton("Second package"));
    expect(document.activeElement).toBe(within(results()).getByRole("heading", { level: 3, name: "Second package" }));
    fireEvent.click(within(results()).getByRole("button", { name: "Close" }));
    expect(within(results()).queryByRole("heading", { level: 3, name: "Second package" })).toBeNull();
    expect(document.activeElement).toBe(showButton("Second package"));
  });

  it("stays open on the same result through a re-run, and shows the new one in place when it lands", async () => {
    const s = services();
    await listed(s);
    const first = done(WILDFIRE.identity, "Earlier summary", 1000);
    await s.results(new Map([[KEY, first]]));
    fireEvent.click(showButton("Wildfire open responses"));
    const title = document.activeElement;
    const previous = { package: first.package, summary: first.summary, display: first.display, finished_at: first.finished_at };
    for (const over of [{ status: "queued" }, { status: "running", stage: "run_package" }, { status: "failed", error: "boom" }] as const) {
      await s.results(new Map([[KEY, wildfire({ ...over, previous, updated_at: stamp(1100) })]]));
      expect(within(results()).getByText("Earlier summary", { selector: ".summary" })).toBeDefined();
      expect(document.activeElement).toBe(title);
      expect(within(results()).getByRole("status").textContent).toBe("");
    }
    await s.results(new Map([[KEY, done(WILDFIRE.identity, "Newer summary", 3000, { previous })]]));
    expect(within(results()).getByText("Newer summary", { selector: ".summary" })).toBeDefined();
    expect(within(results()).getByRole("status").textContent).toBe(`Updated ${formatTime(3000)}`);
    expect(document.activeElement).toBe(title);
  });

  it("stays open, focus unmoved, when a listener is refused", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, done(WILDFIRE.identity, "Earlier summary", 1000)]]));
    fireEvent.click(showButton("Wildfire open responses"));
    const title = document.activeElement;
    await s.refuseRuns("runner");
    expect(within(results()).getByText("Earlier summary", { selector: ".summary" })).toBeDefined();
    expect(document.activeElement).toBe(title);
    fireEvent.click(within(results()).getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Results" }));
  });

  it("closes, with focus on the Results heading, when no finished result is left", async () => {
    const s = services();
    await listed(s);
    await s.results(new Map([[KEY, done(WILDFIRE.identity, "Earlier summary", 1000)]]));
    fireEvent.click(showButton("Wildfire open responses"));
    await s.results(new Map([[KEY, wildfire()]]));
    expect(within(results()).queryByText("Earlier summary")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Results" }));
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
    const section = screen.getByRole("heading", { level: 3, name: "Packages no longer listed" }).closest("section")!;
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

  it("opens an unlisted result, and Close returns focus to its row", async () => {
    const s = services({ resolve: async () => ({ archived: false }) });
    await listed(s);
    await s.results(new Map([["users__7__hidden", done("users/7/hidden", "Hidden summary", 1000)]]));
    showButton("users/7/hidden").focus();
    fireEvent.click(showButton("users/7/hidden"));
    expect(document.activeElement).toBe(within(results()).getByRole("heading", { level: 3, name: "users/7/hidden" }));
    fireEvent.click(within(results()).getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(showButton("users/7/hidden"));
  });

  it("offers no Run on an unlisted result, and words a waiting one without asking for a run", async () => {
    const s = services({ resolve: async () => ({ archived: false }) });
    await listed(s);
    await s.runner({ state: "terminated" });
    await s.results(new Map([["users__7__hidden", wildfire({ package: { identity: "users/7/hidden", version: "1.0.0", checksum: "c" } })]]));
    const section = screen.getByRole("heading", { level: 3, name: "Packages no longer listed" }).closest("section")!;
    expect(within(section).getByText("Queued, waiting for a machine.")).toBeDefined();
    expect(within(section).queryByRole("button", { name: /^(Run|Resume) / })).toBeNull();
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
