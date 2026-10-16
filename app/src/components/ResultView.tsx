import { useEffect, useRef } from "react";
import { finishedWhen, formatTime, millis, type Finished } from "../shell/runs";
import { ResultMarkdown } from "./ResultMarkdown";

// One finished result, opened from its row. Each opening mounts it afresh, so its title takes focus.
export function ResultView({ title, finished, updated, onClose }: {
  title: string;
  finished: Finished;
  updated: number | null;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const started = millis(finished.started_at);
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <section className="result-view" aria-labelledby="result-title">
      <h3 id="result-title" ref={heading} tabIndex={-1}>{title}</h3>
      <p className="when">
        Version {finished.package.version} · {finishedWhen(millis(finished.finished_at))}
      </p>
      {started !== null && (
        <p className="when">Includes every save before {formatTime(started)}, when this run began reading the class's data.</p>
      )}
      <p role="status">{updated !== null && `Updated ${formatTime(updated)}`}</p>
      <p className="summary">{finished.summary ?? "Finished."}</p>
      <ResultMarkdown markdown={finished.display ?? ""} />
      <button type="button" onClick={onClose}>Close</button>
    </section>
  );
}
