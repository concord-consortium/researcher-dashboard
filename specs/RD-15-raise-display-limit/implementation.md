# Implementation Plan: Raise the 64 KiB limit on a package's display.md

**Jira**: https://concord-consortium.atlassian.net/browse/RD-15
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

### The runner's display limit is 440 KiB

**Summary**: Raises the runner's display limit and gives the summary and counts reads their own constant at today's value (R1 to R3, R4's runner comment).

**Files affected**:
- `runner/server/package-env.js`: the constants and the two reads.
- `runner/test/package-env.test.js`: the display edge test, and a test of the summary and counts reads.

**Estimated diff size**: ~30 lines

The constants move above `readPackageCounts`, replacing the comment and constant at `DISPLAY_LIMIT_BYTES`:

```js
// `display.md` goes into one Firestore field, so it is capped; larger is refused, never
// truncated. A result keeps the previous run's display and summary beside its own, and two
// of each at these sizes fit Firestore's 1 MiB document. summary.txt and counts.json are
// read only up to OUTPUT_READ_LIMIT_BYTES.
export const DISPLAY_LIMIT_BYTES = 440 * 1024;
export const OUTPUT_READ_LIMIT_BYTES = 64 * 1024;
```

`readPackageCounts` and `readPackageResult`'s `summary.txt` read pass `OUTPUT_READ_LIMIT_BYTES` in place of `DISPLAY_LIMIT_BYTES`. `readOwnFile` is unchanged.

The test "a display.md over 64 KiB is refused with its size and the limit" becomes "a display.md over the limit is refused with its size and the limit", and its message assertion becomes `/is 450562 bytes, over the 450560-byte limit/`. The at-limit half already uses `DISPLAY_LIMIT_BYTES`. Before the two-byte `é` case, the test gains the one-byte-over edge R1 names:

```js
  fs.writeFileSync(path.join(paths.outputDir, "display.md"), "x".repeat(DISPLAY_LIMIT_BYTES + 1));
  assert.throws(() => readPackageResult(paths.outputDir), /is 450561 bytes, over the 450560-byte limit/);
```

A new test pins R2. The numbers are literals, so a read left on `DISPLAY_LIMIT_BYTES` (a 450,560-byte summary, and `{ answers: 3 }`) or a change to the 64 KiB constant fails it:

```js
test("summary.txt and counts.json are read only to 64 KiB, whatever the display limit", async () => {
  const { paths } = await prepare();
  fs.writeFileSync(path.join(paths.outputDir, "display.md"), "ok");
  fs.writeFileSync(path.join(paths.outputDir, "summary.txt"), "s".repeat(DISPLAY_LIMIT_BYTES));
  assert.equal(readPackageResult(paths.outputDir).summary.length, 65537, "the summary is cut at 64 KiB and a byte");
  fs.writeFileSync(path.join(paths.outputDir, "counts.json"), JSON.stringify({ answers: 3, pad: "x".repeat(70000) }));
  assert.deepEqual(readPackageCounts(paths.outputDir), {}, "a counts.json past 64 KiB is cut and does not parse");
});
```

---

### cc-data package run's display limit is 440 KiB (cc-data-cli)

**Summary**: The same change in `package run`, on cc-data-cli branch `RD-15-raise-display-limit`, cut from REPORT-152's branch `REPORT-152-recent-logs` (R1 to R4's cc-data-cli half). REPORT-115 stacks on it afterward.

**Files affected**:
- `internal/packages/result.go`: the constants and the two reads.
- `internal/packages/files_test.go`: `TestDisplayCapEdges`, and a test of the summary and counts reads.
- `docs/researcher-guide.md`: the cap sentence.

**Estimated diff size**: ~35 lines

```go
// DisplayLimitBytes is the runner's cap on display.md in UTF-8 bytes, decided only in section 10
// of the Researcher Dashboard design (final-design.md, kept outside this repository).
const DisplayLimitBytes = 440 * 1024

// OutputReadLimitBytes is how much of summary.txt and counts.json the runner reads, decided in
// the same paragraph of section 10.
const OutputReadLimitBytes = 64 * 1024
```

`ReadResult` reads `summary.txt` and `counts.json` under `OutputReadLimitBytes`, and the comment "The runner reads summary.txt and counts.json under the display cap too, truncating them" becomes "The runner reads summary.txt and counts.json only to OutputReadLimitBytes, truncating them". `TestDisplayCapEdges` pins `450560` in place of `65536`. `docs/researcher-guide.md`'s "the 65,536-byte cap on `display.md`" becomes "the 450,560-byte (440 KiB) cap on `display.md`".

The R2 test, beside `TestResultReadsOnlyTheRunnersKeys`:

```go
func TestSummaryAndCountsAreReadOnlyTo64KiB(t *testing.T) {
	out := t.TempDir()
	writeTree(t, out, map[string]string{
		"display.md":  "# Class\n",
		"summary.txt": strings.Repeat("s", DisplayLimitBytes),
		"counts.json": `{"answers": 3, "pad": "` + strings.Repeat("x", 70000) + `"}`,
	})
	res, err := ReadResult(out)
	if err != nil {
		t.Fatal(err)
	}
	if res.Summary == nil {
		t.Fatal("no summary")
	}
	if len(*res.Summary) != 65537 {
		t.Errorf("summary is %d bytes, want 65537", len(*res.Summary))
	}
	if len(res.Counts) != 0 {
		t.Errorf("counts = %v, want none from a counts.json cut at 64 KiB", res.Counts)
	}
}
```

---

### The design's prose (outside both repositories)

**Summary**: R4's final-design.md half, edited in the oob file, not committed anywhere.

**Files affected**:
- `~/oob/global/streams/researcher-dashboard/final-design.md`

