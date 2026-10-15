import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackageList, stateText } from "../src/components/PackageList";
import { packageKey } from "../src/shell/packages";
import type { PackageRow } from "../src/shell/portal";
import { formatTime, type Result, type Runner, type RunRequest } from "../src/shell/runs";
import { row, SCOPE, stamp } from "./fixtures";

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
  onRun?: (r: PackageRow, resume: boolean) => void; onShow?: (key: string) => void;
} = {}) {
  render(
    <PackageList rows={rows} scope={SCOPE} results={over.results ?? new Map()} runner={over.runner ?? null} mark={null}
      requests={over.requests ?? new Map()} onRun={over.onRun ?? vi.fn()} onShow={over.onShow ?? vi.fn()} showRef={vi.fn()} />
  );
}

const item = (title: string) => screen.getByText(title, { selector: ".title" }).closest("li")!;
const stateLine = (title: string) => item(title).querySelector(".state p")!.textContent;
const runButton = (title: string) => within(item(title)).getByRole("button", { name: new RegExp(`^(Run|Resume) ${title}$`) });

describe("PackageList", () => {
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
    expect(stateLine("Not")).toBe("Not run.");
    expect(stateLine("Queued")).toBe("Queued, number 2 in line.");
    expect(stateLine("Lagging")).toBe("Queued.");
    expect(stateLine("Busy")).toBe("Running Busy: preparing the package.");
    expect(stateLine("Done")).toBe("6 open responses from 3 learners.");
    expect(within(item("Done")).getByText(`Finished ${formatTime(1000)}`)).toBeDefined();
    expect(stateLine("Failed")).toBe("Failed: The machine running it stopped before the run finished; run it again.");
    expect(within(item("Failed")).getByText(formatTime(5000))).toBeDefined();
    expect(stateLine("Stuck")).toBe("Interrupted: the machine running it stopped partway. This is being checked.");
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
    expect(stateLine("Stranded")).toBe("Queued, waiting for a machine: run it to start one.");
    expect(runButton("Stranded").getAttribute("aria-disabled")).toBeNull();
  });

  it("says which version the shown result is from", () => {
    const r = row({ title: "Versioned", official: true, current_version: { version: "1.1.0", title: "Versioned", description: null } });
    list([r], { results: new Map([[packageKey(r.identity), result(r)]]) });
    expect(within(item("Versioned")).getByText(/from 1\.0\.0/)).toBeDefined();
    cleanup();
    const rerun = row({ title: "Rerun", official: true, current_version: { version: "1.1.0", title: "Rerun", description: null } });
    const previous = { package: { identity: rerun.identity, version: "1.0.0", checksum: "c" }, summary: "Earlier", finished_at: stamp(1000) };
    list([rerun], { results: new Map([[packageKey(rerun.identity), result(rerun, {
      status: "queued", package: { identity: rerun.identity, version: "1.1.0", checksum: "c" }, previous
    })]]) });
    expect(within(item("Rerun")).getByText(/from 1\.0\.0/)).toBeDefined();
    cleanup();
    const same = row({ title: "Same", official: true });
    list([same], { results: new Map([[packageKey(same.identity), result(same)]]) });
    expect(within(item("Same")).queryByText(/from 1\.0\.0/)).toBeNull();
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
    expect(stateLine("Requeued")).toBe("Updating: queued, number 1 in line.");
    expect(stateLine("Rerunning")).toBe("Updating: running Rerunning: running the package.");
    expect(stateLine("Refailed")).toBe(
      `The latest re-run failed: No VM took this package before its VM's life ended; run it again. Showing the result from ${formatTime(1000)}.`
    );
    expect(within(item("Refailed").querySelector(".state") as HTMLElement).getByText(formatTime(4000))).toBeDefined();
    for (const title of ["Requeued", "Rerunning", "Refailed"]) {
      expect(within(item(title)).getByText("Earlier summary")).toBeDefined();
      expect(within(item(title)).getByText(`Finished ${formatTime(1000)}`)).toBeDefined();
      expect(within(item(title)).getByRole("button", { name: `Show result for ${title}` })).toBeDefined();
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

  it("offers Resume on a run paused on the same machine", () => {
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
    expect(stateLine("Resumed")).toBe("Updating: resuming: it will continue within a minute or two.");
    expect(runButton("Resumed").getAttribute("aria-disabled")).toBe("true");
  });

  it("puts a disabled Run's reason beside it, before Show result", () => {
    const r = row({ title: "Unreviewed done", official: true, runnable: false });
    list([r], { results: new Map([[packageKey(r.identity), result(r)]]) });
    const [run, reason, show] = [...item("Unreviewed done").querySelector(".controls")!.children];
    expect(run).toBe(runButton("Unreviewed done"));
    expect(reason.textContent).toBe("Only official packages can be run here for now.");
    expect(show.textContent).toBe("Show result");
  });

  it("offers Show result only with a finished result", () => {
    const r = row({ title: "Fresh", official: true });
    const onShow = vi.fn();
    list([r], { onShow });
    expect(within(item("Fresh")).queryByRole("button", { name: /Show result/ })).toBeNull();
    cleanup();
    list([r], { results: new Map([[packageKey(r.identity), result(r)]]), onShow });
    fireEvent.click(within(item("Fresh")).getByRole("button", { name: "Show result for Fresh" }));
    expect(onShow).toHaveBeenCalledWith(packageKey(r.identity));
  });

  it("leaves out the instruction to press a control on a row that has none", () => {
    expect(stateText({ kind: "queued", position: null, waiting: true }, "T", false)).toBe("Queued, waiting for a machine.");
    expect(stateText({ kind: "stuck", resumable: true }, "T", false)).toBe("Paused partway through.");
    expect(stateText({ kind: "queued", position: null, waiting: true }, "T", true)).toBe("Queued, waiting for a machine: run it to start one.");
    expect(stateText({ kind: "stuck", resumable: true }, "T", true)).toBe("Paused partway through: resume it to finish.");
  });

  it("puts each row's state in a polite live region", () => {
    const r = row({ title: "Live", official: true });
    list([r]);
    expect(item("Live").querySelector(".state")!.getAttribute("aria-live")).toBe("polite");
  });
});
