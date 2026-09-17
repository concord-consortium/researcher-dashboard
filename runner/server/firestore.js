import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from "firebase/firestore";
import { firebaseConfig } from "./firebase-projects.js";
import { log } from "./log.js";

// One signed-in connection to one Firebase project. Firestore is what the status
// documents need; CLUE also keeps document content in the Realtime Database, so
// `rtdb` is here too rather than in a second class holding a second sign-in.
//
// The client SDK rather than firebase-admin, because the runner acts as the
// researcher: it signs in with the custom token the portal minted and is subject
// to the same rules the dashboard is, rather than bypassing them with a service
// account. That is what makes the runner claim in the rules meaningful.
export class FirestoreStore {
  #signedIn = null;
  #emulators = null;
  #rtdb = null;

  // `emulators` points the SDK at a local Firestore and Auth instead of the real
  // project. The client SDK ignores FIRESTORE_EMULATOR_HOST, which only the admin
  // SDK reads, so the connection has to be made explicitly. An emulator accepts any
  // apiKey, so it needs no entry in firebase-projects.js and a test project works.
  constructor({ projectId, emulators = null, app } = {}) {
    const config = emulators ? { projectId, apiKey: "unused" } : firebaseConfig(projectId);
    this.app = app ?? initializeApp(config, `runner-${projectId}`);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    this.#emulators = emulators;
    if (emulators) {
      const [host, port] = emulators.firestore.split(":");
      connectFirestoreEmulator(this.db, host, Number(port));
      connectAuthEmulator(this.auth, `http://${emulators.auth}`, { disableWarnings: true });
    }
  }

  // Connected on first use: the status documents never touch the RTDB, so a VM that
  // only writes status should not open a database connection it will not use.
  get rtdb() {
    if (!this.#rtdb) {
      this.#rtdb = getDatabase(this.app);
      if (this.#emulators?.database) {
        const [host, port] = this.#emulators.database.split(":");
        connectDatabaseEmulator(this.#rtdb, host, Number(port));
      }
    }
    return this.#rtdb;
  }

  // Exchanged once and kept: the refresh token outlives the custom token's hour,
  // and memory survives a suspend, so a resumed VM keeps its session.
  async signIn(customToken) {
    this.#signedIn = await signInWithCustomToken(this.auth, customToken);
    log.info("firestore.signed_in", { uid: this.#signedIn.user.uid });
    return this.#signedIn;
  }

  async set(path, fields) {
    await setDoc(doc(this.db, path), fields);
  }

  async merge(path, fields) {
    await setDoc(doc(this.db, path), fields, { merge: true });
  }
}
