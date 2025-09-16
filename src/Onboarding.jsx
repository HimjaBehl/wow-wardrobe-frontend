import { useState, useEffect } from "react";

export default function Onboarding({ user, onDone }) {
  const [gender, setGender] = useState("");
  const [bodyShape, setBodyShape] = useState("");
  const [complexion, setComplexion] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const BASE_URL = "https://wow-wardrobe-backend-himjabehl.replit.app";

  useEffect(() => {
    if (!user?.uid) return;

    fetch(`${BASE_URL}/onboarding?uid=${user.uid}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.gender) setGender(data.gender);
        if (data.bodyShape) setBodyShape(data.bodyShape);
        if (data.complexion) setComplexion(data.complexion);
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
          gender,
          bodyShape,
          complexion,
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
      <h2>Tell us about yourself 👋</h2>
      <p>We’ll personalize your styling experience ✨</p>

      {/* Gender */}
      <label>Gender</label>
      <select
        value={gender}
        onChange={(e) => setGender(e.target.value)}
        style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem" }}
        required
      >
        <option value="">Select your gender</option>
        <option value="female">👩 Female</option>
        <option value="male">👨 Male</option>
        <option value="nonbinary">⚧ Non-binary</option>
        <option value="other">Other</option>
      </select>

      {/* Body Shape */}
      <input
        type="text"
        placeholder="Body Shape (e.g., pear, rectangle)"
        value={bodyShape}
        onChange={(e) => setBodyShape(e.target.value)}
        style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem" }}
      />

      {/* Complexion */}
      <input
        type="text"
        placeholder="Complexion (e.g., fair, olive, deep)"
        value={complexion}
        onChange={(e) => setComplexion(e.target.value)}
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
