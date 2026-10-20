import Markdown, { type Components, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { type Options as SanitizeSchema } from "rehype-sanitize";
import { ArrowDownTrayIcon } from "@heroicons/react/16/solid";
import { createContext, memo, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { saveText, tableFileName } from "../shell/download";
import { toCsv, toHtml, toTsv } from "../shell/tables";
import { CopyButton } from "./CopyButton";
import type { Processor } from "unified";

// A result is markdown written by fetched code, shown on a page holding the researcher's bearer
// and a Firebase session for student data. HTML in it is never recognized as HTML: micromark's
// HTML constructs are switched off, so a tag is text before anything else sees it.
function noHtml(this: Processor) {
  const data = this.data() as { micromarkExtensions?: unknown[] };
  (data.micromarkExtensions ??= []).push({ disable: { null: ["htmlFlow", "htmlText"] } });
}

// GFM's footnotes are left out of what a result can use, so "[^1]" stays text.
function noFootnotes(this: Processor) {
  const data = this.data() as { micromarkExtensions?: unknown[] };
  (data.micromarkExtensions ??= []).push({
    disable: { null: ["gfmFootnoteDefinition", "gfmFootnoteCall", "gfmPotentialFootnoteCall"] }
  });
}

const LINK = /^(https?:|mailto:)/i;
// A data: image makes no request. SVG is left out as a precaution: it can carry script, though a
// browser runs none of it in an <img>.
const IMAGE = /^data:image\/(png|jpeg|gif|webp)[;,]/i;

export const keepUrl: UrlTransform = (url, _key, node) =>
  node.tagName === "img" ? (IMAGE.test(url) ? url : "") : LINK.test(url) ? url : "";

// Behind the transform, not instead of it: only what CommonMark and GFM's tables, strikethrough
// and task lists produce. Not built on GitHub's default schema, which also allows <picture> and
// <source srcset>, a remote load with no protocol check, should HTML ever reach the tree.
export const SCHEMA: SanitizeSchema = {
  strip: ["script"],
  clobberPrefix: "user-content-",
  clobber: ["name", "id"],
  tagNames: ["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "pre", "code", "em",
    "strong", "a", "img", "hr", "br", "table", "thead", "tbody", "tr", "th", "td", "del", "input"],
  attributes: {
    a: ["href", "title"], img: ["src", "alt", "title"], th: ["align"], td: ["align"], ol: ["start"],
    input: [["type", "checkbox"], ["disabled", true], "checked"]
  },
  required: { input: { type: "checkbox", disabled: true } },
  protocols: { href: ["http", "https", "mailto"], src: ["data"] }
};

// The open package's title is an h2, so a package's "#" is an h3.
const HEADINGS = ["h3", "h4", "h5", "h6", "h6", "h6"] as const;

// The file name a result's table downloads under starts with the result's.
const FileBase = createContext("result");

// The heading a table sits under: the nearest h3 to h6 before it among the result's blocks.
function headingBefore(block: Element): string | null {
  for (let el = block.previousElementSibling; el; el = el.previousElementSibling) {
    if (/^H[3-6]$/.test(el.tagName)) return el.textContent;
  }
  return null;
}

// A table, with Copy table and Download CSV under it. Both read the cells' text as rendered. The table
// and its buttons are named after the heading above it, looked up after each render, since a new result
// can reuse the table in place.
function ResultTable({ children }: { children?: ReactNode }) {
  const table = useRef<HTMLTableElement>(null);
  const base = useContext(FileBase);
  const [heading, setHeading] = useState<string | null>(null);
  useLayoutEffect(() => {
    const found = headingBefore(table.current!.parentElement!);
    setHeading((was) => (was === found ? was : found));
  });
  const rows = () => [...table.current!.rows].map((row) => [...row.cells].map((cell) => cell.textContent ?? ""));
  const copy = () => {
    const tsv = toTsv(rows());
    if (typeof ClipboardItem === "undefined") return navigator.clipboard.writeText(tsv);
    const html = toHtml(rows(), table.current!.tHead?.rows.length ?? 0);
    return navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([tsv], { type: "text/plain" })
    })]);
  };
  const download = () => {
    const block = table.current!.parentElement!;
    const index = [...block.parentElement!.querySelectorAll(":scope > .result-table")].indexOf(block) + 1;
    saveText(toCsv(rows()), tableFileName(base, headingBefore(block), index), "text/csv");
  };
  return (
    <div className="result-table">
      <table ref={table} aria-label={heading ?? undefined}>{children}</table>
      <div className="table-actions">
        <CopyButton label="Copy table" name={heading ? `Copy table: ${heading}` : undefined}
          title="Copy this table, to paste into a document or a spreadsheet" copy={copy}
          done="Copied the table." failed="The table could not be copied." />
        <button type="button" className="icon-button" title="Download this table as a CSV file" onClick={download}
          aria-label={heading ? `Download CSV: ${heading}` : undefined}>
          <ArrowDownTrayIcon aria-hidden="true" />Download CSV
        </button>
      </div>
    </div>
  );
}

