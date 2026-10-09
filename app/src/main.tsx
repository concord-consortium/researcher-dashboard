import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { devPortal } from "./shell/portals";
import { start, type StartDeps } from "./shell/start";
import "./styles.css";

const deps: StartDeps = {
  search: window.location.search,
  location: window.location,
  storage: window.sessionStorage,
  navigate: (url) => window.location.assign(url),
  devPortal: devPortal(import.meta.env as unknown as Record<string, string | boolean | undefined>)
};

const root = createRoot(document.getElementById("root")!);
start(deps).then((started) => {
  root.render(
    <StrictMode>
      <App start={started} />
    </StrictMode>
  );
});
