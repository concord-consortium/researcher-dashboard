import type { Activity } from "../src/shell/activity";
import { packageKey } from "../src/shell/packages";
import type { PackageRow, Scope } from "../src/shell/portal";
import type { Finished, Result } from "../src/shell/runs";
import type { InfoReason } from "../src/shell/start";
import { EXPLANATION_KEYWORDS, ISOLATION_PROBE, MODEL_USE, RUNNER_SMOKE, WILDFIRE_RESPONSES } from "./markdown";
import { stamp, type WorldState } from "./world";

const MIN = 60_000;

const SCOPE: Scope = {
  kind: "class", id: 590, name: "Wildfire, period 2", class_hash: "demo590", platform_user_id: 200,
  teachers: [{ id: 1, name: "Taylor Teacher" }, { id: 3, name: "Sam Co-teacher" }],
  cohorts: [{ id: 2, name: "Fall 2026 pilot" }],
  project_ids: [20, 21], assignment_fingerprint: "v1:demo",
  assignments: [
    { offering_id: 1255, runnable_id: 604, name: "Researcher Dashboard Wildfire Fixture", url: "https://activity-player.concord.org/?activity=1", tool: "ActivityPlayer" },
    { offering_id: 1256, runnable_id: 830, name: "Wildfire Explorer: Hazard Bot", url: "https://activity-player.concord.org/?sequence=830", tool: "ActivityPlayer" }
  ]
};

let catalog = 0;
function pkg(identity: string, title: string, over: Partial<PackageRow> = {}, description: string | null = null): PackageRow {
  catalog += 1;
  return {
    catalog_id: catalog, identity, name: identity.split("/").pop()!, visibility: "public", official: false, mine: false,
    project: null, applies: true, runnable: true,
    current_version: { version: "1.2.0", title, description }, ...over
  };
}

// Every package runs here, whatever its group, so each kind of card can be tried; the real catalog
// runs official packages alone.
const ROWS: PackageRow[] = [
  pkg("official/wildfire-responses", "Wildfire open responses", { official: true },
    "Every open response the class wrote in the Wildfire activities, by question."),
  pkg("official/wildfire-model-use", "Wildfire model use", { official: true },
    "How students used the wildfire model: runs, settings, page progress and claims."),
  pkg("official/runner-smoke", "Runner smoke test", { official: true, current_version: { version: "1.0.0", title: "Runner smoke test", description: null } }),
  pkg("official/isolation-probe", "Isolation probe", { official: true, current_version: { version: "1.0.0", title: "Isolation probe", description: "Checks that a package cannot reach the network." } }),
  pkg("projects/20/claim-coding", "Claim coding for Wildfire", { visibility: "project", project: { id: 20, name: "Wildfire Research" } },
    "Codes each claim answer against the project's rubric."),
  pkg("users/200/explanation-keywords", "Explanation keywords", { visibility: "private", mine: true },
    "A tally of the science words students use in their open responses."),
  pkg("users/311/word-cloud", "Response word cloud", {}, "A word frequency table of every open response."),
  pkg("users/402/time-on-task", "Time on task", {})
];

const OUTPUTS = new Map([
  ["official/wildfire-responses", { summary: "6 open responses to 2 questions from 3 learners.", display: WILDFIRE_RESPONSES }],
  ["official/wildfire-model-use", { summary: "15 students, 14 ran the model, 9 completed a task page.", display: MODEL_USE }],
  ["official/runner-smoke", { summary: "Runner smoke test passed.", display: RUNNER_SMOKE }],
  ["official/isolation-probe", { summary: "No network reachable from the package sandbox.", display: ISOLATION_PROBE }],
  ["users/200/explanation-keywords", { summary: "8 science keywords in 6 responses.", display: EXPLANATION_KEYWORDS }],
  ["projects/20/claim-coding", { summary: "11 claims coded: 7 strong, 3 partial, 1 missing evidence.", display: "11 claims coded: 7 strong, 3 partial, 1 missing evidence.\n\n| Code | Claims |\n|---|---:|\n| Claim with evidence and reasoning | 7 |\n| Claim with evidence only | 3 |\n| Claim without evidence | 1 |\n" }],
  ["users/402/time-on-task", { summary: "Median 14 minutes per page across 9 pages.", display: "Median 14 minutes per page across 9 pages.\n\n| Page | Median minutes |\n|---|---:|\n| Activity 2, page 3 | 18 |\n| Activity 2, page 4 | 15 |\n| Activity 3, page 2 | 12 |\n" }],
  ["users/311/word-cloud", { summary: "12 words used more than 3 times.", display: "12 words used more than 3 times.\n\n| Word | Uses |\n|---|---:|\n| fire | 14 |\n| wind | 9 |\n| grass | 6 |\n" }]
].map(([identity, output]) => [packageKey(identity as string), output as { summary: string; display: string }]));

