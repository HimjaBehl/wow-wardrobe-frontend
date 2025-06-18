import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
const firebaseConfig = {
  apiKey: "AIzaSyDKb1Z-f9foPpgwYdwJN2Ahskumxgq2yds",
  authDomain: "wowapp1406.firebaseapp.com",
  projectId: "wowapp1406",
  storageBucket: "wowapp1406.firebasestorage.app",
  messagingSenderId: "397999508782",
  appId: "1:397999508782:web:0ba0338df8d1316b7d3ebf",
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { storage, auth, provider, signInWithPopup, signOut };
