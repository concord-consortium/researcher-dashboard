import { packageKey } from "../shell/packages";
import { latestFinished, millis, rowState, type Result, type Runner, type SessionMark } from "../shell/runs";
import { OpenLink, quietUpdate, rowLine, RowStatus, StatusPill, ViewResult, type StatusModel } from "./PackageList";

// A result whose package the page does not list any more. It has no Run control, so its state is
// worded without the instruction to press one.
export function unlistedModel(result: Result, runner: Runner | null, mark: SessionMark | null, classHash: string): StatusModel {
  const identity = result.package.identity;
  const finished = latestFinished(result);
  const state = rowState(result, runner, mark, classHash, packageKey(identity));
  return {
    state, finished, pending: false, refusal: null, outdated: false, versionNote: null,
    line: rowLine(state, identity, false, finished ? millis(finished.finished_at) : undefined),
    quiet: quietUpdate(state, finished !== null, false)
  };
}

export function Unlisted({ results, notes, runner, mark, classHash, onOpen, linkRef }: {
  results: Result[];
  notes: Map<string, string | null>;
  runner: Runner | null;
  mark: SessionMark | null;
  classHash: string;
  onOpen: (key: string) => void;
  linkRef: (key: string, link: HTMLAnchorElement | null) => void;
}) {
  return (
    <section aria-label="Packages no longer listed">
      <ul className="package-rows">
        {results.map((result) => {
          const identity = result.package.identity;
          const key = packageKey(identity);
          const note = notes.get(identity);
          const model = unlistedModel(result, runner, mark, classHash);
          return (
            <li key={key} className="card">
              <div className="card-main">
                <OpenLink resultKey={key} onOpen={onOpen} linkRef={linkRef}>
                  <code className="identity">{identity}</code>
                </OpenLink>{" "}
                <span className="version">{result.package.version}</span> <span className="tag">No longer listed</span>
                {note && <p className="notice">{note}</p>}
                <RowStatus model={model} />
              </div>
              <div className="controls">
                <div className="run-row">
                  <StatusPill model={model} />
                  <ViewResult model={model} title={identity} onOpen={() => onOpen(key)} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
