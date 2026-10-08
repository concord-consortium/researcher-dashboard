# RD-1: the runner stack, keyless, at its final grants

**Jira**: https://concord-consortium.atlassian.net/browse/RD-1 (researcher-dashboard: the runner and app stacks)
**Repo**: https://github.com/concord-consortium/researcher-dashboard
**Branch**: `RD-1-runner-stack`, parent `main`, child `RD-4-pass-1-packages-prefix`
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Bring the researcher-dashboard runner's CloudFormation template into this repository and create staging's runner stack in the QA account with its final permissions: report-service's function reaches AWS through two roles it assumes with its own Google identity (no AWS key), each VM's storage comes from a broker role narrowed to one researcher, the VMs' shared role writes its logs and nothing else, and report-server gets a write-only credential for publishing packages.

## Project Owner Overview

The dashboard runs researchers' packages on Lambda MicroVMs, and the AWS resources behind that (the bucket, the MicroVM image, the roles and one IAM user) are defined by one CloudFormation stack per environment. The spike's stack lives only on an unmerged cloud-formation branch and sits in the production account. This story moves the template here, retires the spike's stack, and creates staging's in the QA account, beside staging's report-server.

The stack is created at the permissions the design ends with, in one step. The function that launches VMs holds no AWS key: it proves its identity with a Google token, which closes the never-expiring key the spike used. A package that escapes its sandbox finds no access to anyone's data, because every VM's storage credentials are scoped to its own researcher. And report-server can publish packages into the bucket and do nothing else. RD-1 was planned as three passes so that no running VM would break between them, but no QA stack exists yet and nothing runs on it until the runner's pull loop ships, so the steps protect nothing and the work lands at once (Doug, 2026-10-07).

## Background

**What this replaces.** RD-1 was spec'd on 2026-09-25 as three passes: pass 1 (`bb1caa2`, `specs/RD-1-pass-1-broker-role-and-resume/`), pass 2 (`d02dfdc` on `RD-1-pass-2-packages-session-policy`) and pass 3 (`ac3c265` on `RD-1-pass-3-drop-execution-role-s3`). Two things since make that plan wrong:

- **The keyless launcher (Doug, 2026-10-06; `final-design.md` 11.4, `oidc-launcher-plan.md`).** The function runs as `researcher-dashboard@<project>.iam.gserviceaccount.com` and exchanges a Google ID token with `sts:AssumeRoleWithWebIdentity`. `LauncherUser`, `LauncherKey` and `LauncherBrokerPolicy` become one `LauncherRole`, and `BrokerRole` trusts the Google identity directly. report-service's side is merged: `functions/src/researcher-dashboard/aws-credentials.ts` on `master` (`e07b985`) builds every AWS client from `fromWebToken` with a fresh token per refresh, and `config.ts` reads `RD_LAUNCHER_ROLE_ARN` and `RD_AWS_AUDIENCE`, both still empty in `.env.report-service-dev` and `.env.report-service-pro`. The accounts exist: `researcher-dashboard@report-service-dev` has unique ID `101230238764588293065`, and `@report-service-pro` `114768968256413137012` (read with `gcloud iam service-accounts describe`, 2026-10-07).
- **One pass (Doug, 2026-10-07).** The pass boundaries existed so that no running VM on a live stack would break between grant changes. No QA stack exists, nothing on QA can do useful work until RD-4 pass 2's runner (which takes every S3 client from `/storage-credentials`), and production was already to be created at the end state. So the QA stack is created with pass 2's broker ceiling and pass 3's execution role and launcher in it.

Every 2026-09-25 decision of the three specs stands unless one of these voids it (see "Decisions carried").

**The spike template.** `researcher-dashboard-runner.yml` on cloud-formation's `RIGSE-365-researcher-dashboard-runner`, last template commit `38451b9`. It defines `DataBucket`, `LogGroup`, `BuildRole`, `ExecutionRole`, `LauncherUser`, `LauncherKey` and `MicrovmImage`, with ten parameters. Its stack, `researcher-dashboard-runner-staging`, is in the production account 612297603577 (`UPDATE_COMPLETE`, last updated 2026-09-21, read 2026-10-07). No stack of that name exists in QA, 816253370536.

