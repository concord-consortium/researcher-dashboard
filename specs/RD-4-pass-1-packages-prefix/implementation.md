# Implementation Plan: RD-4 pass 1, the runner's `scripts/` to `packages/` prefix rename

**Jira**: https://concord-consortium.atlassian.net/browse/RD-4, **pass 1 of 2**
**Branch**: `RD-4-pass-1-packages-prefix`, parent `main` (RD-1 merged as `e363311`), child `RD-4-pass-2-pull-loop`
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

Two steps:

1. The runner fetches from `packages/`: the runner code, `publish-package.sh` and the runner tests (R1 to R5). It needs nothing from RD-1's implementation.
2. The Makefile comment and a "Releasing the runner" section in `cloudformation/README.md` (R12, R13). It needs RD-1's README, so it is made once RD-1's implementation commits are on the parent branch and this branch has been rebased onto them (R9).

The plan had a step between these, moving the execution role's grant to `packages/*` with a tenth template test. It was removed on 2026-10-07: RD-1, now one pass (`0cf3f1c`), creates the execution role with no S3 and already asserts that the template names `scripts/` nowhere.

Every diff below was applied to the working tree or built in the scratchpad, and its tests were run, before being written up (requirements "Stage 4 verification").

---

### Step 1: the runner fetches packages from `packages/`

**Summary**: The prefix becomes a constant, `PACKAGES_PREFIX = "packages"`, exported from `package-fetch.js` beside `packageKey`, which owns the half of the key under it (requirements Q4). `buildRunner`'s `makePackageBackend` uses it in both modes (R1 to R3). `publish-package.sh` uploads to the same prefix (R4). Two runner tests pin the full key in S3 mode and the directory in DIR mode, and the redaction test's sample URL drops the old prefix (R5). The local fetch cache, `<workRoot>/packages/<name>/<version>.zip`, is already named `packages` and does not change.

**Files affected**:
- `runner/server/package-fetch.js`: the constant
- `runner/server/index.js`: both backends and their comment
- `runner/scripts/publish-package.sh`: the two uploads, the header comment, the output line
- `runner/test/runner.test.js`: two tests
- `runner/test/redact.test.js`: the sample URL

**Estimated diff size**: ~45 lines

