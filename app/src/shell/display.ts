// The `display.json` contract, as the app reads it.
//
// This is the projection an analysis package wrote and the runner copied into Firestore, so
// it is the output of code we fetched rather than code we shipped. It is parsed rather than
// trusted: a section the app does not understand is dropped instead of rendered as
// whatever it happens to be, and nothing here is ever interpreted as markup. See
// `renderMarkdown` in the component for why the markdown field is shown as text.

export interface TableSection {
  title: string;
  table: { columns: string[]; rows: string[][] };
}

export interface MarkdownSection {
  title: string;
  markdown: string;
}

export type Section = TableSection | MarkdownSection;

export interface Display {
  summary: string;
  sections: Section[];
}

export function isTable(section: Section): section is TableSection {
  return "table" in section;
}

function asString(value: unknown): string {
  // Numbers are the common case in a counts table, and a package writing one should not
  // produce an empty cell. Anything else becomes empty rather than "[object Object]".
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function parseSection(raw: unknown): Section | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const title = asString(value.title);

  if (typeof value.markdown === "string") {
    return { title, markdown: value.markdown };
  }

  const table = value.table as Record<string, unknown> | undefined;
  if (table && Array.isArray(table.columns) && Array.isArray(table.rows)) {
    return {
      title,
      table: {
        columns: table.columns.map(asString),
        // Rows are objects with a `cells` list rather than bare lists, because Firestore
        // cannot store an array whose elements are arrays and the runner writes this whole
        // document into one field.
        rows: table.rows.map((row) => {
          const cells = (row as Record<string, unknown> | null)?.cells;
          return Array.isArray(cells) ? cells.map(asString) : [];
        })
      }
    };
  }

  // A section carrying neither, or both, is not something this contract describes.
  return null;
}

export function parseDisplay(raw: unknown): Display | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const sections = Array.isArray(value.sections)
    ? value.sections.map(parseSection).filter((s): s is Section => s !== null)
    : [];

  return { summary: asString(value.summary), sections };
}
