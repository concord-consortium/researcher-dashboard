import { readdir, stat } from "node:fs/promises";
import path from "node:path";

// cc-data writes lock files beside its data (`.dataset.lock`, `.activity.lock`,
// `segments/*.lock`). They describe one machine's hold on the dataset, so copying
// them to S3 and restoring them onto a different VM would assert a lock nobody owns.
export function isExcluded(relPath) {
  return path.basename(relPath).endsWith(".lock");
}

// Walks `root` and returns a map of POSIX-relative path to {size, mtimeMs}.
// Size and mtime are what the pending calculation compares, so they are the only
// facts gathered here. A missing root is an empty tree, not an error: the runner
// scans a researcher prefix before anything has written to it.
export async function scanTree(root) {
  const files = new Map();

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") return;
      throw err;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!entry.isFile() || isExcluded(rel)) continue;
      const info = await stat(abs);
      files.set(rel, { size: info.size, mtimeMs: Math.floor(info.mtimeMs) });
    }
  }

  await walk(root);
  return files;
}

// Files that differ from what was last uploaded. Comparing size and mtime rather
// than content is the same trade `aws s3 sync` makes, but the record here is
// written by our own successful upload rather than read back from the destination,
// so a file is pending until we have seen it land.
export function pendingFiles(scanned, uploaded) {
  const pending = [];
  for (const [rel, info] of scanned) {
    const seen = uploaded.get(rel);
    if (!seen || seen.size !== info.size || seen.mtimeMs !== info.mtimeMs) {
      pending.push(rel);
    }
  }
  return pending.sort();
}
