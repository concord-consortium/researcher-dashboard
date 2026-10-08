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
