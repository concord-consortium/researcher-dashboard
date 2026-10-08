# Implementation Plan: RD-1, the runner stack, keyless, at its final grants

**Jira**: https://concord-consortium.atlassian.net/browse/RD-1
**Branch**: `RD-1-runner-stack`, parent `main`, child `RD-4-pass-1-packages-prefix`
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

Three steps: the template with its create-only and output tests and the checks that run them; the tests of what each principal is granted; and the README that applies it. Nothing outside `cloudformation/`, `.github/workflows/` and the repository README changes.

Every file below was built and run in the scratchpad before being written up (stage 4): each step's template lints clean with cfn-lint 1.57.0 in `python:3.12-slim`, each step's tests pass against it without a later step, and step 2's tests catch all thirty-eight mutations of requirements R18.

The template derives the token audience as `researcher-dashboard-runner-${Environment}`, the stack's name, in both trusts (requirements, the audience question, Doug, 2026-10-07).

The file layout is new:

```
cloudformation/
  README.md                          how the stack is applied, and what to hand to whom
  requirements.txt                   cfn-lint, pinned, shared by CI and check.sh
  check.sh                           lint and test in python:3.12-slim, as CI does
  researcher-dashboard-runner.yml    the runner stack template
  tests/test_runner_template.py      what the stack grants, asserted over the template
.github/workflows/cloudformation.yml
```

---

### The runner stack template, and the checks that run it

**Summary**: The template, written fresh from the spike's (cloud-formation `RIGSE-365-researcher-dashboard-runner`, `38451b9`) at its final grants (R1 to R17), with the test harness and the tests that need no grant knowledge: every create-only value (R3), the lifecycle rule (R6) and the outputs (R17). With it come `requirements.txt`, `check.sh`, the CI workflow (R7, R18) and the repository README's layout line (R23). Against the spike, through cfn-lint's decoder, `BuildRole`, `DataBucket` and `LogGroup` are identical; `ExecutionRole` loses its S3 and `SuspendMicrovm` statements; `MicrovmImage` changes only `Description` and `STATUS_BACKEND`; the launcher user and key become `LauncherRole`; `BrokerRole` and the packages writer are new; `StatusBackend` goes and `FunctionServiceAccountUniqueId` comes.

**Files affected**:
- `cloudformation/researcher-dashboard-runner.yml`: new
- `cloudformation/tests/test_runner_template.py`: new
- `cloudformation/requirements.txt`, `cloudformation/check.sh`: new
- `.github/workflows/cloudformation.yml`: new
- `README.md`: layout gains `cloudformation/`

**Estimated diff size**: ~560 lines

`cloudformation/researcher-dashboard-runner.yml`:

