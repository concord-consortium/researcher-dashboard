import { describe, expect, it } from "vitest";
import {
  activeCount, assignmentActivity, behindRows, isBehind, newestActivity, nextChangeIn, outOfDate, windowLabel, type Activity
} from "../src/shell/activity";
import { packageKey } from "../src/shell/packages";
import type { PackageRow } from "../src/shell/portal";
import type { Result, Runner, RunRequest } from "../src/shell/runs";
import { row, SCOPE, stamp } from "./fixtures";

const MIN = 60_000;
const NOW = 1000 * MIN;

const docs = (...times: Array<number | undefined>) =>
  new Map<string, Activity>(times.map((t, i) => [`u${i}`, t === undefined ? {} : { lastActivityAt: stamp(t) }]));

function done(r: PackageRow, over: Partial<Result> = {}): Result {
  return {
    status: "done", package: { identity: r.identity, version: "1.0.0", checksum: "c" },
    started_at: stamp(1000), updated_at: stamp(5000), ...over
  };
}

describe("windowLabel", () => {
  it("names the window in minutes", () => {
    expect(windowLabel(10)).toBe("in the last 10 minutes");
  });
});

describe("activeCount", () => {
  it("counts the learners inside the window, a future time among them, and no one without a time", () => {
    expect(activeCount(docs(NOW - MIN, NOW - 4 * MIN, NOW - 6 * MIN, NOW + MIN, undefined), NOW)).toBe(3);
  });

  it("counts a learner exactly at the window's edge", () => {
    expect(activeCount(docs(NOW - 5 * MIN), NOW)).toBe(1);
    expect(activeCount(docs(NOW - 5 * MIN - 1), NOW)).toBe(0);
  });
});

describe("nextChangeIn", () => {
  it("is when a learner who saved 4 minutes ago leaves: in 1 minute", () => {
    expect(nextChangeIn(docs(NOW - 4 * MIN), NOW)).toBe(MIN);
  });

  it("is the earliest of the counted learners' exits", () => {
    expect(nextChangeIn(docs(NOW - 3 * MIN, NOW - MIN, NOW - 10 * MIN), NOW)).toBe(2 * MIN);
  });

  it("measures a future time from that time", () => {
    expect(nextChangeIn(docs(NOW + MIN), NOW)).toBe(6 * MIN);
  });

  it("is null when no one is counted", () => {
    expect(nextChangeIn(docs(NOW - 10 * MIN, undefined), NOW)).toBeNull();
  });
});

describe("newestActivity", () => {
  it("is the latest time, wherever it sits in the map", () => {
    expect(newestActivity(docs(300, 900, undefined, 500))).toBe(900);
  });

  it("is null with no activity", () => {
    expect(newestActivity(new Map())).toBeNull();
  });
});

describe("isBehind", () => {
  const r = row({});
  it("is true for a done result with activity after its start", () => {
    expect(isBehind(done(r), 1001)).toBe(true);
  });

  it("is false for activity at the start, a missing start, another status, or no activity", () => {
    expect(isBehind(done(r), 1000)).toBe(false);
    expect(isBehind(done(r, { started_at: undefined }), 2000)).toBe(false);
    for (const status of ["queued", "running", "failed"] as const) expect(isBehind(done(r, { status }), 2000)).toBe(false);
    expect(isBehind(done(r), null)).toBe(false);
    expect(isBehind(undefined, 2000)).toBe(false);
  });
});

