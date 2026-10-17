import { packageKey } from "../shell/packages";
import { latestFinished, millis, rowState, type Result, type Runner, type SessionMark } from "../shell/runs";
import { GroupTag, Highlight, OpenLink, quietUpdate, rowLine, RowStatus, StatusPill, ViewResult, type StatusModel } from "./PackageList";

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

// The title the list last gave a package, or one made from its identity's last segment when the list
// no longer returns it.
export function unlistedTitle(identity: string, titles: Map<string, string>): string {
  const known = titles.get(identity);
  if (known) return known;
  const words = (identity.split("/").pop() ?? identity).replace(/[-_.]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : identity;
}

export function Unlisted({ results, search, titles, notes, runner, mark, classHash, onOpen, linkRef }: {
  results: Result[];
  search: string | null;
  titles: Map<string, string>;
  notes: Map<string, string | null>;
  runner: Runner | null;
  mark: SessionMark | null;
  classHash: string;
  onOpen: (key: string) => void;
  linkRef: (key: string, link: HTMLAnchorElement | null) => void;
}) {
  return (
    <section className="unlisted" aria-label="Packages no longer listed">
      <ul className="package-rows">
        {results.map((result) => {
          const identity = result.package.identity;
          const key = packageKey(identity);
          const note = notes.get(identity);
          const model = unlistedModel(result, runner, mark, classHash);
          const title = unlistedTitle(identity, titles);
          return (
            <li key={key} className="card">
              <div className="card-main">
                <OpenLink resultKey={key} onOpen={onOpen} linkRef={linkRef}><Highlight text={title} search={search} /></OpenLink>{" "}
                <span className="version">{result.package.version}</span> <GroupTag group="unlisted">No longer listed</GroupTag>
                <code className="identity"><Highlight text={identity} search={search} /></code>
                {note && <p className="notice">{note}</p>}
                <RowStatus model={model} />
              </div>
              <div className="controls">
                <div className="run-row">
                  <StatusPill model={model} />
                  <ViewResult model={model} title={title} onOpen={() => onOpen(key)} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
