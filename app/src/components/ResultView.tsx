import { ArrowDownTrayIcon, CheckIcon, ClipboardDocumentIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { resultFileName, saveText } from "../shell/download";
import { finishedWhen, formatTime, millis, type Finished } from "../shell/runs";
import { ResultMarkdown } from "./ResultMarkdown";

// How long Copy shows that it copied, or could not, before it looks as it did.
export const COPIED_MS = 1000;

// Copy and Download for a finished result's markdown, beside the open package's Run. Copy answers in
// its own look and icon, so nothing around it moves; a screen reader hears the answer in words.
export function ResultActions({ classTitle, finished }: { classTitle: string; finished: Finished }) {
  const markdown = finished.display ?? "";
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  // navigator.clipboard is missing outside a secure context, which the chained call turns into a refusal.
  const copy = () => Promise.resolve().then(() => navigator.clipboard.writeText(markdown)).then(
    () => setCopied("ok"), () => setCopied("failed"));
  const CopyIcon = copied === "ok" ? CheckIcon : copied === "failed" ? XMarkIcon : ClipboardDocumentIcon;
  return (
    <>
      <button type="button" className={`icon-button${copied === "ok" ? " copy-ok" : copied === "failed" ? " danger" : ""}`}
        title="Copy the result's markdown" onClick={copy}>
        <CopyIcon aria-hidden="true" />Copy
      </button>
      <button type="button" className="icon-button" title="Download the result's markdown"
        onClick={() => saveText(markdown, resultFileName(finished.package.identity, classTitle, millis(finished.finished_at)))}>
        <ArrowDownTrayIcon aria-hidden="true" />Download
      </button>
      <span aria-live="polite" className="visually-hidden">
        {copied === "ok" ? "Copied the markdown." : copied === "failed" ? "The markdown could not be copied." : ""}
      </span>
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
