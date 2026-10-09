import { classPath, emulatorsFromEnv, signIn, watchDoc } from "./firebase";
import type { Token } from "./oauth";
import type { Profile } from "./packages";
import { Api, Portal, ReportServer, type Scope } from "./portal";
import type { PortalConfig } from "./portals";

// Everything the dashboard page calls out to, gathered so a test can hand it fakes. The page
// gets these and never the launch, so nothing after the redirect can read `classId`.
export interface DashboardServices {
  portal: Portal;
  reportServer: ReportServer;
  // Signs in to the portal's report-service project for the scope's class and listens to the
  // class's profile document, the one Firestore read the page makes.
  watchProfile: (
    scope: Scope, onValue: (profile: Profile | null) => void, onError: (error: Error) => void
  ) => Promise<() => void>;
  now: () => number;
}

export function makeServices(config: PortalConfig, token: Token): DashboardServices {
  const portal = new Portal(new Api(config.origin, token));
  return {
    portal,
    reportServer: new ReportServer(new Api(config.reportServer, token)),
    async watchProfile(scope, onValue, onError) {
      const customToken = await portal.firebaseToken(config.firebaseProject, scope.class_hash);
      const db = await signIn(config.firebaseProject, customToken,
        emulatorsFromEnv(import.meta.env as unknown as Record<string, string | undefined>));
      return watchDoc<Profile>(db, classPath(config.origin, scope.class_hash), onValue, onError);
    },
    now: Date.now
  };
}
