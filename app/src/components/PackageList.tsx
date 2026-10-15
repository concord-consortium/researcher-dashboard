import { groupPackages, packageKey, titleOf, type Group } from "../shell/packages";
import type { PackageRow, Scope } from "../shell/portal";
import {
  formatTime, latestFinished, millis, rowState, runOffer, stageWords, WAITING,
  type Result, type RowState, type Runner, type RunRequest, type SessionMark
} from "../shell/runs";

// A sentence from text that may already end in one.
const sentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);

// What a row says of its result. `listed` rows carry the Run control the waiting and paused
// states tell the researcher to press.
export function stateText(state: RowState, title: string, listed: boolean): string {
  switch (state.kind) {
    case "not-run":
      return "Not run.";
    case "queued":
      if (state.waiting) return listed ? WAITING : "Queued, waiting for a machine.";
      return state.position === null ? "Queued." : `Queued, number ${state.position} in line.`;
    case "running":
      return `Running ${title}: ${stageWords(state.stage)}.`;
    case "stuck":
      if (!state.resumable) return "Interrupted: the machine running it stopped partway. This is being checked.";
      return listed ? "Paused partway through: resume it to finish." : "Paused partway through.";
    case "done":
      return state.summary ?? "Finished.";
    case "failed":
      return `Failed: ${sentence(state.error)}`;
  }
}

const RESUMING = "Resuming: it will continue within a minute or two.";

// The state line of a row, over the latest finished result when there is one: a re-run reads as an
// update of it, and a failed re-run leaves it in place.
export function rowLine(state: RowState, title: string, listed: boolean, finishedAt: number | null | undefined): string {
  const text = stateText(state, title, listed);
  if (finishedAt === undefined || state.kind === "done" || state.kind === "not-run") return text;
  if (state.kind === "failed") {
    return `The latest re-run failed: ${sentence(state.error)} Showing the result from ${finishedAt === null ? "an earlier run" : formatTime(finishedAt)}.`;
  }
  return updating(text);
}

const updating = (text: string) => `Updating: ${text[0].toLowerCase()}${text.slice(1)}`;

export interface RowProps {
  row: PackageRow;
  result: Result | undefined;
  runner: Runner | null;
  mark: SessionMark | null;
  classHash: string;
  request: RunRequest | undefined;
  onRun: (row: PackageRow, resume: boolean) => void;
  onShow: (key: string) => void;
}

function Row({ row, result, runner, mark, classHash, request, onRun, onShow }: RowProps) {
  const key = packageKey(row.identity);
  const title = titleOf(row);
  const state = rowState(result, runner, mark, classHash, key);
  const finished = latestFinished(result);
  const finishedAt = finished ? millis(finished.finished_at) : undefined;
  const resultAt = millis(result?.updated_at);
  const pending = request !== undefined && "pending" in request;
  const refusal = request && "message" in request && request.at === resultAt ? request.message : null;
  const resume = state.kind === "stuck" && state.resumable;
  const resuming = resume && request !== undefined && "resuming" in request && request.at === resultAt;
  // A waiting row reads as plain Queued while its own request is launching the machine.
  const shown: RowState = pending && state.kind === "queued" && state.waiting ? { ...state, waiting: false } : state;
  const line = !resuming ? rowLine(shown, title, true, finishedAt) : finishedAt === undefined ? RESUMING : updating(RESUMING);
  const offer = runOffer(row.runnable, state);
  const disabled = !offer.enabled || pending || resuming;
  const reasonId = `reason-${key}`;

  return (
    <li>
      <span className="title">{title}</span> <span className="version">{row.current_version.version}</span>
      {row.current_version.description && <p className="description">{row.current_version.description}</p>}
      <code className="identity">{row.identity}</code>
      <div className="state" aria-live="polite">
        <p>{line}</p>
        {state.kind === "failed" && state.finishedAt !== null && <p className="when">{formatTime(state.finishedAt)}</p>}
        {pending && <p>Requesting…</p>}
        {refusal && <p className="error">{refusal}</p>}
      </div>
      {finished && (
        <div className="finished">
          {state.kind !== "done" && <p className="summary">{finished.summary ?? "Finished."}</p>}
          <p className="when">
            Finished {finishedAt != null ? formatTime(finishedAt) : "at an unknown time"}
            {finished.package.version !== row.current_version.version && <> · from {finished.package.version}</>}
          </p>
        </div>
      )}
      <div className="controls">
        <button
          type="button"
          aria-label={`${resume ? "Resume" : "Run"} ${title}`}
          aria-disabled={disabled || undefined}
          aria-describedby={offer.reason ? reasonId : undefined}
          onClick={() => { if (!disabled) onRun(row, resume); }}
        >
          {resume ? "Resume" : "Run"}
        </button>
        {offer.reason && <p id={reasonId} className="reason">{offer.reason}</p>}
        {finished && (
          <button type="button" aria-label={`Show result for ${title}`} onClick={() => onShow(key)}>Show result</button>
        )}
      </div>
    </li>
  );
}

export interface ListProps {
  rows: PackageRow[];
  scope: Scope;
  results: Map<string, Result>;
  runner: Runner | null;
  mark: SessionMark | null;
  requests: Map<string, RunRequest>;
  onRun: (row: PackageRow, resume: boolean) => void;
  onShow: (key: string) => void;
}

type RowsProps = Omit<ListProps, "rows" | "scope"> & { rows: PackageRow[]; classHash: string };

function Rows({ rows, results, requests, ...rest }: RowsProps) {
  return (
    <ul className="package-rows">
      {rows.map((row) => {
        const key = packageKey(row.identity);
        return <Row key={row.catalog_id} row={row} result={results.get(key)} request={requests.get(key)} {...rest} />;
      })}
    </ul>
  );
}

// A heading inside <summary> is not reliably a heading to a screen reader, since summary's
// children are presentational, so the collapsed group's heading sits above its disclosure.
function GroupSection({ group, ...rest }: Omit<RowsProps, "rows"> & { group: Group }) {
  const headingId = `group-${group.key}`;
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId}>{group.heading}</h3>
      {group.collapsed ? (
        <details className="community">
          <summary>Show {group.rows.length} community {group.rows.length === 1 ? "package" : "packages"}</summary>
          <p className="disclosure">
            These packages are not reviewed by Concord. Running one runs a stranger's code with your
            access to student data, and nothing stops it sending that data elsewhere.
          </p>
          <Rows rows={group.rows} {...rest} />
        </details>
      ) : (
        <Rows rows={group.rows} {...rest} />
      )}
    </section>
  );
}

export function PackageList({ rows, scope, ...rest }: ListProps) {
  const groups = groupPackages(rows, scope);
  if (groups.length === 0) return <p>No packages apply to this class yet.</p>;
  return <>{groups.map((group) => <GroupSection key={group.key} group={group} classHash={scope.class_hash} {...rest} />)}</>;
}