```diff
--- a/runner/server/package-fetch.js
+++ b/runner/server/package-fetch.js
@@ -26,6 +26,10 @@ export function checksumsMatch(a, b) {
   return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
 }
 
+// The bucket prefix packages are published under, beside `researchers/`
+// (final-design.md section 12). The broker's session policy grants read on it.
+export const PACKAGES_PREFIX = "packages";
+
 export function packageKey(name, version) {
   return `${name}/${version}.zip`;
 }
--- a/runner/server/index.js
+++ b/runner/server/index.js
@@ -9,6 +9,7 @@ import { promisify } from "node:util";
 import { createEgressProxy } from "./egress-proxy.js";
 import { HOST_ADDR, PROXY_PORT, setupNamespace } from "./netns.js";
 import { makeSteps } from "./steps.js";
+import { PACKAGES_PREFIX } from "./package-fetch.js";
 import { revokeOwnToken } from "./report-server.js";
 
 const execFileAsync = promisify(execFile);
@@ -114,12 +115,12 @@ export function buildRunner(env) {
           ? new DirBackend(`${env.syncDir}/${prefix}`)
           : new S3Backend({ bucket, prefix })
       }),
-    // Packages are fetched from the same bucket the data syncs to, under scripts/, so
-    // one execution role permission covers both.
+    // Packages are fetched from the same bucket the data syncs to, under packages/,
+    // which is where report-server publishes them.
     makePackageBackend: ({ bucket }) =>
       dir
-        ? new DirBackend(`${env.syncDir}/scripts`)
-        : new S3Backend({ bucket, prefix: "scripts" }),
+        ? new DirBackend(`${env.syncDir}/${PACKAGES_PREFIX}`)
+        : new S3Backend({ bucket, prefix: PACKAGES_PREFIX }),
     unzip: unzipArchive,
     // Skipped in DIR mode, which runs on a laptop with no namespaces and no need for
     // one: there is no execution role there to protect.
--- a/runner/scripts/publish-package.sh
+++ b/runner/scripts/publish-package.sh
@@ -3,7 +3,7 @@
 #
 #   publish-package.sh <study-dir> <version> <bucket>
 #
-# Writes <version>.zip and <version>.sha256 under scripts/<name>/, where <name> comes
+# Writes <version>.zip and <version>.sha256 under packages/<name>/, where <name> comes
 # from the study's own manifest.json rather than the directory, so the key a runner
 # fetches and the name the manifest declares cannot drift apart: the runner refuses a
 # package whose manifest names something else.
@@ -67,9 +67,9 @@ fi
 checksum="sha256:$(sha256sum "$archive" | cut -d' ' -f1)"
 echo "$checksum" > "$work/$version.sha256"
 
-aws s3 cp "$archive" "s3://$bucket/scripts/$name/$version.zip"
-aws s3 cp "$work/$version.sha256" "s3://$bucket/scripts/$name/$version.sha256"
+aws s3 cp "$archive" "s3://$bucket/packages/$name/$version.zip"
+aws s3 cp "$work/$version.sha256" "s3://$bucket/packages/$name/$version.sha256"
 
 echo "published $name $version"
-echo "  s3://$bucket/scripts/$name/$version.zip"
+echo "  s3://$bucket/packages/$name/$version.zip"
 echo "  $checksum"
--- a/runner/test/redact.test.js
+++ b/runner/test/redact.test.js
@@ -5,7 +5,7 @@ import { redact } from "../server/log.js";
 // Whatever a step throws ends up in the result document, which every researcher of the
 // class reads. These are the shapes that actually turn up in this runner's errors.
 test("strips the signature from a presigned S3 URL", () => {
-  const msg = "fetch failed: https://bucket.s3.amazonaws.com/scripts/demo/1.0.0.zip" +
+  const msg = "fetch failed: https://bucket.s3.amazonaws.com/packages/demo/1.0.0.zip" +
     "?X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20260918&X-Amz-Signature=abc123def456&X-Amz-Expires=900";
   const out = redact(msg);
   assert.ok(!out.includes("abc123def456"), "signature must not survive");
--- a/runner/test/runner.test.js
+++ b/runner/test/runner.test.js
@@ -1,5 +1,5 @@
 import assert from "node:assert/strict";
-import { mkdirSync, writeFileSync } from "node:fs";
+import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
 import { mkdtemp, rm } from "node:fs/promises";
 import { tmpdir } from "node:os";
 import path from "node:path";
@@ -8,6 +8,7 @@ import { loadEnv } from "../server/config.js";
 import { makeSteps } from "../server/steps.js";
 import { HookError, Runner } from "../server/runner.js";
 import { buildRunner } from "../server/index.js";
+import { packageKey } from "../server/package-fetch.js";
 import { MemoryStore, resultPath, researcherPath } from "../server/status.js";
 import { DirBackend, Syncer } from "../server/sync/index.js";
 
@@ -821,3 +822,28 @@ test("/run-package is refused until /run has finished", async () => {
   release();
   await running;
 });
+
+// report-server publishes under packages/, and a VM's storage credentials grant read
+// there and nowhere else, so a fetch from any other prefix is refused in the VM.
+test("packages are fetched from the packages/ prefix of the bucket", async () => {
+  const runner = buildRunner(loadEnv({ SYNC_BACKEND: "S3" }));
+  const backend = runner.makePackageBackend({ bucket: "researcher-dashboard-runner-staging" });
+  const sent = [];
+  backend.client = { send: async (cmd) => { sent.push(cmd.input); throw new Error("stop"); } };
+
+  await assert.rejects(() => backend.get(packageKey("class-counts", "1.0.6"), path.join(work, "a.zip")), /stop/);
+  assert.deepEqual(sent, [{ Bucket: "researcher-dashboard-runner-staging", Key: "packages/class-counts/1.0.6.zip" }]);
+});
+
+// DIR mode mirrors the bucket's layout under SYNC_DIR, so a laptop run needs its
+// packages at <SYNC_DIR>/packages/<name>/<version>.zip.
+test("DIR mode fetches packages from <SYNC_DIR>/packages", async () => {
+  const syncDir = path.join(work, "remote");
+  mkdirSync(path.join(syncDir, "packages", "class-counts"), { recursive: true });
+  writeFileSync(path.join(syncDir, "packages", "class-counts", "1.0.6.zip"), "archive-bytes");
+  const runner = buildRunner(loadEnv({ SYNC_BACKEND: "DIR", SYNC_DIR: syncDir }));
+
+  const dest = path.join(work, "fetched.zip");
+  await runner.makePackageBackend({ bucket: "local" }).get(packageKey("class-counts", "1.0.6"), dest);
+  assert.equal(readFileSync(dest, "utf8"), "archive-bytes");
+});
```

