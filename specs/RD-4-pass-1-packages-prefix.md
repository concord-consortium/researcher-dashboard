# RD-4 pass 1: the runner's `scripts/` to `packages/` prefix rename

**Jira**: https://concord-consortium.atlassian.net/browse/RD-4 (pass 1 of 2; pass 2 is `RD-4-pass-2-pull-loop`)

**Status**: **Closed**

## Overview

Move the bucket prefix the runner fetches package archives from, `scripts/`, to `packages/`, which is where report-server publishes them and what the broker's session policy grants. The change covers the runner's package backend in both of its modes, the fixture publishing script and the tests, with the Makefile comment and a "Releasing the runner" section in the stack's README. It changes nothing in the stack template. The key under the prefix stays `<name>/<version>.zip` in this pass; moving it to report-server's `<origin>/<name>` identity is pass 2's work.

## Requirements

### The runner

- **R1.** In S3 mode the runner fetches a package archive from `packages/<name>/<version>.zip` in the bucket `runHookPayload` names, instead of `scripts/<name>/<version>.zip`. The key under the prefix, the bucket, and the credential (the default chain) are unchanged. On RD-1's stack that chain is the execution role, which reads nothing, so in a VM this fetch succeeds only once pass 2 moves it onto broker credentials.
- **R2.** In DIR mode the runner fetches it from `<SYNC_DIR>/packages/<name>/<version>.zip`, mirroring the bucket's layout as it already does for `researchers/`.
- **R3.** The prefix is spelled once in the runner's code, beside `packageKey`, and both modes use it.
- **R4.** `runner/scripts/publish-package.sh` uploads `<version>.zip` and `<version>.sha256` to `s3://<bucket>/packages/<name>/`, and its header comment and output name the new prefix. Its arguments, archive and checksum are unchanged.
- **R5.** Tests: a runner test that the S3-mode package backend `buildRunner` builds requests `packages/<name>/<version>.zip` from the payload's bucket; a runner test that the DIR-mode backend reads `<SYNC_DIR>/packages/<name>/<version>.zip`; and the sample URL in `redact.test.js` uses `packages/`. After the change, `grep -rn 'scripts/' runner --exclude-dir=node_modules` finds nothing.

Unchanged by this pass: the `/run-package` body and its single-segment name check, the result document's id, the local fetch cache at `<workRoot>/packages/<name>/<version>.zip`, the package's home and output directories, checksum verification before unpacking, and the manifest check against the requested name and version.

### Stacking and landing

- **R6 to R8** (a template step moving the execution role's grant to `packages/*`, with a test) *(removed 2026-10-07: RD-1 became one pass whose execution role holds no S3, and RD-1's own test asserts the template names `scripts/` nowhere)*.
- **R9.** The README step waits until RD-1's implementation is on the parent branch *(met 2026-10-09: RD-1 merged as `e363311`, and this branch is on `main`)*.

### Rollout

- **R10.** None of its own. On RD-1's stack the execution role reads no S3, so a VM from this runner can fetch nothing; the first runner release that does work on staging is RD-4 pass 2's.
- **R11.** A runner change reaches a stack as a runner release: `make publish-artifact VERSION=<x.y.z> ARTIFACT_BUCKET=<bucket in the stack's account>` in `runner/` (`concordqa-devops` for staging), then that key as `CodeArtifactKey` in a change set. A new package version needs no image rebuild; a new prefix does.
- **R12.** `runner/Makefile`'s comment on `artifact-uri` names the stack's `CodeArtifactKey` parameter and `cloudformation/README.md`, not cloud-formation's retired `create-stack` config.
- **R13.** `cloudformation/README.md` gains "Releasing the runner": publish the artifact, then a change set that sets `CodeArtifactKey` explicitly while every other parameter keeps its previous value, and the rule that a runner change needing a new grant goes in the same change set as the grant, with live VMs terminated first. *(As built, the section also gives the commands for terminating the VMs on the old image, run with the operator's own credentials since the launcher cannot list VMs.)*

## Technical Notes

- **Name-keyed fixtures and identity-keyed catalog objects cannot collide.** A pass 1 fixture is `packages/<name>/<version>.zip` (one segment before the version) and a report-server object is `packages/<origin kind>/<origin id>/<name>/<version>.zip` (three).
- **The packages writer can reach the fixtures.** RD-1's `PackagesWriterUser` holds `s3:PutObject` on `packages/*`. An overwrite can only stop a version from running, since the runner checks every archive against the checksum it was sent and unpacks nothing on a mismatch.
- **DIR-mode trees** on a developer's machine belong at `<SYNC_DIR>/packages/<name>/` after this pass, where the spike laid them out under `scripts/`.
- **The function leaves a VM on its image.** `ensure-vm.ts` resumes a suspended VM and leaves a running one alone whatever its image, so a VM picks up a new image only once it is terminated. Writing the release section found that RD-1's "Updating a stack" said otherwise, and it was corrected in the same commit.
- **Not recorded:** who publishes the runner artifact and applies the stack beyond "the operator", and how a `runner x.y.z` release is marked (`package.json` and the Makefile both say `0.1.0`; there are no git tags).

## Out of Scope

- Everything RD-4's Jira clauses assign to pass 2 (the pull loop, broker credentials, the hooks, the package contract, the documents, section 3's renames, logs, the smoke script) or to RD-1 (the template and its grants).
- Identity-keyed S3 keys and local paths (Q1).
- `packages/` on the broker's ceiling and session policy: RD-1 and REPORT-143.
- The fate of `publish-package.sh` once report-server's publish route and `cc-data package publish` exist: pass 2's call (pass 2 deletes it).

