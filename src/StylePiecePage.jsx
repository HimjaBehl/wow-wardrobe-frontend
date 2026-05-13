import { useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";
import { logOutfitFeedback } from "./logOutfitFeedback";

const BASE_URL = "https://wow-wardrobe-backend-himjabehl.replit.app";

const OCCASIONS = [
  "Everyday", "Brunch", "Dinner", "Office", "Travel",
  "Wedding/Event", "Date Night", "Festive", "Vacation",
];
const VIBES = [
  "Minimal", "Elevated casual", "Feminine soft", "Sporty",
  "Streetwear", "Classic", "Indo-western", "Statement",
];
const COMFORT = ["Super comfortable", "Balanced", "Dressy but wearable"];
const EXPERIMENT = [
  { label: "Safe", sub: "Stay within my style" },
  { label: "Slightly new", sub: "One fresh element" },
  { label: "Bold", sub: "Surprise me" },
];
const DISLIKE_CHIPS = [
  "Too basic", "Too bold", "Too warm", "Wrong colors",
  "Wrong silhouette", "Wrong shoes", "Not occasion appropriate",
];

function ChipGroup({ options, value, onChange, multi = false }) {
  const active = multi ? (Array.isArray(value) ? value : []) : [value];
  const toggle = (opt) => {
    if (multi) {
      onChange(active.includes(opt) ? active.filter((v) => v !== opt) : [...active, opt]);
    } else {
      onChange(opt);
    }
  };
  return (
    <div className="chip-group">
      {options.map((opt) => {
        const label = typeof opt === "object" ? opt.label : opt;
        const sub = typeof opt === "object" ? opt.sub : null;
        const isActive = active.includes(label);
        return (
          <button
            key={label}
            type="button"
            className={`chip${isActive ? " chip--active" : ""}`}
            onClick={() => toggle(label)}
          >
            {label}
            {sub && <span className="chip-sub">{sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function StylePiecePage({ user, userPrefs, items, city, setCity }) {
  // anchor
  const [anchorItem, setAnchorItem] = useState(null);
  const [anchorPreview, setAnchorPreview] = useState(null);

  // inputs
  const [occasion, setOccasion] = useState("Everyday");
  const [vibe, setVibe] = useState("Minimal");
  const [comfort, setComfort] = useState("Balanced");
  const [experimentLevel, setExperimentLevel] = useState("Slightly new");
  const [userNote, setUserNote] = useState("");

  // results
  const [loading, setLoading] = useState(false);
  const [looks, setLooks] = useState([]);
  const [rawResponse, setRawResponse] = useState(null);

  // feedback per look
  const [likedIds, setLikedIds] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());
  const [openFeedback, setOpenFeedback] = useState(null); // look id
  const [feedbackSent, setFeedbackSent] = useState(new Set());

  const buildPrompt = () => {
    const parts = [];
    if (comfort !== "Balanced") parts.push(`Comfort preference: ${comfort}`);
    if (experimentLevel !== "Slightly new") parts.push(`Styling direction: ${experimentLevel}`);
    if (userNote.trim()) parts.push(userNote.trim());
    return parts.join(". ");
  };

  const handleAnchorUpload = async (file) => {
    if (!file || !user?.uid) return;
    setLoading(true);
    setAnchorPreview(URL.createObjectURL(file));
    setAnchorItem(null);
    setLooks([]);
    try {
      const uniqueName = `${user.uid}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `wardrobe/${uniqueName}`);
      await uploadBytes(storageRef, file);
      const imageUrl = await getDownloadURL(storageRef);
      const storagePath = storageRef.fullPath;

      const tagRes = await fetch(`${BASE_URL}/auto-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });

      let itemName = "Uploaded piece";
      let itemCategory = "";
      let itemColor = "";
      let itemTags = [];

      if (tagRes.ok) {
        const tagData = await tagRes.json();
        const detected = tagData.detectedItems || tagData.detected || [];
        if (detected.length > 0) {
          const first = detected[0];
          itemName = first.name || itemName;
          itemCategory = first.category || "";
          itemColor = first.color || "";
          itemTags = Array.isArray(first.tags) ? first.tags : [];
        }
      }

      const saveRes = await fetch(`${BASE_URL}/wardrobe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          image_path: storagePath,
          image_url: imageUrl,
          name: itemName,
          category: itemCategory,
          color: itemColor,
          tags: itemTags,
        }),
      });

      let savedId = `anchor_${Date.now()}`;
      if (saveRes.ok) {
        const saveData = await saveRes.json();
        savedId = saveData.id || saveData.doc_id || savedId;
      }

      setAnchorItem({
        id: String(savedId),
        image_url: imageUrl,
        image_path: storagePath,
        name: itemName,
        category: itemCategory,
        color: itemColor,
        tags: itemTags,
      });
    } catch (err) {
      console.error("Anchor upload failed:", err);
      alert("Upload failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleStylePiece = async () => {
    if (!user?.uid || !anchorItem) {
      alert("Upload a piece first.");
      return;
    }
    setLoading(true);
    setLooks([]);
    setLikedIds(new Set());
    setSavedIds(new Set());
    setOpenFeedback(null);
    setFeedbackSent(new Set());

    try {
      const res = await fetch(`${BASE_URL}/style-piece`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user?.uid,
          occasion,
          vibe,
          city,
          gender: userPrefs?.gender || "",
          include_wardrobe: true,
          include_staples: true,
          staples_version: "v2",
          prompt: buildPrompt(),
          anchor_item: {
            id: anchorItem?.id,
            wardrobe_id: anchorItem?.id,
            image_url: anchorItem?.image_url,
            name: anchorItem?.name || "",
            category: anchorItem?.category || "",
            color: anchorItem?.color || "",
            tags: Array.isArray(anchorItem?.tags) ? anchorItem.tags : [],
          },
        }),
      });

      const data = await res.json();
      setRawResponse(data);
      if (!res.ok) throw new Error(data?.error || "style-piece failed");

      const mappedLooks = (data.outfits || []).map((look, lookIdx) => {
        const mappedItems = (look.pieces || []).map((piece, pieceIdx) => {
          if (piece.source === "uploaded_item") {
            return {
              id: `anchor-${lookIdx}-${pieceIdx}`,
              name: piece.name,
              category: piece.category,
              color: piece.color,
              role: piece.role,
              source: piece.source,
              image_url: anchorItem.image_url,
            };
          }
          if (piece.source === "wardrobe" || piece.source === "staple") {
            const matched =
              items.find((w) => String(w.id) === String(piece.idx)) ||
              items.find((w) => String(w.doc_id) === String(piece.idx)) ||
              items.find((w) => String(w.wardrobe_id) === String(piece.idx));
            return {
              id: piece.idx || `w-${lookIdx}-${pieceIdx}`,
              name: matched?.displayName || matched?.name || piece.name,
              category: matched?.category || piece.category,
              color: matched?.color || piece.color,
              role: piece.role,
              source: piece.source,
              image_url: matched?.image_url || piece.image_url || "",
            };
          }
          return {
            id: piece.idx || `x-${lookIdx}-${pieceIdx}`,
            name: piece.name,
            category: piece.category,
            color: piece.color,
            role: piece.role,
            source: piece.source,
            image_url: piece.image_url || "",
          };
        });

        return {
          id: look.id || `look-${lookIdx}`,
          title: look.title,
          why_it_works: look.why_it_works || look.style_note || "",
          weather_note: look.weather_note || "",
          silhouette_note: look.silhouette_note || "",
          color_note: look.color_note || "",
          items: mappedItems.filter((p) => p && (p.image_url || p.source === "uploaded_item")),
        };
      });

      setLooks(mappedLooks);
    } catch (err) {
      console.error(err);
      alert("Could not style this piece.");
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (look) => {
    setLikedIds((prev) => new Set([...prev, look.id]));
    try {
      await fetch(`${BASE_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user?.uid,
          event_type: "like",
          outfit_id: look.id,
          items: look.items.map((p) => ({ id: p.id, name: p.name, category: p.category })),
          occasion,
          vibe,
        }),
      });
      await logOutfitFeedback({
        uid: user?.uid,
        occasion,
        vibe,
        action: "like",
        outfit_id: look.id,
        items: look.items.map((p) => ({ id: p.id, name: p.name, category: p.category })),
      });
    } catch (e) {
      console.warn("Like signal failed (non-fatal):", e);
    }
  };

  const handleSave = async (look) => {
    setSavedIds((prev) => new Set([...prev, look.id]));
    const today = new Date().toISOString().slice(0, 10);
    try {
      await fetch(`${BASE_URL}/plan-outfit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user?.uid,
          date: today,
          outfit: { items: look.items, title: look.title },
        }),
      });
      await logOutfitFeedback({
        uid: user?.uid,
        occasion,
        vibe,
        action: "save",
        outfit_id: look.id,
        items: look.items.map((p) => ({ id: p.id, name: p.name, category: p.category })),
      });
    } catch (e) {
      console.warn("Save signal failed (non-fatal):", e);
    }
  };

  const handleDislike = async (look, chip) => {
    setFeedbackSent((prev) => new Set([...prev, look.id]));
    setOpenFeedback(null);
    try {
      await fetch(`${BASE_URL}/dislike-outfit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user?.uid,
          outfit_id: look.id,
          reason: chip,
          items: look.items.map((p) => ({ id: p.id, name: p.name, category: p.category })),
          occasion,
          vibe,
        }),
      });
      await logOutfitFeedback({
        uid: user?.uid,
        occasion,
        vibe,
        action: "dislike",
        outfit_id: look.id,
        items: look.items.map((p) => ({ id: p.id, name: p.name, category: p.category })),
        reason_tags: [chip],
      });
    } catch (e) {
      console.warn("Dislike signal failed (non-fatal):", e);
    }
  };

  return (
    <section className="section section-wardrobe">
      <h2 className="section-title">Style a Piece</h2>
      <p className="section-description">
        Upload any item — Tina builds 3 complete looks around it, styled to your taste.
      </p>

      {/* ── Input panel ── */}
      <div className="stylist-shell">
        <div className="stylist-card">

          {/* Hero upload zone */}
          <div className="hero-upload-zone">
            {anchorItem ? (
              <div className="anchor-selected">
                <img src={anchorItem.image_url} alt={anchorItem.name} className="anchor-img" />
                <div className="anchor-meta">
                  <span className="anchor-name">{anchorItem.name}</span>
                  <span className="anchor-cat">{anchorItem.category}{anchorItem.color ? ` · ${anchorItem.color}` : ""}</span>
                  <button
                    type="button"
                    className="anchor-remove"
                    onClick={() => { setAnchorItem(null); setAnchorPreview(null); setLooks([]); }}
                  >
                    Change piece
                  </button>
                </div>
              </div>
            ) : anchorPreview ? (
              <div className="anchor-processing">
                <img src={anchorPreview} alt="preview" className="anchor-img anchor-img--preview" />
                <p className="anchor-status">Reading your piece…</p>
              </div>
            ) : (
              <label className="hero-upload-label">
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAnchorUpload(f);
                    e.target.value = "";
                  }}
                />
                <div className="hero-upload-icon">+</div>
                <p className="hero-upload-text">Drop a photo of the piece</p>
                <p className="hero-upload-sub">Tina will build outfits around it</p>
              </label>
            )}
          </div>

          {/* Occasion */}
          <div className="input-block">
            <label className="input-label">What's the occasion?</label>
            <ChipGroup options={OCCASIONS} value={occasion} onChange={setOccasion} />
          </div>

          {/* Vibe */}
          <div className="input-block">
            <label className="input-label">What vibe are you feeling?</label>
            <ChipGroup options={VIBES} value={vibe} onChange={setVibe} />
          </div>

          {/* Comfort */}
          <div className="input-block">
            <label className="input-label">Comfort level today?</label>
            <ChipGroup options={COMFORT} value={comfort} onChange={setComfort} />
          </div>

          {/* Experiment level */}
          <div className="input-block">
            <label className="input-label">How adventurous?</label>
            <ChipGroup options={EXPERIMENT} value={experimentLevel} onChange={setExperimentLevel} />
          </div>

          {/* City */}
          <div className="input-block">
            <label className="input-label">Your city (for weather)</label>
            <input
              className="form-input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Delhi, Mumbai, London"
            />
          </div>

          {/* Optional note */}
          <div className="input-block">
            <label className="input-label">Anything specific? <span className="input-label-opt">(optional)</span></label>
            <textarea
              className="form-textarea"
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              placeholder="e.g. I'm short so avoid bulky layers, need pockets…"
              rows={2}
            />
          </div>

          <button
            className="btn btn-primary stylist-generate"
            onClick={handleStylePiece}
            disabled={!anchorItem || loading}
          >
            {loading ? "Tina is styling…" : "Build looks around this piece"}
          </button>
        </div>
      </div>

      {/* ── Tina context bar ── */}
      {looks.length > 0 && (
        <div className="tina-context-panel">
          <span className="tina-context-label">Tina styled for</span>
          <span className="tina-chip">{occasion}</span>
          <span className="tina-chip">{vibe}</span>
          <span className="tina-chip">{comfort}</span>
          <span className="tina-chip">{experimentLevel}</span>
          {city && <span className="tina-chip">{city}</span>}
        </div>
      )}

      {/* ── Look cards ── */}
      {looks.length > 0 && (
        <div className="outfit-suggestions">
          {looks.map((look) => {
            const isLiked = likedIds.has(look.id);
            const isSaved = savedIds.has(look.id);
            const dislikeOpen = openFeedback === look.id;
            const dislikeSent = feedbackSent.has(look.id);

            return (
              <div key={look.id} className="look-card-v2">
                {/* Header */}
                <div className="look-card-header">
                  <h3 className="look-title">{look.title}</h3>
                </div>

                {/* Explanation notes */}
                <div className="look-notes">
                  {look.why_it_works && (
                    <p className="look-note look-note--why">{look.why_it_works}</p>
                  )}
                  {look.weather_note && (
                    <p className="look-note look-note--weather">
                      <span className="look-note-icon">☁</span> {look.weather_note}
                    </p>
                  )}
                  {look.silhouette_note && (
                    <p className="look-note look-note--silhouette">
                      <span className="look-note-icon">◈</span> {look.silhouette_note}
                    </p>
                  )}
                  {look.color_note && (
                    <p className="look-note look-note--color">
                      <span className="look-note-icon">●</span> {look.color_note}
                    </p>
                  )}
                </div>

                {/* Pieces grid */}
                <div className="look-items">
                  {look.items.map((piece) => (
                    <div key={piece.id} className="look-item card">
                      {piece.image_url ? (
                        <img
                          className="look-item-image"
                          src={piece.image_url}
                          alt={piece.name}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            if (e.currentTarget.nextElementSibling)
                              e.currentTarget.nextElementSibling.style.display = "grid";
                          }}
                        />
                      ) : null}
                      <div
                        style={{
                          height: 160,
                          display: piece.image_url ? "none" : "grid",
                          placeItems: "center",
                          background: "#f5f5f5",
                          borderRadius: "12px 12px 0 0",
                          color: "#888",
                          fontSize: 13,
                        }}
                      >
                        {piece.category || "No image"}
                      </div>
                      <div className="look-item-info">
                        <p className="look-item-name">{piece.name}</p>
                        <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                          {[piece.role, piece.color].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="look-actions">
                  <button
                    className={`look-action-btn look-action-btn--like${isLiked ? " look-action-btn--active" : ""}`}
                    onClick={() => !isLiked && handleLike(look)}
                    title="Love this look"
                  >
                    {isLiked ? "Loved" : "Love it"}
                  </button>
                  <button
                    className={`look-action-btn look-action-btn--save${isSaved ? " look-action-btn--active" : ""}`}
                    onClick={() => !isSaved && handleSave(look)}
                    title="Save to outfit plan"
                  >
                    {isSaved ? "Saved" : "Save look"}
                  </button>
                  <button
                    className="look-action-btn look-action-btn--dislike"
                    onClick={() => setOpenFeedback(dislikeOpen ? null : look.id)}
                    title="Tell Tina what's off"
                  >
                    Not my vibe
                  </button>
                </div>

                {/* Dislike chips */}
                {dislikeOpen && !dislikeSent && (
                  <div className="dislike-panel">
                    <p className="dislike-label">What's off?</p>
                    <div className="chip-group chip-group--dislike">
                      {DISLIKE_CHIPS.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          className="chip chip--dislike"
                          onClick={() => handleDislike(look, chip)}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {dislikeSent && (
                  <p className="dislike-sent">Got it — Tina will learn from this.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rawResponse && (
        <details style={{ marginTop: 20, padding: "0 16px" }}>
          <summary style={{ cursor: "pointer", color: "#888", fontSize: 13 }}>Debug: raw API response</summary>
          <pre
            style={{
              marginTop: 12,
              whiteSpace: "pre-wrap",
              fontSize: 12,
              background: "#111",
              color: "#ddd",
              padding: 12,
              borderRadius: 12,
              overflowX: "auto",
            }}
          >
            {JSON.stringify(rawResponse, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}
