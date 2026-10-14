import assert from "node:assert/strict";
import test from "node:test";
import { FUNCTION_TIMEOUT_MS, FunctionError, makeFunctionClient } from "../server/function-client.js";

function fakeFetch(status, body) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error("no json"); return body; } };
  };
  return { fetchImpl, calls };
}

test("a call posts JSON with the ID token as the bearer, to the function's route", async () => {
  const { fetchImpl, calls } = fakeFetch(200, { success: true, packages: [] });
  const call = makeFunctionClient({ baseUrl: "https://us-central1-p.cloudfunctions.net/researcherDashboard/", fetchImpl });
  const answer = await call("work", { idToken: "id-token", body: { microvm_id: "mvm-1" } });
  assert.deepEqual(answer, { success: true, packages: [] });
  assert.equal(calls[0].url, "https://us-central1-p.cloudfunctions.net/researcherDashboard/work");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer id-token");
  assert.equal(calls[0].init.body, JSON.stringify({ microvm_id: "mvm-1" }));
  assert.ok(calls[0].init.signal, "every call is bounded");
});

test("a refusal carries the function's status and reason", async () => {
  const { fetchImpl } = fakeFetch(409, { success: false, error: "mvm-2 is not this researcher's recorded VM" });
  const call = makeFunctionClient({ baseUrl: "https://f", fetchImpl });
  await assert.rejects(() => call("work", { idToken: "t", body: {} }), (err) => err instanceof FunctionError && err.status === 409 && /recorded VM/.test(err.message));
});

test("an answer without the envelope is refused", async () => {
  const { fetchImpl } = fakeFetch(200, undefined);
  const call = makeFunctionClient({ baseUrl: "https://f", fetchImpl });
  await assert.rejects(() => call("idle", { idToken: "t", body: {} }), /no JSON envelope/);
});

// Fifteen seconds, inside the hooks' sixty and well short of a suspend.
test("a call the function never answers is abandoned at its bound", async () => {
  assert.equal(FUNCTION_TIMEOUT_MS, 15_000);
  const fetchImpl = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const call = makeFunctionClient({ baseUrl: "https://f", fetchImpl, timeoutMs: 20 });
  await assert.rejects(() => call("work", { idToken: "t", body: {} }));
});
