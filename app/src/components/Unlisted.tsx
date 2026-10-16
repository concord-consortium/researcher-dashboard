import { packageKey } from "../shell/packages";
import { latestFinished, millis, rowState, type Result, type Runner, type SessionMark } from "../shell/runs";
import { FinishedBlock, quietUpdate, rowLine, ShowButton, StateRegion } from "./PackageList";

// Results whose package the page does not list any more. They have no Run control, so their state
// is worded without the instruction to press one.
export function Unlisted({ results, notes, runner, mark, classHash, onShow, showRef }: {
  results: Result[];
  notes: Map<string, string | null>;
  runner: Runner | null;
  mark: SessionMark | null;
  classHash: string;
  onShow: (key: string) => void;
  showRef: (key: string, button: HTMLButtonElement | null) => void;
}) {
  return (
    <section aria-labelledby="unlisted-heading">
      <h3 id="unlisted-heading">Packages no longer listed</h3>
      <ul className="package-rows">
        {results.map((result) => {
          const identity = result.package.identity;
          const key = packageKey(identity);
          const finished = latestFinished(result);
          const state = rowState(result, runner, mark, classHash, key);
          const note = notes.get(identity);
          return (
            <li key={key}>
              <code className="identity">{identity}</code> <span className="version">{result.package.version}</span>
              {note && <p className="notice">{note}</p>}
              <StateRegion state={state} line={rowLine(state, identity, false, finished ? millis(finished.finished_at) : undefined)}
                quiet={quietUpdate(state, finished !== null, false)} />
              {finished && (
                <>
                  <FinishedBlock state={state} finished={finished} />
                  <ShowButton name={identity} resultKey={key} onShow={onShow} showRef={showRef} />
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
