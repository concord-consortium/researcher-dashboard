import { CheckIcon, CubeIcon, PlayIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { outOfDate } from "../shell/activity";
import { packageKey, titleOf, type Group } from "../shell/packages";
import type { PackageRow } from "../shell/portal";
import { useEffect, useRef, type ReactNode } from "react";
import { routeHash } from "../shell/route";
import {
  finishedWhen, formatTime, latestFinished, millis, rowState, runOffer, sentence, stageWords, WAITING,
  type Finished, type Result, type RowState, type Runner, type RunRequest, type SessionMark
} from "../shell/runs";

// What a row says of its result. `listed` rows carry the Run control the waiting and paused
// states tell the researcher to press.
export function stateText(state: RowState, title: string, listed: boolean): string {
  switch (state.kind) {
    case "not-run":
      return "Not run.";
    case "queued":
      if (state.waiting) return listed ? WAITING : "Queued, waiting for a runner.";
      return state.position === null ? "Queued." : `Queued, number ${state.position} in line.`;
    case "running":
      return `Running ${title}: ${stageWords(state.stage)}.`;
    case "stuck":
      if (!state.resumable) return "Interrupted: its runner stopped partway. This is being checked.";
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

// A re-run of a row that has a finished result announces only its outcome.
export const quietUpdate = (state: RowState, hasFinished: boolean, inFlight: boolean) =>
  hasFinished && (inFlight || state.kind === "queued" || state.kind === "running");

// A quiet line and its aside sit outside the polite region, so changes to them are not announced,
// and the outcome is announced when it is added inside.
export function StateRegion({ state, line, quiet = false, aside, children }: {
  state: RowState; line: string; quiet?: boolean; aside?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="state">
      {quiet && line && <p>{line}</p>}
      {quiet && aside}
      <div aria-live="polite">
        {!quiet && line && <p>{line}</p>}
        {state.kind === "failed" && state.finishedAt !== null && <p className="when">{formatTime(state.finishedAt)}</p>}
        {children}
      </div>
    </div>
  );
}

// What a row knows of its package's state, shared by its card in the list and the open package's
// subheader. `outdated` and `versionNote` are false and null where they cannot apply.
export interface StatusModel {
  state: RowState;
  line: string;
  quiet: boolean;
  pending: boolean;
  refusal: string | null;
  finished: Finished | null;
  outdated: boolean;
  versionNote: string | null;
}

export interface RowModel extends StatusModel {
  key: string;
  title: string;
  resume: boolean;
  offer: { enabled: boolean; reason?: string };
  disabled: boolean;
}

export function rowModel({ row, result, runner, mark, classHash, request, newest, behind }: {
  row: PackageRow; result: Result | undefined; runner: Runner | null; mark: SessionMark | null; classHash: string;
  request: RunRequest | undefined; newest: number | null; behind: Map<string, unknown>;
}): RowModel {
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
  const requested = request !== undefined && "requested" in request && !request.lapsed && request.at === resultAt;
  // While a request from this row is in flight, a waiting row reads as queued, not as waiting for a machine.
  const shown: RowState = pending && state.kind === "queued" && state.waiting ? { ...state, waiting: false } : state;
  const line = !resuming ? rowLine(shown, title, true, finishedAt) : finishedAt === undefined ? RESUMING : updating(RESUMING);
  const offer = runOffer(row.runnable, state);
  return {
    key, title, state, finished, line, pending, refusal, resume, offer,
    quiet: quietUpdate(state, finished !== null, pending || resuming || requested),
    disabled: !offer.enabled || pending || resuming,
    outdated: outOfDate(key, result, newest, behind, pending || requested),
    versionNote: finished && finished.package.version !== row.current_version.version ? `from ${finished.package.version}` : null
  };
}

// The state line, Requesting and any refusal; with `withFinished`, the summary of the finished result
// a row keeps through a re-run (a done row's state line already holds its summary).
// `withNotRun` false leaves out the line of a package never run, where a status pill says it.
export function RowStatus({ model, withFinished = true, withNotRun = true }: {
  model: StatusModel; withFinished?: boolean; withNotRun?: boolean;
}) {
  const { state, quiet, pending, refusal, finished, outdated } = model;
  const line = !withNotRun && state.kind === "not-run" ? "" : model.line;
  return (
    <>
      <StateRegion state={state} line={line} quiet={quiet} aside={pending && <p>Requesting…</p>}>
        {!quiet && pending && <p>Requesting…</p>}
        {refusal && <p className="error">{refusal}</p>}
      </StateRegion>
      {withFinished && finished && state.kind !== "done" && <p className="summary">{finished.summary ?? "Finished."}</p>}
      {outdated && <p className="notice">Students have saved work since this result.</p>}
    </>
  );
}

type Tone = "idle" | "busy" | "ok" | "warn" | "error";

// A package's state in a word or two, for the pill beside its Run.
export function statusPill(model: StatusModel): { label: string; tone: Tone } {
  const { state, pending, finished } = model;
  if (pending) return { label: "Requesting", tone: "busy" };
  switch (state.kind) {
    case "not-run": return { label: "Not run", tone: "idle" };
    case "queued":
      if (state.waiting) return { label: "Waiting for a runner", tone: "warn" };
      return { label: state.position === null ? "Queued" : `Queued, #${state.position}`, tone: "busy" };
    case "running": return { label: "Running", tone: "busy" };
    case "stuck": return state.resumable ? { label: "Paused", tone: "warn" } : { label: "Interrupted", tone: "warn" };
    case "done": return { label: "Finished", tone: "ok" };
    case "failed": return { label: finished ? "Re-run failed" : "Failed", tone: "error" };
  }
}

// When the result a row keeps finished, and the version it came from when that is not the current one.
export function finishedNote({ finished, versionNote }: StatusModel): string | null {
  if (!finished) return null;
  return `${finishedWhen(millis(finished.finished_at))}${versionNote ? ` · ${versionNote}` : ""}`;
}

// Not a live region: the state line under the title announces the same change in full. When the kept
// result finished is the pill's title, and said to a screen reader after its label.
export function StatusPill({ model }: { model: StatusModel }) {
  const { label, tone } = statusPill(model);
  const note = finishedNote(model);
  return (
    <span className={`status-pill ${tone}${model.state.kind === "running" && !model.pending ? " throb" : ""}`} title={note ?? undefined}>
      <span className="label">{label}</span>
      {note && <span className="visually-hidden">, {note}</span>}
    </span>
  );
}

// Run or Resume, after `before` on its row, with the reason it is disabled under them. `held` disables
// it while the community warning waits for an answer.
export function RunButton({ row, model, onRun, before, held = false }: {
  row: PackageRow; model: RowModel; onRun: (row: PackageRow, resume: boolean) => void; before?: ReactNode; held?: boolean;
}) {
  const reasonId = `reason-${model.key}`;
  const disabled = model.disabled || held;
  return (
    <>
      <div className="run-row">
      {before}
      <button
        type="button"
        className="run"
        aria-label={`${model.resume ? "Resume" : "Run"} ${model.title}`}
        aria-disabled={disabled || undefined}
        aria-describedby={model.offer.reason ? reasonId : undefined}
        title={model.offer.reason}
        onClick={() => { if (!disabled) onRun(row, model.resume); }}
      >
        <PlayIcon aria-hidden="true" />{model.resume ? "Resume" : "Run"}
      </button>
      </div>
      {model.offer.reason && <p id={reasonId} className="reason">{model.offer.reason}</p>}
    </>
  );
}

export const COMMUNITY_WARNING = "Community packages are not reviewed by Concord. Running one runs a stranger's code with "
  + "your access to student data, and nothing stops it sending that data elsewhere.";

// Asked before a community package runs. Confirm takes focus, and focus goes back to where it was,
// the Run that asked, when either answer removes the warning.
export function CommunityConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    confirm.current?.focus();
    return () => before?.focus();
  }, []);
  return (
    <div className="community-confirm" role="group" aria-label="Run a community package?">
      <p>{COMMUNITY_WARNING}</p>
      <div className="confirm-buttons">
        <button type="button" ref={confirm} className="icon-button danger" onClick={onConfirm}><CheckIcon aria-hidden="true" />Confirm</button>
        <button type="button" className="icon-button" onClick={onCancel}><XMarkIcon aria-hidden="true" />Cancel</button>
      </div>
    </div>
  );
}

