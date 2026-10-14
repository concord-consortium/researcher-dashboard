import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStore, RunnerStatus, SERVER_TIME } from "../server/status.js";

// The in-memory store stands in for Firestore in every runner test, so its merge has to
// behave as Firestore's does, or a test passes on a write Firestore would get wrong.
test("merge merges a nested map, as Firestore's does, and replaceFields replaces it", async () => {
  const store = new MemoryStore({ docs: new Map() });
  await store.merge("a/b", { platform_id: "p", data: { answers: 5, logs: 9 }, queue: [1, 2] });
  await store.merge("a/b", { data: { answers: 7, last_pull_at: SERVER_TIME }, queue: [3] });
  assert.deepEqual(store.docs.get("a/b"), { platform_id: "p", data: { answers: 7, logs: 9, last_pull_at: SERVER_TIME }, queue: [3] });
  await store.replaceFields("a/b", { data: { answers: 8 } });
  assert.deepEqual(store.docs.get("a/b"), { platform_id: "p", data: { answers: 8 }, queue: [3] });
});

test("mergeIf writes only while its test holds for the stored document", async () => {
  const store = new MemoryStore({ docs: new Map() });
  await store.merge("a/b", { microvm_id: "mvm-1", state: "running" });
  assert.equal(await store.mergeIf("a/b", (doc) => doc?.microvm_id === "mvm-2", { state: "terminated" }), false);
  assert.equal(store.docs.get("a/b").state, "running");
  assert.equal(await store.mergeIf("a/b", (doc) => doc?.microvm_id === "mvm-1", { state: "terminated" }), true);
  assert.deepEqual(store.docs.get("a/b"), { microvm_id: "mvm-1", state: "terminated" });
});

// A hook's write can fail while another write is in flight; only what that write carried
// is cleared when it lands.
test("a failure recorded while a status write is in flight is reported by the next one", async () => {
  const store = new MemoryStore({ docs: new Map() });
  const merge = store.merge.bind(store);
  let release;
  let calls = 0;
  store.merge = (p, fields) => {
    calls += 1;
    if (calls === 1) return Promise.reject(new Error("UNAVAILABLE first"));
    if (calls === 2) return new Promise((r) => { release = () => r(merge(p, fields)); });
    if (calls === 3) return Promise.reject(new Error("UNAVAILABLE third"));
    return merge(p, fields);
  };
  const status = new RunnerStatus({ store, portal: "p", platformUserId: "1", platformId: "https://p" });
  await status.writeFromHook("suspend", { state: "suspending" });
  const inFlight = status.writeFromHook("work", { state: "ready" });
  await new Promise((r) => setImmediate(r));
  await status.writeFromHook("terminate", { state: "terminated" });
  release();
  await inFlight;
  await status.writeFromHook("work", { state: "ready" });
  const reported = store.docs.get(status.path).status_write_failures.map((f) => f.hook);
  assert.deepEqual(reported, ["terminate"], "the in-flight write carried the first; the next carries the one recorded meanwhile");
  await status.writeFromHook("work", { state: "ready" });
  assert.deepEqual(store.docs.get(status.path).status_write_failures, [], "a reported failure is cleared by the next write");
});

test("a status document carries only the last ten failures", async () => {
  const store = new MemoryStore({ docs: new Map() });
  const merge = store.merge.bind(store);
  let failing = true;
  store.merge = (p, fields) => (failing ? Promise.reject(new Error("UNAVAILABLE")) : merge(p, fields));
  const status = new RunnerStatus({ store, portal: "p", platformUserId: "1", platformId: "https://p" });
  for (let i = 0; i < 12; i++) await status.writeFromHook(`hook${i}`, { state: "ready" });
  failing = false;
  await status.writeFromHook("work", { state: "ready" });
  assert.deepEqual(store.docs.get(status.path).status_write_failures.map((f) => f.hook), Array.from({ length: 10 }, (_, i) => `hook${i + 2}`));
});
