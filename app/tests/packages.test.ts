// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { groupPackages, identityOfKey, matchesSearch, needsRefresh, packageKey, scopeUrls, titleOf } from "../src/shell/packages";
import { row, SCOPE, stamp } from "./fixtures";

const DAY = 24 * 3600 * 1000;

describe("needsRefresh", () => {
  const current = { assignment_fingerprint: "v1:abc", derived_at: stamp(10 * DAY) };

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
  it("puts each applicable row in the first group it qualifies for, in the order the page offers them", () => {
    const groups = groupPackages([
      row({ title: "Official one", official: true, visibility: "public", mine: true }),
      row({ title: "Project 20's", visibility: "project", project: { id: 20, name: "Wildfire" }, mine: true }),
      row({ title: "Mine", visibility: "private", mine: true }),
      row({ title: "A stranger's", visibility: "public" }),
      row({ title: "Another project's", visibility: "project", project: { id: 99, name: "Other" } }),
      row({ title: "Not applicable", official: true, applies: false })
    ], SCOPE);
    expect(groups.map((g) => [g.heading, titles(g.rows), g.rows.map(g.tag)])).toEqual([
      ["Official", ["Official one"], ["Official"]],
      ["Projects", ["Project 20's"], ["Project: Wildfire"]],
      ["Mine", ["Mine"], ["Mine"]],
      ["Community", ["A stranger's"], ["Community"]]
    ]);
  });

  it("puts every project of the class in one group by title, each tagged with its project, by id where no row names it", () => {
    const groups = groupPackages([
      row({ title: "B", visibility: "project", project: { id: 21, name: null } }),
      row({ title: "C", visibility: "project", project: { id: 20, name: null } }),
      row({ title: "A", visibility: "project", project: { id: 20, name: "Wildfire" } })
    ], SCOPE);
    expect(groups.map((g) => [g.key, titles(g.rows), g.rows.map(g.tag)])).toEqual([["projects", ["A", "B", "C"], ["Project: Wildfire", "Project 21", "Project: Wildfire"]]]);
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

const contract = JSON.parse(readFileSync(new URL("../../fixtures/package-contract.json", import.meta.url), "utf8")) as {
  identity: { value: string; valid: boolean }[];
  package_key: { identity: string; key: string }[];
};

describe("matchesSearch", () => {
  it("needs every word somewhere in the texts, ignoring case, and skips missing texts", () => {
    const texts = ["Wildfire model use", null, "official/wildfire-model-use", undefined];
    expect(matchesSearch("MODEL", texts)).toBe(true);
    expect(matchesSearch("  wildfire   official/ ", texts)).toBe(true);
    expect(matchesSearch("wildfire responses", texts)).toBe(false);
  });
});

describe("packageKey", () => {
  it("is the contract's key for each of its cases", () => {
    expect(contract.package_key.length).toBeGreaterThan(0);
    for (const { identity, key } of contract.package_key) expect(packageKey(identity)).toBe(key);
  });

  it("turns back into the identity for every valid identity", () => {
    const valid = contract.identity.filter((c) => c.valid).map((c) => c.value);
    expect(valid.length).toBeGreaterThan(0);
    for (const identity of valid) expect(identityOfKey(packageKey(identity))).toBe(identity);
  });
});
