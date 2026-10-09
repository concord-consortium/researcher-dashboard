// The launch link carries where to authenticate, which class to ask for, and who is asking.
// `classId` is only ever a request: it becomes the authorize request's `context`, and the
// class the app shows afterwards is the one the issued token is bound to.

export interface Launch {
  authDomain: string;
  classId: string;
  loginHint: string | null;
}

const ID = /^[1-9][0-9]*$/;

export function parseLaunch(search: string): Launch | null {
  const params = new URLSearchParams(search);
  const authDomain = params.get("authDomain");
  const classId = params.get("classId");
  if (!authDomain || !classId || !ID.test(classId)) return null;
  const loginHint = params.get("loginHint");
  return { authDomain, classId, loginHint: loginHint && ID.test(loginHint) ? loginHint : null };
}
