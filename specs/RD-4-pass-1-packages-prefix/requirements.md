# RD-4 pass 1: the runner's `scripts/` to `packages/` prefix rename

**Jira**: https://concord-consortium.atlassian.net/browse/RD-4 (researcher-dashboard: the runner), **pass 1 of 2**
**Repo**: https://github.com/concord-consortium/researcher-dashboard
**Branch**: `RD-4-pass-1-packages-prefix`, parent `main` (it stacked on `RD-1-runner-stack`, rebased onto its spec commit `0cf3f1c` on 2026-10-07 and its reviewed head `408792e` on 2026-10-08, then onto `main` at `e363311` once RD-1 merged, 2026-10-09), child `RD-4-pass-2-pull-loop`
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Move the bucket prefix the runner fetches package archives from, `scripts/`, to `packages/`, which is where report-server publishes them and what the broker's session policy grants. The change covers the runner's package backend in both of its modes, the fixture publishing script and the tests, with the Makefile comment and a "Releasing the runner" section in the stack's README. It changes nothing in the stack template. The key under the prefix stays `<name>/<version>.zip` in this pass. Moving it to report-server's `<origin>/<name>` identity is pass 2's work (Q1).

## Project Owner Overview

The runner downloads each package's code from the same S3 bucket it saves researchers' data to. During the spike those downloads lived in a folder called `scripts/`. The final design calls it `packages/`, and report-server's publish endpoint (REPORT-142, already built) writes there. Each VM's researcher-scoped credentials grant `packages/` and nothing else, so the runner has to look there.

This is a small, mechanical pass, and it does nothing on a real stack by itself: RD-1 creates the VMs' shared role with no storage access, so no runner fetches anything on staging until pass 2 moves it onto the researcher-scoped credentials. Researchers see no change, and nothing in it changes which packages run or how they are checked. The rest of RD-4, which is most of the story, is pass 2.

## Background

