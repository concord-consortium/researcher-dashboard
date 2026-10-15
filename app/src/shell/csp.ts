import type { PortalConfig } from "./portals";

// The hosts the Firebase Auth and Firestore web SDKs call, signing in with a custom token and
// in-memory persistence. A popup, redirect or reCAPTCHA flow would need more, and the app has none.
export const FIREBASE_HOSTS = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firestore.googleapis.com"
];

// `img-src` is the directive that matters most: an image is a request to any host at render time.
export function contentSecurityPolicy(portals: PortalConfig[]): string {
  const connect = new Set(["'self'", ...portals.flatMap((p) => [p.origin, p.reportServer]), ...FIREBASE_HOSTS]);
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src ${[...connect].join(" ")}`,
    "font-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-src 'none'"
  ].join("; ");
}
