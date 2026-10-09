#!/usr/bin/env node
// The runner's smoke gate (runner/README.md says when to run each command). Node's own fetch and child_process, and nothing else, so it runs from a
// fresh checkout with `node smoke/smoke.mjs <command>` in runner/.
//
//   build  [--any <pattern>]...   the smoke package's zip, reproducibly, and its checksum
//   image  --class-id <id> --class-hash <hash> [--portal <host>]
//          builds the image and runs the smoke package inside it, against staging's
//          report-server, as the researcher whose token is in RD_SMOKE_REPORT_SERVER_TOKEN
//   stack  --identity <origin>/runner-smoke --version <v> --class-hash <hash>
//          [--portal-url <url>] [--firebase-project <p>] [--terminate]
//          runs the published smoke package on a stack through rigse, with a scoped access
//          token for the smoke class in RD_SMOKE_ACCESS_TOKEN, and checks its result document
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { firebaseConfig } from "../server/firebase-projects.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE = path.join(HERE, "package");
const MARKER = "RUNNER-SMOKE-OK";

function args(argv) {
  const out = { any: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    if (key === "terminate") out.terminate = true;
    else if (key === "any") out.any.push(argv[++i]);
    else out[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  return out;
}

function need(opts, ...names) {
  for (const name of names) if (!opts[name]) fail(`--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required`);
}

function fail(message) {
  console.error(`smoke: ${message}`);
  process.exit(1);
}

// A reproducible archive: the package's files in sorted order with fixed timestamps, so
// the same package always has the same checksum.
function build(opts) {
  const manifest = JSON.parse(fs.readFileSync(path.join(PACKAGE, "manifest.json"), "utf8"));
  const staged = fs.mkdtempSync(path.join(os.tmpdir(), "rd-smoke-"));
  // The package's own files only: no __pycache__ or .pyc a local run left beside them.
  for (const entry of fs.readdirSync(PACKAGE, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.endsWith(".pyc")) fs.copyFileSync(path.join(PACKAGE, entry.name), path.join(staged, entry.name));
  }
  if (opts.any.length) {
    fs.writeFileSync(path.join(staged, "manifest.json"), `${JSON.stringify({ ...manifest, urls: { any: opts.any } }, null, 2)}\n`);
  }
  const files = fs.readdirSync(staged).sort();
  const fixed = new Date("2020-01-01T00:00:00Z");
  for (const file of files) fs.utimesSync(path.join(staged, file), fixed, fixed);
  const dist = path.join(HERE, "dist");
  fs.mkdirSync(dist, { recursive: true });
  const archive = path.join(dist, `${manifest.name}-${manifest.version}.zip`);
  fs.rmSync(archive, { force: true });
  execFileSync("zip", ["-X", "-q", archive, ...files], { cwd: staged });
  fs.rmSync(staged, { recursive: true, force: true });
  const checksum = `sha256:${execFileSync("sha256sum", [archive], { encoding: "utf8" }).split(" ")[0]}`;
  console.log(JSON.stringify({ archive, checksum, name: manifest.name, version: manifest.version }));
  return { archive, checksum };
}

// Before any stack exists: the image's toolchain, cc-data and report-server's columns.
function image(opts) {
  need(opts, "classId", "classHash");
  const token = process.env.RD_SMOKE_REPORT_SERVER_TOKEN ?? fail("RD_SMOKE_REPORT_SERVER_TOKEN is not set");
  const portal = opts.portal ?? "learn.portal.staging.concord.org";
  execFileSync("make", ["build"], { cwd: path.join(HERE, ".."), stdio: "inherit" });
  const scope = { kind: "class", id: opts.classHash, classes: [{ class_hash: opts.classHash, class_id: Number(opts.classId) }], assignments: [], clue_source: "firebase", dataset: "pkg-0", output_dir: "/tmp/out" };
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
  const out = execFileSync("docker", ["run", "--rm", "--platform", "linux/arm64", "-e", "RD_SMOKE_REPORT_SERVER_TOKEN",
    "-v", `${PACKAGE}:/smoke:ro`, "--entrypoint", "/bin/sh", "researcher-dashboard-runner", "-c", script],
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
  const access = process.env.RD_SMOKE_ACCESS_TOKEN ?? fail("RD_SMOKE_ACCESS_TOKEN is not set");
  const portalUrl = (opts.portalUrl ?? "https://learn.portal.staging.concord.org").replace(/\/+$/, "");
  const project = opts.firebaseProject ?? "report-service-dev";
  const bearer = { Authorization: `Bearer ${access}` };
  const uid = JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString("utf8")).uid;
  const portal = new URL(portalUrl).host.replaceAll(".", "_");
  const docId = opts.identity.replaceAll("/", "__");

  const queued = await json(`${portalUrl}/api/v1/researcher_dashboard/run_package`, {
    method: "POST", headers: { ...bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ packages: [{ identity: opts.identity, version: opts.version }] })
  });
  console.log(`queued: ${JSON.stringify(queued)}`);

  // A researcher token for the class, the same one the dashboard reads results with.
  const { token } = await json(`${portalUrl}/api/v1/jwt/firebase?firebase_app=${project}&researcher=true&class_hash=${opts.classHash}`, { headers: bearer });
  const { idToken } = await json(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseConfig(project).apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true })
  });
  const read = async (docPath) => {
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${docPath}`, { headers: { Authorization: `Bearer ${idToken}` } });
    return res.status === 404 ? null : res.json();
  };
  const resultPath = `researcher_dashboard/${portal}/classes/${opts.classHash}/researchers/${uid}/results/${docId}`;
  const deadline = Date.now() + 10 * 60_000;
  let fields = null;
  while (Date.now() < deadline) {
    fields = (await read(resultPath))?.fields ?? null;
    const status = fields?.status?.stringValue;
    process.stdout.write(`\rresult: ${status ?? "(none)"}, stage ${fields?.stage?.stringValue ?? "-"}    `);
    if (status === "done" || status === "failed") break;
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.log();
  const runner = (await read(`researcher_dashboard/${portal}/runners/${uid}`))?.fields;
  const microvmId = runner?.microvm_id?.stringValue;
  if (microvmId) {
    console.log(`VM: ${microvmId}\n  aws lambda-microvms terminate-microvm --microvm-identifier ${microvmId}`);
    if (opts.terminate) execFileSync("aws", ["lambda-microvms", "terminate-microvm", "--microvm-identifier", microvmId], { stdio: "inherit" });
  }
  if (fields?.status?.stringValue !== "done") fail(`the smoke run did not finish: ${fields?.status?.stringValue ?? "no result"} ${fields?.error?.stringValue ?? ""}`);
  if (!fields.display?.stringValue?.includes(MARKER)) fail(`the result's display lacks ${MARKER}`);
  console.log(`smoke: done, ${fields.summary?.stringValue}`);
}

const [command, ...rest] = process.argv.slice(2);
const opts = args(rest);
if (command === "build") build(opts);
else if (command === "image") image(opts);
else if (command === "stack") await stack(opts);
else fail("usage: smoke.mjs build | image | stack (see runner/README.md)");
