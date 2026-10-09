# RD-1: the runner stack, keyless, at its final grants

**Jira**: https://concord-consortium.atlassian.net/browse/RD-1

**Status**: **Closed**, with live checks still to run (see "Not Yet Implemented")

## Overview

Bring the researcher-dashboard runner's CloudFormation template into this repository and create staging's runner stack in the QA account with its final permissions: report-service's function reaches AWS through two roles it assumes with its own Google identity (no AWS key), each VM's storage comes from a broker role narrowed to one researcher, the VMs' shared role writes its logs and nothing else, and report-server gets a write-only credential for publishing packages.

RD-1 was first spec'd (2026-09-25) as three passes, so that no running VM would break between grant changes. Two things made that plan wrong: the keyless launcher (Doug, 2026-10-06), which replaces the launcher user and key with roles the function assumes with a Google ID token, and the absence of any QA stack or runner able to use one, which left the pass boundaries protecting nothing (Doug, 2026-10-07). So the stack is created at its end state in one pass.

## Requirements

### The template

- **R1.** The template is `cloudformation/researcher-dashboard-runner.yml`, written fresh from the spike's (cloud-formation `RIGSE-365-researcher-dashboard-runner`, `38451b9`) rather than copied. Nothing changes in the cloud-formation repository.
- **R2.** One stack per environment: `researcher-dashboard-runner-staging` in QA, 816253370536, created by this story, and `researcher-dashboard-runner-production` in 612297603577, both in us-east-1. *(Production is deferred to the "RD-1 production" line.)*
- **R3.** The logical ids are `DataBucket`, `LogGroup`, `BuildRole`, `ExecutionRole`, `LauncherRole`, `BrokerRole`, `PackagesWriterUser`, `PackagesWriterKey` and `MicrovmImage`. Every create-only value is fixed so a later update replaces nothing: `BucketName` `researcher-dashboard-runner-${Environment}`, `LogGroupName`, the four `RoleName`s (`-build`, `-execution`, `-launcher`, `-broker`), the writer's `UserName` (`-packages-writer`), `PackagesWriterKey`'s `UserName` and `Serial: 1`, and `MicrovmImage`'s `Name`. No role has a `Path`. `DataBucket` keeps `DeletionPolicy` and `UpdateReplacePolicy` `Retain`.
- **R4.** The parameters are the spike's except `StatusBackend`, with the same names, types, defaults and allowed values, plus `FunctionServiceAccountUniqueId` (digits only, no default). The token audience is derived as `researcher-dashboard-runner-${Environment}`, the stack's name, not a parameter.
- **R5.** `MicrovmImage` resolves to the spike's values except `Description`, "Researcher Dashboard package runner (${Environment})", and `STATUS_BACKEND`, the literal `FIRESTORE`. The stack's description names what the stack holds.
- **R6.** The bucket is versioned, and has exactly two lifecycle rules: `AbortIncompleteUploads`, aborting incomplete multipart uploads after 7 days, and `ExpireOldVersions`, expiring noncurrent versions after 180 days and removing delete markers with nothing behind them. No rule expires a current object (`final-design.md` 12). *(Versioning and the second rule added in review, Doug, 2026-10-09.)*
- **R7.** The template lints clean with `cfn-lint` in `python:3.12-slim`.

### The function's identity

- **R8.** `LauncherRole` trusts the function as R10 states and grants exactly: `lambda:RunMicrovm` on the image and on `microvm:*`; `lambda:GetMicrovmImage` on the image; `lambda:GetMicrovm`, `ResumeMicrovm`, `SuspendMicrovm` and `TerminateMicrovm` on both ARN shapes; `lambda:PassNetworkConnector` on `HTTP_INGRESS` and `INTERNET_EGRESS`; and `iam:PassRole` on the execution role. Its permission policies grant no `sts:` action, and nothing in the template names `SHELL_INGRESS` or an auth-token action.
- **R9.** The stack defines no IAM user or access key for the function, and no output carries one. The only access key in the stack is the packages writer's.
- **R10.** `LauncherRole` and `BrokerRole` each have one trust statement: `Principal: {Federated: accounts.google.com}`, `Action: sts:AssumeRoleWithWebIdentity`, and `StringEquals` on `accounts.google.com:aud` and `accounts.google.com:sub`, both `FunctionServiceAccountUniqueId`, and on `accounts.google.com:oaud`, the stack's name. No other operator or principal. The stack creates no OIDC provider.

