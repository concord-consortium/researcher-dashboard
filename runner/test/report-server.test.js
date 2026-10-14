import assert from "node:assert/strict";
import test from "node:test";
import { askApplies, ReportServerError } from "../server/report-server.js";

const answer = (status, body) => async () => new Response(body === undefined ? "" : JSON.stringify(body), { status });
const ask = (fetchImpl, extra = {}) => askApplies({ baseUrl: "https://rs.example/", token: "tok", urls: { any: ["*x*"] }, scopeUrls: ["https://a/x"], fetchImpl, ...extra });

test("asks the applies route with the bearer, the manifest's patterns and the scope's URLs only", async () => {
  const calls = [];
  const verdict = await ask(async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ applies: false, reason: "no URL in this class matches the required pattern *x*", interactive_urls: [], unread: [], truncated: false })); });
  assert.deepEqual(verdict, { applies: false, reason: "no URL in this class matches the required pattern *x*" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://rs.example/api/v1/packages/applies");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(calls[0].init.body), { urls: { any: ["*x*"] }, scope_urls: ["https://a/x"] });
  assert.ok(calls[0].init.signal, "every call is bounded");
});

test("a 400 or 422 is a refusal carrying report-server's message", async () => {
  for (const status of [400, 422]) {
    await assert.rejects(ask(answer(status, { error: "BAD_REQUEST", message: "scope_urls[0] is longer than 2048 bytes" })),
      (err) => err instanceof ReportServerError && err.refusal && err.status === status && /2048 bytes/.test(err.message));
  }
});

test("a 503, a 401, a 404 and an answer without a verdict are not refusals", async () => {
  for (const [status, body] of [[503, { error: "SERVICE_UNAVAILABLE" }], [401, {}], [404, undefined], [200, { reason: null }]]) {
    await assert.rejects(ask(answer(status, body)), (err) => err instanceof ReportServerError && !err.refusal && err.status === status);
  }
});

test("no answer in time and a failed connection are not refusals", async () => {
  let aborted = false;
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => { aborted = true; reject(init.signal.reason); }));
  await assert.rejects(ask(hang, { timeoutMs: 20 }), (err) => err instanceof ReportServerError && !err.refusal && err.status === null);
  assert.ok(aborted, "the bound aborted the call");
  await assert.rejects(ask(async () => { throw new TypeError("fetch failed"); }), (err) => err instanceof ReportServerError && !err.refusal);
});