describe("behindRows", () => {
  const listedRow = row({ official: true });
  const key = packageKey(listedRow.identity);
  const runner: Runner | null = null;
  const behind = (over: {
    listed?: PackageRow[]; result?: Result; requests?: Map<string, RunRequest>; newest?: number;
  } = {}) => behindRows({
    listed: over.listed ?? [listedRow], results: new Map([[key, over.result ?? done(listedRow)]]), runner, mark: null,
    classHash: SCOPE.class_hash, newest: over.newest ?? 2000, requests: over.requests ?? new Map()
  });

  it("gives the behind row with its result's updated_at", () => {
    const got = behind();
    expect([...got.keys()]).toEqual([key]);
    expect(got.get(key)).toEqual({ row: listedRow, at: 5000 });
  });

  it("leaves out a row with a request in flight", () => {
    expect(behind({ requests: new Map([[key, { pending: true }]]) }).size).toBe(0);
  });

  it("leaves out a row whose refusal is still showing, and keeps one whose refusal was for an older result", () => {
    expect(behind({ requests: new Map([[key, { message: "No.", at: 5000, refusedAt: 0, retry: false }]]) }).size).toBe(0);
    expect(behind({ requests: new Map([[key, { message: "No.", at: 4000, refusedAt: 0, retry: false }]]) }).size).toBe(1);
  });

  it("leaves out a row whose accepted Run is still tied to its result, lapsed or not, and keeps one tied to an older result", () => {
    expect(behind({ requests: new Map([[key, { requested: true, at: 5000 }]]) }).size).toBe(0);
    expect(behind({ requests: new Map([[key, { requested: true, at: 5000, lapsed: true }]]) }).size).toBe(0);
    expect(behind({ requests: new Map([[key, { requested: true, at: 4000 }]]) }).size).toBe(1);
  });

  it("leaves out a row that cannot be run", () => {
    const unrunnable = { ...listedRow, runnable: false };
    expect(behind({ listed: [unrunnable] }).size).toBe(0);
  });

  it("leaves out a row that is not listed", () => {
    expect(behind({ listed: [] }).size).toBe(0);
  });

  it("leaves out a result no learner has saved since", () => {
    expect(behind({ newest: 1000 }).size).toBe(0);
  });
});

describe("outOfDate", () => {
  const r = row({});
  const key = packageKey(r.identity);
  const previous = { package: { identity: r.identity, version: "1.0.0", checksum: "c" }, started_at: stamp(1000) };

  it("is true for a failed result over a finished run older than the newest save", () => {
    expect(outOfDate(key, done(r, { status: "failed", started_at: stamp(3000), previous }), 2000, new Map(), false)).toBe(true);
  });

  it.each([
    ["queued", (): Result | undefined => done(r, { status: "queued", previous }), 2000, false, false],
    ["running", () => done(r, { status: "running", previous }), 2000, false, false],
    ["about to be requested", () => done(r), 2000, true, false],
    ["being requested", () => done(r), 2000, false, true],
    ["read after the newest save", () => done(r), 1000, false, false],
    ["failed with no finished run", () => done(r, { status: "failed" }), 2000, false, false],
    ["never run", (): Result | undefined => undefined, 2000, false, false]
  ] as const)("is false for a result %s", (_name, result, newest, inBehind, requesting) => {
    const behind = new Map(inBehind ? [[key, {}]] : []);
    expect(outOfDate(key, result(), newest, behind, requesting)).toBe(false);
  });

  it("is true for a done result that is not behind or pending", () => {
    expect(outOfDate(key, done(r), 2000, new Map(), false)).toBe(true);
  });
});

describe("assignmentActivity", () => {
  it("counts each assignment's learners and takes its latest change", () => {
    const learners = new Map<string, Activity>([
      ["a", { changed: { "9": stamp(300), "10": stamp(100) } }],
      ["b", { changed: { "9": stamp(200) } }],
      ["c", { changed: { "10": stamp(500) } }]
    ]);
    expect(assignmentActivity(learners, [9, 10, 11])).toEqual([
      { offeringId: 9, students: 2, last: 300 },
      { offeringId: 10, students: 2, last: 500 },
      { offeringId: 11, students: 0, last: null }
    ]);
  });

  it("counts nothing for a learner with no changed map, or none for the assignment", () => {
    const learners = new Map<string, Activity>([
      ["a", { lastActivityAt: stamp(100) }],
      ["b", { changed: { "10": stamp(200) } }]
    ]);
    expect(assignmentActivity(learners, [9])).toEqual([{ offeringId: 9, students: 0, last: null }]);
  });

  it("gives every assignment, in the order asked, with no learners", () => {
    expect(assignmentActivity(new Map(), [10, 9])).toEqual([
      { offeringId: 10, students: 0, last: null }, { offeringId: 9, students: 0, last: null }
    ]);
  });
});
