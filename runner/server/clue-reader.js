import fs from "node:fs";
import path from "node:path";
import { collection, doc as fsDoc, getDocs, orderBy, query, where } from "firebase/firestore";
import { get, ref } from "firebase/database";
import { log } from "./log.js";

// Reads one class's CLUE corpus into the layout the cc-data-studies recipes in
// sources/clue/recipes/clue-documents/ produce, so a package written against that
// corpus reads the same files here:
//
//   <dataRoot>/clue-documents/metadata.jsonl          one row per Firestore document
//   <dataRoot>/clue-documents/content.jsonl           one row per RTDB document
//   <dataRoot>/clue-documents/history/<doc_id>.jsonl  one row per history entry
//   <dataRoot>/clue-documents/history/<doc_id>.meta.json
//
// Two differences from those recipes, both forced. They run firebase-admin with a
// service account and so bypass the rules; this runs the client SDK signed in as the
// researcher, under the rules, which is what the runner claim exists to constrain. And
// they work from a pre-built document list across every class, where this is scoped to
// one class by the `context_id` query the rules permit.

// The same normalization the history recipe applies, so an action column means the
// same thing in both corpora: the varying id moves out of the action string and into
// its own column, leaving a groupable shape.
export function normalizeAction(raw) {
  if (!raw) return { action: null, tile_id: null, shared_model_id: null };
  let tileId = null;
  let sharedModelId = null;
  let action = raw;
  action = action.replace(/\/tileMap\/([^/]+)/, (_m, id) => {
    tileId = id;
    return "/tileMap/{tile}";
  });
  action = action.replace(/\/sharedModelMap\/([^/]+)/, (_m, id) => {
    sharedModelId = id;
    return "/sharedModelMap/{sharedModel}";
  });
  action = action.replace(/\/rowMap\/([^/]+)/, "/rowMap/{row}");
  return { action, tile_id: tileId, shared_model_id: sharedModelId };
}

export function toIso(v) {
  if (v == null) return null;
  if (typeof v === "number") return new Date(v).toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(+d) ? null : d.toISOString();
  }
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  return null;
}

export function summarise(content) {
  const tileMap = content?.tileMap ?? {};
  const tiles = Object.values(tileMap);
  const tileTypes = tiles.map((t) => t?.content?.type ?? null).filter((t) => typeof t === "string");
  const counts = {};
  for (const t of tileTypes) counts[t] = (counts[t] ?? 0) + 1;
  return {
    n_tiles: tiles.length,
    tile_types: [...new Set(tileTypes)].sort(),
    tile_type_counts: counts,
    n_dataflow_tiles: counts["Dataflow"] ?? 0,
    n_rows: Object.keys(content?.rowMap ?? {}).length,
    n_shared_models: Object.keys(content?.sharedModelMap ?? {}).length,
    n_annotations: Object.keys(content?.annotations ?? {}).length
  };
}

// Written to a .tmp name and renamed, so an interrupted pull never leaves a partial
// file that reads as a complete one. The recipes do the same, and here it also matters
// for the sync: a renamed file is either absent or whole when the syncer walks it.
function writeAtomic(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, contents);
  fs.renameSync(`${file}.tmp`, file);
}

function openAtomic(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, "w");
  return {
    write: (line) => fs.writeSync(fd, line),
    close: () => {
      fs.closeSync(fd);
      fs.renameSync(tmp, file);
    }
  };
}

async function readMetadata({ db, portal, classHash, out }) {
  const q = query(collection(db, `authed/${portal}/documents`), where("context_id", "==", classHash));
  const snap = await getDocs(q);

  const rows = [];
  const file = openAtomic(path.join(out, "metadata.jsonl"));
  for (const d of snap.docs) {
    const data = d.data();
    const row = {
      doc_key: data.key ?? d.id,
      fs_doc_id: d.id,
      offering_id: data.offeringId ?? null,
      fs_unit: data.unit ?? null,
      fs_investigation: data.investigation ?? null,
      fs_problem: data.problem ?? null,
      fs_context_id: data.context_id ?? null,
      fs_uid: data.uid ?? null,
      fs_type: data.type ?? null,
      network: data.network ?? null,
      visibility: data.visibility ?? null,
      kind: data.kind ?? null,
      strategies: Array.isArray(data.strategies) ? data.strategies : null
    };
    file.write(JSON.stringify(row) + "\n");
    rows.push(row);
  }
  file.close();
  return rows;
}

