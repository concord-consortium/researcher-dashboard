# Implementation Plan: RD-4 pass 2, the pull loop, and everything else in the runner, on the broker's credentials

**Jira**: https://concord-consortium.atlassian.net/browse/RD-4, **pass 2 of 2**
**Branch**: `RD-4-pass-2-pull-loop`, parent `RD-4-pass-1-packages-prefix` (`43c2da4`, on `main`), no child yet. Re-spec'd 2026-10-08 (requirements, Background).
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

Seven steps, one commit each:

1. Section 3's renames (R47), identifiers only.
2. Every S3 call on the broker's credentials, and the default chain switched off (R14 to R19), with the dispatch model still in place.
3. The pull loop, the package contract and the documents (R1 to R13, R20 to R46a with R28a, R49, R50, R56, and the CLUE pre-pull step 6 deletes), which replace the dispatch.
4. The smoke gate, the cc-data pin, the READMEs, the Makefile, the test workflow, and `publish-package.sh` deleted (R51 to R55, R54b, R60, R48's README half).
5. The runner's side of REPORT-143's lease: the heartbeat, the settled final write, `/terminate`'s reason and guarded write, and `/idle`'s declined answer (R8, R11, R23, R27, R43, R44 to R44b).
6. The CLUE pre-pull deleted (R37, R43's stages, R46, R56, R56a).
7. The release's version and the smoke package's long-run variant (R52, R58).

Steps 1 to 4 are built (`0573728`, `c197a2f`, `1dab9c3`, `8aba088`, then `e6319cd` and `6006fe9`); their sections below describe them as built, including the CLUE code step 6 deletes, and their counts are the throwaway build's. Steps 5 to 7 were added on 2026-10-14 from REPORT-143's merged contract and Doug's decision to remove the pre-pull, and built the same day (`67daf8e`, `82a3296`, `8d2477e`). `npm test` passes 198 tests on `6006fe9`, 218 after step 5, 203 after step 6, which deletes the CLUE tests, and 219 after the final comparison and review, which add tests for what they fixed; the emulator suite passes 5 of 5 against REPORT-143's rules on `master` after steps 5 and 6 (Node 24.14).

**Why step 3 is one commit.** The dispatch it replaces (`POST /run-package`) carries a name, no identity, no catalog id and no scope block, so the package contract of R28 to R41a cannot be built against it without inventing an intermediate dispatch body that step 3 would then delete, and the pull loop cannot be built without the contract, since `/work` hands out identities. Its production code is about 1,200 lines and its tests about the same, the same order as the 2026-09-26 plan: the re-spec swaps the local matcher (about 60 lines and its 40-line test) for a report-server client of about the same size; `runner.test.js` is rewritten rather than edited, because every test in it drove the dispatch. The parts that do stand alone (the contract fixture and script, `askApplies`, the production Firebase rows, the new settings and the grammar exports) were built as their own step on step 2 and passed, 162 tests, but came to 471 lines that nothing calls until step 3, so they stay in it (second review).

**How the steps land.** All four touch only `runner/`, `fixtures/`, the repository README and, in step 4, a new `.github/workflows/runner.yml`, and nothing in `cloudformation/`, so none waits on RD-1's implementation, except the README hunk: RD-1 (implemented on `RD-1-runner-stack`, channel #27) adds `cloudformation/` to the README's layout, so step 4's README change is made against the README as that implementation leaves it. This branch is rebased onto `RD-1-runner-stack` after the re-spec (Doug, channel #27), not by this spec. *(RD-1 merged 2026-10-09 as `e363311`; this branch and pass 1 are now on `main`.)* This branch's implementation commits land after its parents' (RD-1, RD-4 pass 1). RD-4 pass 1's step 1 edits `package-fetch.js`, `index.js`, `publish-package.sh` and two runner tests, which steps 2 to 4 change again; the diffs below are against the runner with that step applied.

**The throwaway build.** All four steps were built as throwaway code in a scratch copy of this branch with RD-4 pass 1's step 1 applied (never in the worktree), first on 2026-09-26 and again for the re-spec on 2026-10-08, and each step was built alone on the one before: `npm test` passes 139 tests after step 1, 152 after step 2, 197 after step 3 and 197 after step 4 (re-measured after the second review's fixes), against 139 with RD-4 pass 1 alone (137 on `main`), and step 4's tree is identical to the whole build's. The four step diffs, the whole build as one patch, the mutation scripts and every output are in the branch oob folder `stage-verification/` (researcher-dashboard, `RD-4-pass-2-pull-loop`): `step1.diff` to `step4.diff` apply in order to `main` plus `pass1-step1.diff`. The implementation should start from them. The code below is the shape of each step, not its whole text.

Everything runs on Node 24 (24.14.0 under nvm on this machine, not on a non-interactive shell's `PATH`), with `node_modules` symlinked from the main checkout (`speccing.md`, "Machine setup"; remove the link before committing).

---

### Step 1: section 3's renames

**Summary**: The identifiers section 3 renames, and nothing else (R47): `#analysis` to `#run`, `currentAnalysis` to `currentRun`, `#runAnalysis` and `#analysisSteps` to `#runPackage` and `#packageSteps`, the `analyze.*` log events to `package.*`, `ANALYSIS_UID` and `analysisUid` to `PACKAGE_UID` and `packageUid`, `ANALYSIS_TIMEOUT_MS` and `analysisTimeoutMs` to `PACKAGE_TIMEOUT_MS` and `packageTimeoutMs` (same meaning in this step), `NETNS = "analysis"` to `"package"` and the veth end `veth-an` to `veth-pkg`, the image's `analysis` user to `package`, and "VM terminated during analysis" to "VM terminated during the package run", `final-design.md` 3's string. The stack's image sets none of the renamed variables (RD-1's template passes `PORT`, `DATA_ROOT`, `SYNC_BACKEND` and `STATUS_BACKEND`), so nothing outside the runner changes. The document-path renames (`researchers/` to `runners/`, `classes` to `scopes`) are step 3's, since they change what the runner writes.

**Files affected**: `runner/Dockerfile`, `runner/server/{config,runner,index,netns,sandbox,log,state,egress-proxy,clue-reader}.js`, and the tests that name them (`runner`, `server`, `steps`, `sandbox`, `egress`, `firestore.emulator`).

**Estimated diff size**: ~180 lines, 90 each way

```dockerfile
# The package user runs fetched packages: no tokens, no credential store, a
# read-only dataset and a writable output directory are handed to it per run. It is
# the image's first user, so its uid is 1000, which PACKAGE_UID defaults to.
RUN useradd --create-home --shell /usr/sbin/nologin package
...
RUN mkdir -p /work /data && chown package:package /work
```

**Verified**: 139 tests pass. No renamed identifier remains (`grep -rn "currentAnalysis\|analysisUid\|ANALYSIS_\|analysisTimeout\|\"analyze\.\|NETNS = \"analysis\|analysis:analysis\|veth-an"` over `runner/` finds nothing); what `grep -i analys` still finds after this step is prose in comments and test names, which step 3 rewrites. In the base image, `useradd … package` is uid 1000 (requirements, Stage 4 verification).

---

### Step 2: every S3 call on the broker's credentials

**Summary**: R14 to R19 on the dispatch model. `/run` reads `function_url` from the payload (now required), builds a client for the function, and before its first S3 call fetches `/storage-credentials` with the session store's ID token. One module builds S3 clients, only from those credentials, and checks them against the wall clock at every use. `S3Backend` loses its default client. The server's entry point switches the SDK's default chain off before anything else runs. A resume marks the credentials stale. The dispatch, the hooks and the documents are untouched; step 3 replaces them.

**Files affected**:
- `runner/server/storage.js`: new, `makeS3Client` and `StorageCredentials`
- `runner/server/function-client.js`: new, `makeFunctionClient` and `FunctionError`
- `runner/server/sync/backend-s3.js`: a required client provider, asked before every call
- `runner/server/config.js`: `function_url` required; `DEFAULT_CHAIN_VARIABLES` and `disableDefaultCredentialChain`
- `runner/server/index.js`: `makeStorage`, `makeFunctionClient`, both S3 backends on `storage.client()`, and the chain switched off in `main`
- `runner/server/runner.js`: `/run` builds the storage credentials and fetches them before the pull-down; `/resume` marks them stale
- `runner/server/firestore.js`, `runner/server/status.js`: `idToken()` on each store
- `runner/test/storage.test.js`, `runner/test/function-client.test.js`: new; `runner.test.js`, `server.test.js`, `firestore.emulator.test.js`: the payload's `function_url`, a function stub, RD-4 pass 1's S3 test on the broker's client provider, and the ordering test

**Estimated diff size**: ~500 lines, half of it tests (measured: 471 added, 26 removed)

```js
// storage.js: the only place an S3 client is built.
export function makeS3Client(credentials) {
  const { accessKeyId, secretAccessKey, sessionToken, region, expiration } = credentials ?? {};
  for (const [name, value] of Object.entries({ accessKeyId, secretAccessKey, sessionToken, region })) {
    if (typeof value !== "string" || value === "") {
      throw new Error(`an S3 client needs the broker's ${name}, and none was given`);
    }
  }
  return new S3Client({ region, credentials: { accessKeyId, secretAccessKey, sessionToken, ...(expiration ? { expiration } : {}) } });
}

export const REFRESH_MARGIN_MS = 5 * 60_000;