```yaml
AWSTemplateFormatVersion: 2010-09-09
Description: "Researcher Dashboard package runner: MicroVM image, roles, data bucket and log group, the roles report-service's function assumes, and the IAM user report-server publishes packages as"

# One stack per environment: staging in the QA account, production in the production
# account. Every create-only value below (bucket, log group, role and user names, the
# access key's Serial, the image Name) must stay what a live stack was created with,
# or an update replaces the resource; tests/test_runner_template.py holds them fixed.
# See README.md for how this template is applied.

Parameters:
  Environment:
    Type: String
    Description: Lowercase name of environment (either staging or production)
    Default: staging
    AllowedValues: [staging, production]
  Contact:
    Type: String
    Description: Value of the Contact cost-allocation tag
    Default: dmartin
  CodeArtifactBucket:
    Type: String
    Description: Bucket holding the runner code artifact zip (Dockerfile plus build context), in this stack's account
    Default: concord-devops
  CodeArtifactKey:
    Type: String
    Description: Key of the runner code artifact zip within CodeArtifactBucket, as `make artifact-uri` in runner/ prints it
    Default: researcher-dashboard-runner/runner-0.1.0.zip
  BaseImageArn:
    Type: String
    Description: ARN of the Lambda-managed MicroVM base image
    Default: arn:aws:lambda:us-east-1:aws:microvm-image:al2023-1
  BaseImageVersion:
    Type: String
    Description: Version of the Lambda-managed base image. CloudFormation requires it, so a base image patch is a stack update
    Default: "1"
  BaselineMemoryInMiB:
    Type: Number
    Description: Baseline MicroVM memory. 4096 gives 4 GB / 2 vCPU baseline, 16 GB / 8 vCPU peak and 16 GB of disk
    Default: 4096
    AllowedValues: [512, 1024, 2048, 4096, 8192]
  HooksPort:
    Type: Number
    Description: Port the runner's HTTP server listens on, for both the lifecycle hooks and the runner's own PORT
    Default: 8080
    MinValue: 1
    MaxValue: 65535
  LogRetentionInDays:
    Type: Number
    Description: Days CloudWatch keeps the runner's build and runtime logs
    Default: 30
  FunctionServiceAccountUniqueId:
    Type: String
    Description: Numeric unique ID of the researcher-dashboard service account report-service's function runs as, which setup-researcher-dashboard-iam.sh check prints. The launcher and broker roles trust only this account
    AllowedPattern: "^[0-9]+$"

Resources:

  DataBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain
    UpdateReplacePolicy: Retain
    Properties:
      BucketName: !Sub "researcher-dashboard-runner-${Environment}"
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - BucketKeyEnabled: true
            ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      LifecycleConfiguration:
        # Retention is indefinite by decision (final-design.md section 12): researchers
        # return to a class a year later, and an object-age rule would expire an active
        # researcher's older files. The one rule only discards the parts of multipart
        # uploads that never completed, which are billed and unreadable.
        Rules:
          - Id: AbortIncompleteUploads
            Status: Enabled
            AbortIncompleteMultipartUpload:
              DaysAfterInitiation: 7
      Tags:
        - Key: Contact
          Value: !Ref Contact
        - Key: Environment
          Value: !Ref Environment
        - Key: Service
          Value: researcher-dashboard-runner

  LogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub "/aws/lambda-microvms/researcher-dashboard-runner-${Environment}"
      RetentionInDays: !Ref LogRetentionInDays
      Tags:
        - Key: Contact
          Value: !Ref Contact
        - Key: Environment
          Value: !Ref Environment
        - Key: Service
          Value: researcher-dashboard-runner

  BuildRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "researcher-dashboard-runner-${Environment}-build"
      Description: Assumed by Lambda to fetch the code artifact and write build logs while building the MicroVM image
      AssumeRolePolicyDocument:
        Version: 2012-10-17
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action:
              - sts:AssumeRole
              - sts:TagSession
      Policies:
        - PolicyName: build
          PolicyDocument:
            Version: 2012-10-17
            Statement:
              - Effect: Allow
                Action: s3:GetObject
                Resource: !Sub "arn:aws:s3:::${CodeArtifactBucket}/${CodeArtifactKey}"
              - Effect: Allow
                Action:
                  - logs:CreateLogGroup
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: !Sub "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda-microvms/*"
      Tags:
        - Key: Contact
          Value: !Ref Contact
        - Key: Environment
          Value: !Ref Environment
        - Key: Service
          Value: researcher-dashboard-runner

  # Every MicroVM from this image runs as this role, and a package that escapes its
  # sandbox can read its credentials from the metadata service. So it writes the VM's
  # logs and nothing else: storage credentials come from the broker, scoped to one
  # researcher, and suspending a VM is the function's call.
  ExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "researcher-dashboard-runner-${Environment}-execution"
      Description: Runtime role of every MicroVM from this image. It writes the VM's logs and nothing else
      AssumeRolePolicyDocument:
        Version: 2012-10-17
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action:
              - sts:AssumeRole
              - sts:TagSession
      Policies:
        - PolicyName: runtime
          PolicyDocument:
            Version: 2012-10-17
            Statement:
              - Effect: Allow
                Action:
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: !Sub "${LogGroup.Arn}:*"
      Tags:
        - Key: Contact
          Value: !Ref Contact
        - Key: Environment
          Value: !Ref Environment
        - Key: Service
          Value: researcher-dashboard-runner

  # What report-service's function calls Lambda MicroVMs as. It holds no AWS key: it
  # exchanges a Google ID token for this role's credentials.
  LauncherRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "researcher-dashboard-runner-${Environment}-launcher"
      Description: Assumed by report-service's function, with its Google identity, to launch, resume, suspend and terminate MicroVMs
      AssumeRolePolicyDocument:
        Version: 2012-10-17
        Statement:
          # Google is built into AWS as an identity provider. A service account's ID
          # token carries its unique ID in azp (AWS's accounts.google.com:aud) and sub,
          # and the requested audience in aud (accounts.google.com:oaud). AWS does not
          # require sub for Google, so this condition is what limits the trust to the
          # one account.
          - Effect: Allow
            Principal:
              Federated: accounts.google.com
            Action: sts:AssumeRoleWithWebIdentity
            Condition:
              StringEquals:
                "accounts.google.com:aud": !Ref FunctionServiceAccountUniqueId
                "accounts.google.com:sub": !Ref FunctionServiceAccountUniqueId
                "accounts.google.com:oaud": !Sub "researcher-dashboard-runner-${Environment}"
      Policies:
        - PolicyName: launch
          PolicyDocument:
            Version: 2012-10-17
            Statement:
              - Effect: Allow
                Action: lambda:RunMicrovm
                Resource:
                  - !GetAtt MicrovmImage.ImageArn
                  - !Sub "arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:microvm:*"
              # What the reuse decision compares a VM's image version with.
              - Effect: Allow
                Action: lambda:GetMicrovmImage
                Resource: !GetAtt MicrovmImage.ImageArn
              # Both ARN shapes: these authorize against the image a VM was built from,
              # which only a refused real call showed. One researcher's VM cannot be told
              # from another's by ARN, so this is image-wide. No CreateMicrovmAuthToken:
              # nothing calls into a VM, and its endpoint refuses a request without a token.
              - Effect: Allow
                Action:
                  - lambda:GetMicrovm
                  - lambda:ResumeMicrovm
                  - lambda:SuspendMicrovm
                  - lambda:TerminateMicrovm
                Resource:
                  - !Sub "arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:microvm:*"
                  - !GetAtt MicrovmImage.ImageArn
              # Passing an AWS-managed connector is its own permission. Enumerated rather
              # than wildcarded, so a new connector needs this stack changed too. No
              # shell connector: it yields a root shell on the VM, and no environment has it.
              - Effect: Allow
                Action: lambda:PassNetworkConnector
                Resource:
                  - !Sub "arn:aws:lambda:${AWS::Region}:aws:network-connector:aws-network-connector:HTTP_INGRESS"
                  - !Sub "arn:aws:lambda:${AWS::Region}:aws:network-connector:aws-network-connector:INTERNET_EGRESS"
              # Unconditioned: RunMicrovm does not populate iam:PassedToService, so a
              # condition on it never matches. The execution role trusts only Lambda.
              - Effect: Allow
                Action: iam:PassRole
                Resource: !GetAtt ExecutionRole.Arn
      Tags:
        - Key: Contact
          Value: !Ref Contact
        - Key: Environment
          Value: !Ref Environment
        - Key: Service
          Value: researcher-dashboard-runner

  # What a VM's storage credentials are drawn from. These policies are the ceiling of
  # every session: the function narrows each one to researchers/<platform_user_id>/ and
  # packages/ with a session policy on AssumeRoleWithWebIdentity, and a session without
  # one would reach every researcher's prefix.
  BrokerRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "researcher-dashboard-runner-${Environment}-broker"
      Description: Assumed by report-service's function, with its Google identity, to mint a VM's storage credentials, one researcher's prefix and the published packages per session
      MaxSessionDuration: 3600
      AssumeRolePolicyDocument:
        Version: 2012-10-17
        Statement:
          # The same trust as LauncherRole's: the function assumes each role directly.
          - Effect: Allow
            Principal:
              Federated: accounts.google.com
            Action: sts:AssumeRoleWithWebIdentity
            Condition:
              StringEquals:
                "accounts.google.com:aud": !Ref FunctionServiceAccountUniqueId
                "accounts.google.com:sub": !Ref FunctionServiceAccountUniqueId
                "accounts.google.com:oaud": !Sub "researcher-dashboard-runner-${Environment}"
      Policies:
        - PolicyName: researcher-data
          PolicyDocument:
            Version: 2012-10-17
            Statement:
              - Effect: Allow
                Action: s3:ListBucket
                Resource: !GetAtt DataBucket.Arn
                Condition:
                  StringLike:
                    s3:prefix: "researchers/*"
              - Effect: Allow
                Action:
                  - s3:GetObject
                  - s3:PutObject
                  - s3:DeleteObject
                Resource: !Sub "${DataBucket.Arn}/researchers/*"
        # Read only, and no list: the runner fetches an archive by the key the catalog
        # names and never lists packages/, whose keys name every researcher's packages,
        # private ones too. Without a list grant a missing archive is AccessDenied.
        - PolicyName: packages-read
          PolicyDocument:
            Version: 2012-10-17
            Statement:
              - Effect: Allow
                Action: s3:GetObject
                Resource: !Sub "${DataBucket.Arn}/packages/*"
      Tags:
        - Key: Contact
          Value: !Ref Contact
        - Key: Environment
          Value: !Ref Environment
        - Key: Service
          Value: researcher-dashboard-runner

  # report-server's publish path. A user of its own because report-server's existing
  # credential reaches other buckets, and widening it would reach this one too.
  PackagesWriterUser:
    Type: AWS::IAM::User
    Properties:
      UserName: !Sub "researcher-dashboard-runner-${Environment}-packages-writer"
      Policies:
        - PolicyName: put-packages
          PolicyDocument:
            Version: 2012-10-17
            Statement:
              - Effect: Allow
                Action: s3:PutObject
                Resource: !Sub "${DataBucket.Arn}/packages/*"
      Tags:
        - Key: Contact
          Value: !Ref Contact
        - Key: Environment
          Value: !Ref Environment
        - Key: Service
          Value: researcher-dashboard-runner

  # UserName is the literal name, not !Ref PackagesWriterUser: a Ref to a user the same
  # update modifies can show the key as a conditional replacement. Bump Serial to
  # rotate: the old key is deleted once the new one exists, so update report-server's
  # PackagesAws* parameters straight away.
  PackagesWriterKey:
    Type: AWS::IAM::AccessKey
    DependsOn: PackagesWriterUser
    Properties:
      UserName: !Sub "researcher-dashboard-runner-${Environment}-packages-writer"
      Serial: 1
      Status: Active

  MicrovmImage:
    Type: AWS::Lambda::MicrovmImage
    Properties:
      Name: !Sub "researcher-dashboard-runner-${Environment}"
      Description: !Sub "Researcher Dashboard package runner (${Environment})"
      BaseImageArn: !Ref BaseImageArn
      BaseImageVersion: !Ref BaseImageVersion
      BuildRoleArn: !GetAtt BuildRole.Arn
      CodeArtifact:
        Uri: !Sub "s3://${CodeArtifactBucket}/${CodeArtifactKey}"
      CpuConfigurations:
        - Architecture: ARM_64
      Resources:
        - MinimumMemoryInMiB: !Ref BaselineMemoryInMiB
      # CAP_SYS_ADMIN: the runner gives each package its own empty network namespace,
      # without which the package could read the execution role's credentials from the
      # instance metadata service.
      AdditionalOsCapabilities: ["ALL"]
      EgressNetworkConnectors:
        - !Sub "arn:aws:lambda:${AWS::Region}:aws:network-connector:aws-network-connector:INTERNET_EGRESS"
      EnvironmentVariables:
        # Baked into the snapshot every VM shares, so nothing per researcher and nothing
        # secret. Per-VM values arrive in runHookPayload.
        - Key: PORT
          Value: !Ref HooksPort
        - Key: DATA_ROOT
          Value: /data
        - Key: SYNC_BACKEND
          Value: S3
        - Key: STATUS_BACKEND
          Value: FIRESTORE
      Hooks:
        Port: !Ref HooksPort
        MicrovmHooks:
          Run: ENABLED
          RunTimeoutInSeconds: 60
          Resume: ENABLED
          ResumeTimeoutInSeconds: 60
          Suspend: ENABLED
          SuspendTimeoutInSeconds: 60
          Terminate: ENABLED
          TerminateTimeoutInSeconds: 60
        MicrovmImageHooks:
          Ready: ENABLED
          ReadyTimeoutInSeconds: 600
          Validate: DISABLED
          ValidateTimeoutInSeconds: 600
      Logging:
        CloudWatch:
          LogGroup: !Ref LogGroup
      Tags:
        - Key: Contact
          Value: !Ref Contact
        - Key: Environment
          Value: !Ref Environment
        - Key: Service
          Value: researcher-dashboard-runner

Outputs:
  DataBucketName:
    Description: Bucket holding researcher datasets and published packages; the function's RD_DATA_BUCKET and report-server's PackageBuckets entry
    Value: !Ref DataBucket
  MicrovmImageArn:
    Description: ARN of the MicroVM image, the function's RD_MICROVM_IMAGE_ARN
    Value: !GetAtt MicrovmImage.ImageArn
  ExecutionRoleArn:
    Description: ARN the function passes to RunMicrovm, its RD_EXECUTION_ROLE_ARN
    Value: !GetAtt ExecutionRole.Arn
  BuildRoleArn:
    Description: ARN Lambda assumes to build the MicroVM image
    Value: !GetAtt BuildRole.Arn
  LauncherRoleArn:
    Description: Role the function assumes for MicroVM calls, its RD_LAUNCHER_ROLE_ARN. Its token audience, RD_AWS_AUDIENCE, is researcher-dashboard-runner-<Environment>
    Value: !GetAtt LauncherRole.Arn
  BrokerRoleArn:
    Description: Role the function assumes, with the same token audience, to mint a VM's storage credentials
    Value: !GetAtt BrokerRole.Arn
  PackagesWriterUserName:
    Description: IAM user report-server publishes packages as
    Value: !Ref PackagesWriterUser
  PackagesWriterUserArn:
    Description: ARN of report-server's packages writer user
    Value: !GetAtt PackagesWriterUser.Arn
  PackagesWriterAccessKey:
    Description: Access key of the packages writer, report-server's PackagesAwsAccessKeyId
    Value: !Ref PackagesWriterKey
  PackagesWriterSecretKey:
    Description: Secret key of the packages writer, report-server's PackagesAwsSecretAccessKey
    Value: !GetAtt PackagesWriterKey.SecretAccessKey
  LogGroupName:
    Description: CloudWatch log group for MicroVM build and runtime logs
    Value: !Ref LogGroup
```

