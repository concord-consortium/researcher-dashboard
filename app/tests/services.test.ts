import { afterEach, describe, expect, it, vi } from "vitest";
import { SCOPE, stamp } from "./fixtures";

type Listener = [unknown, string, (value: unknown) => void, (error: Error) => void];

// CLUE production's pairing, whose portal row and project id differ, so a test can tell which one each call takes.
const RS = "report-service-dev", CLUE_APP = "collaborative-learning", CLUE_PROJECT = "collaborative-learning-ec215";
const signIn = vi.fn(async (project: string, _token: string, _emulators: unknown) => ({ db: project }));
// Keyed by the signed-in project and the path, since both projects hold the activity path.
const stops = new Map<string, ReturnType<typeof vi.fn>>();
const listeners = new Map<string, Listener>();
const kinds = new Map<string, "doc" | "collection">();
const keyOf = (db: unknown, path: string) => `${(db as { db: string }).db} ${path}`;
function record(kind: "doc" | "collection", ...args: Listener) {
  const key = keyOf(args[0], args[1]);
  listeners.set(key, args);
  kinds.set(key, kind);
  const stop = vi.fn();
  stops.set(key, stop);
  return stop;
}
const watch = vi.fn(record);
vi.mock("../src/shell/firebase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/shell/firebase")>()),
  signIn,
  watchDoc: (...args: Listener) => watch("doc", ...args),
  watchCollection: (...args: Listener) => watch("collection", ...args)
}));

const CONFIG = { origin: "https://learn.portal.staging.concord.org", reportServer: "https://rs.test", firebaseProject: RS, clue: { firebaseApp: CLUE_APP, projectId: CLUE_PROJECT } };
const TOKEN = { accessToken: "at", issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER };
const ROOT = "researcher_dashboard/learn_portal_staging_concord_org";
const PATHS = {
  profile: `${ROOT}/classes/hash223`,
  runner: `${ROOT}/runners/200`,
  counts: `${ROOT}/classes/hash223/researchers/200`,
  results: `${ROOT}/classes/hash223/researchers/200/results`,
  activity: `${ROOT}/activity/hash223/users`
} as const;
const RS_KEYS = Object.fromEntries(Object.entries(PATHS).map(([name, path]) => [name, `${RS} ${path}`])) as Record<keyof typeof PATHS, string>;
const CLUE_ACTIVITY = `${CLUE_PROJECT} ${PATHS.activity}`;

