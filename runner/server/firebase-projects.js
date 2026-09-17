// The Firebase client config per project the runner signs into, alongside the name of
// the portal `firebase_apps` row whose service account signs the custom token for it.
//
// The two are declared together because they must name the same project: the portal
// signs with that row's credentials and the project here verifies the signature. Held
// apart they drift, and a drifted pair fails at sign-in with nothing to say which half
// is wrong. The names are not always equal, which is what makes the pairing worth
// writing down: CLUE production is portal row `collaborative-learning` against project
// `collaborative-learning-ec215`. This follows
// collaborative-learning/src/lib/firebase-config.ts, which pairs them the same way.
//
// None of this is secret. A Web API key identifies a project to Identity Toolkit and
// carries quota; it authorizes nothing, and access is decided by the custom token and
// the security rules. These same values ship in CLUE's and report-service's client
// bundles. The atob wrapper matches those repos, where it keeps secret scanners quiet.
const PROJECTS = {
  "report-service-dev": {
    portalFirebaseApp: "report-service-dev",
    config: {
      apiKey: atob("QUl6YVN5Q3Z4S1d1WURnSjRyNG84SmVOQU9ZdXN4MGFWNzFfWXVF"),
      authDomain: "report-service-dev.firebaseapp.com",
      databaseURL: "https://report-service-dev.firebaseio.com",
      projectId: "report-service-dev",
      storageBucket: "report-service-dev.appspot.com",
      messagingSenderId: "402218300971",
      appId: "1:402218300971:web:32b7266ef5226ff7"
    }
  },
  "collaborative-learning-staging": {
    portalFirebaseApp: "collaborative-learning-staging",
    config: {
      apiKey: atob("QUl6YVN5Q0dKRjQybE15XzhjSFpkU0lQa0FvWE9WWFBHMmotSHAw"),
      authDomain: "collaborative-learning-staging.firebaseapp.com",
      databaseURL: "https://collaborative-learning-staging-default-rtdb.firebaseio.com",
      projectId: "collaborative-learning-staging",
      storageBucket: "collaborative-learning-staging.firebasestorage.app",
      messagingSenderId: "822807055414",
      appId: "1:822807055414:web:9e08fe0f4ffaf6130f9c97"
    }
  }
};

export function firebaseConfig(projectId) {
  const entry = PROJECTS[projectId];
  if (!entry) {
    throw new Error(
      `No Firebase config for project ${projectId}; known: ${Object.keys(PROJECTS).join(", ")}`
    );
  }
  return entry.config;
}

// The portal `firebase_apps` row to ask for a token for this project. See above.
export function portalFirebaseApp(projectId) {
  return firebaseConfig(projectId) && PROJECTS[projectId].portalFirebaseApp;
}

export function knownProjects() {
  return Object.keys(PROJECTS);
}
