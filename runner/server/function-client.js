// The three calls the VM makes to report-service's researcherDashboard function:
// POST /work, /idle and /storage-credentials. Each
// authenticates with the VM's own Firebase ID token; the function takes the researcher
// from that token and never from the body.

export class FunctionError extends Error {
  constructor(route, status, message) {
    super(`${route} answered ${status}: ${message}`);
    this.route = route;
    this.status = status;
  }
}

// Bounded, because a call can be started on a VM that is then suspended, and nothing
// here may wait on an answer that is never coming.
export const FUNCTION_TIMEOUT_MS = 15_000;

export function makeFunctionClient({ baseUrl, fetchImpl = fetch, timeoutMs = FUNCTION_TIMEOUT_MS }) {
  const base = baseUrl.replace(/\/+$/, "");
  return async function call(route, { idToken, body }) {
    const response = await fetchImpl(`${base}/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
    let parsed = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    // The function's envelope: {success: true, ...} or {success: false, error}.
    if (!response.ok || parsed?.success !== true) {
      const reason = typeof parsed?.error === "string" ? parsed.error : `no JSON envelope (HTTP ${response.status})`;
      throw new FunctionError(route, response.status, reason);
    }
    return parsed;
  };
}