**What calls the launcher's actions.** The function on report-service `master` (`microvm.ts`) calls `GetMicrovmImage`, `GetMicrovm`, `RunMicrovm` (passing only `INTERNET_EGRESS`) and `ResumeMicrovm`. REPORT-143 adds `SuspendMicrovm` (`/idle`, the watchdog), `TerminateMicrovm` (the watchdog) and the broker. Nothing calls `CreateMicrovmAuthToken` except the spike's `api` on `report-service-dev`, which dies with the spike stack in this story's rollout and which REPORT-143's dev deploy redeploys (RD-1 pass 3 Q3). `AssumeRoleWithWebIdentity` is an unsigned STS call, so the launcher needs no `sts:` grant to reach the broker.

**What the runner does with S3.** On `main`, `runner/server/sync/backend-s3.js` builds `new S3Client({})` on the default chain, which is the execution role, for `/run`'s pull-down, the syncer and the package fetch (from `scripts/`). On a stack whose execution role has no S3 it fails `/run` at the first pull (checked in RD-1 pass 3's stage 4). That costs nothing here: the function on `master` no longer dispatches into a VM, so no runner before RD-4 pass 2's can do work on any stack, and RD-4 pass 2's builds every S3 client from broker credentials.

**Facts checked against the accounts (2026-10-07, read-only).**
- Lambda MicroVMs answer in QA: `list-managed-microvm-images` returns `al2023-1`, whose latest version is `1`, the template's `BaseImageVersion` default; `list-microvm-images` and `list-microvms` are empty.
- `concord-devops`, the spike's `CodeArtifactBucket`, is in the production account and refuses QA's admin role (no bucket policy). QA has `concordqa-devops`, in us-east-1. So staging's artifact is published there (`make publish-artifact ARTIFACT_BUCKET=concordqa-devops`). The latest spike artifact is `runner-0.22.0.zip`.
- report-server's QA stack, `report-service-qa`, has `PackagesAwsAccessKeyId`, `PackagesAwsSecretAccessKey` and `PackageBuckets`, empty: cloud-formation #94 is merged (`4aa6b8a`) and applied, so handing over the writer's key is a parameter-only update.
- The AWS CLI's MicroVM commands are under `aws lambda-microvms`, not `aws lambda` (CLI 2.36.17). The flag names RD-1 pass 3's README guessed (`--image-identifier`, `--microvm-identifier`, `--expiration-in-minutes`, `--allowed-ports`) are the real ones.

## Clauses covered

How each clause of RD-1's Jira description is met. The description still describes three passes and a launcher user; it is rewritten after this spec (`oidc-launcher-plan.md`, order of work step 5).

| RD-1 clause | Where | Note |
|---|---|---|
| The template lives here at `cloudformation/researcher-dashboard-runner.yml`, written fresh, applied by hand as a change set from the head of its pull request's branch, before the merge | R1, R22 | |
| One stack per environment in its report-server's account; staging anew in QA, the spike's retired | R2, R22 | |
| Launcher: add `ResumeMicrovm`, drop `CreateMicrovmAuthToken`, no `SHELL_INGRESS` | R8 | On `LauncherRole` |
| "The launcher's keys stay stack outputs" | **void** | There is no launcher key (R9) |
| The role the broker assumes, its session policy | R11, R12 | The policy is REPORT-143's code; R12 is its contract |
| Every S3 permission off the execution role, logs and nothing else | R13 | Including `SuspendMicrovm` |
| Packages writer user, `PutObject` on `packages/*`, keys as outputs | R14 to R16 | |
| Lifecycle rule kept, no expiry | R6 | |
| Description rename to "package runner" | R5 | Stack and image |
| "The IAM work ships in three passes" | **void** (Doug, 2026-10-07) | One pass |
| Production stack, production launch end to end | RD-1 production | Unchanged line |
| No alarms; session cost not measured | dropped (Doug, 2026-09-25) | |
| CloudFront query-string logging | decided, no work | The launch link carries no credential since the redesign (`final-design.md` 17 item 12), so nothing to redact |
| Done when: nothing holds `CreateMicrovmAuthToken` or may pass `SHELL_INGRESS` | R8, R18 | Template test |
| Done when: the VM's endpoint answers 403 | R20 | On the stack's first VM |
| Done when: the execution role names logs and nothing else | R13, R18 | |
| Done when: "a VM running at the moment of that change keeps syncing" | **void** | No such change happens: the role is created without S3. RD-4 pass 2's first staging run on broker credentials is the evidence instead |
| Done when: staging's stack is in QA and the spike's is gone | R22 | |
| Done when: production launch end to end | RD-1 production | |
| Done when: the packages credential writes `packages/` and nothing else, asserted by a test | R14, R18, R20 | |

