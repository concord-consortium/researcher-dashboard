// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toCsv, toHtml, toTsv } from "../src/shell/tables";

const ROWS = [["Level", "Pattern, in words", "Students"], ["1", 'Said "no"', "0 of 14 (0%)"], ["2", "Two\nlines", "3\tof 14"]];

describe("result table exports", () => {
  it("writes RFC 4180 CSV behind a byte-order mark, quoting only the cells that need it", () => {
    expect(toCsv(ROWS)).toBe('﻿Level,"Pattern, in words",Students\r\n1,"Said ""no""",0 of 14 (0%)\r\n2,"Two\nlines",3\tof 14\r\n');
  });

  it("writes tab-separated rows with a cell's tabs and line breaks as spaces", () => {
    expect(toTsv(ROWS)).toBe('Level\tPattern, in words\tStudents\n1\tSaid "no"\t0 of 14 (0%)\n2\tTwo lines\t3 of 14');
  });

  it("writes a plain HTML table, its header rows as th, with the text escaped", () => {
    expect(toHtml([["A & B"], ["<b>x</b>"]], 1)).toBe("<table><tr><th>A &amp; B</th></tr><tr><td>&lt;b&gt;x&lt;/b&gt;</td></tr></table>");
    expect(toHtml([["x"]], 0)).toBe("<table><tr><td>x</td></tr></table>");
  });
});
