import {
  ArchiveBoxIcon, CheckBadgeIcon, CheckIcon, CubeIcon, DocumentTextIcon, FolderIcon, GlobeAltIcon, MagnifyingGlassIcon, PlayIcon,
  Squares2X2Icon, UserIcon, XMarkIcon
} from "@heroicons/react/16/solid";
import { outOfDate } from "../shell/activity";
import { byTitle, packageKey, searchWords, titleOf, type Group } from "../shell/packages";
import type { PackageRow } from "../shell/portal";
import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { plainError } from "../shell/errors";
import { routeHash } from "../shell/route";
import { Callout } from "./Callout";
import { FinishedWhen, Time } from "./Time";
import { useNow } from "./useNow";
import {
  elapsedText, formatTime, latestFinished, millis, rowState, runOffer, sentence, stageWords, WAITING,
  type Finished, type Result, type RowState, type Runner, type RunRequest, type SessionMark
} from "../shell/runs";

// What a row says of its result. `listed` rows carry the Run control the waiting and paused
// states tell the researcher to press.
export function stateText(state: RowState, title: string, listed: boolean): string {
  switch (state.kind) {
    case "not-run":
      return "Not run.";
    case "queued":
      if (state.waiting) return listed ? WAITING : "Queued and waiting to start.";
      return state.position === null ? "Queued." : `Queued, number ${state.position} in line.`;
    case "running":
      return `Running ${title}: ${stageWords(state.stage)}.`;
    case "stuck":
      if (!state.resumable) return "Interrupted: it stopped partway. This is being checked.";
      return listed ? "Paused partway through: resume it to finish." : "Paused partway through.";
    case "done":
      return state.summary ?? "Finished.";
    case "failed":
      return `Failed: ${plainError(state.error).plain}`;
  }
}

const RESUMING = "Resuming: it will continue within a minute or two.";

// The state line of a row, over the latest finished result when there is one: a re-run reads as an
// update of it, and a failed re-run leaves it in place.
export function rowLine(state: RowState, title: string, listed: boolean, finishedAt: number | null | undefined): string {
  const text = stateText(state, title, listed);
  if (finishedAt === undefined || state.kind === "done" || state.kind === "not-run") return text;
  if (state.kind === "failed") {
    return `The latest re-run failed: ${plainError(state.error).plain} Showing the result from ${finishedAt === null ? "an earlier run" : formatTime(finishedAt)}.`;
  }
  return updating(state.kind === "running" ? `${stageWords(state.stage)}.` : text);
}

// A re-run's line, which leaves out the title the row already shows.
export const updating = (text: string) => `Re-run: ${text[0].toLowerCase()}${text.slice(1)}`;

// A row's state line and what follows it. The page announces runs, so nothing here is a live region.
export function StateRegion({ line, children }: { line: string; children?: ReactNode }) {
  return (
    <div className="state">
      {line && <p>{line}</p>}
      {children}
    </div>
  );
}

export interface Refusal { message: string; refusedAt: number; retry: boolean }

// What a row knows of its package's state, shared by its card in the list and the open package's
// subheader. `outdated` and `versionNote` are false and null where they cannot apply.
export interface StatusModel {
  state: RowState;
  line: string;
  pending: boolean;
  refusal: Refusal | null;
  finished: Finished | null;
  outdated: boolean;
  versionNote: string | null;
}

// A package's state when the page cannot read it, as while its runs listener is refused.
export const UNREAD_STATUS: StatusModel = {
  state: { kind: "not-run" }, line: "", pending: false, refusal: null, finished: null, outdated: false, versionNote: null
};

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
  const refusal = request && "message" in request && request.at === resultAt ? request : null;
  const resume = state.kind === "stuck" && state.resumable;
  const resuming = resume && request !== undefined && "resuming" in request && request.at === resultAt;
  const requested = request !== undefined && "requested" in request && !request.lapsed && request.at === resultAt;
  // While a request from this row is in flight, a waiting row reads as queued, not as waiting for a machine.
  const shown: RowState = pending && state.kind === "queued" && state.waiting ? { ...state, waiting: false } : state;
  const line = !resuming ? rowLine(shown, title, true, finishedAt) : finishedAt === undefined ? RESUMING : updating(RESUMING);
  const offer = runOffer(row.runnable, state);
  return {
    key, title, state, finished, line, pending, refusal, resume, offer,
    disabled: !offer.enabled || pending || resuming,
    outdated: outOfDate(key, result, newest, behind, pending || requested),
    versionNote: finished && finished.package.version !== row.current_version.version ? `from ${finished.package.version}` : null
  };
}

