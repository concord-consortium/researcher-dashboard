import logo from "../assets/cc-logo.png";
import type { Activity } from "../shell/activity";
import type { Scope } from "../shell/portal";
import { ActiveCount } from "./ClassActivity";

// The bar that stays at the top of the page: the class, how many of its students are active, and
// what the researcher's machine and runs are doing. `announce` is false while a re-run is running,
// when the package's own row announces the outcome instead.
export function Header({ scope, activity, now, session, announce }: {
  scope: Scope;
  activity: Map<string, Activity> | undefined;
  now: () => number;
  session: string[];
  announce: boolean;
}) {
  const lines = session.map((line) => <p key={line} className="session">{line}</p>);
  return (
    <header className="app-header">
      <div className="brand">
        <img className="logo" src={logo} alt="Concord Consortium" />
        <span className="product">Researcher Dashboard</span>
      </div>
      <div className="class">
        <h1>{scope.name}</h1>
        <p className="meta">
          {scope.teachers.map((t) => t.name).join(", ")}
          {scope.cohorts.length > 0 && <> · {scope.cohorts.map((c) => c.name).join(", ")}</>}
        </p>
      </div>
      <div className="status-bar">
        <ActiveCount activity={activity} now={now} />
        <div className="machine">
          {announce ? <div aria-live="polite">{lines}</div> : <><div aria-live="polite" />{lines}</>}
        </div>
      </div>
    </header>
  );
}
