import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export default function FeedbackPanel({ uid }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!uid) return;

    setErr("");
    const q = query(
      collection(db, "outfitFeedback"),
      where("uid", "==", uid),
      orderBy("created_at", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(data);
      },
      (e) => {
        console.error("FeedbackPanel snapshot error:", e);
        setErr(String(e?.message || e));
      }
    );

    return () => unsub();
  }, [uid]);

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ margin: "0 0 10px" }}>My Outfit Feedback (last 20)</h3>

      {err && (
        <div style={{ padding: 12, background: "#ffecec", borderRadius: 10 }}>
          <b>Couldn’t load feedback:</b> {err}
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            If it mentions an index, open Firestore → Indexes → create the suggested composite index.
          </div>
        </div>
      )}

      {!err && rows.length === 0 && (
        <div style={{ padding: 12, background: "#f6f6f6", borderRadius: 10 }}>
          No feedback yet. Love/Dislike/Swap/Plan a look to see it here.
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ padding: 12, border: "1px solid #e5e5e5", borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <b>{String(r.action || "").toUpperCase()}</b>
              <span style={{ opacity: 0.7, fontSize: 12 }}>
                {r.outfit_id || r.id}
              </span>
            </div>

            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>
              Occasion: {r.occasion || "—"} | Vibe: {r.vibe || "—"}
            </div>

            {Array.isArray(r.reason_tags) && r.reason_tags.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {r.reason_tags.map((t, i) => (
                  <span key={i} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "#f2f2f2" }}>
                    {t}
                  </span>
                ))}
              </div>
            )}

            {Array.isArray(r.items) && r.items.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                {r.items.slice(0, 5).map((it, i) => (
                  <div key={i} style={{ opacity: 0.9 }}>
                    • {it.name || it.category || "Item"} ({it.category || "—"})
                  </div>
                ))}
                {r.items.length > 5 && <div style={{ opacity: 0.7 }}>… +{r.items.length - 5} more</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
