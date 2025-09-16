import { useState, useEffect } from "react";

export default function Profile({ user }) {
  const [gender, setGender] = useState("");
  const [bodyShape, setBodyShape] = useState("");
  const [complexion, setComplexion] = useState("");
  const [loading, setLoading] = useState(false);

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
      .catch((err) => console.error("❌ Failed to load profile:", err));
  }, [user]);

  const saveProfile = async () => {
    if (!user?.uid) return alert("Login first!");

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, gender, bodyShape, complexion }),
      });

      if (res.ok) {
        alert("✅ Profile updated!");
      } else {
        alert("❌ Failed to update profile");
      }
    } catch (err) {
      console.error(err);
      alert("Error updating profile");
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Your Profile 👤</h2>
      <p>Update your preferences anytime.</p>

      <label>Gender</label>
      <select
        value={gender}
        onChange={(e) => setGender(e.target.value)}
        style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem" }}
      >
        <option value="">Select gender</option>
        <option value="female">👩 Female</option>
        <option value="male">👨 Male</option>
        <option value="nonbinary">⚧ Non-binary</option>
        <option value="other">Other</option>
      </select>

      <label>Body Shape</label>
      <input
        type="text"
        placeholder="e.g., pear, rectangle"
        value={bodyShape}
        onChange={(e) => setBodyShape(e.target.value)}
        style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem" }}
      />

      <label>Complexion</label>
      <input
        type="text"
        placeholder="e.g., fair, olive, deep"
        value={complexion}
        onChange={(e) => setComplexion(e.target.value)}
        style={{ width: "100%", padding: "0.75rem", marginBottom: "1rem" }}
      />

      <button
        onClick={saveProfile}
        disabled={loading}
        style={{
          marginTop: "1rem",
          padding: "1rem 2rem",
          background: "#000",
          color: "#fff",
          border: "none",
        }}
      >
        {loading ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}