`cloudformation/tests/test_runner_template.py`:

```python
"""What the runner stack grants, asserted over the template rather than a deployed stack.

Run from cloudformation/ with `python -m unittest discover -s tests`, with cfn-lint
installed, whose decoder reads the intrinsic-function tags (!Sub, !GetAtt, ...).
"""

import os
import unittest

from cfnlint.decode import decode

TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "researcher-dashboard-runner.yml")


def load():
    template, matches = decode(TEMPLATE)
    if matches:
        raise AssertionError(f"cannot parse {TEMPLATE}: {matches}")
    return template


def sub(expr):
    return {"Fn::Sub": expr}


class RunnerTemplate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t = load()
        cls.resources = cls.t["Resources"]

    def props(self, logical_id):
        return self.resources[logical_id]["Properties"]

    def of_type(self, resource_type):
        return [k for k, r in self.resources.items() if r["Type"] == resource_type]

    # A stack is created with these, and an update that changed one would replace the
    # resource: a retained bucket that then fails on its own name, a rebuilt image, a
    # role the function's settings no longer name, a rotated key.
    def test_create_only_values_never_change(self):
        expected = {
            ("DataBucket", "BucketName"): sub("researcher-dashboard-runner-${Environment}"),
            ("LogGroup", "LogGroupName"): sub("/aws/lambda-microvms/researcher-dashboard-runner-${Environment}"),
            ("BuildRole", "RoleName"): sub("researcher-dashboard-runner-${Environment}-build"),
            ("ExecutionRole", "RoleName"): sub("researcher-dashboard-runner-${Environment}-execution"),
            ("LauncherRole", "RoleName"): sub("researcher-dashboard-runner-${Environment}-launcher"),
            ("BrokerRole", "RoleName"): sub("researcher-dashboard-runner-${Environment}-broker"),
            ("PackagesWriterUser", "UserName"): sub("researcher-dashboard-runner-${Environment}-packages-writer"),
            ("PackagesWriterKey", "UserName"): sub("researcher-dashboard-runner-${Environment}-packages-writer"),
            ("PackagesWriterKey", "Serial"): 1,
            ("MicrovmImage", "Name"): sub("researcher-dashboard-runner-${Environment}"),
        }
        for (logical_id, prop), value in expected.items():
            with self.subTest(resource=logical_id, property=prop):
                self.assertEqual(self.props(logical_id)[prop], value)
        for logical_id in self.of_type("AWS::IAM::Role"):
            self.assertNotIn("Path", self.props(logical_id))
        self.assertEqual(self.resources["DataBucket"]["DeletionPolicy"], "Retain")
        self.assertEqual(self.resources["DataBucket"]["UpdateReplacePolicy"], "Retain")

    def test_the_bucket_keeps_one_lifecycle_rule_and_no_expiry(self):
        rules = self.props("DataBucket")["LifecycleConfiguration"]["Rules"]
        self.assertEqual(rules, [{
            "Id": "AbortIncompleteUploads",
            "Status": "Enabled",
            "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7},
        }])

    # Each output feeds a setting elsewhere (README.md, "What goes where"); a key output
    # beyond report-server's would be a credential nobody asked for.
    def test_the_outputs(self):
        self.assertEqual(sorted(self.t["Outputs"]), sorted([
            "DataBucketName", "MicrovmImageArn", "ExecutionRoleArn", "BuildRoleArn", "LauncherRoleArn",
            "BrokerRoleArn", "PackagesWriterUserName", "PackagesWriterUserArn", "PackagesWriterAccessKey",
            "PackagesWriterSecretKey", "LogGroupName",
        ]))
        self.assertEqual(self.t["Outputs"]["PackagesWriterAccessKey"]["Value"], {"Ref": "PackagesWriterKey"})
        self.assertEqual(self.t["Outputs"]["PackagesWriterSecretKey"]["Value"],
                         {"Fn::GetAtt": ["PackagesWriterKey", "SecretAccessKey"]})


if __name__ == "__main__":
    unittest.main()
```

