import { classPath, emulatorsFromEnv, resultsPath, runnerPath, scopeDocPath, signIn, watchCollection, watchDoc } from "./firebase";
import type { Token } from "./oauth";
import type { Profile } from "./packages";
import { Api, Portal, ReportServer, type Scope } from "./portal";
import type { PortalConfig } from "./portals";
import type { Counts, Result, Runner } from "./runs";

export interface ClassListeners {
  profile: (profile: Profile | null) => void;
  runner: (runner: Runner | null) => void;
  counts: (counts: Counts | null) => void;
  results: (results: Map<string, Result>) => void;
  // Which listener failed, normally refused by the rules, so the page can say what it could not read.
  refused: (which: "profile" | "runner" | "counts" | "results") => void;
}

// Everything the dashboard page calls out to, gathered so a test can hand it fakes. The page is
// given these and never the launch, so it cannot read `classId`.
export interface DashboardServices {
  portal: Portal;
  reportServer: ReportServer;
  // One Firebase token and one sign-in for the scope's class, then the four documents the page
  // reads. Resolves to a function that stops all four; a listener that cannot start stops the
  // ones already started before the promise rejects.
  watchClass: (scope: Scope, on: ClassListeners) => Promise<() => void>;
  now: () => number;
}

export function makeServices(config: PortalConfig, token: Token): DashboardServices {
  const portal = new Portal(new Api(config.origin, token));
  return {
    portal,
    reportServer: new ReportServer(new Api(config.reportServer, token)),
    async watchClass(scope, on) {
      const customToken = await portal.firebaseToken(config.firebaseProject, scope.class_hash);
      const db = await signIn(config.firebaseProject, customToken,
        emulatorsFromEnv(import.meta.env as unknown as Record<string, string | undefined>));
      const uid = scope.platform_user_id;
      const stops: Array<() => void> = [];
      const stopAll = () => stops.forEach((stop) => stop());
      try {
        stops.push(watchDoc<Profile>(db, classPath(config.origin, scope.class_hash), on.profile, () => on.refused("profile")));
        stops.push(watchDoc<Runner>(db, runnerPath(config.origin, uid), on.runner, () => on.refused("runner")));
        stops.push(watchDoc<Counts>(db, scopeDocPath(config.origin, scope.class_hash, uid), on.counts, () => on.refused("counts")));
        stops.push(watchCollection<Result>(db, resultsPath(config.origin, scope.class_hash, uid), on.results, () => on.refused("results")));
      } catch (error) {
        stopAll();
        throw error;
      }
      return stopAll;
    },
    now: Date.now
  };
}
