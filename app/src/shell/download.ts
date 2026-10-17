const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// `<package>-<class>-<date>.md`, from the package identity's last segment, the class name and the
// local date the run finished; a part with nothing left after slugging is left out.
export function resultFileName(identity: string, classTitle: string, finishedAt: number | null): string {
  const date = finishedAt === null ? "" : new Date(finishedAt).toLocaleDateString("en-CA");
  return `${[slug(identity.split("/").pop() ?? ""), slug(classTitle), date].filter(Boolean).join("-") || "result"}.md`;
}

// A download made in the page from text it already holds, so nothing is fetched.
export function saveText(text: string, fileName: string, type = "text/markdown"): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