`cloudformation/requirements.txt`:

```
cfn-lint==1.57.0
```

`cloudformation/check.sh` (executable):

```sh
#!/bin/sh
# Lints and tests the templates as CI does, in a container, since a host may lack
# python3-venv. Run from anywhere. No bytecode: the container runs as root, and a
# __pycache__ it wrote into tests/ would be root-owned in the working tree.
set -eu
cd "$(dirname "$0")"
docker run --rm -v "$PWD:/w" -w /w -e PYTHONDONTWRITEBYTECODE=1 python:3.12-slim sh -c \
  'pip install -q -r requirements.txt && cfn-lint *.yml && python -m unittest discover -s tests'
```

`.github/workflows/cloudformation.yml`:

```yaml
# Lints the stack templates and runs their tests. Deploying is by hand (cloudformation/README.md),
# so this needs no AWS credentials.

name: CloudFormation

on:
  push:
    paths:
      - "cloudformation/**"
      - ".github/workflows/cloudformation.yml"

permissions:
  contents: read

jobs:
  lint_test:
    name: Lint and test the templates
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: cloudformation
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: cloudformation/requirements.txt
      - run: pip install -r requirements.txt
      - run: cfn-lint *.yml
      - run: python -m unittest discover -s tests
```

`README.md`, in "Layout", after the `runner/scripts/` entry:

