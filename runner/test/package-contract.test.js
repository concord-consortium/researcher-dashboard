import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { IDENTITY, VERSION, packageDocId } from "../server/package-fetch.js";
import { PACKAGE_MAX_DURATION_DEFAULT } from "../server/config.js";

// report-service's contract fixture, the one source of the catalog's grammar and limits.
const contract = JSON.parse(fs.readFileSync(new URL("../../fixtures/package-contract.json", import.meta.url), "utf8"));

test("the identity grammar agrees with every case in the contract", () => {
  assert.ok(contract.identity.length > 0);
  for (const { value, valid } of contract.identity) assert.equal(IDENTITY.test(value), valid, value);
});

test("the version grammar agrees with every case in the contract", () => {
  assert.ok(contract.version.length > 0);
  for (const { value, valid } of contract.version) assert.equal(VERSION.test(value), valid, value);
});

test("the package key agrees with every case in the contract", () => {
  assert.ok(contract.package_key.length > 0);
  for (const { identity, key } of contract.package_key) assert.equal(packageDocId(identity), key);
});

test("the ceiling's default is report-server's publish limit", () => {
  assert.equal(PACKAGE_MAX_DURATION_DEFAULT, contract.limits.max_duration_seconds);
});
