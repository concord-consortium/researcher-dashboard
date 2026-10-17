import { useMemo } from "react";
import { ClassDashboard } from "./pages/ClassDashboard";
import { Info } from "./pages/Info";
import { tokenUser } from "./shell/oauth";
import { makeServices, type DashboardServices } from "./shell/services";
import type { Start } from "./shell/start";

// `demo` marks the dashboard as the demo page's, over canned data; the real entry never sets it.
export function App({ start, reauthorize, services, demo = false }: {
  start: Start;
  reauthorize: () => void;
  services?: DashboardServices;
  demo?: boolean;
}) {
  const ready = start.kind === "ready" ? start : null;
  const built = useMemo(
    () => services ?? (ready ? makeServices(ready.portal, ready.token) : null), [services, ready]
  );

  if (start.kind === "info") return <Info reason={start.reason} detail={start.detail} />;
  if (start.kind === "redirecting" || !built) return <main className="loading">Signing in…</main>;
  return <ClassDashboard services={built} onExpired={reauthorize} user={ready ? tokenUser(ready.token.accessToken) : null} demo={demo} />;
}
