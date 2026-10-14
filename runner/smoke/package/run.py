#!/usr/bin/env python3
"""The runner's smoke package: the gate on the image.

It reads scope.json as every package does, creates and pulls a Student Answers run for the
scope's class with cc-data, as the researcher who launched it, and checks the columns the
official packages read. A report-service or cc-data change that renames one fails here, on
the smoke run, rather than in a researcher's result. It stays on a Student Answers run,
because report_prompts is built only from those.
"""
import json
import os
import subprocess
import sys
import time

# The columns the official packages read: cc-data's contract columns on answers, and the
# run_answers columns wildfire-responses counts through.
# What smoke.mjs stack looks for in the result's display; its MARKER must match.
MARKER = "RUNNER-SMOKE-OK"
COLUMNS = {
    "answers": ["source_key", "remote_endpoint", "question_id"],
    "run_answers": ["run_id", "type", "remote_endpoint", "source_key", "question_id"],
}
PROMPT_ROWS = 2
# Written by `smoke.mjs build --hold`, for a run that has to outlast the session token's first hour.
HOLD_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hold.txt")


def cc_data(*args):
    result = subprocess.run(["cc-data", *args], capture_output=True, text=True)
    if result.returncode != 0:
        detail = " ".join(p for p in (result.stderr.strip(), result.stdout.strip()) if p)
        raise RuntimeError(f"cc-data {' '.join(args[:2])} exited {result.returncode}: {detail or '(no output)'}")
    return result.stdout


def query(dataset, sql):
    return json.loads(cc_data("query", "--dataset", dataset, sql, "--format", "json"))


def main():
    with open(os.environ["RD_SCOPE_FILE"], encoding="utf-8") as handle:
        scope = json.load(handle)
    dataset = os.environ["RD_DATASET"]
    class_id = scope["classes"][0]["class_id"]
    output_dir = scope["output_dir"]

    try:
        cc_data("dataset", "create", dataset)
    except RuntimeError as err:
        if "exists" not in str(err).lower():
            raise
    # `reports create` takes the portal, not a dataset, and wraps its answer as {"run": ...}.
    created = json.loads(cc_data("reports", "create", "--portal", os.environ["CC_DATA_PORTAL"],
                                 "--report-slug", "student-answers",
                                 "--report-filter", json.dumps({"class": [int(class_id)]}), "--json"))
    run_id = str(created["run"]["run_id"])
    cc_data("get", "report", run_id, "--dataset", dataset, "--refresh")
    cc_data("get", "answers", run_id, "--dataset", dataset)

    missing = []
    for view, columns in COLUMNS.items():
        present = {row["column_name"] for row in query(dataset, f"DESCRIBE {view}")}
        missing += [f"{view}.{c}" for c in columns if c not in present]
    # Before any query that reads them, so a renamed column is named rather than a binder error.
    if missing:
        raise RuntimeError(f"the dataset lacks the columns the official packages read: {', '.join(missing)}")
    # Counted for this run alone: the dataset outlives the VM, so it holds every earlier run's too.
    run = int(run_id)
    prompts = query(dataset, f"SELECT count(*) AS n FROM report_prompts WHERE run_id = {run}")[0]["n"]
    answers = query(dataset, f'SELECT count(*) AS n FROM "answers_{run}"')[0]["n"]
    run_answers = query(dataset, f"SELECT count(*) AS n FROM run_answers WHERE run_id = {run}")[0]["n"]
    if answers == 0:
        raise RuntimeError(f"run {run_id} pulled no answers, so run_answers' binding cannot be checked")
    if run_answers != answers:
        raise RuntimeError(f"run_answers holds {run_answers} answers for run {run_id}, not the {answers} the run pulled")
    if prompts != PROMPT_ROWS:
        raise RuntimeError(f"report_prompts has {prompts} rows, not the {PROMPT_ROWS} pseudo-header rows")
    if os.path.exists(HOLD_FILE):
        with open(HOLD_FILE, encoding="utf-8") as handle:
            time.sleep(int(handle.read().strip()))

    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "display.md"), "w", encoding="utf-8") as handle:
        handle.write(f"# Runner smoke check\n\n{MARKER}\n\n- class {class_id}\n- {answers} answers\n- columns checked: "
                     + ", ".join(f"{v}.{c}" for v, cs in COLUMNS.items() for c in cs) + "\n")
    with open(os.path.join(output_dir, "summary.txt"), "w", encoding="utf-8") as handle:
        handle.write(f"{MARKER}: {answers} answers for class {class_id}\n")
    with open(os.path.join(output_dir, "counts.json"), "w", encoding="utf-8") as handle:
        json.dump({"answers": answers}, handle)
    print(json.dumps({"answers": answers, "prompts": prompts}))


if __name__ == "__main__":
    try:
        main()
    except Exception as err:  # the reason reaches the result document, redacted by the runner
        print(str(err), file=sys.stderr)
        sys.exit(1)
