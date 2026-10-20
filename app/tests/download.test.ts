import { describe, expect, it } from "vitest";
import { resultFileName, tableFileName } from "../src/shell/download";

const AT = new Date(2026, 9, 17, 23, 30).getTime();

describe("resultFileName", () => {
  it("joins the identity's last segment, the class and the local finish date", () => {
    expect(resultFileName("official/wildfire-responses", "Wildfire, period 2", AT)).toBe("wildfire-responses-wildfire-period-2-2026-10-17.md");
  });

  it("pads a single-digit month and day", () => {
    expect(resultFileName("official/x", "P", new Date(2026, 0, 5, 9).getTime())).toBe("x-p-2026-01-05.md");
  });

  it("leaves out the date when the run has no finish time", () => {
    expect(resultFileName("official/runner-smoke", "Period 2", null)).toBe("runner-smoke-period-2.md");
  });

  it("leaves out a part with nothing left after slugging", () => {
    expect(resultFileName("users/200/draft", "!!!", AT)).toBe("draft-2026-10-17.md");
  });

  it("names a file with no parts at all", () => {
    expect(resultFileName("", "", null)).toBe("result.md");
  });
});

describe("tableFileName", () => {
  it("names a table's CSV after the heading above it, else by its place among the result's tables", () => {
    expect(tableFileName("model-use-period-2", "Task 23: Not all wildfires behave the same way", 2))
      .toBe("model-use-period-2-task-23-not-all-wildfires-behave-the-same-way.csv");
    expect(tableFileName("model-use-period-2", null, 3)).toBe("model-use-period-2-table-3.csv");
    expect(tableFileName("model-use-period-2", "???", 1)).toBe("model-use-period-2-table-1.csv");
  });
});
