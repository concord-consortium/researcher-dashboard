import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLUE_DATAFLOW } from "../demo/markdown";
import { REDACTED_HOST } from "../demo/redacted-links";
import { SCENARIOS } from "../demo/scenarios";
import { World } from "../demo/world";
import { ResultMarkdown } from "../src/components/ResultMarkdown";
import { isBehind, newestActivity } from "../src/shell/activity";
import { packageKey } from "../src/shell/packages";
import type { Counts, Result } from "../src/shell/runs";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const STEP = 100;
const CLUE = "official/clue-dataflow-systematicity", KEY = packageKey(CLUE);
// As the package's manifest.json gives them.
const TITLE = "CLUE Dataflow: trial and error vs. systematicity";
const DESCRIPTION = "For one CLUE class, the Dataflow study's detection of trial-and-error and systematic editing: each stage's summary, every episode, and sampled episodes described cycle by cycle with links that open CLUE at them.";
const links = [...CLUE_DATAFLOW.matchAll(/\]\((https?:[^)\s]+)\)/g)].map((m) => new URL(m[1]));
const clue = () => SCENARIOS.find((s) => s.key === "clue")!.world!(Date.now());

describe("the demo's CLUE class", () => {
  it("points every replay link at the redacted host", () => {
    expect(links).toHaveLength(46);
    expect(links.filter((url) => url.hostname !== REDACTED_HOST)).toEqual([]);
    expect(CLUE_DATAFLOW).not.toContain("collaborative-learning.concord.org");
  });

  it("keeps every redacted link through the renderer", () => {
    const { container } = render(<ResultMarkdown markdown={CLUE_DATAFLOW} />);
    const anchors = [...container.querySelectorAll("a")];
    expect(anchors).toHaveLength(46);
    expect(anchors.filter((a) => new URL(a.href).hostname !== REDACTED_HOST)).toEqual([]);
  });

  it("lists the CLUE Dataflow analysis alone", () => {
    const state = clue();
    expect(state.rows.map((r) => [r.identity, r.official, r.visibility, r.applies, r.runnable, r.current_version.version, r.current_version.title, r.current_version.description, r.project]))
      .toEqual([[CLUE, true, "public", true, true, "1.0.0", TITLE, DESCRIPTION, { id: 22, name: "CLUE Demo Project" }]]);
    expect(state.scope.project_ids).toEqual([22]);
    expect(CLUE_DATAFLOW.split("\n")[0]).toBe(`# ${TITLE}`);
  });

  it("opens settled, with no save after the run began", () => {
    const state = clue();
    expect(state.activity.size).toBeGreaterThan(0);
    expect(isBehind(state.results.get(KEY), newestActivity(state.activity))).toBe(false);
  });

  it("counts the page's log events", () => {
    const logs = Number(/^log events: (\d+) rows/m.exec(CLUE_DATAFLOW)![1]);
    expect(clue().counts?.data?.logs).toBe(logs);
  });

  it("opens finished, with the page's first totals line as its summary", () => {
    const result = clue().results.get(KEY)!;
    expect(result.status).toBe("done");
    expect(result.display).toBe(CLUE_DATAFLOW);
    expect(result.summary).toBe(CLUE_DATAFLOW.split("```\n")[1].split("\n")[0]);
  });

  it("lands the same page again when run, with its counts still the page's", async () => {
    vi.useFakeTimers();
    const state = clue();
    const services = new World(state, { stepMs: STEP, failNext: false, refuseNext: false }).services();
    let results = new Map<string, Result>();
    let counts: Counts | null = null;
    const watching = services.watchClass(state.scope, {
      profile: () => {}, runner: () => {}, activity: () => {}, refused: () => {},
      counts: (c) => { counts = c; }, results: (r) => { results = r; }
    });
    await vi.advanceTimersByTimeAsync(200);
    await watching;
    const ran = services.portal.runPackage(CLUE, "1.0.0");
    await vi.advanceTimersByTimeAsync(4 * STEP);
    expect(results.get(KEY)?.status).toBe("running");
    await vi.advanceTimersByTimeAsync(20 * STEP);
    await ran;
    const result = results.get(KEY)!;
    expect([result.status, result.display, result.summary]).toEqual(["done", CLUE_DATAFLOW, "episodes: 23 (6 systematic, 17 trial-and-error)"]);
    expect(result.started_at).not.toBe(clue().results.get(KEY)!.started_at);
    expect([counts!.data?.answers, counts!.data?.logs]).toEqual([0, 262802]);
  });

  it("sits before the info pages, in a class of its own", () => {
    expect(SCENARIOS.map((s) => s.key).slice(-3)).toEqual(["clue", "info", "withdrawn"]);
    const others = SCENARIOS.filter((s) => s.world && s.key !== "clue").map((s) => s.world!(Date.now()).scope);
    expect(others.length).toBeGreaterThan(0);
    const { id, class_hash, name } = clue().scope;
    expect(others.filter((o) => o.id === id || o.class_hash === class_hash || o.name === name)).toEqual([]);
  });

  it("leaves the Wildfire scenarios' catalog as it was", () => {
    const wildfire = SCENARIOS.filter((s) => s.world && s.key !== "clue");
    expect(wildfire.map((s) => s.key)).toEqual(["ready", "running", "failed", "long", "quiet", "first", "edge", "withdrawn"]);
    for (const s of wildfire) {
      expect(s.world!(Date.now()).rows.map((r) => [r.identity, r.catalog_id])).toEqual([
        ["official/wildfire-responses", 1], ["projects/20/activity-model-use", 2],
        ["users/200/explanation-keywords", 3], ["users/402/time-on-task", 4]
      ]);
    }
  });
});
