import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { doc, getFirestore, setDoc } from "firebase/firestore";
import { log } from "./log.js";

// The client SDK rather than firebase-admin, because the runner acts as the
// researcher: it signs in with the custom token the portal minted and is subject
// to the same rules the dashboard is, rather than bypassing them with a service
// account. That is what makes the runner claim in the rules meaningful.
export class FirestoreStore {
  #signedIn = null;

  constructor({ projectId, emulatorHost = null, app } = {}) {
    this.app = app ?? initializeApp({ projectId }, `runner-${projectId}`);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    this.emulatorHost = emulatorHost;
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
