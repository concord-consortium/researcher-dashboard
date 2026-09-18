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
