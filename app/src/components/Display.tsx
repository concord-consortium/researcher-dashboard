import { isTable, type Display, type Section } from "../shell/display";

// Renders the projection an analysis package wrote.
//
// Nothing here interprets its content as markup. The document is written by code we
// fetched from S3, so rendering its `markdown` as HTML would let a package put script into
// this page and take the researcher's grant with it. React escapes what it renders, and
// the field is shown as text with its line breaks kept. A real markdown renderer is a
// later story and needs a sanitizer with it, not instead of it.
function MarkdownAsText({ text }: { text: string }) {
  return (
    <p className="markdown">
      {text.split("\n").map((line, i) => (
        <span key={i}>
          {line}
          <br />
        </span>
      ))}
    </p>
  );
}

function SectionBody({ section }: { section: Section }) {
  if (!isTable(section)) return <MarkdownAsText text={section.markdown} />;

  return (
    <table>
      <thead>
        <tr>
          {section.table.columns.map((column, i) => (
            <th key={i}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {section.table.rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DisplayView({ display }: { display: Display }) {
  return (
    <div className="display">
      {display.summary && <p className="summary">{display.summary}</p>}
      {display.sections.map((section, i) => (
        <section key={i}>
          {section.title && <h3>{section.title}</h3>}
          <SectionBody section={section} />
        </section>
      ))}
    </div>
  );
}
