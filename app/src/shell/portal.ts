// The portal calls the app makes, all of them with the grant from the launch url.
//
// The grant is short-lived and the app holds it for the session, which is the same thing
// portal-report does.

export class PortalError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class Portal {
  constructor(
    private readonly origin: string,
    private readonly token: string,
    // Wrapped rather than passed as a bare reference. `fetch` must be called with `window`
    // as its receiver, and storing it on an instance makes `this.fetchImpl(...)` a method
    // call on the Portal, which browsers reject with "Illegal invocation". Every test
    // injects its own, so nothing but a real browser exercises this default.
    private readonly fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init)
  ) {}

  // `researcher=true` is what makes the portal apply the class check and stamp the claims
  // the dashboard tree's rules key on.
  async firebaseToken(firebaseApp: string, classHash: string): Promise<string> {
    const query = new URLSearchParams({
      firebase_app: firebaseApp,
      class_hash: classHash,
      researcher: "true"
    });
    const body = await this.request<{ token: string }>(`/api/v1/jwt/firebase?${query}`);
    return body.token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.origin}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${this.token}` }
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      // The portal's own message where it sent one: it says which of the several refusals
      // this is, and inventing a friendlier one would lose that.
      const message = (body && (body.message ?? body.error)) || `${path} failed`;
      throw new PortalError(String(message), response.status);
    }
    return body as T;
  }
}
