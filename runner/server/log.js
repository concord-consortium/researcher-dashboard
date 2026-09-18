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

// The result document is read by every researcher of the class, and the strings that
// reach it are whatever a step happened to throw: cc-data's stderr, a fetch error
// carrying a presigned S3 URL, a stack trace. None of that is the researcher's to see,
// and some of it is credential-shaped. So the document gets a redacted message and the
// log keeps the original, which is where an engineer is looking anyway.
const SECRETS = [
  // Presigned URLs and anything else carrying credentials in a query string.
  [/([?&](?:X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|token|access_token|key)=)[^&\s]+/gi, "$1[redacted]"],
  // Bearer tokens and JWTs, wherever they appear in a message.
  [/\bBearer\s+[\w.\-]+/gi, "Bearer [redacted]"],
  [/\beyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]+/g, "[redacted jwt]"],
  // AWS access key ids are distinctive enough to catch on sight.
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[redacted key id]"]
];

export function redact(message) {
  let out = String(message ?? "");
  for (const [pattern, replacement] of SECRETS) out = out.replace(pattern, replacement);
  return out.length > 500 ? `${out.slice(0, 500)}...` : out;
}
