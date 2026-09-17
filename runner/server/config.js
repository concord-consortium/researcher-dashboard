// Two sources, deliberately separated. Environment variables are baked into the
// image's snapshot and so are shared by every VM: they may hold nothing
// researcher-specific and nothing secret. Everything per-VM arrives in
// runHookPayload at /run.

export const REQUIRED_PAYLOAD_FIELDS = Object.freeze([
  "session_token",
  "platform_user_id",
  "portal",
  "firebase_project",
  "bucket",
  "secret_name"
]);

export function loadEnv(env = process.env) {
  const backend = (env.SYNC_BACKEND ?? "S3").toUpperCase();
  if (backend !== "S3" && backend !== "DIR") {
    throw new Error(`SYNC_BACKEND must be S3 or DIR, got ${backend}`);
  }
  if (backend === "DIR" && !env.SYNC_DIR) {
    throw new Error("SYNC_BACKEND=DIR requires SYNC_DIR");
  }
  return {
    port: Number(env.PORT ?? 8080),
    dataRoot: env.DATA_ROOT ?? "/data",
    workRoot: env.WORK_ROOT ?? "/work",
    backend,
    syncDir: env.SYNC_DIR ?? null,
    syncIntervalMs: Number(env.SYNC_INTERVAL_MS ?? 30_000),
    analysisTimeoutMs: Number(env.ANALYSIS_TIMEOUT_MS ?? 30 * 60_000)
  };
}

// Lambda delivers runHookPayload as a string, so this parses and validates rather
// than trusting the shape. A malformed payload must fail /run loudly: the VM has no
// way to identify the researcher, and continuing would write someone else's doc or
// none at all.
export function parseRunHookPayload(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("runHookPayload is missing or not a string");
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    throw new Error(`runHookPayload is not valid JSON: ${err.message}`);
  }
  const missing = REQUIRED_PAYLOAD_FIELDS.filter(
    (field) => typeof payload[field] !== "string" || payload[field] === ""
  );
  if (missing.length) {
    throw new Error(`runHookPayload is missing: ${missing.join(", ")}`);
  }
  return payload;
}

// The researcher's own prefix within the bucket, and the local directory that
// mirrors it. Both derive from platform_user_id, which comes from the portal via
// the payload and never from anything a request body carries.
export function researcherPrefix(platformUserId) {
  return `researchers/${platformUserId}`;
}
