import { ChartBarIcon } from "@heroicons/react/16/solid";
import type { Activity } from "../shell/activity";
import { ACTIVE_WINDOW_MINUTES, windowLabel } from "../shell/activity";
import { millis, type Counts as CountsDoc } from "../shell/runs";
import { Callout } from "./Callout";
import { Time } from "./Time";
import { useActiveCount } from "./ClassActivity";

const number = (n: number | undefined) => (n === undefined ? "not reported" : n.toLocaleString());

// The runner's lines and the active count the header shows, then the researcher's own counts, from
// the scope document the runner writes after each run. Only a failure to read the counts is announced.
export function Counts({ counts, problem, session, activity, now }: {
  counts: CountsDoc | null | undefined;
  problem: string | null;
  session: string[];
  activity: Map<string, Activity> | undefined;
  now: () => number;
}) {
  const active = useActiveCount(activity, now);
  const data = counts?.data;
  const lastPull = millis(data?.last_pull_at), freshness = millis(data?.log_freshness_at);
  return (
    <section className="info-card" aria-labelledby="counts-heading">
      <h2 id="counts-heading"><ChartBarIcon aria-hidden="true" />Current Status</h2>
      <div aria-live="polite">{problem && <Callout tone="error">{problem}</Callout>}</div>
      <dl className="facts">
        {session.length > 0 && <div><dt>Runner</dt><dd>{session.join(" ")}</dd></div>}
        {active !== null && <div><dt>Active students</dt><dd>{active} <span className="when">({windowLabel(ACTIVE_WINDOW_MINUTES)})</span></dd></div>}
        {data && <>
          <div><dt>Answers</dt><dd>{number(data.answers)}</dd></div>
          <div><dt>Logs</dt><dd>{number(data.logs)}</dd></div>
        </>}
        {lastPull !== null && <div><dt>Your last run</dt><dd><Time ms={lastPull} capitalized /></dd></div>}
        {freshness !== null && <div><dt>Logs current to</dt><dd><Time ms={freshness} capitalized /></dd></div>}
      </dl>
      {counts === null && <p>No runs yet.</p>}
    </section>
  );
}
