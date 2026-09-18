# Runner image: tooling only. No analysis script is baked in; packages are fetched
# from S3 at /analyze. Nothing secret is present at build time, because every VM
# launched from this image shares one snapshot.

ARG AL2023_TAG=2023
ARG RUNTIME_IMAGE=public.ecr.aws/lambda/microvms:al2023-minimal
ARG GO_VERSION=1.27.1
ARG DUCKDB_VERSION=1.5.5
ARG CC_DATA_REF=v0.2.0

# cc-data-cli embeds DuckDB through cgo, so it is compiled rather than downloaded:
# there is no linux_arm64 release, and a published linux binary carries the glibc
# floor of whatever runner built it. The builder is the full AL2023 image because it
# needs a Go toolchain and gcc; it carries the same glibc 2.34 as the runtime base
# below, so the binary's floor matches the image it ends up in.
FROM amazonlinux:${AL2023_TAG} AS ccdata
ARG GO_VERSION
ARG CC_DATA_REF
# libstdc++-devel is for the linker, not the compiler: DuckDB's static libraries are
# C++, so linking cc-data-cli needs libstdc++.so even though no C++ is compiled here.
RUN dnf -y install gcc libstdc++-devel git tar gzip && dnf clean all
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-arm64.tar.gz" \
      | tar -C /usr/local -xz
ENV PATH=/usr/local/go/bin:$PATH CGO_ENABLED=1
WORKDIR /src
RUN git clone --depth 1 --branch "${CC_DATA_REF}" \
      https://github.com/concord-consortium/cc-data-cli.git .
RUN go build -trimpath -ldflags "-s -w -X main.version=${CC_DATA_REF#v}" -o /out/cc-data .

# The Lambda MicroVM container base image. Every VM resumes from one shared snapshot
# of this filesystem and memory, so the base has to be snapshot compatible: AWS ships
# a matching OpenSSL here, and warns that anything seeding a CSPRNG before the
# snapshot hands every VM the same stream. It arrives with libstdc++ and curl; the
# install below adds what it omits.
FROM ${RUNTIME_IMAGE}
ARG DUCKDB_VERSION

# Node is pinned to a major line rather than taking the `nodejs` default, so a later
# rebuild cannot change the runtime under a shared VM snapshot. 24 is the current LTS
# line; the Firebase client SDK declares no engine ceiling and firebase-admin wants >=22.
# util-linux supplies setpriv and iproute supplies `ip netns`, which the runner uses to
# run an analysis package as an unprivileged uid inside a network namespace whose only
# route out is the egress proxy. iptables is what keeps the runner's own HTTP server
# off the one address that namespace can reach. procps-ng supplies sysctl, which is how
# IPv6 is disabled inside the namespace; the base image does not carry it.
RUN dnf -y install python3.11 nodejs24 nodejs24-npm unzip tar gzip shadow-utils ca-certificates \
      util-linux \
      iproute \
      iptables-nft \
      procps-ng \
    && dnf clean all

RUN curl -fsSL -o /tmp/duckdb.zip \
      "https://github.com/duckdb/duckdb/releases/download/v${DUCKDB_VERSION}/duckdb_cli-linux-arm64.zip" \
    && unzip -q /tmp/duckdb.zip -d /usr/local/bin \
    && rm /tmp/duckdb.zip \
    && chmod +x /usr/local/bin/duckdb

COPY --from=ccdata /out/cc-data /usr/local/bin/cc-data

# The analysis user runs fetched packages: no tokens, no credential store, a
# read-only dataset and a writable output directory are handed to it per analysis.
RUN useradd --create-home --shell /usr/sbin/nologin analysis

WORKDIR /srv
# Dependencies before source, so editing the runner does not reinstall them. Only
# production dependencies: the tests run on the host and their runner is built into
# Node, so nothing dev-only belongs in a snapshot every VM shares.
COPY package.json package-lock.json /srv/
RUN npm ci --omit=dev && npm cache clean --force
COPY server/ /srv/server/
# /data is the researcher's synced tree, owned by the runner; /work holds an
# analysis's output and is handed to the analysis user.
RUN mkdir -p /work /data && chown analysis:analysis /work

EXPOSE 8080
CMD ["node", "/srv/server/index.js"]
