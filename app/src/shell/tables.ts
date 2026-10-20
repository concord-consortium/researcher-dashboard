// A rendered result table's cell text, row by row, turned into what the page copies and downloads.

// A cell a spreadsheet would run as a formula gets a leading "'", which a spreadsheet hides and other
// tools keep as text; a negative number is left as it is.
const FORMULA = /^[=+@\t\r]|^-(?!\s*[\d.,]+%?$)/;
const inert = (cell: string) => (FORMULA.test(cell) ? `'${cell}` : cell);

const quoted = (cell: string) => (/[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell);

// RFC 4180, with a byte-order mark so a spreadsheet opens it as UTF-8, and formulas made inert.
export function toCsv(rows: string[][]): string {
  return `\uFEFF${rows.map((row) => row.map((cell) => quoted(inert(cell))).join(",")).join("\r\n")}\r\n`;
}

// Tab-separated, which a spreadsheet pastes into cells, with formulas made inert; a tab or line break in a
// cell becomes a space.
export function toTsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => inert(cell).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
}

const escaped = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// A plain table of the cells' text, its first `headerRows` rows as headers, which a document pastes
// as a table.
export function toHtml(rows: string[][], headerRows: number): string {
  const row = (cells: string[], tag: "th" | "td") => `<tr>${cells.map((c) => `<${tag}>${escaped(c)}</${tag}>`).join("")}</tr>`;
  return `<table>${rows.map((cells, i) => row(cells, i < headerRows ? "th" : "td")).join("")}</table>`;
}
