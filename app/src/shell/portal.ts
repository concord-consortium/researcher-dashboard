// The portal calls the app makes, all of them with the grant from the launch url.
//
// The grant is short-lived and the app holds it for the session, which is the same thing
// portal-report does. Nothing here ever sees a runner token: those are minted by the portal
// and handed to report-service, and the app only learns where the result document will be.

export interface Assignment {
  id: number;
  runnable_id: number | null;
  name: string | null;
  // From the portal's `tools.source_type`. Null where the runnable has no tool, which a
  // package matching on platform should skip rather than guess at.
  platform: string | null;
}

export interface ClassInfo {
  id: number;
  name: string;
  class_hash: string;
  // The researcher this dashboard is for. Their status document is keyed by it.
  platform_user_id: number;
  teacher_names: string[];
  cohort_names: string[];
  assignments: Assignment[];
}

export interface RunPackageResult {
  package: string;
  doc_path: string;
  microvm_id?: string;
}

export class PortalError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }

  // The grant expired or was rejected. The app's answer to this is always the same and it
  // is not an error the researcher can act on except by relaunching, so it is worth
  // telling apart from a server that is merely unhappy.
  get unauthorized() {
    return this.status === 401 || this.status === 403;
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

  getClass(classId: string): Promise<ClassInfo> {
    return this.request<ClassInfo>(`/api/v1/researcher_dashboard/classes/${classId}`);
  }

  // Returns as soon as report-service has accepted the run; the result arrives in Firestore
  // at `doc_path`, which is why nothing here waits for it.
  runPackage(body: {
    class_id: number;
    package: { name: string; version: string; checksum: string };
    firebase_project: string;
    firebase_apps: string[];
  }): Promise<RunPackageResult> {
    return this.request<RunPackageResult>("/api/v1/researcher_dashboard/run_package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  // One per Firebase project the page reads, because a custom token is signed by one
  // project's service account and cannot be exchanged in another. `researcher=true` is what
  // makes the portal apply the class check and stamp the claims CLUE's rules key on.
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