### The broker

- **R11.** `BrokerRole`, `MaxSessionDuration` 3600, has two inline policies and no managed policy: `researcher-data` (`s3:ListBucket` on the bucket with `s3:prefix` `StringLike` `researchers/*`; `GetObject`, `PutObject` and `DeleteObject` on `researchers/*`) and `packages-read` (`s3:GetObject` on `packages/*`, no list). This is the ceiling of every session.
- **R12.** The contract REPORT-143 builds against, recorded in `cloudformation/README.md` and in the stream's `speccing.md`: `AssumeRoleWithWebIdentity` on `BrokerRoleArn` with a token for the stack's audience, `DurationSeconds` 3600, no `PolicyArns`, and `Policy` exactly:

  ```json
  {"Version":"2012-10-17","Statement":[
    {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::<bucket>","Condition":{"StringLike":{"s3:prefix":"researchers/<id>/*"}}},
    {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::<bucket>/researchers/<id>/*"},
    {"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::<bucket>/packages/*"}
  ]}
  ```

  `<bucket>` is `DataBucketName`, and `<id>` the VM's verified `platform_user_id`, refused unless it matches `^[1-9][0-9]*$`. A session without the policy holds the whole ceiling, so no code path may omit it.

### The execution role

- **R13.** `ExecutionRole`'s one inline policy, `runtime`, holds exactly one statement: `logs:CreateLogStream` and `logs:PutLogEvents` on the log group's streams, `arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:${LogGroup}:log-stream:*`. No S3, no `lambda:`, no managed policy, no boundary, no policy attached from another resource. Its trust is the spike's.

### The packages writer

- **R14.** `PackagesWriterUser` has one inline policy with one statement, `s3:PutObject` on `packages/*`: no groups, managed policies, login profile or boundary.
- **R15.** `PackagesWriterKey` names the user by its literal name with `DependsOn: PackagesWriterUser` and `Serial: 1`, and is output as `PackagesWriterAccessKey` and `PackagesWriterSecretKey` for report-server's `PackagesAwsAccessKeyId` and `PackagesAwsSecretAccessKey`.
- **R16.** The writer's name and ARN are outputs.

### Outputs

- **R17.** The outputs are exactly `DataBucketName`, `MicrovmImageArn`, `ExecutionRoleArn`, `BuildRoleArn`, `LauncherRoleArn`, `BrokerRoleArn`, `PackagesWriterUserName`, `PackagesWriterUserArn`, `PackagesWriterAccessKey`, `PackagesWriterSecretKey` and `LogGroupName`. Each description names the setting it feeds.

### Tests

- **R18.** A Python `unittest` over cfn-lint's decoder (`cloudformation/tests/test_runner_template.py`), run by `cloudformation/check.sh` and by `.github/workflows/cloudformation.yml` on every change under `cloudformation/`, asserts R3, R6, R8 to R11, R13 to R15 and R17, and `BuildRole`'s grants (the artifact read and its logs), with exact comparisons, so a widened grant fails as surely as a lost one. Thirty-eight mutations (trust, launcher, launcher key, broker, execution role, writer, create-only values, an expiry rule), and seven more added in review (versioning, the two lifecycle rules, `BuildRole`, the execution role's log ARN), each fail exactly the test aimed at them, and all but one lint clean, so the tests and not cfn-lint catch the grants.
- **R19.** No runner, app or report-service code changes.

### Verification on staging

- **R20.** After the QA stack is created, its grants are checked with real calls, not `simulate-principal-policy`, by `cloudformation/README.md`'s "Checking the grants on a live stack":
  - The writer's key: a put under `packages/` succeeds; a put under `researchers/` and a get and a list under `packages/` are refused. *(Passed 2026-10-08.)*
  - As the function: a Google ID token for `researcher-dashboard@report-service-dev` with the stack's name as its audience, minted with report-service's `setup-researcher-dashboard-iam.sh id-token` while the operator holds OpenID Token Creator from its `grant-operator` (revoked afterward), is exchanged for `LauncherRole`, and `GetMicrovmImage` on the stack's image succeeds. A token for another audience is refused. *(Passed 2026-10-09, before the merge: the token was minted through `generateIdToken` with `grant-operator`'s role, which is all `id-token` wraps.)*
  - The broker, with the same kind of token: a session with the whole ceiling reads the probe archive and is refused a write, delete and list under `packages/`; a session under R12's policy for a test id writes and lists its own prefix, reads the archive, and is refused another prefix that holds an object. *(Passed 2026-10-09, before the merge: the token was minted through `generateIdToken` with `grant-operator`'s role, which is all `id-token` wraps.)*
  - The execution role's only inline policy is `runtime` with R13's statement, and it has no attached policy. *(Passed 2026-10-08.)*
  - A VM's endpoint, on the stack's first VM: as the launcher, `create-microvm-auth-token` is refused, and the endpoint answers `403, Request missing authentication`. *(Pending, see "Not Yet Implemented".)*