// A package's title as the link that opens it, after the Packages tab's icon.
export function OpenLink({ resultKey, children, onOpen, linkRef }: {
  resultKey: string;
  children: ReactNode;
  onOpen: (key: string) => void;
  linkRef: (key: string, link: HTMLAnchorElement | null) => void;
}) {
  return (
    <a className="title" href={routeHash({ tab: "packages", key: resultKey })} ref={(a) => linkRef(resultKey, a)}
      onClick={(e) => { e.preventDefault(); onOpen(resultKey); }}><CubeIcon aria-hidden="true" />{children}</a>
  );
}

export interface RowProps {
  row: PackageRow;
  tag: string;
  result: Result | undefined;
  runner: Runner | null;
  mark: SessionMark | null;
  classHash: string;
  request: RunRequest | undefined;
  newest: number | null;
  behind: Map<string, unknown>;
  onRun: (row: PackageRow, resume: boolean) => void;
  onOpen: (key: string) => void;
  linkRef: (key: string, link: HTMLAnchorElement | null) => void;
  confirming: string | null;
  onConfirm: (row: PackageRow) => void;
  onCancel: () => void;
}

function Row({ row, tag, onRun, onOpen, linkRef, confirming, onConfirm, onCancel, ...rest }: RowProps) {
  const model = rowModel({ row, ...rest });
  const asking = confirming === model.key;
  return (
    <li className="card">
      <div className="card-main">
        <OpenLink resultKey={model.key} onOpen={onOpen} linkRef={linkRef}>{model.title}</OpenLink>{" "}
        <span className="version">{row.current_version.version}</span> <span className="tag">{tag}</span>
        {row.current_version.description && <p className="description">{row.current_version.description}</p>}
        <code className="identity">{row.identity}</code>
        <RowStatus model={model} withNotRun={false} />
      </div>
      <div className="controls"><RunButton row={row} model={model} onRun={onRun} held={asking} before={<StatusPill model={model} />} /></div>
      {asking && <CommunityConfirm onConfirm={() => onConfirm(row)} onCancel={onCancel} />}
    </li>
  );
}

