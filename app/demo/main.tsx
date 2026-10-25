import { StrictMode, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowPathIcon, BeakerIcon, ChevronDownIcon, PencilSquareIcon } from "@heroicons/react/16/solid";
import { createRoot } from "react-dom/client";
import { App } from "../src/App";
import { DEMO_LABEL } from "../src/components/Brand";
import type { Start } from "../src/shell/start";
import { catchRedactedLinks } from "./redacted-links";
import { SCENARIOS, type Scenario } from "./scenarios";
import { World } from "./world";
import "../src/styles.css";

// The real App and its pages over canned services, for working on the page's look in the dev
// server. Nothing here signs in or reaches a portal, report-server or Firebase.

const READY: Start = {
  kind: "ready",
  portal: { origin: "https://portal.example.com", reportServer: "https://report-server.demo.invalid", firebaseProject: "demo" },
  launch: { authDomain: "https://portal.example.com", classId: "590", loginHint: null },
  token: { accessToken: "demo", issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER }
};

function chosen(): Scenario {
  const key = new URLSearchParams(window.location.search).get("scenario");
  // With no scenario named, the demo opens where a visit with no launch does: the info page.
  return SCENARIOS.find((s) => s.key === key) ?? SCENARIOS.find((s) => s.key === "info")!;
}

