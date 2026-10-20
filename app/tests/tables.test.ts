// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toCsv, toHtml, toTsv } from "../src/shell/tables";

const ROWS = [["Level", "Pattern, in words", "Students"], ["1", 'Said "no"', "0 of 14 (0%)"], ["2", "Two\nlines", "3\tof 14"]];

describe("result table exports", () => {
  it("writes RFC 4180 CSV behind a byte-order mark, quoting only the cells that need it", () => {
    expect(toCsv(ROWS)).toBe('\uFEFFLevel,"Pattern, in words",Students\r\n1,"Said ""no""",0 of 14 (0%)\r\n2,"Two\nlines",3\tof 14\r\n');
  });

  it("writes tab-separated rows with a cell's tabs and line breaks as spaces", () => {
    expect(toTsv(ROWS)).toBe('Level\tPattern, in words\tStudents\n1\tSaid "no"\t0 of 14 (0%)\n2\tTwo lines\t3 of 14');
  });

  it("starts a cell a spreadsheet would run as a formula with a quote, in the CSV, the tab-separated copy and the HTML copy, and leaves numbers and text alone", () => {
    const rows = [["=1+1", "+1", "@SUM(A1)", "-cmd", "\tx"], ["-5", "-0.25", "-12%", "- 3", "a = b"]];
    expect(toCsv(rows)).toBe("\uFEFF'=1+1,'+1,'@SUM(A1),'-cmd,'\tx\r\n-5,-0.25,-12%,- 3,a = b\r\n");
    expect(toTsv(rows)).toBe("'=1+1\t'+1\t'@SUM(A1)\t'-cmd\t' x\n-5\t-0.25\t-12%\t- 3\ta = b");
    expect(toHtml([["=1+1", "-5"]], 0)).toBe("<table><tr><td>'=1+1</td><td>-5</td></tr></table>");
  });

  it("writes a plain HTML table, its header rows as th, with the text escaped", () => {
    expect(toHtml([["A & B"], ["<b>x</b>"]], 1)).toBe("<table><tr><th>A &amp; B</th></tr><tr><td>&lt;b&gt;x&lt;/b&gt;</td></tr></table>");
    expect(toHtml([["x"]], 0)).toBe("<table><tr><td>x</td></tr></table>");
  });
});
