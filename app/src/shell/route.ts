import { useCallback, useEffect, useState } from "react";

// Where the page is, kept in the URL's fragment so the browser's Back returns to All Packages.
// `key` is a package key, the result document's id.
export type Route = { tab: "packages"; key: string | null } | { tab: "info" };

export const ALL_PACKAGES: Route = { tab: "packages", key: null };

export function parseRoute(hash: string): Route {
  const [tab, ...rest] = hash.replace(/^#/, "").split("/");
  if (tab === "info") return { tab: "info" };
  const key = rest.join("/");
  return { tab: "packages", key: tab === "packages" && key ? decodeURIComponent(key) : null };
}

export function routeHash(route: Route): string {
  if (route.tab === "info") return "#info";
  return route.key ? `#packages/${encodeURIComponent(route.key)}` : "#packages";
}

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
