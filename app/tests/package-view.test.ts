// @vitest-environment node
import { describe, expect, it } from "vitest";
import { olderResult } from "../src/components/PackageView";
import { formatTime } from "../src/shell/runs";
import { stamp, statusModel } from "./fixtures";

const model = statusModel;
const finished = { package: { identity: "x", version: "1.0.0", checksum: "c" }, finished_at: stamp(1000) };
const earlier = `This result is from an earlier run, finished ${formatTime(1000)}.`;

describe("olderResult", () => {
  it.each([
    ["a request in flight", model({ pending: true, state: { kind: "done", summary: null, finishedAt: 1000 } }), "A new run is being requested."],
    ["a queued run nothing will take", model({ state: { kind: "queued", position: null, waiting: true } }), "A new run is waiting for a runner."],
    ["a queued run", model({ state: { kind: "queued", position: 2, waiting: false } }), "A new run is queued."],
    ["a running run", model({ state: { kind: "running", stage: "run_package" } }), "A new run is in progress."],
    ["a paused run", model({ state: { kind: "stuck", resumable: true } }), "A new run is paused partway through."],
    ["an interrupted run", model({ state: { kind: "stuck", resumable: false } }), "A new run was interrupted."]
  ] as const)("warns over the earlier result during %s, with when it finished", (_name, m, newer) => {
    expect(olderResult(m, finished)).toBe(`${earlier} ${newer}`);
  });

  it("says nothing with no result, for the result that is current, or over a failed re-run's own error", () => {
    expect(olderResult(model({ state: { kind: "running", stage: "run_package" } }), null)).toBeNull();
    expect(olderResult(model({ state: { kind: "done", summary: null, finishedAt: 1000 } }), finished)).toBeNull();
    expect(olderResult(model({ state: { kind: "failed", error: "x", finishedAt: 2000 }, finished }), finished)).toBeNull();
  });

  it("leaves out the time a result has none for", () => {
    expect(olderResult(model({ state: { kind: "running", stage: "run_package" } }), { ...finished, finished_at: undefined }))
      .toBe("This result is from an earlier run. A new run is in progress.");
  });
});
