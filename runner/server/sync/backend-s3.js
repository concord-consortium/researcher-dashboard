import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand
} from "@aws-sdk/client-s3";

// Credentials come from the storage broker, never from the execution role: `client` is
// a function returning the S3 client for the current broker credentials
// (storage.js StorageCredentials.client), asked before every call so each use is
// checked against the wall clock. There is no default.
export class S3Backend {
  constructor({ bucket, prefix, client }) {
    if (typeof client !== "function") {
      throw new Error("S3Backend needs the broker's client provider; it has no default credentials");
    }
    this.bucket = bucket;
    // Normalized to exactly one trailing slash so key building cannot produce
    // `researchers//439` or `researchers439`.
    this.prefix = prefix.replace(/\/+$/, "") + "/";
    this.client = client;
  }

  #key(relPath) {
    return `${this.prefix}${relPath}`;
  }

  async #send(command) {
    return (await this.client()).send(command);
  }

  async put(relPath, sourcePath) {
    await this.#send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.#key(relPath),
        Body: createReadStream(sourcePath)
      })
    );
  }

  async get(relPath, destPath) {
    const res = await this.#send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.#key(relPath) })
    );
    await mkdir(path.dirname(destPath), { recursive: true });
    await pipeline(res.Body, createWriteStream(destPath));
  }

  async remove(relPath) {
    await this.#send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.#key(relPath) })
    );
  }

  async list() {
    const out = [];
    let token;
    do {
      const res = await this.#send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.prefix,
          ContinuationToken: token
        })
      );
      for (const obj of res.Contents ?? []) {
        out.push({ path: obj.Key.slice(this.prefix.length), size: obj.Size });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }
}
