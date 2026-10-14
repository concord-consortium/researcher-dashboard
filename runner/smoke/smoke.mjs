#!/usr/bin/env node
// The runner's smoke gate (runner/README.md says when to run each command). Node's own fetch and child_process, and nothing else, so it runs from a
// fresh checkout with `node smoke/smoke.mjs <command>` in runner/.
//
//   build  [--any <pattern>]... [--version <v>] [--hold <seconds>]
//          the smoke package's zip, reproducibly, and its checksum; --hold makes the package
//          sleep that long after its checks and declare that much longer
//   image  --class-id <id> --class-hash <hash> [--portal <host>]
//          builds the image and runs the smoke package inside it, against staging's
//          report-server, as the researcher whose token is in RD_SMOKE_REPORT_SERVER_TOKEN
//   stack  --identity <origin>/runner-smoke --version <v> --class-hash <hash>
//          [--portal-url <url>] [--firebase-project <p>] [--wait-minutes <n>] [--terminate]
//          runs the published smoke package on a stack through rigse, with a scoped access
//          token for the smoke class in RD_SMOKE_ACCESS_TOKEN, and checks its result document
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { firebaseConfig } from "../server/firebase-projects.js";
import { scopeFile } from "../server/package-env.js";
import { VERSION, packageDocId } from "../server/package-fetch.js";
import { resultPath, runnerPath } from "../server/status.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE = path.join(HERE, "package");
// smoke/package/run.py writes this into its display; the two must match.
const MARKER = "RUNNER-SMOKE-OK";

function args(argv) {
  const out = { any: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    if (key === "terminate") {
      out.terminate = true;
      continue;
    }
    if (i + 1 >= argv.length) fail(`--${key} needs a value`);
    if (key === "any") out.any.push(argv[++i]);
    else out[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  return out;
}

const flag = (name) => `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

function need(opts, ...names) {
  for (const name of names) if (!opts[name]) fail(`${flag(name)} is required`);
}

function positiveInteger(opts, name) {
  const value = Number(opts[name]);
  if (!Number.isInteger(value) || value < 1) fail(`${flag(name)} must be a positive integer`);
  return value;
}

function fail(message) {
  console.error(`smoke: ${message}`);
  process.exit(1);
}

// A reproducible archive: the package's files in sorted order with fixed timestamps, so
// the same package always has the same checksum.
function build(opts) {
  const hold = opts.hold === undefined ? undefined : positiveInteger(opts, "hold");
  const manifest = JSON.parse(fs.readFileSync(path.join(PACKAGE, "manifest.json"), "utf8"));
  if (opts.version !== undefined && !VERSION.test(opts.version)) fail(`--version ${opts.version} is not a catalog version`);
  if (hold !== undefined && (!opts.version || opts.version === manifest.version)) {
    fail(`--hold needs a --version other than the package's own ${manifest.version}, so the variant is published beside the package rather than as it`);
  }
  const staged = fs.mkdtempSync(path.join(os.tmpdir(), "rd-smoke-"));
  // The package's own files only: no __pycache__ or .pyc a local run left beside them.
  for (const entry of fs.readdirSync(PACKAGE, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.endsWith(".pyc")) fs.copyFileSync(path.join(PACKAGE, entry.name), path.join(staged, entry.name));
  }
  const built = { ...manifest };
  if (opts.any.length) built.urls = { any: opts.any };
  if (opts.version) built.version = opts.version;
  if (hold !== undefined) {
    built.expected_duration_seconds += hold;
    fs.writeFileSync(path.join(staged, "hold.txt"), `${hold}\n`);
  }
  if (opts.any.length || opts.version || hold !== undefined) {
    fs.writeFileSync(path.join(staged, "manifest.json"), `${JSON.stringify(built, null, 2)}\n`);
  }
  const files = fs.readdirSync(staged).sort();
  const fixed = new Date("2020-01-01T00:00:00Z");
  for (const file of files) fs.utimesSync(path.join(staged, file), fixed, fixed);
  const dist = path.join(HERE, "dist");
  fs.mkdirSync(dist, { recursive: true });
  const archive = path.join(dist, `${built.name}-${built.version}.zip`);
  fs.rmSync(archive, { force: true });
  execFileSync("zip", ["-X", "-q", archive, ...files], { cwd: staged });
  fs.rmSync(staged, { recursive: true, force: true });
  const checksum = `sha256:${execFileSync("sha256sum", [archive], { encoding: "utf8" }).split(" ")[0]}`;
  console.log(JSON.stringify({ archive, checksum, name: built.name, version: built.version }));
  return { archive, checksum };
}

