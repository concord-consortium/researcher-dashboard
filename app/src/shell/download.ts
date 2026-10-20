const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// `<package>-<class>-<date>`, from the package identity's last segment, the class name and the local
// date the run finished; a part with nothing left after slugging is left out.
// The local date as YYYY-MM-DD, built from its parts rather than a locale's date format.
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function resultFileBase(identity: string, classTitle: string, finishedAt: number | null): string {
  const date = finishedAt === null ? "" : localDate(new Date(finishedAt));
  return [slug(identity.split("/").pop() ?? ""), slug(classTitle), date].filter(Boolean).join("-") || "result";
}

export const resultFileName = (identity: string, classTitle: string, finishedAt: number | null) =>
  `${resultFileBase(identity, classTitle, finishedAt)}.md`;

// A result table's CSV, named after the heading above it, else by its place among the result's tables.
export const tableFileName = (base: string, heading: string | null, index: number) =>
  `${base}-${slug(heading ?? "") || `table-${index}`}.csv`;

// A download made in the page from text it already holds, so nothing is fetched.
export function saveText(text: string, fileName: string, type = "text/markdown"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
