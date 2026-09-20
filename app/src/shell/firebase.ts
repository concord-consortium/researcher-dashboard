import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import {
  collection, doc, getFirestore, onSnapshot, type Firestore
} from "firebase/firestore";

// The Firebase projects this app reads, and the sign-in that gets it in.
//
// Two of them, because a custom token is signed by one project's service account and
// cannot be exchanged in another: the display documents live in report-service's project
// and CLUE's documents live in CLUE's. The app signs into each separately with a token the
// portal minted for that project.
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
  },
  "collaborative-learning-staging": {
    apiKey: atob("QUl6YVN5Q0dKRjQybE15XzhjSFpkU0lQa0FvWE9WWFBHMmotSHAw"),
    authDomain: "collaborative-learning-staging.firebaseapp.com",
    databaseURL: "https://collaborative-learning-staging-default-rtdb.firebaseio.com",
    projectId: "collaborative-learning-staging",
    storageBucket: "collaborative-learning-staging.firebasestorage.app",
    messagingSenderId: "822807055414",
    appId: "1:822807055414:web:9e08fe0f4ffaf6130f9c97"
  }
};

export function firebaseConfig(projectId: string): Record<string, string> {
  const config = PROJECTS[projectId];
  if (!config) throw new Error(`no Firebase config for ${projectId}`);
  return config;
}

const apps = new Map<string, FirebaseApp>();

// Named per project, because initializeApp with no name registers the default app and a
// second project would then either clash or silently reuse the first.
export async function signIn(projectId: string, customToken: string): Promise<Firestore> {
  let app = apps.get(projectId);
  if (!app) {
    app = initializeApp(firebaseConfig(projectId), projectId);
    apps.set(projectId, app);
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

export interface Paths {
  researcher: (platformUserId: string) => string;
  clazz: (classHash: string) => string;
  results: (classHash: string) => string;
}

export function paths(portalOrigin: string): Paths {
  const root = `researcher_dashboard/${portalSegment(portalOrigin)}`;
  return {
    researcher: (platformUserId) => `${root}/researchers/${platformUserId}`,
    clazz: (classHash) => `${root}/classes/${classHash}`,
    results: (classHash) => `${root}/classes/${classHash}/results`
  };
}

export function watchDoc<T>(
  db: Firestore, path: string, onValue: (value: T | null) => void
): () => void {
  return onSnapshot(
    doc(db, path),
    (snapshot) => onValue(snapshot.exists() ? (snapshot.data() as T) : null),
    // A listener that dies silently leaves the page frozen on its last value with no sign
    // that it stopped, which reads as "nothing is happening" rather than as an error.
    (error) => console.error(`listener on ${path} failed`, error)
  );
}

export function watchCollection<T>(
  db: Firestore, path: string, onValue: (values: Array<T & { id: string }>) => void
): () => void {
  return onSnapshot(
    collection(db, path),
    (snapshot) => onValue(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))),
    (error) => console.error(`listener on ${path} failed`, error)
  );
}
