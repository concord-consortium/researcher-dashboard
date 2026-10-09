import { Info } from "./pages/Info";
import type { Start } from "./shell/start";

export function App({ start }: { start: Start }) {
  if (start.kind === "redirecting") return <main className="loading">Signing in…</main>;
  return <Info reason={start.reason} />;
}