**Why this pass exists, and what changed (2026-10-07).** It was split out to ship before RD-1 pass 2's session policy. RD-1 is now one pass (`0cf3f1c`), which creates the broker with `packages/` read and the execution role with no S3 at all, so that ordering is gone, and with it this pass's template step (the execution role's `packages/*` read and its tenth test) and its rollout rule. Doug kept the pass as its own small runner-only pull request rather than folding it into pass 2 (2026-10-07). The original reasoning follows. RD-4's release line says the rename "is ordering-critical: it ships before the broker's session policy, which grants `packages/`". `fy26-sprint-26.md`'s "Implementation order" makes it its own line, "RD-4 (1 of 2) | the `scripts/` to `packages/` prefix rename", between RD-1 pass 1 and RD-1 pass 2. RD-1's story explains the order: "the session policy granting `packages/` … has to follow the runner's `scripts/` to `packages/` prefix rename, or the policy grants a prefix that does not exist yet" ("The IAM work ships in three passes"). `final-design.md` §3 lists the rename (`scripts/<name>/<version>.zip` to `packages/<identity>/<version>.zip`, noting that "the runner's fetch and the execution role both name the old one today"), and §17 item 13 and "Release ordering" repeat it. `review-resolutions.md` D4 is where it was first recorded.

**Where `scripts/` appears on this branch** (a grep of the working tree outside `specs/` and `node_modules`, 2026-09-25):

| File | What it does with the prefix |
|---|---|
| `runner/server/index.js` `buildRunner`, `makePackageBackend` | S3 mode: `new S3Backend({ bucket, prefix: "scripts" })`. DIR mode: `new DirBackend(\`${env.syncDir}/scripts\`)`. The comment above it names `scripts/` |
| `runner/scripts/publish-package.sh` | Uploads `<version>.zip` and `<version>.sha256` to `s3://<bucket>/scripts/<name>/`, and names the prefix in its header comment and its output |
| `runner/test/redact.test.js` | A sample presigned URL `…/scripts/demo/1.0.0.zip`, an arbitrary string for the redaction test |

`runner/server/package-fetch.js` builds the key under the prefix, `packageKey(name, version)` = `${name}/${version}.zip`, and names no prefix of its own. Its local fetch cache is already `<workRoot>/packages/<name>/<version>.zip`, so the local layout needs no rename. `runner/scripts/` is also a **directory name** (the README's layout, `publish-package.sh`'s own path, and `package.json`'s `"scripts"` key) and is not the prefix. It stays. Nothing in `app/` names the prefix. The only other `scripts/` hits are `deploy-app.yml`'s reference to starter-projects' `scripts/create-deploy-role.sh`, which is unrelated.

**No test covers the package prefix today.** `runner.test.js` stubs `makePackageBackend` (`() => ({ async get() {} })`), and the one test that calls `buildRunner` uses only `revokeReportServerToken`. So changing the string would not fail any test, and this pass adds the tests that pin it (R5).

**The template names no package prefix for the runner.** RD-1's `cloudformation/researcher-dashboard-runner.yml` (`specs/RD-1-runner-stack.md`, closed 2026-10-08; spec'd at `0cf3f1c`) gives the execution role its logs and nothing else, and its tests assert that `scripts/` appears nowhere in it. The broker's ceiling and session policy grant `packages/*` read. So this pass changes no template line; it adds a README section to the file RD-1 creates.

**What report-server writes.** On report-service's `REPORT-142-catalog-and-url-profile`, `server/lib/report_server/packages/identity.ex:46` builds `"packages/#{identity}/#{version}.#{ext}"`, so the archive and its checksum land at `packages/<origin>/<name>/<version>.zip` and `.sha256`, for example `packages/users/136/dataflow-pilot/1.2.0.zip` (`final-design.md` §5.3, §12). The runner on `main` reads `scripts/<name>/<version>.zip`. A prefix rename alone gives `packages/<name>/<version>.zip`, which report-server never writes. Q1 decides what this pass does about that.

**What calls the runner's package fetch today.** The runner fetches a package only inside `POST /run-package` (`runner.js` `startPackage`), whose body carries `package: {name, version, checksum}` and refuses a name containing `/` (`runner.js:193` to `199`). Two functions exist:

- The **spike function**, still deployed on `report-service-dev` (`spike-plan.md` 18a, "What is deployed right now"), posts exactly that `{name, version, checksum}` body (report-service `origin/RIGSE-365-researcher-dashboard-rules`, `functions/src/researcher-dashboard/run-package.ts:43`).
- The **implemented function** (REPORT-141 and 142, on `REPORT-142-catalog-and-url-profile`) never calls into the VM. It queues `{class_hash, identity, version, checksum, catalog_id}` in `work/{platform_user_id}` and launches or resumes a VM ("the VM asks for work at the end of /run", `ensure-vm.ts:5`). The VM's `POST /work`, which hands it that queue, is REPORT-143's, and the runner's pull loop is RD-4 pass 2's.

So until REPORT-143 and RD-4 pass 2, the only packages any runner can run are ones named by a single-segment name. On staging those are the fixtures `publish-package.sh` uploads.

## Clauses covered

How every clause of the RD-4 Jira story maps to its two passes, so that a reviewer comparing this pass with Jira does not read a missing clause as a gap (`fy26-sprint-26.md`, "A story split across pull requests"). The implementation order assigns only the prefix rename to pass 1, and everything else to pass 2 (`RD-4-pass-2-pull-loop`, whose spec follows REPORT-143's). Two additions outside RD-4's clauses were proposed in Q6 and taken into pass 1 by Doug on 2026-09-25 (R12 and R13).

| RD-4 clause (Jira) | Pass | Basis |
|---|---|---|
| Release: "The `scripts/` to `packages/` prefix rename … ships before the broker's session policy, which grants `packages/`" | **1** for the runner; the ordering itself is met by RD-1's one pass | The runner's S3 and DIR package backends, `publish-package.sh` and the tests (R1 to R5). RD-1 creates the broker with `packages/` read from the start (`0cf3f1c`), so there is no order left to keep |
| The pull loop and the session contract: `POST /work` at the end of `/run` and after every resume, adopting the fresh session token, per-class and per-request sign-in, the `platform_user_id` check on every adopted token, `current_package` and `queue`, `POST /idle` | **2** | Implementation order. Depends on REPORT-143's VM endpoints (RD-4 "Depends on") |
| Storage credentials from the broker, checked against the wall clock before use, no syncer tick before the first fetch after a resume | **2** | Needs REPORT-143's `/storage-credentials`. Pass 1 keeps the runner on the default credential chain, as on `main` |
| `/resume` writes nothing; bounded hook writes that never return non-200; `/suspend` keeps `current_package` and `queue`; `/terminate` revokes, flushes and writes `failed` | **2** | Implementation order |
| `POST /refresh-token` deleted, its researcher check moved to `/run` and every adopted token | **2** | Implementation order |
| The window check twice, the runner's own duration ceiling, the in-VM timeout kept and demoted | **2** | Implementation order |
| Running a package: every per-package path keyed by the full `<origin>/<name>` identity (home, output directory, fetch cache) | **2** | Q1: the identity reaches the runner only in `/work`'s queue |
| The result document id is the identity with `/` as `__`, derived by the runner | **2** | Same |
| "The archive is fetched from `packages/<identity>/<version>.zip`" | **1** for the `packages/` prefix; **2** for `<identity>` in place of `<name>` | Q1. Pass 1 reads `packages/<name>/<version>.zip` |
| Checksummed, and the manifest read back from the verified archive | Already on `main` (`package-fetch.js` `fetchPackage`), unchanged by either pass | Pass 2 changes what the manifest is checked against (the identity) |
| A package whose `urls` do not match the scope is refused; the shared glob matcher and its three-copy fixture | **2** | Implementation order |
| `scope.json` and `RD_SCOPE_FILE`; `RD_CLASS_HASH` and `RD_PORTAL_CLASS_ID` deleted; `dataset` as `pkg-<catalog id>` | **2** | Needs `/work`'s scope block and catalog id |
| `display.md` and `summary.txt`, the 64 KiB cap, refusing an oversized display; the result fields written in one call | **2** | Implementation order |
| One result document per researcher per package per scope; `requested_by` removed; the counts on the researcher's scope document | **2** | Implementation order |
| The renames of section 3 (`#analysis`, `currentAnalysis`, `analyze.*`, the `analysis` user, `ANALYSIS_UID`, `NETNS`, `ANALYSIS_TIMEOUT_MS`, the terminate string, `current_package`, `scopes`, `runners/`) | **2** | Implementation order. Pass 1 renames none of them, including where they sit next to lines it edits |
| Logs carrying researcher, scope and package; whether the runner publishes section 16's metrics | **2** | Implementation order. `speccing.md` "Runner and function metrics, and the execution role" leaves the metrics decision to pass 2 |
| The smoke script and the monthly rebuild | **2** | Implementation order |
| Must not hold `SuspendMicrovm` or any AWS permission beyond its own logs | **RD-1** for the template (`0cf3f1c`, the execution role at logs only); the runner on `main` already never calls `SuspendMicrovm` | RD-1's spec, R13 |
| Must not memoize Firebase stores, refresh on a timer, let the queue reach a browser, accept a package key or checksum from the caller, truncate a display, or leave "analysis" outside plain English | **2** | Implementation order |
| Depends on: report-service's VM-facing endpoints, and the suspend-hook verification | **2** | Pass 1 depends on neither |
| Done when (all nine sentences) | **2** | None of them is about the prefix. Pass 1's own check is R5 |

## Requirements

### The runner

- **R1.** In S3 mode the runner fetches a package archive from `packages/<name>/<version>.zip` in the bucket `runHookPayload` names, instead of `scripts/<name>/<version>.zip`. The key under the prefix, the bucket, and the credential (the default chain) are unchanged. On RD-1's stack that chain is the execution role, which reads nothing, so in a VM this fetch succeeds only once pass 2 moves it onto broker credentials.
- **R2.** In DIR mode the runner fetches it from `<SYNC_DIR>/packages/<name>/<version>.zip`, mirroring the bucket's layout as it already does for `researchers/`.
- **R3.** The prefix is spelled once in the runner's code, beside `packageKey`, and both modes use it, so the S3 and DIR layouts cannot drift apart.
- **R4.** `runner/scripts/publish-package.sh` uploads `<version>.zip` and `<version>.sha256` to `s3://<bucket>/packages/<name>/`, and its header comment and output name the new prefix. Its arguments, the archive it builds and its checksum are unchanged.
- **R5.** Tests:
  - a runner test that the package backend `buildRunner` builds in S3 mode requests `packages/<name>/<version>.zip` from the payload's bucket;
  - a runner test that the DIR-mode backend reads `<SYNC_DIR>/packages/<name>/<version>.zip`;
  - the sample URL in `redact.test.js` uses `packages/`, so no test or fixture in `runner/` names the old prefix.

  After the change, `grep -rn 'scripts/' runner --exclude-dir=node_modules` finds nothing. (The repository README's `runner/scripts/` layout entry is the directory, not the prefix, and stays.)

What pass 1 leaves unchanged in the runner: the `/run-package` body and its single-segment name check; the result document's id; the local fetch cache at `<workRoot>/packages/<name>/<version>.zip`; the package's home and output directories; checksum verification before unpacking; and the manifest check against the requested name and version.

### Stacking and landing

R6 to R8, the template step, were removed on 2026-10-07 (Background).

- **R9.** This branch stacks on `RD-1-runner-stack`, because step 2's README section goes into the `cloudformation/README.md` RD-1 creates. The runner step (R1 to R5) depends on nothing from RD-1 and can be written and committed first. The README step waits until RD-1's implementation commits exist and this branch is rebased onto them. *(Met 2026-10-09: RD-1 merged as `e363311`, and this branch is on `main`.)*

### Rollout

- **R10.** None of its own. On RD-1's stack the execution role reads no S3, so a VM from this runner can fetch nothing, and the first runner release that does work on staging is RD-4 pass 2's. If this pass merges before RD-1's rollout creates the QA stack, that create may as well use an artifact built from a `main` holding it; nothing depends on which.
- **R11.** A runner change reaches a stack as a runner release: `make publish-artifact VERSION=<x.y.z> ARTIFACT_BUCKET=<bucket in the stack's account>` in `runner/` (`concordqa-devops` for staging, RD-1's README), then that key as `CodeArtifactKey` in a change set. A new package version needs no image rebuild. A new prefix does, because the prefix is in the runner's code.
- **R12.** `runner/Makefile`'s comment on `artifact-uri` names the runner stack's `CodeArtifactKey` parameter and `cloudformation/README.md`, not cloud-formation's `create-stack` config, which RD-1 retires (Q6, Doug, 2026-09-25).
- **R13.** `cloudformation/README.md` gains a "Releasing the runner" section: publish the artifact, then a change set that sets `CodeArtifactKey` explicitly while every other parameter keeps its previous value, and the rule that a runner change needing a new grant goes in the same change set as the grant, with live VMs terminated first (Q6, Doug, 2026-09-25).

## Technical Notes

- **Name-keyed fixtures and identity-keyed catalog objects cannot collide.** Under `packages/`, a pass 1 fixture is `<name>/<version>.zip` (one segment before the version) and a report-server object is `<origin kind>/<origin id>/<name>/<version>.zip` (three), with origin kinds `users` and `projects` (`final-design.md` §5.3). A fixture named `users` would sit at `packages/users/<version>.zip`, which is not a key report-server writes. Both can share a bucket until pass 2 moves the runner to identity keys.
- **The packages writer can now reach the fixtures.** RD-1's `PackagesWriterUser` holds `s3:PutObject` on `packages/*`, so fixtures uploaded to `packages/` are within its reach, where `scripts/` fixtures were not. The exposure is what RD-1's requirements already record for a leaked writer key ("What a leaked packages writer key can do"): the runner checks every archive against the checksum it was sent and unpacks nothing on a mismatch, so an overwrite stops a version from running but cannot change what runs.
- **No VM can use this runner's fetch on its own.** On RD-1's stack the execution role, which the runner's default chain resolves to in a VM, holds only its log grant. RD-4 pass 2 moves the fetch onto broker credentials, whose session policy grants `packages/*` read.
- **DIR-mode trees on a developer's machine** keep packages at `<SYNC_DIR>/scripts/<name>/`, as the spike's criterion 21 laid out (`spike-plan.md`). After this pass they belong at `<SYNC_DIR>/packages/<name>/`. The spike's own tree was deleted at teardown, and no other one is recorded.
- **Who publishes the runner artifact and applies the stack is not recorded** beyond "the operator" in RD-1's README.
- **The runner's version is not recorded in the repository.** `runner/package.json` and the Makefile's `VERSION ?=` default both say `0.1.0`, there are no git tags, and the last artifact published was `runner-0.22.0.zip`, serving image 23.0 on the spike's stack (`spike-plan.md` 18a table, as of 2026-09-23). How a `runner x.y.z` release (README "Release lines") is marked is not recorded.

### Stage 4 verification (2026-09-25), throwaway

Each check was applied to the working tree or built in the scratchpad, run, then removed.

- **The runner rename.** R1 to R5 were applied as throwaway code: the prefix constant, both backends, `publish-package.sh`, the redaction fixture, and the two new tests. `npm test` in `runner/` passed 139 tests (137 before). With `server/index.js` reverted to the branch's version, the two new tests failed and the other 137 passed, so the tests pin the prefix. The S3 test swaps the backend's `client` for a recorder after construction, and building the real `S3Client` needed no AWS environment on this machine.
- **`publish-package.sh`,** run against a stand-in `aws` on `PATH` over a minimal study, uploaded to `s3://researcher-dashboard-runner-staging/packages/class-counts/1.0.6.zip` and `.sha256`. `bash -n` passes.
- **The template.** (Superseded 2026-10-07: step 2 is gone.) RD-1 pass 1's planned template, with R6's edit and R7's test applied, linted clean and passed ten tests, and R7's test caught the grant moved back to `scripts/*` or granting both prefixes.

## Out of Scope

- Everything the "Clauses covered" table assigns to pass 2 or to RD-1.
- Identity-keyed S3 keys and local paths (Q1).
- `packages/` on the broker's ceiling and session policy: RD-1 and REPORT-143.
- Deciding the fate of `publish-package.sh` once report-server's `POST /api/v1/packages` and REPORT-146's `cc-data package publish` exist. In pass 2 it either takes an origin, so its fixtures land where an identity-keyed runner reads, or is deleted. That is pass 2's call.
- A rollout: there is none of its own (R10).

## Open Questions

### RESOLVED: Q1. Does pass 1 also move the runner to identity-keyed paths, or only rename the prefix?
**Context**: report-server writes `packages/<origin>/<name>/<version>.zip`. The runner on `main` reads `scripts/<name>/<version>.zip` and keys its fetch cache by name (`package-fetch.js` `fetchPackage`, `packageKey`). A prefix rename alone gives `packages/<name>/…`, which report-server never writes. RD-4's "Running a package" wants every per-package path keyed by the identity: the S3 key, the home, the output directory and the fetch cache.
**Options considered**:
- A) Prefix only in pass 1: the runner reads `packages/<name>/<version>.zip`. Pass 2 moves the key and every local path to the identity, together.
- B) Identity keys in pass 1: `/run-package` gains an `identity` field, the name check becomes an identity check, and the key and cache paths use it.
- C) Pass 1 keys the S3 object by identity but leaves the local paths by name.

**Decision**: A (stage 2, recommendation from the code). The identity has no way into the runner in pass 1. `/run-package` carries `{name, version, checksum}`, and its only caller, the spike function, sends a name (`run-package.ts:43` on report-service's spike branch). The implemented function never calls into the VM; it queues identities for `/work`, which is REPORT-143's. B would change a push contract nothing will send an identity through and that pass 2 replaces with the pull loop, so it would be written only to be deleted. C splits one clause of RD-4 across two passes and still needs B's contract change. A leaves a window, between this pass and pass 2, in which the runner reads a layout report-server does not write. But no catalog package can reach a runner in that window anyway, because nothing delivers one until `/work` exists. The runnable packages in the window are the fixtures `publish-package.sh` uploads, as they are today. Recorded for pass 2 in `speccing.md`.

### RESOLVED: Q2. What order do this pass's rollout and RD-1 pass 1's need? (superseded 2026-10-07)
**Context**: RD-1 pass 1's rollout (its `cloudformation/README.md`, "Moving staging to the QA account") creates `researcher-dashboard-runner-staging` in the QA account from a commit on `main`, with a runner artifact published for the QA build role. It is planned for Tuesday 2026-09-29 or later. This pass changes both the runner and the template's execution role, and the implementation order merges it after RD-1 pass 1.
**Options considered**:
- A) This pass merges before RD-1 pass 1's rollout creates the QA stack. The stack is created once, from a `main` that has both, with a runner artifact built from that `main`. `scripts/` never exists in QA.
- B) RD-1 pass 1's rollout goes first, with a pre-rename runner and the `scripts/*` grant. This pass then reaches staging as one update, setting `CodeArtifactKey` to the new artifact and applying the new template in the same change set.
- C) Grant both prefixes for a while, so the two halves can land in either order.

