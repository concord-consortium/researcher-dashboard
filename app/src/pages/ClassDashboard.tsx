import { useEffect, useMemo, useRef, useState } from "react";
import { ClassActivity, type Stopped } from "../components/ClassActivity";
import { Counts } from "../components/Counts";
import { Header } from "../components/Header";
import { PackageList } from "../components/PackageList";
import { ResultView } from "../components/ResultView";
import { Unlisted } from "../components/Unlisted";
import { groupPackages, needsRefresh, packageKey, scopeUrls, titleOf, type Profile } from "../shell/packages";
import { ApiError, SessionExpired, type PackageRow, type Scope } from "../shell/portal";
import { PROFILE_MAX_AGE_MS } from "../shell/portals";
import {
  ACCEPTED_WAIT_MS, latestFinished, millis, nextMark, sessionLines,
  type Counts as CountsDoc, type Result, type Runner, type RunRequest, type SessionMark
} from "../shell/runs";
import { behindRows, newestActivity, type Activity } from "../shell/activity";
import { useAutoRerun } from "../shell/rerun";
import type { DashboardServices } from "../shell/services";
import type { InfoReason } from "../shell/start";
import { Info } from "./Info";

type Source = "portal" | "report-server" | "firebase";

// What to say when a call fails with no message of its own to show.
const UNREACHABLE: Record<Source, string> = {
  portal: "The portal could not be reached.",
  "report-server": "The package catalog could not be reached.",
  firebase: "This class's profile, your runs and your counts could not be read."
};

const PROFILE_REFUSED = "This class's profile could not be read.";
const ACTIVITY_REFUSED = "Class activity could not be read.";

