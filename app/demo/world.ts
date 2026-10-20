import type { Activity } from "../src/shell/activity";
import { packageKey, type Profile } from "../src/shell/packages";
import { ApiError, type PackageRow, type Scope } from "../src/shell/portal";
import { latestFinished, millis, type Counts, type QueueEntry, type Result, type Runner } from "../src/shell/runs";
import type { ClassListeners, DashboardServices } from "../src/shell/services";

// A Firestore Timestamp, as the page reads it.
export const stamp = (ms: number) => ({ toMillis: () => ms });

export interface Knobs {
  // Milliseconds between the simulated runner's writes.
  stepMs: number;
  // The next run the runner takes ends failed.
  failNext: boolean;
  // The next Run press is refused by the portal.
  refuseNext: boolean;
}

export interface WorldState {
  scope: Scope;
  profile: Profile | null;
  rows: PackageRow[];
  results: Map<string, Result>;
  runner: Runner | null;
  counts: Counts | null;
  activity: Map<string, Activity>;
  // What a finished run writes as its result, by package key.
  outputs: Map<string, { summary: string; display: string }>;
  // Package keys whose next run fails, with the error each writes.
  failing: Map<string, string>;
  // The status the portal refuses the class's scope with, which turns the page into an info page.
  scopeRefused?: number;
}

const FAILED_ERROR = "cc-data reports filter-options exited 3: NOT_AUTHENTICATED";
const STAGES = ["starting", "pull", "prepare_package", "run_package"];
const TAKING = ["starting", "ready", "running"];

// The page's services backed by an in-memory copy of everything it reads, with a runner that walks
// a requested package through the states the real one writes.
export class World {
  private on: ClassListeners | null = null;
  private working = false;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  readonly calls: string[] = [];

  // `changed` hears when the world clears a knob it has used up, so the panel can show it.
  constructor(private state: WorldState, readonly knobs: Knobs, private changed: () => void = () => {}) {}

  services(): DashboardServices {
    const world = this;
    return {
      portal: {
        scope: async () => {
          world.log("portal scope");
          if (world.state.scopeRefused) throw new ApiError("refused", world.state.scopeRefused);
          return world.state.scope;
        },
        refreshProfile: async () => { world.log("portal refresh_profile"); return { queued: true }; },
        firebaseToken: async () => "demo",
        runPackage: async (identity: string, version: string) => {
          world.log(`portal run_package ${identity}@${version}`);
          await delay(300);
          if (world.knobs.refuseNext) {
            world.knobs.refuseNext = false;
            world.changed();
            throw new ApiError("This package's current version cannot be run for this class.", 409);
          }
          world.enqueue(packageKey(identity), version);
          return { queue: [], appended: [identity], vm: "launched" };
        }
      } as unknown as DashboardServices["portal"],
      reportServer: {
        listPackages: async () => { world.log("report-server list"); await delay(250); return world.state.rows; },
        resolve: async () => ({ archived: false })
      } as unknown as DashboardServices["reportServer"],
      watchClass: async (_scope, listeners) => {
        world.on = listeners;
        await delay(150);
        world.emitAll();
        // A scenario can open with a run partway through or packages queued, which the runner carries on with.
        if (TAKING.includes(world.state.runner?.state ?? "") && (world.unfinished().length > 0 || world.state.runner?.queue?.length)) {
          void world.work();
        }
        return () => { world.on = null; world.stop(); };
      },
      now: Date.now
    };
  }

  stop() {
    this.stopped = true;
    if (this.idle) clearTimeout(this.idle);
  }

  // A learner saves an answer now, which is what makes a finished result fall behind.
  save(learner = `learner-${1 + Math.floor(Math.random() * 6)}`) {
    this.state.activity = new Map(this.state.activity).set(learner, { lastActivityAt: stamp(Date.now()) });
    this.on?.activity(this.state.activity);
  }

  private log(call: string) {
    this.calls.push(`${new Date().toLocaleTimeString()} ${call}`);
  }

  private emitAll() {
    const on = this.on, s = this.state;
    if (!on) return;
    on.profile(s.profile);
    on.runner(s.runner);
    on.counts(s.counts);
    on.results(s.results);
    on.activity(s.activity);
  }

  private setRunner(next: Runner | null) {
    this.state.runner = next;
    this.on?.runner(next);
  }

  private setResult(key: string, result: Result) {
    this.state.results = new Map(this.state.results).set(key, result);
    this.on?.results(this.state.results);
  }

  private entry(key: string): QueueEntry {
    return { class_hash: this.state.scope.class_hash, package_key: key };
  }

