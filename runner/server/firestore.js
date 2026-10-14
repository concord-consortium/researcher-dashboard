import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken } from "firebase/auth";
import { Timestamp, connectFirestoreEmulator, doc, getDoc, getFirestore, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseConfig } from "./firebase-projects.js";
import { log } from "./log.js";

// One signed-in connection to one Firebase project, for one request.
//
// The client SDK rather than firebase-admin, because the runner acts as the researcher:
// it signs in with the custom token the portal or the function minted and is subject to
// the same rules the dashboard is, rather than bypassing them with a service account.
// That is what makes the runner claim in the rules meaningful.
//
// A store is never kept for the VM's life: a session goes stale across a suspend, so the
// runner signs a new store in with each /work answer's tokens and closes the last one.
let apps = 0;

export class FirestoreStore {
  // `emulators` points the SDK at a local Firestore and Auth instead of the real
  // project. The client SDK ignores FIRESTORE_EMULATOR_HOST, which only the admin
  // SDK reads, so the connection has to be made explicitly. An emulator accepts any
  // apiKey, so it needs no entry in firebase-projects.js and a test project works.
  // Each store gets its own Firebase app, since one app holds one signed-in principal.
  constructor({ projectId, emulators = null, app, appName } = {}) {
    const config = emulators ? { projectId, apiKey: "unused" } : firebaseConfig(projectId);
    apps += 1;
    this.app = app ?? initializeApp(config, appName ?? `runner-${projectId}-${apps}`);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    if (emulators) {
      const [host, port] = emulators.firestore.split(":");
      connectFirestoreEmulator(this.db, host, Number(port));
      connectAuthEmulator(this.auth, `http://${emulators.auth}`, { disableWarnings: true });
    }
  }

  async signIn(customToken) {
    const credential = await signInWithCustomToken(this.auth, customToken);
    log.info("firestore.signed_in", { project: this.app.options.projectId });
    return credential;
  }

  // The claims Firebase verified at sign-in, as every rule and the function see them.
  async claims() {
    return (await this.auth.currentUser.getIdTokenResult()).claims;
  }

  // The ID token the function's routes authenticate with. `force` after a resume, since
  // the SDK's own refresh runs on a timer that stops while the VM is suspended.
  async idToken(force = false) {
    if (!this.auth.currentUser) throw new Error("this store has not signed in");
    return this.auth.currentUser.getIdToken(force);
  }

  async get(path) {
    const snap = await getDoc(doc(this.db, path));
    return snap.exists() ? snap.data() : null;
  }

  async set(path, fields) {
    await setDoc(doc(this.db, path), fields);
  }

  async merge(path, fields) {
    await setDoc(doc(this.db, path), fields, { merge: true });
  }

  // Merges only while `test` holds for the stored document (null when there is none),
  // read and written in one transaction. Answers whether it wrote.
  async mergeIf(path, test, fields) {
    const ref = doc(this.db, path);
    return runTransaction(this.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!test(snap.exists() ? snap.data() : null)) return false;
      tx.set(ref, fields, { merge: true });
      return true;
    });
  }

  // Writes each named field whole, leaving the document's other fields alone: a map
  // written here replaces the stored map rather than merging into it.
  async replaceFields(path, fields) {
    await setDoc(doc(this.db, path), fields, { mergeFields: Object.keys(fields) });
  }

  // The server's time, which the rules require on every runner write to runners/ and to
  // a result: no clock inside the VM is real after a suspend.
  serverTimestamp() {
    return serverTimestamp();
  }

  timestamp(date) {
    return Timestamp.fromDate(date);
  }

  async close() {
    await deleteApp(this.app);
  }
}