// The dashboard for the class the token is bound to, never the one the launch link asked for.
export function ClassDashboard({ services, onExpired }: {
  services: DashboardServices;
  onExpired: () => void;
}) {
  const [scope, setScope] = useState<Scope | null>(null);
  const [info, setInfo] = useState<InfoReason | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // undefined until the first snapshot; null while the document does not exist.
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [profileProblem, setProfileProblem] = useState<string | null>(null);
  const [refreshProblem, setRefreshProblem] = useState<string | null>(null);
  const [runner, setRunner] = useState<Runner | null>(null);
  const [mark, setMark] = useState<SessionMark | null>(null);
  // undefined until the first snapshot; null while the document does not exist.
  const [counts, setCounts] = useState<CountsDoc | null | undefined>(undefined);
  const [received, setReceived] = useState<Map<string, Result>>(new Map());
  const [requests, setRequests] = useState<Map<string, RunRequest>>(new Map());
  // The open result, by package key, and the finish time of the result it opened on. Each opening
  // is numbered, so opening the result already open mounts its view again and takes focus to it.
  const [open, setOpen] = useState<{ key: string; shownAt: number | null; opening: number } | null>(null);
  const showButtons = useRef(new Map<string, HTMLButtonElement>());
  const resultsHeading = useRef<HTMLHeadingElement>(null);
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
          return setCountsProblem("Your counts could not be read.");
        }
        if (which === "runner") setRunner(null);
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
      refused(error, (message) => setRequests((r) => new Map(r).set(key, { message, at })), "portal");
      return true;
    }
  }

  const listShown = Boolean(profile && rows && !listProblem && !profileProblem);
  const grouped = useMemo(() => (rows && scope ? groupPackages(rows, scope).flatMap((g) => g.rows) : []), [rows, scope]);
  const listedTitles = useMemo(() => new Map(grouped.map((r) => [packageKey(r.identity), titleOf(r)])), [grouped]);

  const newest = activity ? newestActivity(activity) : null;
  // An info page re-runs nothing: its listeners have stopped, but a list answered late still lands.
  const behind = useMemo(
    () => listShown && scope && !stopped && !info
      ? behindRows({ listed: grouped, results, runner, mark, classHash: scope.class_hash, newest, requests })
      : new Map<string, { row: PackageRow; at: number | null }>(),
    [listShown, stopped, info, grouped, results, runner, mark, scope, newest, requests]
  );
  useAutoRerun(behind, stopped !== null, (_key, row) => run(row, false, true));

  // While the list is loading or failed, every result would look unlisted, so none is placed.
  const unlisted = useMemo(
    () => (listShown ? [...results.values()].filter((r) => !listedTitles.has(packageKey(r.package.identity))) : []),
    [listShown, results, listedTitles]
  );

  // A package the list returned says why from its own row; any other is asked about once.
  const rowNotes = useMemo(() => new Map((rows ?? []).map((r) => [r.identity, r.applies
    ? "This package is not offered in any of this class's groups."
    : "This package no longer applies to this class."])), [rows]);

  useEffect(() => {
    for (const result of unlisted) {
      const { identity, version } = result.package;
      if (rowNotes.has(identity) || asked.current.has(identity)) continue;
      asked.current.add(identity);
      const note = (text: string | null) => setNotes((n) => new Map(n).set(identity, text));
      services.reportServer.resolve(identity, version)
        .then((resolved) => note(resolved.archived ? "This package has been archived." : null))
        .catch((error) => {
          if (error instanceof SessionExpired) return refused(error, () => {}, "report-server");
          note(error instanceof ApiError && error.status === 404 ? "This package is no longer available to you." : null);
        });
    }
  }, [unlisted, rowNotes, services]);

  // A result queued before the function kept the last finished run has nothing left to show.
  useEffect(() => {
    if (open && !latestFinished(received.get(open.key))) {
      setOpen(null);
      resultsHeading.current?.focus();
    }
  }, [open, received]);

  const showRef = (key: string, button: HTMLButtonElement | null) => {
    if (button) showButtons.current.set(key, button);
    else showButtons.current.delete(key);
  };
  const show = (key: string) => setOpen((o) => ({
    key, shownAt: millis(latestFinished(results.get(key))?.finished_at), opening: (o?.opening ?? 0) + 1
  }));
  const close = () => {
    const key = open?.key;
    setOpen(null);
    const button = key ? showButtons.current.get(key) : undefined;
    // A Community row's button is hidden while its disclosure is closed, and cannot take focus.
    const disclosure = button?.closest("details");
    if (disclosure) disclosure.open = true;
    (button ?? resultsHeading.current)?.focus();
  };
  // The open view keeps the result it read even if a listener is refused later.
  const opened = open ? latestFinished(received.get(open.key)) : null;
  const openedAt = millis(opened?.finished_at);

  const session = scope ? sessionLines(runner, scope.class_hash, results, (key) => listedTitles.get(key) ?? null,
    [...requests.values()].some((r) => "pending" in r)) : [];
  // While the machine runs a package that already has a finished result, the session lines are not
  // announced; the package's row announces the outcome.
  const current = runner?.state === "running" ? runner.current_package : null;
  const rerunning = Boolean(current && scope && current.class_hash === scope.class_hash
    && latestFinished(results.get(current.package_key)));

  if (info) return <Info reason={info} />;
  if (!scope) {
    return (
      <main className="loading">
        <p role="status" className={failure ? "error" : undefined}>{failure ?? "Loading the class…"}</p>
      </main>
    );
  }

  return (
    <>
      <Header scope={scope} activity={activity} now={services.now} session={session} announce={!rerunning} />
      <main className="class-dashboard">
        <p className="ownership">
          Your results and counts on this page are your own: another researcher of this class sees their own runs. Class activity is the same for every researcher of this class.
        </p>

        <ClassActivity activity={activity} problem={activityProblem} stopped={stopped} />

        <section aria-labelledby="assignments-heading">
          <h2 id="assignments-heading">Assignments</h2>
          <ul className="assignments">
            {scope.assignments.map((a) => (
              <li key={a.offering_id}>
                {a.name ?? "Untitled"}
                {a.tool && <span className="tool"> · {a.tool}</span>}
              </li>
            ))}
          </ul>
        </section>

        <Counts counts={counts} />

        <section aria-labelledby="packages-heading">
          <h2 id="packages-heading">Packages</h2>
          <div className="status" aria-live="polite">
            {profileProblem && <p className="error">{profileProblem}</p>}
            {!profileProblem && !profile && !refreshProblem && <p>Reading this class's activities…</p>}
            {refreshProblem && <p className="error">{refreshProblem}</p>}
            {profile?.truncated && (
              <p className="notice">
                This class's content was too large to read completely, so a package may be missing from this list.
              </p>
            )}
            {listProblem && <p className="error">{listProblem}</p>}
            {runsProblem && <p className="error">{runsProblem}</p>}
            {countsProblem && <p className="error">{countsProblem}</p>}
            {profile && !rows && !listProblem && !profileProblem && <p>Listing the packages that apply…</p>}
          </div>
          {listShown && rows && (
            <PackageList rows={rows} scope={scope} results={results} runner={runner} mark={mark} requests={requests}
              newest={newest} behind={behind} onRun={run} onShow={show} showRef={showRef} />
          )}
        </section>

        <section aria-labelledby="results-heading">
          <h2 id="results-heading" ref={resultsHeading} tabIndex={-1}>Results</h2>
          {open && opened && (
            <ResultView key={`${open.key}:${open.opening}`} title={listedTitles.get(open.key) ?? opened.package.identity}
              classTitle={scope.name} finished={opened}
              updated={openedAt !== null && open.shownAt !== null && openedAt > open.shownAt ? openedAt : null} onClose={close} />
          )}
          {unlisted.length > 0 && (
            <Unlisted results={unlisted} notes={new Map([...notes, ...rowNotes])} runner={runner} mark={mark}
              classHash={scope.class_hash} onShow={show} showRef={showRef} />
          )}
          {!(open && opened) && unlisted.length === 0 && <p>Open a finished package's result to read it here.</p>}
        </section>
      </main>
    </>
  );
}
