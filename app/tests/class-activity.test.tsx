import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassActivity, type Stopped } from "../src/components/ClassActivity";
import type { Activity } from "../src/shell/activity";
import { stamp } from "./fixtures";

const MIN = 60_000;
const START = 1000 * MIN;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(START); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const docs = (...times: number[]) => new Map<string, Activity>(times.map((t, i) => [`u${i}`, { lastActivityAt: stamp(t) }]));

function show(over: { activity?: Map<string, Activity>; problem?: string | null; stopped?: Stopped | null } = {}) {
  render(<ClassActivity activity={"activity" in over ? over.activity : docs()} problem={over.problem ?? null}
    stopped={over.stopped ?? null} now={() => Date.now()} />);
}

const count = () => document.querySelector(".active-count")?.textContent ?? null;

describe("ClassActivity", () => {
  it("counts the learners in the window under its heading, with what the number means", () => {
    show({ activity: docs(START - MIN, START - 2 * MIN) });
    expect(screen.getByRole("heading", { level: 2, name: "Class activity" })).toBeDefined();
    expect(count()).toBe("2 students active in the last 5 minutes");
    expect(document.querySelector(".active-count")!.closest('[aria-live], [role="status"]')).toBeNull();
    expect(screen.getByText(/Counts students who saved an answer/).textContent).toMatch(/same for every researcher of this class/);
    expect(screen.getByText("Your finished packages re-run on their own as soon as students save new work.")).toBeDefined();
  });

  it("says one student in the singular", () => {
    show({ activity: docs(START - MIN) });
    expect(count()).toBe("1 student active in the last 5 minutes");
  });

  it("falls as each learner leaves the window, with no new snapshot", () => {
    show({ activity: docs(START - 4 * MIN, START - 2 * MIN) });
    expect(count()).toMatch(/^2 students/);
    act(() => { vi.advanceTimersByTime(MIN + 1); });
    expect(count()).toMatch(/^1 student /);
    act(() => { vi.advanceTimersByTime(2 * MIN); });
    expect(count()).toMatch(/^0 students/);
  });

  it("shows the refusal and no count", () => {
    show({ activity: undefined, problem: "Class activity could not be read." });
    expect(screen.getByText("Class activity could not be read.").closest("[aria-live]")).not.toBeNull();
    expect(count()).toBeNull();
  });

  it("shows only the heading before the first snapshot", () => {
    show({ activity: undefined });
    expect(count()).toBeNull();
    expect(screen.queryByText(/re-run on their own/)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("says automatic re-runs have stopped, as a status, in place of the re-run line", () => {
    show({ activity: docs(START - MIN), stopped: "expired" });
    expect(screen.getByRole("status").textContent)
      .toBe("Automatic re-runs have stopped because your sign-in has expired. Run any package to sign in again.");
    expect(screen.queryByText(/re-run on their own/)).toBeNull();
  });

  it("waits rather than re-rendering at once for a save far ahead of the laptop's clock", () => {
    let renders = 0;
    const now = () => { renders += 1; return Date.now(); };
    render(<ClassActivity activity={docs(START + 30 * 24 * 60 * MIN)} problem={null} stopped={null} now={now} />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(renders).toBe(1);
  });

  it("says a sign-in that could not be renewed needs a new launch from the portal", () => {
    show({ activity: docs(START - MIN), stopped: "not-renewed" });
    expect(screen.getByRole("status").textContent)
      .toBe("Automatic re-runs have stopped because your sign-in could not be renewed. Launch the dashboard again from the portal.");
  });
});
