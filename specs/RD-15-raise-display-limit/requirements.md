# Raise the 64 KiB limit on a package's display.md

**Jira**: https://concord-consortium.atlassian.net/browse/RD-15
**Repo**: https://github.com/concord-consortium/researcher-dashboard
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

A package's `display.md` is refused when it is over 64 KiB, and REPORT-189's CLUE Dataflow page is larger (about 364 to 399 KiB for the largest September class). This raises the display limit to 440 KiB in the runner and in `cc-data package run`, and gives `summary.txt` and `counts.json` their own constant at today's 64 KiB.

## Project Owner Overview

Packages that report on every episode in a class write pages of a few hundred kilobytes, and the dashboard refuses anything over 64 KB. REPORT-189's package cannot run on most September classes until the limit goes up. The page stays where it is stored today, in the one database record that holds a package's result (Doug, 2026-10-24); storing it elsewhere is RD-16.

## Background

The runner refuses a `display.md` over `DISPLAY_LIMIT_BYTES = 64 * 1024` (`runner/server/package-env.js`), writing the run `failed` with the size and the limit; it never truncates. It reads `summary.txt` and `counts.json` with the same constant: `readOwnFile` reads at most the limit plus one byte, the summary is the first line of what was read, and only three keys of `counts.json` are kept. `cc-data package run` reproduces all three reads with `DisplayLimitBytes = 64 * 1024` in cc-data-cli's `internal/packages/result.go`.

A result document holds the display and the summary twice, the current run's and `previous` (report-service `queue.ts` `PREVIOUS_FIELDS`). Two displays at 440 KiB (450,560 bytes each) and two summaries at their most (65,537 bytes each) come to 1,032,194 bytes, leaving about 16 KB of Firestore's 1 MiB (1,048,576) for the document's name and other fields, which take under 4 KB.

## Requirements

- **R1.** The display limit is 440 KiB (450,560 bytes) of UTF-8, in the runner's `DISPLAY_LIMIT_BYTES` and cc-data-cli's `DisplayLimitBytes`. A `display.md` at the limit is accepted and one a byte over is refused with the existing message; it is never truncated.
- **R2.** `summary.txt` and `counts.json` are read under their own constant at today's 64 KiB (65,536 bytes), in both repos, with today's behavior unchanged.
- **R3.** The existing edge tests move to the new value in both repos: the runner's `package-env.test.js` display test and cc-data-cli's `TestDisplayCapEdges`. A new test in each repo pins R2: a one-line `summary.txt` as long as the display limit keeps 65,537 bytes, and a `counts.json` between the two limits yields no counts.
- **R4.** The prose that quotes 64 KiB is updated: final-design.md section 10's cap paragraph and section 17's "Logic that still lives in more than one place" bullet, cc-data-cli's `docs/researcher-guide.md`, and the comments on the constants in both repos.

## Technical Notes

- Neither the runner nor `package run` refuses a large `summary.txt` or `counts.json`: each reads the file only to its limit plus one byte, keeps the summary's first line, and gets no counts from a `counts.json` cut mid-JSON. R2 keeps that, as Jira's "Done when" states it.
- The cc-data-cli half is its own branch, `RD-15-raise-display-limit`, cut from REPORT-152's branch `REPORT-152-recent-logs` (`cc-data-cli.worktrees/REPORT-152`). It is the first story above REPORT-152, and REPORT-115 stacks on it afterward.
- The runner's raise reaches an environment no later than a cc-data-cli release carrying it, since a local limit looser than the runner's passes a page the VM then refuses (final-design.md section 10).
- The raise reaches a VM only with the runner's next versioned QA release. That version commit is made at release time, covering every runner change queued for the image, not in this branch.

## Out of Scope

- Storing the display outside the result document (RD-16).
- A shared fixture or cross-repo check for the value.
- A structured result in place of markdown.
- cc-data-studies' `wildfire-responses`, which trims its own page to 64 KiB; that is the package's own budget.
- Closed specs that quote 64 KiB (RD-4 pass 2, cc-data-cli's REPORT-146, report-service's REPORT-143), which record what was built then.
- A `display.md` that is not valid UTF-8. The limit counts the file's bytes, but the runner stores decoded text, in which each invalid byte becomes a 3-byte U+FFFD, so such a page can pass the limit and still overflow the document. The run is then written `failed` with Firestore's size error, while `cc-data package run`, which keeps the raw bytes, accepts it. Only a buggy package writes one (Doug, 2026-10-24).

## Open Questions

None. The limit, its scope and the summary and counts constants are Doug's decisions (2026-10-24).

## Self-Review

### Product Manager

#### RESOLVED: The note on Jira's "Done when" described wording Jira no longer has
The Technical Notes said Jira's "Done when" calls a summary over 64 KiB "still refused", and that the Jira text, not the code, was out of step. Jira now reads "`summary.txt` and `counts.json` are still read only to 64 KiB", which is what the code does and what R2 says. The note now states the read behavior on its own and says Jira agrees.

#### RESOLVED: REPORT-189's page size
REPORT-189 corrected its measurement (clue-cc-data #1008): the largest September page is about 364 to 399 KiB, not about 355 KiB, which still leaves about 40 KiB under 440 KiB. The Overview now says so.

---

Second round (Docs and Consistency Reader; the other second-round roles are in implementation.md).

### Docs and Consistency Reader

#### RESOLVED: R3 described a longer summary than its tests write
R3 said the new test's `summary.txt` is "longer than the display limit", but both steps write exactly `DISPLAY_LIMIT_BYTES` (`DisplayLimitBytes`) bytes. Either length catches a read left on the display limit, since that keeps 450,560 bytes rather than 65,537 (run against both repos). R3 now says "as long as the display limit", matching the tests.

#### RESOLVED: The closed specs that quote 64 KiB missed one
Out of Scope named RD-4 pass 2 and REPORT-146 as closed specs left quoting 64 KiB. report-service's closed REPORT-143 spec does too: "`display` is at most 64 KiB (RD-4's `DISPLAY_LIMIT_BYTES`), so a result holding two stays far under Firestore's 1 MiB document limit" (`specs/REPORT-143-vm-endpoints-and-watchdog.md`, on `origin/master`). It records the same history, so it joins the list rather than R4.
