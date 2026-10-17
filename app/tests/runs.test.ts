import { describe, expect, it } from "vitest";
import {
  isStuck, latestFinished, nextMark, queuePosition, rowState, runOffer, sessionLines, sessionTakes, stageWords, WAITING,
  type Result, type Runner, type SessionMark
} from "../src/shell/runs";
import { stamp } from "./fixtures";

const PKG = { identity: "projects/20/w", version: "1.0.0", checksum: "sha256:x" };
const H = "hash223", K = "projects__20__w";

function result(over: Partial<Result> = {}): Result {
  return { status: "running", package: PKG, microvm_id: "vm-1", updated_at: stamp(100), ...over };
}

function runner(over: Partial<Runner> = {}): Runner {
  return { state: "running", microvm_id: "vm-1", updated_at: stamp(100), ...over };
}

const mark = (at: number, r: Runner = runner()): SessionMark => ({ state: r.state ?? null, microvm_id: r.microvm_id ?? null, at });

describe("sessionTakes", () => {
  it("is true while the session will take queued work", () => {
    for (const state of ["starting", "ready", "running", "suspending", "suspended"]) expect(sessionTakes({ state }), state).toBe(true);
  });

  it("is false with no session, a failed launch's stateless document, or an ended one", () => {
    expect(sessionTakes(null)).toBe(false);
    expect(sessionTakes({ queue: [{ class_hash: H, package_key: K }] })).toBe(false);
    expect(sessionTakes({ state: "terminated" })).toBe(false);
    expect(sessionTakes({ state: "failed" })).toBe(false);
  });
});

describe("nextMark", () => {
  it("keeps the mark through a snapshot that moves only updated_at", () => {
    const first = nextMark(null, runner({ state: "suspended", updated_at: stamp(90) }))!;
    expect(first).toEqual({ state: "suspended", microvm_id: "vm-1", at: 90 });
    expect(nextMark(first, runner({ state: "suspended", updated_at: stamp(110) }))).toBe(first);
  });

  it("starts a new mark when the state or the VM changes", () => {
    const first = nextMark(null, runner({ updated_at: stamp(90) }));
    expect(nextMark(first, runner({ state: "suspended", updated_at: stamp(110) }))).toEqual({ state: "suspended", microvm_id: "vm-1", at: 110 });
    expect(nextMark(first, runner({ microvm_id: "vm-2", updated_at: stamp(120) }))).toEqual({ state: "running", microvm_id: "vm-2", at: 120 });
  });

  it("is null with no runner document", () => {
    expect(nextMark(mark(90), null)).toBeNull();
  });
});

describe("isStuck", () => {
  it("is stuck when a newer VM holds the session, or the same VM paused or ended", () => {
    expect(isStuck(result(), runner({ microvm_id: "vm-2" }), null)).toBe(true);
    for (const state of ["suspended", "terminated", "failed"]) expect(isStuck(result(), runner({ state }), null), state).toBe(true);
  });

  it("is not stuck while the session runs on, flushes, or says nothing", () => {
    for (const state of ["suspending", "running", "ready"]) expect(isStuck(result(), runner({ state }), null), state).toBe(false);
    expect(isStuck(result(), null, null)).toBe(false);
    expect(isStuck(result({ status: "done" }), runner({ state: "suspended" }), null)).toBe(false);
  });

  it("is not stuck once the result is written after the session's mark", () => {
    const paused = runner({ state: "suspended", updated_at: stamp(100) });
    expect(isStuck(result({ updated_at: stamp(101) }), paused, mark(100, paused))).toBe(false);
    expect(isStuck(result({ updated_at: stamp(100) }), paused, mark(100, paused))).toBe(true);
  });

  it("compares with the mark rather than a later write that changed neither state nor VM", () => {
    const paused = runner({ state: "suspended", updated_at: stamp(110) });
    expect(isStuck(result({ updated_at: stamp(100) }), paused, mark(90, paused))).toBe(false);
    expect(isStuck(result({ updated_at: stamp(100) }), paused, null)).toBe(true);
  });
});

describe("queuePosition", () => {
  it("counts entries of every class before it", () => {
    const queue = [{ class_hash: "other", package_key: "users__1__x" }, { class_hash: H, package_key: K }];
    expect(queuePosition(runner({ queue }), H, K)).toBe(2);
  });

  it("is null when the queue does not hold it yet", () => {
    expect(queuePosition(runner({ queue: [{ class_hash: "other", package_key: K }] }), H, K)).toBeNull();
    expect(queuePosition(null, H, K)).toBeNull();
  });
});

