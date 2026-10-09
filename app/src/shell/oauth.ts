import type { Launch } from "./launch";

// The OAuth2 authorization code flow with PKCE, as a public client of the portal. The verifier
// and state wait in sessionStorage across the redirect; the access token is never stored.

export const CLIENT_ID = "researcher-dashboard";
const PENDING_KEY = "researcher-dashboard:pending-launch";

export interface Pending extends Launch {
  state: string;
  verifier: string;
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomValue(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// The portal matches the redirect URI exactly against the Client's, which name index.html.
export function redirectUriFor(location: { origin: string; pathname: string }): string {
  const path = location.pathname.endsWith("/") ? `${location.pathname}index.html` : location.pathname;
  return `${location.origin}${path}`;
}

export function authorizeUrl(
  portalOrigin: string, launch: Launch, redirectUri: string, state: string, challenge: string
): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    context: `class:${launch.classId}`
  });
  if (launch.loginHint) params.set("login_hint", launch.loginHint);
  return `${portalOrigin}/auth/oauth_authorize?${params}`;
}

export async function startAuthorization(
  portalOrigin: string, launch: Launch, redirectUri: string,
  storage: Storage, navigate: (url: string) => void
): Promise<void> {
  const pending: Pending = { ...launch, state: randomValue(), verifier: randomValue() };
  storage.setItem(PENDING_KEY, JSON.stringify(pending));
  navigate(authorizeUrl(portalOrigin, launch, redirectUri, pending.state, await challengeFor(pending.verifier)));
}