**Verified**: `npm test` in `runner/` passes 139 tests (137 before). Against `server/index.js` as it is on the branch, the two new tests fail and the rest pass. `publish-package.sh`, run with a stand-in `aws` on `PATH`, uploads to `s3://<bucket>/packages/<name>/<version>.zip` and `.sha256`. After the step, `grep -rn 'scripts/' runner --exclude-dir=node_modules` finds nothing (run with steps 1 and 3 applied).

---

### Step 2: how a runner release reaches a stack

**Summary**: Requirements R12 and R13, taken into pass 1 by Doug on 2026-09-25 (requirements Q6). This is the first runner change after RD-1 moves the template here, so it writes the procedure down: publish the artifact, then update the stack with `CodeArtifactKey` set explicitly. RD-1's "Updating a stack" carries every parameter with `UsePreviousValue`, `CodeArtifactKey` included, so that command cannot release a runner. The section also states the rule for a runner change that needs a new grant: the grant goes in the same change set. The Makefile's comment stops pointing at cloud-formation's `create-stack` config.

**Files affected**:
- `runner/Makefile`: one comment line
- `cloudformation/README.md`: one section, after "Updating a stack"

**Estimated diff size**: ~30 lines

```diff
--- a/runner/Makefile
+++ b/runner/Makefile
@@ -66,7 +66,7 @@ artifact:
 	mkdir -p $(dir $(ARTIFACT))
 	zip -r $(ARTIFACT) Dockerfile package.json package-lock.json server
 
-# The CodeArtifactKey in cloud-formation's create-stack config must match this.
+# The runner stack's CodeArtifactKey parameter is this key (cloudformation/README.md).
 artifact-uri:
 	@echo $(ARTIFACT_URI)
 
```

`cloudformation/README.md`, after "Updating a stack":

````markdown
## Releasing the runner

A runner change reaches a stack only through a new image: publish the artifact, then update the stack
with `CodeArtifactKey` pointing at it and every other parameter unchanged. A new package version needs no
release; a change to the runner's own code does.

```sh
cd ../runner && make publish-artifact VERSION=<x.y.z> ARTIFACT_BUCKET=<bucket the build role can read>
KEY=$(make -s artifact-uri VERSION=<x.y.z> ARTIFACT_BUCKET=<same> | sed 's#^s3://[^/]*/##')
cd ../cloudformation
PARAMS=$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].Parameters[].ParameterKey' --output text \
  | tr '\t' '\n' | grep -vx CodeArtifactKey | sed 's/.*/ParameterKey=&,UsePreviousValue=true/' | tr '\n' ' ')
aws cloudformation create-change-set --stack-name "$STACK" --change-set-name "git-$SHA" \
  --template-body file://researcher-dashboard-runner.yml --capabilities CAPABILITY_NAMED_IAM \
  --parameters $PARAMS ParameterKey=CodeArtifactKey,ParameterValue="$KEY"
```

Review and execute it as in "Updating a stack". **When the change needs a grant the stack lacks, the grant
goes in the same change set, applied from the same commit**: a stack with the new runner and the old
grant, or the reverse, fails at the first call. VMs already running keep the old image until they are
terminated, so terminate them before a change like that, or they will make the old call against the new
grant.
````

**Verified**: the parameter pipeline was run over the ten parameter names of RD-1's template (`0cf3f1c`: the spike's nine without `StatusBackend`, plus `FunctionServiceAccountUniqueId`). It produced nine `UsePreviousValue` entries and left out `CodeArtifactKey`. `make -n publish-artifact VERSION=0.23.0 ARTIFACT_BUCKET=qa-bucket` and `make -s artifact-uri` print `s3://qa-bucket/researcher-dashboard-runner/runner-0.23.0.zip`, from which the `sed` leaves the key. The `aws` calls themselves were not run: this machine has no AWS CLI or credentials.

---

## Rollout

None of its own (requirements R10). On RD-1's stack the execution role reads no S3, so this runner fetches nothing in a VM; the first runner release that does work on staging is RD-4 pass 2's, made with step 2's procedure. If this pass has merged by the time RD-1's rollout creates the QA stack, that create can use an artifact built from that `main`. A fixture that is wanted again is re-published with `runner/scripts/publish-package.sh`, which now writes `packages/<name>/`; nothing is migrated, because the QA bucket starts empty (requirements Q3).

## Open Questions

### RESOLVED: Judgment call: the runner tests go in `runner.test.js`, not `package-fetch.test.js`
**Options considered**: extend `package-fetch.test.js`, which tests `packageKey`; add to `runner.test.js`, which already imports `buildRunner` and `loadEnv`.
**Decision**: `runner.test.js`. The prefix is chosen in `buildRunner`, not in `package-fetch.js`, so the test has to go through `buildRunner` to catch a wrong prefix, and `runner.test.js` already builds it with `loadEnv` (its DIR-mode revocation test). `package-fetch.test.js` keeps its existing `packageKey` test, which pins the half of the key under the prefix.

