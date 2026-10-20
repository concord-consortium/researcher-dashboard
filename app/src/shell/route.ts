import { useCallback, useEffect, useState, type MouseEvent } from "react";

// Where the page is, kept in the URL's fragment so the browser's Back returns to All Analyses. The page
// opens on Info. `key` is a package key, the result document's id; `q` is the list's search, as
// `#analytics?q=`. `#packages` is read as `#analytics`.
export type Route = { tab: "packages"; key: string | null; q?: string } | { tab: "info" };

export const ALL_PACKAGES: Route = { tab: "packages", key: null };

// A key that is not valid percent-encoding, as in a cut-off link, opens no package.
const decoded = (text: string) => {
  try { return decodeURIComponent(text); } catch { return null; }
};

export function parseRoute(hash: string): Route {
  const fragment = hash.replace(/^#/, "");
  const mark = fragment.indexOf("?");
  const [tab, ...rest] = (mark < 0 ? fragment : fragment.slice(0, mark)).split("/");
  if (tab === "info" || tab === "") return { tab: "info" };
  const key = (tab === "analytics" || tab === "packages") && rest.length > 0 && rest.join("/") ? decoded(rest.join("/")) : null;
  const q = mark < 0 ? "" : new URLSearchParams(fragment.slice(mark + 1)).get("q")?.trim() ?? "";
  return !key && q ? { tab: "packages", key, q } : { tab: "packages", key };
}

export function routeHash(route: Route): string {
  if (route.tab === "info") return "#info";
  if (route.key) return `#analytics/${encodeURIComponent(route.key)}`;
  return route.q ? `#analytics?${new URLSearchParams({ q: route.q })}` : "#analytics";
}

// Whether the page handles a link's click itself: a modified or other-button click, as for a new tab,
// is left to the browser.
export const plainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

// The route, and a navigate that takes effect at once and adds a history entry; Back and Forward
// arrive through hashchange.
export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const changed = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const navigate = useCallback((next: Route) => {
    setRoute(next);
    const hash = routeHash(next);
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
  }, []);
  return [route, navigate];
}
