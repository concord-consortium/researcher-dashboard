import { ClipboardDocumentListIcon, CubeIcon, UserGroupIcon } from "@heroicons/react/16/solid";
import { useEffect, useMemo, useRef, useState } from "react";
import { Callout } from "../components/Callout";
import { ClassActivity, RERUNS, STOPPED, type Stopped } from "../components/ClassActivity";
import { ClassCard } from "../components/ClassCard";
import { Counts } from "../components/Counts";
import { Header } from "../components/Header";
import {
  CommunityConfirm, listCards, PackageFilters, PackageList, PackageSearch, rowModel, RunButton, StatusFilter, StatusPill, statusPill, UNREAD_STATUS,
  type FilterOption, type Status
} from "../components/PackageList";
import { PackageView } from "../components/PackageView";
import { panelId, tabId, Tabs } from "../components/Tabs";
import { Unlisted, unlistedModel, unlistedTitle } from "../components/Unlisted";
import { runNews } from "../shell/announce";
import { groupPackages, identityOfKey, matchesSearch, needsRefresh, packageKey, projectNames, scopeUrls, titleOf, type Profile } from "../shell/packages";
import { ApiError, SessionExpired, type PackageRow, type Scope, type User } from "../shell/portal";
import { PROFILE_MAX_AGE_MS } from "../shell/portals";
import {
  ACCEPTED_WAIT_MS, latestFinished, millis, nextMark, sentence, sessionLines,
  type Counts as CountsDoc, type Result, type Runner, type RunRequest, type SessionMark
} from "../shell/runs";
import { assignmentActivity, behindRows, newestActivity, type Activity } from "../shell/activity";
import { Time } from "../components/Time";
import { useAutoRerun } from "../shell/rerun";
import { ALL_PACKAGES, plainClick, routeHash, useRoute } from "../shell/route";
import type { DashboardServices } from "../shell/services";
import type { InfoReason } from "../shell/start";
import { Info } from "./Info";

type Source = "portal" | "report-server" | "firebase";

// What to say when a call fails with no message of its own to show.
const UNREACHABLE: Record<Source, string> = {
  portal: "The portal could not be reached.",
  "report-server": "The analysis catalog could not be reached.",
  firebase: "This class's profile, your runs and your counts could not be read."
};

const PROFILE_REFUSED = "This class's profile could not be read.";
const ACTIVITY_REFUSED = "Class activity could not be read.";

const NOT_RECORDED = "No student saves have been recorded for that assignment.";

const NotRecorded = () => <abbr title={NOT_RECORDED}>n/a</abbr>;

const AssignmentTool = ({ tool }: { tool: string | null }) =>
  tool ? <span className="tool"> · {tool === "ActivityPlayer" ? "Activity Player" : tool}</span> : null;

// The page's own title, as its HTML gave it, read once: a dashboard mounted again sees it unchanged.
let firstTitle: string | null = null;
const pageTitle = () => (firstTitle ??= document.title);

