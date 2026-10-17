import Markdown, { type Components, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { type Options as SanitizeSchema } from "rehype-sanitize";
import { ArrowDownTrayIcon } from "@heroicons/react/16/solid";
import { createContext, memo, useContext, useRef, type ReactNode } from "react";
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

// A table, with Copy table and Download CSV under it. Both read the cells' text as rendered.
function ResultTable({ children }: { children?: ReactNode }) {
  const table = useRef<HTMLTableElement>(null);
  const base = useContext(FileBase);
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
      <table ref={table}>{children}</table>
      <div className="table-actions">
        <CopyButton label="Copy table" title="Copy this table, to paste into a document or a spreadsheet" copy={copy}
          done="Copied the table." failed="The table could not be copied." />
        <button type="button" className="icon-button" title="Download this table as a CSV file" onClick={download}>
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

// Memoized: the page re-renders on every learner's save, and a parse of a long result is not cheap.
// `fileBase` starts the file name each table downloads under.
export const ResultMarkdown = memo(function ResultMarkdown({ markdown, sanitize = true, fileBase = "result" }: {
  markdown: string; sanitize?: boolean; fileBase?: string;
}) {
  return (
    <FileBase.Provider value={fileBase}>
      <div className="result-markdown">
        <Markdown remarkPlugins={[noHtml, remarkGfm, noFootnotes]} rehypePlugins={sanitize ? [[rehypeSanitize, SCHEMA]] : []}
          urlTransform={keepUrl} components={COMPONENTS}>
          {markdown}
        </Markdown>
      </div>
    </FileBase.Provider>
  );
});