export interface ListProps {
  groups: Group[];
  filter: string;
  classHash: string;
  results: Map<string, Result>;
  runner: Runner | null;
  mark: SessionMark | null;
  requests: Map<string, RunRequest>;
  newest: number | null;
  behind: Map<string, unknown>;
  onRun: (row: PackageRow, resume: boolean) => void;
  onOpen: (key: string) => void;
  linkRef: (key: string, link: HTMLAnchorElement | null) => void;
  confirming: string | null;
  onConfirm: (row: PackageRow) => void;
  onCancel: () => void;
}

// One list of the groups the filter keeps ("all", or a group's key), each card tagged with its group.
// `confirming` is the package key whose community warning is showing.
export function PackageList({ groups, filter, results, requests, ...rest }: ListProps) {
  if (groups.length === 0) return <p>No packages apply to this class yet.</p>;
  const shown = groups.filter((g) => filter === "all" || g.key === filter);
  return (
    <>
      <ul className="package-rows">
        {shown.flatMap((group) => group.rows.map((row) => {
          const key = packageKey(row.identity);
          return <Row key={row.catalog_id} row={row} tag={group.heading} result={results.get(key)} request={requests.get(key)} {...rest} />;
        }))}
      </ul>
    </>
  );
}

export interface FilterOption { key: string; label: string; count: number }

// The pills above the list; one is always pressed.
export function PackageFilters({ options, selected, onSelect }: {
  options: FilterOption[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div role="group" aria-label="Filter packages" className="filters">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={o.key === selected} onClick={() => onSelect(o.key)}>
          {o.label} <span className="count">{o.count}</span>
        </button>
      ))}
    </div>
  );
}