const COMPONENTS: Components = {
  table: ({ children }) => <ResultTable>{children}</ResultTable>,
  a: ({ href, children }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>,
  img: ({ src, alt }) => src ? <img src={src} alt={alt ?? ""} /> : <span>{alt}</span>,
  ...Object.fromEntries(HEADINGS.map((Tag, i) => [`h${i + 1}`, ({ children }: { children?: ReactNode }) => <Tag>{children}</Tag>]))
};

// A result with at least this many headings opens with a list of them.
export const CONTENTS_MIN_HEADINGS = 4;

interface Section { heading: HTMLHeadingElement; subsections: HTMLHeadingElement[] }

const levelOf = (heading: HTMLHeadingElement) => Number(heading.tagName[1]);

// The result's sections and their subsections, from its two highest heading levels. A result led by
// a single top-level heading has that as its title, so its sections are the two levels below it.
function sectionsOf(region: HTMLElement): Section[] {
  const headings = [...region.querySelectorAll<HTMLHeadingElement>(":scope > :is(h3, h4, h5, h6)")];
  if (headings.length === 0) return [];
  let top = Math.min(...headings.map(levelOf));
  const titled = headings.filter((h) => levelOf(h) === top).length === 1 && levelOf(headings[0]) === top;
  if (titled) top += 1;
  const sections: Section[] = [];
  for (const heading of headings) {
    const level = levelOf(heading), parent = sections[sections.length - 1];
    if (level === top) sections.push({ heading, subsections: [] });
    else if (level === top + 1 && parent) parent.subsections.push(heading);
  }
  return sections;
}

// Moves to a heading without touching the URL, whose fragment is the page's route. The page's scroll
// padding sets it just under the sticky bars.
function goTo(heading: HTMLHeadingElement) {
  heading.tabIndex = -1;
  heading.scrollIntoView({ block: "start" });
  heading.focus({ preventScroll: true });
}

// The window width at which a long result's contents moves from above it to beside it.
export const SIDEBAR_QUERY = "(min-width: 80rem)";

const sidebarQuery = () => (typeof window.matchMedia === "function" ? window.matchMedia(SIDEBAR_QUERY) : null);

function useSidebar(): boolean {
  return useSyncExternalStore((changed) => {
    const query = sidebarQuery();
    query?.addEventListener("change", changed);
    return () => query?.removeEventListener("change", changed);
  }, () => sidebarQuery()?.matches ?? false);
}

// The list of a long result's sections: above it in columns, which can be hidden, or beside it on a
// wide window, where it always shows.
function Contents({ sections, sidebar }: { sections: Section[]; sidebar: boolean }) {
  const entry = (heading: HTMLHeadingElement) => (
    <button type="button" className="contents-link" onClick={() => goTo(heading)}>{heading.textContent}</button>
  );
  const list = (
    <nav aria-label="Result contents">
      <ol>
        {sections.map(({ heading, subsections }, i) => (
          <li key={i}>
            {entry(heading)}
            {subsections.length > 0 && <ol>{subsections.map((sub, j) => <li key={j}>{entry(sub)}</li>)}</ol>}
          </li>
        ))}
      </ol>
    </nav>
  );
  if (sidebar) return <div className="result-contents"><p className="contents-title">Contents</p>{list}</div>;
  return <details className="result-contents" open><summary className="contents-title">Contents</summary>{list}</details>;
}

// Memoized: the page re-renders on every learner's save, and a parse of a long result is not cheap.
// `fileBase` starts the file name each table downloads under.
export const ResultMarkdown = memo(function ResultMarkdown({ markdown, sanitize = true, fileBase = "result" }: {
  markdown: string; sanitize?: boolean; fileBase?: string;
}) {
  const region = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<Section[]>([]);
  useLayoutEffect(() => { setSections(sectionsOf(region.current!)); }, [markdown]);
  const sidebar = useSidebar();
  const long = sections.reduce((n, s) => n + 1 + s.subsections.length, 0) >= CONTENTS_MIN_HEADINGS;
  // Parsed once per text: finding the headings renders again, and a long result is not cheap to parse.
  const rendered = useMemo(() => (
    <Markdown remarkPlugins={[noHtml, remarkGfm, noFootnotes]} rehypePlugins={sanitize ? [[rehypeSanitize, SCHEMA]] : []}
      urlTransform={keepUrl} components={COMPONENTS}>
      {markdown}
    </Markdown>
  ), [markdown, sanitize]);
  return (
    <FileBase.Provider value={fileBase}>
      <div className={`result-layout${long && sidebar ? " sidebar" : ""}`}>
        {long && <Contents sections={sections} sidebar={sidebar} />}
        {/* A named, focusable region, so a keyboard can scroll what is too wide for the page. */}
        <div className="result-markdown" role="region" aria-label="Result text" tabIndex={0} ref={region}>
          {rendered}
        </div>
      </div>
    </FileBase.Provider>
  );
});
