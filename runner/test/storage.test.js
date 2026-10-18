import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { S3Client } from "@aws-sdk/client-s3";
import { DEFAULT_CHAIN_VARIABLES, disableDefaultCredentialChain } from "../server/config.js";
import { REFRESH_MARGIN_MS, StorageCredentials, makeS3Client } from "../server/storage.js";
import { S3Backend } from "../server/sync/index.js";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server");
const sources = () => {
  const out = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) out[path.relative(SERVER, full)] = fs.readFileSync(full, "utf8");
    }
  };
  walk(SERVER);
  return out;
};

const ANSWER = (over = {}) => ({
  success: true,
  access_key_id: "ASIABROKER",
  secret_access_key: "secret",
  session_token: "session",
  expiration: new Date(Date.now() + 3600_000).toISOString(),
  bucket: "researcher-dashboard-runner-staging",
  prefix: "researchers/439/",
  region: "us-east-1",
  ...over
});

// The execution role holds its logs and nothing else, so every S3 client has to be
// built from the broker's credentials, in one place.
test("S3Client is constructed in exactly one module, and no other AWS client is imported", () => {
  const files = sources();
  const constructing = Object.entries(files).filter(([, src]) => /new\s+S3Client\s*\(/.test(src)).map(([f]) => f);
  assert.deepEqual(constructing, ["storage.js"]);
  for (const [file, src] of Object.entries(files)) {
    for (const [, pkg] of src.matchAll(/from\s+"(@aws-sdk\/[^"]+)"/g)) {
      assert.equal(pkg, "@aws-sdk/client-s3", `${file} imports ${pkg}`);
    }
    if (file !== "storage.js") assert.ok(!/\bS3Client\b/.test(src.replace(/\/\/.*$/gm, "")), `${file} names S3Client`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(SERVER, "..", "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies).filter((d) => d.startsWith("@aws-sdk/")), ["@aws-sdk/client-s3"]);
});

test("the builder refuses a client without the broker's four values", () => {
  const good = { accessKeyId: "ASIA", secretAccessKey: "s", sessionToken: "t", region: "us-east-1" };
  for (const missing of ["accessKeyId", "secretAccessKey", "sessionToken", "region"]) {
    assert.throws(() => makeS3Client({ ...good, [missing]: undefined }), new RegExp(missing));
  }
  assert.throws(() => makeS3Client(undefined), /accessKeyId/);
});

test("a client it builds resolves the broker's credentials, whatever the environment holds", async () => {
  const saved = { id: process.env.AWS_ACCESS_KEY_ID, secret: process.env.AWS_SECRET_ACCESS_KEY };
  process.env.AWS_ACCESS_KEY_ID = "AKIAFROMTHEENVIRONMENT";
  process.env.AWS_SECRET_ACCESS_KEY = "from-the-environment";
  try {
    const client = makeS3Client({ accessKeyId: "ASIABROKER", secretAccessKey: "s", sessionToken: "t", region: "us-east-1" });
    const creds = await client.config.credentials();
    assert.equal(creds.accessKeyId, "ASIABROKER");
    assert.equal(creds.sessionToken, "t");
  } finally {
    for (const [k, v] of [["AWS_ACCESS_KEY_ID", saved.id], ["AWS_SECRET_ACCESS_KEY", saved.secret]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

// What makes a leftover default-chain client fail at once, naming its cause, rather than
// with an AccessDenied from the execution role. Credentials sit in the environment and in a
// shared credentials file first, so the client fails because of the switch, not because
// the machine running the test has none.
test("with the default chain switched off, a client built without credentials cannot resolve any", async () => {
  const env = { ...process.env, AWS_ACCESS_KEY_ID: "AKIA", AWS_SECRET_ACCESS_KEY: "x", AWS_PROFILE: "default" };
  disableDefaultCredentialChain(env);
  // The eight variables the SDK's default provider reads, written out so the module's
  // own list is checked against them.
  const named = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_WEB_IDENTITY_TOKEN_FILE", "AWS_ROLE_ARN"];
  assert.deepEqual([...DEFAULT_CHAIN_VARIABLES].sort(), [...named].sort());
  const sentinels = Object.fromEntries(named.map((name) => [name, "sentinel"]));
  const all = disableDefaultCredentialChain({ ...sentinels });
  for (const name of named) assert.equal(all[name], undefined, name);
  assert.equal(env.AWS_EC2_METADATA_DISABLED, "true");

  const dir = fs.mkdtempSync(path.join(tmpdir(), "rd-chain-"));
  const credentials = path.join(dir, "credentials");
  fs.writeFileSync(credentials, "[default]\naws_access_key_id = AKIAFROMTHEFILE\naws_secret_access_key = from-the-file\n");
  const saved = { ...process.env };
  Object.assign(process.env, { AWS_ACCESS_KEY_ID: "AKIAFROMTHEENVIRONMENT", AWS_SECRET_ACCESS_KEY: "from-the-environment", AWS_SHARED_CREDENTIALS_FILE: credentials, AWS_CONFIG_FILE: path.join(dir, "config") });
  disableDefaultCredentialChain(process.env);
  try {
    const client = new S3Client({ region: "us-east-1" });
    await assert.rejects(() => client.config.credentials(), (err) => err.name === "CredentialsProviderError");
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("S3Backend has no default: it needs the broker's client provider", () => {
  assert.throws(() => new S3Backend({ bucket: "b", prefix: "researchers/439" }), /no default credentials/);
});

test("credentials are fetched on first use and reused until near their expiry", async () => {
  let fetched = 0;
  let t = Date.parse("2026-09-26T12:00:00Z");
  const creds = new StorageCredentials({
    bucket: "researcher-dashboard-runner-staging",
    prefix: "researchers/439",
    now: () => t,
    fetchCredentials: async () => { fetched += 1; return ANSWER({ expiration: new Date(t + 3600_000).toISOString() }); },
    makeClient: (c) => ({ c })
  });
  const first = await creds.client();
  assert.equal(first.c.accessKeyId, "ASIABROKER");
  assert.equal(await creds.client(), first);
  t += 3600_000 - REFRESH_MARGIN_MS - 1000;
  assert.equal(await creds.client(), first, "still usable");
  t += 2000;
  await creds.client();
  assert.equal(fetched, 2, "checked against the wall clock at the moment of use");
});

test("a resume marks the credentials stale whatever the clock says", async () => {
  let fetched = 0;
  const creds = new StorageCredentials({ bucket: "researcher-dashboard-runner-staging", prefix: "researchers/439/", fetchCredentials: async () => { fetched += 1; return ANSWER(); }, makeClient: () => ({}) });
  await creds.client();
  creds.markStale();
  await creds.client();
  assert.equal(fetched, 2);
});

test("a fetch under way when the VM resumes is not the one the next use takes", async () => {
  let fetched = 0;
  const releases = [];
  const creds = new StorageCredentials({
    bucket: "researcher-dashboard-runner-staging",
    prefix: "researchers/439/",
    fetchCredentials: () => { fetched += 1; const n = fetched; return new Promise((r) => releases.push(() => r(ANSWER({ access_key_id: `ASIA${n}` })))); },
    makeClient: (c) => ({ key: c.accessKeyId })
  });
  const before = creds.client();
  await new Promise((r) => setImmediate(r));
  creds.markStale();
  const after = creds.client();
  releases[0]();
  for (let i = 0; i < 100 && releases.length < 2; i++) await new Promise((r) => setImmediate(r));
  assert.equal(releases.length, 2, "a second fetch starts once the first answers for the earlier generation");
  releases[1]();
  assert.equal((await after).key, "ASIA2", "the use after the resume gets credentials fetched after it");
  assert.equal((await before).key, "ASIA2");
  assert.equal(fetched, 2);
});

test("concurrent uses share one fetch", async () => {
  let fetched = 0;
  const creds = new StorageCredentials({ bucket: "researcher-dashboard-runner-staging", prefix: "researchers/439/", fetchCredentials: async () => { fetched += 1; await new Promise((r) => setTimeout(r, 5)); return ANSWER(); }, makeClient: () => ({}) });
  await Promise.all([creds.client(), creds.client(), creds.client()]);
  assert.equal(fetched, 1);
});

test("credentials for another bucket or prefix are refused, not used", async () => {
  const cases = [
    [{ bucket: "another-bucket" }, /for bucket another-bucket, not researcher-dashboard-runner-staging$/],
    [{ prefix: "researchers/999/" }, /for researchers\/999\/, not researchers\/439\/$/],
    [{ expiration: "soon" }, /expiration soon is not a time$/]
  ];
  for (const [over, reason] of cases) {
    let made = 0;
    const creds = new StorageCredentials({ bucket: "researcher-dashboard-runner-staging", prefix: "researchers/439/", fetchCredentials: async () => ANSWER(over), makeClient: () => { made += 1; return {}; } });
    await assert.rejects(() => creds.client(), reason);
    assert.equal(made, 0, "no client is built from refused credentials");
  }
});