describe("latestFinished", () => {
  const previous = { package: PKG, summary: "earlier", finished_at: stamp(50) };

  it("is a done result itself", () => {
    const done = result({ status: "done", summary: "now", previous });
    expect(latestFinished(done)).toBe(done);
  });

  it("is the kept run for a re-run that is queued, running or failed", () => {
    for (const status of ["queued", "running", "failed"] as const) expect(latestFinished(result({ status, previous })), status).toBe(previous);
  });

  it("is null with nothing finished", () => {
    for (const status of ["queued", "running", "failed"] as const) expect(latestFinished(result({ status })), status).toBeNull();
    expect(latestFinished(undefined)).toBeNull();
  });
});

describe("rowState", () => {
  it("names each state", () => {
    expect(rowState(undefined, null, null, H, K)).toEqual({ kind: "not-run" });
    const queue = [{ class_hash: H, package_key: K }];
    expect(rowState(result({ status: "queued" }), runner({ queue }), null, H, K)).toEqual({ kind: "queued", position: 1, waiting: false });
    expect(rowState(result({ stage: "run_package" }), runner(), null, H, K)).toEqual({ kind: "running", stage: "run_package" });
    expect(rowState(result({ stage: undefined }), runner(), null, H, K)).toEqual({ kind: "running", stage: "starting" });
    expect(rowState(result({ status: "done", summary: "6 open responses", finished_at: stamp(7) }), runner(), null, H, K))
      .toEqual({ kind: "done", summary: "6 open responses", finishedAt: 7 });
    expect(rowState(result({ status: "done" }), runner(), null, H, K)).toEqual({ kind: "done", summary: null, finishedAt: null });
    expect(rowState(result({ status: "failed", error: "boom", finished_at: stamp(8) }), runner(), null, H, K))
      .toEqual({ kind: "failed", error: "boom", finishedAt: 8 });
  });

  it("marks queued work nobody will take as waiting", () => {
    expect(rowState(result({ status: "queued" }), runner({ state: "terminated" }), null, H, K)).toMatchObject({ waiting: true });
    expect(rowState(result({ status: "queued" }), null, null, H, K)).toMatchObject({ waiting: true });
  });

  it("offers a resume only for a run paused on the same VM", () => {
    expect(rowState(result(), runner({ state: "suspended" }), null, H, K)).toEqual({ kind: "stuck", resumable: true });
    expect(rowState(result(), runner({ state: "suspended", microvm_id: "vm-2" }), null, H, K)).toEqual({ kind: "stuck", resumable: false });
    expect(rowState(result(), runner({ state: "terminated" }), null, H, K)).toEqual({ kind: "stuck", resumable: false });
  });

  it("uses the mark it is given", () => {
    const paused = runner({ state: "suspended", updated_at: stamp(110) });
    expect(rowState(result(), paused, mark(90, paused), H, K)).toEqual({ kind: "running", stage: "starting" });
  });
});

describe("stageWords", () => {
  it("says each stage in words, and an unknown one as written", () => {
    expect(stageWords("starting")).toBe("starting");
    expect(stageWords("prepare_package")).toBe("preparing the package");
    expect(stageWords("run_package")).toBe("running the package");
    expect(stageWords("something_new")).toBe("something_new");
  });
});

describe("runOffer", () => {
  it("is disabled, with a reason, for a package that cannot be run", () => {
    expect(runOffer(false, { kind: "not-run" })).toEqual({ enabled: false, reason: "Only official packages can be run here for now." });
  });

  it("is disabled without a reason while the state says why", () => {
    expect(runOffer(true, { kind: "running", stage: "starting" })).toEqual({ enabled: false });
    expect(runOffer(true, { kind: "queued", position: 1, waiting: false })).toEqual({ enabled: false });
  });

  it("is disabled, with a reason, for a stuck run only the watchdog can end", () => {
    expect(runOffer(true, { kind: "stuck", resumable: false })).toEqual({ enabled: false, reason: "It can be run again once it is marked failed." });
  });

  it("is enabled otherwise", () => {
    for (const state of [
      { kind: "not-run" }, { kind: "done", summary: null, finishedAt: null }, { kind: "failed", error: "x", finishedAt: null },
      { kind: "queued", position: null, waiting: true }, { kind: "stuck", resumable: true }
    ] as const) expect(runOffer(true, state), state.kind).toEqual({ enabled: true });
  });
});