function Demo() {
  const [scenario, setScenario] = useState(chosen);
  const [generation, setGeneration] = useState(0);
  const [stepMs, setStepMs] = useState(1500);
  // Open where there is room for it beside the page, collapsed on a narrow screen.
  const [open, setOpen] = useState(() => window.matchMedia("(min-width: 40em)").matches);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const aside = useRef<HTMLElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  // Dragged by its title row and kept on screen; a reload, a new scenario, Reset or hiding it puts it
  // back at the bottom right.
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
  const drop = () => { drag.current = null; };
  const [, rerender] = useState(0);
  // A scenario with something to fetch first shows nothing until it arrives, rather than a page
  // that fills in a moment later.
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    scenario.load?.().then(() => { if (current) setLoaded(scenario.key); },
      () => window.alert("The demo could not load this scenario. Reload the page to try again."));
    return () => { current = false; };
  }, [scenario]);
  const ready = !scenario.load || loaded === scenario.key;
  const world = useMemo(
    () => (scenario.world && ready ? new World(scenario.world(Date.now()), { stepMs, failNext: false, refuseNext: false }, () => rerender((n) => n + 1)) : null),
    // A new world only when the scenario is chosen, loaded or reset; the step time is set on it in place.
    [scenario, generation, ready]
  );
  if (world) world.knobs.stepMs = stepMs;
  const services = useMemo(() => world?.services(), [world]);

  // While open, the page ends the panel's height lower, so it can scroll clear of the panel.
  useEffect(() => {
    const panel = aside.current;
    if (!open || !panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => { document.body.style.paddingBottom = `${panel.offsetHeight + 24}px`; });
    observer.observe(panel);
    return () => { observer.disconnect(); document.body.style.paddingBottom = ""; };
  }, [open]);

  // A scenario picked with the mouse applies at once. Arrow keys only move the menu's choice, so
  // stepping through the list does not rebuild the demo at each step; Enter or leaving the menu applies it.
  const [picked, setPicked] = useState<string | null>(null);
  const keyed = useRef(false);
  const apply = (key: string) => {
    setPicked(null);
    if (key === scenario.key) return;
    setScenario(SCENARIOS.find((s) => s.key === key)!);
    setGeneration((g) => g + 1);
    setAt(null);
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", scenario.key);
    window.history.replaceState(null, "", url);
  }, [scenario]);

  const start: Start = scenario.info ? { kind: "info", reason: scenario.info } : READY;

  return (
    <>
      {ready && <App key={`${scenario.key}:${generation}`} start={start} services={services}
        reauthorize={() => window.alert("The page would sign in again here.")} demo />}
      <aside ref={aside} aria-label="Demo controls"
        style={{ ...panel, ...(open ? {} : { width: "auto" }), ...(at ? { left: at.x, top: at.y, right: "auto", bottom: "auto" } : {}) }}>
        <div style={{ ...head, ...(open ? { marginBottom: 6 } : {}) }} onPointerDown={grab} onPointerMove={move} onPointerUp={drop} onPointerCancel={drop}>
          {open && <h2 style={title}><BeakerIcon style={icon} aria-hidden="true" />{DEMO_LABEL}</h2>}
          <button type="button" style={open ? { ...toggle, padding: 2 } : toggle} aria-label={open ? "Hide the demo controls" : "Show the demo controls"}
            title={open ? "Hide the demo controls" : "Show the demo controls"} onClick={() => { if (open) setAt(null); setOpen(!open); }}>
            {open ? <ChevronDownIcon style={small} aria-hidden="true" /> : <BeakerIcon style={icon} aria-hidden="true" />}
          </button>
        </div>
        {open && (
          <div>
            <select style={{ ...select, width: "100%" }} aria-label="Demo scenario" value={picked ?? scenario.key}
              onPointerDown={() => { keyed.current = false; }}
              onKeyDown={(e) => {
                keyed.current = true;
                if (e.key === "Enter" && picked) apply(picked);
              }}
              onChange={(e) => (keyed.current ? setPicked(e.target.value) : apply(e.target.value))}
              onBlur={() => { if (picked) apply(picked); }}>
              {SCENARIOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <p style={about}>{scenario.about.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}</p>
            {world && (
              <>
                <div style={knobs}>
                  <label style={{ ...field, flex: 1 }}>
                    <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>Step time</span>
                    <select style={{ ...select, display: "block", width: "100%", marginTop: 2 }} value={stepMs} onChange={(e) => setStepMs(Number(e.target.value))}>
                      {[300, 1500, 4000, 10000].map((ms) => <option key={ms} value={ms}>{ms / 1000} s</option>)}
                    </select>
                  </label>
                  <div style={field}>
                    <label style={check}>
                      <input type="checkbox" checked={world.knobs.failNext}
                        onChange={(e) => { world.knobs.failNext = e.target.checked; rerender((n) => n + 1); }} />{" "}
                      Next run fails
                    </label>
                    <label style={{ ...check, marginTop: 2 }}>
                      <input type="checkbox" checked={world.knobs.refuseNext}
                        onChange={(e) => { world.knobs.refuseNext = e.target.checked; rerender((n) => n + 1); }} />{" "}
                      Next run is refused
                    </label>
                  </div>
                </div>
                <div style={buttons}>
                  <button type="button" className="icon-button" style={plain} onClick={() => world.save()}>
                    <PencilSquareIcon aria-hidden="true" />Student saves
                  </button>
                  <button type="button" className="icon-button" style={plain} onClick={() => { setGeneration((g) => g + 1); setAt(null); }}>
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
  position: "fixed", right: 12, bottom: 12, zIndex: 1000, boxSizing: "border-box", width: "20rem", maxWidth: "calc(100vw - 24px)",
  padding: 10, background: "var(--warn-bg)", color: "var(--ink)", border: "1px solid var(--warn-line)", font: "0.8125rem system-ui, sans-serif",
  borderRadius: 6, boxShadow: "0 2px 10px rgba(0,0,0,0.15)"
};
const head: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "move", touchAction: "none", userSelect: "none"
};
const title: CSSProperties = { display: "flex", alignItems: "center", gap: 6, margin: 0, fontSize: "0.875rem", color: "var(--warn)" };
const toggle: CSSProperties = { display: "inline-flex", alignItems: "center", padding: 4 };
const icon: CSSProperties = { width: 16, height: 16 };
const small: CSSProperties = { width: 12, height: 12 };
const select: CSSProperties = { padding: "4px 6px", borderRadius: 4, font: "inherit" };
const plain: CSSProperties = { fontWeight: 400 };
const field: CSSProperties = { display: "block", margin: "6px 0" };
const check: CSSProperties = { display: "block", fontWeight: 700 };
const knobs: CSSProperties = { display: "flex", alignItems: "flex-start", gap: 12 };
const about: CSSProperties = { margin: "6px 0", color: "var(--muted)", lineHeight: 1.35 };
const buttons: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 6, margin: "10px 0 2px" };

catchRedactedLinks(document, (message) => window.alert(message));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Demo />
  </StrictMode>
);
