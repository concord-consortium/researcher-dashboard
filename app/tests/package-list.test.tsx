import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listCards, PackageList, quietUpdate, stateText, statusPill, type StatusModel } from "../src/components/PackageList";
import { unlistedTitle } from "../src/components/Unlisted";
import { groupPackages, packageKey } from "../src/shell/packages";
import type { PackageRow } from "../src/shell/portal";
import { formatTime, type Result, type Runner, type RunRequest } from "../src/shell/runs";
import { row, SCOPE, stamp } from "./fixtures";

const titleOfRow = (r: PackageRow) => r.current_version.title!;

afterEach(cleanup);

const H = SCOPE.class_hash;

function result(r: PackageRow, over: Partial<Result> = {}): Result {
  return {
    status: "done", package: { identity: r.identity, version: "1.0.0", checksum: "c" },
    summary: "6 open responses from 3 learners.", finished_at: stamp(1000), updated_at: stamp(1000), microvm_id: "vm-1", ...over
  };
}

function list(rows: PackageRow[], over: {
  results?: Map<string, Result>; runner?: Runner | null; requests?: Map<string, RunRequest>;
  newest?: number | null; behind?: Map<string, unknown>; filter?: string; search?: string;
  onRun?: (r: PackageRow, resume: boolean) => void; onOpen?: (key: string) => void;
} = {}) {
  render(
    <PackageList cards={listCards(groupPackages(rows, SCOPE), over.filter ?? "all", {
      classHash: SCOPE.class_hash, results: over.results ?? new Map(), runner: over.runner ?? null, mark: null,
      requests: over.requests ?? new Map(), newest: over.newest ?? null, behind: over.behind ?? new Map()
    })} search={over.search ?? null} onRun={over.onRun ?? vi.fn()} onOpen={over.onOpen ?? vi.fn()} linkRef={vi.fn()}
      confirming={null} onConfirm={vi.fn()} onCancel={vi.fn()} />
  );
}

const item = (title: string) => screen.getByText(title, { selector: ".title" }).closest("li")!;
// The state line's words, leaving out the time a failure's panel adds under them.
const stateLine = (title: string) => item(title).querySelector(".state p")?.textContent ?? null;
const failurePanel = (title: string) => item(title).querySelector(".row-problems .callout.error");
// A failure panel's words, leaving out the time under them.
const failureText = (title: string) => {
  const words = failurePanel(title)!.querySelector("span")!.cloneNode(true) as Element;
  words.querySelector(".when")?.remove();
  return words.textContent;
};
const pill = (title: string) => item(title).querySelector(".status-pill .label")!.textContent;
const pillTitle = (title: string) => item(title).querySelector(".status-pill")!.getAttribute("title");
const runButton = (title: string) => within(item(title)).getByRole("button", { name: new RegExp(`^(Run|Resume) ${title}$`) });

