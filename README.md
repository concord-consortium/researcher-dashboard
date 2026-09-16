# researcher-dashboard

The Analyze Class researcher dashboard: a browser app and the runner that performs an analysis for it.

One repository holds both halves because they share the `display.json` contract, the projection the
runner writes and the app renders. They are deployed and versioned independently.

## Layout

- `app/`: the React dashboard a researcher lands on from the portal's Research Classes table. Built and
  deployed to S3 behind CloudFront.
- `runner/`: the container image that runs an analysis. An HTTP server on 8080 answering the MicroVM
  lifecycle hooks and `POST /analyze`, storage sync (S3 in AWS, a bind mount locally), the CLUE reader,
  and the tooling the analysis packages need. No analysis script is baked into the image; packages are
  fetched from S3 at analysis time.
- `runner/scripts/`: operational scripts for the runner, including package publishing.

## Release lines

The two halves release separately, each with its own version prefixed by the half it belongs to:

- `app x.y.z`
- `runner x.y.z`

A release of one does not imply a release of the other. When a change alters the `display.json`
contract, both are released, app last, so the runner never writes a shape the deployed app cannot read.

## Building cc-data-cli

The runner image builds cc-data-cli from source at its pinned tag with `CGO_ENABLED=1`, because DuckDB
is embedded through cgo and there is no published `linux_arm64` binary. Building inside the image also
keeps the binary on the image's own glibc rather than a release runner's.
