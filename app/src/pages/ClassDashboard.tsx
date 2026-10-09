import { useEffect, useState } from "react";
import { ApiError, SessionExpired, type Scope } from "../shell/portal";
import type { DashboardServices } from "../shell/services";
import type { InfoReason } from "../shell/start";
import { Info } from "./Info";

// The dashboard for the class the token is bound to, never the one the launch link asked for.
export function ClassDashboard({ services, onExpired }: {
  services: DashboardServices;
  onExpired: () => void;
}) {
  const [scope, setScope] = useState<Scope | null>(null);
  const [info, setInfo] = useState<InfoReason | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // The one place a refusal becomes page state.
  function refused(error: unknown, show: (message: string) => void) {
    if (error instanceof SessionExpired) return error.young ? setInfo("expired") : onExpired();
    if (error instanceof ApiError && error.status === 403) return setInfo("withdrawn");
    if (error instanceof ApiError) return show(error.message);
    show("The portal could not be reached.");
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
        else refused(error, setFailure);
      });
    return () => { canceled = true; };
  }, [services]);

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
    </main>
  );
}
