"""What the runner stack grants, asserted over the template rather than a deployed stack.

Run from cloudformation/ with `python -m unittest discover -s tests`, with cfn-lint
installed, whose decoder reads the intrinsic-function tags (!Sub, !GetAtt, ...).
"""

import os
import unittest

from cfnlint.decode import decode

TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "researcher-dashboard-runner.yml")
IMAGE = {"Fn::GetAtt": ["MicrovmImage", "ImageArn"]}
ANY_VM = {"Fn::Sub": "arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:microvm:*"}


def load():
    template, matches = decode(TEMPLATE)
    if matches:
        raise AssertionError(f"cannot parse {TEMPLATE}: {matches}")
    return template


def sub(expr):
    return {"Fn::Sub": expr}


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


class RunnerTemplate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.t = load()
        cls.resources = cls.t["Resources"]

    def props(self, logical_id):
        return self.resources[logical_id]["Properties"]

    def of_type(self, resource_type):
        return [k for k, r in self.resources.items() if r["Type"] == resource_type]

    def attached_policies(self, kind, logical_id):
        """Statements in separate policy resources that name the role or user, by Ref or by its name."""
        key, plural = ("RoleName", "Roles") if kind == "role" else ("UserName", "Users")
        names = [{"Ref": logical_id}, self.props(logical_id)[key]]
        found = []
        for r in self.resources.values():
            if r["Type"] in ("AWS::IAM::Policy", "AWS::IAM::RolePolicy", "AWS::IAM::UserPolicy",
                             "AWS::IAM::ManagedPolicy"):
                p = r["Properties"]
                if any(n in names for n in as_list(p.get(key, p.get(plural, [])))):
                    found += p["PolicyDocument"]["Statement"]
        return found

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
