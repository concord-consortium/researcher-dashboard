# Runner stack

`researcher-dashboard-runner.yml` defines one stack per environment: the data bucket, the MicroVM image and its build and execution roles, the log group, the two roles report-service's function assumes (the launcher, for MicroVM calls, and the storage broker), and the IAM user report-server publishes packages as (the packages writer).

| Environment | Stack | Account, region | Function's service account |
|---|---|---|---|
| staging | `researcher-dashboard-runner-staging` | QA, 816253370536, us-east-1 | `researcher-dashboard@report-service-dev` |
| production | `researcher-dashboard-runner-production`, not created yet | production, 612297603577, us-east-1 | `researcher-dashboard@report-service-pro` |

Each environment's runner is in the same account as that environment's report-server.

## Checking a change

`./check.sh` lints the template and runs `tests/`, in `python:3.12-slim`, as CI does. The tests hold every value CloudFormation cannot change without replacing a resource (the bucket, log group, role and user names, the writer key's `Serial`, the image `Name`), so a change that would replace a live resource fails here rather than in a stack update. They also pin exactly what each role and the writer are granted.

## Before a stack is created in an account

- **Lambda MicroVMs answer in the account**: `aws lambda-microvms list-managed-microvm-images` lists the base image `BaseImageArn` names, and `list-managed-microvm-image-versions` its `BaseImageVersion`.
- **The runner artifact is in a bucket in the stack's account.** The build role gets `s3:GetObject` on `CodeArtifactBucket`/`CodeArtifactKey` from its own account's IAM only. Publish it from `runner/` with `make publish-artifact VERSION=<x.y.z> ARTIFACT_BUCKET=<bucket>`: `concordqa-devops` for staging, `concord-devops` for production.
- **The function's service account exists**, created by report-service's `functions/scripts/setup-researcher-dashboard-iam.sh apply <project>`. Its `check` prints the account's unique ID, which is the stack's `FunctionServiceAccountUniqueId`. Never delete and recreate that account: a new one gets a new unique ID, and both roles refuse it until the stack is updated.

## Creating a stack

With a change set, from this directory, at the head of the pull request's branch before it merges, so the resources are read before anything is made and a problem the stack shows is fixed in the same pull request:

```sh
STACK=researcher-dashboard-runner-staging
SHA=$(git rev-parse --short HEAD)
aws cloudformation create-change-set --change-set-type CREATE \
  --stack-name "$STACK" --change-set-name "git-$SHA" \
  --template-body file://researcher-dashboard-runner.yml --capabilities CAPABILITY_NAMED_IAM \
  --parameters ParameterKey=Environment,ParameterValue=staging \
    ParameterKey=CodeArtifactBucket,ParameterValue=<bucket> \
    ParameterKey=CodeArtifactKey,ParameterValue=<key> \
    ParameterKey=FunctionServiceAccountUniqueId,ParameterValue=<unique id>
aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "git-$SHA" \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId]' --output table
aws cloudformation execute-change-set --stack-name "$STACK" --change-set-name "git-$SHA"
aws cloudformation wait stack-create-complete --stack-name "$STACK"
```

Creating the stack builds the image, which waits on the runner's `/ready` hook. A build that fails takes the create down with it, and the bucket, which is retained, is then left behind holding the name. A create that fails for any reason leaves the stack in `ROLLBACK_COMPLETE`, holding nothing but its name: delete it with `aws cloudformation delete-stack` before creating it again.

## Updating a stack

A change set from the head of the pull request's branch before it merges, named for that commit, every existing parameter keeping its value. `STACK` is the stack being updated:

```sh
STACK=researcher-dashboard-runner-staging
SHA=$(git rev-parse --short HEAD)
PARAMS=$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query 'Stacks[0].Parameters[].ParameterKey' --output text \
  | tr '\t' '\n' | sed 's/.*/ParameterKey=&,UsePreviousValue=true/' | tr '\n' ' ')
aws cloudformation create-change-set --stack-name "$STACK" --change-set-name "git-$SHA" \
  --template-body file://researcher-dashboard-runner.yml \
  --capabilities CAPABILITY_NAMED_IAM --parameters $PARAMS
aws cloudformation describe-change-set --stack-name "$STACK" --change-set-name "git-$SHA" \
  --query 'Changes[].ResourceChange.[Action,LogicalResourceId,Replacement]' --output table
```

A parameter the template adds has no previous value, so give it one in `$PARAMS`. Stop on any `Remove`, or any `Replacement` other than `False`, that the change does not mean. First diff what is deployed against `main`'s template, and stop on a difference nobody can explain: an update from here would silently revert it. The two differ legitimately only while another branch's change is applied and waiting to merge.

```sh
aws cloudformation get-template --stack-name "$STACK" --template-stage Original \
  --query TemplateBody --output text > /tmp/deployed.yml
git fetch origin main
git show origin/main:cloudformation/researcher-dashboard-runner.yml > /tmp/expected.yml
diff -B <(sed 's/[[:space:]]*$//' /tmp/deployed.yml) <(sed 's/[[:space:]]*$//' /tmp/expected.yml)
```

When both look right, apply it:

```sh
aws cloudformation execute-change-set --stack-name "$STACK" --change-set-name "git-$SHA"
aws cloudformation wait stack-update-complete --stack-name "$STACK"
```

A `MicrovmImage` change starts an image build. VMs already running keep their version, and the function relaunches a VM that is not on the latest one at its next run request.

## What goes where after a create or update

- **report-service's function** (`functions/.env.report-service-dev` for staging, `.env.report-service-pro` for production, then a deploy): `RD_MICROVM_IMAGE_ARN`, `RD_EXECUTION_ROLE_ARN`, `RD_DATA_BUCKET` and `RD_LAUNCHER_ROLE_ARN` are the `MicrovmImageArn`, `ExecutionRoleArn`, `DataBucketName` and `LauncherRoleArn` outputs. `RD_AWS_AUDIENCE` is the stack's name, `researcher-dashboard-runner-<environment>`, which both roles require as the token's audience. The storage broker (REPORT-143) also needs `BrokerRoleArn`, and passes the session policy below on every call.
- **report-server** publishes with the packages writer's key: a parameter-only update of its stack (`report-service-qa` for staging) sets `PackagesAwsAccessKeyId` and `PackagesAwsSecretAccessKey` from the `PackagesWriterAccessKey` and `PackagesWriterSecretKey` outputs, and `PackageBuckets` maps that portal's server to this bucket (a JSON object of portal server to bucket, which report-server's `config/runtime.exs` parses).
- **To rotate the writer's key**, bump `PackagesWriterKey`'s `Serial` and apply: CloudFormation creates the new key, updates the outputs and deletes the old one, so update report-server straight away. The tests pin `Serial`, so this is a deliberate edit.

## The storage broker's session policy

`BrokerRole`'s own policies are only a ceiling: list under `researchers/`, read, write and delete on `researchers/*`, and read on `packages/*`. A session assumed without a session policy holds all of it, which is every researcher's data. So report-service's function (REPORT-143) calls `AssumeRoleWithWebIdentity` on `BrokerRoleArn` with its own token, `DurationSeconds` 3600, and passes this as `Policy`, with `<bucket>` the `DataBucketName` output and `<id>` the `platform_user_id` from the VM's verified token:

```json
{"Version":"2012-10-17","Statement":[
  {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::<bucket>","Condition":{"StringLike":{"s3:prefix":"researchers/<id>/*"}}},
  {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::<bucket>/researchers/<id>/*"},
  {"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::<bucket>/packages/*"}
]}
```

The function refuses to mint unless `<id>` is a positive decimal integer, since a `*` or `?` in it, or an empty one, would widen the session. A session gets only what both the ceiling and this policy allow, so a statement the ceiling lacks is accepted by STS and grants nothing. Nothing lists `packages/`, so a missing archive reads as `AccessDenied`, not `NoSuchKey`.

## Checking the grants on a live stack

With real calls: a policy simulation evaluates the action string it is handed, so it passes a misspelled action against a policy granting the same misspelling, which is how the spike shipped a launcher policy where every action was wrong. Run these with credentials for the stack's account (`out` reads its outputs). Each block below runs in a subshell, so the credentials it sets end with it.

```sh
STACK=researcher-dashboard-runner-staging
B=$STACK
out() { aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
echo probe > /tmp/probe
```

**The packages writer.** Leave its probe object in place for the broker's checks.

```sh
( export AWS_ACCESS_KEY_ID=$(out PackagesWriterAccessKey) AWS_SECRET_ACCESS_KEY=$(out PackagesWriterSecretKey)
  unset AWS_SESSION_TOKEN AWS_PROFILE
  aws s3api put-object --bucket $B --key packages/_probe/0.0.0.txt --body /tmp/probe   # succeeds
  aws s3api put-object --bucket $B --key researchers/_probe.txt --body /tmp/probe      # AccessDenied
  aws s3api get-object --bucket $B --key packages/_probe/0.0.0.txt /tmp/out            # AccessDenied
  aws s3api list-objects-v2 --bucket $B --prefix packages/ )                           # AccessDenied
```

**As the function.** Take OpenID Token Creator on the function's account for the check, and give it back afterward (report-service's `functions/scripts/`). Mint its tokens with the script's `id-token`, not `gcloud auth print-identity-token --impersonate-service-account`, which mints an access token first and so needs Token Creator:

```sh
setup-researcher-dashboard-iam.sh grant-operator report-service-dev user:<you>@concord.org
TOKEN=$(setup-researcher-dashboard-iam.sh id-token report-service-dev $STACK)
assume() {  # assume <role arn> [session policy]: prints the exports for that session
  aws sts assume-role-with-web-identity --role-arn "$1" --role-session-name probe \
    --web-identity-token "$TOKEN" --duration-seconds 3600 ${2:+--policy "$2"} \
    --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text |
    awk '{print "export AWS_ACCESS_KEY_ID=" $1 " AWS_SECRET_ACCESS_KEY=" $2 " AWS_SESSION_TOKEN=" $3}'
}
LAUNCHER=$(out LauncherRoleArn) BROKER=$(out BrokerRoleArn) IMAGE=$(out MicrovmImageArn)
```

The launcher can read the image, and a token minted for any other audience is refused:

```sh
( eval "$(assume $LAUNCHER)"; unset AWS_PROFILE
  aws lambda-microvms get-microvm-image --image-identifier $IMAGE --query latestActiveImageVersion )   # succeeds
TOKEN=$(setup-researcher-dashboard-iam.sh id-token report-service-dev not-$STACK) \
  assume $LAUNCHER                                                                                     # AccessDenied
```

A broker session holding the whole ceiling, which is what a session without a session policy gets. Every refusal below is of an object that exists: without a list grant, S3 refuses a read of a missing key whatever the grant, so a missing key proves nothing.

```sh
( eval "$(assume $BROKER)"; unset AWS_PROFILE
  aws s3api put-object --bucket $B --key researchers/_probe/a.txt --body /tmp/probe      # succeeds
  aws s3api get-object --bucket $B --key packages/_probe/0.0.0.txt /tmp/out              # succeeds
  aws s3api put-object --bucket $B --key packages/_probe/1.0.0.txt --body /tmp/probe     # AccessDenied
  aws s3api delete-object --bucket $B --key packages/_probe/0.0.0.txt                    # AccessDenied
  aws s3api list-objects-v2 --bucket $B --prefix packages/ )                             # AccessDenied
```

A broker session under the session policy above, for a test id:

```sh
ID=999999999
POLICY=$(cat <<EOF
{"Version":"2012-10-17","Statement":[
  {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::$B","Condition":{"StringLike":{"s3:prefix":"researchers/$ID/*"}}},
  {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::$B/researchers/$ID/*"},
  {"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::$B/packages/*"}
]}
EOF
)
( eval "$(assume $BROKER "$POLICY")"; unset AWS_PROFILE
  aws s3api put-object --bucket $B --key researchers/$ID/a.txt --body /tmp/probe         # succeeds
  aws s3api list-objects-v2 --bucket $B --prefix researchers/$ID/                        # succeeds
  aws s3api get-object --bucket $B --key packages/_probe/0.0.0.txt /tmp/out              # succeeds
  aws s3api get-object --bucket $B --key researchers/_probe/a.txt /tmp/out               # AccessDenied
  aws s3api list-objects-v2 --bucket $B --prefix researchers/_probe/ )                   # AccessDenied
setup-researcher-dashboard-iam.sh revoke-operator report-service-dev user:<you>@concord.org
```

Then remove `packages/_probe/`, `researchers/_probe/` and `researchers/999999999/` with your own credentials.

**The execution role** writes its logs and nothing else. With your own credentials:

```sh
R=$STACK-execution
aws iam list-role-policies --role-name $R                       # ["runtime"]
aws iam get-role-policy --role-name $R --policy-name runtime   # the one logs statement
aws iam list-attached-role-policies --role-name $R             # []
```

**A VM's endpoint**, once the stack has a running VM (the first is a run on a runner that syncs with the broker's credentials). Nothing holds `CreateMicrovmAuthToken`, so nothing can open it. As the launcher:

