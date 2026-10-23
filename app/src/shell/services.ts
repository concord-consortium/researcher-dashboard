import { activitySources, type Activity, type ActivitySource } from "./activity";
import { activityPath, classPath, emulatorsFromEnv, resultsPath, runnerPath, scopeDocPath, signIn, watchCollection, watchDoc } from "./firebase";
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
  // Report-service's and CLUE's activity documents merged, and the sources they came from (activitySources).
  activity: (docs: Map<string, Activity>, from: ActivitySource[]) => void;
  // Which listener failed, normally refused by the rules, so the page can say what it could not read.
  refused: (which: "profile" | "runner" | "counts" | "results" | ActivitySource) => void;
}

// Everything the dashboard page calls out to, gathered so a test can hand it fakes. The page is
// given these and never the launch, so it cannot read `classId`.
export interface DashboardServices {
  portal: Portal;
  reportServer: ReportServer;
  // A token, sign-in and five listeners for the scope's class in report-service's project, and beside
  // them a token, sign-in and activity listener in the portal's CLUE project, which may start after the
  // promise resolves. Resolves to a function that stops every listener started; a report-service
  // failure stops CLUE's side too and rejects. A CLUE failure is a refused "clue-activity" and never
  // stops or holds the other listeners.
  watchClass: (scope: Scope, on: ClassListeners) => Promise<() => void>;
  now: () => number;
}

export function makeServices(config: PortalConfig, token: Token): DashboardServices {
  const portal = new Portal(new Api(config.origin, token));
  return {
    portal,
    reportServer: new ReportServer(new Api(config.reportServer, token)),
    async watchClass(scope, on) {
      const emulators = emulatorsFromEnv(import.meta.env as unknown as Record<string, string | undefined>);
      const sources = activitySources(on.activity);
      const refuse = (source: ActivitySource) => {
        sources.refused(source);
        on.refused(source);
      };
      const path = activityPath(config.origin, scope.class_hash);
      const stops: Array<() => void> = [];
      let stopped = false;
      const stopAll = () => {
        stopped = true;
        stops.forEach((stop) => stop());
      };
      void (async () => {
        const token = await portal.firebaseToken(config.clue.firebaseApp, scope.class_hash);
        // A stopped watch starts no sign-in on the project's shared app; one already under way still completes.
        if (stopped) return;
        const db = await signIn(config.clue.projectId, token, emulators);
        if (stopped) return;
        stops.push(watchCollection<Activity>(db, path, (docs) => sources.value("clue-activity", docs), () => refuse("clue-activity")));
      })().catch((error) => {
        if (stopped) return;
        console.error("CLUE activity could not be read", error);
        refuse("clue-activity");
      });
      try {
        const customToken = await portal.firebaseToken(config.firebaseProject, scope.class_hash);
        const db = await signIn(config.firebaseProject, customToken, emulators);
        const uid = scope.platform_user_id;
        stops.push(watchDoc<Profile>(db, classPath(config.origin, scope.class_hash), on.profile, () => on.refused("profile")));
        stops.push(watchDoc<Runner>(db, runnerPath(config.origin, uid), on.runner, () => on.refused("runner")));
        stops.push(watchDoc<Counts>(db, scopeDocPath(config.origin, scope.class_hash, uid), on.counts, () => on.refused("counts")));
        stops.push(watchCollection<Result>(db, resultsPath(config.origin, scope.class_hash, uid), on.results, () => on.refused("results")));
        stops.push(watchCollection<Activity>(db, path, (docs) => sources.value("activity", docs), () => refuse("activity")));
      } catch (error) {
        stopAll();
        throw error;
      }
      return stopAll;
    },
    now: Date.now
  };
}
