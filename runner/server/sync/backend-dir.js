import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";

// The DIR backend copies to a local directory instead of S3. It exists so the
// hooks, the scheduler and the flush-and-verify contract can be driven end to end
// in tests, with no AWS credentials and no network.
export class DirBackend {
  constructor(root) {
    this.root = root;
  }

  #abs(relPath) {
    return path.join(this.root, relPath);
  }

  // `body` is a stream of the file the syncer opened and checked, which the syncer closes, or
  // a Buffer, which pipeline cannot take as a source.
  async put(relPath, { body }) {
    const dest = this.#abs(relPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await pipeline(Buffer.isBuffer(body) ? Readable.from([body]) : body, createWriteStream(dest));
  }

  async get(relPath, destPath) {
    await mkdir(path.dirname(destPath), { recursive: true });
    await copyFile(this.#abs(relPath), destPath);
  }

  async remove(relPath) {
    await rm(this.#abs(relPath), { force: true });
  }

  // Relative paths of everything stored, which /run walks to pull the researcher's
  // prefix down.
  async list() {
    const out = [];
    const walk = async (dir) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (err) {
        if (err.code === "ENOENT") return;
        throw err;
      }
      for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(abs);
        } else if (entry.isFile()) {
          const info = await stat(abs);
          out.push({
            path: path.relative(this.root, abs).split(path.sep).join("/"),
            size: info.size
          });
        }
      }
    };
    await walk(this.root);
    return out;
  }
}
