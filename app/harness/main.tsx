import { StrictMode, useEffect, useMemo, useState, type CSSProperties } from "react";
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
  portal: { origin: "https://portal.harness.invalid", reportServer: "https://report-server.harness.invalid", firebaseProject: "harness" },
  launch: { authDomain: "https://portal.harness.invalid", classId: "590", loginHint: null },
  token: { accessToken: unsignedJwt({ uid: 200, first_name: "Dana", last_name: "Researcher", username: "dresearcher" }), issuedAt: 0, expiresAt: Number.MAX_SAFE_INTEGER }
};

// An access token's shape with the claims the page reads, and no signature, since nothing here
// sends it anywhere.
function unsignedJwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  return `${part({ alg: "none", typ: "JWT" })}.${part(claims)}.`;
}

function chosen(): Scenario {
  const key = new URLSearchParams(window.location.search).get("s");
  return SCENARIOS.find((s) => s.key === key) ?? SCENARIOS[0];
}

function Harness() {
  const [scenario, setScenario] = useState(chosen);
  const [generation, setGeneration] = useState(0);
  const [stepMs, setStepMs] = useState(1500);
  const [open, setOpen] = useState(true);
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
    url.searchParams.set("s", scenario.key);
    window.history.replaceState(null, "", url);
  }, [scenario]);

  const start: Start = scenario.info ? { kind: "info", reason: scenario.info } : READY;

  return (
    <>
      <App key={`${scenario.key}:${generation}`} start={start} services={services}
        reauthorize={() => window.alert("The page would sign in again here.")} />
      <aside style={open ? panel : { ...panel, width: "auto" }}>
        <button type="button" style={toggle} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide harness" : "Harness"}
        </button>
        {open && (
          <div>
            <label style={field}>
              State{" "}
              <select value={scenario.key} onChange={(e) => {
                setScenario(SCENARIOS.find((s) => s.key === e.target.value)!);
                setGeneration((g) => g + 1);
              }}>
                {SCENARIOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <p style={about}>{scenario.about}</p>
            {world && (
              <>
                <div style={buttons}>
                  <button type="button" onClick={() => world.save()}>Student saves</button>
                  <button type="button" onClick={() => setGeneration((g) => g + 1)}>Reset</button>
                </div>
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
                  <select value={stepMs} onChange={(e) => setStepMs(Number(e.target.value))}>
                    {[300, 1500, 4000, 10000].map((ms) => <option key={ms} value={ms}>{ms / 1000} s</option>)}
                  </select>
                </label>
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
  boxShadow: "0 2px 10px rgba(0,0,0,0.35)"
};
const toggle: CSSProperties = { float: "right", fontSize: 12 };
const field: CSSProperties = { display: "block", margin: "6px 0" };
const about: CSSProperties = { margin: "6px 0", color: "#cfcfcf", lineHeight: 1.35 };
const buttons: CSSProperties = { display: "flex", gap: 6, margin: "6px 0" };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
);
