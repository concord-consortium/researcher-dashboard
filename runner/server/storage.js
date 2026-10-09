import { S3Client } from "@aws-sdk/client-s3";
import { log } from "./log.js";

// The only place an S3 client is built, and only from the storage broker's credentials.
// The execution role reaches nothing but the VM's logs, and the default chain is switched
// off in-process (config.js disableDefaultCredentialChain), so a client built any other
// way fails.
export function makeS3Client(credentials) {
  const { accessKeyId, secretAccessKey, sessionToken, region, expiration } = credentials ?? {};
  for (const [name, value] of Object.entries({ accessKeyId, secretAccessKey, sessionToken, region })) {
    if (typeof value !== "string" || value === "") {
      throw new Error(`an S3 client needs the broker's ${name}, and none was given`);
    }
  }
  return new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey, sessionToken, ...(expiration ? { expiration } : {}) }
  });
}

// A credential this close to its expiration is fetched again rather than used.
export const REFRESH_MARGIN_MS = 5 * 60_000;

// The broker's credentials for this VM's researcher, checked against the wall clock
// immediately before each use and never refreshed on a timer: a suspended VM's timers
// stop, and a timer set for fifty minutes resumes believing it still has fifty. A resume
// marks them stale, so the first use after one always fetches whatever the clock says.
export class StorageCredentials {
  #fetched = null;
  #client = null;
  #stale = true;
  #inFlight = null;

  // `fetchCredentials` calls POST /storage-credentials with the current session's ID
  // token; `bucket` and `prefix` are what the payload says this VM may reach.
  constructor({ fetchCredentials, bucket, prefix, now = () => Date.now(), makeClient = makeS3Client }) {
    this.fetchCredentials = fetchCredentials;
    this.bucket = bucket;
    this.prefix = prefix.replace(/\/+$/, "") + "/";
    this.now = now;
    this.makeClient = makeClient;
  }

  markStale() {
    this.#stale = true;
  }

  get fetchedAt() {
    return this.#fetched?.at ?? null;
  }

  #usable() {
    if (this.#stale || !this.#fetched) return false;
    return this.#fetched.expiresAt - this.now() > REFRESH_MARGIN_MS;
  }

  async client() {
    if (this.#usable()) return this.#client;
    if (!this.#inFlight) {
      this.#inFlight = this.#refresh().finally(() => {
        this.#inFlight = null;
      });
    }
    await this.#inFlight;
    return this.#client;
  }

  async #refresh() {
    const answer = await this.fetchCredentials();
    // The broker names what it issued. A session for another bucket or prefix would sync
    // one researcher's corpus somewhere it does not belong, so it is refused, not used.
    if (answer.bucket !== this.bucket) {
      throw new Error(`the storage broker issued credentials for bucket ${answer.bucket}, not ${this.bucket}`);
    }
    if (answer.prefix !== this.prefix) {
      throw new Error(`the storage broker issued credentials for ${answer.prefix}, not ${this.prefix}`);
    }
    const expiresAt = Date.parse(answer.expiration);
    if (!Number.isFinite(expiresAt)) {
      throw new Error(`the storage broker's expiration ${answer.expiration} is not a time`);
    }
    this.#client = this.makeClient({
      accessKeyId: answer.access_key_id,
      secretAccessKey: answer.secret_access_key,
      sessionToken: answer.session_token,
      region: answer.region,
      expiration: new Date(expiresAt)
    });
    this.#fetched = { expiresAt, at: this.now() };
    this.#stale = false;
    log.info("storage.credentials_fetched", { expiration: answer.expiration });
  }
}
