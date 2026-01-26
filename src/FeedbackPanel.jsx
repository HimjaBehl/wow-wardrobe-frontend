// src/FeedbackPanel.jsx
import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export default function FeedbackPanel({ uid }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!uid) {
      setRows([]);
      setLoading(false);
      setErr("No uid yet (login required).");
      return;
    }

    setLoading(true);
    setErr("");

    // ✅ shows latest first
    const q = query(
      collection(db, "outfitFeedback"),
      where("uid", "==", uid),
      orderBy("created_at", "desc"),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(data);
        setLoading(false);
      },
      (e) => {
        console.error("FeedbackPanel error:", e);
        setErr(e?.message || "Failed to load feedback.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  // ✅ Dark theme safe rendering
  return (
    <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 14 }}>
      {loading && <p style={{ color: "#fff", opacity: 0.8, margin: 0 }}>Loading feedback…</p>}

      {!loading && err && (
        <p style={{ color: "#fff", opacity: 0.85, margin: 0 }}>
          ⚠️ {err}
          <br />
          <span style={{ opacity: 0.7 }}>
            If this mentions an index, open the Firebase console link in the error and create it.
          </span>
        </p>
      )}

      {!loading && !err && rows.length === 0 && (
        <p style={{ color: "#fff", opacity: 0.75, margin: 0 }}>
          No feedback yet. Tap ❤️ Love / 💔 Dislike / 🔁 Swap and it’ll appear here.
        </p>
      )}

      {!loading && !err && rows.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ color: "#fff", fontWeight: 700 }}>
                  {String(r.action || "").toUpperCase()}
                </div>
                <div style={{ color: "#fff", opacity: 0.7, fontSize: 12 }}>
                  {r.created_at?.toDate ? r.created_at.toDate().toLocaleString() : ""}
                </div>
              </div>

              <div style={{ marginTop: 6, color: "#fff", opacity: 0.85, fontSize: 13 }}>
                <div>Occasion: {r.occasion || "—"}</div>
                <div>Vibe: {r.vibe || "—"}</div>
                <div style={{ opacity: 0.8 }}>Outfit ID: {r.outfit_id || "—"}</div>
              </div>

              {Array.isArray(r.items) && r.items.length > 0 && (
                <div style={{ marginTop: 8, color: "#fff", opacity: 0.9, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Items</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {r.items.slice(0, 8).map((it, idx) => (
                      <li key={idx}>
                        {it.name || "Item"} <span style={{ opacity: 0.7 }}>({it.category || "—"})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
