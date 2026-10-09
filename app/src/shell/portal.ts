import type { Token } from "./oauth";

// The calls the app makes with its access token. Each origin comes from the build's allowlist
// (portals.ts), and the token is held in memory for the page's life.

export interface Assignment {
  offering_id: number;
  runnable_id: number | null;
  name: string | null;
  url: string;
  tool: string | null;
}

export interface Scope {
  kind: string;
  id: number;
  name: string;
  class_hash: string;
  platform_user_id: number;
  teachers: Array<{ id: number; name: string }>;
  cohorts: Array<{ id: number; name: string }>;
  project_ids: number[];
  assignment_fingerprint: string;
  assignments: Assignment[];
}

// A package as report-server lists it, with the fields this page reads.
export interface PackageRow {
  catalog_id: number;
  identity: string;
  name: string;
  visibility: "private" | "project" | "public";
  official: boolean;
  mine: boolean;
  project: { id: number; name: string | null } | null;
  current_version: { version: string; title: string | null; description: string | null };
  applies: boolean;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// A token about to expire, or refused with a 401. `young` marks a refusal of a token issued
// moments ago, which authorizing again would only repeat.
export class SessionExpired extends Error {
  constructor(readonly young: boolean) {
    super("the session expired");
  }
}

const EXPIRY_MARGIN_MS = 60_000;

export class Api {
  constructor(
    private readonly origin: string,
    private readonly token: Token,
    // Wrapped rather than passed as a bare reference: `fetch` must be called with `window` as
    // its receiver, and `this.fetchImpl(...)` would make the Api the receiver, which browsers
    // reject with "Illegal invocation".
    private readonly fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
    private readonly now: () => number = Date.now
  ) {}

  // A token refused or already near expiry moments after it was issued would only be issued
  // again the same way, so the page stops rather than looping through the portal.
  private young(): boolean {
    return this.now() - this.token.issuedAt < EXPIRY_MARGIN_MS;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (this.now() > this.token.expiresAt - EXPIRY_MARGIN_MS) throw new SessionExpired(this.young());
    const response = await this.fetchImpl(`${this.origin}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${this.token.accessToken}` }
    });
    if (response.status === 401) throw new SessionExpired(this.young());
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      // The server's own message says which of several refusals this is.
      const message = (body && (body.message ?? body.error)) || `${path} failed`;
      throw new ApiError(String(message), response.status);
    }
    return body as T;
  }
}

export class Portal {
  constructor(private readonly api: Api) {}

  scope(): Promise<Scope> {
    return this.api.request<Scope>("/api/v1/researcher_dashboard/scope");
  }

  refreshProfile(): Promise<unknown> {
    return this.api.request("/api/v1/researcher_dashboard/refresh_profile", { method: "POST" });
  }

  // `researcher=true` is what makes the portal apply the class check and stamp the claims
  // the dashboard tree's rules key on.
  async firebaseToken(firebaseApp: string, classHash: string): Promise<string> {
    const query = new URLSearchParams({ firebase_app: firebaseApp, class_hash: classHash, researcher: "true" });
    const body = await this.api.request<{ token: string }>(`/api/v1/jwt/firebase?${query}`);
    return body.token;
  }
}

export class ReportServer {
  constructor(private readonly api: Api) {}

  async listPackages(scopeUrls: string[]): Promise<PackageRow[]> {
    const body = await this.api.request<{ packages: PackageRow[] }>("/api/v1/packages/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope_urls: scopeUrls })
    });
    return body.packages;
  }
}
