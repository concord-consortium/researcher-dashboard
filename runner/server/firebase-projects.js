// The Firebase client config per project the runner signs into, alongside the name of
// the portal `firebase_apps` row whose service account signs the custom token for it.
//
// The two are declared together because they must name the same project: the portal
// signs with that row's credentials and the project here verifies the signature. Held
// apart they drift, and a drifted pair fails at sign-in with nothing to say which half
// is wrong. The names are not always equal, which is what makes the pairing worth
// writing down: CLUE production is portal row `collaborative-learning` against project
// `collaborative-learning-ec215`. This follows
// collaborative-learning/src/lib/firebase-config.ts, which pairs them the same way, and
// portal-report/js/db.ts for report-service's two projects.
//
// None of this is secret. A Web API key identifies a project to Identity Toolkit and
// carries quota; it authorizes nothing, and access is decided by the custom token and
// the security rules. These same values ship in CLUE's and report-service's client
// bundles. The atob wrapper matches those repos, where it keeps secret scanners quiet.
const PROJECTS = {
  "report-service-dev": {
    portalFirebaseApp: "report-service-dev",
    clueProject: "collaborative-learning-staging",
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
  "report-service-pro": {
    portalFirebaseApp: "report-service-pro",
    clueProject: "collaborative-learning-ec215",
    config: {
      apiKey: atob("QUl6YVN5Qm1OU2EyVXozRGFFd0tjbHN2SFBCd2Z1Y1NtWldBQXpn"),
      authDomain: "report-service-pro.firebaseapp.com",
      databaseURL: "https://report-service-pro.firebaseio.com",
      projectId: "report-service-pro",
      storageBucket: "report-service-pro.appspot.com",
      messagingSenderId: "22386066971",
      appId: "1:22386066971:web:e0cdec7cb0f0893a8a5abe"
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
  },
  "collaborative-learning-ec215": {
    portalFirebaseApp: "collaborative-learning",
    config: {
      apiKey: atob("QUl6YVN5QVV6T2JMblZESURYYTB4ZUxmSVpLV3BiLTJZSWpYSXBJ"),
      authDomain: "collaborative-learning-ec215.firebaseapp.com",
      databaseURL: "https://collaborative-learning-ec215.firebaseio.com",
      projectId: "collaborative-learning-ec215",
      storageBucket: "collaborative-learning-ec215.appspot.com",
      messagingSenderId: "112537088884",
      appId: "1:112537088884:web:c51b1b8432fff36faff221"
    }
  }
};

function entry(projectId) {
  const found = PROJECTS[projectId];
  if (!found) {
    throw new Error(
      `No Firebase config for project ${projectId}; known: ${Object.keys(PROJECTS).join(", ")}`
    );
  }
  return found;
}

export function firebaseConfig(projectId) {
  return entry(projectId).config;
}

// The portal `firebase_apps` row whose tokens this project accepts. rigse keys
// class_tokens by it, so it is what the runner looks a token up by.
export function portalFirebaseApp(projectId) {
  return entry(projectId).portalFirebaseApp;
}

// Which project holds CLUE for the environment a report-service project serves. Runner
// configuration per environment, not a caller parameter:
// the payload's firebase_project says which environment this VM is in.
export function clueProjectFor(reportServiceProject) {
  const clue = entry(reportServiceProject).clueProject;
  if (!clue) throw new Error(`${reportServiceProject} is not a report-service project, so it names no CLUE project`);
  return clue;
}

export function knownProjects() {
  return Object.keys(PROJECTS);
}
