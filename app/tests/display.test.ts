import { describe, expect, it } from "vitest";
import { isTable, parseDisplay, type TableSection } from "../src/shell/display";

// The shape class-counts actually writes, so this test fails if either side drifts.
const REAL = {
  version: 1,
  summary: "22 CLUE documents, 27135 history entries, 5 answers from 2 learners, 194 log rows",
  sections: [
    {
      title: "Counts",
      table: {
        columns: ["What", "Count"],
        rows: [{ cells: ["CLUE documents", "22"] }, { cells: ["Log rows", "194"] }]
      }
    },
    { title: "Freshness", markdown: "The log rows include events up to 2024-10-23T05:31:26Z." }
  ]
};

describe("parseDisplay", () => {
  it("reads what class-counts writes", () => {
    const display = parseDisplay(REAL)!;
    expect(display.summary).toContain("27135 history entries");
    expect(display.sections).toHaveLength(2);

    const counts = display.sections[0] as TableSection;
    expect(isTable(counts)).toBe(true);
    expect(counts.table.columns).toEqual(["What", "Count"]);
    expect(counts.table.rows[1]).toEqual(["Log rows", "194"]);
  });

  it("reads a row's cells, not the row itself", () => {
    const display = parseDisplay({
      sections: [{ title: "t", table: { columns: ["a"], rows: [{ cells: ["x"] }] } }]
    })!;
    expect((display.sections[0] as TableSection).table.rows).toEqual([["x"]]);
  });

  // Numbers are the common case in a counts table and must not render as blanks.
  it("renders a numeric cell as its number", () => {
    const display = parseDisplay({
      sections: [{ title: "t", table: { columns: ["a"], rows: [{ cells: [22] }] } }]
    })!;
    expect((display.sections[0] as TableSection).table.rows).toEqual([["22"]]);
  });

  describe("given something the contract does not describe", () => {
    // This document is written by a fetched package, so the app has to survive whatever
    // arrives rather than assume the shape it asked for.
    it("drops a section carrying neither markdown nor a table", () => {
      const display = parseDisplay({ sections: [{ title: "empty" }, { title: "ok", markdown: "x" }] })!;
      expect(display.sections).toHaveLength(1);
      expect(display.sections[0].title).toBe("ok");
    });

    it("drops a table whose rows are not objects with cells", () => {
      const display = parseDisplay({
        sections: [{ title: "t", table: { columns: ["a"], rows: [["bare", "list"]] } }]
      })!;
      expect((display.sections[0] as TableSection).table.rows).toEqual([[]]);
    });

    it("survives an object cell rather than printing its type name", () => {
      const display = parseDisplay({
        sections: [{ title: "t", table: { columns: ["a"], rows: [{ cells: [{ nope: 1 }] }] } }]
      })!;
      expect((display.sections[0] as TableSection).table.rows).toEqual([[""]]);
    });

    it("returns no sections rather than failing when sections is missing", () => {
      expect(parseDisplay({ summary: "s" })!.sections).toEqual([]);
    });

    it("returns null for something that is not a document at all", () => {
      expect(parseDisplay(null)).toBeNull();
      expect(parseDisplay("a string")).toBeNull();
    });
  });
});
