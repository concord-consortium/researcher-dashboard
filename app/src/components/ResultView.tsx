import { useEffect, useRef, useState } from "react";
import { resultFileName, saveText } from "../shell/download";
import { finishedWhen, formatTime, millis, type Finished } from "../shell/runs";
import { ResultMarkdown } from "./ResultMarkdown";

// One finished result, opened from its row. Each opening mounts it afresh, so its title takes focus.
export function ResultView({ title, classTitle, finished, updated, onClose }: {
  title: string;
  classTitle: string;
  finished: Finished;
  updated: number | null;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const started = millis(finished.started_at);
  useEffect(() => { heading.current?.focus(); }, []);
  const markdown = finished.display ?? "";
  const [copied, setCopied] = useState<string | null>(null);
  // navigator.clipboard is missing outside a secure context, which the chained call turns into a refusal.
  const copy = () => Promise.resolve().then(() => navigator.clipboard.writeText(markdown)).then(
    () => setCopied("Copied the markdown."), () => setCopied("The markdown could not be copied."));

  return (
    <section className="result-view" aria-labelledby="result-title">
      <div className="result-head">
        <h3 id="result-title" ref={heading} tabIndex={-1}>{title}</h3>
        {markdown && (
          <div className="result-actions">
            <button type="button" onClick={copy}>Copy markdown</button>
            <button type="button"
              onClick={() => saveText(markdown, resultFileName(finished.package.identity, classTitle, millis(finished.finished_at)))}>
              Download .md
            </button>
          </div>
        )}
      </div>
      <p aria-live="polite" className="copied">{copied}</p>
      <p className="when">
        Version {finished.package.version} · {finishedWhen(millis(finished.finished_at))}
      </p>
      {started !== null && (
        <p className="when">Includes every save before {formatTime(started)}, when this run began reading the class's data.</p>
      )}
      <p role="status">{updated !== null && `Updated ${formatTime(updated)}`}</p>
      <p className="summary">{finished.summary ?? "Finished."}</p>
      <ResultMarkdown markdown={markdown} />
      <button type="button" onClick={onClose}>Close</button>
    </section>
  );
}
