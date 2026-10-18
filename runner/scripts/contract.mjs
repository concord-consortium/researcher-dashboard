#!/usr/bin/env node
// Keeps fixtures/package-contract.json a byte-identical copy of report-service's, which is
// the one source of the catalog's grammar and limits. The runner's tests read
// the copy, so they stay offline; this is what keeps the copy honest.
//
//   sync   [--ref <ref>]   fetch report-service's file and write the copy
//   check  [--ref <ref>]   fetch it and fail if the copy differs
//
// <ref> is a report-service branch, tag or commit, `master` by default.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COPY = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "package-contract.json");
const SOURCE = "https://raw.githubusercontent.com/concord-consortium/report-service";

function fail(message) {
  console.error(`contract: ${message}`);
  process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
const refAt = rest.indexOf("--ref");
const ref = refAt === -1 ? "master" : rest[refAt + 1] ?? fail("--ref needs a value");
const url = `${process.env.CONTRACT_SOURCE ?? SOURCE}/${ref}/fixtures/package-contract.json`;

if (command !== "sync" && command !== "check") fail("usage: contract.mjs sync | check [--ref <ref>]");
const response = await fetch(url, { signal: AbortSignal.timeout(30_000) }).catch((err) => fail(`could not fetch ${url}: ${err.message}`));
if (!response.ok) fail(`${url} answered ${response.status}`);
const upstream = Buffer.from(await response.arrayBuffer());
try {
  JSON.parse(upstream.toString("utf8"));
} catch {
  fail(`${url} is not JSON`);
}

if (command === "sync") {
  fs.writeFileSync(COPY, upstream);
  console.log(`contract: wrote ${path.relative(process.cwd(), COPY)} from ${url}`);
} else {
  const local = fs.existsSync(COPY) ? fs.readFileSync(COPY) : Buffer.alloc(0);
  if (!local.equals(upstream)) fail(`${path.relative(process.cwd(), COPY)} differs from ${url}; run npm run contract:sync and commit it`);
  console.log(`contract: ${path.relative(process.cwd(), COPY)} matches ${url}`);
}
