// @vitest-environment node
import { describe, expect, it } from "vitest";
import { runNews } from "../src/shell/announce";
import type { Result } from "../src/shell/runs";
import { stamp } from "./fixtures";

const pkg = { identity: "official/a", version: "1.0.0", checksum: "c" };
const at = (status: Result["status"], over: Partial<Result> = {}): Map<string, Result> => new Map([["a", { status, package: pkg, ...over }]]);
const news = (before: Map<string, Result> | null, after: Map<string, Result>) => runNews(before, after, () => "Package A");

describe("runNews", () => {
  it("says nothing on the first reading, or between stages of a run", () => {
    expect(news(null, at("running"))).toEqual([]);
    expect(news(at("running", { stage: "pull" }), at("running", { stage: "run_package" }))).toEqual([]);
    expect(news(new Map(), at("queued"))).toEqual([]);
  });

  it("names the package when a run starts, finishes with its summary, or fails with its error", () => {
    expect(news(at("queued"), at("running"))).toEqual(["Package A is running."]);
    expect(news(at("running"), at("done", { summary: "6 responses" }))).toEqual(["Package A finished: 6 responses."]);
    expect(news(at("running"), at("done"))).toEqual(["Package A finished: it wrote no summary."]);
    expect(news(at("running"), at("failed", { error: "boom" }))).toEqual(["Package A failed: boom."]);
  });

  it("says a new finish or failure that arrives with no running seen", () => {
    expect(news(at("done", { finished_at: stamp(1) }), at("done", { summary: "Again", finished_at: stamp(2) }))).toEqual(["Package A finished: Again."]);
    expect(news(at("failed", { finished_at: stamp(1) }), at("failed", { error: "x", finished_at: stamp(2) }))).toEqual(["Package A failed: x."]);
    expect(news(at("done", { finished_at: stamp(1) }), at("done", { finished_at: stamp(1) }))).toEqual([]);
  });
});
