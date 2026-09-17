// The three things an analysis does, kept behind one interface so the lifecycle,
// the state machine and the sync contract could be built and tested before any of
// them exist. Todo 14 supplies the CLUE reader, todo 15 the AP and log pulls, and
// todo 16 the package fetch and run.

function notYet(todo, what) {
  return () => {
    throw new Error(`${what} arrives with todo ${todo}`);
  };
}

export function makeSteps() {
  return {
    // Installs the report-service token into cc-data's credential store and signs
    // the Firebase session in. The sign-in half is real because the status doc
    // writes depend on it; the cc-data half is todo 15's.
    installCredential: async ({ sessionToken, store }) => {
      if (sessionToken && store?.signIn) await store.signIn(sessionToken);
    },
    resolvePackage: notYet(16, "package fetch and checksum verification"),
    pullData: notYet(15, "the AP, log and CLUE pulls"),
    runPackage: notYet(16, "running a package")
  };
}
