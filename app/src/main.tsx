import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { devPortal } from "./shell/portals";
import { reauthorizer, start, type Start, type StartDeps } from "./shell/start";
import "./styles.css";

const deps: StartDeps = {
  search: window.location.search,
  location: window.location,
  storage: window.sessionStorage,
  navigate: (url) => window.location.assign(url),
  replaceUrl: (url) => window.history.replaceState(null, "", url),
  fetchImpl: (input, init) => globalThis.fetch(input, init),
  now: Date.now,
  devPortal: devPortal(import.meta.env as unknown as Record<string, string | boolean | undefined>)
};

const root = createRoot(document.getElementById("root")!);
function render(started: Start, reauthorize: () => void = () => {}) {
  root.render(
    <StrictMode>
      <App start={started} reauthorize={reauthorize} />
    </StrictMode>
  );
}

start(deps).then((started) => {
  if (started.kind !== "ready") return render(started);
  render(started, reauthorizer(deps, started.portal, started.launch,
    () => render({ kind: "info", reason: "sign-in-failed" })));
});
