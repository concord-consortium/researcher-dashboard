import { describe, expect, it } from "vitest";
import { needsRefresh } from "../src/shell/packages";
import { SCOPE } from "./fixtures";

const DAY = 24 * 3600 * 1000;
const at = (ms: number) => ({ toMillis: () => ms });

describe("needsRefresh", () => {
  const current = { assignment_fingerprint: "v1:abc", derived_at: at(10 * DAY) };

  it("refreshes a missing, changed, undated or old profile", () => {
    expect(needsRefresh(null, SCOPE, 10 * DAY, DAY)).toBe(true);
    expect(needsRefresh({ ...current, assignment_fingerprint: "v1:other" }, SCOPE, 10 * DAY, DAY)).toBe(true);
    expect(needsRefresh({ ...current, derived_at: null }, SCOPE, 10 * DAY, DAY)).toBe(true);
    expect(needsRefresh(current, SCOPE, 11 * DAY + 1, DAY)).toBe(true);
  });

  it("leaves a current profile alone", () => {
    expect(needsRefresh(current, SCOPE, 11 * DAY, DAY)).toBe(false);
  });
});
