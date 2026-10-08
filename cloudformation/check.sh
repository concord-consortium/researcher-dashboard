#!/bin/sh
# Lints and tests the templates as CI does, in a container, since a host may lack
# python3-venv. Run from anywhere. No bytecode: the container runs as root, and a
# __pycache__ it wrote into tests/ would be root-owned in the working tree.
set -eu
cd "$(dirname "$0")"
docker run --rm -v "$PWD:/w" -w /w -e PYTHONDONTWRITEBYTECODE=1 python:3.12-slim sh -c \
  'pip install -q -r requirements.txt && cfn-lint *.yml && python -m unittest discover -s tests'
