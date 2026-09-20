#!/usr/bin/env bash
# Publishes an analysis package to the bucket the runner fetches from.
#
#   publish-package.sh <study-dir> <version> <bucket>
#
# Writes <version>.zip and <version>.sha256 under scripts/<name>/, where <name> comes
# from the study's own manifest.json rather than the directory, so the key a runner
# fetches and the name the manifest declares cannot drift apart: the runner refuses a
# package whose manifest names something else.
#
# The checksum is published beside the archive as the record of what was uploaded. It is
# not what the runner trusts; a /run-package request carries the checksum it expects, so
# publishing a new archive under an old version does not silently become the package.
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "usage: $(basename "$0") <study-dir> <version> <bucket>" >&2
  exit 2
fi

study_dir=$1
version=$2
bucket=$3

[ -d "$study_dir" ] || { echo "no such study directory: $study_dir" >&2; exit 1; }
manifest="$study_dir/manifest.json"
[ -f "$manifest" ] || { echo "no manifest.json in $study_dir" >&2; exit 1; }

name=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["name"])' "$manifest")
manifest_version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$manifest")

if [ "$manifest_version" != "$version" ]; then
  echo "manifest.json says version $manifest_version, not $version" >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
archive="$work/$version.zip"

# The study's own files, plus the shared `_lib` beside it if there is one. A study
# imports it as `_lib.<module>`, which works because it lands at the archive root next to
# the entrypoint and the entrypoint puts its own directory on the path. Shared rather than
# copied per study, so the SQL describing how cc-data lays a report out has one home.
staged="$work/package"
mkdir -p "$staged"
copy_tree() {
  ( cd "$1" && find . -type f -not -path './local-data/*' -not -path '*/__pycache__/*' \
      -not -name '*.pyc' -print0 | LC_ALL=C sort -z \
      | tar --null -cf - --files-from=- ) | ( cd "$2" && tar -xf - )
}
copy_tree "$study_dir" "$staged"

shared_lib="$(dirname "$study_dir")/_lib"
if [ -d "$shared_lib" ]; then
  mkdir -p "$staged/_lib"
  copy_tree "$shared_lib" "$staged/_lib"
fi

# -X drops extra file attributes, and the sorted file list plus a fixed timestamp make
# the archive reproducible: the same study publishes to the same checksum, so a rebuild
# is visibly a rebuild rather than a new package.
( cd "$staged" && find . -type f -print0 | LC_ALL=C sort -z \
  | xargs -0 touch -t 202001010000.00 2>/dev/null || true )
( cd "$staged" && find . -type f -print | LC_ALL=C sort | zip -X -q "$archive" -@ )

checksum="sha256:$(sha256sum "$archive" | cut -d' ' -f1)"
echo "$checksum" > "$work/$version.sha256"

aws s3 cp "$archive" "s3://$bucket/scripts/$name/$version.zip"
aws s3 cp "$work/$version.sha256" "s3://$bucket/scripts/$name/$version.sha256"

echo "published $name $version"
echo "  s3://$bucket/scripts/$name/$version.zip"
echo "  $checksum"