// The state line and Requesting; with `withFinished`, the summary of the finished result a row keeps
// through a re-run (a done row's state line already holds its summary), and when it finished. A
// failure and a refusal are RowProblems'. `withNotRun` false leaves out the line of a package never
// run, where a status pill says it.
export function RowStatus({ model, withFinished = true, withNotRun = true }: {
  model: StatusModel; withFinished?: boolean; withNotRun?: boolean;
}) {
  const { state, pending, finished, outdated } = model;
  const line = state.kind === "failed" || (!withNotRun && state.kind === "not-run") ? "" : model.line;
  return (
    <>
      <StateRegion line={line}>{pending && <p>Requesting…</p>}</StateRegion>
      {withFinished && finished && state.kind !== "done" && <p className="summary">{finished.summary ?? "Finished."}</p>}
      {withFinished && finished && <p className="when finished-at"><FinishedWhen ms={millis(finished.finished_at)} />{model.versionNote && ` · ${model.versionNote}`}</p>}
      {outdated && <p className="notice">Students have saved work since this result.</p>}
    </>
  );
}

export const CONTACT_URL = "https://concord.org/about/contact/";

// A failed run, with what to do next and when it failed, and a refused Run, with when it was refused and,
// where pressing Run again may help, what to do next, as error panels the full width of what holds them.
// `runnable` false, for a package with no Run here, leaves out the advice to run it again.
export function RowProblems({ model, runnable = true }: { model: StatusModel; runnable?: boolean }) {
  const { state, line, refusal } = model;
  const detail = state.kind === "failed" ? plainError(state.error).detail : null;
  return (
    <div className="row-problems">
      {state.kind === "failed" && (
        <Callout tone="error">
          {line} {runnable ? <>Run it again; if it keeps failing, <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">contact Concord</a>.</> : <>If you need this result, <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">contact Concord</a>.</>}
          {detail && <>{" "}<span className="detail">Details: <code>{detail}</code></span></>}
          {" "}{state.finishedAt !== null && <span className="when">Failed <Time ms={state.finishedAt} /></span>}
        </Callout>
      )}
      {refusal && (
        <Callout tone="error">
          <span>{sentence(refusal.message)}</span>
          {refusal.retry && <> Run it again; if it keeps happening, <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">contact Concord</a>.</>}
          {" "}<span className="when">Refused <Time ms={refusal.refusedAt} /></span>
        </Callout>
      )}
    </div>
  );
}

type Tone = "idle" | "busy" | "ok" | "warn" | "error";

// Every status a pill can show, in the order the status menu offers them.
export const STATUSES = [
  "Not run", "Requesting", "Waiting to start", "Queued", "Running", "Paused", "Interrupted", "Finished", "Failed", "Re-run failed"
] as const;
export type Status = (typeof STATUSES)[number];

// A package's state in a word or two, for the pill beside its Run. The label is the status, but for a
// queued package's place in line.
export function statusPill(model: StatusModel): { status: Status; label: string; tone: Tone } {
  const { state, pending, finished } = model;
  const pill = (status: Status, tone: Tone, label: string = status) => ({ status, label, tone });
  if (pending) return pill("Requesting", "busy");
  switch (state.kind) {
    case "not-run": return pill("Not run", "idle");
    case "queued":
      if (state.waiting) return pill("Waiting to start", "warn");
      return pill("Queued", "busy", state.position === null ? "Queued" : `Queued, #${state.position}`);
    case "running": return pill("Running", "busy");
    case "stuck": return state.resumable ? pill("Paused", "warn") : pill("Interrupted", "warn");
    case "done": return pill("Finished", "ok");
    case "failed": return pill(finished ? "Re-run failed" : "Failed", "error");
  }
}

// A package's state in a word or two; a running one also shows how long it has been going, by the second.
export function StatusPill({ model }: { model: StatusModel }) {
  const { label, tone } = statusPill(model);
  const run = model.state.kind === "running" && !model.pending ? model.state : null;
  const startedAt = run?.startedAt ?? null;
  const now = useNow(startedAt !== null);
  return (
    <span className={`status-pill ${tone}${run ? " throb" : ""}`}>
      <span className="label">{label}</span>
      {startedAt !== null && <span className="elapsed"> · {elapsedText(now - startedAt)}</span>}
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

export const COMMUNITY_WARNING = "Community analyses are not reviewed by Concord. Running one runs a stranger's code with "
  + "your access to student data, and nothing stops it sending that data elsewhere.";

// Cancel takes focus so a double Enter cannot run a stranger's code; focus returns to the element focused
// when the warning first rendered.
export function CommunityConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [before] = useState(() => document.activeElement as HTMLElement | null);
  const warning = useId();
  useEffect(() => {
    cancel.current?.focus();
    return () => before?.focus();
  }, [before]);
  return (
    <div className="community-confirm" role="group" aria-label="Run a community analysis?" aria-describedby={warning}
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <p id={warning}>{COMMUNITY_WARNING}</p>
      <div className="confirm-buttons">
        <button type="button" className="icon-button danger" onClick={onConfirm}><CheckIcon aria-hidden="true" />Run anyway</button>
        <button type="button" ref={cancel} className="icon-button" onClick={onCancel}><XMarkIcon aria-hidden="true" />Cancel</button>
      </div>
    </div>
  );
}

// Opens the package's view, on a card whose package has a finished result with something to read,
// including one a re-run is replacing or failed to replace.
export function ViewResult({ model, title, onOpen }: { model: StatusModel; title: string; onOpen: () => void }) {
  if (!model.finished?.display) return null;
  return (
    <button type="button" className="icon-button" aria-label={`View result for ${title}`} onClick={onOpen}>
      <DocumentTextIcon aria-hidden="true" />View result
    </button>
  );
}

// A package's title as the link that opens it, after the Analytics tab's icon.
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

// Each filter pill's icon, which a card's tag repeats for the group it is in, and the pill's title, by key.
const GROUPS: Record<string, { icon: ComponentType<SVGProps<SVGSVGElement>>; title: string }> = {
  search: { icon: MagnifyingGlassIcon, title: "Analyses that match your search" },
  all: { icon: Squares2X2Icon, title: "Every analysis that applies to this class" },
  official: { icon: CheckBadgeIcon, title: "Analyses made and reviewed by Concord" },
  projects: { icon: FolderIcon, title: "Analyses shared with this class's research projects" },
  mine: { icon: UserIcon, title: "Analyses you uploaded" },
  community: { icon: GlobeAltIcon, title: "Analyses other researchers shared publicly, which Concord has not reviewed" },
  unlisted: { icon: ArchiveBoxIcon, title: "Results of analyses this class's list no longer offers" }
};

const GroupIcon = ({ group }: { group: string }) => {
  const Icon = GROUPS[group]?.icon;
  return Icon ? <Icon aria-hidden="true" /> : null;
};

// A card's group tag, after its version, which a screen reader hears as the group.
export function GroupTag({ group, children }: { group: string; children: ReactNode }) {
  return <><span className="visually-hidden">Group: </span><span className="tag"><GroupIcon group={group} />{children}</span></>;
}

// A card's heading: its title link, version and group, so a screen reader can move from card to card.
export function CardTitle({ link, version, tag }: { link: ReactNode; version: string; tag: ReactNode }) {
  return (
    <h3 className="card-title">
      {link}{" "}<span className="visually-hidden">Version </span><span className="version">{version}</span> {tag}
    </h3>
  );
}

export interface Card {
  row: PackageRow;
  group: string;
  tag: string;
  model: RowModel;
}

export interface RowProps extends Card {
  search: string | null;
  onRun: (row: PackageRow, resume: boolean) => void;
  onOpen: (key: string) => void;
  linkRef: (key: string, link: HTMLAnchorElement | null) => void;
  confirming: string | null;
  onConfirm: (row: PackageRow) => void;
  onCancel: () => void;
}

function Row({ row, group, tag, model, search, onRun, onOpen, linkRef, confirming, onConfirm, onCancel }: RowProps) {
  const asking = confirming === model.key;
  return (
    <li className="card">
      <div className="card-main">
        <CardTitle link={<OpenLink resultKey={model.key} onOpen={onOpen} linkRef={linkRef}><Highlight text={model.title} search={search} /></OpenLink>}
          version={row.current_version.version} tag={<GroupTag group={group}>{tag}</GroupTag>} />
        {row.current_version.description && <p className="description"><Highlight text={row.current_version.description} search={search} /></p>}
        <code className="identity"><Highlight text={row.identity} search={search} /></code>
        <RowStatus model={model} withNotRun={false} />
      </div>
      <div className="controls">
        <RunButton row={row} model={model} onRun={onRun} held={asking}
          before={<><StatusPill model={model} /><ViewResult model={model} title={model.title} onOpen={() => onOpen(model.key)} /></>} />
      </div>
      <RowProblems model={model} runnable={row.runnable} />
      {asking && <CommunityConfirm onConfirm={() => onConfirm(row)} onCancel={onCancel} />}
    </li>
  );
}

// What a card's model is read from, beside its row.
export interface ListContext {
  classHash: string;
  results: Map<string, Result>;
  runner: Runner | null;
  mark: SessionMark | null;
  requests: Map<string, RunRequest>;
  newest: number | null;
  behind: Map<string, unknown>;
}

// The cards of the groups the filter pill keeps, each tagged with its group: a group's key keeps that
// group's, and "all" keeps every group's in one list from A to Z.
export function listCards(groups: Group[], filter: string, { results, requests, ...rest }: ListContext): Card[] {
  const cards = groups.filter((g) => filter === "all" || g.key === filter).flatMap((g) => g.rows.map((row) => {
    const key = packageKey(row.identity);
    return { row, group: g.key, tag: g.tag(row), model: rowModel({ row, result: results.get(key), request: requests.get(key), ...rest }) };
  }));
  return filter === "all" ? cards.sort((a, b) => byTitle(a.row, b.row)) : cards;
}

export interface ListProps {
  cards: Card[];
  search: string | null;
  onRun: (row: PackageRow, resume: boolean) => void;
  onOpen: (key: string) => void;
  linkRef: (key: string, link: HTMLAnchorElement | null) => void;
  confirming: string | null;
  onConfirm: (row: PackageRow) => void;
  onCancel: () => void;
}

// One list of cards, each tagged with its group, with `search`'s words marked where they appear.
// `confirming` is the package key whose community warning is showing.
export function PackageList({ cards, ...rest }: ListProps) {
  return (
    <ul className="package-rows">
      {cards.map((card) => <Row key={card.row.catalog_id} {...card} {...rest} />)}
    </ul>
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
    <div role="group" aria-label="Filter analyses" className="filters">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={o.key === selected} title={GROUPS[o.key]?.title} onClick={() => onSelect(o.key)}>
          <GroupIcon group={o.key} />{o.label} <span className="count">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

// Text with each place a search's words appear in it marked, ignoring case; with no search, the text.
export function Highlight({ text, search }: { text: string; search: string | null }) {
  const words = search ? searchWords(search) : [];
  if (words.length === 0) return <>{text}</>;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return <>{parts.map((part, i) => (i % 2 === 1 ? <mark key={i} className="match">{part}</mark> : part))}</>;
}

// The search above the pills. Submitting it sets the list's search, and submitting it empty clears it;
// the field shows the search again whenever the page's search changes, as on Back, and keeps focus.
export function PackageSearch({ search, onSearch }: { search: string | null; onSearch: (q: string | null) => void }) {
  const [text, setText] = useState(search ?? "");
  const [shown, setShown] = useState(search);
  if (search !== shown) {
    setShown(search);
    setText(search ?? "");
  }
  return (
    <form role="search" className="package-search" onSubmit={(e) => { e.preventDefault(); onSearch(text.trim() || null); }}>
      <input type="search" name="q" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search for an analysis..."
        aria-label="Search for an analysis" />
      <button type="submit" className="icon-button"><MagnifyingGlassIcon aria-hidden="true" />Search</button>
    </form>
  );
}

// The menu beside the pills that narrows the list to one status, with how many cards the pills keep in
// each. It offers only the statuses some card has, and the one chosen.
export function StatusFilter({ counts, selected, onSelect }: {
  counts: Map<Status, number>;
  selected: Status | "all";
  onSelect: (status: Status | "all") => void;
}) {
  return (
    <select className="status-filter" aria-label="Filter analyses by run status" value={selected}
      onChange={(e) => onSelect(e.target.value as Status | "all")}>
      <option value="all">All run statuses</option>
      {STATUSES.filter((s) => counts.get(s) || s === selected).map((s) => <option key={s} value={s}>{s} ({counts.get(s) ?? 0})</option>)}
    </select>
  );
}
