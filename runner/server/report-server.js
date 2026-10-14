// Retires the VM's own report-server credential. It needs no other standing: that
// server's /api/v1/tokens/current runs on a pipeline authenticated by token validity
// alone, precisely so a caller can revoke the token it is holding.
//
// Failure is raised rather than swallowed here. Whether a failed revocation should stop
// a teardown is the caller's policy, not this function's.
export async function revokeOwnToken({ baseUrl, token, fetchImpl = fetch }) {
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/api/v1/tokens/current`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error(`report-server refused the revocation: ${response.status}`);
  }
}

// A refusal report-server will repeat however often it is asked (a 400 or 422), as
// opposed to an answer that may change on a retry (anything else, or no answer).
export class ReportServerError extends Error {
  constructor(message, { status = null, refusal = false } = {}) {
    super(message);
    this.status = status;
    this.refusal = refusal;
  }
}

// Asks report-server, which holds the only glob matcher, whether a manifest's patterns
// match a class's URLs. The scope URLs are the profile's, matched as given, so nothing
// is derived and the answer comes back without waiting on report-service's deriver.
// No derivation is asked for, so an answer that takes longer counts as a failed attempt.
export const APPLIES_TIMEOUT_MS = 30_000;

export async function askApplies({ baseUrl, token, urls, scopeUrls, fetchImpl = fetch, timeoutMs = APPLIES_TIMEOUT_MS }) {
  let response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/api/v1/packages/applies`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ urls, scope_urls: scopeUrls }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    throw new ReportServerError(`report-server could not be asked whether the package applies: ${err.message}`);
  }
  const body = await response.json().catch(() => null);
  if (response.status === 400 || response.status === 422) {
    throw new ReportServerError(body?.message ?? `report-server answered ${response.status}`, { status: response.status, refusal: true });
  }
  if (!response.ok || typeof body?.applies !== "boolean") {
    throw new ReportServerError(`report-server answered ${response.status} to the applies check`, { status: response.status });
  }
  return { applies: body.applies, reason: body.reason ?? null };
}
