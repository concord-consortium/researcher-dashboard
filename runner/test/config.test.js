import assert from "node:assert/strict";
import test from "node:test";
import { loadEnv } from "../server/config.js";

const BASE = { SYNC_BACKEND: "DIR", SYNC_DIR: "/tmp/x" };

// Lambda injects these four into the VM and nothing else; the image version is the one
// the status document reports, so the name has to match Lambda's exactly or the field
// is silently null on every VM.
test("the image version comes from the variable Lambda injects", () => {
  const env = loadEnv({ ...BASE, AWS_LAMBDA_MICROVM_IMAGE_VERSION: "22.0" });
  assert.equal(env.imageVersion, "22.0");
});

test("a runner started outside a MicroVM has no image version rather than a made-up one", () => {
  assert.equal(loadEnv(BASE).imageVersion, null);
});
