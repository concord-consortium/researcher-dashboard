import assert from "node:assert/strict";
import test from "node:test";
import { defaultChainState, disableDefaultCredentialChain, loadEnv } from "../server/config.js";

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

test("the duration ceiling refuses a configured value below report-server's limit or above the VM's life", () => {
  assert.equal(loadEnv(BASE).packageMaxDurationSeconds, 7200);
  assert.equal(loadEnv({ ...BASE, PACKAGE_MAX_DURATION_SECONDS: "28800" }).packageMaxDurationSeconds, 28800);
  assert.throws(() => loadEnv({ ...BASE, PACKAGE_MAX_DURATION_SECONDS: "7199" }), /at least 7200/);
  assert.throws(() => loadEnv({ ...BASE, PACKAGE_MAX_DURATION_SECONDS: "28801" }), /at most 28800/);
  assert.throws(() => loadEnv({ ...BASE, PACKAGE_MAX_DURATION_SECONDS: "2h" }), /positive integer/);
});

test("the package timeout and the idle period and poll are read from the environment", () => {
  const env = loadEnv({ ...BASE, PACKAGE_TIMEOUT_MS: "5000", IDLE_PERIOD_MS: "60000", IDLE_POLL_MS: "1000" });
  assert.equal(env.packageTimeoutMs, 5000);
  assert.equal(env.idlePeriodMs, 60_000);
  assert.equal(env.idlePollMs, 1000);
  assert.equal(loadEnv(BASE).packageTimeoutMs, null, "unset, each package's bound comes from its declared duration");
  assert.throws(() => loadEnv({ ...BASE, PACKAGE_TIMEOUT_MS: "0" }), /positive integer/);
  assert.throws(() => loadEnv({ ...BASE, IDLE_POLL_MS: "x" }), /positive integer/);
});

// Each VM's log says whether the switch holds; it must say so when it does not.
test("the default chain reads as enabled when any part of the switch is missing", () => {
  const off = () => disableDefaultCredentialChain({});
  assert.deepEqual(defaultChainState(off()), { disabled: true, present: [] });
  assert.deepEqual(defaultChainState({ ...off(), AWS_ACCESS_KEY_ID: "x" }), { disabled: false, present: ["AWS_ACCESS_KEY_ID"] });
  const { AWS_EC2_METADATA_DISABLED, ...noImds } = off();
  assert.equal(defaultChainState(noImds).disabled, false);
  assert.equal(defaultChainState({ ...off(), AWS_CONFIG_FILE: "/home/x/.aws/config" }).disabled, false);
  assert.equal(defaultChainState({ ...off(), AWS_SHARED_CREDENTIALS_FILE: "/home/x/.aws/credentials" }).disabled, false);
});
