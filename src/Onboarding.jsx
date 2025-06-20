import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase"; // ensure db is exported from firebase.js

export default function Onboarding({ user, onDone }) {
  const [stylePrefs, setStylePrefs] = useState("");

  const savePreferences = async () => {
    await setDoc(doc(db, "preferences", user.uid), {
      uid: user.uid,
      stylePrefs
    });
    onDone();
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Tell us about your styling preferences 💬</h2>
      <input
        type="text"
        placeholder="E.g., no heels, love flowy clothes..."
        value={stylePrefs}
        onChange={(e) => setStylePrefs(e.target.value)}
        style={{ width: "100%", padding: "1rem" }}
      />
      <button onClick={savePreferences} style={{ marginTop: "1rem" }}>
        Save & Continue
      </button>
    </div>
  );
}
