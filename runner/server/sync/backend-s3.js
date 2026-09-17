import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

// Credentials come from the MicroVM execution role, which Lambda injects, so no
// key material is configured here or carried in runHookPayload.
export class S3Backend {
  constructor({ bucket, prefix, client }) {
    this.bucket = bucket;
    // Normalized to exactly one trailing slash so key building cannot produce
    // `researchers//439` or `researchers439`.
    this.prefix = prefix.replace(/\/+$/, "") + "/";
    this.client = client ?? new S3Client({});
  }

  #key(relPath) {
    return `${this.prefix}${relPath}`;
  }

  async put(relPath, sourcePath) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.#key(relPath),
        Body: createReadStream(sourcePath)
      })
    );
  }

  async get(relPath, destPath) {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.#key(relPath) })
    );
    await mkdir(path.dirname(destPath), { recursive: true });
    await pipeline(res.Body, createWriteStream(destPath));
  }

  async remove(relPath) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.#key(relPath) })
    );
  }

  async list() {
    const out = [];
    let token;
    do {
      const res = await this.client.send(
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
