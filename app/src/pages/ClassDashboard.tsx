import { useEffect, useMemo, useRef, useState } from "react";
import { Counts } from "../components/Counts";
import { PackageList } from "../components/PackageList";
import { groupPackages, needsRefresh, packageKey, scopeUrls, titleOf, type Profile } from "../shell/packages";
import { ApiError, SessionExpired, type PackageRow, type Scope } from "../shell/portal";
import { PROFILE_MAX_AGE_MS } from "../shell/portals";
import {
  nextMark, RESUME_WAIT_MS, sessionLines,
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
  const [results, setResults] = useState<Map<string, Result>>(new Map());
  const [requests, setRequests] = useState<Map<string, RunRequest>>(new Map());
  const [runsProblem, setRunsProblem] = useState<string | null>(null);
  const [countsProblem, setCountsProblem] = useState<string | null>(null);
  const [rows, setRows] = useState<PackageRow[] | null>(null);
  const [listProblem, setListProblem] = useState<string | null>(null);
  const refreshed = useRef(false);

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
      results: setResults,
      refused: (which) => {
        if (which === "profile") setProfileProblem(UNREACHABLE.firebase);
        else if (which === "counts") setCountsProblem("Your counts could not be read.");
        else setRunsProblem("Your runs could not be read.");
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
      setTimeout(() => forget(key, resuming), RESUME_WAIT_MS);
    } catch (error) {
      // Keyed to the result as the refusal finds it: the queued write lands before a VM step fails.
      const at = latestResults.current.get(key)?.updated_at?.toMillis() ?? null;
      refused(error, (message) => setRequests((r) => new Map(r).set(key, { message, at })), "portal");
    }
  }

  const listedTitles = useMemo(() => new Map(
    rows && scope ? groupPackages(rows, scope).flatMap((g) => g.rows).map((r) => [packageKey(r.identity), titleOf(r)]) : []
  ), [rows, scope]);

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
        {profile && rows && !listProblem && !profileProblem && (
          <PackageList rows={rows} scope={scope} results={results} runner={runner} mark={mark} requests={requests}
            onRun={run} onShow={() => {}} />
        )}
      </section>
    </main>
  );
}