## Requirements

### The template

- **R1.** The template is `cloudformation/researcher-dashboard-runner.yml`, written fresh from the spike's (`38451b9`) rather than copied. Nothing changes in the cloud-formation repository.
- **R2.** One stack per environment: `researcher-dashboard-runner-staging` in QA, 816253370536, created by this story, and `researcher-dashboard-runner-production` in 612297603577 on the RD-1 production line. Both in us-east-1.
- **R3.** The logical ids are `DataBucket`, `LogGroup`, `BuildRole`, `ExecutionRole`, `LauncherRole`, `BrokerRole`, `PackagesWriterUser`, `PackagesWriterKey` and `MicrovmImage`. Every create-only value is fixed so a later update replaces nothing: `BucketName` `researcher-dashboard-runner-${Environment}`, `LogGroupName`, the four `RoleName`s (`-build`, `-execution`, `-launcher`, `-broker`), the writer's `UserName` (`-packages-writer`), `PackagesWriterKey`'s `UserName` and `Serial: 1`, and `MicrovmImage`'s `Name`. No role has a `Path`. `DataBucket` keeps `DeletionPolicy` and `UpdateReplacePolicy` `Retain`.
- **R4.** The parameters are the spike's except `StatusBackend`, with the same names, types, defaults and allowed values, plus `FunctionServiceAccountUniqueId` (digits only, no default), the numeric unique ID of the function's service account. The audience is not a parameter: it is derived as `researcher-dashboard-runner-${Environment}`, the stack's name (Doug, 2026-10-07).
- **R5.** `MicrovmImage` resolves to the spike's values except `Description`, "Researcher Dashboard package runner (${Environment})", and `STATUS_BACKEND`, the literal `FIRESTORE`. The stack's description names what the stack now holds.
- **R6.** The bucket has exactly one lifecycle rule, aborting incomplete multipart uploads after 7 days, and no expiration rule (`final-design.md` 12).
- **R7.** The template lints clean with `cfn-lint` in `python:3.12-slim`.

### The function's identity