export class StorageCredentials {
  // fetchCredentials: POST /storage-credentials with the current session's ID token
  constructor({ fetchCredentials, bucket, prefix, now = () => Date.now(), makeClient = makeS3Client }) { … }
  markStale() { this.#stale = true; }
  async client() {
    if (this.#usable()) return this.#client;          // not stale, and more than 5 minutes left by the wall clock
    this.#inFlight ??= this.#refresh().finally(() => { this.#inFlight = null; });
    await this.#inFlight;
    return this.#client;
  }
  // #refresh refuses an answer whose bucket is not the payload's or whose prefix is not
  // researchers/<id>/, or whose expiration is not a time, and logs storage.credentials_fetched.
}

// config.js: called first in index.js's main.
export function disableDefaultCredentialChain(env = process.env) {
  for (const name of DEFAULT_CHAIN_VARIABLES) delete env[name];   // the eight the SDK reads
  env.AWS_EC2_METADATA_DISABLED = "true";
  env.AWS_SHARED_CREDENTIALS_FILE = "/dev/null";
  env.AWS_CONFIG_FILE = "/dev/null";
  return env;
}
```

```js
// sync/backend-s3.js
constructor({ bucket, prefix, client }) {
  if (typeof client !== "function") {
    throw new Error("S3Backend needs the broker's client provider; it has no default credentials");
  }
  …
}
async #send(command) { return (await this.client()).send(command); }
```

**Tests** (`storage.test.js`, `function-client.test.js`, and one in `runner.test.js`):
- `new S3Client` appears in `storage.js` and in no other file under `server/`; no file imports an `@aws-sdk/*` package but `client-s3`, and none but `storage.js` names `S3Client`; `package.json` depends on no other `@aws-sdk/*` package.
- The builder refuses each of the four missing values.
- A client it builds resolves the broker's key and session token while `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` hold other values.
- With `disableDefaultCredentialChain` applied, the eight variables are gone, and `new S3Client({region}).config.credentials()` rejects with `CredentialsProviderError`.
- `S3Backend` without a client provider throws.
- Credentials are fetched on first use, reused until within five minutes of expiry by the injected clock, fetched again after `markStale()`, fetched once for three concurrent uses, and refused for another bucket, another prefix or an unparseable expiration.
- The function client posts JSON with the bearer to `<function_url>/<route>`, bounds every call, and turns a `{success: false, error}` or an answer without the envelope into a `FunctionError` carrying the status.
- `/run` in S3 mode makes exactly `storage-credentials` (with an ID token), then builds the client, then `ListObjectsV2`, in that order, and logs `aws.default_chain_disabled` with the VM's id, read from an environment `disableDefaultCredentialChain` has cleared (an injected `processEnv`).

**Verified**: 152 tests pass on step 1 plus this step. The default-chain premise was checked against `@aws-sdk/client-s3` 3.1134.0 before any code (requirements, Stage 1 verification).

---

### Step 3: the pull loop, the package contract and the documents

**Summary**: The runner stops being dispatched to. `/run` fails without `microvmId`, signs the session in and checks its Firebase-verified claims, and once it has answered Lambda starts a loop that asks `/work` for its queue, adopts each answer's tokens into new stores, plans every package in the answer (grammar, class store, scope, fetch, checksum, bounded unpack, manifest, ceiling, applicability asked of report-server, window), claims and runs the first, writes the result and the counts, and asks again; when nothing is left it polls through the idle period, flushes, and asks `/idle`. The hooks follow `final-design.md` 7.1 and 7.2. The package gets `scope.json` and `pkg-<catalog id>` and writes `display.md`; the documents move to `runners/`, per-researcher results and the scope document, all with server time; the CLUE pre-pull follows `clue_prepull`, the environment's CLUE project and the token's expiry; `/run-package` and `/refresh-token` are deleted.

**Files affected**:
- `runner/server/runner.js`: rewritten around `run`, `#workLoop`, `#adopt`, `#plan`, `#runPackage`, `#steps` and the three hooks
- `runner/server/status.js`: `runnerPath`, `scopePath`, `resultPath` by researcher; `RunnerStatus` (bounded, failure-recording status writes) and `ClassDocuments` (profile read, claim, stage, done, failed, counts) replace `StatusWriter`; `bounded`, `SERVER_TIME`, `customTokenClaims`; `MemoryStore` and `LogStore` gain `claims`, `serverTimestamp`, `timestamp`, `close` and `replaceFields`, and `MemoryStore.merge` merges nested maps as Firestore's does; `ClassDocuments.counts` writes through `replaceFields`
- `runner/server/firestore.js`: one app per store, `claims()`, `get()`, `serverTimestamp()`, `timestamp()`, `close()`, and `replaceFields()` (`setDoc` with `mergeFields` naming the fields written)
- `runner/server/package-fetch.js`: `IDENTITY` and `VERSION` as the contract fixture's grammar, `CHECKSUM`, `packageKey(identity, version)`, `packageDocId`, `nameOf`, `PackageUnreadable`, `inflatedSize`, the symlink check, the manifest's added checks and `declaresPatterns`
- `runner/server/package-env.js`: paths by package key with an input directory, `scopeFile`, `datasetName`, the environment without the class variables, `readPackageResult` and the 64 KiB cap, `readPackageCounts` on three keys
- `runner/server/sandbox.js`: `killPackageProcesses`, after every run (R28a)
- `runner/server/steps.js`: `CLUE_SOURCE`, `clueToken` and `ClueTokenExpired`, `pullData` on `clue_prepull` with a per-package CLUE store, `runPackage` returning `{display, summary}`; `signIn` and `CLUE_PROJECT` removed
- `runner/server/firebase-projects.js`: `report-service-pro` and `collaborative-learning-ec215`, and `clueProjectFor`
- `runner/server/report-server.js`: `askApplies` and `ReportServerError` beside `revokeOwnToken`
- `runner/server/index.js`: the dispatch and refresh routes removed, `/resume` synchronous, `GET /` on `currentRun`, one shared document map for the in-memory stores
- `runner/package.json`: `npm test` runs `node --test --test-force-exit`; `contract:sync` and `contract:check`
- `runner/scripts/contract.mjs`: new, `sync` and `check` against report-service's file on GitHub (R6, requirements Q14)
- `runner/server/config.js`: `PACKAGE_MAX_DURATION_DEFAULT` and `PACKAGE_MAX_DURATION_SECONDS` with its floor and cap, `PACKAGE_TIMEOUT_MS` as an override, `IDLE_PERIOD_MS`, `IDLE_POLL_MS`
- `runner/Dockerfile`: `/work` stays root's (R28a)
- `fixtures/package-contract.json`: new, written by `npm run contract:sync` from REPORT-167's merged file
- Tests: `runner.test.js` and `server.test.js` rewritten; `package-env`, `package-fetch`, `steps`, `firebase-projects`, `config` and `firestore.emulator` updated; `package-contract.test.js`, `report-server.test.js` and `memory-store.test.js` new

**Estimated diff size**: ~5,100 lines, 3,128 added and 1,984 removed, half of it tests (measured on the throwaway build)

**The loop** (`runner.js`), with its epoch guard (R12):

```js
async #workLoop(epoch, afterResume) {
  let force = afterResume;                 // an ID token forced fresh after a resume (R20)
  let idleSince = null;
  let refreshed = !afterResume;
  while (this.#current(epoch)) {           // epoch === this.#epoch && not terminated
    let answer;
    try {
      answer = await this.#call("work", { microvm_id: this.microvmId }, { force });
    } catch (err) {
      if (!this.#current(epoch)) return;
      const launching = err.status === 409 && this.now() - this.#readyAt < LAUNCH_RECORD_WINDOW_MS;
      await this.sleep(launching ? LAUNCH_RETRY_MS : this.env.idlePollMs);   // 5 s, or one idle poll
      continue;
    }
    if (!this.#current(epoch)) return;
    force = false;
    const request = await this.#adopt(answer);          // on a refused token: log, one idle poll, again
    if (!refreshed) { this.storage?.markStale(); await this.storage?.client(); this.syncer.start(); refreshed = true; }
    if (this.#run) await this.#run.done;                // a package the suspend interrupted finishes first
    const next = await this.#plan(request);
    if (next) { idleSince = null; await this.#runPackage(request, next); continue; }

    if (this.#lastWritten !== "ready") { if (await this.status.writeFromHook("work", { state: "ready", current_package: null, queue: [] })) this.#lastWritten = "ready"; }
    idleSince ??= this.now();
    if (this.now() - idleSince < this.env.idlePeriodMs) { await this.sleep(this.env.idlePollMs); continue; }
    const flushed = await this.syncer.flushAndVerify("idle");            // the fallback, always on (Q5)
    if (!this.#current(epoch)) return;       // a resume during the flush: the new loop decides (R12)
    if (!flushed.ok) { idleSince = this.now(); continue; }
    const idle = await this.#call("idle", { microvm_id: this.microvmId });   // on an error: log, restart the period
    if (!this.#current(epoch)) return;
    if (idle.work_queued) { idleSince = null; continue; }
    if (idle.suspended) return;              // /suspend follows; /resume starts the next loop
  }
}
```

**Adoption** (R3 to R5): `#signIn(projectId, token, classHash)` builds a store, signs in, reads `store.claims()` and refuses unless `platform_user_id` (as a string) and `platform_id` are the payload's, `researcher_dashboard_runner === true`, and, for a class token, `class_hash` is that class's; a refused store is closed. `#adopt` checks `firebase_project`, signs the session in, then one store per class from `class_tokens[firebase_project]` (a class whose token is missing or refused is logged and skipped), swaps them in, and closes the previous request's stores except the one `#run` still holds.

**Planning** (R6, R7, R25, R26, R29, R33, R34): for each entry, in order, a refusal writes `failed` through that class's store, never `running`:

```js
if (!IDENTITY.test(entry.identity) || !VERSION.test(entry.version) || !CHECKSUM.test(entry.checksum) || !(entry.catalog_id >= 1)) → refuse
if (entry.package_key !== packageDocId(entry.identity)) → refuse
if (checkScope(scope, entry.class_hash)) → refuse     // kind class, id and the one class match, class_id a positive integer, assignments a list
manifest = await steps.resolvePackage(…)              // fetch, checksum, bounded unpack, symlinks, manifest → refuse with its reason
if (manifest.expected_duration_seconds > env.packageMaxDurationSeconds) → refuse
if (declaresPatterns(manifest.urls)) {                 // no pattern in any group: no call
  profile = await docs.profile()                        // classes/{class_hash}, through the class store
  if (!profile) → refuse("…authored profile has not been derived yet…")
  try {
    verdict = await askApplies({ baseUrl: payload.report_server_url, token: payload.report_server_token,
                                 urls: manifest.urls, scopeUrls: [...profile.assignment_urls, ...profile.interactive_urls] })
  } catch (err) {                                       // logged as report_server.refused, call: "applies"
    err.refusal ? refuse(err.message)                                  // 400 or 422
      : noteClaimFailure(entry, err) >= CLAIM_ATTEMPTS && refuse("…could not say whether the package applies…; run it again")
  }
  if (!verdict.applies) → refuse(`the package does not apply to this class: ${verdict.reason}`)
}
// then the window, up front: sum the survivors' declared durations in order against
// expiresAt − 5 min − now, and fail every package from the one the sum passes it on.
```

A write that fails while refusing, and a profile that cannot be read, count as claim failures for that entry (R9); a result written for the entry clears its count, and so does a resume. A verified manifest is kept per identity, version and checksum for the VM's life, and report-server's yes per class, identity and version until the next resume, so re-planning after each package fetches nothing and asks nothing again. The plan returns the entries it wrote `failed`, which the status document's `queue` leaves out (R8).

**Asking report-server** (`report-server.js`, R34 to R36):

```js
export async function askApplies({ baseUrl, token, urls, scopeUrls, fetchImpl = fetch, timeoutMs = 30_000 }) {
  // POST <baseUrl>/api/v1/packages/applies, Bearer <token>, {urls, scope_urls}, AbortSignal.timeout(timeoutMs).
  // A thrown fetch (no answer, timeout)        → ReportServerError, status null, not a refusal
  // 400 or 422                                 → ReportServerError(body.message), refusal: true
  // any other non-2xx, or no boolean `applies` → ReportServerError, status, not a refusal
  return { applies: body.applies, reason: body.reason ?? null };
}
```

The runner is built with `askAppliesRoute = askApplies`, which the tests replace, as they replace `revokeReportServerToken`.

**Running** (R8, R27, R43 to R46): `#runPackage` sets `#run` (with its class store and a `done` promise), sets the log context `{scope, package}`, writes the claim through `ClassDocuments.claim`, then the status document (`running`, `current_package: {class_hash, package_key}`, the rest of the answer as `queue`, `scopes`), then races `#steps` against `declared + 10 minutes` (or `PACKAGE_TIMEOUT_MS`). `#steps` writes the stages `pull`, `prepare_package` and `run_package` as each starts. On success the counts are written (a failure there is logged, not fatal) and then `done` in one call; on any failure, `failed` with the redacted reason. `finally` clears `#run`, closes a class store the last adoption kept only for it, and resolves `done`.

**The documents** (`status.js`):

```js
async claim(docId, { pkg, imageVersion, microvmId, expectedDurationSeconds }) {
  await bounded(this.store.merge(this.#result(docId), this.#stamped({     // + platform_id, updated_at: serverTimestamp()
    status: "running", stage: "starting", package: pkg, image_version: imageVersion,
    microvm_id: microvmId, expected_duration_seconds: expectedDurationSeconds,
    started_at: this.store.serverTimestamp(), finished_at: null, error: null, summary: null, display: null
  })));
}
async done(docId, { pkg, imageVersion, summary, display }) {   // every field of a finished result, in one call
  await bounded(this.store.merge(this.#result(docId), this.#stamped({
    status: "done", stage: "done", package: pkg, image_version: imageVersion, summary, display,
    error: null, finished_at: this.store.serverTimestamp()
  })));
}
// RunnerStatus.writeFromHook(hook, fields): bounded at 10 s; on failure logs status.write_failed,
// keeps the last ten {hook, error: redact(message)}, and the next write that succeeds carries
// them as status_write_failures and clears them. It never throws.
```

**The hooks** (R20 to R24): `suspend()` writes `suspending`, stops the syncer, flushes and verifies (a failure writes `failed` and throws the 500), then writes `suspended` without `current_package` or `queue`. `resume()` is synchronous: a new epoch, `lifecycle.resume_without_suspend` if no `/suspend` came since the last activity, the credentials marked stale, the syncer stopped until the new loop has fetched them, the state back to `ready` in memory, and a new loop. `terminate()` starts a new epoch, fails a running result first ("VM terminated during the package run"), revokes the report-server token bounded at 10 seconds (`REVOKE_TIMEOUT_MS`; a failure logged as `report_server.refused`), flushes, and writes `terminated` or `failed`.

**The package contract** (`package-fetch.js`, `package-env.js`, `steps.js`): the archive key is `packages/<identity>/<version>.zip`; the cache is `<workRoot>/packages/<package_key>/<version>.zip`, unpacked beside it; before unpacking, `inflatedSize` spawns `unzip -p`, counts its output and kills it past 50 MiB; after, any symbolic link refuses the archive and its directory is removed; the manifest's `name` must be the identity's last segment, and `expected_duration_seconds`, `clue_prepull` and `urls` are checked. `preparePackage` empties the home, input and output directories, writes a root-owned, world-readable `scope.json` from the scope block, and hands `RD_SCOPE_FILE` and `RD_DATASET=<host>/pkg-<catalog id>` in place of `RD_CLASS_HASH` and `RD_PORTAL_CLASS_ID`. `readPackageResult` requires `display.md` at most 65,536 bytes and takes `summary.txt`'s first line; it and `readPackageCounts` read through `readOwnFile`, which refuses an output directory that does not resolve to itself and opens each file with `O_NOFOLLOW`, refusing a link or anything but a regular file (R28a). Before either read, `runPackage` calls `killPackageProcesses` in a `finally`, so a failed or timed-out run is cleared too: `setpriv` as the package uid runs `kill -KILL -1`, then `pgrep -u <uid> --runstates R,S,D,T,t` must exit 1, up to five times (zombies are not counted: the image's `CMD` makes node PID 1, which reaps no orphan; checked on a real kernel at implementation, where plain `pgrep` counted the zombies and failed every run that left a process behind); an output or an exit code other than 1 fails the package. The Dockerfile no longer hands `/work` to the package user. `clueToken` looks the CLUE token up by the portal row of `clueProjectFor(firebase_project)` and refuses one that has expired or has two minutes left; `pullData` signs a store in for it, checks its claimed class, reads, and closes the store.

**Tests** (197 in all; `runner.test.js` alone holds 58, against a fake function that answers `/work` from the queued results as REPORT-143 R5 defines them and mints a session token each call, answers `/idle` with `work_queued` while anything is queued as REPORT-143's does, in-memory stores sharing one document tree, and a clock that `sleep` advances):
- `/run`: ready on `runners/{uid}` with server time and `platform_id`, and nothing at the spike's `researchers/{uid}`; refused without `microvmId`, without `function_url`, without the report-server token, for a session token naming another researcher, and for one without the runner claim; asks `/work` with the VM's id as the session.
- The loop: a package claimed with R43's fields, finished in one call, the counts on the scope document with a timestamp `log_freshness_at` and no `learners`, nothing on the class document; `current_package` and `queue` while running, drained after; two same-named packages from two origins with separate package keys and fetches; the scope, catalog id, CLUE source, CLUE token and project reaching the steps; refused before any claim when report-server answers that it does not apply (with its reason verbatim, and the request carrying the archive's patterns, the profile's assignment and interactive URLs as `scope_urls`, the payload's report-server URL and token), for a missing profile with patterns, a ten-hour manifest, an unreadable archive, and a `package_key` that disagrees with its identity; a matching package run, and one declaring no patterns run without a call; report-server unavailable for three asks failing the package with a run-it-again reason, so the VM reaches `/idle`, each ask logged as `report_server.refused` with `call: "applies"`, the status, the scope and the package; and a 400 refusing it with report-server's message; the counts replacing an earlier run's whole `data` map; the up-front window failing the second of two 7,000-second packages at 16:30 with "12300s left … 14000s"; the in-VM bound failing a hung package; a failure redacted and the VM back to ready.
- A drained VM writes `ready` once, not on every idle poll; a launch record that lands after `/run`'s `ready` is corrected by the first `/work` the loop takes.
- Tokens and stores: new session and class stores per answer and no more than the current ones left open; an answer with another researcher's session token not adopted; a class token for another class leaving its package queued; a claim that cannot be written not retried past three attempts, with waits between.
- `/work` and `/idle`: a 409 after `/run` retried at 5 seconds, anything else at one idle poll; eleven `/work` calls through the idle period, then `/idle` with the VM's id; work queued during the period taken at the next poll; `work_queued` sending the loop back to `/work`; no `/idle` on an unverified flush; a stale `work_queued` answer from before a resume not starting a second loop (exactly two `/idle` calls); a loop stood down by a resume during its pre-`/idle` flush making no `/idle` call while the new loop's package runs.
- Claim attempts (R9): a package failed after three unanswered applies checks running when it is queued again on the same awake VM; two failed checks before a successful claim not counting against the next run; a resume giving an unwritable claim three more attempts; an entry left queued keeping the VM polling, since `/idle` answers `work_queued`.
- Re-planning: four patterned packages resolved once each and asked about once each; the status document's `queue` leaving out a package the same plan failed.
- The hooks: `/suspend` writing only `state`, twice, and keeping `current_package` and `queue`; a denied `PutObject` giving `failed` and a 500; `/resume` returning synchronously with no write and the next `/work` forcing a fresh ID token; the resume-without-suspend line; `/terminate` mid-run failing the result, revoking, flushing and terminating; a refused revocation not failing it; a failed status write not failing `/suspend`, and reported redacted by the next write; hooks before `/run` refused with no store built.
- The logs (S8-Q1): every `package.*` line of a run carries `researcher`, `microvm_id`, `scope` and `package`, and the line after the run has `scope` and `package` null; `package.failed`, `status.write_failed`, `sync.failed` and `report_server.refused` (the revocation's, with `call: "revoke"`) are each logged on their trigger, and `hook.failed` on a refused hook (`server.test.js`).
- S3: `/run` in S3 mode fetching credentials before its first `ListObjectsV2`; RD-4 pass 1's two prefix tests on `packages/<identity>/<version>.zip`.
- `server.test.js`: the hooks route through, `/run-package` and `/refresh-token` answer 404, a hook before `/run` is 409, a non-JSON `/run` is 400, `GET /` reports `current_package`.
- `package-fetch`, `package-env`, `steps`, `firebase-projects`: each clause of R28 to R41a and R56 named above, and the CLUE token's expiry step 6 deletes, the package uid's processes killed after a run and before its output is read (again until none is left, also after a failed or timed-out run, and failing when they survive five kills or `pgrep` cannot run), a `display.md` link and a swapped output directory refused and a `counts.json` link not read, and `inflatedSize` and the symlink check against real `zip` archives.
- `package-contract.test.js`: `IDENTITY`, `VERSION` and `packageDocId` against every case of `fixtures/package-contract.json`, each list asserted non-empty first, and the ceiling's default against `limits.max_duration_seconds`.
- `config.test.js`: the ceiling's default, its cap at 28,800 and its floor at the default, and a non-integer refused.
- `report-server.test.js`: `askApplies`'s request (path, bearer, body of exactly `urls` and `scope_urls`), a 400 and a 422 as refusals with the server's message, and a 503, a 401, a 404, an answer without `applies`, a timeout and a failed connection as not.
- `memory-store.test.js`: `MemoryStore.merge` merges a nested map as Firestore's does, and `replaceFields` replaces it, so a runner test cannot pass on a write Firestore would merge.
- `firestore.emulator.test.js` (skipped without the emulators): the session's verified claims, the status document with a Firestore timestamp, a claim, a stage and a finish, and the counts, then a second counts write holding only `answers` leaving only `answers` and `last_pull_at`, through the real `FirestoreStore`.

**Verified**: 197 tests pass on step 2 plus this step. The emulator suite passes against REPORT-143's rules (Verification). Seventy-three mutations, each failing its test (Verification).

---

### Step 4: the smoke gate, the cc-data pin, the READMEs, and `publish-package.sh` deleted

**Summary**: The smoke package and script (R51 to R53), the cc-data pin (R60), `runner/README.md` (R54), the repository README's layout and description (R48, R55), the Makefile's two smoke targets and `run-hook` deleted (R54a), the workflow that runs the tests (R54b), and `runner/scripts/` deleted (R55). The pin is here rather than in step 3 because the smoke `image` command is what checks it.

**Files affected**:
- `runner/Dockerfile`: `ARG CC_DATA_REF=v0.3.0-pre.1`, and nothing else
- `runner/smoke/package/manifest.json`, `runner/smoke/package/run.py`, `runner/smoke/smoke.mjs`: new
- `runner/README.md`: new, including the contract copy and its two scripts, the workflow, and the monthly rebuild as a manual step
- `.github/workflows/runner.yml`: new, `npm ci` and `npm test` on a push touching `runner/**`, `fixtures/**` or itself (R54b)
- `README.md`: the description and the layout, `fixtures/` described as the contract fixture's copy
- `runner/Makefile`: `run-hook`, `HOOK` and `RUN_PAYLOAD` deleted; `smoke-build` and `smoke-image`; `clean` removes `smoke/dist`
- `runner/server/sync/backend-dir.js`: its comment no longer names `make run-hook`
- `runner/scripts/publish-package.sh`, `runner/scripts/.gitkeep`: deleted; `runner/scripts/` keeps step 3's `contract.mjs`

**Estimated diff size**: ~440 lines, including the 75-line script and the `run-hook` target removed (measured: 331 added, 107 removed)

The smoke package declares no `urls`; `build --any <pattern>` writes them at build time, so the one package serves any stack's smoke class (Q11). `run.py` uses cc-data exactly as the spike's `_lib/ccdata.py` did: `dataset create` (an existing one is not an error), `reports create --portal … --report-slug student-answers --report-filter '{"class":[<id>]}' --json` (whose answer is `{"run": {"run_id"}}`), `get report --refresh`, `get answers`, and `query … --format json`, then `DESCRIBE` on `answers` for `source_key`, `remote_endpoint` and `question_id` (cc-data's contract columns, `internal/duck/views.go`) and on `run_answers` for `run_id`, `type`, `remote_endpoint`, `source_key` and `question_id` (REPORT-146 R1; `type` is what `wildfire-responses` filters on), a count of `run_answers` for the run that must equal the run's answers, and a count of `report_prompts` against its two pseudo-header rows (`internal/duck/engine_test.go`). It writes `display.md` and `summary.txt` carrying `RUNNER-SMOKE-OK`, and `counts.json`.

`smoke.mjs image` reads `CC_DATA_REF` out of the Dockerfile and makes the container's first command `test "$(cc-data version)" = '<ref without v>'`, so the pin is written once. `smoke.mjs stack` takes the scoped access token in `RD_SMOKE_ACCESS_TOKEN` (its `uid` claim names the researcher, `signed_jwt.rb` on rigse's `RIGSE-367-oauth-pkce-scoped-tokens`) and terminates with `aws lambda-microvms terminate-microvm --microvm-identifier <id>`, the CLI namespace RD-1's README uses for `get-microvm`.

**Verified**: 197 tests pass. `smoke.mjs build` produced the same checksum twice, a second apart, left a stray `__pycache__` out of the archive, and wrote `urls.any` with `--any` (2026-09-26; the build is unchanged since). `node --check` passes on `smoke.mjs` and `py_compile` on `run.py`. The `image` and `stack` commands were not run: `image` needs the `v0.3.0-pre.1` tag, which does not exist yet, a staging researcher's report-server token and a 45-minute emulated build, and `stack` a stack.

---

### Step 5: the runner's side of REPORT-143's lease

**Summary**: The claim writes `heartbeat_seconds: 60`, and a heartbeat merges `{platform_id, updated_at}` into the result every 60 seconds until the final write (R43, R44a). The final write is awaited until the SDK settles it, with no local bound, and nothing else is written until it has (R44b). `/terminate` stops the beat, writes REPORT-143's one lost-VM reason, and writes the runner document only while it records this VM (R23). An `/idle` answer that neither queues nor suspends restarts the idle period (R11, landing tracker 3.2a). R8's `current_package` rule: while a run is outstanding, `/suspend`'s and `/terminate`'s runner-document writes carry `current_package` from `#run`, so a lost claim-time write is repaired by the next hook write; with no run they leave the field alone, as today.

**Files affected**:
- `runner/server/runner.js`: `HEARTBEAT_SECONDS`; `startTimer`, defaulting to a `setInterval` in the constructor beside `sleep`, so `index.js` is unchanged; the heartbeat in `#runPackage`; the final write unbounded; `terminate()`'s reason, beat stop and guarded write; the idle loop's declined branch
- `runner/server/status.js`: `ClassDocuments.claim` writes `heartbeat_seconds`; `beat(docId)`; `done` and `failed` no longer bounded inside (callers that need a bound wrap them); `RunnerStatus.writeFromHook(hook, fields, { onlyIf })`; `MemoryStore.mergeIf`
- `runner/server/firestore.js`: `mergeIf(path, test, fields)` through `runTransaction`
- Tests: `runner.test.js`, `memory-store.test.js`, `firestore.emulator.test.js`

**Estimated diff size**: ~450 lines, two thirds of it tests

```js
// runner.js
// The claim's heartbeat_seconds and the beat's interval, one value. REPORT-143's rules bound it at 30 to 120.
export const HEARTBEAT_SECONDS = 60;
export const LOST_RUN_REASON = "The machine running it stopped before the run finished; run it again.";

// Injected so the tests fire beats by hand: the loop's `sleep` advances a shared clock and
// records every call, which a timer running beside the loop would disturb.
// constructor: startTimer = (ms, fn) => { const t = setInterval(fn, ms); return () => clearInterval(t); }

#startHeartbeat(docs, docId) {
  let inFlight = null;
  const cancel = this.startTimer(HEARTBEAT_SECONDS * 1000, () => {
    if (inFlight) return;                                   // the last beat is unsettled
    inFlight = docs.beat(docId)
      .catch((err) => log.warn("heartbeat.failed", { error: err.message }))
      .finally(() => { inFlight = null; });
  });
  return { cancel, settled: async () => { cancel(); await inFlight; } };
}

// #runPackage, after the claim and the status document:
this.#run.heartbeat = this.#startHeartbeat(docs, docId);
...
  await heartbeat.settled();                                // stopped, and a beat in flight awaited
  await docs.done(docId, { … });                            // no bound: settled by the SDK (R44b)
} catch (err) {
  await heartbeat.settled();
  await docs.failed(docId, { pkg, error: err.message }).catch(…);   // likewise unbounded
}
// finally: the store is closed and `done` resolved only after the line above has settled.
```

```js
// terminate(), with a run outstanding:
this.#run.heartbeat?.cancel();                              // none yet while the claim is being written
await bounded(docs.failed(docId, { pkg, error: LOST_RUN_REASON }));   // no wait for a beat: one store sends its writes in order
...
const onlyIf = (doc) => doc?.microvm_id === this.microvmId;
// both of terminate()'s runner-document writes: `failed` on an unverified flush, and `terminated`
await this.status.writeFromHook("terminate", { state, ...this.#runningPackage() }, { onlyIf });
// #runningPackage(): { current_package: {class_hash, package_key} } from #run, or {} with none outstanding.
// suspend() spreads it into both of its writes too (R8, R22).
// writeFromHook logs terminate.runner_doc_skipped when the test fails, bounded at 10 s as before (R21).
// #runPackage starts no heartbeat once the VM is terminal, so a claim that lands after the hook gets no beats.

// #workLoop, after the suspended branch:
log.warn("idle.declined", { answer: idle });
idleSince = this.now();
```

`#plan`'s refusals keep their 10-second bound by wrapping `docs.failed` in `bounded`, since a refusal is no run's final write.

**Tests** (`runner.test.js` unless named; the fake timer records each `startTimer` and fires its callback on demand):
- The claim carries `heartbeat_seconds` equal to `HEARTBEAT_SECONDS`, and the timer is started at `HEARTBEAT_SECONDS * 1000`.
- Three ticks during a run write three merges holding exactly `platform_id` and `updated_at`; the result stays `running` at its stage.
- A tick while the last beat's merge is pending writes nothing; one after it settles writes again.
- A beat pending when the package finishes: `done` is not issued until the beat settles, and a tick after `done` writes nothing.
- With `mock.timers` on `setTimeout`, a `done` merge held pending past the 10-second status bound is still awaited: no runner-document write, no `/work` call, and the class store still open until it is released; then `ready` is written and the store closed.
- A `done` the store rejects is followed by `failed`, awaited the same way.
- A failed beat logs `heartbeat.failed` and the run ends `done`.
- `previous` on the queued result survives the claim (read mid-run), the finish, and a second run that fails, in that order.
- `/terminate` mid-run: the result reads the one reason, no tick writes after it, and the runner document reads `terminated` with `current_package` still naming the run; with the runner document's `microvm_id` set to another VM first, it is left as it was and `terminate.runner_doc_skipped` is logged, for the `terminated` write and for the `failed` one after an unverified flush.
- `/terminate` while the claim's write is still pending (no heartbeat yet): the hook revokes, flushes and writes `terminated`, and no beat is written after it.
- `/suspend` mid-run writes `current_package` naming the run on both its writes; `/suspend` while idle writes no `current_package`, which stays `null`.
- REVIEW B: the claim lands, the claim's runner-document write throws, then `/suspend`: the document reads `suspended` with `current_package` naming the run.
- `/idle` answering `run_in_progress` through two idle periods: `/idle` is called twice, eleven `/work` polls apart, with an `idle.declined` line each time, where without the reset it is called on every pass with no sleep.
- `memory-store.test.js`: `mergeIf` writes when its test passes and leaves the document when it fails.
- `firestore.emulator.test.js`: the claim with `heartbeat_seconds`, a beat, the finish, and `mergeIf` on the runner document both ways, against REPORT-143's rules as on `master`.

**Mutations to run**: the claim without `heartbeat_seconds` (the emulator suite); no skip while a beat is unsettled; the timer not cancelled before the final write; a beat in flight not awaited; the final write bounded; the store closed or `ready` written before the final write settles; the claim written with `set`, losing `previous`; `/terminate` without its `onlyIf` (on each of its two writes); `terminate()` reading the heartbeat without `?.`; a hook write without the run's `current_package`; the old terminate string; `idleSince` not reset on a declined answer.

**Verified**: built as `67daf8e`. The emulator suite, with the claim's `heartbeat_seconds`, a beat and `mergeIf` both ways, passes 5 of 5 against REPORT-143's rules on `master`. After the final review, 40 mutations covering this step, steps 6 and 7 and the review's fixes, each applied alone, fail a test in 39 cases (branch oob `stage-verification/implement-2026-10-14/mutations-all.py`); the claim written with `set` turns the unwritable-claim test, whose fault injection wraps `merge` only, into a busy loop, and fails `previous survives` run alone.

---

### Step 6: the CLUE pre-pull deleted

**Summary**: R56a's list, and what it leaves behind. With `pullData` gone the `pull` stage runs nothing, so `#steps` writes `prepare_package` and `run_package` only, and `makeStore`, `classTokens`, `firebaseProject` and `now` no longer reach the steps. `scope.json`'s `clue_source` is `"cc-data"` (R37), a constant in `package-env.js`. The counts write loses `clueDocuments` (R46). `preparePackage` hands the package uid its whole class data directory. `firebase-projects.js` keeps the two report-service projects (R56), and its header comment drops the CLUE pairing it used as its example.

**Files affected**:
- `runner/server/clue-reader.js`, `runner/test/clue-reader.test.js`: deleted
- `runner/server/steps.js`: `CLUE_SOURCE`, `CLUE_TOKEN_MARGIN_MS`, `clueToken`, `ClueTokenExpired`, `customTokenExpiry`, `pullData` and the `readClue` import deleted
- `runner/server/runner.js`: the `pull` stage, the `CLUE_SOURCE` import and the CLUE count
- `runner/server/status.js`: `counts` without `clueDocuments`
- `runner/server/package-env.js`: `CLUE_SOURCE = "cc-data"`; `RUNNER_OWNED` and `chownTree`'s skip deleted; the comments that name the CLUE reader
- `runner/server/package-fetch.js`: the `clue_prepull` type check deleted
- `runner/server/firebase-projects.js`: the two CLUE projects, `clueProject`, `clueProjectFor`, and `portalFirebaseApp` with each entry's row deleted (R56); the header comment says what the table is for without the pairing
- `runner/server/steps.js` also loses the `customTokenClaims` and `customTokenPayload` import and the `customTokenClaims` re-export, which only the CLUE token's expiry used
- `runner/smoke/smoke.mjs`: the `image` command's scope writes `clue_source: "cc-data"`, as the runner does (R37)
- `runner/smoke/package/manifest.json`: `clue_prepull` deleted
- `runner/server/firestore.js`: the `rtdb` getter, its emulator connection and the `firebase/database` import deleted
- `README.md`: the runner's line no longer names a CLUE reader
- Tests: `steps.test.js`, `firebase-projects.test.js` (no `portalFirebaseApp`), `package-env.test.js`, `package-fetch.test.js`, `runner.test.js` (its fake `/work` keeps a CLUE row in `class_tokens`, which rigse still sends until RIGSE-369), `firestore.emulator.test.js` (its `pull` stage write becomes `prepare_package`, and its counts write loses `clueDocuments`)

**Estimated diff size**: ~650 lines, almost all removed

**Tests**: `scope.json` carries `clue_source: "cc-data"`; a run writes the stages `starting`, `prepare_package`, `run_package` and `done`, in that order; the counts' `data` holds no `clue_documents`; a `/work` answer whose class tokens include a CLUE row runs its package with no extra store signed in; `knownProjects()` is exactly `report-service-dev` and `report-service-pro`; `preparePackage` chowns every entry of the class data directory, a `clue-documents` directory included.

**Verified**: `grep -rni clue runner --exclude-dir=node_modules` (the lockfile aside) finds only `clue_source` (`package-env.js`, its test, and `smoke.mjs`'s scope, which imports the runner's constant), `runner.test.js`'s CLUE token row, and two `package-env.test.js` fixtures: a `clue_documents` key `counts.json` ignores, and a `clue-documents` directory the package is now handed. `customTokenClaims` and `customTokenPayload` stay in `status.js` for `MemoryStore`, no longer exported. `npm test` passes 203; the emulator suite passes 5 of 5 against REPORT-143's rules on `master`.

---

### Step 7: the release's version, and the long-run smoke variant

**Summary**: `runner/package.json`'s version goes to `0.2.0`, and the Makefile's `VERSION` default reads it, so the release needs no `VERSION=` and the number lives once (R58, landing tracker 3.3a). It reads it with `sed`, not `node`, and stops on an empty value, since Node is not on every shell's `PATH` (this machine's non-interactive one included) and an empty `VERSION` would publish `runner-.zip`:

```make
VERSION ?= $(shell sed -n 's/^  "version": "\(.*\)",$$/\1/p' package.json)
ifeq ($(strip $(VERSION)),)
$(error VERSION is empty: package.json has no version line, and none was given)
endif
```

`smoke.mjs build --hold <seconds>` writes the hold into a `hold.txt` beside `run.py` and adds it to `expected_duration_seconds`, and `run.py` sleeps that long after its checks when the file is there (R52), for the run-over-65-minutes check. `build --version <v>` writes the built manifest's version, since report-server refuses a version it already holds (`packages.ex`, `:already_exists`) and every variant the rollout publishes is a new version. `stack --wait-minutes <n>` replaces the fixed 10-minute wait, for the `--hold` checks, and is checked before anything is queued. Since that wait can pass the hour its Firebase ID token lasts, `stack` refreshes the token through `securetoken.googleapis.com` when it has under 5 minutes left, and a failed read is logged and retried rather than ending the command, so the VM's id and `terminate-microvm` line always print. `build` refuses `--hold` without a `--version` other than the manifest's own, and a `--version` the catalog's grammar (`package-fetch.js`'s `VERSION`) refuses, before it stages anything. The smoke manifest's own version goes to `1.1.0`, since `run.py` changes and `projects/20/runner-smoke` 1.0.0 is published from the old one.

**Files affected**: `runner/package.json` and `runner/package-lock.json` (whose two root `version` lines npm keeps equal to it), `runner/Makefile`, `runner/smoke/smoke.mjs`, `runner/smoke/package/run.py`, `runner/smoke/package/manifest.json` (`1.1.0`), `runner/README.md` (where the version comes from, `--hold`, `--version` and `--wait-minutes`). `cloudformation/README.md`'s `VERSION=<x.y.z>` still overrides the default and stays as it is, so this pass still changes nothing in `cloudformation/` (R58).

**Estimated diff size**: ~60 lines

**Checks** (run): `make -n publish-artifact` names `runner-0.2.0.zip` with no `node` on `PATH`, `runner-9.9.9.zip` with `VERSION=9.9.9`, and stops with the error when `package.json` has no version; `smoke.mjs build --hold 4200 --version 1.1.1` twice, a second apart, gives one checksum, and its manifest declares version `1.1.1` and 4,500 seconds (the smoke package's 300 plus 4,200), with `hold.txt` beside `run.py`; a plain `build` gives `1.1.0` with no `hold.txt`; `--hold 0`, `--hold` without `--version` or with `1.1.0`, `--version ../../../escaped`, and a non-integer `--wait-minutes` are refused; `npm ci --dry-run` accepts the lockfile. `stack` against a stubbed `fetch` (branch oob `stage-verification/implement-2026-10-14/`): an ID token with 60 seconds left is refreshed and the new one used; one 503 on the result read is logged and the run still finishes `done` with the VM printed; a persistent 403 is reported by status.

---

## Rollout

By whoever releases the runner (the specs name no one beyond "the operator", RD-4 pass 1), **from the PR branch, before review and merge**, so anything the live stack shows is fixed in the same PR (requirements R58; Doug, 2026-10-08, channel #27). The PR is reviewed and merged after the checks below are recorded. Nothing here can be run from this machine, which has no AWS CLI and no credentials (`speccing.md`).

**Before the release** (requirements R58), all on staging:

1. RD-1's rollout has created `researcher-dashboard-runner-staging` in the QA account, with the broker's `packages-read` and the execution role at its logs from the start. Done 2026-10-08 (channel #32).
2. cc-data's `v0.3.0-pre.1` exists (REPORT-146 merged and tagged; it is in review as cc-data-cli PR #18). Until it does, the artifact's image build fails at `git clone --branch`.
3. REPORT-167 is deployed: the function 1.9.0, then report-server 1.13.0 to `report-server.concordqa.org` (its R28 order). Until then every patterned package is a failed claim attempt, since `applies` answers 404 (R35).
4. REPORT-143 is deployed from `master` to `report-service-dev` against the stack, by the one `firebase deploy` its functions README gives (`firestore:rules`, `firestore:indexes`, `functions:researcherDashboard`, `functions:researcherDashboardWatchdog` and `functions:deriveProfileWorker`; no `functions:api`), with `RD_BROKER_ROLE_ARN` set, the indexes built before the watchdog runs (landing tracker 2.6). Its live broker check passed and recorded. `report-service-dev` has the IAM Service Account Credentials API enabled and `researcher-dashboard@report-service-dev` holds `roles/iam.serviceAccountTokenCreator` on itself (report-service's `setup-researcher-dashboard-iam.sh apply`); until then `/work` answers 502 and this runner takes no work (REPORT-143 Q1).
5. RIGSE-367 and RIGSE-368 are on the staging portal with `RESEARCHER_DASHBOARD_FUNCTION_URL`, `RESEARCHER_DASHBOARD_FIREBASE_APP=report-service-dev` (row 1, `spike-plan.md` 3), and report-server staging carries cloud-formation PR #94's settings with `PackageBuckets` mapping the staging portal to the QA bucket and RD-1's packages writer key (RD-1's README, "What goes where"). `PackageBuckets` and the writer key were set 2026-10-08 (channel #34).
6. `node smoke/smoke.mjs image --class-id 590 --class-hash dca466d3fcb3322466b467c98c4d307c1871608cd9096e82`, from the branch head, with researcher A's report-server token, passes against staging's report-server. It needs no stack. It is also the check that material 604 is still in one of researcher A's projects (cohort 12): without that, report-server's Student Answers run never starts, and cc-data waits out its 30 minutes on a null state rather than failing (R53). Passed 2026-10-09.
7. The smoke package is built with `--any "*authoring.lara.staging.concord.org%2Fapi%2Fv1%2Factivities%2F1518.json"`, which matches only class 590's assignment URL, and published to staging's catalog as `official` by a portal site admin (`?official=true`), so it is runnable at once (Q11, Q15). First check that report-server staging's running image carries REPORT-142's publish code: it ran `1.12.0-pre.2` on 2026-10-08 (channel #34). Done 2026-10-09: report-server staging ran `1.13.0-pre.1`, where `wildfire-responses` had already published `official`. The publisher was `rd-release`, which holds the publisher role, with origin `projects/20`. The result is `projects/20/runner-smoke` 1.0.0, `catalog_id` 3, `sha256:250ccbe1…`, public and `official`; report-server's applies route offers it on class 590's URL and refuses it on class 223's.

**The release**, per `cloudformation/README.md`'s "Releasing the runner" (RD-4 pass 1) and "Updating a stack" (RD-1): terminate every live staging VM, publish the artifact from the branch head (`make publish-artifact ARTIFACT_BUCKET=concordqa-devops`, which publishes `runner-0.2.0.zip`, the version in `runner/package.json`), and apply a change set that overrides only `CodeArtifactKey` in `$PARAMS`, every other parameter keeping its value. The template is unchanged, since RD-1 created the broker's grant, so this is a runner release and nothing else.

**After the release**, recorded against this spec:

1. `RD_SMOKE_ACCESS_TOKEN=<token> node smoke/smoke.mjs stack --identity <origin>/runner-smoke --version <v> --class-hash <hash> --terminate` ends `done`, with launcher credentials for `--terminate` (requirements R52). The runner's log group shows `aws.default_chain_disabled`, `storage.credentials_fetched` and no `CredentialsProviderError`, and every line carries a non-null `microvm_id`, which answers whether `/run`'s body carries `microvmId`. That id equals `vms/{platform_user_id}`'s `microvm_id` and the claimed result's (morning review item 2b; `/work`'s 409 already requires it, requirements Technical Notes).
2. A VM left to drain logs `idle.suspended`, and its `/suspend` hook's lines follow. That answers REPORT-143's R1 (an API `SuspendMicrovm` delivers `/suspend`), if REPORT-143's own check has not already, to be written into REPORT-143's spec and `final-design.md` 7.2(b). A `lifecycle.resume_without_suspend` line would say it does not.
3. The Done-when, on staging: a VM suspended for more than an hour takes a new run and writes its result, with no `work.failed` 401 (the refresh token surviving the suspend); a suspend mid-run (`aws lambda-microvms suspend-microvm` with launcher credentials) leaves `current_package` set, and an idle one leaves it null; the smoke package published under two origins (`?origin=projects/<id>` and a user) runs in one queue; the smoke package rebuilt with `--any '*no-such-url*' --version <new>` is refused with "does not apply to this class" and report-server's reason; two researchers of the smoke class each get their own result, and the counts land on each one's scope document while `classes/{class_hash}` holds only the profile; a log line from a run names the researcher, the scope and the package. The ten-hour sentence is the runner's tests only: report-server refuses more than 7,200 seconds at publish, so no version over the ceiling can be queued on staging.
4. `smoke.mjs image` with a column the dataset lacks added to the package's list fails, which shows the gate fails when a column goes.
5. **Terminated mid-run** (REPORT-143's lease, Q13): a package running, `aws lambda-microvms terminate-microvm` with launcher credentials, and `get-microvm` polled every few seconds with its states and times recorded against the hook's log lines. The VM reads `TERMINATING` while the `/terminate` hook writes; the result reads `failed` with the one reason, written by the hook; the runner document reads `terminated` (or `failed` with an incomplete-sync reason) with `current_package` naming the run; and no later watchdog pass rewrites either.
6. **A run longer than 65 minutes**: the smoke package built with `--hold 3900 --version <new>` and run with `smoke.mjs stack --wait-minutes 90`. Its result's `updated_at` keeps moving past the session's first hour, so the class store refreshed its token for the beats, and it ends `done` with no `watchdog.result_failed`.
7. **Suspended mid-run, resumed from the dashboard**: the `--hold` variant, `suspend-microvm` while it runs, left suspended for more than an hour (inside the watchdog's declared duration plus 10 minutes), then RD-3's Resume. The beats after the resume go through the run's class store, whose ID token has expired by then and which R20's forced refresh does not cover, so this is the check that the SDK refreshes it. `vms/`'s `resumed_at` is written before the resume, beats resume after it, and the result ends `done` with no `watchdog.vm_terminated` for that VM.
8. **`design.md` criterion 11 again**: terminated during a run, the next run launches a new VM and ends `done`.

Then the PR is reviewed and merged. A problem found above is fixed on the branch and the release repeated from its new head.

**What RD-1 then checks** (its R20, the one check RD-1 left open when it was marked Done, channel #50): this release's first VM is the stack's first working one, so RD-1's endpoint check runs on it, by `cloudformation/README.md`'s "A VM's endpoint": find the VM with your own credentials (the launcher cannot list VMs), then as the launcher `create-microvm-auth-token` must be refused and the endpoint must answer `403, Request missing authentication`. The result is recorded in `specs/RD-1-runner-stack.md` on `main` (its R20 item, pending under "Not Yet Implemented") and on RD-1 in Jira.

**Production** has no stack until RD-1 production. Before its first launch, production rigse needs `RESEARCHER_DASHBOARD_FIREBASE_APP=report-service-pro`, the runner's entry for that project (R56), and `report-service-pro` needs the same IAM change as step 4 above.

## Verification

Stage 5 built the whole plan in a scratch copy and ran it, on 2026-09-26 and again for the re-spec on 2026-10-08; nothing was applied to the worktree, whose `git status -s` shows only this spec folder.

- **The suite.** `npm test` in `runner/`: 197 tests, all passing, on Node 24.14.0. Each step was built alone on the one before and passed (139, 152, 197, 197), and step 4's tree is the whole build's.
- **Against REPORT-143's rules.** `firestore.emulator.test.js` passed, four tests, with the Firestore and Auth emulators from report-service's firebase-tools loading REPORT-143's rules, rebuilt from `9c1b665`'s `firestore.rules` and the rules hunk of its branch oob `stage5-throwaway-build.patch`: the runner's `FirestoreStore`, `RunnerStatus` and `ClassDocuments` wrote the status document, a claim, a stage, a finish and the counts, each came back with Firestore timestamps, and a second counts write holding only `answers` left only `answers` and `last_pull_at`. Output in `stage-verification/emulator-with-report143-rules.out`.
- **Mutations.** Seventy-three, each applied alone to the build and each failing the test file named, run with `--test-force-exit`. The 2026-09-26 set (`stage-verification/mutate.py` and `mutate.out`), 45 after dropping the two matcher mutations and moving three anchors: an `S3Client` on the default chain; `S3Backend` defaulting its client; the default chain left on; credentials not checked against the clock; a resume not marking them stale; an answer for another prefix accepted; `/run` without `microvmId`; a session token for another researcher adopted; a class token for another class used; the claim without `microvm_id`; the claim keeping the last display; client time for `updated_at`; the counts on the class's own document; `/resume` writing; `/suspend` writing `current_package`; no fresh ID token after a resume; the loop not checking its epoch; no flush before `/idle`; no ceiling; no window reserve; no applicability check; `/work`'s `package_key` trusted; old stores never closed; a status write failure failing the hook; the terminate string reverted; the fetch cache keyed by name; no inflate bound; symlinks accepted; `AccessDenied` not mapped; an unknown `urls` key accepted; the display truncated; output kept across runs; `RD_CLASS_HASH` back; the dataset named by version; the CLUE token by project id; no CLUE expiry check; the CLUE read without `clue_prepull`; `/refresh-token` back; output files read through links; a swapped output directory accepted; every idle poll rewriting `ready`; a run's lines without the scope; the context left set after a run; a renamed event name; hook failures not logged. The re-spec's fifteen (`mutate-respec.py` and `.out`, the last four run by hand): the counts merged rather than replaced; a 400 not a refusal; a refusal retried; the ceiling's floor dropped; the default not the contract's; a zero id accepted; a 65-character version accepted; report-server asked for a package with no patterns; `assignment_urls` sent in place of `scope_urls`; the profile's interactive URLs dropped; `MemoryStore.merge` shallow; an unanswered applies check never refusing the package; the applies failure logged under another event name; its `call` renamed; the revocation's `call` renamed. The second review's nine (`review-2026-10-08/mutate-review.py` and `.out`): a refusal not clearing the entry's count; a claim not clearing it; a resume not clearing it; no epoch check after the pre-`/idle` flush; a failed entry left in `queue`; the manifest not kept; report-server's yes not kept; `/run` not logging the chain's state; the fake function's `/idle` ignoring the queue. Then four for the process kill: no kill after a run; a failed `pgrep` read as none left; one kill and no recheck; no kill after a failed run.
- **The contract script.** Against a local HTTP server standing in for GitHub (`CONTRACT_SOURCE`): `check` passed on an identical file and failed, naming `contract:sync`, when the served `max_duration_seconds` became 7,300; `sync` then wrote it and `check` passed, and `npm test` failed on the ceiling's default, which is the chain meant to catch a contract change; a missing ref answered 404 and failed. Against GitHub itself, `check` fails with a 404 today, since REPORT-167's file is not on report-service's `master` yet.
- **Not run.** The image was not built, and the smoke `image` and `stack` commands were not run (step 4). Nothing ran against AWS, Firebase, a portal or report-server: the applies client is pinned against REPORT-167's contract as written, with a stub.

## Open Questions

Requirements Q11 was answered A at stage 8 (Doug, 2026-09-26); it shapes only the rollout's steps 5 and 6.

### RESOLVED: Judgment call: the in-memory store merges as Firestore does
**Options considered**: leave `MemoryStore.merge` shallow and pin the whole-map counts write only in the emulator suite; make it merge nested maps as Firestore's does.
**Decision**: The latter (stage 5, re-spec). Shallow, it replaced `data` whole whatever the runner called, so every runner test passed on the very write the emulator showed Firestore merges (requirements, re-spec verification). The emulator suite is skipped wherever the emulators are absent, so the default suite has to be able to fail on it. `memory-store.test.js` pins the behavior, and nothing else in the suite changed result.

### RESOLVED: Judgment call: the cc-data pin ships in step 4, not step 3
**Options considered**: with the package contract in step 3; with the smoke gate in step 4.
**Decision**: Step 4. Nothing in steps 1 to 3 runs cc-data, and the one check of the pin, `smoke.mjs image` comparing `cc-data version` with `CC_DATA_REF`, arrives in step 4, so the commit that moves the pin is the one that tests it.

### RESOLVED: Judgment call: the applies call is bounded at 30 seconds
**Options considered**: the function client's 15 seconds; 30 seconds; cc-data's 5 minutes.
**Decision**: 30 seconds. The runner sends `scope_urls` only, so report-server derives nothing and answers from a match over at most 1,000 URLs and 20 patterns; cc-data's 5 minutes covers the deriver's 270, which the runner never waits on. An answer that does not come in 30 seconds is a failed claim attempt (R35), so the cost of a slow report-server is a retry, not a refusal.

### RESOLVED: Low confidence: the vendored fixture's `limits` were written by hand
**Context**: REPORT-167's `fixtures/package-contract.json` is not committed. The build's copy takes the 19 identity, 14 version and 2 package-key cases from REPORT-167's throwaway patch and adds `limits: {max_url_length: 2048, max_duration_seconds: 7200}` from REPORT-167's spec, since the patch predates them. The copy the implementation commits has to be REPORT-167's merged file, byte for byte, whichever way requirements Q14 is answered.
**Options considered**:
- A) The implementation waits for REPORT-167 to merge and copies its file then. REPORT-167 is planned to merge before REPORT-143, which this pass's release already waits on.
- B) Commit the hand-built copy now and replace it when REPORT-167 merges.

**Decision**: A (stage 6). The release runs from the branch and waits on REPORT-167 deployed (requirements R58), which follows its merge, so A delays nothing that matters, while B commits a second, hand-made source of the contract that a later copy has to remember to replace. Step 3 can be written and tested against the throwaway copy and committed with the file `npm run contract:sync` writes once REPORT-167 has merged (requirements Q14).
**Changed at implementation** (Doug, 2026-10-09): B. Step 3 is committed with the hand-built copy, and the copy is replaced by `npm run contract:sync`'s output, amending step 3, once REPORT-167 merges. Nothing reaches `main` first: the release runs from the branch before the merge, and R58 makes `contract:check` passing one of its gates. *(Done 2026-10-09: REPORT-167 merged as report-service `9793e8f`, and step 3's copy is now `contract:sync`'s output. It differs from the hand-built copy only in `about` and the order of the two `limits` keys; every case and limit value is the same, and `contract:check` passes.)*

### RESOLVED: Judgment call: local paths keyed by the package key, not by nested identity directories
**Options considered**: `<workRoot>/home/<origin kind>/<origin id>/<name>`; `<workRoot>/home/<package_key>`.
**Decision**: The package key. It is one segment, the same string as the result document's id, reversible, and needs no ownership or search permission on intermediate directories, which the package user would otherwise need on each (the spike's `parentsBetween` exists for exactly that on the data root). The S3 key keeps the identity's slashes, since that is report-server's layout.

### RESOLVED: Judgment call: `/work` is asked again after every package, not once per batch
**Options considered**: run every package of one answer, then ask; ask after each package.
**Decision**: After each. Work appended while a package runs is then seen at once, each package writes with tokens minted seconds before it started (REPORT-143 R9), and a package the watchdog failed meanwhile is not run from a stale list. The cost is one `/work` per package, whose `packages` the runner re-plans; verified manifests and report-server's answers are kept (second review), so re-planning fetches and asks nothing it has already.

### RESOLVED: Judgment call: the counts write does not fail a run
**Options considered**: fail the result when the scope document's write fails; log it and finish.
**Decision**: Log it (`status.write_failed`, `write: counts`) and write the result `done`. The result is what the researcher asked for; the counts are a summary of the pull beside it, and the next run rewrites them.

### RESOLVED: Judgment call: the smoke package's patterns are set at build time
**Options considered**: patterns committed in the manifest; none committed, `--any` at build.
**Decision**: At build. The smoke class differs by stack (staging's is not recorded as permanent, requirements Q11), and a pattern committed for one stack's class would make the package refuse itself on another. Unset, the package applies everywhere, which is right for `image`, where nothing matches.

## Self-Review

Stage 7, run unattended. Roles: the reviewer of the four commits (does each stand alone), whoever runs the tests (can each named test be written against this harness), the operator releasing the runner, a Security Engineer, and the engineers building on what this runner writes (RD-1 pass 3, RD-3, REPORT-146, REPORT-147). Every claim about proposed code was checked by building it, in the scratch copy that stage 5 built, and each fix below was applied there, tested, and mutation-checked. Findings that did not survive were dropped.

### Security Engineer

#### RESOLVED: Root read the package's output through any link the package left
`readPackageResult` statted and read `display.md` as root, following links, from `/work/out/<key>`, which the package's uid owns, under `/work`, which the image handed to that uid (`chown package:package /work`, carried from the spike's `analysis:analysis`). A package could point `display.md` at a file only root can read, or swap its whole output directory for a link, and the runner would copy the target into a result the researcher's browser reads. Confirmed by a throwaway test: with the link in place, `readPackageResult` returned the target's text. The runner holds no secret on disk that a package lacks (the report-server token is the package's own, and the session tokens are in memory), so the loss is small, but reading root-only files is not the runner's to allow. Fixed as requirements R28a: `/work` stays root's, only the package's home and output are handed over, and `readOwnFile` refuses a directory that does not resolve to itself and opens each file with `O_NOFOLLOW`. Three tests and two mutations cover it. `main`'s runner reads `display.json` the same way, so this was not introduced here.

### The operator

#### RESOLVED: Every idle poll rewrote the status document
The loop wrote `ready`, `current_package: null`, `queue: []` after each empty `/work`, so a drained VM wrote the same document ten times per idle period, each a Firestore write with nothing new in it. Confirmed by counting the build's writes. Fixed: the loop remembers what it last wrote and writes `ready` once per drain; a resume forgets it, since `/suspend` wrote `suspended` in between. The watchdog's idle sweep reads the runner document's `updated_at` (REPORT-143 R18), and one write per drain still leaves the VM's own `/idle` at five minutes well ahead of the sweep's thirty.

#### RESOLVED: The function's launch record can overwrite the runner's `ready`
REPORT-141's `recordLaunch` writes `state: "starting"` onto the runner document after `RunMicrovm` returns, and nothing orders it against the runner's own `/run`. A slow record lands after `ready`. Checked against REPORT-143's branch (`ensure-vm.ts` `recordLaunch`) and the build: the runner's first `/work` is refused with 409 until the launch is recorded, and the first answer it does take writes `ready` again, since the loop has written nothing yet. So a late record is corrected within one retry, and the build needed no change for it. A test now pins it: the runner document set back to `starting` during the first 409's wait reads `ready` once the loop has drained.

### Whoever runs the tests

#### RESOLVED: A failed assertion left a test process hanging for eleven minutes
The terminate test held a package's promise open and released it at the end. A failed assertion skipped the release, leaving the package's in-VM bound (its declared 60 seconds plus 10 minutes) as a live timer, so `node --test` did not exit. Found when a mutation hung the file past the mutation script's timeout. Fixed with `try`/`finally`. The bound's timer is left as it is, since in production the HTTP server keeps the process alive anyway, and `main`'s comment on why it is not unref'd still holds.

#### RESOLVED: The emulator's first write outlasts a bounded status write
Recorded in the requirements' stage 4 verification: the emulator suite warms the emulator with one unbounded write, since its first write took 14.7 seconds. `make test-emulator` expects `firebase` on `PATH`, which this machine lacks; the suite was run with report-service's firebase-tools instead.

### The reviewer of the commits

#### RESOLVED: A profile that cannot be read kept a package in the queue, and the loop busy
`#plan` skipped a package whose class profile read threw, leaving it queued, so `/work` handed it out again and `/idle` declined to suspend. Confirmed in the build. Fixed: the failure counts toward R9's three attempts, after which the package is left, as an unwritable claim is.

### The engineers building on this runner

No finding survived beyond what the requirements already record for them (the `current_package` object, the cleared display on a claim, `queued_at` as the request's time, `counts.json`, `scope.json` and `RD_SCOPE_FILE`, the fixture's location, the display cap in bytes, and the production configuration). They are written into `speccing.md`. Checked: nothing in the four steps touches `cloudformation/`, so RD-1 pass 3's diffs apply unchanged on top.

### Re-spec review (stage 7, 2026-10-08)

Roles: the operator releasing the runner, whoever runs the tests, the reviewer of the four commits, and a Security Engineer. Each finding was confirmed in the throwaway build before it was written, and each fix was built, tested and mutation-checked there.

#### RESOLVED: The operator: a report-server outage held every affected VM awake until its cap
As built at stage 5, an applies check that got no usable answer counted as a failed claim attempt and, after three, left the package queued, which R9 turns into a VM polling at 30 seconds until its eight-hour cap, since `/idle` declines to suspend while work is queued. That was meant for the rare unwritable claim; a report-server outage would do it to every researcher whose queue holds a patterned package. Fixed in requirements R35 and step 3: the third failed check writes the result `failed` with a run-it-again reason, and the test now asserts the result fails, nothing is claimed and the VM reaches `/idle` (`idle.suspended` in the test's log). A mutation that never refuses fails it.

#### RESOLVED: Whoever runs the tests: a failing assertion could hang `npm test`
A failing assertion in some `runner.test.js` tests leaves a package's in-VM bound (its declared duration plus 10 minutes) as a live timer, so `node --test` waits instead of exiting: one mutation ran past ten minutes before it was killed. The 2026-09-26 review fixed one such test with `try`/`finally`; more exist. Fixed in step 3: `npm test` runs `node --test --test-force-exit`, which ends the run once the tests finish. With the same mutation applied, `npm test` now exits 1 in seconds; unmutated, it passes 187 tests as before.

No finding survived from the commit reviewer (steps 1 to 4 each pass alone, and step 4's tree is the whole build's) or the Security Engineer (the applies call carries the runner's own report-server token to the report-server it already revokes it at, and sends only manifest patterns and authored URLs, no student data).

### Review (second pass, 2026-10-08)

Roles: Senior Engineer, Security Engineer, DevOps Engineer, QA Engineer, the reviewer of the commits, and the next engineer reading this spec. Every finding was checked against the rebuilt throwaway build (`main` plus `pass1-step1.diff` plus the four step diffs, 139, 152, 187 and 187 tests re-measured) and, where it depends on another story, against that story's code: REPORT-143's implementation spec and branch oob patch, REPORT-167's branch oob patch, and rigse's `RIGSE-368-dashboard-api`. The throwaway checks are in the branch oob folder `stage-verification/review-2026-10-08/`. Dropped after checking: a pre-claim refusal leaving the last run's `display` beside a new version (REPORT-141's queue write replaces the result whole); `askApplies` reading `message` from report-server's error body (`render_error` writes `{error, message}`); the smoke `stack` command's request (rigse's `RunRequest` takes exactly `{packages: [{identity, version}]}` and the class from the token); a package finishing during `/terminate`'s flush writing `done` over the terminate failure (it did finish, so `done` is true).

#### Senior Engineer

##### RESOLVED: The claim-failure count is never cleared, so a package failed for an outage cannot run again on that VM
`#claimFailures` is keyed by class and identity, incremented by `#noteClaimFailure`, and never deleted, not on a resume and not when the entry's result is written. REPORT-143 re-appends a finished package with a fresh `queued` result when it is run again (its implementation spec, "A finished package is appended again"). So after R35's third failed applies check writes "run it again", running it again on the same VM finds the count at three: `#plan` skips it, it stays `queued`, and `/idle` answers `work_queued` until the VM's cap. A package that had two transient failures and then ran is failed by the first blip of a later run. Both shown by throwaway tests (A: the rerun stays `queued`; A2: the rerun fails on one 503). Suggested: clear an entry's count when the runner writes its result (`running`, `done` or `failed`) and on every resume, which is what R9's "in the same awake period" says; add both tests.
**Decision**: Resolved as suggested (no decision needed): the count clears on any result write for the entry and on every resume (R9). Three tests and three mutations.

##### RESOLVED: A loop stood down by a resume during its pre-`/idle` flush still calls `/idle`
`#workLoop` checks its epoch after `/work`, after adoption, after `#run.done` and after `/idle`, but not between `syncer.flushAndVerify("idle")` and the `/idle` call. If the VM is suspended while that flush runs (an operator, or the watchdog after repeated `/idle` 502s) and resumed, the old loop's flush finishes and it calls `/idle` beside the new loop. REPORT-143's `/idle` suspends whenever nothing is `queued`, and a running package's result is `running`, so a stale call suspends the VM mid-run. Throwaway test B: one `/idle` from the stood-down loop while the new loop's package is `running`. This is R12's race reached by a call started late rather than answered late. Suggested: `if (!this.#current(epoch)) return;` after the flush, and the same check between `#plan` and `#runPackage`; add test B.
**Decision**: Resolved as suggested: epoch checks after the flush and between `#plan` and `#runPackage` (R12). Test B kept; its mutation fails it.

##### RESOLVED: The status document's `queue` lists packages the same plan has just failed
`#runPackage` builds `queue` from `request.packages` minus the claimed entry, so a package `#plan` refused (applies, ceiling, fetch, window) in the same pass is written into `queue` after its result says `failed`, and stays there until the next status write. Throwaway test C: `queue` named `users__1__refused` while its result read `failed`. R8 asks for "the answer's remaining queued entries". Suggested: build `queue` from the plan's surviving candidates (and entries skipped without a write, which are still queued), excluding the claimed one.
**Decision**: Resolved as suggested: `#plan` returns the entries it wrote `failed`, and `queue` leaves them out (R8). One test, one mutation.

##### RESOLVED: Re-planning after each package re-fetches, re-unpacks and re-asks report-server for every remaining package
The judgment call "`/work` is asked again after every package" says re-planning "is a checksum per package". `fetchPackage` on a cached archive also inflates it through `unzip -p`, deletes and re-extracts the directory and re-reads the manifest, and `#plan` re-reads the profile and re-asks the applies route for every patterned package. Throwaway test E: four patterned packages gave 10 resolves and 10 applies calls, N(N+1)/2, so 210 of each for a queue at REPORT-143's cap of 20. It also multiplies the first finding's failure counting: during an outage every queued package is charged on every re-plan. Suggested: keep the verified manifest per checksum and the applies verdict per class, identity and version for the awake period, and correct the judgment call's text.
**Decision**: Resolved as suggested: the verified manifest is kept per identity, version and checksum for the VM's life, report-server's yes per class, identity and version until the next resume (R30, R34), and the judgment call's text corrected. Four packages now cost four resolves and four applies calls; two mutations.

#### Security Engineer

##### RESOLVED: A package's background process outlives its run and can write the next package's output
Every package runs as uid 1000, and `runSandboxed` uses `execFile`, which resolves when the direct child exits; nothing kills what the package left behind. Throwaway `daemon-check.mjs`: a detached child wrote its file a second after `execFile` resolved. Such a process can write `display.md` into the next package's output directory (chowned to the same uid by `preparePackage`), or swap that directory between `readOwnFile`'s `realpathSync` check and its `openSync`, since `O_NOFOLLOW` covers only the last component. The shared uid predates this pass, but this pass is what queues packages from different origins on one VM ("without touching each other's output", Done when), and R28a's aim is that a package cannot steer what root reads. Suggested: after each run, and before reading the output, kill every process of the package uid (`setpriv --reuid=<uid> ... kill -KILL -1`, which signals only that uid's processes) and wait until none remain; pin it through the sandbox's `exec` seam.
**Decision**: A, kill after every run (Doug, 2026-10-08), over a PID namespace per package, which a throwaway check showed fails open on a SIGTERM timeout (PID 1 ignores it; `review-2026-10-08/b-timeout2.mjs`), and over deferring it. Built in step 3 and stated in R28a; four tests, four mutations.

#### DevOps Engineer

##### RESOLVED: Nothing runs the runner's tests, and nothing schedules the monthly rebuild that runs `contract:check`
`.github/workflows/` holds `deploy-app.yml` on `main`, and RD-1 adds `cloudformation.yml` for the templates; no workflow runs `npm test` in `runner/`. R17's "a test that no S3 client is built without explicit credentials", the contract test and the sixty mutations protect only a developer who runs the suite. R6, R54 and Q14 rely on "the monthly rebuild" to catch contract drift between releases, and `final-design.md` 16 says the runner repository owns it, but nothing in either spec creates it. Suggested: `.github/workflows/runner.yml`, on pushes touching `runner/**` or `fixtures/**`, running `npm ci` and `npm test`, plus a monthly `schedule:` job running `npm run contract:check`. The smoke `image` command needs a report-server token and a 45-minute emulated build, so it stays an operator step that R54's README names with its owner.
**Decision**: The push job only (Doug, 2026-10-08): a scheduled monthly job is over-engineering, so the monthly rebuild, `contract:check` included, is a manual step the README names (R54). The push job is R54b, in step 4; a clean `npm ci` and `npm test` passed 197 tests with nothing else installed, and the workflow parses as YAML (no runner was available to execute it).

##### RESOLVED: `aws.default_chain_disabled` is logged at process start, not by `/run`
R16 says "`/run` logs `aws.default_chain_disabled`", and the rollout's first after-release check looks for it in the runner's log group. The build logs it in `index.js`'s `main`, which runs when the image is built and snapshotted (the `/ready` build hook), once per image rather than once per VM, and whether build-time lines reach the VM's log group is not recorded. No test pins either placement. Suggested: log it in `/run`, with the three environment values as evidence, and assert it in the S3-ordering test.
**Decision**: Resolved as suggested, in step 2: the switch stays at process start, and `/run` reads the process's environment and logs `aws.default_chain_disabled` or `aws.default_chain_enabled` (R16), pinned in the S3-ordering test through an injected `processEnv`.

##### RESOLVED: `make run-hook HOOK=run` cannot bring a local runner to `ready`
R54a's payload carries `session_token: "local"`, which `MemoryStore.claims()` reads as no claims, so `/run` fails R3's check. Before that, DIR mode fails sandbox verification on a laptop: `buildRunner` skips `startEgress` in DIR mode but not `netGuard`, so `/run` answers 500 with "Cannot open network namespace \"package\"" (run against the build; `main` has the same `netGuard` gap). Step 4's new Makefile comment says the hooks run with no AWS account or Firebase project. Suggested: an unsigned custom-token-shaped `session_token` carrying the researcher's claims, which `MemoryStore` reads as the tests' tokens do, and no `netGuard` in DIR mode; or drop R54a's claim and the comment.
**Decision**: B, delete `run-hook` and `RUN_PAYLOAD` (Doug, 2026-10-08), over making it work (a claims-carrying token, no `netGuard` in DIR mode and the developer's own report-server token, which still runs no package) and over correcting only its prose. Checked first: with those two changes a DIR-mode `/run` reached `ready`, and its `cc-data login` replaced the local user's staging credential with the payload's placeholder token. R54a now names only the smoke targets.

#### QA Engineer

##### RESOLVED: The fake function's `/idle` ignores the queue
`fakeFunction`'s `/idle` answers `suspended: true` unless a test queues another answer, while REPORT-143's answers `work_queued` whenever an entry is `queued`. So no runner test can see a VM held awake by a queued entry: the first finding's stuck package and R9's own loop both reach `idle.suspended` in the suite (R9's test terminates the runner after 20 polls instead). Suggested: answer `/idle` from the fake's queued entries as `/work` does, and assert in R9's test that `/idle` answers `work_queued` while the entry is left.
**Decision**: Resolved as suggested: the fake answers `work_queued` while anything is queued, and R9's test asserts the runner goes back to `/work` after it. Reverting the fake fails that test.

##### RESOLVED: The revocation's bound differs between the specs
R23 bounds the revocation at 10 seconds; this spec's hooks paragraph and the build (`TOKEN_TIMEOUT_MS`, 15 seconds) bound it at 15. Suggested: pick one and say it once. `/terminate` then spends up to 10 seconds on the result, the revocation's bound, an unbounded flush and 10 seconds on the status write within its 60.
**Decision**: Resolved at R23's 10 seconds, as `REVOKE_TIMEOUT_MS`; `TOKEN_TIMEOUT_MS` keeps bounding only the ID token.

#### The reviewer of the commits

##### RESOLVED: Step 3 could shed its self-contained parts
Step 3 is 2,884 lines added and 2,017 removed (measured, `git diff --shortstat` between the step 2 and step 3 trees). `runner.js` and `runner.test.js` alone are 2,385 of it and cannot be split, as "Why step 3 is one commit" says. About 600 lines can: the contract fixture, `contract.mjs` and `package-contract.test.js`; `askApplies` and its test; `firebase-projects.js`'s rows and `clueProjectFor`; and `MemoryStore`'s Firestore-shaped merge with `memory-store.test.js`. Each is used only by step 3's runner and passes the suite alone. Suggested: optionally land them as a step before step 3; the gain is a smaller step 3, not a small one.
**Decision**: B, keep step 3 whole (Doug, 2026-10-08). Measured on the current build, step 3 is 3,128 added and 1,984 removed; the carve-out, built on step 2 and passing alone (162 tests), is 471 lines, not about 600, since `MemoryStore`'s merge lives in `status.js`, which step 3 rewrites. Splitting it would save about 10% and add a commit whose code has no caller. Recorded in "Why step 3 is one commit".

#### The next engineer

##### RESOLVED: A quarter of the spec is the record of how it was made
`requirements.md` is 108 KB and `implementation.md` 63 KB. The stage 1, 3, 4 and re-spec verification logs, the three self-review rounds, the stage 8 table and the sixty-mutation inventory describe how the spec was checked, not what to build, and much of each resolved question restates its context. Suggested: at close, keep the requirements, technical notes, out of scope and one or two lines per resolved decision, and move the verification and review records to the PR description and the branch oob folder, where they already live.
**Decision**: B, leave it until close (Doug, 2026-10-08). Measured, the claim above overstates it: of 186 KB, the verification logs, review rounds and stage 8 table are about 46 KB (25%), and the resolved questions and judgment calls another 32 KB that could each shrink to a line or two. The detail is the implementer's working reference against the step diffs, and `dmartin:close-spec` writes the condensed `specs/RD-4-pass-2-pull-loop.md` and deletes this folder by default.

### Review (2026-10-14)

Steps 5 to 7 and the rollout, reviewed after the amendment (`0573e43`) with the roles named in requirements.md's Review (2026-10-14). Step 5's sketch was applied to a scratch copy of `runner/` (Node 24.14; `npm test` 198 passing with the terminate string's test updated), and the throwaway tests, diffs and outputs are in the branch oob folder `stage-verification/review-2026-10-14/`. Checked and dropped: `/terminate`'s failure write landing after a `done` still in flight (the hook's write is R44b's stated exception, and the window is one write's latency); the in-VM bound's race leaving a timed-out package's process alive until `runPackage`'s own timeout fires a few seconds later (step 3's behavior, and the next package's spawn follows a `/work`, an adoption and three writes); the 11 `/work` polls step 5 expects between declined `/idle` calls (read from the loop: the reset is followed by an immediate `/work` and ten 30-second polls).

#### RESOLVED: Senior Engineer: `/terminate` throws when it lands while the claim is being written
`#runPackage` sets `#run` before the claim, and the sketch starts the heartbeat only after the claim and the status document, so for up to their two bounded writes `#run.heartbeat` is undefined and `terminate()`'s `this.#run.heartbeat.cancel()` throws. The hook then answers 500 without revoking, flushing or writing the runner document, which loses the data the flush exists to keep. Verified: throwaway test REVIEW A (the claim's merge held pending, then `/terminate`) on the sketch threw `TypeError: Cannot read properties of undefined (reading 'cancel')` with no revocation and the runner document still `ready`; with `?.` it revoked, flushed and wrote `terminated`. Fixed in step 5's sketch: `heartbeat?.cancel()`, no heartbeat started once the VM is terminal, a test and a mutation.

#### RESOLVED: REPORT-143 contract owner: the sketch guards only one of `/terminate`'s two runner-document writes
R23 writes the runner document `terminated`, or `failed` after an unverified flush, both inside the `microvm_id` transaction. The sketch shows the `onlyIf` on one `writeFromHook` call, and `terminate()` on this branch has two (`runner.js`, the `failed` write on an unverified flush and the `terminated` write), so the unguarded one could overwrite a newer VM's document. Fixed in step 5: both writes take the guard, and the test covers both.

#### RESOLVED: The operator: the Makefile's `VERSION` default is empty without Node on `PATH`
Step 7's `VERSION ?= $(shell node -p …)` gives an empty `VERSION` when `node` is not on `PATH`, and `publish-artifact` then publishes `researcher-dashboard-runner/runner-.zip`, which the conditional put accepts the first time. Verified: `makefile-version.sh` in a scratch copy at `0.2.0`, run on this machine (whose non-interactive shell has no `node`): the sketch's `artifact-key` printed `runner-.zip`, and `runner-0.2.0.zip` only with Node 24 on `PATH`; the suggested `sed` read printed `runner-0.2.0.zip` without Node, honored `VERSION=9.9.9`, and stopped with the error when `package.json` had no version. Fixed in step 7.

#### RESOLVED: The operator: the rollout's smoke variants cannot be published or waited for
`smoke.mjs build` takes the version from the committed manifest (`1.0.0`, published as `projects/20/runner-smoke` 1.0.0) and ignores an unknown `--version`, and report-server refuses a version it holds (`packages.ex`, `:already_exists`), so the `--hold 3900` and `--any '*no-such-url*'` variants the rollout publishes "as a new version" need a hand edit. `stack` waits a fixed 10 minutes (`smoke.mjs` line 129), so the 65-minute check fails as a timeout. Step 7 also changes `run.py` under the published version. Verified: `smoke-version.out` (`build --version 1.0.1` built `runner-smoke-1.0.0.zip`). Fixed: R52 and step 7 add `build --version` and `stack --wait-minutes`, the smoke manifest goes to `1.1.0`, and rollout checks 3 and 6 use them.

#### RESOLVED: QA Engineer: step 6's file list and its grep check miss three places
`smoke.mjs` line 76 writes `clue_source: "firebase"` into the `image` command's scope, the smoke manifest declares `clue_prepull: false`, and `steps.js` imports `customTokenClaims` and `customTokenPayload` and re-exports the first only for the CLUE token's expiry (no other file imports them from `steps.js`). So step 6's `grep -rni clue` check would not hold as written, and two imports would be orphaned. Verified by grep on this branch. Fixed: step 6 lists them (and `portalFirebaseApp`, requirements R56), and the grep check names what remains.

#### RESOLVED: Engineers building on it (RD-3 pass 2's Resume): the class store's token after a long mid-run suspend is not checked
R20 forces a fresh ID token only for the session store (`#call`'s `force`), while R44a's beats after a resume go through the run's class store, signed in before the suspend. A suspend past an hour leaves that token expired, and if the SDK does not refresh it the beats fail and the lease, restarted by `resumed_at`, fails the run five minutes after the resume. Rollout check 3 covers a long suspend only on an idle VM. Fixed: rollout check 7 holds the suspend past an hour, inside the watchdog's declared duration plus 10 minutes for the `--hold 3900` variant.

## Stage 8: cross-reference with the requirements

Checked in both directions (2026-09-26, and again for the re-spec on 2026-10-08): each requirement against the step that implements it and the test that pins it, and each step against the requirement that asks for it. The re-spec's harness changes (`--test-force-exit`, `MemoryStore`'s Firestore-shaped merge) serve the tests rather than a requirement, and are recorded where they were found (stage 7, the judgment calls). Nothing was added to the plan or trimmed from the requirements to make them agree; the gaps are left as questions.

| Requirement | Where | Pinned by |
|---|---|---|
| R1 | Step 2 (`function_url` required), step 3 (`microvmId` required) | `/run` refusal tests |
| R2, R12 | Step 3 (`#workLoop`, `#call`), step 2 (the 15-second bound) | 409 and failure retry tests; the stale-`/idle` test; the function client's bound |
| R3 to R5 | Step 3 (`#signIn`, `#adopt`) | refused session and class token tests; the per-request stores test |
| R6, R7, R29, R33 | Step 3 (`#plan`, `checkScope`, `package-fetch.js`'s grammar, `fixtures/package-contract.json`) | `package-contract.test.js`; the grammar, `package_key`, fetch and refusal tests |
| R8, R46a | Step 3 (`#runPackage`, the drained write) | the status document tests; the write-once test |
| R9 | Step 3 (`#noteClaimFailure`) | the unwritable claim test |
| R10, R11 | Step 3 (the idle branch), `config.js` | the idle period, `work_queued` and unverified flush tests |
| R13 | Nothing to build; the runner writes only package keys and class hashes | the status document tests |
| R14 to R18 | Step 2 (`storage.js`, `backend-s3.js`, `config.js`, `index.js`), step 3 (`PackageUnreadable`) | `storage.test.js`; the S3 ordering test; the unreadable-archive test |
| R19 | Step 2 (the syncer starts after the pull-down), step 3 (after the post-resume fetch) | the S3 ordering test; the resume test (indirectly) |
| R20 to R24 | Step 3 (the hooks, `index.js`) | the hook tests; `server.test.js` |
| R25 to R27 | Step 3 (`#plan`'s window, the ceiling and `config.js`'s floor and cap, the race in `#runPackage`) | the window, ceiling and timeout tests; `config.test.js`; the default against the fixture in `package-contract.test.js` |
| R28, R28a, R30 to R32 | Step 3 (`package-fetch.js`, `package-env.js`, the Dockerfile) | `package-fetch.test.js`, `package-env.test.js` |
| R34 to R36 | Step 3 (`report-server.js` `askApplies`, `#plan`) | `report-server.test.js`; the applicability tests in `runner.test.js` |
| R37 to R41a | Step 3 (`package-env.js`, `steps.js`) | `package-env.test.js`, `steps.test.js` |
| R42 to R46 | Step 3 (`status.js`, `firestore.js`) | the result and counts tests; `firestore.emulator.test.js` against REPORT-143's rules |
| R47 | Step 1 | step 1's grep and suite |
| R48 | Steps 1 and 3 (`runner/`), step 4 (the README) | `grep -rni analys runner` finds nothing after step 3 |
| R49 | Step 3 (`setContext({scope, package})` for a run) | the run's-lines test (S8-Q1) |
| R50 | Steps 2 and 3 (the five event names) | the event-names tests (S8-Q1); `report_server.refused`'s `call` on both paths (S8-Q3) |
| R51 to R54, R54a, R54b | Step 4 | `build` run; `image` and `stack` not run (Verification); the workflow parsed, not executed |
| R60 | Step 4 (`Dockerfile`, `smoke.mjs image`'s version check) | not run: the tag does not exist (Verification) |
| R55 | Step 4 | the deletion |
| R56 | Step 3 (`firebase-projects.js`), step 6 (the CLUE projects removed) | `firebase-projects.test.js` |
| R56a, R37's `clue_source`, R46 without the CLUE count | Step 6 | the step's tests and its `grep` |
| R8's `current_package` rule, R11's declined answer, R23, R27, R43's `heartbeat_seconds`, R44's `previous`, R44a, R44b | Step 5 | step 5's tests; `firestore.emulator.test.js` against REPORT-143's rules on `master` |
| R52's `--hold`, R58's version | Step 7 | step 7's checks |
| R58, R59 | The Rollout section; no code | not runnable from here |

**R25's second check.** The requirement says the window is checked up front and "again before each claim". The plan re-plans every package after each `/work`, and `/work` is asked after every package (R7), so the check before each claim is the up-front check of the answer that claim comes from. It fails the package and the rest of that answer, as R25 says. This is by construction, not a gap.

| Step | Requirement |
|---|---|
| Step 1 | R47, R48 |
| Step 2 | R1 (`function_url`), R2's bound, R14 to R19 |
| Step 3 | R1 to R13, R20 to R46a, R28a, R49, R50, R56 |
| Step 4 | R48 (README), R51 to R55, R54a, R54b, R60 |
| Step 5 | R8, R11, R23, R27, R43, R44, R44a, R44b |
| Step 6 | R37, R43's stages, R46, R56, R56a |
| Step 7 | R52, R58 |

### RESOLVED: S8-Q3 (re-spec). `report_server.refused` is pinned only on the revocation
**Context**: R50 now names two report-server calls under one event, with `call` saying which. The event-name test triggered it only through a failed revocation, and the applies tests asserted the result document, so removing or renaming the applies path's log line left all 187 tests passing.
**Options**: A) pin the applies path's line (event, `call`, status, scope, package) in the report-server-unavailable test, and the revocation's `call` in the event-name test; B) leave it to code review and the staging logs.
**Decision**: A (Doug, 2026-10-08). Built: both assertions in `runner.test.js`, 187 tests, and three mutations (another event name, `call` renamed on each path) each fail.

### RESOLVED: S8-Q1. R49 and R50 are built but no test pins them
**Context**: R49 (every line of a run carries `researcher`, `microvm_id`, `scope` and `package`) is a Done-when sentence ("A log line from a run names the researcher, the scope and the package"), and R50 fixes five event names for later log-based metrics. Step 3 sets the context and emits the names, and no test would fail if it stopped. The rollout's staging check reads a run's line in CloudWatch, which covers R49 once, after the merge.
**Options**:
- A) Step 3 gains two tests: a run's `package.*` lines carry the four fields and a line after the run carries neither `scope` nor `package`; and the five event names are emitted on their triggers (a failed hook, a failed flush, a failed status write, a refused revocation, a failed package).
- B) Leave them to the rollout's staging check and the code review.

**Recommendation**: A. The names are a contract for whoever adds a metric later, and the Done-when sentence is otherwise checked only after release. Both tests capture stdout, as `steps.test.js` already does.

**Decision**: A (Doug, 2026-09-26). Built and run: two tests in `runner.test.js` and one in `server.test.js`, 178 tests in all at the time, and four mutations (the scope dropped from a run's context, the context left set after a run, a renamed event, `hook.failed` not logged) each fail one. Building them found that a test's own store must share the fake function's document tree, or a failed package reads as queued forever.

### RESOLVED: S8-Q2. Step 4 changes the Makefile, which no requirement names
**Context**: Step 4 rewrites `run-hook`'s `RUN_PAYLOAD` (it still carried the spike's `secret_name` and lacked `platform_id`, `report_server_url`, `report_server_token` and `function_url`, so after R1 `make run-hook HOOK=run` would fail `/run`) and adds `smoke-build` and `smoke-image` targets.
**Options**:
- A) Add a requirement: the Makefile's `run-hook` payload carries every field R1 requires, and the smoke gate has make targets.
- B) Keep the payload fix, which R1 implies, as part of step 4 without a requirement, and drop the two smoke targets as unasked.
- C) Keep both without a requirement.

**Recommendation**: A. The payload fix is implied by R1 and costs nothing to write down; the targets are how the monthly rebuild (R54) would call the gate.

**Decision**: A (Doug, 2026-09-26). Written as requirements R54a; step 4 is unchanged. Its payload half was reversed by the second review (`run-hook` deleted, Doug, 2026-10-08).
