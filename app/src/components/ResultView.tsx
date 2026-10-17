import { ArrowDownTrayIcon, ClipboardDocumentIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { resultFileName, saveText } from "../shell/download";
import { finishedWhen, formatTime, millis, type Finished } from "../shell/runs";
import { ResultMarkdown } from "./ResultMarkdown";

// Copy and Download for a finished result's markdown, beside the open package's Run.
export function ResultActions({ classTitle, finished }: { classTitle: string; finished: Finished }) {
  const markdown = finished.display ?? "";
  const [copied, setCopied] = useState<string | null>(null);
  // navigator.clipboard is missing outside a secure context, which the chained call turns into a refusal.
  const copy = () => Promise.resolve().then(() => navigator.clipboard.writeText(markdown)).then(
    () => setCopied("Copied the markdown."), () => setCopied("The markdown could not be copied."));
  return (
    <>
      <button type="button" className="icon-button" title="Copy the result's markdown" onClick={copy}>
        <ClipboardDocumentIcon aria-hidden="true" />Copy
      </button>
      <button type="button" className="icon-button" title="Download the result's markdown"
        onClick={() => saveText(markdown, resultFileName(finished.package.identity, classTitle, millis(finished.finished_at)))}>
        <ArrowDownTrayIcon aria-hidden="true" />Download
      </button>
      <p aria-live="polite" className="copied">{copied}</p>
    </>
  );
}

// When the open package's result finished and what it read, under its Run, Copy and Download.
// The read is the line's title, and is said to a screen reader in full.
export function ResultWhen({ finished }: { finished: Finished }) {
  const started = millis(finished.started_at);
  const read = started === null ? null : `Includes every save before ${formatTime(started)}, when this run began reading the class's data.`;
  return (
    <p className="when result-when" title={read ?? undefined}>
      Version {finished.package.version} · {finishedWhen(millis(finished.finished_at))}
      {read && <span className="visually-hidden"> {read}</span>}
    </p>
  );
}

// The finished result of the open package, under its subheader.
export function ResultView({ finished, updated }: { finished: Finished; updated: number | null }) {
  return (
    <section className="result-view" aria-label="Result">
      <p role="status">{updated !== null && `Updated ${formatTime(updated)}`}</p>
      <ResultMarkdown markdown={finished.display ?? ""} />
    </section>
  );
}