- **R8.** `LauncherRole`, `researcher-dashboard-runner-${Environment}-launcher`, trusts the function as R10 states, and grants exactly: `lambda:RunMicrovm` on the image and on `microvm:*`; `lambda:GetMicrovmImage` on the image; `lambda:GetMicrovm`, `ResumeMicrovm`, `SuspendMicrovm` and `TerminateMicrovm` on both ARN shapes; `lambda:PassNetworkConnector` on `HTTP_INGRESS` and `INTERNET_EGRESS`; and `iam:PassRole` on the execution role. Its permission policies grant no `sts:` action (the trust's `sts:AssumeRoleWithWebIdentity` is not a grant to the role), and nothing in the template names `SHELL_INGRESS` or an auth-token action.
- **R9.** The stack defines no IAM user or access key for the function, and no output carries one. The only access key in the stack is the packages writer's.
- **R10.** `LauncherRole` and `BrokerRole` each have one trust statement and nothing else: `Principal: {Federated: accounts.google.com}`, `Action: sts:AssumeRoleWithWebIdentity`, and `StringEquals` on `accounts.google.com:aud` and `accounts.google.com:sub`, both `FunctionServiceAccountUniqueId`, and `accounts.google.com:oaud`, the stack's name, `researcher-dashboard-runner-${Environment}`. No `StringLike`, no other condition operator, no other principal. AWS does not require `sub` for Google, so the test pins it. The stack creates no OIDC provider.

### The broker

- **R11.** `BrokerRole`, `researcher-dashboard-runner-${Environment}-broker`, `MaxSessionDuration` 3600, has two inline policies and no managed policy: `researcher-data` (`s3:ListBucket` on the bucket with `s3:prefix` `StringLike` `researchers/*`; `GetObject`, `PutObject` and `DeleteObject` on `researchers/*`) and `packages-read` (`s3:GetObject` on `packages/*`, no list). This is the ceiling of every session.
- **R12.** The contract REPORT-143 builds against, recorded in the README and, after this spec's squash, in `speccing.md`'s "The storage broker's contract for REPORT-143" (Doug, 2026-10-07, stage 8): `AssumeRoleWithWebIdentity` on `BrokerRoleArn` with a token for the stack's audience, `DurationSeconds` 3600, no `PolicyArns`, and `Policy` exactly:

  ```json
  {"Version":"2012-10-17","Statement":[
    {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::<bucket>","Condition":{"StringLike":{"s3:prefix":"researchers/<id>/*"}}},
    {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::<bucket>/researchers/<id>/*"},
    {"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::<bucket>/packages/*"}
  ]}
  ```

  `<bucket>` is `DataBucketName`, and `<id>` the VM's verified `platform_user_id`, refused unless it matches `^[1-9][0-9]*$`. A session without the policy holds the whole ceiling, so no code path may omit it.

### The execution role

- **R13.** `ExecutionRole`'s one inline policy, `runtime`, holds exactly one statement: `logs:CreateLogStream` and `logs:PutLogEvents` on `${LogGroup.Arn}:*`. No S3, no `lambda:`, no managed policy, no boundary, and no policy attached from another resource. Its trust (Lambda, `sts:AssumeRole` and `sts:TagSession`) is the spike's.

### The packages writer

- **R14.** `PackagesWriterUser`, `researcher-dashboard-runner-${Environment}-packages-writer`, has one inline policy with one statement, `s3:PutObject` on `packages/*`: no groups, no managed policies, no login profile, no boundary.
- **R15.** `PackagesWriterKey` names the user by its literal name with `DependsOn: PackagesWriterUser`, `Serial: 1`, and is output as `PackagesWriterAccessKey` and `PackagesWriterSecretKey` for report-server's `PackagesAwsAccessKeyId` and `PackagesAwsSecretAccessKey` (Doug, 2026-09-25, following `token-service.yml`).
- **R16.** The writer's name and ARN are outputs.

### Outputs

- **R17.** The outputs are exactly `DataBucketName`, `MicrovmImageArn`, `ExecutionRoleArn`, `BuildRoleArn`, `LauncherRoleArn`, `BrokerRoleArn`, `PackagesWriterUserName`, `PackagesWriterUserArn`, `PackagesWriterAccessKey`, `PackagesWriterSecretKey` and `LogGroupName`. Each description names the setting it feeds.

### Tests

- **R18.** A Python `unittest` over cfn-lint's decoder, run by `cloudformation/check.sh` and by a CI workflow on every change under `cloudformation/`, asserts R3, R6, R8 to R11, R13 to R15 and R17. Each assertion is exact (a list or set equality, not a membership check), so a widened grant fails it as well as a missing one. Each test is mutation-checked: it fails on at least these, and every mutation lints clean, so the tests and not cfn-lint are what catch them:
  - trust: `sub` dropped, `sub` or `aud` wrong, `oaud` wrong, `StringEquals` turned into `StringLike` with `*`, a second statement (another federated principal, or an AWS principal), on either role;
  - launcher: `CreateMicrovmAuthToken` or `CreateMicrovmShellAuthToken` added, `lambda:*` added, `ResumeMicrovm`, `SuspendMicrovm` or `TerminateMicrovm` dropped, `SHELL_INGRESS` added, an `sts:` action added;
  - an `AWS::IAM::User` and `AWS::IAM::AccessKey` for the launcher, or an output carrying one;
  - broker: a `packages/` list, put or delete, a widened resource, a third policy, a managed policy;
  - execution role: any S3 grant, `SuspendMicrovm`, `cloudwatch:PutMetricData`, a managed or separately attached policy, `scripts/` anywhere in the template;
  - writer: any added action or resource, `PackagesWriterKey`'s `Serial` bumped;
  - a create-only value changed; an expiration rule added.
- **R19.** No runner, app or report-service code changes, so no other test suite is affected.

### Verification on staging

- **R20.** After the QA stack is created, its grants are checked with real calls, not `simulate-principal-policy`, and the results recorded against this spec:
  - With the writer's key: a put under `packages/` succeeds; a put under `researchers/` and a get and a list under `packages/` are refused.
  - As the function: a Google ID token for `researcher-dashboard@report-service-dev` with the stack's name as its audience (report-service's `setup-researcher-dashboard-iam.sh id-token`, the operator holding OpenID Token Creator from the setup script's `grant-operator`, revoked afterward; not `gcloud … --impersonate-service-account`, which needs Token Creator, REPORT-143 Q12, Doug, 2026-10-07) is exchanged with `aws sts assume-role-with-web-identity` for `LauncherRole`, and `GetMicrovmImage` on the stack's image succeeds. The same exchange with a token for another audience is refused.
  - The broker, with the same kind of token exchanged on `BrokerRoleArn` (the probe's session policy passed as `--policy`), as RD-1 pass 2 specified, against objects that exist: a session with the whole ceiling reads a probe archive and is refused a write, a delete and a list under `packages/`; a session under R12's policy for a test id writes and lists its own prefix, reads the archive, and is refused a read and a list of another prefix that holds an object.
  - The execution role's only inline policy is `runtime` with R13's statement, and it has no attached policy.
  - The endpoint check needs a running VM, which this stack first has when RD-4 pass 2's runner is released to it. Then: as the launcher, `create-microvm-auth-token` for that VM is refused, and its endpoint answers `403, Request missing authentication`. `ResumeMicrovm`, `SuspendMicrovm` and `TerminateMicrovm` are exercised by the function and the watchdog.
- **R21.** The rollout also audits who can act as the function in GCP IAM in both projects (holders of OpenID Token Creator or Token Creator on the account, and deployers), as `oidc-launcher-plan.md` asks.

### Deployment and documentation

- **R22.** `cloudformation/README.md` documents: creating a stack and updating one by a change set from the head of the pull request's branch, before it merges, named `git-<sha>`, after diffing the deployed template against `main`'s; the prerequisites of a new account; what each output feeds; rotating the writer's key; the broker's session policy (R12); the live checks (R20); and the one-time rollout, in order:
  1. Retire the spike's stack in 612297603577 and empty and delete its retained bucket, so the QA bucket can take its name. This also deletes the spike's launcher user and key, which only the spike's `api` on report-service-dev uses; `researcherDashboard` is not deployed there (`gcloud functions list`, 2026-10-07), so nothing else stops working.
  2. In QA, publish the runner artifact to `concordqa-devops`.
  3. Create the QA stack with `CodeArtifactBucket`, `CodeArtifactKey` and `FunctionServiceAccountUniqueId`. The unique ID is what report-service's `setup-researcher-dashboard-iam.sh check <project>` prints: `101230238764588293065` for report-service-dev (staging) and `114768968256413137012` for report-service-pro (production) on 2026-10-07. Retry if S3 has not yet released the bucket name.
  4. Repoint report-service-dev's function: `RD_MICROVM_IMAGE_ARN`, `RD_EXECUTION_ROLE_ARN`, `RD_DATA_BUCKET`, `RD_LAUNCHER_ROLE_ARN` and `RD_AWS_AUDIENCE` (`researcher-dashboard-runner-staging`) in report-service's `functions/.env.report-service-dev`, by a report-service PR, then deploy. `BrokerRoleArn` goes to REPORT-143's setting.
  5. Hand report-server staging the writer's key and the bucket (`PackagesAwsAccessKeyId`, `PackagesAwsSecretAccessKey`, `PackageBuckets`) by a parameter-only update of `report-service-qa`.
  6. Run R20's checks and R21's audit.
- **R23.** The repository README's layout lists `cloudformation/`.

## Technical Notes

- **Create-only properties** (cfn-lint 1.57.0's us-east-1 schemas): `AWS::Lambda::MicrovmImage` `Name`; `AWS::IAM::AccessKey` `UserName`, `Serial`; `AWS::IAM::User` `UserName`; `AWS::IAM::Role` `Path`, `RoleName`; `AWS::S3::Bucket` `BucketName`; `AWS::Logs::LogGroup` `LogGroupName`. Trust policies, inline policies, `Description` and `MaxSessionDuration` are updatable in place.
- **A literal name, not a `Ref`, for a resource an update may modify.** A change set can list a property that `Ref`s a resource the same update modifies as `Replacement: Conditional`, as rigse's listeners were (`speccing.md`). The README stops on any replacement, and a replaced key breaks report-server, so `PackagesWriterKey` names its user literally, as the spike's `LauncherKey` did.
- **Google's claims and AWS's condition keys.** A service account's ID token carries its numeric unique ID in both `azp` and `sub`, and the requested audience in `aud`. AWS maps `azp` to `accounts.google.com:aud` and `aud` to `accounts.google.com:oaud`. Google is a built-in provider and not on the list where AWS enforces a `sub` condition, so the template has to (sources in `oidc-launcher-plan.md`). The account must never be recreated: a new account gets a new unique ID, which both roles refuse until the stack is updated.
- **IAM action names** (cfn-lint's `Policies.json`): the MicroVM actions authorize against the `microvm-image` resource type; the spike's `microvm:*` ARN is kept beside it because the spike proved the pair with real calls. `PassNetworkConnector` lists no resource type; the spike's connector ARNs worked.
- **What a leaked writer key can do.** Overwrite a published archive (no versioning, no conditional put), but not change what runs: the runner checks every archive against the catalog's checksum. Availability, not integrity.
- **What an escaped package can reach.** The execution role's credentials from IMDS write lines to the runner's own log group and nothing else, so the sandbox check (`verifySandbox`) stays.
- **`packages/` read is not per researcher** (Doug, 2026-09-25): any VM on a stack can read every published archive. The broker protects student data under `researchers/`. A missing archive reads as `AccessDenied`, since nothing lists `packages/`.
- **report-server takes one `PACKAGES_AWS_*` pair for every bucket**, so a per-stack writer serves one bucket. A second production runner stack for the NGSS portal would need more; that is the production line's question.
- **For RD-4 pass 1.** Its step 2 (the execution role's `packages/*` read and `test_the_execution_role_reads_packages_not_scripts`) goes, since the role has no S3 grant. Its runner change and "Releasing the runner" README section remain, and its parameter-count note changes.

### Stage 4 verification (2026-10-07), throwaway, in the scratchpad

- **The template and tests were built in full** from the spike's template and the three old specs, with the audience derived as stage 8 decided. cfn-lint 1.57.0 in `python:3.12-slim` is clean, and nine tests pass.
- **Against the spike, through cfn-lint's decoder**, the only differences are the intended ones: `BuildRole`, `DataBucket` and `LogGroup` identical; `ExecutionRole` changes `Description` and `Policies`; `MicrovmImage` changes `Description` and `EnvironmentVariables` (`STATUS_BACKEND`); `LauncherUser` and `LauncherKey` removed; `LauncherRole`, `BrokerRole`, `PackagesWriterUser` and `PackagesWriterKey` added; `StatusBackend` removed and `FunctionServiceAccountUniqueId` added, every other parameter identical.
- **Thirty-eight mutations**, one container, each linted and fully tested: every R18 mutation, plus a default on the unique ID, a renamed launcher role and `PackagesWriterKey` naming its user by `Ref`. Each fails exactly the test aimed at it (the launcher key output also fails the outputs test). Every variant lints clean except the `Ref` one, where cfn-lint warns `W3005` that the `DependsOn` is then redundant. So the tests, not cfn-lint, catch the grants.
- **The CLI the live checks use** (2.36.17): `sts assume-role-with-web-identity` takes `--role-arn`, `--role-session-name`, `--web-identity-token`, `--policy` and `--duration-seconds`; `lambda-microvms get-microvm` returns `endpoint`, `get-microvm-image` returns `latestActiveImageVersion`, and `create-microvm-auth-token` takes `--allowed-ports` as a tagged union (`port=8080`).
- **Not run:** any call as the function's service account (no operator grant was taken for a spec), and any stack create or change set.

## Out of Scope

- The session policy's code and `/storage-credentials`: REPORT-143.
- Moving the runner onto broker credentials, and identity-keyed archive keys: RD-4 pass 2. The prefix rename: RD-4 pass 1.
- The production stack: RD-1 production.
- Any change to cloud-formation or report-service; the README says what to set and the operator sets it.
- Creating or granting the GCP service accounts: report-service's `setup-researcher-dashboard-iam.sh`, already applied in both projects.
- The OIDC acceptance gate from the deployed function: a sprint 28 ops step (`plan.md`).

## Decisions carried

From the 2026-09-25 specs, unchanged (Doug, 2026-09-25, unless noted):

- Applied by hand as a change set, not by a workflow with IAM rights or cloud-formation's `create-stack` (pass 1 Q5). It is applied from the pull request's branch before the merge, as Concord's infrastructure changes are, so a problem the live stack shows is fixed in the same pull request (Doug, 2026-10-08).
- Staging moves to QA as a new stack, the spike's is retired and its bucket deleted, and the QA bucket keeps the name (pass 1 Q6).
- The app stays on `models-resources`, with no bucket or CloudFront of its own (pass 1 Q2).
- The writer's key is a stack output, following `token-service.yml`; no Secrets Manager (pass 1 Q3).
- No session tag: the session policy is the only narrowing, and REPORT-143's tests and source guard catch its omission (pass 1 Q4).
- The session policy grants all of `packages/*`, not only queued archives (pass 2 Q1); no committed policy file (pass 2 Q2); no list on `packages/` (pass 2 Q4); `packages-read` is its own inline policy (pass 2 Q5).
- The launcher's action set is pinned exactly (pass 3 Q5); the execution role keeps its log grant (pass 3 Q6).
- Alarms and session cost dropped; CloudFront logging accepted (pass 1 Q1).
- A test in Python over cfn-lint's decoder, run in CI (pass 1 judgment calls).

## Open Questions

### RESOLVED: What audience does the function's token carry, and where is it set?
**Context**: The audience is in both trust policies (R10) and in the function's `RD_AWS_AUDIENCE`. It is not a secret: it binds the token to this use, so a token the same account mints for something else cannot assume these roles. Nothing records a value. The two environments already differ by service account, so the audience only has to be distinct from the account's other uses. `oidc-launcher-plan.md` calls it a per-environment stack parameter; if the value follows a rule, the template could derive it instead, which removes a value an operator types twice (stack and `.env`) and can mistype once.
**Options considered**:
- A) A parameter, `FunctionAudience`, with no default; the operator passes `researcher-dashboard-runner-staging` (the stack's name) at create, and the same string goes in `RD_AWS_AUDIENCE`.
- B) Derived in the template as `researcher-dashboard-runner-${Environment}`, no parameter; the README names the value for `RD_AWS_AUDIENCE`, and the `LauncherRoleArn` output's description repeats it.
- C) A parameter with one fixed value for every environment, such as `researcher-dashboard-aws`.

**Recommendation**: B. The value needs no choice per environment, a derived value cannot drift from the stack it belongs to, and the plan's "parameter" was a placeholder for "per environment", which B is. A is the plan as written and costs one more create argument.
**Decision**: B (Doug, 2026-10-07, stage 8). The template derives `researcher-dashboard-runner-${Environment}` in both trusts, with no parameter. The README and the `LauncherRoleArn` output's description name it as the value of `RD_AWS_AUDIENCE`, and the test pins it.

### RESOLVED: Does `StatusBackend` stay a parameter?
**Context**: The spike's `StatusBackend` allows `LOG`, which RD-4 pass 2's spec found can no longer bring a VM to `ready` (every function call needs the session, and `LogStore` signs nothing in), and left the parameter "RD-1's to drop" (`speccing.md`). The runner defaults `STATUS_BACKEND` to `FIRESTORE` (`runner/server/config.js:48`), and RD-4 pass 2's spec says the image passes `STATUS_BACKEND`.
**Options considered**:
- A) Drop the parameter, and set the image's `STATUS_BACKEND` to the literal `FIRESTORE`.
- B) Drop both, relying on the runner's default.
- C) Keep the spike's parameter.

