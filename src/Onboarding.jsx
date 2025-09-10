import { useState, useEffect } from "react";

export default function Onboarding({ user, onDone }) {
  const [dislikes, setDislikes] = useState("");
  const [bodyType, setBodyType] = useState("");
  const [skinTone, setSkinTone] = useState("");
  const [favColors, setFavColors] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const BASE_URL = "https://wow-wardrobe-backend-himjabehl.replit.app";

  useEffect(() => {
    if (!user?.uid) return;

    fetch(`${BASE_URL}/onboarding?uid=${user.uid}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.dislikes) setDislikes(data.dislikes.join(", "));
        if (data.bodyType) setBodyType(data.bodyType);
        if (data.skinTone) setSkinTone(data.skinTone);
        if (data.favColors) setFavColors(data.favColors.join(", "));
      })
      .catch((err) => console.error("❌ Failed to load prefs:", err));
  }, [user]);

  const savePreferences = async () => {
    if (!user?.uid) {
      alert("User not logged in.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          dislikes: dislikes.split(",").map((s) => s.trim()),
          bodyType,
          skinTone,
          favColors: favColors.split(",").map((s) => s.trim()),
        }),
      });

      const result = await res.json();

      if (res.ok) {
        setSubmitted(true);
        if (onDone) onDone();
      } else {
        alert("Failed to save preferences: " + result.error);
      }
    } catch (err) {
      console.error("❌ Failed to save preferences:", err);
      alert("Something went wrong while saving.");
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Tell us about your styling preferences 💬</h2>

      <input
        type="text"
        placeholder="Dislikes (e.g., heels, neon)"
        value={dislikes}
        onChange={(e) => setDislikes(e.target.value)}
        style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem" }}
      />
      <input
        type="text"
        placeholder="Body Type (e.g., pear, rectangle)"
        value={bodyType}
        onChange={(e) => setBodyType(e.target.value)}
        style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem" }}
      />
      <input
        type="text"
        placeholder="Skin Tone (e.g., warm, cool, neutral)"
        value={skinTone}
        onChange={(e) => setSkinTone(e.target.value)}
        style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem" }}
      />
      <input
        type="text"
        placeholder="Favorite Colors (e.g., red, pastel pink)"
        value={favColors}
        onChange={(e) => setFavColors(e.target.value)}
        style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem" }}
      />

      <button
        onClick={savePreferences}
        style={{
          marginTop: "1rem",
          padding: "1rem 2rem",
          background: "#000",
          color: "#fff",
          border: "none",
        }}
        disabled={loading}
      >
        {loading ? "Saving..." : "Save & Continue"}
      </button>

      {submitted && <p style={{ marginTop: "1rem" }}>🎉 Preferences saved!</p>}
    </div>
  );
}