```markdown
- `cloudformation/`: the runner stack's template, one stack per environment, applied by hand as its README
  describes, with tests of what it grants.
```

**Verified**: lint clean, three tests pass.

---

### Tests of what each principal is granted

**Summary**: Six tests, each an exact comparison, with the helpers they share, so that a widened grant fails as surely as a lost one (R18): the two roles' Google trust and the unique-ID parameter (R10); the launcher's statements (R8); no AWS key for the function (R9); the broker's ceiling (R11); the execution role at logs only, and no `scripts/` anywhere (R13); the packages writer (R14). A helper gathers statements from separate policy resources that name a role or user, so a grant added beside an inline policy is caught too.

**Files affected**:
- `cloudformation/tests/test_runner_template.py`: constants, helpers, six tests

**Estimated diff size**: ~140 lines

After `TEMPLATE`:

```python
IMAGE = {"Fn::GetAtt": ["MicrovmImage", "ImageArn"]}
ANY_VM = {"Fn::Sub": "arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:microvm:*"}
```

After `sub`:

```python
def as_list(value):
    return value if isinstance(value, list) else [value]


def statements(policies):
    return [s for p in policies for s in p["PolicyDocument"]["Statement"]]


def connector(name):
    return sub(f"arn:aws:lambda:${{AWS::Region}}:aws:network-connector:aws-network-connector:{name}")


# The one statement both roles the function assumes trust: the function's own Google
# service account, by unique ID in both azp and sub, with a token minted for this stack.
FUNCTION_TRUST = [{
    "Effect": "Allow",
    "Principal": {"Federated": "accounts.google.com"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {"StringEquals": {
        "accounts.google.com:aud": {"Ref": "FunctionServiceAccountUniqueId"},
        "accounts.google.com:sub": {"Ref": "FunctionServiceAccountUniqueId"},
        "accounts.google.com:oaud": sub("researcher-dashboard-runner-${Environment}"),
    }},
}]
```

