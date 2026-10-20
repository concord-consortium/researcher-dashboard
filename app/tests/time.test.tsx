import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Time } from "../src/components/Time";
import { elapsedText, formatTime, fullTime } from "../src/shell/runs";

afterEach(cleanup);

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime();
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const NOW = at(2026, 10, 17, 9, 30);

describe("formatTime", () => {
  it("says today or yesterday by the calendar day, not by the hours since", () => {
    expect(formatTime(at(2026, 10, 17, 0, 5), NOW)).toBe(`today, ${clock(at(2026, 10, 17, 0, 5))}`);
    expect(formatTime(at(2026, 10, 16, 23, 55), NOW)).toBe(`yesterday, ${clock(at(2026, 10, 16, 23, 55))}`);
    expect(formatTime(at(2026, 10, 16, 0, 1), NOW)).toBe(`yesterday, ${clock(at(2026, 10, 16, 0, 1))}`);
  });

  it("gives an older time's month and day, and its year only when it is not this one", () => {
    const thisYear = at(2026, 10, 14, 9, 12), lastYear = at(2025, 10, 14, 9, 12);
    expect(formatTime(thisYear, NOW)).toBe(`${new Date(thisYear).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${clock(thisYear)}`);
    expect(formatTime(lastYear, NOW)).toBe(
      `${new Date(lastYear).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}, ${clock(lastYear)}`);
    expect(formatTime(lastYear, NOW)).toMatch(/2025/);
    expect(formatTime(thisYear, NOW)).not.toMatch(/2026/);
  });
});

describe("Time", () => {
  it("shows the short form, capitalized where it starts a line, with the full time as its tooltip", () => {
    const ms = Date.now() - 60_000;
    render(<Time ms={ms} capitalized />);
    const time = screen.getByText(/^(Today|Yesterday), /);
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("title")).toBe(fullTime(ms));
    expect(time.getAttribute("dateTime")).toBe(new Date(ms).toISOString());
  });
});

describe("elapsedText", () => {
  it("gives minutes and seconds, and hours from an hour", () => {
    expect(elapsedText(0)).toBe("0:00");
    expect(elapsedText(84_999)).toBe("1:24");
    expect(elapsedText(10 * 60_000 + 5_000)).toBe("10:05");
    expect(elapsedText(3_600_000 + 2 * 60_000 + 3_000)).toBe("1:02:03");
  });

  it("reads 0:00 for a start ahead of this clock", () => {
    expect(elapsedText(-5_000)).toBe("0:00");
  });
});