  // What the function does with a run request: queue the result, keeping the last finished run, and
  // start a runner if none is taking work. A package already queued or running is not queued again,
  // but a request for it still wakes the runner, which is how a paused run resumes.
  private enqueue(key: string, version: string) {
    const prior = this.state.results.get(key);
    const pending = prior?.status === "queued" || prior?.status === "running";
    if (!pending) {
      const identity = this.state.rows.find((r) => packageKey(r.identity) === key)?.identity ?? key;
      this.setResult(key, {
        status: "queued",
        package: { identity, version, checksum: "sha256:demo" },
        previous: latestFinished(prior),
        updated_at: stamp(Date.now())
      });
    }
    const runner = this.state.runner ?? {};
    const inQueue = (runner.queue ?? []).some((e) => e.package_key === key);
    const queue = prior?.status === "running" || inQueue ? runner.queue ?? [] : [...(runner.queue ?? []), this.entry(key)];
    const taking = TAKING.includes(runner.state ?? "");
    this.setRunner({ ...runner, queue, state: taking ? runner.state : "starting",
      microvm_id: runner.microvm_id ?? "vm-demo-1", error: null, updated_at: stamp(Date.now()) });
    void this.work();
  }

  private async step() {
    await delay(this.knobs.stepMs);
    if (this.stopped) throw new Error("stopped");
  }

  // The packages left running partway through, which the runner finishes before its queue.
  unfinished(): string[] {
    return [...this.state.results].filter(([, r]) => r.status === "running").map(([key]) => key);
  }

  async work() {
    if (this.working) return;
    this.working = true;
    if (this.idle) clearTimeout(this.idle);
    try {
      if (this.state.runner?.state === "starting") {
        await this.step();
        this.setRunner({ ...this.state.runner, state: "ready", updated_at: stamp(Date.now()) });
      }
      for (const key of this.unfinished()) await this.resume(key);
      while ((this.state.runner?.queue ?? []).length > 0) await this.runNext();
      this.idle = setTimeout(() => {
        if (this.state.runner?.state !== "ready") return;
        this.setRunner({ ...this.state.runner, state: "suspended", current_package: null, updated_at: stamp(Date.now()) });
      }, Math.max(8 * this.knobs.stepMs, 10_000));
    } catch {
      // Stopped: the page went away.
    } finally {
      this.working = false;
    }
  }

  private async runNext() {
    const runner = this.state.runner!;
    const [current, ...queue] = runner.queue!;
    this.setRunner({ ...runner, state: "running", current_package: current, queue, updated_at: stamp(Date.now()) });
    await this.carryOut(current.package_key, 0, Date.now());
  }

  // A run left partway through carries on from the stage it reached.
  private async resume(key: string) {
    this.setRunner({ ...this.state.runner!, state: "running", current_package: this.entry(key), updated_at: stamp(Date.now()) });
    const result = this.state.results.get(key)!;
    await this.carryOut(key, Math.max(0, STAGES.indexOf(result.stage ?? "")), millis(result.started_at) ?? Date.now());
  }

  private async carryOut(key: string, from: number, startedAt: number) {
    const vm = this.state.runner?.microvm_id ?? "vm-demo-1";
    const queued = this.state.results.get(key)!;
    for (const stage of STAGES.slice(from)) {
      this.setResult(key, { ...queued, status: "running", stage, microvm_id: vm, updated_at: stamp(Date.now()) });
      await this.step();
    }
    const failure = this.state.failing.get(key) ?? (this.knobs.failNext ? FAILED_ERROR : null);
    if (this.knobs.failNext && !this.state.failing.has(key)) {
      this.knobs.failNext = false;
      this.changed();
    }
    this.state.failing.delete(key);
    const finished = { started_at: stamp(startedAt), finished_at: stamp(Date.now()) };
    if (failure) {
      this.setResult(key, { ...queued, ...finished, status: "failed", error: failure, microvm_id: vm, updated_at: stamp(Date.now()) });
    } else {
      const output = this.state.outputs.get(key) ?? { summary: "Finished.", display: "" };
      this.setResult(key, { ...queued, ...finished, ...output, status: "done", previous: null, image_version: "0.2.4",
        microvm_id: vm, updated_at: stamp(Date.now()) });
      const data = this.state.counts?.data ?? {};
      this.state.counts = { data: { ...data, answers: (data.answers ?? 0) + 3, logs: (data.logs ?? 0) + 40, last_pull_at: stamp(startedAt) } };
      this.on?.counts(this.state.counts);
    }
    const after = this.state.runner!;
    this.setRunner({ ...after, state: after.queue?.length ? "running" : "ready",
      current_package: after.queue?.length ? after.current_package : null, updated_at: stamp(Date.now()) });
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
