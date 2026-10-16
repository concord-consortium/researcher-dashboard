import { useEffect, useState } from "react";
import { activeCount, ACTIVE_WINDOW_MINUTES, nextChangeIn, windowLabel, type Activity } from "../shell/activity";

// setTimeout's longest delay; a longer one fires at once.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

// Not a live region, so a busy class does not announce every save.
export function ClassActivity({ activity, problem, stopped, now }: {
  activity: Map<string, Activity> | undefined; problem: string | null; stopped: boolean; now: () => number;
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
      {problem && <p className="error">{problem}</p>}
      {n !== null && <>
        <p className="active-count">{n} {n === 1 ? "student" : "students"} active {windowLabel(ACTIVE_WINDOW_MINUTES)}</p>
        <p className="note">Counts students who saved an answer in this class's Activity Player assignments in that time. A student reading or thinking saves nothing, so this is not a count of who is logged in. It is the same for every researcher of this class.</p>
        {!stopped && <p>Your finished packages re-run on their own as soon as students save new work.</p>}
      </>}
      <p role="status" className="error">
        {stopped && "Automatic re-runs have stopped because your sign-in has expired. Run any package to sign in again."}
      </p>
    </section>
  );
}
