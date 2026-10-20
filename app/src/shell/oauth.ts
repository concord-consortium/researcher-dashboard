import type { Launch } from "./launch";

// The OAuth2 authorization code flow with PKCE, as a public client of the portal. The verifier
// and state wait in sessionStorage across the redirect; the access token is never stored.

export const CLIENT_ID = "researcher-dashboard";
const PENDING_KEY = "researcher-dashboard:pending-launch";

export interface Pending extends Launch {
  state: string;
  verifier: string;
}

export interface Token {
  accessToken: string;
  expiresAt: number;
  issuedAt: number;
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

// The pending launch whose state this callback carries, or null. Removed either way, so a
// replayed callback finds nothing.
export function takePending(storage: Storage, state: string): Pending | null {
  const raw = storage.getItem(PENDING_KEY);
  storage.removeItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as Pending;
    return pending.state === state ? pending : null;
  } catch {
    return null;
  }
}

export class TokenError extends Error {}

export async function exchangeCode(
  portalOrigin: string, code: string, verifier: string, redirectUri: string,
  fetchImpl: typeof fetch, now: number
): Promise<Token> {
  const response = await fetchImpl(`${portalOrigin}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri
    })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.access_token !== "string" || typeof body?.expires_in !== "number") {
    throw new TokenError(body?.error ?? `the token endpoint answered ${response.status}`);
  }
  return { accessToken: body.access_token, issuedAt: now, expiresAt: now + body.expires_in * 1000 };
}
