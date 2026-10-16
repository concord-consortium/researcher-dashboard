import { describe, expect, it, vi } from "vitest";
import { SCOPE } from "./fixtures";

type Listener = [unknown, string, (value: unknown) => void, (error: Error) => void];

const signIn = vi.fn(async () => ({ db: true }));
const stops = new Map<string, ReturnType<typeof vi.fn>>();
const listeners = new Map<string, Listener>();
const kinds = new Map<string, "doc" | "collection">();
const watch = vi.fn((kind: "doc" | "collection", ...args: Listener) => {
  listeners.set(args[1], args);
  kinds.set(args[1], kind);
  const stop = vi.fn();
  stops.set(args[1], stop);
  return stop;
});
vi.mock("../src/shell/firebase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/shell/firebase")>()),
  signIn,
  watchDoc: (...args: Listener) => watch("doc", ...args),
  watchCollection: (...args: Listener) => watch("collection", ...args)
}));

const CONFIG = { origin: "https://learn.portal.staging.concord.org", reportServer: "https://rs.test", firebaseProject: "report-service-dev" };
const TOKEN = { accessToken: "at", issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER };
const ROOT = "researcher_dashboard/learn_portal_staging_concord_org";
const PATHS = {
  profile: `${ROOT}/classes/hash223`,
  runner: `${ROOT}/runners/200`,
  counts: `${ROOT}/classes/hash223/researchers/200`,
  results: `${ROOT}/classes/hash223/researchers/200/results`,
  activity: `${ROOT}/activity/hash223/users`
} as const;

const listenersOn = () => ({ profile: vi.fn(), runner: vi.fn(), counts: vi.fn(), results: vi.fn(), activity: vi.fn(), refused: vi.fn() });
const started = (_kind: "doc" | "collection", ...args: Listener) => { const stop = vi.fn(); stops.set(args[1], stop); return stop; };

describe("makeServices", () => {
  it("signs in once for the scope's class and listens to its five documents", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ token: "custom" }) }));
    vi.stubGlobal("fetch", fetchImpl);
    try {
      const { makeServices } = await import("../src/shell/services");
      const on = listenersOn();
      const stop = await makeServices(CONFIG, TOKEN).watchClass(SCOPE, on);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const firebaseUrl = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
      expect(firebaseUrl.origin).toBe(CONFIG.origin);
      expect(firebaseUrl.pathname).toBe("/api/v1/jwt/firebase");
      expect(firebaseUrl.searchParams.get("firebase_app")).toBe("report-service-dev");
      expect(firebaseUrl.searchParams.get("researcher")).toBe("true");
      expect(signIn).toHaveBeenCalledTimes(1);
      expect(signIn).toHaveBeenCalledWith("report-service-dev", "custom", null);
      expect(Object.fromEntries(kinds)).toEqual({
        [PATHS.profile]: "doc", [PATHS.runner]: "doc", [PATHS.counts]: "doc", [PATHS.results]: "collection",
        [PATHS.activity]: "collection"
      });

      // Each path's values and refusal reach the page under that document's own name.
      for (const [name, path] of Object.entries(PATHS) as [keyof typeof PATHS, string][]) {
        const [db, , onValue, onError] = listeners.get(path)!;
        expect(db).toEqual({ db: true });
        onValue(`${name} value`);
        expect(on[name]).toHaveBeenCalledWith(`${name} value`);
        onError(new Error("permission-denied"));
        expect(on.refused).toHaveBeenLastCalledWith(name);
      }

      stop();
      expect(stops.size).toBe(5);
      for (const s of stops.values()) expect(s).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops the listeners it started when a later one cannot start, and rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ token: "custom" }) })));
    stops.clear();
    watch.mockImplementationOnce(started).mockImplementationOnce(started)
      .mockImplementationOnce(() => { throw new Error("invalid path"); });
    try {
      const { makeServices } = await import("../src/shell/services");
      const on = listenersOn();
      await expect(makeServices(CONFIG, TOKEN).watchClass(SCOPE, on)).rejects.toThrow("invalid path");
      expect([...stops.keys()]).toEqual([PATHS.profile, PATHS.runner]);
      for (const s of stops.values()) expect(s).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops the four started before it when the activity listener cannot start, and rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ token: "custom" }) })));
    stops.clear();
    watch.mockImplementationOnce(started).mockImplementationOnce(started).mockImplementationOnce(started)
      .mockImplementationOnce(started).mockImplementationOnce(() => { throw new Error("invalid path"); });
    try {
      const { makeServices } = await import("../src/shell/services");
      await expect(makeServices(CONFIG, TOKEN).watchClass(SCOPE, listenersOn())).rejects.toThrow("invalid path");
      expect([...stops.keys()]).toEqual([PATHS.profile, PATHS.runner, PATHS.counts, PATHS.results]);
      for (const s of stops.values()) expect(s).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
