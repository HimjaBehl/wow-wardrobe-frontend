import "./Wardrobe.css";
// Wardrobe.jsx – minimalist wardrobe screen
import React from "react";
import "./Wardrobe.css";
import { Plus, Trash2, Pencil } from "lucide-react";

/**
 * PROPS
 *  - items: array of { id, image_url, name, category, color }
 *  - onAddClick: () => void   (open upload / add‑item flow)
 *  - onEdit(item): () => void (open tag‑edit modal)
 *  - onDelete(id): () => void  (delete wardrobe item)
 *  - filterCategory / filterColor (optional)
 */
export default function Wardrobe({
  items = [],
  onAddClick,
  onEdit,
  onDelete,
  filterCategory = "",
  filterColor = "",
}) {
  // Apply optional filters locally (feel free to pass pre‑filtered list instead)
  const visible = items.filter((it) => {
    const byCat = filterCategory ? it.category === filterCategory : true;
    const byCol = filterColor
      ? it.color?.toLowerCase() === filterColor.toLowerCase()
      : true;
    return byCat && byCol;
  });

  return (
    <main className="wardrobe-page">
      <header className="wardrobe-header">
        <h1>Wardrobe</h1>
        <p className="subtitle">Your personal collection</p>
      </header>

      {/* === GRID OF ITEMS === */}
      <section className="wardrobe-grid">
        {visible.map((item) => (
          <figure key={item.id} className="wardrobe-item">
            <img
              src={item.image_url}
              alt={item.name || "clothing"}
              className="item-img"
            />
            {/* Hover actions */}
            <figcaption className="item-actions">
              <button
                className="icon-btn"
                aria-label="Edit"
                onClick={() => onEdit?.(item)}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-btn"
                aria-label="Delete"
                onClick={() => onDelete?.(item.id)}
              >
                <Trash2 size={16} />
              </button>
            </figcaption>
          </figure>
        ))}
      </section>

      {/* === FLOATING ADD BUTTON === */}
      <button className="fab" onClick={onAddClick} aria-label="Add item">
        <Plus size={24} />
      </button>
    </main>
  );
}