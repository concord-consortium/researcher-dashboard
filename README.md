# researcher-dashboard

The Researcher Dashboard: a browser app a researcher opens from the portal, and the runner that runs packages for it on a per-researcher Lambda MicroVM.

One repository holds both halves because they share the result a package writes, which the runner stores and the app renders. They are deployed and versioned independently.

## Layout

- `app/`: the React dashboard a researcher lands on from the portal's Research Classes table. Built and
  deployed to S3 behind CloudFront.
- `runner/`: the container image that runs packages. An HTTP server on 8080 answering the MicroVM lifecycle hooks, a loop that asks report-service for its work and its storage credentials, storage sync (S3 on the broker's credentials in AWS, a directory locally), the CLUE reader, and the tooling packages need. No package is baked into the image; packages are fetched from S3 when the runner takes them. `runner/README.md` covers its configuration and its smoke gate.
- `fixtures/`: a copy of report-service's package contract fixture (identity, version and package-key cases, and the limits), which the runner's grammar and duration ceiling are tested against.
- `cloudformation/`: the runner stack's template, one stack per environment, applied by hand as its README
  describes, with tests of what it grants.

## Release lines

The two halves release separately, each with its own version prefixed by the half it belongs to:

- `app x.y.z`
- `runner x.y.z`

A release of one does not imply a release of the other. When a change alters the result the runner writes, both are released, app last, so the runner never writes a shape the deployed app cannot read.

## Building cc-data-cli

The runner image builds cc-data-cli from source at its pinned tag with `CGO_ENABLED=1`, because DuckDB
is embedded through cgo and there is no published `linux_arm64` binary. Building inside the image also
keeps the binary on the image's own glibc rather than a release runner's.
