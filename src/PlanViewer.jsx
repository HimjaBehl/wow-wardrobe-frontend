// src/PlanViewer.jsx
import React from "react";
import "./Planner.css"; // reuse tokens & card styles

export default function PlanViewer({ open, plan, onClose }) {
  if (!open || !plan) return null;

  const { date, outfit = {} } = plan;
  const items = Array.isArray(outfit.items) ? outfit.items : [];

  return (
    <div
      className="wow-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3000
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "86vh",
          overflow: "auto",
          padding: "var(--spacing-lg)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0 }}>
            {outfit.title || "Planned Outfit"}
          </h3>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>

        <p className="muted" style={{ marginTop: 4 }}>
          {new Date(date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" })}
        </p>

        {(outfit.vibe || outfit.note) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {outfit.vibe && <span className="tag tag-accent">{outfit.vibe}</span>}
            {outfit.note && <span className="tag">{outfit.note}</span>}
          </div>
        )}

        {items.length > 0 ? (
          <div style={{ marginTop: "var(--spacing-lg)" }}>
            <h4 style={{ margin: 0, marginBottom: "var(--spacing-sm)" }}>Pieces</h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "var(--spacing-md)"
              }}
            >
              {items.map((it, i) => (
                <div key={`${it.id || i}`} className="card" style={{ padding: 8 }}>
                  {it.image_url && (
                    <img
                      src={it.image_url}
                      alt={it.name || `Item ${i + 1}`}
                      style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 8, marginBottom: 8 }}
                    />
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: ".95rem" }}>{it.name || "Item"}</div>
                    {it.category && <div className="muted" style={{ fontSize: ".85rem" }}>{it.category}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: "var(--spacing-lg)" }}>
            No items saved for this plan yet. (Only title/note/vibe present.)
          </p>
        )}
      </div>
    </div>
  );
}
