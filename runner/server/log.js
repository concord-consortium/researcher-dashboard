// One JSON object per line on stdout, which is what CloudWatch ingests from the VM.
// Every line carries the identifiers a run is traced by: researcher, class, analysis.

let context = {};

// Set once from runHookPayload so callers never have to thread the researcher id
// through every function that might log.
export function setContext(fields) {
  context = { ...context, ...fields };
}

export function resetContext() {
  context = {};
}

function emit(level, event, fields) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
    ...fields
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

export const log = {
  info: (event, fields) => emit("info", event, fields),
  warn: (event, fields) => emit("warn", event, fields),
  error: (event, fields) => emit("error", event, fields)
};

// Times an async step and logs its duration whether it succeeds or throws, so a
// failed analysis still yields the per-step timings.
export async function timed(event, fields, fn) {
  const started = process.hrtime.bigint();
  const ms = () => Number(process.hrtime.bigint() - started) / 1e6;
  try {
    const result = await fn();
    log.info(event, { ...fields, ok: true, duration_ms: Math.round(ms()) });
    return result;
  } catch (err) {
    log.error(event, {
      ...fields,
      ok: false,
      duration_ms: Math.round(ms()),
      error: err.message
    });
    throw err;
  }
}
