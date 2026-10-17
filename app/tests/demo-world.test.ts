// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { World, type WorldState } from "../demo/world";
import { SCENARIOS } from "../demo/scenarios";
import type { Result } from "../src/shell/runs";

afterEach(() => { vi.useRealTimers(); });

const STEP = 100;
const MODEL = "official__wildfire-model-use", RESPONSES = "official__wildfire-responses";

// A scenario's world, changed by `over` and watched the way the page watches it, with each result's
// latest status.
async function watched(key: string, over: (state: WorldState) => WorldState = (s) => s) {
  vi.useFakeTimers();
  const state = over(SCENARIOS.find((s) => s.key === key)!.world!(Date.now()));
  const services = new World(state, { stepMs: STEP, failNext: false, refuseNext: false }).services();
  let results = new Map<string, Result>();
  const watching = services.watchClass(state.scope, {
    profile: () => {}, runner: () => {}, counts: () => {}, activity: () => {}, refused: () => {},
    results: (r) => { results = r; }
  });
  await vi.advanceTimersByTimeAsync(200);
  await watching;
  return { services, status: (key: string) => results.get(key)?.status };
}

describe("the demo's runner", () => {
  it("finishes the run a scenario opens with, then its queue, with no Run pressed", async () => {
    const { status } = await watched("running");
    expect([status(MODEL), status(RESPONSES)]).toEqual(["running", "queued"]);
    await vi.advanceTimersByTimeAsync(20 * STEP);
    expect([status(MODEL), status(RESPONSES)]).toEqual(["done", "done"]);
  });

  it("says when it clears a knob it has used up", async () => {
    vi.useFakeTimers();
    const state = SCENARIOS.find((s) => s.key === "ready")!.world!(Date.now());
    const changed = vi.fn();
    const world = new World(state, { stepMs: STEP, failNext: true, refuseNext: true }, changed);
    const services = world.services();
    const refused = services.portal.runPackage("official/isolation-probe", "1.0.0").catch(() => "refused");
    await vi.advanceTimersByTimeAsync(400);
    expect(await refused).toBe("refused");
    expect([world.knobs.refuseNext, changed.mock.calls.length]).toEqual([false, 1]);
    const ran = services.portal.runPackage("official/isolation-probe", "1.0.0");
    await vi.advanceTimersByTimeAsync(20 * STEP);
    await ran;
    expect([world.knobs.failNext, changed.mock.calls.length]).toEqual([false, 2]);
  });

  it("leaves a run its machine paused until the package is requested again, then finishes it", async () => {
    const { services, status } = await watched("running", (s) => ({ ...s, runner: { ...s.runner!, state: "suspended", queue: [] } }));
    await vi.advanceTimersByTimeAsync(20 * STEP);
    expect(status(MODEL)).toBe("running");
    const request = services.portal.runPackage("official/wildfire-model-use", "1.2.0");
    await vi.advanceTimersByTimeAsync(20 * STEP);
    await request;
    expect(status(MODEL)).toBe("done");
  });
});
