import { launchQuery, parseCallback, parseLaunch, type Callback, type Launch } from "./launch";
import { exchangeCode, redirectUriFor, startAuthorization, takePending, TokenError, type Token } from "./oauth";
import { portalFor, type PortalConfig } from "./portals";

// What the page does before React renders: start an authorization, finish one, or decide there
// is nothing to launch. Kept outside React because the pending launch is single use and
// StrictMode runs effects twice.

export type InfoReason =
  | "no-launch" | "unknown-portal" | "sign-in-failed" | "access-denied" | "authorize-error"
  | "withdrawn" | "class-gone" | "unsupported-scope" | "expired";

export type Start =
  | { kind: "info"; reason: InfoReason; detail?: string }
  | { kind: "redirecting" }
  | { kind: "ready"; portal: PortalConfig; launch: Launch; token: Token };

export interface StartDeps {
  search: string;
  location: { origin: string; pathname: string };
  storage: Storage;
  navigate: (url: string) => void;
  replaceUrl: (url: string) => void;
  fetchImpl: typeof fetch;
  now: () => number;
  devPortal: PortalConfig | null;
}

export async function reauthorize(deps: StartDeps, portal: PortalConfig, launch: Launch): Promise<void> {
  await startAuthorization(portal.origin, launch, redirectUriFor(deps.location), deps.storage, deps.navigate);
}

// Whatever the launch throws (storage that refuses a write, no WebCrypto) is the sign-in page,
// never a blank one.
export function start(deps: StartDeps): Promise<Start> {
  return resolveStart(deps).catch((): Start => ({ kind: "info", reason: "sign-in-failed" }));
}

async function resolveStart(deps: StartDeps): Promise<Start> {
  const callback = parseCallback(deps.search);
  if (callback) return finishAuthorization(deps, callback);

  const launch = parseLaunch(deps.search);
  if (!launch) return { kind: "info", reason: "no-launch" };
  const portal = portalFor(launch.authDomain, deps.devPortal);
  if (!portal) return { kind: "info", reason: "unknown-portal" };
  await reauthorize(deps, portal, launch);
  return { kind: "redirecting" };
}

async function finishAuthorization(deps: StartDeps, callback: Callback): Promise<Start> {
  const pending = takePending(deps.storage, callback.state);
  if (!pending) return { kind: "info", reason: "sign-in-failed" };
  if ("error" in callback) {
    return callback.error === "access_denied"
      ? { kind: "info", reason: "access-denied" }
      : { kind: "info", reason: "authorize-error", detail: callback.error };
  }
  const portal = portalFor(pending.authDomain, deps.devPortal);
  if (!portal) return { kind: "info", reason: "unknown-portal" };
  try {
    const token = await exchangeCode(
      portal.origin, callback.code, pending.verifier, redirectUriFor(deps.location), deps.fetchImpl, deps.now()
    );
    const launch: Launch = { authDomain: pending.authDomain, classId: pending.classId, loginHint: pending.loginHint };
    // The code leaves the address bar and the history; a reload starts a fresh launch.
    deps.replaceUrl(`${deps.location.pathname}${launchQuery(launch)}`);
    return { kind: "ready", portal, launch, token };
  } catch (error) {
    if (error instanceof TokenError) return { kind: "info", reason: "sign-in-failed", detail: error.message };
    return { kind: "info", reason: "sign-in-failed" };
  }
}
