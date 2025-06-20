import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // ✅ NEW

const firebaseConfig = {
  apiKey: "AIzaSyDKb1Z-f9foPpgwYdwJN2Ahskumxgq2yds",
    authDomain: "wowapp1406.firebaseapp.com",
    projectId: "wowapp1406",
    storageBucket: "wowapp1406.firebasestorage.app",
    messagingSenderId: "397999508782",
    appId: "1:397999508782:web:a2ddb8e1c9c577747d3ebf"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app); // ✅ NEW

export { storage, auth, provider, signInWithPopup, signOut, db }; // ✅ UPDATED