describe("sessionLines", () => {
  const titles = (key: string) => (key === K ? "Wildfire responses" : null);
  const none = new Map<string, Result>();
  const lines = (r: Runner | null, results = none, requesting = false) => sessionLines(r, H, results, titles, requesting);

  it("says nothing before the runner is read, or of a runner with no state", () => {
    expect(sessionLines(undefined, H, none, titles, false)).toEqual([]);
    expect(lines({ queue: [{ class_hash: H, package_key: K }] })).toEqual([]);
  });

  it("says there is no runner yet, and that queued work waits for one", () => {
    expect(lines(null)).toEqual(["No runner yet; one starts when you run a package."]);
    expect(lines(null, new Map([[K, { status: "queued", package: { identity: "x", version: "1", checksum: "c" } }]])))
      .toEqual(["No runner yet; one starts when you run a package.", WAITING]);
  });

  it("says the runner is starting, or ready", () => {
    expect(lines(runner({ state: "starting" }))).toEqual(["Starting a runner for your runs…"]);
    expect(lines(runner({ state: "ready" }))).toEqual(["Your runner is available."]);
  });

  it("names the package it runs for this class", () => {
    expect(lines(runner({ current_package: { class_hash: H, package_key: K } }))).toEqual(["Running Wildfire responses."]);
    expect(lines(runner({ current_package: { class_hash: H, package_key: "users__1__gone" } }))).toEqual(["Running users/1/gone."]);
    expect(lines(runner({ current_package: { class_hash: H, package_key: K } }), new Map([[K, result()]]))).toEqual(["Running Wildfire responses."]);
  });

  it("says it is moving on once the package it names has finished", () => {
    const current = runner({ current_package: { class_hash: H, package_key: K } });
    expect(lines(current, new Map([[K, result({ status: "done" })]]))).toEqual(["Your runner is starting its next package."]);
    expect(lines(current, new Map([[K, result({ status: "failed" })]]))).toEqual(["Your runner is starting its next package."]);
    expect(lines(current, new Map([[K, result({ status: "queued" })]]))).toEqual(["Your runner is starting its next package."]);
  });

  it("says nothing of a running session that names no package", () => {
    expect(lines(runner())).toEqual([]);
  });

  it("does not name a package of another class", () => {
    expect(lines(runner({ current_package: { class_hash: "other", package_key: K } }))).toEqual(["Running a package for another of your classes."]);
  });

  it("says the runner is idle, and when queued work will start", () => {
    expect(lines(runner({ state: "suspended", queue: [] }))).toEqual(["Your runner is idle; it starts when you run a package."]);
    expect(lines(runner({ state: "suspending", queue: [{ class_hash: "other", package_key: K }] })))
      .toEqual(["Your runner is idle; it starts when you run a package.", "Queued packages will start within a couple of minutes."]);
  });

  it("says the runner stopped, and how to start queued work", () => {
    const queued = new Map([[K, result({ status: "queued" })]]);
    expect(lines(runner({ state: "terminated" }))).toEqual(["Your runner has stopped."]);
    const finished = new Map([[K, result({ status: "done" })], ["users__1__x", result({ status: "running" })]]);
    expect(lines(runner({ state: "terminated" }), finished)).toEqual(["Your runner has stopped."]);
    expect(lines(runner({ state: "failed", error: "x" }), finished)).toEqual(["Your runner stopped with an error: x."]);
    expect(lines(runner({ state: "terminated" }), queued)).toEqual(["Your runner has stopped.", "Queued, waiting for a runner: run it to start one."]);
    expect(lines(runner({ state: "failed", error: "sync failed" }), queued))
      .toEqual(["Your runner stopped with an error: sync failed.", "Queued, waiting for a runner: run it to start one."]);
  });

  it("says a session failed, with or without a reason given", () => {
    expect(lines(runner({ state: "failed" }))).toEqual(["Your runner stopped with an error: no reason was given."]);
    expect(lines(runner({ state: "failed", error: "The sync did not verify." }))).toEqual(["Your runner stopped with an error: The sync did not verify."]);
  });

  it("does not ask for a run while one is being requested", () => {
    const queued = new Map([[K, result({ status: "queued" })]]);
    expect(lines(runner({ state: "terminated" }), queued, true)).toEqual(["Your runner has stopped."]);
    expect(lines(runner({ state: "failed", error: "x" }), queued, true)).toEqual(["Your runner stopped with an error: x."]);
  });
});
