import Markdown, { type Components, type UrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { type Options as SanitizeSchema } from "rehype-sanitize";
import { memo, type ReactNode } from "react";
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

// The opened result's title is an h3, so a package's "#" is an h4.
const HEADINGS = ["h4", "h5", "h6", "h6", "h6", "h6"] as const;

const COMPONENTS: Components = {
  a: ({ href, children }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>,
  img: ({ src, alt }) => src ? <img src={src} alt={alt ?? ""} /> : <span>{alt}</span>,
  ...Object.fromEntries(HEADINGS.map((Tag, i) => [`h${i + 1}`, ({ children }: { children?: ReactNode }) => <Tag>{children}</Tag>]))
};

// Memoized: the page re-renders on every learner's save, and a parse of a long result is not cheap.
export const ResultMarkdown = memo(function ResultMarkdown({ markdown, sanitize = true }: { markdown: string; sanitize?: boolean }) {
  return (
    <div className="result-markdown">
      <Markdown remarkPlugins={[noHtml, remarkGfm, noFootnotes]} rehypePlugins={sanitize ? [[rehypeSanitize, SCHEMA]] : []}
        urlTransform={keepUrl} components={COMPONENTS}>
        {markdown}
      </Markdown>
    </div>
  );
});