**Superseded (2026-10-07):** RD-1 is one pass whose execution role reads no S3, so there is no grant for this runner to arrive with (R10). The original decision: Either A or B satisfied the old R10; C was not needed. There is no merge-order constraint between the two, only the rule that the artifact and the grant arrive in the same create or change set. **Prefer A** when this pass has merged by the rollout date: one create, no second image build, and no `scripts/` in any new account. **Under B**, the update rebuilds the image, and CloudFormation may apply the role before the new image is active. A VM still on the old image would then fail to fetch, since it asks for `scripts/` and the role grants only `packages/`. Nothing calls a staging VM's `/run-package` unless report-service-dev is redeployed with the spike function, and RD-1 pass 1's rollout does not record which function code step 4 deploys. So B's window is expected to be empty. Terminating any live staging VMs before the update closes it either way. C would put a grant in the template whose only purpose is a staging window that A avoids and B barely has. Production has no stack until the RD-1 production line, after RD-3, so it is created with both halves and neither order applies.

### RESOLVED: Q3. Is there anything to migrate from `scripts/` to `packages/`?
**Context**: The spike's bucket holds fixtures under `scripts/` (`class-counts` 1.0.6, `ap-counts` 1.0.0, 1.0.1-toolong and 1.0.2, `isolation-probe` 1.3.0; `spike-plan.md` 18a and 18c).
**Decision**: Nothing (stage 2, from RD-1 pass 1's spec). RD-1 pass 1's rollout step 1 empties and deletes the spike's bucket, "everything in it is test data (derived pulls, and the `scripts/` package fixtures)", and the QA stack's bucket starts empty (RD-1 pass 1 requirements Q6; its README step 5: "until packages are published or `runner/scripts/publish-package.sh` re-uploads a fixture, the new bucket holds no package to run"). No production stack exists. A fixture that is wanted again is re-published with `publish-package.sh`, which after this pass writes `packages/<name>/`. Under Q2's option B, any fixture uploaded to the QA bucket before this pass lands would be under `scripts/`, and would need re-publishing after the update. There is no copy step, because a re-publish produces the same archive and checksum: the script's archive is reproducible, per its own comment.

### RESOLVED: Q4. Judgment call: where the prefix is spelled
**Options considered**: a string in each backend in `index.js`; a constant in `index.js`; an exported constant in `package-fetch.js` beside `packageKey`.
**Decision**: `package-fetch.js`, as `PACKAGES_PREFIX`. That module already owns the half of the key under the prefix (`packageKey`), so the two halves of `packages/<name>/<version>.zip` are defined together, and pass 2 changes both there when it moves to the identity.

### RESOLVED: Q5. Judgment call: whether the template's grant is also pinned by a test (superseded 2026-10-07)
**Options considered**: leave the execution role unpinned, as RD-1 pass 1 does; pin only the package read.
**Superseded (2026-10-07):** there is no package grant on the execution role; RD-1's own test pins the role at logs only and asserts no `scripts/`. The original decision: Pin the package read (R7). R10's rule is only as good as the template's grant being the one the runner needs, and RD-1 pass 1's tests would pass with either prefix. The test is scoped to the one grant pass 1 changes, so it does not freeze what RD-1 pass 3 removes. Pass 3 deletes it with the role's S3 grants.

### RESOLVED: Q6. Scope additions proposed for pass 1

**Context**: The implementation order assigns only the prefix rename to pass 1. Two small things surfaced while speccing how this pass reaches a stack. Neither is an RD-4 clause, and neither is absorbed without a decision.

| Proposal | Recommendation | Why |
|---|---|---|
| **a.** Fix `runner/Makefile`'s comment "The CodeArtifactKey in cloud-formation's create-stack config must match this", which RD-1 pass 1 makes stale by moving the template into `cloudformation/` | **Pass 1** | One line, in the file this pass's release uses first. RD-1 pass 1's spec is committed (`bb1caa2`), so fixing it there means amending that spec and rebasing this branch |
| **b.** A short "Releasing the runner" section in `cloudformation/README.md`: publish the artifact, then an update that sets `CodeArtifactKey` explicitly while every other parameter keeps `UsePreviousValue`, with R10's rule that a change to what the runner fetches goes in the same change set as the grant | **Pass 1** | RD-1 pass 1's README covers creating a stack and updating one with every parameter unchanged (its update command sets `UsePreviousValue` for every key, including `CodeArtifactKey`), so it has no procedure for a runner release, and this pass makes the first one. Otherwise the procedure lives only in `spike-plan.md` 18a |

- A) Both in pass 1.
- B) Neither: leave the Makefile comment and the runner-release procedure to RD-1 pass 2 or the RD-1 production line.
- C) Name the rows to take.

