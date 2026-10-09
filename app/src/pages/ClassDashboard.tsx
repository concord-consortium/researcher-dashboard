import { useEffect, useRef, useState } from "react";
import { needsRefresh, type Profile } from "../shell/packages";
import { ApiError, SessionExpired, type Scope } from "../shell/portal";
import { PROFILE_MAX_AGE_MS } from "../shell/portals";
import type { DashboardServices } from "../shell/services";
import type { InfoReason } from "../shell/start";
import { Info } from "./Info";

type Source = "portal" | "firebase";

// What to say when a source fails without answering.
const UNREACHABLE: Record<Source, string> = {
  portal: "The portal could not be reached.",
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
  const refreshed = useRef(false);

  // The one place a refusal becomes page state. Only the portal's 403 means the researcher
  // check failed.
  function refused(error: unknown, show: (message: string) => void, from: Source) {
    if (error instanceof SessionExpired) return error.young ? setInfo("expired") : onExpired();
    if (error instanceof ApiError && error.status === 403 && from === "portal") return setInfo("withdrawn");
    if (error instanceof ApiError) return show(error.message);
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
      .catch((error) => {
        if (canceled) return;
        if (error instanceof ApiError && error.status === 404) setInfo("class-gone");
        else refused(error, setFailure, "portal");
      });
    return () => { canceled = true; };
  }, [services]);

  useEffect(() => {
    if (!scope) return;
    let stop: (() => void) | null = null;
    let canceled = false;
    services.watchProfile(scope, setProfile, () => setProfileProblem(UNREACHABLE.firebase))
      .then((unsubscribe) => { if (canceled) unsubscribe(); else stop = unsubscribe; })
      .catch((error) => { if (!canceled) refused(error, setProfileProblem, "firebase"); });
    return () => { canceled = true; stop?.(); };
  }, [scope, services]);

  // Decided on the first snapshot only, so a derivation that keeps failing cannot loop.
  useEffect(() => {
    if (!scope || profile === undefined || refreshed.current) return;
    refreshed.current = true;
    if (!needsRefresh(profile, scope, services.now(), PROFILE_MAX_AGE_MS)) return;
    services.portal.refreshProfile().catch((error) => refused(error, setRefreshProblem, "portal"));
  }, [scope, profile, services]);

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

      <section aria-labelledby="packages-heading">
        <h2 id="packages-heading">Packages</h2>
        <div className="status" aria-live="polite">
          {profileProblem && <p className="error">{profileProblem}</p>}
          {!profileProblem && profile === null && !refreshProblem && <p>Reading this class's activities…</p>}
          {refreshProblem && <p className="error">{refreshProblem}</p>}
        </div>
      </section>
    </main>
  );
}