In `RunnerTemplate`, after `of_type`:

```python
    def attached_policies(self, kind, logical_id):
        """Statements in separate policy resources that name the role or user."""
        key, plural = ("RoleName", "Roles") if kind == "role" else ("UserName", "Users")
        found = []
        for r in self.resources.values():
            if r["Type"] in ("AWS::IAM::Policy", "AWS::IAM::RolePolicy", "AWS::IAM::UserPolicy",
                             "AWS::IAM::ManagedPolicy"):
                p = r["Properties"]
                if {"Ref": logical_id} in as_list(p.get(key, p.get(plural, []))):
                    found += p["PolicyDocument"]["Statement"]
        return found
```

In `RunnerTemplate`, after `test_the_bucket_keeps_one_lifecycle_rule_and_no_expiry`:

```python
    # AWS does not require a sub condition for Google, so without it any Google service
    # account whose token names the audience could assume these roles.
    def test_only_the_functions_service_account_may_assume_the_launcher_and_broker(self):
        for logical_id in ("LauncherRole", "BrokerRole"):
            with self.subTest(role=logical_id):
                self.assertEqual(self.props(logical_id)["AssumeRolePolicyDocument"]["Statement"], FUNCTION_TRUST)
        federated = [k for k in self.of_type("AWS::IAM::Role")
                     if "Federated" in repr(self.props(k)["AssumeRolePolicyDocument"])]
        self.assertEqual(sorted(federated), ["BrokerRole", "LauncherRole"])
        self.assertEqual(self.t["Parameters"]["FunctionServiceAccountUniqueId"]["AllowedPattern"], "^[0-9]+$")
        self.assertNotIn("Default", self.t["Parameters"]["FunctionServiceAccountUniqueId"])

    # Exactly what the function calls, on the resources it calls them on: the launch,
    # the reuse check, the resume, the watchdog's and /idle's suspend and terminate. No
    # auth token, so nothing can open a VM's endpoint, and no shell connector.
    def test_the_launcher_holds_what_the_function_calls_and_nothing_else(self):
        role = self.props("LauncherRole")
        for absent in ("ManagedPolicyArns", "PermissionsBoundary"):
            self.assertNotIn(absent, role)
        self.assertEqual(self.attached_policies("role", "LauncherRole"), [])
        self.assertEqual(statements(role["Policies"]), [
            {"Effect": "Allow", "Action": "lambda:RunMicrovm", "Resource": [IMAGE, ANY_VM]},
            {"Effect": "Allow", "Action": "lambda:GetMicrovmImage", "Resource": IMAGE},
            {"Effect": "Allow",
             "Action": ["lambda:GetMicrovm", "lambda:ResumeMicrovm", "lambda:SuspendMicrovm", "lambda:TerminateMicrovm"],
             "Resource": [ANY_VM, IMAGE]},
            {"Effect": "Allow", "Action": "lambda:PassNetworkConnector",
             "Resource": [connector("HTTP_INGRESS"), connector("INTERNET_EGRESS")]},
            {"Effect": "Allow", "Action": "iam:PassRole", "Resource": {"Fn::GetAtt": ["ExecutionRole", "Arn"]}},
        ])
        self.assertNotIn("AuthToken", repr(self.t))
        self.assertNotIn("SHELL_INGRESS", repr(self.t))

    # The function holds no AWS key. The only key the stack makes is report-server's.
    def test_the_function_has_no_aws_key(self):
        self.assertEqual(self.of_type("AWS::IAM::AccessKey"), ["PackagesWriterKey"])
        self.assertEqual(self.of_type("AWS::IAM::User"), ["PackagesWriterUser"])
        self.assertEqual(sorted(k for k, o in self.t["Outputs"].items() if "PackagesWriterKey" in repr(o["Value"])),
                         ["PackagesWriterAccessKey", "PackagesWriterSecretKey"])

    # The most any broker session can hold: every researcher's prefix read-write, which
    # the function's session policy narrows to one, and published packages read-only.
    def test_the_broker_ceiling_is_the_researchers_prefix_and_packages_read(self):
        role = self.props("BrokerRole")
        self.assertEqual(role["MaxSessionDuration"], 3600)
        for absent in ("ManagedPolicyArns", "PermissionsBoundary"):
            self.assertNotIn(absent, role)
        self.assertEqual(self.attached_policies("role", "BrokerRole"), [])
        self.assertEqual(statements(role["Policies"]), [
            {
                "Effect": "Allow",
                "Action": "s3:ListBucket",
                "Resource": {"Fn::GetAtt": ["DataBucket", "Arn"]},
                "Condition": {"StringLike": {"s3:prefix": "researchers/*"}},
            },
            {
                "Effect": "Allow",
                "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
                "Resource": sub("${DataBucket.Arn}/researchers/*"),
            },
            {
                "Effect": "Allow",
                "Action": "s3:GetObject",
                "Resource": sub("${DataBucket.Arn}/packages/*"),
            },
        ])

    # A package that escapes its sandbox can read this role's credentials, so it writes
    # the VM's logs and nothing else. Nothing names the spike's scripts/ prefix either.
    def test_the_execution_role_writes_its_logs_and_nothing_else(self):
        role = self.props("ExecutionRole")
        self.assertEqual(statements(role["Policies"]), [{
            "Effect": "Allow",
            "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
            "Resource": sub("${LogGroup.Arn}:*"),
        }])
        for absent in ("ManagedPolicyArns", "PermissionsBoundary"):
            self.assertNotIn(absent, role)
        self.assertEqual(self.attached_policies("role", "ExecutionRole"), [])
        self.assertNotIn("scripts/", repr(self.t))

    def test_the_packages_writer_can_put_packages_and_nothing_else(self):
        user = self.props("PackagesWriterUser")
        for absent in ("Groups", "ManagedPolicyArns", "LoginProfile", "PermissionsBoundary"):
            self.assertNotIn(absent, user)
        self.assertEqual(statements(user["Policies"]) + self.attached_policies("user", "PackagesWriterUser"), [{
            "Effect": "Allow",
            "Action": "s3:PutObject",
            "Resource": sub("${DataBucket.Arn}/packages/*"),
        }])
        self.assertEqual(self.of_type("AWS::IAM::UserToGroupAddition"), [])
```