**Recommendation**: A. Both are documentation of the mechanism this pass is the first to use, and together they are under 30 lines.

**Decision**: A (Doug, 2026-09-25, stage 8). Both are in pass 1, as R12 and R13, implemented by step 3.

## Self-Review

Stage 3, run unattended. Roles: Senior Engineer (consistency with `main` and with report-service's branches), DevOps Engineer (how the change reaches a stack), Security Engineer, QA Engineer, and the engineer speccing the stories that consume this pass (RD-1 pass 2, RD-4 pass 2). Each finding was checked against the code or the records before it was written; findings that did not survive were dropped.

### Senior Engineer

#### RESOLVED: A prefix rename alone gives a key report-server never writes
Confirmed: report-server's `identity.ex:46` writes `packages/#{identity}/#{version}.#{ext}`, and the runner's `packageKey` is `${name}/${version}.zip`. The first draft of R1 read as if the runner would then fetch published packages. Fixed: R1 states the name-keyed key, the Background says what calls the fetch, and Q1 records why identity keys wait for pass 2.

### QA Engineer

#### RESOLVED: Nothing would fail if the prefix string were wrong
Confirmed: `runner.test.js` stubs `makePackageBackend`, and no test constructs the real package backend. Fixed with R5's two backend tests, which were run and shown to fail against the old prefix.

### DevOps Engineer

#### RESOLVED: The runner change and the grant must reach a stack together
A template with `packages/*` and a runner reading `scripts/`, or the reverse, cannot fetch anything. The draft said only that the template edit "lands with" the runner. Fixed as R10, with the order against RD-1 pass 1's rollout in Q2. (Moot since 2026-10-07: the role grants no S3.)

#### RESOLVED: How a runner change reaches a stack was not stated
It is recorded only in `spike-plan.md` 18a ("`make publish-artifact VERSION=x.y.z` … then a `CodeArtifactKey` stack update") and in the Makefile. Fixed as R11. The Makefile's own comment still points `CodeArtifactKey` at cloud-formation's `create-stack` config, which RD-1 pass 1 retires; fixed by R12 (Q6).

### Security Engineer

#### RESOLVED: Fixtures move within the packages writer's reach
Confirmed from RD-1 pass 1's planned `PackagesWriterUser` (`s3:PutObject` on `packages/*`). Recorded under Technical Notes with why it is availability only.