- **R21.** The rollout also audits who can act as the function in GCP IAM in report-service-dev and report-service-pro: holders of OpenID Token Creator or Token Creator on the `researcher-dashboard` account, and who may deploy functions that run as it. *(Done 2026-10-09. Its one finding was accepted, see Decisions.)*

### Deployment and documentation

- **R22.** `cloudformation/README.md` documents creating and updating a stack by a change set from the head of the pull request's branch before it merges, named `git-<sha>`, after diffing the deployed template against `main`'s; a new account's prerequisites; what each output feeds; rotating the writer's key; the broker's session policy; the live checks; and the one-time move of staging to QA. That move ran on 2026-10-08, from the branch:
  1. The spike's stack in 612297603577 retired: stack, bucket (184 objects of staging-portal test data and the spike's `scripts/` packages), roles, launcher user and key, image and log group, each checked gone.
  2. The runner artifact published to `s3://concordqa-devops/researcher-dashboard-runner/runner-0.1.0.zip`.
  3. The QA stack created by change set `git-742f98f`, `CREATE_COMPLETE`, image version 1.0. A first attempt an hour earlier rolled back on `DataBucket` with a 409 because S3 had not yet released the name, though `head-bucket` already answered 404; the README now says so.
  4. report-service-dev repointed by report-service #433 (merged as `688819a`). *(Not deployed: `researcherDashboard` is not deployed on report-service-dev, and its first deploy belongs to REPORT-143, which adds the broker's setting.)*
  5. `report-service-qa` given `PackageBuckets` (`{"learn.portal.staging.concord.org": "researcher-dashboard-runner-staging"}`, keyed by portal host) and the writer's key by a parameter-only update; task definition `report-server:100` rolled out and the server answers 200.
  6. R20's writer and execution-role checks passed. *(The rest of R20 except the endpoint check, and R21's audit, ran 2026-10-09; see item 8.)*
  7. After review, 2026-10-09: change set `git-5947976` updated the stack in place (versioning and `ExpireOldVersions` on `DataBucket`, the execution role's log-stream ARN; the other three IAM principals only re-evaluated, nothing replaced), `UPDATE_COMPLETE`, and the writer and execution-role checks passed again. The writer's probe object, put before and after, now has two versions.
  8. 2026-10-09, as the function (`grant-operator` taken and revoked around it): the token's claims are `aud` the stack's name and `azp` and `sub` both `101230238764588293065`. The launcher reads the image and is refused `list-microvms` and S3; a token for `not-researcher-dashboard-runner-staging` is refused by both roles; the broker's whole-ceiling session and its session under R12's policy pass every check, and the ceiling session is also refused deleting an object version. The probe objects and all their versions were then removed. R21's audit's one finding was accepted (see Decisions).
  9. 2026-10-09, a launch as the launcher, with the function's token: `RunMicrovm` on image version 1.0, passing the execution role and `INTERNET_EGRESS` by its full ARN, succeeded, so `RunMicrovm`, `iam:PassRole` and `PassNetworkConnector` hold together. The 0.1.0 runner's `/run` hook answered 500 to the empty payload, so the platform terminated the VM before the endpoint check could run; the runner's log line reached the stack's log group, so the execution role's log grant works, and the VM record lists an ingress connector nobody passed. `TerminateMicrovm` as the launcher succeeded. **For report-service:** `RunMicrovm` refuses a connector named `INTERNET_EGRESS` (`ValidationException: Malformed network connector ARN`), which is what `microvm.ts` on `master` passes and `microvm.test.ts` pins; it takes `arn:aws:lambda:<region>:aws:network-connector:aws-network-connector:INTERNET_EGRESS`.
- **R23.** The repository README's layout lists `cloudformation/`.

## Technical Notes

- **Create-only properties** (cfn-lint 1.57.0's us-east-1 schemas): `AWS::Lambda::MicrovmImage` `Name`; `AWS::IAM::AccessKey` `UserName`, `Serial`; `AWS::IAM::User` `UserName`; `AWS::IAM::Role` `Path`, `RoleName`; `AWS::S3::Bucket` `BucketName`; `AWS::Logs::LogGroup` `LogGroupName`. Trust policies, inline policies, `Description` and `MaxSessionDuration` update in place.
- **A literal name, not a `Ref`, for a resource an update may modify.** A change set can list a property that `Ref`s a resource the same update modifies as `Replacement: Conditional`. The README stops on any replacement, and a replaced key breaks report-server, so `PackagesWriterKey` names its user literally.
- **Google's claims and AWS's condition keys.** A service account's ID token carries its numeric unique ID in `azp` and `sub`, and the requested audience in `aud`. AWS maps `azp` to `accounts.google.com:aud` and `aud` to `accounts.google.com:oaud`, and does not enforce a `sub` condition for Google, so the template must. The account must never be recreated: a new one gets a new unique ID, which both roles refuse until the stack is updated.
- **IAM action names**: the MicroVM actions authorize against the `microvm-image` resource type; the spike's `microvm:*` ARN stays beside it because the spike proved the pair with real calls. `PassNetworkConnector` lists no resource type.
- **`AdditionalOsCapabilities` accepts only `ALL`** (cfn-lint's schema enumerates nothing else), so the VM holds every capability. The runner needs `CAP_SYS_ADMIN` for the packages' network namespaces, and the package itself runs with none (`runner/server/sandbox.js`, `--bounding-set -all`).
- **What a leaked writer key can do**: overwrite a published archive, but not change what runs, since the runner checks every archive against the catalog's checksum.
- **What an escaped package can reach**: the execution role's credentials write lines to the runner's own log group and nothing else, so the sandbox check (`verifySandbox`) stays.
- **`packages/` read is not per researcher** (Doug, 2026-09-25): any VM on a stack can read every published archive. A missing archive reads as `AccessDenied`, since nothing lists `packages/`.
- **report-server takes one `PACKAGES_AWS_*` pair for every bucket**, so a per-stack writer serves one bucket. A second production runner stack for the NGSS portal would need more.
- **S3 bucket names release slowly across accounts.** A name deleted in one account was refused to another for most of an hour, while `head-bucket` already answered 404. A failed create leaves a `ROLLBACK_COMPLETE` stack to delete before retrying.

## Out of Scope

- The session policy's code and `/storage-credentials`: REPORT-143.
- Moving the runner onto broker credentials, and identity-keyed archive keys: RD-4 pass 2. The prefix rename: RD-4 pass 1.
- The production stack: RD-1 production.
- Changes to cloud-formation, and report-service code; the README says what to set and the operator sets it.
- Creating or granting the GCP service accounts: report-service's `setup-researcher-dashboard-iam.sh`, already applied in both projects.
- The OIDC acceptance gate from the deployed function: a sprint 28 ops step (`plan.md`).

## Not Yet Implemented

The endpoint check runs after the merge (Doug, 2026-10-08, "When does the branch merge"), with `cloudformation/README.md`'s "Checking the grants on a live stack", and its result is recorded on RD-1 in Jira. A problem it finds is fixed by a follow-up pull request, applied from its branch before it merges.

- **R20, a VM's endpoint** (`create-microvm-auth-token` refused as the launcher, and the endpoint answering `403, Request missing authentication`): waiting for the stack's first VM, which RD-4 pass 2's runner brings when it is released to the QA stack.
- **`BuildRole`'s logs grant narrowed** from `/aws/lambda-microvms/*` to this stack's log group: deferred from review (Doug, 2026-10-09). QA shows only the stack's own group, but only an image build proves the build writes nowhere else, and a wrong guess fails the next runner release.
- **The production stack** (R2): deferred to the RD-1 production line, from the same README with `FunctionServiceAccountUniqueId` from report-service-pro (`114768968256413137012` on 2026-10-07).

## Decisions

### Requirements

#### What audience does the function's token carry, and where is it set?
**Context**: The audience appears in both trusts and in the function's `RD_AWS_AUDIENCE`; it binds the token to this use. `oidc-launcher-plan.md` called it a per-environment parameter.
**Options considered**:
- A) A `FunctionAudience` parameter with no default.
- B) Derived in the template as `researcher-dashboard-runner-${Environment}`, the stack's name.
- C) One fixed value for every environment.