### RESOLVED: Judgment call: the S3 test replaces the client rather than mocking the SDK
**Options considered**: mock `@aws-sdk/client-s3`; give `buildRunner` an injectable S3 client; replace `backend.client` after construction.
**Decision**: Replace `backend.client`. `S3Backend` already takes an injected `client` and keeps it as a public field, and the test only needs the command's input. Constructing the real `S3Client` needs no credentials or region (verified on this machine, which has neither), and making `buildRunner` injectable would change production code only for a test.

## Self-Review

*Written against the three-step plan of 2026-09-25: its step 2 was the removed template step, and its step 3 is today's step 2.*

Stage 7, run unattended. Roles: the reviewer of the resulting commits, whoever runs the tests, the operator applying the stack, and the engineer speccing RD-1 pass 2 and RD-4 pass 2. Claims about proposed code were checked by building it: step 1 was applied to the working tree and its suite run, step 2 was built on RD-1 pass 1's assembled template, and step 3's shell pipeline and make targets were run. Findings that did not survive were dropped.

### Reviewer of the commits

#### RESOLVED: Step 2 cannot be committed until RD-1 pass 1's implementation exists
Confirmed: the template file does not exist on this branch (`git ls-files cloudformation` is empty). The first draft ordered the steps without saying so. Fixed in the plan's preamble and R9: step 1 can be committed first, and step 2 waits for the rebase.

#### RESOLVED: Step 3's Makefile diff did not apply
The hunk was typed by hand, with the wrong line number and line count, and `git apply --check` rejected it as corrupt. Fixed: replaced with the diff git produced from the edited file, and every embedded diff was extracted from this spec and checked again. Steps 1 and 3 pass `git apply --check` against the branch, and step 2, applied with `patch` to RD-1 pass 1's assembled template, gives exactly the file that was linted and tested.

### Whoever runs the tests

#### RESOLVED: The grep check claimed a match that does not exist
Requirements R5 and step 1 said `grep -rn 'scripts/' runner` would still find the `runner/scripts/` directory name. With the step applied it finds nothing, since no file inside `runner/` names its own directory; only the repository README's layout does. Fixed in both specs.

### The operator applying the stack

#### RESOLVED: RD-1 pass 1's update procedure cannot release a runner
Its "Updating a stack" builds `UsePreviousValue=true` for every parameter key the stack reports, `CodeArtifactKey` included, so running it after publishing a new artifact changes nothing. Confirmed by reading the command in RD-1 pass 1's implementation spec. This pass's release is the first to need the other form. Carried into Q6 rather than fixed silently, because it adds to RD-1's README; Doug took it into pass 1 as step 3.

#### RESOLVED: A VM on the old image survives the update
RD-1 pass 1's README says "VMs already running keep their version". Under requirements Q2's option B, such a VM asks for `scripts/` against a role that grants only `packages/`. Fixed: the rollout terminates live staging VMs first, and step 3's section says so for any change of this kind.

### The engineer speccing RD-1 pass 2 and RD-4 pass 2

No finding survived. Checked: after this pass, `packages/` is the only package prefix the runner, the template and `publish-package.sh` name, so RD-1 pass 2's session policy has one prefix to grant. RD-4 pass 2 changes `packageKey` and the local paths to the identity in the same module that now holds the prefix. `speccing.md` records both for those specs.

## Stage 8: cross-reference with the requirements

Rechecked on 2026-10-07 after the template step was removed. Nothing was added to the plan or trimmed from the requirements to make them agree.

| Requirement | Where |
|---|---|
| R1, R2, R3 | Step 1 (`PACKAGES_PREFIX`, both backends) |
| R4 | Step 1 (`publish-package.sh`) |
| R5 | Step 1 (two runner tests, the redaction fixture, the grep check) |
| R9 | The plan's preamble: step 2 waits for RD-1's implementation and a rebase. No code |
| R10 | The Rollout section: none of its own |
| R11 | Step 2 writes it into `cloudformation/README.md` |
| R12 | Step 2 (the Makefile comment) |
| R13 | Step 2 ("Releasing the runner") |

| Step | Requirement |
|---|---|
| Step 1 | R1 to R5 |
| Step 2 | R11, R12, R13 |

On 2026-09-25 Doug took R12 and R13 into pass 1 (requirements Q6, A). On 2026-10-07 the template step and its R6 to R8 went with RD-1's fold, and Doug kept the pass as its own pull request.
