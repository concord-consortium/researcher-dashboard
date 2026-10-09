import { describe, expect, it } from "vitest";
import { groupPackages, needsRefresh, scopeUrls, titleOf } from "../src/shell/packages";
import { row, SCOPE } from "./fixtures";

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

describe("scopeUrls", () => {
  it("is the assignment URLs then the interactive URLs, as stored", () => {
    expect(scopeUrls({ assignment_urls: ["a", "x"], interactive_urls: ["x", "b"] })).toEqual(["a", "x", "x", "b"]);
    expect(scopeUrls({})).toEqual([]);
  });
});

const titles = (rows: { current_version: { title: string | null } }[]) => rows.map((r) => r.current_version.title);

describe("groupPackages", () => {
  it("puts each applicable row in the first group it qualifies for", () => {
    const groups = groupPackages([
      row({ title: "Official one", official: true, visibility: "public", mine: true }),
      row({ title: "Project 20's", visibility: "project", project: { id: 20, name: "Wildfire" }, mine: true }),
      row({ title: "Mine", visibility: "private", mine: true }),
      row({ title: "A stranger's", visibility: "public" }),
      row({ title: "Another project's", visibility: "project", project: { id: 99, name: "Other" } }),
      row({ title: "Not applicable", official: true, applies: false })
    ], SCOPE);
    expect(groups.map((g) => [g.heading, titles(g.rows), g.collapsed])).toEqual([
      ["Official", ["Official one"], false],
      ["Wildfire", ["Project 20's"], false],
      ["Mine", ["Mine"], false],
      ["Community", ["A stranger's"], true]
    ]);
  });

  it("names a project report-server could not name by its id, in the scope's order", () => {
    const groups = groupPackages([
      row({ visibility: "project", project: { id: 21, name: null } }),
      row({ visibility: "project", project: { id: 20, name: "Wildfire" } })
    ], SCOPE);
    expect(groups.map((g) => g.heading)).toEqual(["Wildfire", "Project 21"]);
  });

  // Titles a case-sensitive comparison would order the other way round.
  it("orders by title ignoring case", () => {
    const groups = groupPackages([row({ title: "Banana", mine: true }), row({ title: "apple", mine: true })], SCOPE);
    expect(titles(groups[0].rows)).toEqual(["apple", "Banana"]);
  });

  it("falls back to the name when a version has no title, and drops empty groups", () => {
    const groups = groupPackages([row({ name: "named", title: "", mine: true })], SCOPE);
    expect(groups.map((g) => g.heading)).toEqual(["Mine"]);
    expect(titleOf(groups[0].rows[0])).toBe("named");
  });
});
