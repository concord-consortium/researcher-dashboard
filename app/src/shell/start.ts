import { launchQuery, parseCallback, parseLaunch, type Callback, type Launch } from "./launch";
import { exchangeCode, redirectUriFor, startAuthorization, takePending, TokenError, type Pending, type Token } from "./oauth";
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

// The page's way back to the portal. Only the first call starts an authorization: two calls
// refused at once would each store a pending launch, and the browser could leave with the state
// the second one overwrote. A failure to start goes to `onFailure` rather than nowhere.
export function reauthorizer(
  deps: StartDeps, portal: PortalConfig, launch: Launch, onFailure: () => void
): () => void {
  let started = false;
  return () => {
    if (started) return;
    started = true;
    reauthorize(deps, portal, launch).catch(onFailure);
  };
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

// The callback leaves the address bar and the history before anything else, whatever happens
// next, so a reload starts a fresh launch rather than replaying a spent code.
async function finishAuthorization(deps: StartDeps, callback: Callback): Promise<Start> {
  let pending: Pending | null;
  try {
    pending = takePending(deps.storage, callback.state);
  } catch {
    pending = null;
  }
  if (!pending) {
    deps.replaceUrl(deps.location.pathname);
    return { kind: "info", reason: "sign-in-failed" };
  }
  const launch: Launch = { authDomain: pending.authDomain, classId: pending.classId, loginHint: pending.loginHint };
  deps.replaceUrl(`${deps.location.pathname}${launchQuery(launch)}`);
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
    return { kind: "ready", portal, launch, token };
  } catch (error) {
    return { kind: "info", reason: "sign-in-failed", detail: error instanceof TokenError ? error.message : undefined };
  }
}