const listenersOn = () => ({ profile: vi.fn(), runner: vi.fn(), counts: vi.fn(), results: vi.fn(), activity: vi.fn(), refused: vi.fn() });
const started = (_kind: "doc" | "collection", ...args: Listener) => { const stop = vi.fn(); stops.set(keyOf(args[0], args[1]), stop); return stop; };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// A portal that mints a token named for the Firebase app asked for, and refuses the one named in `refuse`.
function portalMints(refuse?: string) {
  return vi.fn(async (url: string) => {
    const app = new URL(url).searchParams.get("firebase_app");
    return app === refuse
      ? { ok: false, status: 400, json: async () => ({ message: `Unknown firebase app name: ${app}` }) }
      : { ok: true, status: 201, json: async () => ({ token: `token-${app}` }) };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  signIn.mockImplementation(async (project: string) => ({ db: project }));
  signIn.mockClear();
  watch.mockReset();
  watch.mockImplementation(record);
  stops.clear();
  listeners.clear();
  kinds.clear();
});

describe("makeServices", () => {
  it("signs in to report-service's and the portal's CLUE project for the scope's class, and listens to six documents", async () => {
    const fetchImpl = portalMints();
    vi.stubGlobal("fetch", fetchImpl);
    const { makeServices } = await import("../src/shell/services");
    const on = listenersOn();
    const stop = await makeServices(CONFIG, TOKEN).watchClass(SCOPE, on);
    await settle();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const mints = fetchImpl.mock.calls.map(([url]) => new URL(url));
    for (const url of mints) {
      expect(url.origin).toBe(CONFIG.origin);
      expect(url.pathname).toBe("/api/v1/jwt/firebase");
      expect(url.searchParams.get("researcher")).toBe("true");
      expect(url.searchParams.get("class_hash")).toBe("hash223");
    }
    expect(mints.map((url) => url.searchParams.get("firebase_app")).sort()).toEqual([CLUE_APP, RS]);
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(signIn).toHaveBeenCalledWith(RS, `token-${RS}`, null);
    expect(signIn).toHaveBeenCalledWith(CLUE_PROJECT, `token-${CLUE_APP}`, null);
    expect(Object.fromEntries(kinds)).toEqual({
      [RS_KEYS.profile]: "doc", [RS_KEYS.runner]: "doc", [RS_KEYS.counts]: "doc", [RS_KEYS.results]: "collection",
      [RS_KEYS.activity]: "collection", [CLUE_ACTIVITY]: "collection"
    });

    // Each document's values and refusal reach the page under that document's own name.
    for (const name of ["profile", "runner", "counts", "results"] as const) {
      const [, , onValue, onError] = listeners.get(RS_KEYS[name])!;
      onValue(`${name} value`);
      expect(on[name]).toHaveBeenCalledWith(`${name} value`);
      onError(new Error("permission-denied"));
      expect(on.refused).toHaveBeenLastCalledWith(name);
    }

    stop();
    expect(stops.size).toBe(6);
    for (const s of stops.values()) expect(s).toHaveBeenCalledTimes(1);
  });

  it("hands the page each source's activity as it lands, merged with the other's, and names each refusal", async () => {
    vi.stubGlobal("fetch", portalMints());
    const { makeServices } = await import("../src/shell/services");
    const on = listenersOn();
    await makeServices(CONFIG, TOKEN).watchClass(SCOPE, on);
    await settle();
    const [, , rsValue, rsError] = listeners.get(RS_KEYS.activity)!;
    const [, , clueValue, clueError] = listeners.get(CLUE_ACTIVITY)!;

    rsValue(new Map([["301", { lastActivityAt: stamp(1000) }]]));
    expect([...(on.activity.mock.lastCall![0] as Map<string, unknown>).keys()]).toEqual(["301"]);
    expect(on.activity.mock.lastCall![1]).toEqual(["activity"]);
    clueValue(new Map([["301", { lastActivityAt: stamp(2000) }], ["302", { lastActivityAt: stamp(500) }]]));
    const merged = on.activity.mock.lastCall![0] as Map<string, { lastActivityAt: { toMillis(): number } }>;
    expect([...merged.keys()].sort()).toEqual(["301", "302"]);
    expect(merged.get("301")!.lastActivityAt.toMillis()).toBe(2000);
    expect(on.activity.mock.lastCall![1]).toEqual(["activity", "clue-activity"]);

    clueError(new Error("permission-denied"));
    expect(on.refused).toHaveBeenLastCalledWith("clue-activity");
    expect([...(on.activity.mock.lastCall![0] as Map<string, unknown>).keys()]).toEqual(["301"]);
    rsError(new Error("permission-denied"));
    expect(on.refused).toHaveBeenLastCalledWith("activity");
  });

  it("refuses CLUE's activity when its token cannot be minted, and still starts and resolves the other five", async () => {
    vi.stubGlobal("fetch", portalMints(CLUE_APP));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { makeServices } = await import("../src/shell/services");
    const on = listenersOn();
    await makeServices(CONFIG, TOKEN).watchClass(SCOPE, on);
    await settle();

    expect(on.refused).toHaveBeenCalledWith("clue-activity");
    expect(signIn.mock.calls.map(([project]) => project)).toEqual([RS]);
    expect([...kinds.keys()].sort()).toEqual(Object.values(RS_KEYS).sort());
    listeners.get(RS_KEYS.activity)![2](new Map([["301", {}]]));
    expect(on.activity).toHaveBeenCalledWith(new Map([["301", {}]]), ["activity"]);
  });

  it.each([
    ["resolves", true],
    ["fails", false]
  ])("starts and refuses nothing for CLUE once report-service's sign-in has failed, when CLUE's %s after it", async (_name, succeeds) => {
    vi.stubGlobal("fetch", portalMints());
    vi.spyOn(console, "error").mockImplementation(() => {});
    let release!: () => void;
    signIn.mockImplementation(async (project: string) => {
      if (project === RS) throw new Error("auth/network-request-failed");
      await new Promise<void>((resolve, reject) => { release = succeeds ? resolve : () => reject(new Error("auth/network-request-failed")); });
      return { db: project };
    });
    const { makeServices } = await import("../src/shell/services");
    const on = listenersOn();
    await expect(makeServices(CONFIG, TOKEN).watchClass(SCOPE, on)).rejects.toThrow("auth/network-request-failed");
    release();
    await settle();

    expect(watch).not.toHaveBeenCalled();
    expect(on.refused).not.toHaveBeenCalled();
  });

  it("does not sign in to CLUE when its token arrives after report-service's sign-in has failed", async () => {
    let mint!: () => void;
    const fetchImpl = vi.fn(async (url: string) => {
      const app = new URL(url).searchParams.get("firebase_app");
      if (app === CLUE_APP) await new Promise<void>((resolve) => { mint = resolve; });
      return { ok: true, status: 201, json: async () => ({ token: `token-${app}` }) };
    });
    vi.stubGlobal("fetch", fetchImpl);
    signIn.mockImplementation(async (project: string) => {
      if (project === RS) throw new Error("auth/network-request-failed");
      return { db: project };
    });
    const { makeServices } = await import("../src/shell/services");
    const on = listenersOn();
    await expect(makeServices(CONFIG, TOKEN).watchClass(SCOPE, on)).rejects.toThrow("auth/network-request-failed");
    mint();
    await settle();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(signIn.mock.calls.map(([project]) => project)).toEqual([RS]);
    expect(on.refused).not.toHaveBeenCalled();
  });

  it.each([
    ["token", "mint"],
    ["sign-in", "signIn"]
  ])("starts nothing for CLUE when the page stops the watch while CLUE's %s is pending", async (_name, held) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const app = new URL(url).searchParams.get("firebase_app");
      if (app === CLUE_APP && held === "mint") await pending;
      return { ok: true, status: 201, json: async () => ({ token: `token-${app}` }) };
    }));
    signIn.mockImplementation(async (project: string) => {
      if (project === CLUE_PROJECT) await pending;
      return { db: project };
    });
    const { makeServices } = await import("../src/shell/services");
    const on = listenersOn();
    const stop = await makeServices(CONFIG, TOKEN).watchClass(SCOPE, on);
    stop();
    release();
    await settle();

    expect(signIn.mock.calls.map(([project]) => project)).toEqual(held === "mint" ? [RS] : [CLUE_PROJECT, RS]);
    expect(listeners.has(CLUE_ACTIVITY)).toBe(false);
    expect(on.refused).not.toHaveBeenCalled();
  });

  it("refuses CLUE's activity when its listener cannot start, and still starts the other five", async () => {
    vi.stubGlobal("fetch", portalMints());
    vi.spyOn(console, "error").mockImplementation(() => {});
    watch.mockImplementation((kind: "doc" | "collection", ...args: Listener) => {
      if (keyOf(args[0], args[1]) === CLUE_ACTIVITY) throw new Error("invalid path");
      return record(kind, ...args);
    });
    const { makeServices } = await import("../src/shell/services");
    const on = listenersOn();
    await makeServices(CONFIG, TOKEN).watchClass(SCOPE, on);
    await settle();

    expect(on.refused).toHaveBeenCalledWith("clue-activity");
    expect([...kinds.keys()].sort()).toEqual(Object.values(RS_KEYS).sort());
  });

  it("stops a running CLUE listener when a report-service listener cannot start", async () => {
    vi.stubGlobal("fetch", portalMints());
    let clueStarted!: () => void;
    const clueListening = new Promise<void>((resolve) => { clueStarted = resolve; });
    signIn.mockImplementation(async (project: string) => {
      if (project === RS) await clueListening;
      return { db: project };
    });
    watch.mockImplementation((kind: "doc" | "collection", ...args: Listener) => {
      const key = keyOf(args[0], args[1]);
      if (key === RS_KEYS.counts) throw new Error("invalid path");
      const stop = record(kind, ...args);
      if (key === CLUE_ACTIVITY) clueStarted();
      return stop;
    });
    const { makeServices } = await import("../src/shell/services");
    await expect(makeServices(CONFIG, TOKEN).watchClass(SCOPE, listenersOn())).rejects.toThrow("invalid path");

    expect([...stops.keys()].sort()).toEqual([CLUE_ACTIVITY, RS_KEYS.profile, RS_KEYS.runner].sort());
    for (const s of stops.values()) expect(s).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the counts listener", 2, [RS_KEYS.profile, RS_KEYS.runner]],
    ["report-service's activity listener", 4, [RS_KEYS.profile, RS_KEYS.runner, RS_KEYS.counts, RS_KEYS.results]]
  ])("stops the listeners started before %s when it cannot start, and rejects", async (_name, before, expected) => {
    vi.stubGlobal("fetch", portalMints(CLUE_APP));
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < before; i++) watch.mockImplementationOnce(started);
    watch.mockImplementationOnce(() => { throw new Error("invalid path"); });
    const { makeServices } = await import("../src/shell/services");
    await expect(makeServices(CONFIG, TOKEN).watchClass(SCOPE, listenersOn())).rejects.toThrow("invalid path");
    expect([...stops.keys()]).toEqual(expected);
    for (const s of stops.values()) expect(s).toHaveBeenCalledTimes(1);
  });
});
