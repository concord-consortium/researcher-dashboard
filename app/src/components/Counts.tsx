import { formatTime, millis, type Counts as CountsDoc } from "../shell/runs";

// The researcher's own counts, from the scope document the runner writes after each run.
export function Counts({ counts }: { counts: CountsDoc | null | undefined }) {
  if (counts === undefined) return null;
  const data = counts?.data;
  const lastPull = millis(data?.last_pull_at), freshness = millis(data?.log_freshness_at);
  return (
    <section aria-labelledby="counts-heading">
      <h2 id="counts-heading">Your counts</h2>
      {counts === null ? (
        <p>No runs yet.</p>
      ) : (
        <ul className="counts">
          <li>Answers {data?.answers ?? "not reported"}</li>
          <li>Logs {data?.logs ?? "not reported"}</li>
          {lastPull !== null && <li>From your last run, {formatTime(lastPull)}</li>}
          {freshness !== null && <li>Logs current to {formatTime(freshness)}</li>}
        </ul>
      )}
    </section>
  );
}
