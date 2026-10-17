import { CloudIcon, QuestionMarkCircleIcon, XCircleIcon } from "@heroicons/react/16/solid";
import { useEffect, useRef, type ReactNode } from "react";
import { APP_VERSION } from "../build-info";
import type { Activity } from "../shell/activity";
import type { TokenUser } from "../shell/oauth";
import type { Scope } from "../shell/portal";
import { Brand, UserInfo } from "./Brand";
import { ActiveCount } from "./ClassActivity";

// The bar that stays at the top of the page: the class, the page's tabs, how many of the class's
// students are active, and what the researcher's runner and runs are doing. `announce` is false
// while a re-run is running, when the package's own row announces the outcome instead. Its height
// is published as --header-height, for what sticks below it. `runnerFailed` marks the first runner
// line, which then says the runner stopped with an error.
export function Header({ scope, user, demo, tabs, activity, now, session, runnerFailed, announce }: {
  scope: Scope;
  demo: boolean;
  tabs: ReactNode;
  user: TokenUser | null;
  activity: Map<string, Activity> | undefined;
  now: () => number;
  session: string[];
  runnerFailed: boolean;
  announce: boolean;
}) {
  const about = useRef<HTMLDialogElement>(null);
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = bar.current;
    if (!header || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement.style;
    const observer = new ResizeObserver(() => root.setProperty("--header-height", `${header.offsetHeight}px`));
    observer.observe(header);
    return () => { observer.disconnect(); root.removeProperty("--header-height"); };
  }, []);
  const lines = session.map((line, i) => (
    <p key={line} className={`badge session${runnerFailed && i === 0 ? " error" : ""}`} title={line}>
      <span className="badge-icon" aria-hidden="true"><CloudIcon /></span>
      <span className="badge-info">{line}</span>
    </p>
  ));
  return (
    <header className="app-header" ref={bar}>
      <div className="header-main">
        <Brand demo={demo} />
        <div className="class">
          <h1>{scope.name}</h1>
          <p className="meta">
            {scope.teachers.map((t) => t.name).join(", ")}
            {scope.cohorts.length > 0 && <> · {scope.cohorts.map((c) => c.name).join(", ")}</>}
          </p>
        </div>
        {user && <UserInfo user={user} />}
        <div className="header-row">
          {tabs}
          <div className="status-bar">
            <div className="runner">
              {announce ? <div aria-live="polite">{lines}</div> : <><div aria-live="polite" />{lines}</>}
            </div>
            <ActiveCount activity={activity} now={now} />
            <button type="button" className="badge about-button" aria-label="About this page" title="About this page"
              onClick={() => about.current?.showModal()}>
              <span className="badge-icon" aria-hidden="true"><QuestionMarkCircleIcon /></span>
            </button>
          </div>
        </div>
      </div>
      <dialog ref={about} className="about" aria-labelledby="about-title">
        <h2 id="about-title"><span>Researcher Dashboard</span> <span className="version">v{APP_VERSION}</span></h2>
        <p>
          <strong>Your runs are your own.</strong> The packages you run, their results and your counts are
          yours alone. Another researcher of this class sees only their own runs.
        </p>
        <p>
          <strong>Class activity is shared.</strong> The count of active students is the same for every
          researcher of this class.
        </p>
        <form method="dialog">
          <button type="submit" className="icon-button"><XCircleIcon aria-hidden="true" />Close</button>
        </form>
      </dialog>
    </header>
  );
}
