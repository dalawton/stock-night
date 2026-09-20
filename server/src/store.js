import { memoryStore } from "./memoryStore.js";

const hasFirebaseConfig =
  process.env.FIREBASE_DATABASE_URL &&
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY;

let storePromise;

export async function getStore() {
  if (storePromise) return storePromise;

  storePromise = (async () => {
    if (hasFirebaseConfig) {
      const { initFirebase, firebaseStore } = await import("./firebaseStore.js");
      initFirebase();
      console.log("[store] using Firebase Realtime Database");
      return firebaseStore;
    }
    console.log("[store] no Firebase env vars set — using in-memory store (data resets on restart)");
    return memoryStore;
  })();

  return storePromise;
}