Section 10's "The cap is one length check." paragraph: the cap is 440 KiB rather than 64 KiB, chosen so that a result's own display and its previous one, with two summaries, fit Firestore's 1 MiB document; `summary.txt` and `counts.json` are still read only to 64 KiB; the "a package with more to say than that is a package with a bug" sentence gives way to REPORT-189's page as the reason the cap rose. Section 17's bullet: "the 65,536-byte display cap" becomes "the 440 KiB display cap and the 64 KiB read of `summary.txt` and `counts.json`", since the second value now has its own constant in each repo.

## Open Questions

None.

## Self-Review

Roles: Senior Engineer (no findings beyond those below), QA Engineer, Storage and Performance Engineer (the Firestore budget). The proposed change was applied to both repos and run (runner 315 pass, 1 skipped; cc-data-cli `go test ./...` green), then reverted.

### QA Engineer

#### RESOLVED: Nothing tested R2, so a read left on the display limit passed
Neither repo has a test of how much of `summary.txt` or `counts.json` is read. With the plan applied but the summary and counts reads left on `DISPLAY_LIMIT_BYTES`, the runner's `package-env.test.js` stayed green (26 of 26), so Jira's "Done when" clause on the two files had nothing behind it. Each step now adds one test with literal 65,537 and 70,000-byte inputs. Run against the plan, both pass; with the reads left on the display limit, the runner's fails (summary 450,560, not 65,537) and cc-data-cli's fails on both the summary and the counts.

### Storage and Performance Engineer

#### RESOLVED: A display that is not valid UTF-8 can be accepted and still overflow the document
The limit counts the file's bytes (`stat.size`), but the runner stores `buffer.toString("utf8")`, which turns each invalid byte into U+FFFD, three bytes. Run against the plan, a 450,560-byte `display.md` of `0xFF` bytes is accepted and becomes 1,351,680 bytes, over Firestore's 1,048,576-byte document on its own; so does a smaller page with enough invalid bytes beside a full `previous`. At 64 KiB the worst case was about 786 KB, inside the document, so the raise is what makes this reachable. On the VM, `docs.done` then throws and the catch in `runner.js` writes the run `failed` with Firestore's size error, so the result is a confusing failure rather than a lost or corrupt document. `package run` keeps the raw bytes (cc-data-cli read the same file as 450,560 bytes with no error), so the local check passes a page the VM refuses, the divergence section 10 exists to prevent. Only a buggy package reaches it; the budget in requirements.md's Background holds for valid UTF-8.
**Options considered**:
- A) Accept it: add an Out of Scope line naming the case and its outcome (the run fails with Firestore's size error). No code.
- B) Refuse a `display.md` that is not valid UTF-8, in both repos (`new TextDecoder("utf-8", { fatal: true })` in the runner, `utf8.Valid` in cc-data-cli), with its own message and a test each. The budget then holds for every accepted page, and both sides agree.
- C) Check the decoded text's byte length against the limit in the runner only. Smaller, but `package run` still disagrees.

**Decision**: A (Doug, 2026-10-24). The story stays the smallest change; the failure is visible and limited to the package's own run. requirements.md's Out of Scope names the case.

---

Second round. Roles: Cold-read Implementer, Release Engineer, Docs and Consistency Reader, Commit and Step Reviewer (no findings: each step stands alone, the runner and cc-data-cli steps measured 27 and 37 changed lines applied), Package Author (no findings: the refusal message and `docs/researcher-guide.md` are what an author meets, and both carry the new number). The plan was applied to both repos again and run (runner 316 pass, 1 skipped; cc-data-cli `go test ./...` green, `gofmt` clean), then reverted.

### Cold-read Implementer

#### RESOLVED: The runner's edge test never tried a display one byte over the limit
R1 and Jira's "Done when" say a `display.md` a byte over is refused, but the runner's test writes the limit and then `"é".repeat(DISPLAY_LIMIT_BYTES / 2 + 1)`, which is two bytes over. With the check changed to `display.size > DISPLAY_LIMIT_BYTES + 1`, a 450,561-byte page is accepted whole and `package-env.test.js` stays green (26 of 26). cc-data-cli's `TestDisplayCapEdges` already writes the limit plus one. The runner step now adds a `"x".repeat(DISPLAY_LIMIT_BYTES + 1)` assertion before the `é` case, which keeps testing that the limit counts UTF-8 bytes; with it, the same mutation fails the test.

### Release Engineer

#### RESOLVED: No step released the runner
The plan changed the runner's code but never its version, and a runner change reaches the QA stack only as a new image whose `VERSION` comes from `runner/package.json`; `publish-artifact` refuses 0.2.7, which the QA stack already runs. The plan carries no version step: RD-15 is one of several runner changes headed for the next image (REPORT-152's `REPORT-152-drop-clue-source` and the `runner/Dockerfile` `CC_DATA_REF` pin to `v0.3.0-pre.2` among them), and a bump in any one branch would collide with the others, so one version commit is made when the runner is released (orchestrator, 2026-10-24). requirements.md's Technical Notes now say the raise reaches a VM only with that release.

### Docs and Consistency Reader

#### RESOLVED: The 64 KiB read limit became a second cross-repo value that only the display cap's docs named
Today the summary and counts reads ride on the display cap, so final-design.md section 17's "Logic that still lives in more than one place" bullet names one number. After the change `OUTPUT_READ_LIMIT_BYTES` and `OutputReadLimitBytes` are two copies of a separate value that `package run` must match, and the plan named only the display cap in section 17 and gave the Go constant no source, while `DisplayLimitBytes`'s comment cites section 10. The section 17 bullet now names both values, and the Go comment cites the section 10 paragraph the plan already has state the 64 KiB reads.