**Decision**: A (stage 2, from the code). No stack may run with `LOG`, so the choice should not be offered. Keeping the variable, fixed, leaves the image's environment as RD-4 pass 2's spec describes it and does not lean on a default in another file. The template has nine parameters of the spike's and one or two new ones (R4).

### RESOLVED: Judgment call: the endpoint 403 check waits for the stack's first real VM
**Options considered**: launch a VM by hand as the launcher during the rollout to check the endpoint; check it when RD-4 pass 2's runner first runs on the stack.
**Decision**: Wait. A VM from today's runner fails its `/run` hook at the first pull on this execution role, and what the platform then does with the VM is not recorded, so a hand launch may not leave a VM to probe. The template test already proves nothing in the stack holds an auth-token action; the live check confirms the endpoint's answer when a VM exists.

### RESOLVED: Judgment call: the Done-when about a VM surviving the change is void, not reworded into a check
**Options considered**: keep it by launching a VM and changing the role under it; record it as void.
**Decision**: Void. The clause existed to prove the pass 3 update safe for running VMs. With the role created without S3 there is no update, and staging gets one before any VM exists. RD-4 pass 2's first staging run on broker credentials is where syncing is shown.

### RESOLVED: Low confidence: a token for the wrong audience is refused as R20 expects
**Context**: R20 expects `assume-role-with-web-identity` with a token minted for another audience to be refused by the `oaud` condition. That rests on AWS's documented mapping of the token's `aud` to `accounts.google.com:oaud` for Google, which no call here has run: this machine's login (`developer@concord.org`) cannot mint the account's token without the operator grant, which was not taken for a spec.
**Options considered**:
- A) Keep the check in R20; if the token is not refused, the trust is wrong and the rollout stops.
- B) Drop it and rely on the template test.