**Decision**: B (Doug, 2026-10-07). A derived value cannot drift from its stack and removes a value the operator types twice.

---

#### Does `StatusBackend` stay a parameter?
**Context**: The spike's `StatusBackend` allows `LOG`, which can no longer bring a VM to `ready`.
**Options considered**:
- A) Drop the parameter and fix the image's `STATUS_BACKEND` to `FIRESTORE`.
- B) Drop both and rely on the runner's default.
- C) Keep it.

**Decision**: A. No stack may run with `LOG`, and fixing the variable keeps the image's environment as RD-4 pass 2 describes it without leaning on a default in another file.

---

#### When does the branch merge, given that some live checks cannot run yet?
**Context**: Infrastructure is applied from the pull request's branch before the merge (Doug, 2026-10-08). The checks as the function wait on REPORT-143, which waits on REPORT-167; the endpoint check waits on RD-4 pass 2.
**Options considered**:
- A) Merge once the stack exists and the writer and execution-role checks pass; the rest run after the merge, with any fix in a follow-up pull request applied the same way.
- B) Hold the branch until the checks as the function pass.
- C) Hold it until every check passes.

**Decision**: A (Doug, 2026-10-08). The create and the checks that can run catch replacements, malformed grants and a failed build; the trust conditions are pinned by the template tests; nothing uses the roles until REPORT-143 is deployed; and holding would hold RD-4 behind REPORT-167. In the event, the checks as the function ran before the merge too (2026-10-09), once it was clear they need only `generateIdToken` and `grant-operator`, both available on report-service's `master`.

