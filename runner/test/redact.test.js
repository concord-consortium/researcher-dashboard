import assert from "node:assert/strict";
import test from "node:test";
import { redact } from "../server/log.js";

// Whatever a step throws ends up in the result document, which every researcher of the
// class reads. These are the shapes that actually turn up in this runner's errors.
test("strips the signature from a presigned S3 URL", () => {
  const msg = "fetch failed: https://bucket.s3.amazonaws.com/scripts/demo/1.0.0.zip" +
    "?X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20260918&X-Amz-Signature=abc123def456&X-Amz-Expires=900";
  const out = redact(msg);
  assert.ok(!out.includes("abc123def456"), "signature must not survive");
  assert.ok(!out.includes("AKIAIOSFODNN7EXAMPLE"), "credential must not survive");
  assert.ok(out.includes("X-Amz-Expires=900"), "harmless parameters are left alone");
});

test("strips a bearer token and a JWT", () => {
  assert.equal(redact("401 from report-server: Bearer abc.def.ghi"), "401 from report-server: Bearer [redacted]");
  const jwt = "eyJhbGciOi.eyJ1aWQiOi.sIgnAtUre";
  assert.equal(redact(`sign-in failed for ${jwt}`), "sign-in failed for [redacted jwt]");
});

test("strips an AWS access key id wherever it appears", () => {
  assert.equal(redact("denied for AKIAIOSFODNN7EXAMPLE"), "denied for [redacted key id]");
  assert.equal(redact("denied for ASIAIOSFODNN7EXAMPLE"), "denied for [redacted key id]");
});

test("leaves an ordinary message alone", () => {
  const msg = "package exited 1: no rows matched context_id";
  assert.equal(redact(msg), msg);
});

// A stack trace or a dumped response body would otherwise become the whole document.
test("caps the length", () => {
  const out = redact("x".repeat(900));
  assert.equal(out.length, 503);
  assert.ok(out.endsWith("..."));
});

test("survives a missing message", () => {
  assert.equal(redact(undefined), "");
  assert.equal(redact(null), "");
});
