// The portals this build serves. `authDomain` is checked against this list before anything is
// requested, because a browser cannot check a signature and a parameter must not decide where
// a credential is sent: every origin the app sends a bearer to comes from the matching entry.

export interface PortalConfig {
  origin: string;
  reportServer: string;
  // The report-service Firebase project whose dashboard tree this portal's classes live in.
  firebaseProject: string;
}

const DEPLOYED: PortalConfig[] = [
  {
    origin: "https://learn.portal.staging.concord.org",
    reportServer: "https://report-server.concordqa.org",
    firebaseProject: "report-service-dev"
  }
];

// How old an authored URL profile may be before the page asks for it to be derived again. A
// changed assignment set is caught by the fingerprint at once; this bound is for activity
// content re-authored in place.
export const PROFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// A dev server may add one local portal, so the app can run against a local rigse and
// report-server. A production build never reads these.
export function devPortal(env: Record<string, string | boolean | undefined>): PortalConfig | null {
  if (env.DEV !== true) return null;
  const origin = env.VITE_DEV_PORTAL, reportServer = env.VITE_DEV_REPORT_SERVER;
  const firebaseProject = env.VITE_DEV_FIREBASE_PROJECT;
  if (typeof origin !== "string" || typeof reportServer !== "string" || typeof firebaseProject !== "string") {
    return null;
  }
  const portal = httpOrigin(origin), server = httpOrigin(reportServer);
  return portal && server ? { origin: portal, reportServer: server, firebaseProject } : null;
}

// "localhost:3000" parses as a URL whose scheme is "localhost:" and whose origin is "null".
function httpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function portalFor(authDomain: string, extra: PortalConfig | null = null): PortalConfig | null {
  let origin: string;
  try {
    origin = new URL(authDomain).origin;
  } catch {
    return null;
  }
  return [...DEPLOYED, ...(extra ? [extra] : [])].find((p) => p.origin === origin) ?? null;
}