---

#### The endpoint 403 check waits for the stack's first real VM
**Options considered**: launch a VM by hand during the rollout; check it when RD-4 pass 2's runner first runs on the stack.

**Decision**: Wait. Today's runner fails its `/run` hook on this execution role, so a hand launch may not leave a VM to probe, and the template test already proves no auth-token grant exists.

---

#### The Done-when about a VM surviving the change is void
**Options considered**: launch a VM and change the role under it; record the clause as void.

**Decision**: Void. The role is created without S3, so no update happens under a running VM. RD-4 pass 2's first staging run on broker credentials shows syncing instead.

---

#### Keep the check that a token for the wrong audience is refused
**Context**: The refusal rests on AWS's documented mapping of Google's `aud` to `oaud`, which no call had exercised.
**Options considered**:
- A) Keep the check; if the token is not refused, the trust is wrong.
- B) Drop it and rely on the template test.

**Decision**: A. The test proves what the policy says, not what AWS does with it, and the check costs one command. Confirmed 2026-10-09: both roles refuse a token for another audience.

---

#### The Firebase Admin SDK account can mint the function's tokens
**Context**: R21's audit (2026-10-09). In both report-service projects, `firebase-adminsdk-…` holds `roles/iam.serviceAccountTokenCreator` project-wide, Firebase's default grant, which includes `getOpenIdToken` on the function's account, and it has user-managed JSON keys (three in report-service-dev, 2019 to 2022; five in report-service-pro, 2020 to 2022). A holder of one could assume `BrokerRole` without a session policy. Otherwise only the owners can mint the account's tokens, and the editors and Google's default accounts can deploy code that runs as it.
**Options considered**:
- A) Leave it.
- B) Narrow the Admin SDK account's Token Creator to itself, and delete its old keys.

