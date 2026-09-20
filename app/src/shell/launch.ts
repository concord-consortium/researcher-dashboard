// What the portal puts in the launch URL, and what the app makes of it.
//
// One index.html serves every feature and the query selects it, the way portal-report
// selects its dashboard with `?portal-dashboard=true`. So parsing the query is the first
// thing the app does and the only thing that decides which page renders.

export const ANALYZE_CLASS = "analyze-class";

export interface Launch {
  page: string | null;
  // The portal's API url for the class, e.g. https://portal/api/v1/classes/111. The portal
  // sends the url rather than the id, so the app learns which portal it was launched from
  // without being configured per deployment.
  classUrl: string | null;
  token: string | null;
  researcher: boolean;
}

export interface ClassRef {
  portalOrigin: string;
  classId: string;
}

export function parseLaunch(search: string): Launch {
  const params = new URLSearchParams(search);
  return {
    page: params.get("page"),
    classUrl: params.get("class"),
    token: params.get("token"),
    researcher: params.get("researcher") === "true"
  };
}

// The portal to talk to and the class to ask about, or null when the url is not one.
//
// Only https and http are accepted, and the id must be the last segment of an
// /api/v1/classes/ path. A launch url is attacker-supplied in the sense that anything can
// put a query on this page, and this value decides where the bearer token is sent.
export function classRef(classUrl: string | null): ClassRef | null {
  if (!classUrl) return null;
  let url: URL;
  try {
    url = new URL(classUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const match = url.pathname.match(/^\/api\/v1\/classes\/(\d+)$/);
  if (!match) return null;

  return { portalOrigin: url.origin, classId: match[1] };
}

// Which page to render. Anything the app does not recognize, and anything missing what a
// page needs, lands on the info page rather than on a broken feature: a bookmarked launch
// url whose grant has expired is the common case, and it should explain itself.
export function pageFor(launch: Launch): string | null {
  if (launch.page !== ANALYZE_CLASS) return null;
  if (!launch.token) return null;
  if (!classRef(launch.classUrl)) return null;
  return ANALYZE_CLASS;
}