## Decisions

### Q1. Does pass 1 also move the runner to identity-keyed paths, or only rename the prefix?
**Context**: report-server writes `packages/<origin>/<name>/<version>.zip`; the runner reads `<name>/<version>.zip`, so a prefix rename alone gives a key report-server never writes.
**Options considered**:
- A) Prefix only; pass 2 moves the key and every local path to the identity together.
- B) Identity keys now: `/run-package` gains an `identity` field.
- C) Identity in the S3 key, name in the local paths.

**Decision**: A. The identity has no way into the runner until pass 2's `/work`: `/run-package` carries a name and its only caller, the spike function, sends one. B would change a push contract pass 2 deletes, and C splits one clause and still needs B. No catalog package can reach a runner before `/work` exists, so the window where the layouts differ is empty.

---

### Q2. What order do this pass's rollout and RD-1's need? *(superseded)*
**Context**: When RD-1 was three passes, the execution role's grant and the runner's prefix had to reach a stack together.
**Options considered**: A) this pass merges before the QA stack is created; B) the stack first, then one update carrying both; C) grant both prefixes for a while.

**Decision**: Superseded 2026-10-07: RD-1 is one pass whose execution role reads no S3, so there is no grant for this runner to arrive with (R10).

---

### Q3. Is there anything to migrate from `scripts/` to `packages/`?
**Context**: The spike's bucket held fixtures under `scripts/`.
**Decision**: Nothing. RD-1's rollout deleted the spike's bucket, and the QA bucket starts empty. A fixture wanted again is re-published, which reproduces the same archive and checksum.

---

### Q4. Where is the prefix spelled?
**Options considered**: a string in each backend; a constant in `index.js`; an exported constant in `package-fetch.js` beside `packageKey`.
**Decision**: `PACKAGES_PREFIX` in `package-fetch.js`, which already owns the half of the key under the prefix, so both halves are defined together and pass 2 changes both there.

---

### Q5. Is the template's grant pinned by a test? *(superseded)*
**Decision**: Superseded 2026-10-07: there is no package grant on the execution role, and RD-1's own test pins the role at logs only.

---

### Q6. Scope additions for pass 1
**Context**: Two items outside RD-4's clauses surfaced while speccing how this pass reaches a stack: the Makefile's stale `CodeArtifactKey` comment, and a runner-release procedure, which RD-1's README lacked (its update carries `CodeArtifactKey` over unchanged).
**Options considered**: A) both in pass 1; B) neither; C) pick.

**Decision**: A (Doug, 2026-09-25), as R12 and R13.

---

### Where do the runner tests go?
**Options considered**: extend `package-fetch.test.js`; add to `runner.test.js`.
**Decision**: `runner.test.js`. The prefix is chosen in `buildRunner`, so only a test through `buildRunner` catches a wrong one.

---

### How does the S3 test observe the key?
**Options considered**: mock `@aws-sdk/client-s3`; make `buildRunner` take an injected client; replace `backend.client` after construction.
**Decision**: Replace `backend.client`. `S3Backend` keeps its client as a public field, the test needs only the command's input, and an injectable `buildRunner` would change production code only for a test.

---

### Nothing would fail if the prefix string were wrong (self-review)
**Context**: `runner.test.js` stubbed `makePackageBackend`, and no test built the real package backend.
**Decision**: R5's two backend tests, shown to fail against the old prefix.

---

### How a runner change reaches a stack was not written down (self-review)
**Context**: It was recorded only in the spike's plan, and RD-1's update procedure cannot release a runner.
**Decision**: R11 to R13, the release section in `cloudformation/README.md`.

---

### "Releasing the runner" said to terminate old VMs without saying how (code review, 2026-10-09)
**Decision**: The section gives the commands: find the stack's `MicrovmImageArn`, list its VMs and terminate each, with the operator's own credentials.
