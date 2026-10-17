import { CpuChipIcon } from "@heroicons/react/16/solid";
import logo from "../assets/cc-logo.png";
import type { Activity } from "../shell/activity";
import type { TokenUser } from "../shell/oauth";
import type { Scope } from "../shell/portal";
import { ActiveCount } from "./ClassActivity";

// The bar that stays at the top of the page: the class, how many of its students are active, and
// what the researcher's machine and runs are doing. `announce` is false while a re-run is running,
// when the package's own row announces the outcome instead.
export function Header({ scope, user, activity, now, session, announce }: {
  scope: Scope;
  user: TokenUser | null;
  activity: Map<string, Activity> | undefined;
  now: () => number;
  session: string[];
  announce: boolean;
}) {
  const lines = session.map((line) => (
    <p key={line} className="badge session" title={line}>
      <span className="badge-icon" aria-hidden="true"><CpuChipIcon /></span>
      <span className="badge-info">{line}</span>
    </p>
  ));
  return (
    <header className="app-header">
      <div className="header-main">
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
        {user && (
          <div className="user">
            <p className="user-name">{user.name}</p>
            {user.username && <p className="meta">{user.username}</p>}
          </div>
        )}
        <div className="status-bar">
          <ActiveCount activity={activity} now={now} />
          <div className="machine">
            {announce ? <div aria-live="polite">{lines}</div> : <><div aria-live="polite" />{lines}</>}
          </div>
        </div>
      </div>
    </header>
  );
}