```sh
( eval "$(assume $LAUNCHER)"; unset AWS_PROFILE
  VM=$(aws lambda-microvms list-microvms --image-identifier $IMAGE --query 'items[0].microvmId' --output text)
  aws lambda-microvms create-microvm-auth-token --microvm-identifier $VM \
    --expiration-in-minutes 5 --allowed-ports port=8080                              # AccessDenied
  ENDPOINT=$(aws lambda-microvms get-microvm --microvm-identifier $VM --query endpoint --output text)
  curl -s -w ' %{http_code}\n' -X POST "$ENDPOINT/run-package" )                    # 403, Request missing authentication
```

`ResumeMicrovm`, `SuspendMicrovm` and `TerminateMicrovm` are exercised by the function and its watchdog.

## Moving staging to the QA account (once)

The spike created `researcher-dashboard-runner-staging` in the production account, 612297603577. Staging moves to QA, and the spike's stack is retired first, since the new bucket takes the old one's name.

1. **In 612297603577, retire the spike's stack.** Its bucket is retained, so empty and delete it by hand; everything in it is test data. This also deletes the spike's launcher user and key, which only the spike's `api` route on report-service-dev uses.

   ```sh
   aws cloudformation delete-stack --stack-name researcher-dashboard-runner-staging
   aws cloudformation wait stack-delete-complete --stack-name researcher-dashboard-runner-staging
   aws s3 rm s3://researcher-dashboard-runner-staging --recursive
   aws s3api delete-bucket --bucket researcher-dashboard-runner-staging
   ```

2. **In 816253370536, meet the prerequisites above**: publish the runner artifact to `concordqa-devops`.
3. **Create the stack** as above, with `FunctionServiceAccountUniqueId` from `setup-researcher-dashboard-iam.sh check report-service-dev`. S3 can take most of an hour to release a deleted bucket's name to another account, and answers `head-bucket` with 404 before it has, so a create soon after step 1 can fail on `DataBucket` with a 409, "A conflicting conditional operation is currently in progress". Delete the rolled-back stack, wait, and create it again with a new change set.
4. **Point report-service-dev's function at it** (above), by a report-service pull request, then deploy.
5. **Give report-server staging the packages writer's key** (above).
6. **Run the live checks** above and record the results against RD-1's spec. Then audit who can act as the function in GCP IAM, in report-service-dev and report-service-pro: who holds OpenID Token Creator or Token Creator on the `researcher-dashboard` account, and who may deploy functions that run as it.
