// Two sources, deliberately separated. Environment variables are baked into the
// image's snapshot and so are shared by every VM: they may hold nothing
// researcher-specific and nothing secret. Everything per-VM arrives in
// runHookPayload at /run.

export const REQUIRED_PAYLOAD_FIELDS = Object.freeze([
  "session_token",
  "platform_user_id",
  // The rules check platform_id against the token's claim rather than trusting the
  // {portal} path segment, so every status document carries it and the VM has to be
  // told what it is. It cannot be derived from `portal`, which drops the scheme.
  "platform_id",
  "portal",
  "firebase_project",
  "bucket",
  // Where the VM retires its own report-server credential when it is torn down. It
  // comes from the caller rather than a map here because whatever launches the VM has
  // already had to reach report-server to obtain the credential in the first place.
  "report_server_url"
]);

// The report-server credential is the requesting researcher's own, minted per VM
// creation and handed down in the payload (design.md, Per-researcher forwarding).
// It is required rather than optional: an analysis package is given egress on the
// premise that the credential it can read reaches only its own researcher's data,
// so a VM with no forwarded credential has no safe world to run a package in.
export const CREDENTIAL_FIELDS = Object.freeze(["report_server_token"]);

function analysisUid(env) {
  const uid = Number(env.ANALYSIS_UID ?? 1000);
  if (!Number.isInteger(uid) || uid < 1000) {
    throw new Error(`ANALYSIS_UID must be an integer of at least 1000, got ${env.ANALYSIS_UID}`);
  }
  return uid;
}

export function loadEnv(env = process.env) {
  const backend = (env.SYNC_BACKEND ?? "S3").toUpperCase();
  if (backend !== "S3" && backend !== "DIR") {
    throw new Error(`SYNC_BACKEND must be S3 or DIR, got ${backend}`);
  }
  if (backend === "DIR" && !env.SYNC_DIR) {
    throw new Error("SYNC_BACKEND=DIR requires SYNC_DIR");
  }
  // LOG writes the status documents to the log instead of Firestore, for running a
  // VM before the portal can mint a real session token: the sequence of states is
  // still observable, without a sign-in that cannot succeed.
  const statusBackend = (env.STATUS_BACKEND ?? "FIRESTORE").toUpperCase();
  if (!["FIRESTORE", "LOG", "MEMORY"].includes(statusBackend)) {
    throw new Error(`STATUS_BACKEND must be FIRESTORE, LOG or MEMORY, got ${statusBackend}`);
  }
  return {
    port: Number(env.PORT ?? 8080),
    // Lambda injects this into the VM's environment, and it is the only thing that says
    // which build of the image is serving: `get-microvm` gives it too, but the page
    // reading the status document cannot call AWS.
    imageVersion: env.AWS_LAMBDA_MICROVM_IMAGE_VERSION ?? null,
    dataRoot: env.DATA_ROOT ?? "/data",
    workRoot: env.WORK_ROOT ?? "/work",
    backend,
    statusBackend,
    syncDir: env.SYNC_DIR ?? null,
    syncIntervalMs: Number(env.SYNC_INTERVAL_MS ?? 30_000),
    analysisTimeoutMs: Number(env.ANALYSIS_TIMEOUT_MS ?? 30 * 60_000),
    // Rejected below 1000 rather than defaulted: verifySandbox compares the observed
    // uid to this one, so ANALYSIS_UID=0 would pass the check while giving the package
    // root, a route back to the host namespace and the credential store.
    analysisUid: analysisUid(env),
    // Where an analysis package may reach, enforced by the egress proxy rather than
    // asserted. A leading dot allows a zone's subdomains and not the zone itself.
    // report-server is the whole of it today; anything else a package needs goes
    // through the runner, which is the point of having one list.
    // report-server delivers a report's CSV as a presigned S3 URL rather than a stream,
    // so a package that may pull its own data has to reach S3 as well as report-server.
    // This grants no bucket access: the package holds no AWS credentials and the
    // metadata service is unreachable from its namespace, so the only S3 requests it can
    // make are the presigned ones it has already been handed.
    egressAllowlist: (env.EGRESS_ALLOWLIST ?? "report-server.concordqa.org,report-server.concord.org,s3.amazonaws.com,s3.us-east-1.amazonaws.com")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
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
  const credentials = CREDENTIAL_FIELDS.filter(
    (field) => typeof payload[field] === "string" && payload[field] !== ""
  );
  if (credentials.length !== CREDENTIAL_FIELDS.length) {
    throw new Error(
      `runHookPayload must carry ${CREDENTIAL_FIELDS.join(", ")}`
    );
  }
  return payload;
}

// The researcher's own prefix within the bucket, and the local directory that
// mirrors it. Both derive from platform_user_id, which comes from the portal via
// the payload and never from anything a request body carries.
export function researcherPrefix(platformUserId) {
  return `researchers/${platformUserId}`;
}

// `portal` travels as the Firestore path segment, which is the host with its dots
// replaced by underscores. cc-data wants the host back. Hostnames cannot contain
// underscores, so the two forms round-trip exactly.
export function portalHost(portalSegment) {
  return portalSegment.replaceAll("_", ".");
}
