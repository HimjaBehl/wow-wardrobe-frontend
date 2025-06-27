import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export default function Onboarding({ user, onDone }) {
  const [stylePrefs, setStylePrefs] = useState("");

  const savePreferences = async () => {
    if (!user || !user.uid) {
      alert("User not logged in.");
      return;
    }

    try {
      await setDoc(doc(db, "preferences", user.uid), {
        uid: user.uid,
        stylePrefs,
        timestamp: Date.now()
      });
      if (onDone) onDone(); // ✅ only call when successful
    } catch (err) {
      console.error("❌ Failed to save preferences:", err);
      alert("Something went wrong while saving preferences.");
    }
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
      <button onClick={savePreferences} style={{ marginTop: "1rem", padding: "1rem 2rem", background: "#000", color: "#fff", border: "none" }}>
        Save & Continue
      </button>
    </div>
  );
}