**Decision**: A (Doug, 2026-10-09): no need to tighten it.

---

#### Ethan McElroy's review of the pull request (2026-10-09)
**Context**: An approving review with ten findings, several of which the spec had already decided the other way.
**Decision** (Doug, 2026-10-09):
- Fixed: the README's endpoint check lists the VM with the operator's own credentials, since the launcher cannot list VMs; the failed-create recovery deletes the kept bucket; `BuildRole` gets an exact test; the capabilities comment says `ALL` grants every capability; the execution role names its log streams' ARN directly.
- Added: versioning on the data bucket, with noncurrent versions expiring after 180 days, the window 26 of the 28 Concord buckets with a rule for old versions use (surveyed 2026-10-09), and no Glacier step, which costs more than it saves on small files and delays a restore. A broker session can no longer destroy a researcher's file, since nothing holds `s3:DeleteObjectVersion`.
- Kept as decided: the writer's key stays a stack output (pass 1 Q3; report-server's task definition is its own template's concern); one audience for both roles (stage 8; the function reads one `RD_AWS_AUDIENCE`); CI on `push` only, as `deploy-app.yml` runs.
- Deferred: narrowing `BuildRole`'s logs grant (see "Not Yet Implemented").
- Declined: retaining the log group, which would leave a second fixed name to block a retried create.

---

#### Decisions carried from the 2026-09-25 specs
**Decision** (Doug, 2026-09-25, unless noted):
- Applied by hand as a change set, not by a workflow with IAM rights or cloud-formation's `create-stack`; from the pull request's branch before the merge, so a problem the live stack shows is fixed in the same pull request (Doug, 2026-10-08).
- Staging moves to QA as a new stack, the spike's is retired and its bucket deleted, and the QA bucket keeps the name (Doug, 2026-10-08, kept when S3's slow name release delayed the create by an hour).
- The app stays on `models-resources`, with no bucket or CloudFront of its own.
- The writer's key is a stack output, following `token-service.yml`; no Secrets Manager.
- No session tag: the session policy is the only narrowing, and REPORT-143's tests and source guard catch its omission.
- The session policy grants all of `packages/*`; no committed policy file; no list on `packages/`; `packages-read` is its own inline policy.
- The launcher's action set is pinned exactly; the execution role keeps its log grant.
- No alarms, session cost not measured, CloudFront logging accepted.
- A Python test over cfn-lint's decoder, run in CI.

---

#### Self-review findings that changed the requirements
**Decision**:
- R8 forbids `sts:` actions in the role's permission policies only, since the trust statement's action is `sts:AssumeRoleWithWebIdentity`.
- The rollout names the setup script's `check` as the source of `FunctionServiceAccountUniqueId` and gives both projects' values with their date, since a recreated account changes them.
- Retiring the spike's stack breaks only the spike's `/run_package` route on report-service-dev's `api`, since `researcherDashboard` is not deployed there.
- The broker's checks assume the role with the function's Google token, not as a launcher user.

---

### Implementation

#### Grants land in the template step, and their tests in the next
**Options considered**: one step with the template and every test; the spike's grants first, then diffs to the final ones; the template with its non-grant tests, then the grant tests.

**Decision**: The last. One step is too large to review in a sitting, and a carry-over step would add a launcher user only to delete it.

---

#### The live checks set credentials by `eval` in subshells
**Options considered**: separate profiles in `~/.aws/credentials`; exported variables in the operator's shell; an `assume` helper whose exports are `eval`ed inside `( ... )`.

**Decision**: The helper in subshells. Nothing is written to disk, no session leaks into the next check, and each block reads as the principal it tests. The section runs with the stack account's credentials, which `out` needs to read the outputs.
