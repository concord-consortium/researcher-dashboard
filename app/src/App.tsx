import { useMemo } from "react";
import { ClassDashboard } from "./pages/ClassDashboard";
import { Info } from "./pages/Info";
import { makeServices, type DashboardServices } from "./shell/services";
import type { Start } from "./shell/start";

export function App({ start, reauthorize, services }: {
  start: Start;
  reauthorize: () => void;
  services?: DashboardServices;
}) {
  const ready = start.kind === "ready" ? start : null;
  const built = useMemo(
    () => services ?? (ready ? makeServices(ready.portal, ready.token) : null), [services, ready]
  );

  if (start.kind === "info") return <Info reason={start.reason} detail={start.detail} />;
  if (start.kind === "redirecting" || !built) return <main className="loading">Signing in…</main>;
  return <ClassDashboard services={built} onExpired={reauthorize} />;
}
