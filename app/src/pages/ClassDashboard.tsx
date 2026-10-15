import { useEffect, useMemo, useRef, useState } from "react";
import { Counts } from "../components/Counts";
import { PackageList } from "../components/PackageList";
import { ResultView } from "../components/ResultView";
import { Unlisted } from "../components/Unlisted";
import { groupPackages, needsRefresh, packageKey, scopeUrls, titleOf, type Profile } from "../shell/packages";
import { ApiError, SessionExpired, type PackageRow, type Scope } from "../shell/portal";
import { PROFILE_MAX_AGE_MS } from "../shell/portals";
import {
  latestFinished, millis, nextMark, RESUME_WAIT_MS, sessionLines,
  type Counts as CountsDoc, type Result, type Runner, type RunRequest, type SessionMark
} from "../shell/runs";
import type { DashboardServices } from "../shell/services";
import type { InfoReason } from "../shell/start";
import { Info } from "./Info";

type Source = "portal" | "report-server" | "firebase";

// What to say when a call fails with no message of its own to show.
const UNREACHABLE: Record<Source, string> = {
  portal: "The portal could not be reached.",
  "report-server": "The package catalog could not be reached.",
  firebase: "This class's profile could not be read."
};

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
  // Without both the session and the results, a row's state cannot be told, so none is shown.
  const results = useMemo(() => (runsProblem ? new Map<string, Result>() : received), [runsProblem, received]);
  const [countsProblem, setCountsProblem] = useState<string | null>(null);
  const [rows, setRows] = useState<PackageRow[] | null>(null);
  const [listProblem, setListProblem] = useState<string | null>(null);
  const refreshed = useRef(false);
  // An accepted Resume's timeouts, cleared when the page goes.
  const resumeTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => {
    resumeTimers.current.forEach(clearTimeout);
    resumeTimers.current.clear();
  }, []);

  // How a refused call becomes page state. Only a 403 from the portal's dashboard endpoints
  // means the researcher check failed; its Firebase token answers that check with a 400.
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
      refused: (which) => {
        if (which === "profile") return setProfileProblem(UNREACHABLE.firebase);
        if (which === "counts") {
          setCounts(undefined);
          return setCountsProblem("Your counts could not be read.");
        }
        if (which === "runner") setRunner(null);
        setRunsProblem("Your runs could not be read.");
      }
    })
      .then((unsubscribe) => { if (canceled) unsubscribe(); else stop = unsubscribe; })
      .catch((error) => { if (!canceled) refused(error, setProfileProblem, "firebase"); });
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

  async function run(row: PackageRow, resume: boolean) {
    const key = packageKey(row.identity);
    setRequests((r) => new Map(r).set(key, { pending: true }));
    try {
      await services.portal.runPackage(row.identity, row.current_version.version);
      if (!resume) return forget(key);
      const resuming: RunRequest = { resuming: true, at: latestResults.current.get(key)?.updated_at?.toMillis() ?? null };
      setRequests((r) => new Map(r).set(key, resuming));
      const timer = setTimeout(() => {
        resumeTimers.current.delete(timer);
        forget(key, resuming);
      }, RESUME_WAIT_MS);
      resumeTimers.current.add(timer);
    } catch (error) {
      // Keyed to the result as the refusal finds it: the queued write lands before a VM step fails.
      const at = latestResults.current.get(key)?.updated_at?.toMillis() ?? null;
      refused(error, (message) => setRequests((r) => new Map(r).set(key, { message, at })), "portal");
    }
  }

  const listShown = Boolean(profile && rows && !listProblem && !profileProblem);
  const grouped = useMemo(() => (rows && scope ? groupPackages(rows, scope).flatMap((g) => g.rows) : []), [rows, scope]);
  const listedTitles = useMemo(() => new Map(grouped.map((r) => [packageKey(r.identity), titleOf(r)])), [grouped]);

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

  if (info) return <Info reason={info} />;
  if (!scope) {
    return (
      <main className="loading">
        <p role="status" className={failure ? "error" : undefined}>{failure ?? "Loading the class…"}</p>
      </main>
    );
  }

  return (
    <main className="class-dashboard">
      <header>
        <h1>{scope.name}</h1>
        <p className="meta">
          {scope.teachers.map((t) => t.name).join(", ")}
          {scope.cohorts.length > 0 && <> · {scope.cohorts.map((c) => c.name).join(", ")}</>}
        </p>
        <p className="ownership">
          Results and counts on this page are your own. Another researcher of this class sees their own runs.
        </p>
      </header>

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
          {sessionLines(runner, scope.class_hash, results, (key) => listedTitles.get(key) ?? null,
            [...requests.values()].some((r) => "pending" in r)).map((line) => <p key={line} className="session">{line}</p>)}
          {profile && !rows && !listProblem && !profileProblem && <p>Listing the packages that apply…</p>}
        </div>
        {listShown && rows && (
          <PackageList rows={rows} scope={scope} results={results} runner={runner} mark={mark} requests={requests}
            onRun={run} onShow={show} showRef={showRef} />
        )}
      </section>

      <section aria-labelledby="results-heading">
        <h2 id="results-heading" ref={resultsHeading} tabIndex={-1}>Results</h2>
        {open && opened && (
          <ResultView key={`${open.key}:${open.opening}`} title={listedTitles.get(open.key) ?? opened.package.identity} finished={opened}
            updated={openedAt !== null && open.shownAt !== null && openedAt > open.shownAt ? openedAt : null} onClose={close} />
        )}
        {unlisted.length > 0 && (
          <Unlisted results={unlisted} notes={new Map([...notes, ...rowNotes])} runner={runner} mark={mark}
            classHash={scope.class_hash} onShow={show} showRef={showRef} />
        )}
        {!(open && opened) && unlisted.length === 0 && <p>Open a finished package's result to read it here.</p>}
      </section>
    </main>
  );
}
