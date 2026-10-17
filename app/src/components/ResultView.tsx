import { ArrowDownTrayIcon } from "@heroicons/react/16/solid";
import { resultFileBase, resultFileName, saveText } from "../shell/download";
import { fullTime, millis, type Finished } from "../shell/runs";
import { FinishedWhen } from "./Time";
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

// When the open package's result finished and what it read, under its Run, Copy and Download.
// The read is the line's title, and is said to a screen reader in full.
export function ResultWhen({ finished }: { finished: Finished }) {
  const started = millis(finished.started_at);
  const read = started === null ? null : `Includes every save before ${fullTime(started)}, when this run began reading the class's data.`;
  return (
    <p className="when result-when" title={read ?? undefined}>
      Version {finished.package.version} · <FinishedWhen ms={millis(finished.finished_at)} />
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
