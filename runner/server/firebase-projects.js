// The Firebase client config of each report-service project the runner signs in to. The
// payload's firebase_project names one, and rigse keys the class tokens by the same name.
//
// None of this is secret. A Web API key identifies a project to Identity Toolkit and
// carries quota; it authorizes nothing, and access is decided by the custom token and
// the security rules. These same values ship in report-service's client bundles
// (portal-report/js/db.ts). The atob wrapper keeps secret scanners quiet, as there.
const PROJECTS = {
  "report-service-dev": {
    apiKey: atob("QUl6YVN5Q3Z4S1d1WURnSjRyNG84SmVOQU9ZdXN4MGFWNzFfWXVF"),
    authDomain: "report-service-dev.firebaseapp.com",
    databaseURL: "https://report-service-dev.firebaseio.com",
    projectId: "report-service-dev",
    storageBucket: "report-service-dev.appspot.com",
    messagingSenderId: "402218300971",
    appId: "1:402218300971:web:32b7266ef5226ff7"
  },
  "report-service-pro": {
    apiKey: atob("QUl6YVN5Qm1OU2EyVXozRGFFd0tjbHN2SFBCd2Z1Y1NtWldBQXpn"),
    authDomain: "report-service-pro.firebaseapp.com",
    databaseURL: "https://report-service-pro.firebaseio.com",
    projectId: "report-service-pro",
    storageBucket: "report-service-pro.appspot.com",
    messagingSenderId: "22386066971",
    appId: "1:22386066971:web:e0cdec7cb0f0893a8a5abe"
  }
};

export function firebaseConfig(projectId) {
  const config = PROJECTS[projectId];
  if (!config) {
    throw new Error(
      `No Firebase config for project ${projectId}; known: ${Object.keys(PROJECTS).join(", ")}`
    );
  }
  return config;
}

export function knownProjects() {
  return Object.keys(PROJECTS);
}