// The dashboard for the class the token is bound to, never the one the launch link asked for.
// `portal` is the origin of the portal that launched the page, the class's home.
export function ClassDashboard({ services, onExpired, portal = null, demo = false }: {
  services: DashboardServices;
  onExpired: () => void;
  portal?: string | null;
  demo?: boolean;
}) {
  const [scope, setScope] = useState<Scope | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [info, setInfo] = useState<InfoReason | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // undefined until the first snapshot; null while the document does not exist.
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [profileProblem, setProfileProblem] = useState<string | null>(null);
  const [refreshProblem, setRefreshProblem] = useState<string | null>(null);
  // undefined until the first snapshot or after the listener is refused; null while the researcher has no runner.
  const [runnerDoc, setRunner] = useState<Runner | null | undefined>(undefined);
  const runner = runnerDoc ?? null;
  const [mark, setMark] = useState<SessionMark | null>(null);
  // undefined until the first snapshot; null while the document does not exist.
  const [counts, setCounts] = useState<CountsDoc | null | undefined>(undefined);
  const [received, setReceived] = useState<Map<string, Result>>(new Map());
  const [requests, setRequests] = useState<Map<string, RunRequest>>(new Map());
  const [route, navigate] = useRoute();
  const selectedKey = route.tab === "packages" ? route.key : null;
  const search = route.tab === "packages" && route.q ? route.q : null;
  const openLinks = useRef(new Map<string, HTMLAnchorElement>());
  // What the page says of a result whose package it no longer lists, by identity.
  const [notes, setNotes] = useState<Map<string, string | null>>(new Map());
  const asked = useRef(new Set<string>());
  const [runsProblem, setRunsProblem] = useState<string | null>(null);
  // While the session or the results listener is refused, a row's state cannot be told, so none is shown.
  const results = useMemo(() => (runsProblem ? new Map<string, Result>() : received), [runsProblem, received]);
  const [countsProblem, setCountsProblem] = useState<string | null>(null);
  // undefined until the first snapshot, and again once the listener is refused.
  const [activity, setActivity] = useState<Map<string, Activity> | undefined>(undefined);
  const [activityProblem, setActivityProblem] = useState<string | null>(null);
  // Set when an automatic request finds the sign-in expired or not renewable. A Run that succeeds
  // ends it; one that has to sign in again leaves the page, and the new page starts with it unset.
  const [stopped, setStopped] = useState<Stopped | null>(null);
  const [rows, setRows] = useState<PackageRow[] | null>(null);
  const [listProblem, setListProblem] = useState<string | null>(null);
  const refreshed = useRef(false);
  // An accepted request's timeouts while the page is mounted, cleared when it goes; null once it has
  // gone, so a request answered after that starts none.
  const acceptedTimers = useRef<Set<ReturnType<typeof setTimeout>> | null>(null);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    acceptedTimers.current = timers;
    return () => {
      timers.forEach(clearTimeout);
      acceptedTimers.current = null;
    };
  }, []);

  // How a refused call becomes page state. From the portal's dashboard endpoints (the scope, the
  // profile refresh and the run request), a 403 means the researcher check failed and a 404 that
  // the class no longer exists. Its Firebase token call answers that check with a 400.
  function refused(error: unknown, show: (message: string) => void, from: Source) {
    if (error instanceof SessionExpired) return error.young ? setInfo("expired") : onExpired();
    if (error instanceof ApiError && error.status === 403 && from === "portal") return setInfo("withdrawn");
    if (error instanceof ApiError && error.status === 404 && from === "portal") return setInfo("class-gone");
    if (error instanceof ApiError && error.reason) return show(error.reason);
    show(UNREACHABLE[from]);
  }

  useEffect(() => {
    let canceled = false;
    services.portal.scope()
      .then((loaded) => {
        if (canceled) return;
        if (loaded.kind !== "class") setInfo("unsupported-scope");
        else setScope(loaded);
      })
      .catch((error) => { if (!canceled) refused(error, setFailure, "portal"); });
    return () => { canceled = true; };
  }, [services]);

  // For display only, so a refusal leaves the header without a name rather than changing the page.
  useEffect(() => {
    let canceled = false;
    services.portal.user()
      .then((loaded) => { if (!canceled) setUser(loaded); })
      .catch(() => {});
    return () => { canceled = true; };
  }, [services]);

  // Stopped as soon as the page turns into an info page, so a researcher told their access was
  // withdrawn stops receiving the class's documents.
  useEffect(() => {
    if (!scope || info) return;
    let stop: (() => void) | null = null;
    let canceled = false;
    services.watchClass(scope, {
      profile: setProfile,
      runner: (next) => {
        setRunner(next);
        setMark((m) => nextMark(m, next));
      },
      counts: setCounts,
      results: setReceived,
      activity: setActivity,
      refused: (which) => {
        if (which === "profile") return setProfileProblem(PROFILE_REFUSED);
        if (which === "activity") {
          setActivity(undefined);
          return setActivityProblem(ACTIVITY_REFUSED);
        }
        if (which === "counts") {
          setCounts(undefined);
          return setCountsProblem("Your current status could not be read.");
        }
        if (which === "runner") setRunner(undefined);
        setRunsProblem("Your runs could not be read.");
      }
    })
      .then((unsubscribe) => { if (canceled) unsubscribe(); else stop = unsubscribe; })
      .catch((error) => {
        if (canceled) return;
        refused(error, (message) => {
          setProfileProblem(message);
          setActivityProblem(ACTIVITY_REFUSED);
        }, "firebase");
      });
    return () => { canceled = true; stop?.(); };
  }, [scope, services, info]);

  // Decided on the first snapshot only, so a derivation that keeps failing cannot loop.
  useEffect(() => {
    if (!scope || profile === undefined || refreshed.current) return;
    refreshed.current = true;
    if (!needsRefresh(profile, scope, services.now(), PROFILE_MAX_AGE_MS)) return;
    services.portal.refreshProfile().catch((error) => refused(error, setRefreshProblem, "portal"));
  }, [scope, profile, services]);

  // Keyed on the URLs rather than the profile, so a snapshot changing only derived_at does not
  // list again; the cleanup discards an answer that arrives after a newer call.
  const urlsKey = profile ? JSON.stringify(scopeUrls(profile)) : null;
  useEffect(() => {
    if (!urlsKey) return;
    let current = true;
    setRows(null);
    setListProblem(null);
    services.reportServer.listPackages(JSON.parse(urlsKey) as string[])
      .then((listed) => { if (current) setRows(listed); })
      .catch((error) => { if (current) refused(error, setListProblem, "report-server"); });
    return () => { current = false; };
  }, [urlsKey, services]);

  // The results as of the latest snapshot, for a handler that resumes after an await; the
  // `results` its render closed over is older.
  const latestResults = useRef(results);
  useEffect(() => { latestResults.current = results; }, [results]);

  const forget = (key: string, request?: RunRequest) =>
    setRequests((r) => {
      if (request && r.get(key) !== request) return r;
      const next = new Map(r);
      next.delete(key);
      return next;
    });

  // Resolves false only for an automatic request the sign-in refused, which may be asked again once
  // automatic re-runs are back on.
  async function run(row: PackageRow, resume: boolean, auto = false): Promise<boolean> {
    const key = packageKey(row.identity);
    setRequests((r) => new Map(r).set(key, { pending: true }));
    // An accepted Run is tied to the result it was sent against: a result that changes before the
    // answer arrives is the run's own progress, or its outcome.
    const sentAt = millis(latestResults.current.get(key)?.updated_at);
    try {
      await services.portal.runPackage(row.identity, row.current_version.version);
      if (!auto) setStopped(null);
      const timers = acceptedTimers.current;
      if (!timers) return true;
      const accepted: RunRequest = resume
        ? { resuming: true, at: millis(latestResults.current.get(key)?.updated_at) }
        : { requested: true, at: sentAt };
      setRequests((r) => new Map(r).set(key, accepted));
      const timer = setTimeout(() => {
        timers.delete(timer);
        if ("resuming" in accepted) return forget(key, accepted);
        setRequests((r) => (r.get(key) === accepted ? new Map(r).set(key, { ...accepted, lapsed: true }) : r));
      }, ACCEPTED_WAIT_MS);
      timers.add(timer);
      return true;
    } catch (error) {
      // An automatic request never signs in again: that leaves the page under a researcher who pressed nothing.
      if (auto && error instanceof SessionExpired) {
        forget(key);
        setStopped(error.young ? "not-renewed" : "expired");
        return false;
      }
      // Keyed to the result as the refusal finds it: the queued write lands before a VM step fails.
      const at = millis(latestResults.current.get(key)?.updated_at);
      const retry = !(error instanceof ApiError) || error.status >= 500;
      refused(error, (message) => setRequests((r) => new Map(r).set(key, { message, at, refusedAt: services.now(), retry })), "portal");
      return true;
    }
  }

  const listShown = Boolean(profile && rows && !listProblem && !profileProblem);
  const groups = useMemo(() => (rows && scope ? groupPackages(rows, scope) : []), [rows, scope]);
  const grouped = useMemo(() => groups.flatMap((g) => g.rows), [groups]);
  // The list's filter pill, by group key; "all" when the group it named has gone.
  const [filterKey, setFilter] = useState(() => (search ? "search" : "all"));
  const [statusFilter, setStatus] = useState<Status | "all">("all");
  // A search that arrives in the URL, as on Back, presses Search Results.
  const [seenSearch, setSeenSearch] = useState(search);
  if (search !== seenSearch) {
    setSeenSearch(search);
    if (search) setFilter("search");
  }
  // The community package whose warning is showing, which runs only on Confirm.
  const [confirming, setConfirming] = useState<string | null>(null);
  const community = useMemo(() => new Set(groups.find((g) => g.key === "community")?.rows.map((r) => packageKey(r.identity))), [groups]);
  const listedTitles = useMemo(() => new Map(grouped.map((r) => [packageKey(r.identity), titleOf(r)])), [grouped]);
  // Every title the list returned, applicable or not, for results the page no longer lists.
  const allTitles = useMemo(() => new Map((rows ?? []).map((r) => [r.identity, titleOf(r)])), [rows]);
  const namedProjects = useMemo(() => projectNames(rows ?? []), [rows]);

  // The page's one announcement of how runs move on: a run starting, finishing or failing, a refused
  // Run, the runner failing, and the counts becoming unreadable, each said once; a run's news names its
  // package. It sits outside both tab panels, so it is heard whichever tab is showing. Rows and the
  // header say nothing.
  const [announcement, setAnnouncement] = useState("");
  const heard = useRef<{ results: Map<string, Result> | null; requests: Map<string, RunRequest>; runnerState: string | null; countsProblem: string | null }>(
    { results: null, requests: new Map(), runnerState: null, countsProblem: null });
  useEffect(() => {
    const titleAt = (key: string) => listedTitles.get(key) ?? unlistedTitle(identityOfKey(key), allTitles);
    const before = heard.current;
    const news = runNews(before.results, results, titleAt);
    for (const [key, request] of requests) {
      if ("message" in request && before.requests.get(key) !== request) news.push(`${titleAt(key)} could not be run: ${sentence(request.message)}`);
    }
    const runnerState = runnerDoc?.state ?? null;
    if (runnerState === "failed" && before.runnerState !== "failed" && before.results) {
      news.push(`Runs stopped with an error: ${sentence(runnerDoc?.error ?? "no reason was given")}`);
    }
    if (countsProblem && countsProblem !== before.countsProblem) news.push(countsProblem);
    heard.current = { results: listShown ? results : before.results, requests, runnerState, countsProblem };
    // The same words again change by a trailing space, so they are still announced.
    if (news.length > 0) setAnnouncement((was) => (news.join(" ") === was ? `${was}\u00a0` : news.join(" ")));
  }, [results, requests, runnerDoc, countsProblem, listShown, listedTitles, allTitles]);

  const newest = activity ? newestActivity(activity) : null;
  const perAssignment = useMemo(() => new Map((activity && scope ? assignmentActivity(activity, scope.assignments.map((a) => a.offering_id)) : []).map((a) => [a.offeringId, a])), [activity, scope]);
  // An assignment with no recorded saves, as for one worked on only before activity was recorded,
  // shows n/a rather than a zero.
  const unrecorded = Boolean(activity && scope?.assignments.some((a) => !perAssignment.get(a.offering_id)?.students));
  // A community package runs only when pressed, after its warning, so it never re-runs on its own.
  const rerunnable = useMemo(() => grouped.filter((r) => !community.has(packageKey(r.identity))), [grouped, community]);
  // An info page re-runs nothing: its listeners have stopped, but a list answered late still lands.
  const behind = useMemo(
    () => listShown && scope && !stopped && !info
      ? behindRows({ listed: rerunnable, results, runner, mark, classHash: scope.class_hash, newest, requests })
      : new Map<string, { row: PackageRow; at: number | null }>(),
    [listShown, stopped, info, rerunnable, results, runner, mark, scope, newest, requests]
  );
  useAutoRerun(behind, stopped !== null, (_key, row) => run(row, false, true));

  // While the list is loading or failed, every result would look unlisted, so none is placed.
  const unlisted = useMemo(
    () => (listShown ? [...results.values()].filter((r) => !listedTitles.has(packageKey(r.package.identity))) : []),
    [listShown, results, listedTitles]
  );

  // A package the list returned says why from its own row; any other is asked about once.
  const rowNotes = useMemo(() => new Map((rows ?? []).map((r) => [r.identity, r.applies
    ? "This analysis is not offered in any of this class's groups."
    : "This analysis no longer applies to this class."])), [rows]);

  useEffect(() => {
    for (const result of unlisted) {
      const { identity, version } = result.package;
      if (rowNotes.has(identity) || asked.current.has(identity)) continue;
      asked.current.add(identity);
      const note = (text: string | null) => setNotes((n) => new Map(n).set(identity, text));
      services.reportServer.resolve(identity, version)
        .then((resolved) => note(resolved.archived ? "This analysis has been archived." : null))
        .catch((error) => {
          if (error instanceof SessionExpired) return refused(error, () => {}, "report-server");
          note(error instanceof ApiError && error.status === 404 ? "This analysis is no longer available to you." : null);
        });
    }
  }, [unlisted, rowNotes, services]);

  // Leaving a package for the list puts focus back on the package's link there.
  const left = useRef<string | null>(null);
  useEffect(() => {
    const key = left.current;
    left.current = selectedKey;
    if (!key || selectedKey) return;
    openLinks.current.get(key)?.focus();
  }, [selectedKey]);

  const linkRef = (key: string, link: HTMLAnchorElement | null) => {
    if (link) openLinks.current.set(key, link);
    else openLinks.current.delete(key);
  };
  const openPackage = (key: string) => navigate({ tab: "packages", key });
  // The open view keeps the result it read even if a listener is refused later.
  const opened = selectedKey ? latestFinished(received.get(selectedKey)) : null;

  // Before the list arrives a running package has no title, so the line names none.
  const session = scope ? sessionLines(runnerDoc, scope.class_hash, results,
    (key) => (rows ? listedTitles.get(key) ?? unlistedTitle(identityOfKey(key), allTitles) : null),
    [...requests.values()].some((r) => "pending" in r)) : [];

  const selectedRow = selectedKey && listShown ? grouped.find((r) => packageKey(r.identity) === selectedKey) ?? null : null;
  // An open package the list no longer shows keeps its view while its runs cannot be read, with no state shown.
  const selectedUnlisted = selectedKey && !selectedRow
    ? unlisted.find((r) => packageKey(r.package.identity) === selectedKey) ?? (runsProblem && listShown ? received.get(selectedKey) : null) ?? null
    : null;

  // The browser tab names the view, the open package or the tab, then the class, before the page's own title.
  const baseTitle = pageTitle();
  const viewTitle = route.tab === "info" ? "Info"
    : selectedRow ? titleOf(selectedRow) : selectedUnlisted ? unlistedTitle(selectedUnlisted.package.identity, allTitles) : "Analytics";
  const className = scope?.name ?? null;
  useEffect(() => {
    document.title = className && !info ? `${viewTitle} - ${className} - ${baseTitle}` : baseTitle;
    return () => { document.title = baseTitle; };
  }, [viewTitle, className, info, baseTitle]);

  if (info) return <Info reason={info} demo={demo} user={user} portal={portal} />;
  if (!scope) {
    return (
      <main className="loading">
        <p role="status" className={failure ? "error" : undefined}>{failure ?? "Loading the class…"}</p>
      </main>
    );
  }

  const selectedModel = selectedRow && rowModel({
    row: selectedRow, result: results.get(selectedKey!), runner, mark, classHash: scope.class_hash,
    request: requests.get(selectedKey!), newest, behind
  });
  const selectedUnlistedModel = selectedUnlisted && (runsProblem ? UNREAD_STATUS : unlistedModel(selectedUnlisted, runner, mark, scope.class_hash,
    unlistedTitle(selectedUnlisted.package.identity, allTitles)));
  const allNotes = new Map([...notes, ...rowNotes]);
  const searchGroups = search
    ? groups.map((g) => ({ ...g, rows: g.rows.filter((r) => matchesSearch(search, [titleOf(r), r.current_version.description, r.identity, g.tag(r)])) }))
    : [];
  const searchUnlisted = search
    ? unlisted.filter((r) => matchesSearch(search, [unlistedTitle(r.package.identity, allTitles), r.package.identity]))
    : [];
  const searchFound = searchGroups.reduce((n, g) => n + g.rows.length, 0) + searchUnlisted.length;
  const filters: FilterOption[] = [
    ...(search ? [{ key: "search", label: "Search Results", count: searchFound }] : []),
    { key: "all", label: "All", count: grouped.length + unlisted.length },
    ...groups.map((g) => ({ key: g.key, label: g.heading, count: g.rows.length })),
    ...(unlisted.length > 0 ? [{ key: "unlisted", label: "No longer listed", count: unlisted.length }] : [])
  ];
  const filter = filters.some((f) => f.key === filterKey) ? filterKey : "all";
  // The cards the filter pill keeps, which the status menu counts and then narrows to one status.
  const context = { classHash: scope.class_hash, results, runner, mark, requests, newest, behind };
  const cards = filter === "search" ? listCards(searchGroups, "all", context) : filter === "unlisted" ? [] : listCards(groups, filter, context);
  const pillUnlisted = filter === "search" ? searchUnlisted : filter === "all" || filter === "unlisted" ? unlisted : [];
  const unlistedStatus = new Map(pillUnlisted.map((r) => [r, statusPill(unlistedModel(r, runner, mark, scope.class_hash, unlistedTitle(r.package.identity, allTitles))).status]));
  const statusCounts = new Map<Status, number>();
  for (const s of [...cards.map((c) => statusPill(c.model).status), ...unlistedStatus.values()]) statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
  const keeps = (s: Status) => statusFilter === "all" || s === statusFilter;
  const shownCards = cards.filter((c) => keeps(statusPill(c.model).status));
  const shownUnlisted = pillUnlisted.filter((r) => keeps(unlistedStatus.get(r)!));
  // A pressed Run of a community package asks first; Resume finishes a run already confirmed. Either
  // lifts a status filter, which the run's new status would hide the card from.
  const press = (row: PackageRow, resume: boolean) => {
    setStatus("all");
    if (!resume && community.has(packageKey(row.identity))) setConfirming(packageKey(row.identity));
    else void run(row, resume);
  };
  const confirm = (row: PackageRow) => { setConfirming(null); void run(row, false); };
  const anyListed = grouped.length + unlisted.length > 0;
  const anyRerunnable = rerunnable.some((r) => latestFinished(results.get(packageKey(r.identity))));
  const emptyList = filter === "search" && searchFound === 0 ? `No analyses match “${search}”.` : `No analyses here have the run status ${statusFilter}.`;
  // What the list's pills and menu leave, said when a search or a filter changes it.
  const listNews = filter === "search" && searchFound > 0
    ? `${searchFound} ${searchFound === 1 ? "analysis matches" : "analyses match"} “${search}”.`
    : anyListed && shownCards.length === 0 && shownUnlisted.length === 0 && (filter === "search" || statusFilter !== "all") ? emptyList : "";
  // Any pill but Search Results ends the search.
  const selectFilter = (key: string) => { setFilter(key); if (key !== "search" && search) navigate(ALL_PACKAGES); };
  const searchFor = (q: string | null) => { setFilter(q ? "search" : "all"); navigate(q ? { tab: "packages", key: null, q } : ALL_PACKAGES); };
  const allPackages = () => { setFilter("all"); navigate(ALL_PACKAGES); };
  // The open package's own group for its breadcrumb, whatever filter it was opened from; its link filters the list to it.
  const crumbKey = selectedRow ? groups.find((g) => g.rows.includes(selectedRow))?.key : selectedUnlisted ? "unlisted" : undefined;
  const crumbOption = filters.find((f) => f.key === crumbKey);
  const filterCrumb = crumbOption ? { label: crumbOption.label, onSelect: () => { setFilter(crumbOption.key); navigate(ALL_PACKAGES); } } : null;
  const tab = route.tab;
  // What the page could not read, and in the list what may be missing from it. A package's view shows
  // these under its subheader, leaving out the list's own warning.
  const inView = Boolean((selectedRow && selectedModel) || selectedUnlisted);
  const messages = (inList: boolean) => (
    <div className="status" aria-live="polite">
      {profileProblem && <Callout tone="error">{profileProblem}</Callout>}
      {!profileProblem && !profile && !refreshProblem && <p>Reading this class's activities…</p>}
      {refreshProblem && <Callout tone="error">{refreshProblem}</Callout>}
      {inList && profile?.truncated && (
        <Callout tone="notice">
          This class's content was too large to read completely, so an analysis may be missing from this list.
        </Callout>
      )}
      {listProblem && <Callout tone="error">{listProblem}</Callout>}
      {runsProblem && <Callout tone="error">{runsProblem}</Callout>}
      {stopped && <Callout tone="error">{STOPPED[stopped]}</Callout>}
      {profile && !rows && !listProblem && !profileProblem && <p>Listing the analyses that apply…</p>}
    </div>
  );

  return (
    <>
      <Header scope={scope} user={user} demo={demo} activity={activity} now={services.now} session={session} runnerFailed={runner?.state === "failed"}
        tabs={<Tabs label="Dashboard sections" selected={tab} tabs={[{ key: "info", label: "Info", icon: UserGroupIcon }, { key: "packages", label: "Analytics", icon: CubeIcon }]}
          onSelect={(key) => navigate(key === "info" ? { tab: "info" } : ALL_PACKAGES)} />} />
      <p role="status" className="visually-hidden">{announcement}</p>
      <main className="class-dashboard">
        <div role="tabpanel" id={panelId("packages")} aria-labelledby={tabId("packages")} hidden={tab !== "packages"}>
          {!inView && messages(true)}
          {selectedRow && selectedModel ? (
            <PackageView key={selectedKey} title={selectedModel.title} description={selectedRow.current_version.description} status={selectedModel} note={null}
              run={<RunButton row={selectedRow} model={selectedModel} onRun={press} held={confirming === selectedKey} before={<StatusPill model={selectedModel} />} />}
              warning={confirming === selectedKey && <CommunityConfirm onConfirm={() => confirm(selectedRow)} onCancel={() => setConfirming(null)} />}
              classTitle={scope.name} finished={opened} filter={filterCrumb} onAll={allPackages} runnable={selectedRow.runnable}
              messages={messages(false)} />
          ) : selectedUnlisted && selectedUnlistedModel ? (
            <PackageView key={selectedKey} title={unlistedTitle(selectedUnlisted.package.identity, allTitles)} description={null}
              status={selectedUnlistedModel}
              note={allNotes.get(selectedUnlisted.package.identity) ?? null}
              run={<StatusPill model={selectedUnlistedModel} />}
              classTitle={scope.name} finished={opened} filter={filterCrumb} onAll={allPackages} runnable={false}
              messages={messages(false)} />
          ) : listShown && rows && (
            <section className="all-packages" aria-labelledby="packages-heading">
              <h2 id="packages-heading" className="visually-hidden">All Analyses</h2>
              {anyListed && <PackageSearch search={search} onSearch={searchFor} />}
              {anyListed && (
                <div className="list-filters">
                  <PackageFilters options={filters} selected={filter} onSelect={selectFilter} />
                  <StatusFilter counts={statusCounts} selected={statusFilter} onSelect={setStatus} />
                </div>
              )}
              {anyRerunnable && !stopped && <p className="list-note">{RERUNS}</p>}
              {filter !== "unlisted" && groups.length === 0 && <p>No analyses apply to this class yet.</p>}
              {anyListed && shownCards.length === 0 && shownUnlisted.length === 0 && (filter === "search" || statusFilter !== "all") && (
                <p>{emptyList}</p>
              )}
              <p role="status" className="visually-hidden">{listNews}</p>
              {shownCards.length > 0 && (
                <PackageList cards={shownCards} search={filter === "search" ? search : null} onRun={press} onOpen={openPackage} linkRef={linkRef}
                  confirming={confirming} onConfirm={confirm} onCancel={() => setConfirming(null)} />
              )}
              {shownUnlisted.length > 0 && (
                <Unlisted results={shownUnlisted} search={filter === "search" ? search : null} titles={allTitles} notes={allNotes} runner={runner} mark={mark}
                  classHash={scope.class_hash} onOpen={openPackage} linkRef={linkRef} />
              )}
            </section>
          )}
        </div>

        <div role="tabpanel" id={panelId("info")} aria-labelledby={tabId("info")} hidden={tab !== "info"}>
          {tab === "info" && messages(false)}
          <div className="info-grid">
            <section className="info-card wide" aria-labelledby="analyses-heading">
              <h2 id="analyses-heading"><CubeIcon aria-hidden="true" />Analyses</h2>
              <p>
                Pick analyses to run from the{" "}
                <a href={routeHash(ALL_PACKAGES)} onClick={(e) => { if (!plainClick(e)) return; e.preventDefault(); allPackages(); }}>Analytics tab</a>.
              </p>
            </section>
            <ClassCard scope={scope} projectNames={namedProjects} portal={portal} />
            <section className="info-card wide" aria-labelledby="assignments-heading">
              <h2 id="assignments-heading"><ClipboardDocumentListIcon aria-hidden="true" />Assignments</h2>
              <table className="assignment-activity">
                <thead><tr><th scope="col">Assignment</th><th scope="col">Students who saved work</th><th scope="col">Last change</th></tr></thead>
                <tbody>
                  {scope.assignments.map((a) => {
                    const worked = perAssignment.get(a.offering_id);
                    return (
                      <tr key={a.offering_id}>
                        <td>{a.name ?? "Untitled"}<AssignmentTool tool={a.tool} /></td>
                        <td>{!activity ? "…" : worked?.students ? worked.students : <NotRecorded />}</td>
                        <td>{!activity ? "…" : worked?.last != null ? <Time ms={worked.last} capitalized /> : <NotRecorded />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {unrecorded && <p className="footnote"><abbr>n/a</abbr>: {NOT_RECORDED}</p>}
            </section>
            <Counts counts={counts} problem={countsProblem} session={session} activity={activity} now={services.now} />
            <ClassActivity activity={activity} problem={activityProblem} stopped={stopped} />
          </div>
        </div>
      </main>
    </>
  );
}
