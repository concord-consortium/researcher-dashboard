# RD-15: raise the 64 KiB limit on a package's display.md

**Jira**: https://concord-consortium.atlassian.net/browse/RD-15

**Status**: **Closed**

**Two repos**: this spec covers the runner half, in this repo. The cc-data-cli half (`cc-data package run`) is its own branch, `RD-15-raise-display-limit` in cc-data-cli, and its own PR.

## Overview

A package's `display.md` is refused when it is over 64 KiB, and REPORT-189's CLUE Dataflow page is larger (about 364 to 399 KiB for the largest September class). This raises the display limit to 440 KiB in the runner and in `cc-data package run`, and gives `summary.txt` and `counts.json` their own constant at today's 64 KiB.

## Project Owner Overview

Packages that report on every episode in a class write pages of a few hundred kilobytes, and the dashboard refused anything over 64 KB. REPORT-189's package cannot run on most September classes until the limit goes up. The page stays where it is stored today, in the one database record that holds a package's result (Doug, 2026-10-24); storing it elsewhere is RD-16.

## Background

The runner refuses a `display.md` over `DISPLAY_LIMIT_BYTES` (`runner/server/package-env.js`), writing the run `failed` with the size and the limit; it never truncates. `readOwnFile` reads at most a limit plus one byte, the summary is the first line of what was read, and only three keys of `counts.json` are kept. `cc-data package run` reproduces all three reads (`internal/packages/result.go`).

A result document holds the display and the summary twice, the current run's and `previous` (report-service `queue.ts` `PREVIOUS_FIELDS`). Two displays at 440 KiB (450,560 bytes each) and two summaries at their most (65,537 bytes each) come to 1,032,194 bytes, leaving about 16 KB of Firestore's 1 MiB (1,048,576) for the document's name and other fields, which take under 4 KB.

## Requirements

- **R1.** The display limit is 440 KiB (450,560 bytes) of UTF-8, in the runner's `DISPLAY_LIMIT_BYTES` and cc-data-cli's `DisplayLimitBytes`. A `display.md` at the limit is accepted and one a byte over is refused with the existing message; it is never truncated.
- **R2.** `summary.txt` and `counts.json` are read under their own constant at today's 64 KiB (65,536 bytes), in both repos (`OUTPUT_READ_LIMIT_BYTES`, `OutputReadLimitBytes`), with today's behavior unchanged.
- **R3.** The existing edge tests move to the new value in both repos: the runner's `package-env.test.js` display test (at the limit, one byte over, and a two-byte character over) and cc-data-cli's `TestDisplayCapEdges`. A new test in each repo pins R2: a one-line `summary.txt` as long as the display limit keeps 65,537 bytes, and a `counts.json` between the two limits yields no counts.
- **R4.** The prose that quotes 64 KiB is updated: final-design.md section 10's cap paragraph and section 17's "Logic that still lives in more than one place" bullet (outside both repos), cc-data-cli's `docs/researcher-guide.md`, and the comments on the constants in both repos.

## Technical Notes

- Neither the runner nor `package run` refuses a large `summary.txt` or `counts.json`: each reads the file only to its limit plus one byte, keeps the summary's first line, and gets no counts from a `counts.json` cut mid-JSON.
- The cc-data-cli half is cut from REPORT-152's branch `REPORT-152-recent-logs`; REPORT-115 stacks on it.
- The runner's raise should reach an environment no later than a cc-data-cli release carrying it, since a local limit looser than the runner's passes a page the VM then refuses (final-design.md section 10).
- The raise reaches a VM only with the runner's next versioned QA release. That version commit is made at release time, covering every runner change queued for the image, not in this branch.
- `OUTPUT_READ_LIMIT_BYTES` and `OutputReadLimitBytes` are a second value that must agree across the two repos, so final-design.md section 17 names both values.

## Out of Scope

- Storing the display outside the result document (RD-16).
- A shared fixture or cross-repo check for the value.
- A structured result in place of markdown.
- cc-data-studies' `wildfire-responses`, which trims its own page to 64 KiB; that is the package's own budget.
- Closed specs that quote 64 KiB (RD-4 pass 2, cc-data-cli's REPORT-146, report-service's REPORT-143), which record what was built then.
- A `display.md` that is not valid UTF-8. The limit counts the file's bytes, but the runner stores decoded text, in which each invalid byte becomes a 3-byte U+FFFD, so such a page can pass the limit and still overflow the document. The run is then written `failed` with Firestore's size error, while `cc-data package run`, which keeps the raw bytes, accepts it. Only a buggy package writes one.

## Decisions

### The scope is the constant only
**Decision**: Raise the constant and keep the display in the result document; nothing else (Doug, 2026-10-24). A shared fixture, an emulator test and a version bump were all dropped.

### Summary and counts keep 64 KiB under their own constant
**Decision**: So they do not grow with the display and the 1 MiB budget holds (Doug, 2026-10-24). The new tests use literal 65,537 and 70,000-byte inputs, so a read left on the display limit fails them.

### Invalid UTF-8 in display.md
**Options considered**: A) out of scope, no code; B) refuse non-UTF-8 in both repos; C) check the decoded length in the runner only.
**Decision**: A (Doug, 2026-10-24). The failure is visible and limited to the package's own run.

### No version bump in this branch
**Decision**: Several runner changes are queued for the next image, so one version commit is made at release time (orchestrator, 2026-10-24).

### The runner test tries one byte over
**Decision**: The display test writes `DISPLAY_LIMIT_BYTES + 1` single-byte characters before the two-byte `é` case, so a check off by one fails it; the `é` case still shows the limit counts UTF-8 bytes.
