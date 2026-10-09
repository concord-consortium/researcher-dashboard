// The launch link carries where to authenticate, which class to ask for, and who is asking.
// `classId` is only ever a request: it becomes the authorize request's `context`, and the
// class the app shows afterwards is the one the issued token is bound to.

export interface Launch {
  authDomain: string;
  classId: string;
  loginHint: string | null;
}

// What the portal's redirect back carries: a code to redeem, or the error it refused with.
export type Callback =
  | { state: string; code: string }
  | { state: string; error: string };

const ID = /^[1-9][0-9]*$/;

export function parseLaunch(search: string): Launch | null {
  const params = new URLSearchParams(search);
  const authDomain = params.get("authDomain");
  const classId = params.get("classId");
  if (!authDomain || !classId || !ID.test(classId)) return null;
  const loginHint = params.get("loginHint");
  return { authDomain, classId, loginHint: loginHint && ID.test(loginHint) ? loginHint : null };
}

export function parseCallback(search: string): Callback | null {
  const params = new URLSearchParams(search);
  const state = params.get("state");
  if (!state) return null;
  const code = params.get("code");
  if (code) return { state, code };
  const error = params.get("error");
  return error ? { state, error } : null;
}

export function launchQuery(launch: Launch): string {
  const params = new URLSearchParams({ authDomain: launch.authDomain, classId: launch.classId });
  if (launch.loginHint) params.set("loginHint", launch.loginHint);
  return `?${params}`;
}
