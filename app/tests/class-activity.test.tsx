import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveCount, ClassActivity, RERUNS, type Stopped } from "../src/components/ClassActivity";
import type { Activity } from "../src/shell/activity";
import { formatTime } from "../src/shell/runs";
import { stamp } from "./fixtures";

const MIN = 60_000;
const START = 1000 * MIN;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(START); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const docs = (...times: number[]) => new Map<string, Activity>(times.map((t, i) => [`u${i}`, { lastActivityAt: stamp(t) }]));

function show(over: { activity?: Map<string, Activity>; problem?: string | null; stopped?: Stopped | null } = {}) {
  render(<ClassActivity activity={"activity" in over ? over.activity : docs()} problem={over.problem ?? null}
    stopped={over.stopped ?? null} />);
}

function showCount(activity: Map<string, Activity> | undefined) {
  render(<ActiveCount activity={activity} now={() => Date.now()} />);
}

// The value Student Saves gives for `label`, or null when it gives none.
const fact = (label: string) =>
  [...document.querySelectorAll(".facts dt")].find((dt) => dt.textContent === label)?.nextElementSibling?.textContent ?? null;

const count = () => document.querySelector(".active-count")?.getAttribute("title") ?? null;

describe("ActiveCount", () => {
  it("counts the learners in the window, outside any live region", () => {
    showCount(docs(START - MIN, START - 2 * MIN, START - 6 * MIN));
    expect(count()).toBe("2 students active in the last 5 minutes");
    expect(document.querySelector(".active-count .badge-info")!.textContent).toBe("2 active");
    expect(document.querySelector(".active-count .visually-hidden")!.textContent).toBe("2 students active in the last 5 minutes");
    expect(document.querySelector(".active-count")!.closest('[aria-live], [role="status"]')).toBeNull();
  });

  it("says one student in the singular", () => {
    showCount(docs(START - MIN));
    expect(count()).toBe("1 student active in the last 5 minutes");
  });

  it("shows nothing before the first snapshot", () => {
    showCount(undefined);
    expect(count()).toBeNull();
  });

  it("falls as each learner leaves the window, with no new snapshot", () => {
    showCount(docs(START - 4 * MIN, START - 2 * MIN));
    expect(count()).toMatch(/^2 students/);
    act(() => { vi.advanceTimersByTime(MIN + 1); });
    expect(count()).toMatch(/^1 student /);
    act(() => { vi.advanceTimersByTime(2 * MIN); });
    expect(count()).toMatch(/^0 students/);
  });

  it("waits rather than re-rendering at once for a save far ahead of the laptop's clock", () => {
    let renders = 0;
    const now = () => { renders += 1; return Date.now(); };
    render(<ActiveCount activity={docs(START + 30 * 24 * 60 * MIN)} now={now} />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(renders).toBe(1);
  });
});

describe("ClassActivity", () => {
  it("says how many students have saved work and when the latest save was", () => {
    show({ activity: docs(START - 2 * MIN, START - MIN) });
    expect(fact("Students who have saved work")).toBe("2");
    expect(fact("Latest save")).toBe(formatTime(START - MIN).replace(/^./, (c) => c.toUpperCase()));
  });

  it("says the latest save is unknown when no document has a readable time", () => {
    show({ activity: new Map<string, Activity>([["u0", {}]]) });
    expect(fact("Students who have saved work")).toBe("1");
    expect(fact("Latest save")).toBe("unknown");
  });

  it("shows neither line with no documents", () => {
    show({ activity: new Map() });
    expect(fact("Students who have saved work")).toBeNull();
    expect(fact("Latest save")).toBeNull();
  });

  it("says what the count means under its heading", () => {
    show({ activity: docs(START - MIN) });
    expect(screen.getByRole("heading", { level: 2, name: "Student Saves" })).toBeDefined();
    expect(screen.getByText(/how many students saved an answer/).textContent).toMatch(/in the last 5 minutes\.$/);
    expect(screen.getByText(/not a count of who is logged in/).textContent).toMatch(/same for every researcher of this class/);
    expect(screen.getByText(RERUNS)).toBeDefined();
    expect(count()).toBeNull();
  });

  it("shows the refusal and no explanation", () => {
    show({ activity: undefined, problem: "Class activity could not be read." });
    expect(screen.getByText("Class activity could not be read.").closest("[aria-live]")).not.toBeNull();
    expect(screen.queryByText(/how many students saved an answer/)).toBeNull();
  });

  it("shows only the heading before the first snapshot", () => {
    show({ activity: undefined });
    expect(screen.queryByText(/how many students saved an answer/)).toBeNull();
    expect(screen.queryByText(/re-run on their own/)).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("says automatic re-runs have stopped, as a status, in place of the re-run line", () => {
    show({ activity: docs(START - MIN), stopped: "expired" });
    expect(screen.getByRole("status").textContent)
      .toBe("Automatic re-runs have stopped because your sign-in has expired. Run any analysis to sign in again.");
    expect(screen.queryByText(/re-run on their own/)).toBeNull();
  });

  it("says a sign-in that could not be renewed needs a new launch from the portal", () => {
    show({ activity: docs(START - MIN), stopped: "not-renewed" });
    expect(screen.getByRole("status").textContent)
      .toBe("Automatic re-runs have stopped because your sign-in could not be renewed. Launch the dashboard again from the portal.");
  });
});