const row = (identity: string) => ROWS.find((r) => r.identity === identity)!;

function finished(identity: string, startedAgoMin: number, now: number, display?: string): Finished {
  const output = OUTPUTS.get(packageKey(identity))!;
  return {
    package: { identity, version: row(identity).current_version.version, checksum: "sha256:demo" },
    image_version: "0.2.4", summary: output.summary, display: display ?? output.display,
    started_at: stamp(now - startedAgoMin * MIN), finished_at: stamp(now - (startedAgoMin - 1) * MIN)
  };
}

function done(identity: string, startedAgoMin: number, now: number, display?: string): [string, Result] {
  const f = finished(identity, startedAgoMin, now, display);
  return [packageKey(identity), { ...f, status: "done", microvm_id: "vm-demo-1", updated_at: f.finished_at! }];
}

function activity(now: number, minutesAgo: number[]): Map<string, Activity> {
  return new Map(minutesAgo.map((m, i) => [`learner-${i + 1}`, { lastActivityAt: stamp(now - m * MIN) }]));
}

function base(now: number): WorldState {
  return {
    scope: SCOPE,
    profile: {
      assignment_urls: SCOPE.assignments.map((a) => a.url), interactive_urls: [],
      assignment_fingerprint: SCOPE.assignment_fingerprint, derived_at: stamp(now - 10 * MIN)
    },
    rows: ROWS,
    results: new Map(),
    runner: { state: "suspended", queue: [], microvm_id: "vm-demo-1", updated_at: stamp(now - 30 * MIN) },
    counts: { data: { answers: 117, logs: 18195, last_pull_at: stamp(now - 40 * MIN), log_freshness_at: stamp(now - 6 * 60 * MIN) } },
    activity: activity(now, [45, 50, 70]),
    outputs: OUTPUTS,
    failing: new Map()
  };
}

export interface Scenario {
  key: string;
  label: string;
  about: string;
  world?: (now: number) => WorldState;
  info?: InfoReason;
}

