import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAction, summarise, toIso } from "../server/clue-reader.js";

// The action column is what a study groups by, so the varying id has to leave the
// string and land in its own column. These are the shapes CLUE actually emits.
test("normalizeAction lifts the varying ids out of the action path", () => {
  assert.deepEqual(normalizeAction("/content/tileMap/tile-42/setTitle"), {
    action: "/content/tileMap/{tile}/setTitle",
    tile_id: "tile-42",
    shared_model_id: null
  });
  assert.deepEqual(normalizeAction("/content/sharedModelMap/sm-7/setValues"), {
    action: "/content/sharedModelMap/{sharedModel}/setValues",
    tile_id: null,
    shared_model_id: "sm-7"
  });
  // A row id is replaced but not captured: the recipes keep no row column, and a
  // reader that invented one would not match the corpus they produce.
  assert.deepEqual(normalizeAction("/content/rowMap/row-3/setHeight"), {
    action: "/content/rowMap/{row}/setHeight",
    tile_id: null,
    shared_model_id: null
  });
});

test("normalizeAction leaves an action carrying no id alone", () => {
  assert.deepEqual(normalizeAction("/content/setTitle"), {
    action: "/content/setTitle",
    tile_id: null,
    shared_model_id: null
  });
});

test("normalizeAction treats a missing action as absent rather than crashing", () => {
  assert.deepEqual(normalizeAction(undefined), { action: null, tile_id: null, shared_model_id: null });
});

// History entries carry times three different ways depending on how they were written,
// and a column that is sometimes epoch millis and sometimes ISO cannot be compared.
test("toIso normalizes every time shape CLUE writes", () => {
  assert.equal(toIso(1700000000000), "2023-11-14T22:13:20.000Z");
  assert.equal(toIso("2023-11-14T22:13:20.000Z"), "2023-11-14T22:13:20.000Z");
  assert.equal(toIso({ toDate: () => new Date("2023-11-14T22:13:20.000Z") }), "2023-11-14T22:13:20.000Z");
  assert.equal(toIso(null), null);
  assert.equal(toIso("not a date"), null);
});

test("summarise counts tiles by type and the containers beside them", () => {
  const content = {
    tileMap: {
      a: { content: { type: "Dataflow" } },
      b: { content: { type: "Dataflow" } },
      c: { content: { type: "Text" } },
      d: { content: {} }
    },
    rowMap: { r1: {}, r2: {} },
    sharedModelMap: { s1: {} },
    annotations: { n1: {}, n2: {}, n3: {} }
  };
  assert.deepEqual(summarise(content), {
    n_tiles: 4,
    tile_types: ["Dataflow", "Text"],
    tile_type_counts: { Dataflow: 2, Text: 1 },
    n_dataflow_tiles: 2,
    n_rows: 2,
    n_shared_models: 1,
    n_annotations: 3
  });
});

test("summarise reports an empty document as empty rather than failing", () => {
  assert.deepEqual(summarise({}), {
    n_tiles: 0,
    tile_types: [],
    tile_type_counts: {},
    n_dataflow_tiles: 0,
    n_rows: 0,
    n_shared_models: 0,
    n_annotations: 0
  });
});