// Before any stack exists: the image's toolchain, cc-data and report-server's columns.
function image(opts) {
  need(opts, "classId", "classHash");
  const token = process.env.RD_SMOKE_REPORT_SERVER_TOKEN ?? fail("RD_SMOKE_REPORT_SERVER_TOKEN is not set");
  const portal = opts.portal ?? "learn.portal.staging.concord.org";
  // The Makefile's names, which `make smoke-image` passes, so the image run is the one just built.
  const imageName = process.env.IMAGE ?? "researcher-dashboard-runner";
  const platform = process.env.PLATFORM ?? "linux/arm64";
  execFileSync("make", ["build", `IMAGE=${imageName}`, `PLATFORM=${platform}`], { cwd: path.join(HERE, ".."), stdio: "inherit" });
  const scope = scopeFile({ scope: { kind: "class", id: opts.classHash, classes: [{ class_hash: opts.classHash, class_id: Number(opts.classId) }], assignments: [] }, dataset: "pkg-0", outputDir: "/tmp/out" });
  // The cc-data the image was built with, read from the pin rather than written twice.
  const ref = fs.readFileSync(path.join(HERE, "..", "Dockerfile"), "utf8").match(/^ARG CC_DATA_REF=(\S+)$/m)?.[1] ?? fail("the Dockerfile pins no CC_DATA_REF");
  const script = [
    "set -e",
    `test "$(cc-data version)" = '${ref.replace(/^v/, "")}' || { echo "the image's cc-data is $(cc-data version), not ${ref}" >&2; exit 1; }`,
    "mkdir -p /tmp/in /tmp/out /tmp/home /tmp/cc-data",
    `printf '%s' '${JSON.stringify(scope)}' > /tmp/in/scope.json`,
    `printf '%s' "$RD_SMOKE_REPORT_SERVER_TOKEN" | HOME=/tmp/home cc-data login --portal ${portal} --token -`,
    `HOME=/tmp/home CC_DATA_ROOT=/tmp/cc-data CC_DATA_PORTAL=${portal} RD_DATASET=${portal}/pkg-0 RD_SCOPE_FILE=/tmp/in/scope.json python3.11 /smoke/run.py`,
    "cat /tmp/out/display.md"
  ].join("\n");
  const out = execFileSync("docker", ["run", "--rm", "--platform", platform, "-e", "RD_SMOKE_REPORT_SERVER_TOKEN",
    "-v", `${PACKAGE}:/smoke:ro`, "--entrypoint", "/bin/sh", imageName, "-c", script],
  { encoding: "utf8", env: { ...process.env, RD_SMOKE_REPORT_SERVER_TOKEN: token } });
  if (!out.includes(MARKER)) fail(`the smoke package did not report ${MARKER}:\n${out}`);
  console.log(out);
}