export const SCENARIOS: Scenario[] = [
  {
    key: "ready",
    label: "Signed in, several packages",
    about: "Four official packages (two finished, two never run), a project package, one of your own and two community ones (every package runs here, so each kind can be tried; the real catalog runs official packages alone). The runner is idle; nobody has saved in the last 5 minutes. Press Run or Student saves to watch a run go through.",
    world: (now) => ({
      ...base(now),
      results: new Map([done("official/wildfire-responses", 40, now), done("official/runner-smoke", 38, now)])
    })
  },
  {
    key: "running",
    label: "A package running",
    about: "Wildfire model use is re-running over its earlier result, Wildfire open responses is queued behind it, and 2 students are active.",
    world: (now) => {
      const s = base(now);
      const modelKey = packageKey("official/wildfire-model-use"), responsesKey = packageKey("official/wildfire-responses");
      const [, modelDone] = done("official/wildfire-model-use", 50, now);
      const [, responsesDone] = done("official/wildfire-responses", 48, now);
      return {
        ...s,
        runner: {
          state: "running", microvm_id: "vm-demo-1", updated_at: stamp(now - 2 * MIN),
          current_package: { class_hash: SCOPE.class_hash, package_key: modelKey },
          queue: [{ class_hash: SCOPE.class_hash, package_key: responsesKey }]
        },
        results: new Map<string, Result>([
          [modelKey, { ...modelDone, status: "running", stage: "run_package", previous: finished("official/wildfire-model-use", 50, now), updated_at: stamp(now - 20_000) }],
          [responsesKey, { ...responsesDone, status: "queued", previous: finished("official/wildfire-responses", 48, now), updated_at: stamp(now - 60_000) }]
        ]),
        activity: activity(now, [1, 3, 40])
      };
    }
  },
  {
    key: "failed",
    label: "A failed run",
    about: "Wildfire model use's latest re-run failed over an earlier result; Isolation probe failed on its first run; the runner stopped with an error.",
    world: (now) => {
      const s = base(now);
      const [, modelDone] = done("official/wildfire-model-use", 90, now);
      const isolation = finished("official/isolation-probe", 12, now);
      return {
        ...s,
        runner: { state: "failed", error: "The runner could not start: no capacity in us-east-1", queue: [], microvm_id: "vm-demo-1", updated_at: stamp(now - 5 * MIN) },
        results: new Map<string, Result>([
          [packageKey("official/wildfire-model-use"), { ...modelDone, status: "failed", error: "cc-data reports filter-options exited 3: NOT_AUTHENTICATED", started_at: stamp(now - 8 * MIN), finished_at: stamp(now - 7 * MIN), previous: finished("official/wildfire-model-use", 90, now), updated_at: stamp(now - 7 * MIN) }],
          [packageKey("official/isolation-probe"), { ...isolation, status: "failed", summary: null, display: null, error: "the package exited 1 with no output", previous: null, updated_at: stamp(now - 11 * MIN) }],
          done("official/wildfire-responses", 40, now)
        ]),
        failing: new Map([[packageKey("official/isolation-probe"), "the package exited 1 with no output"]])
      };
    }
  },
  {
    key: "long",
    label: "A long markdown result",
    about: "The long result is Wildfire model use's: click its card, or its View result button, to open it. It is a multi-section report of about 14 KB in the real report's layout, with made-up numbers, and scrolling it shows the subheader staying put.",
    world: (now) => ({
      ...base(now),
      results: new Map([done("official/wildfire-model-use", 30, now), done("official/wildfire-responses", 32, now)])
    })
  },
  {
    key: "quiet",
    label: "No active students",
    about: "Finished results and no learner activity documents at all, as for a class nobody has opened yet.",
    world: (now) => ({
      ...base(now),
      activity: new Map(),
      results: new Map([done("official/wildfire-responses", 300, now), done("official/wildfire-model-use", 280, now)])
    })
  },
  {
    key: "first",
    label: "First visit, nothing run",
    about: "No results and no counts yet; the runner has never started.",
    world: (now) => ({ ...base(now), runner: null, counts: null, activity: activity(now, [2]) })
  },
  {
    key: "edge",
    label: "Edge cases",
    about: "A truncated profile notice, a result whose package is no longer listed, and a result behind a student's save with automatic re-runs about to fire.",
    world: (now) => {
      const s = base(now);
      const gone: Result = {
        ...finished("official/wildfire-responses", 400, now), status: "done",
        package: { identity: "official/legacy-responses", version: "0.9.0", checksum: "sha256:demo" },
        summary: "4 open responses from 2 learners.", updated_at: stamp(now - 399 * MIN),
        display: WILDFIRE_RESPONSES.replace("6 open responses to 2 questions from 3 learners.", "4 open responses from 2 learners.")
      };
      return {
        ...s,
        profile: { ...s.profile!, truncated: true },
        results: new Map([done("official/runner-smoke", 30, now), [packageKey("official/legacy-responses"), gone]]),
        activity: activity(now, [0.5, 12])
      };
    }
  },
  { key: "info", label: "Info page (no launch)", about: "What a visit with no launch parameters shows.", info: "no-launch" },
  {
    key: "withdrawn",
    label: "Info page (access withdrawn)",
    about: "The page a signed-in researcher sees once the portal refuses the class with a 403, with their name in the header.",
    world: (now) => ({ ...base(now), scopeRefused: 403 })
  }
];
