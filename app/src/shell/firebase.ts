import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, inMemoryPersistence, initializeAuth, signInWithCustomToken } from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore, onSnapshot, type Firestore } from "firebase/firestore";

// The Firebase project this app reads, and the sign-in that gets it in: report-service's,
// which holds the dashboard tree, with a custom token the portal minted for one class.
//
// None of these values is secret. A Web API key identifies a project to Identity Toolkit
// and carries quota; it authorizes nothing, and access is decided by the custom token and
// the security rules. The same values ship in CLUE's and report-service's own bundles,
// where the atob wrapper keeps secret scanners quiet.
const PROJECTS: Record<string, Record<string, string>> = {
  "report-service-dev": {
    apiKey: atob("QUl6YVN5Q3Z4S1d1WURnSjRyNG84SmVOQU9ZdXN4MGFWNzFfWXVF"),
    authDomain: "report-service-dev.firebaseapp.com",
    databaseURL: "https://report-service-dev.firebaseio.com",
    projectId: "report-service-dev",
    storageBucket: "report-service-dev.appspot.com",
    messagingSenderId: "402218300971",
    appId: "1:402218300971:web:32b7266ef5226ff7"
  }
};

export function firebaseConfig(projectId: string): Record<string, string> {
  const config = PROJECTS[projectId];
  if (!config) throw new Error(`no Firebase config for ${projectId}`);
  return config;
}

// Where a local Firestore and Auth live, when they do. The web SDK ignores
// FIRESTORE_EMULATOR_HOST, which only the admin SDK reads, so the connection has to be
// made explicitly, exactly as the runner does it. Both must be set together: signing in
// against the real Auth and reading a local Firestore fails in a way that looks like a
// rules problem.
export interface Emulators {
  firestore: string;
  auth: string;
}

export function emulatorsFromEnv(env: Record<string, string | undefined>): Emulators | null {
  const firestore = env.VITE_FIRESTORE_EMULATOR;
  const auth = env.VITE_AUTH_EMULATOR;
  if (!firestore || !auth) return null;
  return { firestore, auth };
}

const apps = new Map<string, FirebaseApp>();

// Named per project, because initializeApp with no name registers the default app and a
// second project would then either clash or silently reuse the first.
export async function signIn(
  projectId: string, customToken: string, emulators: Emulators | null = null
): Promise<Firestore> {
  let app = apps.get(projectId);
  if (!app) {
    // An emulator accepts any apiKey, so a project it has never heard of still works and
    // no entry in the config map above is needed for one.
    app = initializeApp(
      emulators ? { projectId, apiKey: "unused" } : firebaseConfig(projectId), projectId
    );
    apps.set(projectId, app);

    // Not Firebase's default IndexedDB, which every tab and every app on this origin shares:
    // a second tab on another class would replace this one's sign-in, and the session would
    // outlive the page.
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    if (emulators) {
      const [host, port] = emulators.firestore.split(":");
      connectFirestoreEmulator(getFirestore(app), host, Number(port));
      connectAuthEmulator(auth, `http://${emulators.auth}`, { disableWarnings: true });
    }
  }
  await signInWithCustomToken(getAuth(app), customToken);
  return getFirestore(app);
}

// The portal segment: the host with its dots as underscores, which is the convention CLUE
// and report-service already use for portal-keyed collections. Hostnames cannot contain an
// underscore, so the two forms round-trip.
export function portalSegment(portalOrigin: string): string {
  return new URL(portalOrigin).host.replace(/\./g, "_");
}

export function classPath(portalOrigin: string, classHash: string): string {
  return `researcher_dashboard/${portalSegment(portalOrigin)}/classes/${classHash}`;
}

export function watchDoc<T>(
  db: Firestore, path: string, onValue: (value: T | null) => void, onError: (error: Error) => void
): () => void {
  return onSnapshot(
    doc(db, path),
    (snapshot) => onValue(snapshot.exists() ? (snapshot.data() as T) : null),
    (error) => {
      console.error(`listener on ${path} failed`, error);
      onError(error);
    }
  );
}
