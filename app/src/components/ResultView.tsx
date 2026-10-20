import { ArrowDownTrayIcon } from "@heroicons/react/16/solid";
import { resultFileBase, resultFileName, saveText } from "../shell/download";
import { fullTime, millis, type Finished } from "../shell/runs";
import { finishedText } from "./Time";
import { CopyButton } from "./CopyButton";
import { ResultMarkdown } from "./ResultMarkdown";

// Copy and Download for a finished result's markdown, beside the open package's Run.
export function ResultActions({ classTitle, finished }: { classTitle: string; finished: Finished }) {
  const markdown = finished.display ?? "";
  return (
    <>
      <CopyButton label="Copy" title="Copy the result's markdown" copy={() => navigator.clipboard.writeText(markdown)}
        done="Copied the markdown." failed="The markdown could not be copied." />
      <button type="button" className="icon-button" title="Download the result's markdown"
        onClick={() => saveText(markdown, resultFileName(finished.package.identity, classTitle, millis(finished.finished_at)))}>
        <ArrowDownTrayIcon aria-hidden="true" />Download
      </button>
    </>
  );
}

// When the open package's result finished and what it read, under its Run, Copy and Download. The line's
// one title gives the finish time in full and the read; the read is also said to a screen reader in full.
export function ResultWhen({ finished }: { finished: Finished }) {
  const started = millis(finished.started_at), finishedAt = millis(finished.finished_at);
  const read = started === null ? null : `Includes every save before ${fullTime(started)}, when this run began reading the class's data.`;
  const title = [finishedAt === null ? null : `Finished ${fullTime(finishedAt)}.`, read].filter(Boolean).join(" ");
  return (
    <p className="when result-when" title={title || undefined}>
      Version {finished.package.version} · {finishedText(finishedAt)}
      {read && <span className="visually-hidden"> {read}</span>}
    </p>
  );
}

// The finished result of the open package, under its subheader. Its tables download under the result's
// own file name.
export function ResultView({ classTitle, finished }: { classTitle: string; finished: Finished }) {
  return (
    <section className="result-view" aria-label="Result">
      <ResultMarkdown markdown={finished.display ?? ""}
        fileBase={resultFileBase(finished.package.identity, classTitle, millis(finished.finished_at))} />
    </section>
  );
}