// Content and documentMetadata for the whole class arrive in one RTDB read: the rule
// grants the class subtree, and it is one round trip rather than one per document.
async function readContent({ rtdb, portal, classHash, out }) {
  const snap = await get(ref(rtdb, `/authed/portals/${portal}/classes/${classHash}/users`));
  const users = snap.val() ?? {};

  const file = openAtomic(path.join(out, "content.jsonl"));
  let found = 0;
  const offeringByKey = new Map();
  for (const [uid, node] of Object.entries(users)) {
    for (const [key, meta] of Object.entries(node?.documentMetadata ?? {})) {
      if (meta?.offeringId != null) offeringByKey.set(key, String(meta.offeringId));
    }
    for (const [key, val] of Object.entries(node?.documents ?? {})) {
      let parsed = null;
      let parseOk = true;
      try {
        parsed = typeof val?.content === "string" ? JSON.parse(val.content) : (val?.content ?? null);
      } catch {
        parseOk = false;
      }
      file.write(
        JSON.stringify({
          doc_key: key,
          doc_uid: uid,
          class_hash: classHash,
          found: true,
          change_count: typeof val?.changeCount === "number" ? val.changeCount : null,
          version: val?.version ?? null,
          self_uid: val?.self?.uid ?? null,
          self_doc_key: val?.self?.documentKey ?? null,
          self_class_hash: val?.self?.classHash ?? null,
          parse_ok: parseOk,
          ...(parsed
            ? summarise(parsed)
            : {
                n_tiles: null, tile_types: null, tile_type_counts: null, n_dataflow_tiles: null,
                n_rows: null, n_shared_models: null, n_annotations: null
              }),
          content_json: typeof val?.content === "string" ? val.content : JSON.stringify(val?.content ?? null)
        }) + "\n"
      );
      found += 1;
    }
  }
  file.close();
  return { users: Object.keys(users).length, documents: found, offeringByKey };
}

async function readHistory({ db, portal, classHash, metadata, offeringByKey, out }) {
  const dir = path.join(out, "history");
  let total = 0;
  let withHistory = 0;

  for (const meta of metadata) {
    const docId = meta.fs_doc_id;
    const snap = await getDocs(
      query(collection(db, `authed/${portal}/documents/${docId}/history`), orderBy("index"))
    );

    // Written incrementally rather than joined into one string: a real document's
    // history exceeds V8's maximum string length, which is how the recipe found out.
    const file = openAtomic(path.join(dir, `${docId}.jsonl`));
    const idxs = [];
    let unparsed = 0;
    for (const h of snap.docs) {
      const data = h.data();
      let entry = null;
      try {
        entry = data.entry ? JSON.parse(data.entry) : null;
      } catch {
        entry = null;
      }
      if (entry === null) unparsed += 1;
      if (typeof data.index === "number") idxs.push(data.index);
      const { action, tile_id, shared_model_id } = normalizeAction(entry?.action);
      file.write(
        JSON.stringify({
          doc_id: docId,
          doc_uid: meta.fs_uid ?? null,
          portal_class_id: classHash,
          unit: meta.fs_unit ?? null,
          investigation: meta.fs_investigation ?? null,
          problem: meta.fs_problem ?? null,

          entry_id: h.id,
          idx: typeof data.index === "number" ? data.index : null,
          prev_entry_id: data.previousEntryId ?? null,
          created: toIso(entry?.created),
          server_created: toIso(data.created),

          model: entry?.model ?? null,
          action_raw: entry?.action ?? null,
          action,
          tile_id,
          shared_model_id,

          n_records: Array.isArray(entry?.records) ? entry.records.length : null,
          undoable: entry?.undoable ?? null,
          is_revert: entry?.isRevert ?? null,
          entry_uid: entry?.uid ?? null,
          state: entry?.state ?? null,
          parse_ok: entry !== null,

          entry_json: data.entry ?? null
        }) + "\n"
      );
    }
    file.close();

    // Index gaps, duplicates and ranges that do not start at zero are expected rather
    // than errors, so they are recorded here and left for query time to interpret.
    writeAtomic(
      path.join(dir, `${docId}.meta.json`),
      JSON.stringify({
        doc_id: docId,
        doc_key: meta.doc_key,
        offering_id: meta.offering_id ?? offeringByKey.get(meta.doc_key) ?? null,
        entries_fetched: snap.size,
        min_idx: idxs.length ? Math.min(...idxs) : null,
        max_idx: idxs.length ? Math.max(...idxs) : null,
        distinct_idx: new Set(idxs).size,
        unparsed_entries: unparsed,
        fetched_at: new Date().toISOString()
      })
    );

    total += snap.size;
    if (snap.size > 0) withHistory += 1;
  }
  return { entries: total, documents_with_history: withHistory };
}

// The counts returned here are what the class document's `data` block reports and what
// the spike's package compares against the hand counts.
export async function readClue({ store, portal, classHash, dataRoot }) {
  const out = path.join(dataRoot, "clue-documents");
  const started = Date.now();

  const metadata = await readMetadata({ db: store.db, portal, classHash, out });
  const content = await readContent({ rtdb: store.rtdb, portal, classHash, out });
  const history = await readHistory({
    db: store.db, portal, classHash, metadata, offeringByKey: content.offeringByKey, out
  });

  const counts = {
    clue_documents: metadata.length,
    clue_history_entries: history.entries,
    clue_documents_with_history: history.documents_with_history,
    clue_content_documents: content.documents,
    clue_users: content.users
  };
  log.info("clue.read", { class_hash: classHash, ...counts, duration_ms: Date.now() - started });

  // The two stores should describe the same document set; a mismatch means one of them
  // was read partially, which is worth seeing in the logs rather than in a count later.
  if (content.documents !== metadata.length) {
    log.warn("clue.store_mismatch", {
      class_hash: classHash, firestore_documents: metadata.length, rtdb_documents: content.documents
    });
  }
  return counts;
}
