import { CloudIcon, QuestionMarkCircleIcon, XCircleIcon } from "@heroicons/react/16/solid";
import { useEffect, useRef, type ReactNode } from "react";
import logo from "../assets/cc-logo.png";
import { APP_VERSION } from "../build-info";
import type { Activity } from "../shell/activity";
import type { TokenUser } from "../shell/oauth";
import type { Scope } from "../shell/portal";
import { Brand, UserInfo } from "./Brand";
import { ActiveCount } from "./ClassActivity";
import { CONTACT_URL } from "./PackageList";

// The bar that stays at the top of the page: the class, the page's tabs, how many of the class's
// students are active, and what the researcher's runner and runs are doing; the page announces those,
// not the bar. Its height is published as --header-height, for what sticks below it. `runnerFailed`
// marks the first runner line, which then says the runner stopped with an error.
export function Header({ scope, user, demo, tabs, activity, now, session, runnerFailed }: {
  scope: Scope;
  demo: boolean;
  tabs: ReactNode;
  user: TokenUser | null;
  activity: Map<string, Activity> | undefined;
  now: () => number;
  session: string[];
  runnerFailed: boolean;
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
              {lines}
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
        <div className="about-head">
          <img className="about-logo" src={logo} alt="Concord Consortium" />
          <h2 id="about-title"><span>Researcher Dashboard</span> <span className="version">v{APP_VERSION}</span></h2>
        </div>
        <h3>Packages and results</h3>
        <p>
          Each card is a package: an analysis of the class's student work. Run starts your runner, which
          reads the class's current data, runs the package and writes its result. Open a package to read
          its result, copy or download it, and copy or download each of its tables.
        </p>
        <h3>Automatic re-runs</h3>
        <p>
          While this page is open, a finished result re-runs on its own when students save new work.
          Community packages wait for you to run them.
        </p>
        <h3>Groups</h3>
        <p>
          Official packages are made and reviewed by Concord. Project packages are shared with this class's
          research projects, and Mine are the ones you uploaded. Community packages are shared publicly by
          other researchers and are not reviewed, so the page asks before running one.
        </p>
        <h3>Who sees what</h3>
        <p>
          <strong>Your runs are your own.</strong> The packages you run, their results and your counts are
          yours alone. Another researcher of this class sees only their own runs.
        </p>
        <p>
          <strong>Class activity is shared.</strong> The count of active students is the same for every
          researcher of this class.
        </p>
        <p>
          The class's teachers, assignments and your counts are on the Info tab. Questions or problems?{" "}
          <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">Contact Concord</a>.
        </p>
        <form method="dialog">
          <button type="submit" className="icon-button"><XCircleIcon aria-hidden="true" />Close</button>
        </form>
      </dialog>
    </header>
  );
}