async function json(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) fail(`${init?.method ?? "GET"} ${url} answered ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

// On a stack: rigse queues the run, the VM takes it, and the result document says done.
async function stack(opts) {
  need(opts, "identity", "version", "classHash");
  const waitMinutes = opts.waitMinutes === undefined ? 10 : positiveInteger(opts, "waitMinutes");
  const access = process.env.RD_SMOKE_ACCESS_TOKEN ?? fail("RD_SMOKE_ACCESS_TOKEN is not set");
  const portalUrl = (opts.portalUrl ?? "https://learn.portal.staging.concord.org").replace(/\/+$/, "");
  const project = opts.firebaseProject ?? "report-service-dev";
  const bearer = { Authorization: `Bearer ${access}` };
  const uid = JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString("utf8")).uid;
  const portal = new URL(portalUrl).host.replaceAll(".", "_");
  let docId;
  try {
    docId = packageDocId(opts.identity);
  } catch (err) {
    fail(err.message);
  }

  const queued = await json(`${portalUrl}/api/v1/researcher_dashboard/run_package`, {
    method: "POST", headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ packages: [{ identity: opts.identity, version: opts.version }] })
  });
  console.log(`queued: ${JSON.stringify(queued)}`);

  // A researcher token for the class, the same one the dashboard reads results with.
  const { token } = await json(`${portalUrl}/api/v1/jwt/firebase?firebase_app=${project}&researcher=true&class_hash=${opts.classHash}`, { headers: bearer });
  const apiKey = firebaseConfig(project).apiKey;
  const session = await json(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true })
  });
  // An ID token lasts an hour, and a --hold run is waited on for longer.
  let idToken = session.idToken;
  let refreshToken = session.refreshToken;
  let expiresAt = Date.now() + Number(session.expiresIn) * 1000;
  const freshIdToken = async () => {
    if (expiresAt - Date.now() > 5 * 60_000) return idToken;
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken })
    });
    if (!res.ok) throw new Error(`refreshing the ID token answered ${res.status}: ${await res.text()}`);
    const refreshed = await res.json();
    idToken = refreshed.id_token;
    refreshToken = refreshed.refresh_token;
    expiresAt = Date.now() + Number(refreshed.expires_in) * 1000;
    return idToken;
  };
  const read = async (docPath) => {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${docPath}`, { headers: { Authorization: `Bearer ${await freshIdToken()}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`reading ${docPath} answered ${res.status}: ${await res.text()}`);
    return res.json();
  };
  const resultDoc = resultPath(portal, opts.classHash, uid, docId);
  const deadline = Date.now() + waitMinutes * 60_000;
  // A read that fails is reported and retried: the VM block below must still print.
  let fields = null;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      fields = (await read(resultDoc))?.fields ?? null;
      lastError = null;
    } catch (err) {
      lastError = err.message;
      console.error(`\n${lastError}`);
    }
    const status = fields?.status?.stringValue;
    process.stdout.write(`\rresult: ${status ?? "(none)"}, stage ${fields?.stage?.stringValue ?? "-"}    `);
    if (status === "done" || status === "failed") break;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.log();
  const runner = (await read(runnerPath(portal, uid)).catch((err) => {
    console.error(err.message);
    return null;
  }))?.fields;
  const microvmId = runner?.microvm_id?.stringValue;
  if (microvmId) {
    console.log(`VM: ${microvmId}\n  aws lambda-microvms terminate-microvm --microvm-identifier ${microvmId}`);
    if (opts.terminate) execFileSync("aws", ["lambda-microvms", "terminate-microvm", "--microvm-identifier", microvmId], { stdio: "inherit" });
  }
  if (fields?.status?.stringValue !== "done") fail(`the smoke run did not finish: ${fields?.status?.stringValue ?? "no result"} ${fields?.error?.stringValue ?? lastError ?? ""}`);
  if (!fields.display?.stringValue?.includes(MARKER)) fail(`the result's display lacks ${MARKER}`);
  console.log(`smoke: done, ${fields.summary?.stringValue}`);
}

const [command, ...rest] = process.argv.slice(2);
const opts = args(rest);
if (command === "build") build(opts);
else if (command === "image") image(opts);
else if (command === "stack") await stack(opts);
else fail("usage: smoke.mjs build | image | stack (see runner/README.md)");