**Decision**: A (stage 2). The template test proves what the policy says, not what AWS does with it, and the check costs one command. A wrong mapping would make the audience decorative, which only a real call shows.

## Self-Review

Stage 3, run unattended. Roles: Security Engineer, DevOps Engineer (the operator running the rollout), Senior Engineer (consistency with report-service `master` and the specs stacked on this one), QA Engineer. Each finding was checked against the code, the accounts or the oob records before it was written; findings that did not survive were dropped.

### Security Engineer

#### RESOLVED: R8 said nothing names an `sts:` action, which the trust policy does
`sts:AssumeRoleWithWebIdentity` is the trust statement's action, so a test reading R8 literally would fail on the role itself. Fixed: R8 forbids `sts:` actions in the role's permission policies.

### DevOps Engineer

#### RESOLVED: The rollout named staging's unique ID only, with no source
R22 step 3 hardcoded `101230238764588293065`, and the production line will need the other one. Read both with `gcloud` on 2026-10-07. Fixed: step 3 names the setup script's `check` as the source and gives both values with their date, since a recreated account changes them.

#### RESOLVED: What retiring the spike's stack breaks was not stated
Checked `gcloud functions list --project report-service-dev`: only `api` is deployed, not `researcherDashboard`. Fixed in R22 step 1: only the spike's `api` route loses its launcher, which REPORT-143's dev deploy removes anyway.

### QA Engineer

#### RESOLVED: The broker's live checks did not say what identity they run as
RD-1 pass 2's checks assumed the role as the launcher user. Fixed in R20: the same Google token, exchanged on `BrokerRoleArn` with the probe's session policy.

### Senior Engineer

No finding survived. Checked: the launcher's action set matches what `microvm.ts` on `master` calls plus REPORT-143's suspend and terminate; `RunMicrovm` passes only `INTERNET_EGRESS`, and `HTTP_INGRESS` stays granted because the platform attaches it regardless (`final-design.md` 10); `aws-credentials.ts` uses `fromWebToken` without `DurationSeconds`, so sessions last the default hour, within `MaxSessionDuration`.

