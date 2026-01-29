import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import {
  getAuth,
  GoogleAuthProvider,
  signOut,
  setPersistence,
  browserLocalPersistence,
  signInWithRedirect,
  getRedirectResult
} from "firebase/auth";
import { getFirestore, collection, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDKb1Z-f9foPpgwYdwJN2Ahskumxgq2yds",
  authDomain: "wowapp1406.firebaseapp.com",
  projectId: "wowapp1406",
  storageBucket: "wowapp1406.appspot.com",
  messagingSenderId: "397999508782",
  appId: "1:397999508782:web:a2ddb8e1c9c577747d3ebf"
};

const app = initializeApp(firebaseConfig);

const storage = getStorage(app);
const auth = getAuth(app);

// ✅ Persist auth across Safari / iOS / in-app browsers
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Auth persistence failed:", err);
});

const provider = new GoogleAuthProvider();
const db = getFirestore(app);

export {
  storage,
  auth,
  provider,
  signOut,
  db,
  collection,
  query,
  where,
  signInWithRedirect,
  getRedirectResult
};
