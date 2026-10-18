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

// The count is not in a live region, so a busy class does not announce every save.
export function ClassActivity({ activity, problem, stopped, now }: {
  activity: Map<string, Activity> | undefined; problem: string | null; stopped: Stopped | null; now: () => number;
}) {
  const [, tick] = useState(0);
  const at = now();
  const wait = activity ? nextChangeIn(activity, at) : null;
  useEffect(() => {
    if (wait === null) return;
    const timer = setTimeout(() => tick((n) => n + 1), Math.min(wait + 1, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [wait, at]);
  const n = activity ? activeCount(activity, at) : null;
  return (
    <section aria-labelledby="activity-heading">
      <h2 id="activity-heading">Class activity</h2>
      <div aria-live="polite">{problem && <p className="error">{problem}</p>}</div>
      {n !== null && <>
        <p className="active-count">{n} {n === 1 ? "student" : "students"} active {windowLabel(ACTIVE_WINDOW_MINUTES)}</p>
        <p className="note">Counts students who saved an answer in this class's Activity Player assignments in that time. A student reading or thinking saves nothing, so this is not a count of who is logged in. It is the same for every researcher of this class.</p>
        {!stopped && <p>Your finished packages re-run on their own as soon as students save new work.</p>}
      </>}
      <p role="status" className="error">{stopped && STOPPED[stopped]}</p>
    </section>
  );
}
