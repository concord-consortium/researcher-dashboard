import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from "firebase/firestore";
import { firebaseConfig } from "./firebase-projects.js";
import { log } from "./log.js";

// The client SDK rather than firebase-admin, because the runner acts as the
// researcher: it signs in with the custom token the portal minted and is subject
// to the same rules the dashboard is, rather than bypassing them with a service
// account. That is what makes the runner claim in the rules meaningful.
export class FirestoreStore {
  #signedIn = null;

  // `emulators` points the SDK at a local Firestore and Auth instead of the real
  // project. The client SDK ignores FIRESTORE_EMULATOR_HOST, which only the admin
  // SDK reads, so the connection has to be made explicitly. An emulator accepts any
  // apiKey, so it needs no entry in firebase-projects.js and a test project works.
  constructor({ projectId, emulators = null, app } = {}) {
    const config = emulators ? { projectId, apiKey: "unused" } : firebaseConfig(projectId);
    this.app = app ?? initializeApp(config, `runner-${projectId}`);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    if (emulators) {
      const [host, port] = emulators.firestore.split(":");
      connectFirestoreEmulator(this.db, host, Number(port));
      connectAuthEmulator(this.auth, `http://${emulators.auth}`, { disableWarnings: true });
    }
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
