import { StrictMode, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowPathIcon, BeakerIcon, ChevronDownIcon, PencilSquareIcon } from "@heroicons/react/16/solid";
import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import { base64url } from "../src/shell/oauth";
import type { Start } from "../src/shell/start";
import { SCENARIOS, type Scenario } from "./scenarios";
import { World } from "./world";
import "../src/styles.css";

// The real App and its pages over canned services, for working on the page's look in the dev
// server. Nothing here signs in or reaches a portal, report-server or Firebase.

const READY: Start = {
  kind: "ready",
  portal: { origin: "https://portal.demo.invalid", reportServer: "https://report-server.demo.invalid", firebaseProject: "demo" },
  launch: { authDomain: "https://portal.demo.invalid", classId: "590", loginHint: null },
  token: { accessToken: unsignedJwt({ uid: 200, first_name: "Demo", last_name: "Researcher", username: "dresearcher" }), issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER }
};

// An access token's shape with the claims the page reads, and no signature, since nothing here
// sends it anywhere.
function unsignedJwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  return `${part({ alg: "none", typ: "JWT" })}.${part(claims)}.`;
}

const POSITION_KEY = "researcher-dashboard-demo:panel-position";

function savedPosition(): { x: number; y: number } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null") as { x: number; y: number } | null;
    return saved && saved.x < window.innerWidth - 40 && saved.y < window.innerHeight - 40 ? saved : null;
  } catch {
    return null;
  }
}

function chosen(): Scenario {
  const key = new URLSearchParams(window.location.search).get("state");
  return SCENARIOS.find((s) => s.key === key) ?? SCENARIOS[0];
}

function Demo() {
  const [scenario, setScenario] = useState(chosen);
  const [generation, setGeneration] = useState(0);
  const [stepMs, setStepMs] = useState(1500);
  const [open, setOpen] = useState(true);
  const [at, setAt] = useState(savedPosition);
  const aside = useRef<HTMLElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  // Dragged from anywhere but its controls, kept on screen, and remembered across reloads in this browser.
  const grab = (e: PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button, select, input, label") || !aside.current) return;
    const box = aside.current.getBoundingClientRect();
    drag.current = { dx: e.clientX - box.left, dy: e.clientY - box.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    if (!drag.current || !aside.current) return;
    const { width, height } = aside.current.getBoundingClientRect();
    setAt({
      x: Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - width),
      y: Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - height)
    });
  };
  const drop = () => {
    drag.current = null;
    try { if (at) localStorage.setItem(POSITION_KEY, JSON.stringify(at)); } catch { /* a convenience only */ }
  };
  const world = useMemo(
    () => (scenario.world ? new World(scenario.world(Date.now()), { stepMs, failNext: false, refuseNext: false }) : null),
    // A new world only when the scenario is chosen or reset; the step time is set on it in place.
    [scenario, generation]
  );
  if (world) world.knobs.stepMs = stepMs;
  const services = useMemo(() => world?.services(), [world]);
  const [, rerender] = useState(0);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("state", scenario.key);
    window.history.replaceState(null, "", url);
  }, [scenario]);

  const start: Start = scenario.info ? { kind: "info", reason: scenario.info } : READY;

  return (
    <>
      <App key={`${scenario.key}:${generation}`} start={start} services={services}
        reauthorize={() => window.alert("The page would sign in again here.")} demo />
      <aside ref={aside} aria-label="Demo controls" onPointerDown={grab} onPointerMove={move} onPointerUp={drop} onPointerCancel={drop}
        style={{ ...panel, ...(open ? {} : { width: "auto" }), ...(at ? { left: at.x, top: at.y, right: "auto", bottom: "auto" } : {}) }}>
        <div style={head}>
          {open && <h2 style={title}><BeakerIcon style={icon} aria-hidden="true" />Demo</h2>}
          <button type="button" style={toggle} aria-label={open ? "Hide the demo controls" : "Show the demo controls"}
            title={open ? "Hide the demo controls" : "Show the demo controls"} onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronDownIcon style={icon} aria-hidden="true" /> : <BeakerIcon style={icon} aria-hidden="true" />}
          </button>
        </div>
        {open && (
          <div>
            <select style={{ ...select, width: "100%" }} aria-label="Demo state" value={scenario.key} onChange={(e) => {
              setScenario(SCENARIOS.find((s) => s.key === e.target.value)!);
              setGeneration((g) => g + 1);
            }}>
              {SCENARIOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <p style={about}>{scenario.about}</p>
            {world && (
              <>
                <label style={field}>
                  <input type="checkbox" checked={world.knobs.failNext}
                    onChange={(e) => { world.knobs.failNext = e.target.checked; rerender((n) => n + 1); }} />{" "}
                  Next run fails
                </label>
                <label style={field}>
                  <input type="checkbox" checked={world.knobs.refuseNext}
                    onChange={(e) => { world.knobs.refuseNext = e.target.checked; rerender((n) => n + 1); }} />{" "}
                  Next Run press is refused
                </label>
                <label style={field}>
                  Runner step{" "}
                  <select style={select} value={stepMs} onChange={(e) => setStepMs(Number(e.target.value))}>
                    {[300, 1500, 4000, 10000].map((ms) => <option key={ms} value={ms}>{ms / 1000} s</option>)}
                  </select>
                </label>
                <div style={buttons}>
                  <button type="button" className="icon-button" style={plain} onClick={() => world.save()}>
                    <PencilSquareIcon aria-hidden="true" />Student saves
                  </button>
                  <button type="button" className="icon-button" style={plain} onClick={() => setGeneration((g) => g + 1)}>
                    <ArrowPathIcon aria-hidden="true" />Reset
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

const panel: CSSProperties = {
  position: "fixed", right: 12, bottom: 12, zIndex: 1000, width: 300, padding: "8px 10px",
  background: "#2b2b2b", color: "#f0f0f0", font: "13px system-ui, sans-serif", borderRadius: 6,
  boxShadow: "0 2px 10px rgba(0,0,0,0.35)", cursor: "move", touchAction: "none", userSelect: "none"
};
const head: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
const title: CSSProperties = { display: "flex", alignItems: "center", gap: 6, margin: 0, fontSize: 14, color: "#fff" };
const toggle: CSSProperties = { display: "inline-flex", alignItems: "center", padding: 4 };
const icon: CSSProperties = { width: 16, height: 16 };
const select: CSSProperties = { padding: "4px 6px", borderRadius: 4, font: "inherit" };
const plain: CSSProperties = { fontWeight: 400 };
const field: CSSProperties = { display: "block", margin: "6px 0" };
const about: CSSProperties = { margin: "6px 0", color: "#cfcfcf", lineHeight: 1.35 };
const buttons: CSSProperties = { display: "flex", gap: 6, margin: "10px 0 2px" };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>
);
