import { parseLaunch, type Launch } from "./launch";
import { redirectUriFor, startAuthorization } from "./oauth";
import { portalFor, type PortalConfig } from "./portals";

// What the page does before React renders: start an authorization, or decide there is nothing
// to launch. Kept outside React because the pending launch is single use and StrictMode runs
// effects twice.

export type InfoReason = "no-launch" | "unknown-portal" | "sign-in-failed";

export type Start =
  | { kind: "info"; reason: InfoReason }
  | { kind: "redirecting" };

export interface StartDeps {
  search: string;
  location: { origin: string; pathname: string };
  storage: Storage;
  navigate: (url: string) => void;
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
  const launch = parseLaunch(deps.search);
  if (!launch) return { kind: "info", reason: "no-launch" };
  const portal = portalFor(launch.authDomain, deps.devPortal);
  if (!portal) return { kind: "info", reason: "unknown-portal" };
  await reauthorize(deps, portal, launch);
  return { kind: "redirecting" };
}
