import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStore, SERVER_TIME } from "../server/status.js";

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
