import { formatTime, fullTime } from "../shell/runs";

const UNKNOWN = "Finished at an unknown time";

// A time in its short form, with the full date and time to the second as its tooltip.
export function Time({ ms, capitalized = false }: { ms: number; capitalized?: boolean }) {
  const short = formatTime(ms);
  return (
    <time dateTime={new Date(ms).toISOString()} title={fullTime(ms)}>
      {capitalized ? short[0].toUpperCase() + short.slice(1) : short}
    </time>
  );
}

// When a result finished, or that it is not known, as text and with the time's tooltip.
export const finishedText = (ms: number | null) => (ms === null ? UNKNOWN : `Finished ${formatTime(ms)}`);

export function FinishedWhen({ ms }: { ms: number | null }) {
  return ms === null ? <>{UNKNOWN}</> : <>Finished <Time ms={ms} /></>;
}