**Verified**: lint clean, nine tests pass. Thirty-eight mutations, each linted and fully tested in one container: every one fails exactly the test aimed at it (requirements, "Stage 4 verification"), and every one but `PackagesWriterKey` naming its user by `Ref` (cfn-lint `W3005`) lints clean.

| Mutation | Fails |
|---|---|
| `sub` dropped on either role, `sub`, `aud` or `oaud` wrong, `StringLike` with `*`, a second federated statement, an AWS principal added, a default on the unique ID | `test_only_the_functions_service_account_may_assume_the_launcher_and_broker` |
| `CreateMicrovmAuthToken`, `CreateMicrovmShellAuthToken`, `lambda:*` or an `sts:` action added; `ResumeMicrovm`, `SuspendMicrovm` or `TerminateMicrovm` dropped; `SHELL_INGRESS` added | `test_the_launcher_holds_what_the_function_calls_and_nothing_else` |
| a launcher user and key | `test_the_function_has_no_aws_key` |
| a launcher key output | that, and `test_the_outputs` |
| broker: `packages/` put or list, resource widened, list condition opened, a managed policy, a third policy | `test_the_broker_ceiling_is_the_researchers_prefix_and_packages_read` |
| execution role: S3, `SuspendMicrovm` or `cloudwatch:PutMetricData` back, a managed policy, a separate `RolePolicy`, `scripts/` in an output | `test_the_execution_role_writes_its_logs_and_nothing_else` |
| writer: `GetObject` added, resource widened | `test_the_packages_writer_can_put_packages_and_nothing_else` |
| writer key `Serial` bumped or `UserName` by `Ref`, bucket or launcher role renamed | `test_create_only_values_never_change` |
| an expiration rule | `test_the_bucket_keeps_one_lifecycle_rule_and_no_expiry` |

---

### How the stack is applied

**Summary**: `cloudformation/README.md` (R20 to R22): the prerequisites of a new account, creating and updating a stack, what each output feeds, rotating the writer's key, the broker's session policy (R12), the live checks, and the one-time move of staging to the QA account. It is written for whoever runs the staging rollout, and kept general enough for the RD-1 production line.

**Files affected**:
- `cloudformation/README.md`: new

**Estimated diff size**: ~230 lines

````markdown
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

Creating the stack builds the image, which waits on the runner's `/ready` hook. A build that fails takes the create down with it, and the bucket, which is retained, is then left behind holding the name.

## Updating a stack

A change set from the head of the pull request's branch before it merges, named for that commit, every existing parameter keeping its value:

