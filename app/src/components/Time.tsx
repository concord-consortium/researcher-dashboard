import { formatTime, fullTime } from "../shell/runs";

// A time in its short form, with the full date and time to the second as its tooltip.
export function Time({ ms, capitalized = false }: { ms: number; capitalized?: boolean }) {
  const short = formatTime(ms);
  return (
    <time dateTime={new Date(ms).toISOString()} title={fullTime(ms)}>
      {capitalized ? short[0].toUpperCase() + short.slice(1) : short}
    </time>
  );
}

// When a result finished, or that it is not known.
export function FinishedWhen({ ms }: { ms: number | null }) {
  return ms === null ? <>Finished at an unknown time</> : <>Finished <Time ms={ms} /></>;
}