describe("PackageList", () => {
  it("lists every group's packages in one list, each tagged with its group, and keeps only the filter's group", () => {
    const official = row({ title: "Ours", official: true }), mine = row({ title: "My own", mine: true });
    const stranger = row({ title: "Stranger's", visibility: "public" });
    list([stranger, mine, official]);
    expect([...document.querySelectorAll(".package-rows > li")].map((li) => [li.querySelector(".title")!.textContent, li.querySelector(".tag")!.textContent]))
      .toEqual([["Ours", "Official"], ["My own", "Mine"], ["Stranger's", "Community"]]);
    expect(screen.queryByRole("heading")).toBeNull();
    cleanup();
    list([stranger, mine, official], { filter: "mine" });
    expect([...document.querySelectorAll(".title")].map((e) => e.textContent)).toEqual(["My own"]);
    cleanup();
    list([stranger, mine, official], { filter: "community" });
    expect([...document.querySelectorAll(".title")].map((e) => e.textContent)).toEqual(["Stranger's"]);
    expect(screen.queryByText(/not reviewed by Concord/)).toBeNull();
  });

  it("marks each place a search's words appear in a card's title, description and identity, and nothing with no search", () => {
    const r = row({ official: true, identity: "official/model-use", current_version: { version: "1.0.0", title: "Wildfire Model use", description: "How the model (a.k.a. MODEL) ran" } });
    list([r], { search: "model (a.k.a." });
    const card = () => document.querySelector(".package-rows > li")!;
    const marks = (selector: string) => [...card().querySelectorAll(`${selector} mark.match`)].map((m) => m.textContent);
    expect(marks(".title")).toEqual(["Model"]);
    expect(marks(".description")).toEqual(["model", "(a.k.a.", "MODEL"]);
    expect(marks(".identity")).toEqual(["model"]);
    expect(card().querySelector(".title")!.textContent).toBe("Wildfire Model use");
    expect(card().querySelector(".description")!.textContent).toBe("How the model (a.k.a. MODEL) ran");
    cleanup();
    list([r]);
    expect(document.querySelector("mark")).toBeNull();
  });

  it("keeps every group in title order, whatever the results say", () => {
    const b = row({ title: "Beta", official: true }), a = row({ title: "Alpha", official: true });
    list([b, a], { results: new Map([[packageKey(b.identity), result(b, { finished_at: stamp(9) })], [packageKey(a.identity), result(a, { finished_at: stamp(1) })]]) });
    expect([...document.querySelectorAll(".title")].map((e) => e.textContent)).toEqual(["Alpha", "Beta"]);
  });

  it("says each state on its row", () => {
    const rows = ["Not", "Queued", "Lagging", "Busy", "Done", "Failed", "Stuck"].map((title) => row({ title, official: true }));
    const [, queued, lagging, running, done, failed, stuck] = rows;
    const key = (r: PackageRow) => packageKey(r.identity);
    list(rows, {
      runner: { state: "running", microvm_id: "vm-2", updated_at: stamp(2000), queue: [{ class_hash: "other", package_key: "x" }, { class_hash: H, package_key: key(queued) }] },
      results: new Map([
        [key(queued), result(queued, { status: "queued", summary: null, finished_at: null })],
        [key(lagging), result(lagging, { status: "queued", summary: null, finished_at: null })],
        [key(running), result(running, { status: "running", stage: "prepare_package", microvm_id: "vm-2", updated_at: stamp(3000), finished_at: null })],
        [key(done), result(done)],
        [key(failed), result(failed, { status: "failed", error: "The machine running it stopped before the run finished; run it again.", finished_at: stamp(5000) })],
        [key(stuck), result(stuck, { status: "running", microvm_id: "vm-1", updated_at: stamp(1500), finished_at: null })]
      ])
    });
    expect(stateLine("Not")).toBeNull();
    expect(item("Not").querySelector(".state [aria-live]")).not.toBeNull();
    expect([...document.querySelectorAll(".status-pill.throb .label")].map((e) => e.textContent)).toEqual(["Running"]);
    expect(["Not", "Queued", "Lagging", "Busy", "Done", "Failed", "Stuck"].map(pill))
      .toEqual(["Not run", "Queued, #2", "Queued", "Running", "Finished", "Failed", "Interrupted"]);
    expect(stateLine("Queued")).toBe("Queued, number 2 in line.");
    expect(stateLine("Lagging")).toBe("Queued.");
    expect(stateLine("Busy")).toBe("Running Busy: preparing the package.");
    expect(stateLine("Done")).toBe("6 open responses from 3 learners.");
    expect(pillTitle("Done")).toBe(`Finished ${formatTime(1000)}`);
    expect(item("Done").querySelector(".status-pill .visually-hidden")!.textContent).toBe(`, Finished ${formatTime(1000)}`);
    expect(pillTitle("Not")).toBeNull();
    expect(stateLine("Failed")).toBeNull();
    expect(failureText("Failed")).toBe("Failed: The machine running it stopped before the run finished; run it again.");
    expect(failurePanel("Failed")!.querySelector(".when")!.textContent).toBe(`Failed at ${formatTime(5000)}`);
    expect(failurePanel("Done")).toBeNull();
    expect(stateLine("Stuck")).toBe("Interrupted: its runner stopped partway. This is being checked.");
    expect(within(item("Stuck")).getByText("It can be run again once it is marked failed.")).toBeDefined();
  });

  it("says a done result with no summary finished", () => {
    const r = row({ title: "Quiet", official: true });
    list([r], { results: new Map([[packageKey(r.identity), result(r, { summary: null })]]) });
    expect(stateLine("Quiet")).toBe("Finished.");
  });

  it("shows summaries as text", () => {
    const r = row({ title: "Bold", official: true });
    list([r], { results: new Map([[packageKey(r.identity), result(r, { summary: "**6** answers" })]]) });
    expect(stateLine("Bold")).toBe("**6** answers");
    expect(item("Bold").querySelector("strong")).toBeNull();
  });

  it("asks for a run of queued work nobody will take", () => {
    const r = row({ title: "Stranded", official: true });
    list([r], { runner: { state: "terminated" }, results: new Map([[packageKey(r.identity), result(r, { status: "queued" })]]) });
    expect(stateLine("Stranded")).toBe("Queued, waiting for a runner: run it to start one.");
    expect(runButton("Stranded").getAttribute("aria-disabled")).toBeNull();
  });

  it("says which version the shown result is from", () => {
    const r = row({ title: "Versioned", official: true, current_version: { version: "1.1.0", title: "Versioned", description: null } });
    list([r], { results: new Map([[packageKey(r.identity), result(r)]]) });
    expect(pillTitle("Versioned")).toBe(`Finished ${formatTime(1000)} · from 1.0.0`);
    cleanup();
    const rerun = row({ title: "Rerun", official: true, current_version: { version: "1.1.0", title: "Rerun", description: null } });
    const previous = { package: { identity: rerun.identity, version: "1.0.0", checksum: "c" }, summary: "Earlier", finished_at: stamp(1000) };
    list([rerun], { results: new Map([[packageKey(rerun.identity), result(rerun, {
      status: "queued", package: { identity: rerun.identity, version: "1.1.0", checksum: "c" }, previous
    })]]) });
    expect(pillTitle("Rerun")).toBe(`Finished ${formatTime(1000)} · from 1.0.0`);
    cleanup();
    const same = row({ title: "Same", official: true });
    list([same], { results: new Map([[packageKey(same.identity), result(same)]]) });
    expect(pillTitle("Same")).toBe(`Finished ${formatTime(1000)}`);
  });

  it("keeps the latest finished result on the row through a re-run", () => {
    const q = row({ title: "Requeued", official: true }), r = row({ title: "Rerunning", official: true }), f = row({ title: "Refailed", official: true });
    const previous = { package: { identity: "x", version: "1.0.0", checksum: "c" }, summary: "Earlier summary", finished_at: stamp(1000) };
    list([q, r, f], {
      runner: { state: "running", microvm_id: "vm-1", updated_at: stamp(1), queue: [{ class_hash: H, package_key: packageKey(q.identity) }] },
      results: new Map([
        [packageKey(q.identity), result(q, { status: "queued", summary: null, previous })],
        [packageKey(r.identity), result(r, { status: "running", stage: "run_package", summary: null, previous, updated_at: stamp(2) })],
        [packageKey(f.identity), result(f, { status: "failed", error: "No VM took this package before its VM's life ended; run it again", summary: null, previous, finished_at: stamp(4000) })]
      ])
    });
    expect(stateLine("Requeued")).toBe("Re-run: queued, number 1 in line.");
    expect(stateLine("Rerunning")).toBe("Re-run: running the package.");
    expect(failureText("Refailed")).toBe(
      `The latest re-run failed: No VM took this package before its VM's life ended; run it again. Showing the result from ${formatTime(1000)}.`
    );
    expect(failurePanel("Refailed")!.querySelector(".when")!.textContent).toBe(`Failed at ${formatTime(4000)}`);
    for (const title of ["Requeued", "Rerunning", "Refailed"]) {
      expect(within(item(title)).getByText("Earlier summary")).toBeDefined();
      expect(pillTitle(title)).toBe(`Finished ${formatTime(1000)}`);
    }
  });

  it("disables Run, with its reason as the button's description, for a package that cannot be run", () => {
    const onRun = vi.fn();
    list([row({ title: "Unreviewed", official: true, runnable: false })], { onRun });
    const button = runButton("Unreviewed");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toBe("Only official packages can be run here for now.");
    fireEvent.click(button);
    expect(onRun).not.toHaveBeenCalled();
  });

  it("disables Run while the package runs or the session will take it, and not when nothing will", () => {
    const running = row({ title: "Busy", official: true }), queued = row({ title: "Taken", official: true });
    const results = new Map([
      [packageKey(running.identity), result(running, { status: "running", updated_at: stamp(5) })],
      [packageKey(queued.identity), result(queued, { status: "queued" })]
    ]);
    list([running, queued], { runner: { state: "running", microvm_id: "vm-1", updated_at: stamp(1) }, results });
    expect(runButton("Busy").getAttribute("aria-disabled")).toBe("true");
    expect(runButton("Busy").hasAttribute("aria-describedby")).toBe(false);
    expect(runButton("Taken").getAttribute("aria-disabled")).toBe("true");
    cleanup();
    const onRun = vi.fn();
    list([queued], { runner: null, results, onRun });
    expect(runButton("Taken").getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(runButton("Taken"));
    expect(onRun).toHaveBeenCalledWith(queued, false);
  });

  it("offers Resume on a run paused on the same runner", () => {
    const r = row({ title: "Paused", official: true });
    const onRun = vi.fn();
    list([r], {
      runner: { state: "suspended", microvm_id: "vm-1", updated_at: stamp(2000) },
      results: new Map([[packageKey(r.identity), result(r, { status: "running", summary: null, finished_at: null, updated_at: stamp(1500) })]]),
      onRun
    });
    expect(stateLine("Paused")).toBe("Paused partway through: resume it to finish.");
    fireEvent.click(within(item("Paused")).getByRole("button", { name: "Resume Paused" }));
    expect(onRun).toHaveBeenCalledWith(r, true);
  });

  it("reads a resumed re-run as an update of the result it keeps", () => {
    const r = row({ title: "Resumed", official: true });
    const previous = { package: { identity: r.identity, version: "1.0.0", checksum: "c" }, summary: "Earlier summary", finished_at: stamp(1000) };
    list([r], {
      runner: { state: "suspended", microvm_id: "vm-1", updated_at: stamp(2000) },
      results: new Map([[packageKey(r.identity), result(r, { status: "running", summary: null, previous, updated_at: stamp(1500) })]]),
      requests: new Map([[packageKey(r.identity), { resuming: true, at: 1500 }]])
    });
    expect(stateLine("Resumed")).toBe("Re-run: resuming: it will continue within a minute or two.");
    expect(runButton("Resumed").getAttribute("aria-disabled")).toBe("true");
  });

  it("puts a disabled Run's reason beside it", () => {
    const r = row({ title: "Unreviewed done", official: true, runnable: false });
    list([r], { results: new Map([[packageKey(r.identity), result(r)]]) });
    const [runRow, reason] = [...item("Unreviewed done").querySelector(".controls")!.children];
    expect([...runRow.children]).toEqual([item("Unreviewed done").querySelector(".status-pill"), runButton("Unreviewed done")]);
    expect(reason.textContent).toBe("Only official packages can be run here for now.");
  });

  it("offers View result, before Run, only for a finished result with something to read, through a re-run", () => {
    const fresh = row({ title: "Fresh", official: true }), bare = row({ title: "Bare", official: true });
    const done = row({ title: "Read", official: true }), rerun = row({ title: "Rerunning", official: true });
    const previous = { package: { identity: rerun.identity, version: "1.0.0", checksum: "c" }, summary: "Earlier", display: "# Earlier" };
    const onOpen = vi.fn();
    list([fresh, bare, done, rerun], {
      results: new Map([
        [packageKey(bare.identity), result(bare, { display: null })],
        [packageKey(done.identity), result(done, { display: "# Six" })],
        [packageKey(rerun.identity), result(rerun, { status: "running", stage: "run_package", display: null, previous })]
      ]),
      onOpen
    });
    const view = (title: string) => within(item(title)).queryByRole("button", { name: `View result for ${title}` });
    expect([view("Fresh"), view("Bare")]).toEqual([null, null]);
    expect(view("Read")!.nextElementSibling).toBe(runButton("Read"));
    expect(view("Rerunning")).not.toBeNull();
    fireEvent.click(view("Read")!);
    expect(onOpen).toHaveBeenCalledWith(packageKey(done.identity));
  });

  it("opens a package from its title, run or not, at its own address", () => {
    const fresh = row({ title: "Fresh", official: true }), done = row({ title: "Done", official: true });
    const onOpen = vi.fn();
    list([fresh, done], { results: new Map([[packageKey(done.identity), result(done)]]), onOpen });
    for (const r of [fresh, done]) {
      const link = screen.getByRole("link", { name: titleOfRow(r) });
      expect(link.getAttribute("href")).toBe(`#packages/${encodeURIComponent(packageKey(r.identity))}`);
      fireEvent.click(link);
      expect(onOpen).toHaveBeenLastCalledWith(packageKey(r.identity));
    }
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("leaves out the instruction to press a control on a row that has none", () => {
    expect(stateText({ kind: "queued", position: null, waiting: true }, "T", false)).toBe("Queued, waiting for a runner.");
    expect(stateText({ kind: "stuck", resumable: true }, "T", false)).toBe("Paused partway through.");
    expect(stateText({ kind: "queued", position: null, waiting: true }, "T", true)).toBe("Queued, waiting for a runner: run it to start one.");
    expect(stateText({ kind: "stuck", resumable: true }, "T", true)).toBe("Paused partway through: resume it to finish.");
  });

  it("puts each row's state in a polite live region", () => {
    const r = row({ title: "Live", official: true });
    list([r]);
    expect(item("Live").querySelector(".state [aria-live]")!.getAttribute("aria-live")).toBe("polite");
  });
});

describe("a re-run on the row", () => {
  const r = row({ title: "Rerun", official: true });
  const key = packageKey(r.identity);
  const pkg = { identity: r.identity, version: "1.0.0", checksum: "c" };
  const previous = { package: pkg, summary: "Earlier", started_at: stamp(100), finished_at: stamp(200) };
  const live = (el: Element) => el.closest("[aria-live]");

  it.each([
    ["queued with a finished result", { kind: "queued", position: 1, waiting: false }, true, false, true],
    ["running with a finished result", { kind: "running", stage: "starting" }, true, false, true],
    ["done with a request in flight", { kind: "done", summary: null, finishedAt: 1 }, true, true, true],
    ["done with nothing in flight", { kind: "done", summary: null, finishedAt: 1 }, true, false, false],
    ["paused partway, which asks for a press", { kind: "stuck", resumable: true }, true, false, false],
    ["a first run", { kind: "running", stage: "starting" }, false, true, false]
  ] as const)("is quiet or not for %s", (_name, state, hasFinished, inFlight, quiet) => {
    expect(quietUpdate(state, hasFinished, inFlight)).toBe(quiet);
  });

  it("shows a re-run's running line outside the live region, and its new summary inside", () => {
    list([r], { results: new Map([[key, { status: "running", stage: "run_package", package: pkg, previous }]]) });
    expect(live(within(item("Rerun")).getByText(/running the package/))).toBeNull();
    cleanup();
    list([r], { results: new Map([[key, { status: "done", package: pkg, summary: "Newer" }]]) });
    expect(live(within(item("Rerun")).getByText("Newer"))).not.toBeNull();
  });

  it("announces a first run's running line", () => {
    list([r], { results: new Map([[key, { status: "running", stage: "run_package", package: pkg }]]) });
    expect(live(within(item("Rerun")).getByText(/running the package/))).not.toBeNull();
  });

  it("shows Requesting outside the live region on a finished row, and inside on a new one", () => {
    const requests = new Map([[key, { pending: true as const }]]);
    list([r], { results: new Map([[key, { status: "done", package: pkg, summary: "Earlier" }]]), requests });
    expect(live(within(item("Rerun")).getByText("Requesting…"))).toBeNull();
    cleanup();
    list([r], { requests });
    expect(live(within(item("Rerun")).getByText("Requesting…"))).not.toBeNull();
  });

  it("says a result is out of date when a learner saved since it and it is not about to re-run", () => {
    const result = { status: "done" as const, package: pkg, summary: "Earlier", started_at: stamp(100) };
    list([r], { results: new Map([[key, result]]), newest: 500 });
    expect(within(item("Rerun")).getByText("Students have saved work since this result.")).toBeDefined();
    cleanup();
    list([r], { results: new Map([[key, result]]), newest: 500, behind: new Map([[key, {}]]) });
    expect(within(item("Rerun")).queryByText("Students have saved work since this result.")).toBeNull();
  });
});

describe("statusPill", () => {
  const model = (over: Partial<StatusModel>): StatusModel => ({
    state: { kind: "not-run" }, line: "", quiet: false, pending: false, refusal: null, finished: null, outdated: false, versionNote: null, ...over
  });
  const finished = { package: { identity: "x", version: "1.0.0", checksum: "c" } };

  it.each([
    ["a request in flight, whatever the state", model({ pending: true, state: { kind: "done", summary: null, finishedAt: 1 } }), "Requesting", "Requesting", "busy"],
    ["queued work nothing will take", model({ state: { kind: "queued", position: null, waiting: true } }), "Waiting for a runner", "Waiting for a runner", "warn"],
    ["a place in line, under the Queued status", model({ state: { kind: "queued", position: 2, waiting: false } }), "Queued", "Queued, #2", "busy"],
    ["a run paused on its runner", model({ state: { kind: "stuck", resumable: true } }), "Paused", "Paused", "warn"],
    ["a failed re-run over a finished result", model({ state: { kind: "failed", error: "x", finishedAt: 1 }, finished }), "Re-run failed", "Re-run failed", "error"],
    ["a failed first run", model({ state: { kind: "failed", error: "x", finishedAt: 1 } }), "Failed", "Failed", "error"]
  ] as const)("says %s", (_name, m, status, label, tone) => {
    expect(statusPill(m)).toEqual({ status, label, tone });
  });
});

describe("unlistedTitle", () => {
  it("uses the title the list gave, else one made from the identity's last segment", () => {
    expect(unlistedTitle("projects/20/gone", new Map([["projects/20/gone", "Gone for good"]]))).toBe("Gone for good");
    expect(unlistedTitle("official/legacy-responses", new Map())).toBe("Legacy responses");
    expect(unlistedTitle("users/7/hidden", new Map())).toBe("Hidden");
  });
});
