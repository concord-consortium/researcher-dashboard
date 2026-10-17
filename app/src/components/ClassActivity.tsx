import { UserIcon, UsersIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { activeCount, ACTIVE_WINDOW_MINUTES, nextChangeIn, windowLabel, type Activity } from "../shell/activity";

// setTimeout's longest delay; a longer one fires at once.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

// Why automatic re-runs stopped: a sign-in that has expired, which Run renews, or one that could not
// be renewed, which only a new launch from the portal replaces.
export type Stopped = "expired" | "not-renewed";

const STOPPED: Record<Stopped, string> = {
  expired: "Automatic re-runs have stopped because your sign-in has expired. Run any package to sign in again.",
  "not-renewed": "Automatic re-runs have stopped because your sign-in could not be renewed. Launch the dashboard again from the portal."
};

// The learners in the window, re-counted as each leaves it, or null before the first snapshot.
export function useActiveCount(activity: Map<string, Activity> | undefined, now: () => number): number | null {
  const [, tick] = useState(0);
  const at = now();
  const wait = activity ? nextChangeIn(activity, at) : null;
  useEffect(() => {
    if (wait === null) return;
    const timer = setTimeout(() => tick((n) => n + 1), Math.min(wait + 1, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [wait, at]);
  return activity ? activeCount(activity, at) : null;
}

const activeText = (n: number) => `${n} ${n === 1 ? "student" : "students"} active ${windowLabel(ACTIVE_WINDOW_MINUTES)}`;

// The header's count, and nothing before the first snapshot. It is not in a live region, so a busy
// class does not announce every save.
export function ActiveCount({ activity, now }: { activity: Map<string, Activity> | undefined; now: () => number }) {
  const n = useActiveCount(activity, now);
  if (n === null) return null;
  const text = activeText(n);
  return (
    <p className="badge active-count" title={text}>
      <span className="badge-icon" aria-hidden="true"><UserIcon /></span>
      <span className="badge-info" aria-hidden="true">{n}</span>
      <span className="visually-hidden">{text}</span>
    </p>
  );
}

// What the count in the header means, and whether finished packages re-run on their own.
export function ClassActivity({ activity, problem, stopped }: {
  activity: Map<string, Activity> | undefined; problem: string | null; stopped: Stopped | null;
}) {
  return (
    <section className="info-card" aria-labelledby="activity-heading">
      <h2 id="activity-heading"><UsersIcon aria-hidden="true" />Class Activity</h2>
      <div aria-live="polite">{problem && <p className="error">{problem}</p>}</div>
      {activity && <>
        <p>The student count in the header is how many students saved an answer in this class's Activity Player assignments in the last {ACTIVE_WINDOW_MINUTES} minutes.</p>
        <p>A student reading or thinking saves nothing, so it is not a count of who is logged in. It is the same for every researcher of this class.</p>
        {!stopped && <p>Your finished packages re-run on their own as soon as students save new work.</p>}
      </>}
      <p role="status" className="error">{stopped && STOPPED[stopped]}</p>
    </section>
  );
}