```sh
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
3. **Create the stack** as above, with `FunctionServiceAccountUniqueId` from `setup-researcher-dashboard-iam.sh check report-service-dev`. If the bucket name is refused as taken, S3 has not yet released it from step 1; wait and retry.
4. **Point report-service-dev's function at it** (above), by a report-service pull request, then deploy.
5. **Give report-server staging the packages writer's key** (above).
6. **Run the live checks** above and record the results against RD-1's spec. Then audit who can act as the function in GCP IAM, in report-service-dev and report-service-pro: who holds OpenID Token Creator or Token Creator on the `researcher-dashboard` account, and who may deploy functions that run as it.
````

**Verified**: the `assume` helper, run against a stand-in `aws`, passes `--policy` with its spaces intact and leaves it off when no policy is given, and `TOKEN=… assume` changes the token for that call only. `--allowed-ports port=8080` passes the CLI's parameter validation (2.36.17), where an unknown key does not. The session-policy heredoc is RD-1 pass 2's, which was checked to minify to the contract byte for byte. No `aws` call against the stack was run: there is no stack yet.

---

## Rollout

Before the merge, from the head of this branch, by the operator, in the README's order ("Moving staging to the QA account"), with credentials for 612297603577 and 816253370536 and the OpenID Token Creator grant for the live checks. The report-service pull request that repoints the function can be the same one that sets its `PORTAL_PUBLIC_KEYS` (`plan.md`, sprint 27 ops steps), if that has not merged first. A problem the rollout finds is fixed on this branch and applied again before the merge (Doug, 2026-10-08). The results are recorded against this spec. The endpoint check waits for the stack's first VM on RD-4 pass 2's runner. Production is created on the RD-1 production line from the same README, with `FunctionServiceAccountUniqueId` from report-service-pro.

## Open Questions

### RESOLVED: Judgment call: grants land in the template step, and their tests in the next
**Options considered**: one step holding the template and every test (about 700 lines); the spike's grants first as a carry-over step, then the keyless and final grants as diffs; the template with its non-grant tests, then the grant tests.
**Decision**: The last. One step is over the size a reviewer reads in one sitting. A carry-over step would add a launcher user only for the next step to delete it, which was worth doing when the first step was "changes nothing" against a live stack and is not now. Each of the two steps passes its own tests.

### RESOLVED: Judgment call: the live checks set credentials by `eval` in subshells
**Options considered**: separate `--profile`s written to `~/.aws/credentials`; exported variables in the operator's shell; an `assume` helper whose exports are `eval`ed inside `( ... )`.
**Decision**: The helper in subshells. Nothing is written to disk, a session cannot leak into the next check, and each block reads as the principal it tests.

## Self-Review

Stage 7, run unattended. Roles: the reviewer of the commits, the test writer, the operator running the rollout, and a Security Engineer. Claims about the proposed files were checked by building them from this spec's own code blocks (step 1 alone, and steps 1 and 2 together), linting, running the tests, and re-running the thirty-eight mutations against the tests as rebuilt. Findings that did not survive were dropped.

### Reviewer of the commits

#### RESOLVED: Step 1's test file carried two helpers nothing in it called
`as_list` and `statements` were defined in step 1 and first used in step 2, which an AST check of step 1's file confirmed. Fixed: both move to step 2's helper block. Step 1 alone and both steps together were rebuilt from the spec afterward: lint clean, three and nine tests passing, no unused helper in either, and the template and README byte for byte the files stage 4 tested.

### Test writer

No finding survived. Checked: every test compares a whole list or set, so each of the thirty-eight mutations fails exactly the test aimed at it, re-run against the tests as rebuilt from this spec. `AuthToken` and `scripts/` are searched in the decoded template, which drops YAML comments, so the template's own comment naming `CreateMicrovmAuthToken` does not trip the test (the clean template passes).

### Operator running the rollout

#### RESOLVED: The live checks did not say whose credentials read the outputs
`out` calls `describe-stacks`, which needs the stack account's credentials, while the blocks after it switch to the writer's key or a role's session. Fixed: the README says to run the section with the stack account's credentials, and each block's switch stays inside its subshell.

Checked and unchanged: `concordqa-devops` uses SSE-S3 and has no bucket policy (2026-10-07), so the QA build role's own IAM `GetObject` is enough to read the artifact. Deleting the spike's stack leaves its bucket, which is `Retain`, so the README's explicit empty-and-delete is needed.

### Security Engineer

No finding survived. Checked: the writer's key is exported only inside a subshell and never printed; the operator's OpenID Token Creator grant is taken and revoked around the checks that need it; the probe session ids and keys are test values and are removed after. The `assume` helper's `--duration-seconds 3600` is within both roles' `MaxSessionDuration`.

## Stage 8: cross-reference with the requirements

Checked in both directions. Nothing was added to the plan or trimmed from the requirements to make them agree.

| Requirement | Where |
|---|---|
| R1 to R7, R23 | The template step (template, `check.sh`, CI workflow, layout line) |
| R8 to R11, R13 to R17 | The template step for the grants, the grant-tests step for their tests |
| R12 | The README step ("The storage broker's session policy"); `speccing.md` in the docs pass after the squash (Doug, 2026-10-07) |
| R18 | The template step and the grant-tests step; CI in the template step |
| R19 | Nothing to change |
| R20, R21 | The README step's live checks and audit, run in the rollout |
| R22 | The README step |

No step lacks a requirement. Two questions went to Doug on 2026-10-07:
- **The audience:** derived in the template as the stack's name, which the plan already built and tested.
- **R12's `speccing.md` record had no step:** it is written in the docs pass that follows the squash, with the rest of the oob docs the fold changes.

