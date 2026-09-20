import { describe, expect, it } from "vitest";
import {
  describe as describeStatus, isBusy, isUnresponsive, minutesRemaining,
  UNRESPONSIVE_AFTER_MS, type ResearcherStatus
} from "../src/shell/status";

const NOW = Date.parse("2026-09-20T16:00:00Z");

function status(overrides: Partial<ResearcherStatus> = {}): ResearcherStatus {
  return { state: "ready", updated_at: new Date(NOW).toISOString(), ...overrides };
}

describe("isUnresponsive", () => {
  it("is true for a run that has stopped writing", () => {
    const stale = new Date(NOW - UNRESPONSIVE_AFTER_MS - 1000).toISOString();
    expect(isUnresponsive(status({ state: "running", updated_at: stale }), NOW)).toBe(true);
  });

  it("is false for a run that wrote recently", () => {
    const recent = new Date(NOW - 20_000).toISOString();
    expect(isUnresponsive(status({ state: "running", updated_at: recent }), NOW)).toBe(false);
  });

  // The CLUE read is the longest silent step, about 16 seconds on the fixture class, so the
  // window has to clear it comfortably or every real analysis looks dead halfway through.
  it("leaves room for the slowest silent step", () => {
    const midRead = new Date(NOW - 30_000).toISOString();
    expect(isUnresponsive(status({ state: "running", updated_at: midRead }), NOW)).toBe(false);
  });

  // A suspended VM stops writing because that is what suspending means. Offering to
  // relaunch it would be noise on the normal path.
  it("is false for a suspended session however old", () => {
    const ancient = new Date(NOW - 8 * 60 * 60 * 1000).toISOString();
    expect(isUnresponsive(status({ state: "suspended", updated_at: ancient }), NOW)).toBe(false);
  });

  it("is false when there is no status at all", () => {
    expect(isUnresponsive(null, NOW)).toBe(false);
  });

  it("is false when the document carries no usable timestamp", () => {
    expect(isUnresponsive(status({ state: "running", updated_at: null }), NOW)).toBe(false);
    expect(isUnresponsive(status({ state: "running", updated_at: "not a date" }), NOW)).toBe(false);
  });
});

describe("minutesRemaining", () => {
  it("counts whole minutes to the session's expiry", () => {
    const expires = new Date(NOW + 90 * 60 * 1000).toISOString();
    expect(minutesRemaining(status({ expires_at: expires }), NOW)).toBe(90);
  });

  // Floored, so the page never offers a minute the researcher does not have.
  it("rounds down rather than up", () => {
    const expires = new Date(NOW + 119_000).toISOString();
    expect(minutesRemaining(status({ expires_at: expires }), NOW)).toBe(1);
  });

  it("never goes negative once the session has expired", () => {
    const expires = new Date(NOW - 60_000).toISOString();
    expect(minutesRemaining(status({ expires_at: expires }), NOW)).toBe(0);
  });

  it("is null when the document does not say" , () => {
    expect(minutesRemaining(status(), NOW)).toBeNull();
    expect(minutesRemaining(null, NOW)).toBeNull();
  });
});

describe("isBusy", () => {
  it("is true while a package is running, which the runner answers 409 to", () => {
    expect(isBusy(status({ state: "running" }))).toBe(true);
  });

  it("is false in every other state", () => {
    for (const state of ["ready", "suspended", "starting", "failed", "terminated"] as const) {
      expect(isBusy(status({ state }))).toBe(false);
    }
  });
});

describe("describe", () => {
  it("says there is no session before one exists" , () => {
    expect(describeStatus(null, NOW)).toMatch(/No session yet/);
  });

  it("names the package that is running", () => {
    const text = describeStatus(status({ state: "running", current_package: "class-counts" }), NOW);
    expect(text).toContain("class-counts");
  });

  it("reports the time left in the session" , () => {
    const expires = new Date(NOW + 45 * 60 * 1000).toISOString();
    expect(describeStatus(status({ state: "ready", expires_at: expires }), NOW)).toContain("45 minutes");
  });

  // Unresponsive has to win: a stale `running` document would otherwise say it is running
  // an analysis that stopped existing minutes ago.
  it("says a stalled session has stopped rather than that it is running", () => {
    const stale = new Date(NOW - UNRESPONSIVE_AFTER_MS - 1000).toISOString();
    const text = describeStatus(status({ state: "running", updated_at: stale }), NOW);
    expect(text).toMatch(/stopped responding/);
  });

  it("has something to say for every state the runner writes", () => {
    for (const state of
      ["starting", "ready", "running", "suspending", "suspended", "terminated", "failed"] as const) {
      expect(describeStatus(status({ state }), NOW)).toBeTruthy();
    }
  });
});
