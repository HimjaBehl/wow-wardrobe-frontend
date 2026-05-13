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
  { label: "Safe",         sub: "Stay within my style" },
  { label: "Slightly new", sub: "One fresh element" },
  { label: "Bold",         sub: "Surprise me" },
];
const DISLIKE_CHIPS = [
  "Too basic", "Too bold", "Too warm", "Wrong colors",
  "Wrong silhouette", "Wrong shoes", "Not occasion appropriate",
];

const FALLBACK_NOTE = "Styled for your selected vibe with weather and silhouette balance in mind.";

// ── Chip selector ────────────────────────────────────────────────────────────
function ChipGroup({ options, value, onChange }) {
  return (
    <div className="chip-group">
      {options.map((opt) => {
        const label = typeof opt === "object" ? opt.label : opt;
        const sub   = typeof opt === "object" ? opt.sub   : null;
        return (
          <button
            key={label}
            type="button"
            className={`chip${value === label ? " chip--active" : ""}`}
            onClick={() => onChange(label)}
          >
            {label}
            {sub && <span className="chip-sub">{sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Item image with clean fallback ───────────────────────────────────────────
function ItemImage({ piece }) {
  const [broken, setBroken] = useState(false);

  if (!piece.image_url || broken) {
    return (
      <div className="lc__img-ph">
        <span className="lc__img-ph-letter">
          {(piece.category || piece.name || "?")[0].toUpperCase()}
        </span>
        <span className="lc__img-ph-label">{piece.category || "Item"}</span>
      </div>
    );
  }

  return (
    <img
      className="lc__img"
      src={piece.image_url}
      alt={piece.name || "item"}
      onError={() => setBroken(true)}
    />
  );
}

// ── Single look card ─────────────────────────────────────────────────────────
function LookCard({ look, lookIndex, occasion, vibe, user, onLike, onSave, onDislike }) {
  const [liked,       setLiked]       = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [dislikeOpen, setDislikeOpen] = useState(false);
  const [dislikeSent, setDislikeSent] = useState(false);

  const pieces = Array.isArray(look.items) ? look.items : [];

  const handleLike = () => {
    if (liked) return;
    setLiked(true);
    onLike(look);
  };
  const handleSave = () => {
    if (saved) return;
    setSaved(true);
    onSave(look);
  };
  const handleDislike = (chip) => {
    setDislikeSent(true);
    setDislikeOpen(false);
    onDislike(look, chip);
  };

  return (
    <article className="lc">
      {/* ── Header ── */}
      <header className="lc__header">
        <span className="lc__num">LOOK {String(lookIndex + 1).padStart(2, "0")}</span>
        <h3 className="lc__title">{look.title || "Curated Look"}</h3>
      </header>

      {/* ── Tina's notes ── */}
      <div className="lc__notes">
        <p className="lc__why">
          {look.why_it_works || FALLBACK_NOTE}
        </p>

        {(look.weather_note || look.silhouette_note || look.color_note) && (
          <div className="lc__meta-row">
            {look.weather_note && (
              <span className="lc__meta lc__meta--weather">
                <span className="lc__meta-icon">☁</span>
                {look.weather_note}
              </span>
            )}
            {look.silhouette_note && (
              <span className="lc__meta lc__meta--silhouette">
                <span className="lc__meta-icon">◈</span>
                {look.silhouette_note}
              </span>
            )}
            {look.color_note && (
              <span className="lc__meta lc__meta--color">
                <span className="lc__meta-icon">●</span>
                {look.color_note}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Item filmstrip ── */}
      <div className="lc__items">
        {pieces.map((piece) => (
          <div key={piece.id} className="lc__item">
            <div className="lc__img-wrap">
              <ItemImage piece={piece} />
              <span className={`lc__badge${piece.source === "uploaded_item" ? " lc__badge--yours" : " lc__badge--closet"}`}>
                {piece.source === "uploaded_item" ? "YOURS" : "CLOSET"}
              </span>
            </div>
            <p className="lc__item-name">{piece.name}</p>
            {piece.role && <p className="lc__item-role">{piece.role}</p>}
          </div>
        ))}
      </div>

      {/* ── Action buttons ── */}
      <div className="lc__actions">
        <button
          className={`lc__btn lc__btn--love${liked ? " lc__btn--done" : ""}`}
          onClick={handleLike}
          disabled={liked}
          aria-label="Love this look"
        >
          <span className="lc__btn-icon">♡</span>
          <span>{liked ? "Loved" : "Love it"}</span>
        </button>

        <button
          className={`lc__btn lc__btn--save${saved ? " lc__btn--done" : ""}`}
          onClick={handleSave}
          disabled={saved}
          aria-label="Save this look"
        >
          <span className="lc__btn-icon">⊕</span>
          <span>{saved ? "Saved" : "Save look"}</span>
        </button>

        <button
          className={`lc__btn lc__btn--vibe${dislikeOpen ? " lc__btn--open" : ""}`}
          onClick={() => !dislikeSent && setDislikeOpen((v) => !v)}
          aria-label="Not my vibe"
        >
          <span>Not my vibe</span>
        </button>
      </div>

      {/* ── Dislike chips ── */}
      {dislikeOpen && !dislikeSent && (
        <div className="lc__dislike">
          <p className="lc__dislike-label">Tell Tina what's off:</p>
          <div className="lc__dislike-chips">
            {DISLIKE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                className="lc__dislike-chip"
                onClick={() => handleDislike(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {dislikeSent && (
        <p className="lc__dislike-sent">Got it — Tina will learn from this.</p>
      )}
    </article>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function StylePiecePage({ user, userPrefs, items, city, setCity }) {
  // ── All state at top ───────────────────────────────────────────────────────
  const [anchorItem,      setAnchorItem]      = useState(null);
  const [anchorPreview,   setAnchorPreview]   = useState(null);
  const [occasion,        setOccasion]        = useState("Everyday");
  const [vibe,            setVibe]            = useState("Minimal");
  const [comfort,         setComfort]         = useState("Balanced");
  const [experimentLevel, setExperimentLevel] = useState("Slightly new");
  const [userNote,        setUserNote]        = useState("");
  const [loading,         setLoading]         = useState(false);
  const [looks,           setLooks]           = useState([]);
  const [rawResponse,     setRawResponse]     = useState(null);

  // ── Safe wardrobe list (guard against undefined prop) ─────────────────────
  const wardrobeItems = Array.isArray(items) ? items : [];

  // ── Build freetext prompt from comfort + experiment selections ─────────────
  const buildPrompt = () => {
    const parts = [];
    if (comfort !== "Balanced")           parts.push(`Comfort preference: ${comfort}`);
    if (experimentLevel !== "Slightly new") parts.push(`Styling direction: ${experimentLevel}`);
    if (userNote.trim())                  parts.push(userNote.trim());
    return parts.join(". ");
  };

  // ── Reset everything ───────────────────────────────────────────────────────
  const reset = () => {
    setAnchorItem(null);
    setAnchorPreview(null);
    setLooks([]);
    setRawResponse(null);
  };

  // ── Upload anchor piece ────────────────────────────────────────────────────
  const handleAnchorUpload = async (file) => {
    if (!file || !user?.uid) return;
    setLoading(true);
    setAnchorPreview(URL.createObjectURL(file));
    setAnchorItem(null);
    setLooks([]);

    try {
      const uniqueName  = `${user.uid}/${Date.now()}_${file.name}`;
      const storageRef  = ref(storage, `wardrobe/${uniqueName}`);
      await uploadBytes(storageRef, file);
      const imageUrl    = await getDownloadURL(storageRef);
      const storagePath = storageRef.fullPath;

      // ── Auto-tag: read body once ──
      const tagRes = await fetch(`${BASE_URL}/auto-tag`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ image_url: imageUrl }),
      });

      let itemName     = "Uploaded piece";
      let itemCategory = "";
      let itemColor    = "";
      let itemTags     = [];

      if (tagRes.ok) {
        try {
          const tagData  = await tagRes.json();
          const detected = tagData.detectedItems || tagData.detected || [];
          if (detected.length > 0) {
            const first  = detected[0];
            itemName     = first.name     || itemName;
            itemCategory = first.category || "";
            itemColor    = first.color    || "";
            itemTags     = Array.isArray(first.tags) ? first.tags : [];
          }
        } catch (e) { console.warn("[auto-tag] parse error:", e); }
      }

      // ── Save to wardrobe: read body once ──
      const saveRes = await fetch(`${BASE_URL}/wardrobe`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          uid:        user.uid,
          image_path: storagePath,
          image_url:  imageUrl,
          name:       itemName,
          category:   itemCategory,
          color:      itemColor,
          tags:       itemTags,
        }),
      });

      let savedId = `anchor_${Date.now()}`;
      if (saveRes.ok) {
        try {
          const saveData = await saveRes.json();
          savedId = saveData.id || saveData.doc_id || savedId;
        } catch (e) { console.warn("[wardrobe-save] parse error:", e); }
      }

      setAnchorItem({
        id:         String(savedId),
        image_url:  imageUrl,
        image_path: storagePath,
        name:       itemName,
        category:   itemCategory,
        color:      itemColor,
        tags:       itemTags,
      });
    } catch (err) {
      console.error("Anchor upload failed:", err);
      alert("Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Generate outfits ───────────────────────────────────────────────────────
  const handleStylePiece = async () => {
    if (!user?.uid || !anchorItem) { alert("Upload a piece first."); return; }
    setLoading(true);
    setLooks([]);

    try {
      const res = await fetch(`${BASE_URL}/style-piece`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          uid:              user?.uid,
          occasion,
          vibe,
          city,
          gender:           userPrefs?.gender || "",
          include_wardrobe: true,
          include_staples:  true,
          staples_version:  "v2",
          prompt:           buildPrompt(),
          anchor_item: {
            id:          anchorItem?.id,
            wardrobe_id: anchorItem?.id,
            image_url:   anchorItem?.image_url,
            name:        anchorItem?.name     || "",
            category:    anchorItem?.category || "",
            color:       anchorItem?.color    || "",
            tags:        Array.isArray(anchorItem?.tags) ? anchorItem.tags : [],
          },
        }),
      });

      // Read body ONCE as text, then parse — eliminates any double-read risk
      const bodyText = await res.text();
      let data;
      try { data = JSON.parse(bodyText); } catch { data = {}; }
      setRawResponse(data);
      if (!res.ok) throw new Error(data?.error || `style-piece failed (${res.status})`);

      const mappedLooks = (data.outfits || []).map((look, lookIdx) => {
        const mappedItems = (look.pieces || []).map((piece, pieceIdx) => {
          if (piece.source === "uploaded_item") {
            return {
              id:        `anchor-${lookIdx}-${pieceIdx}`,
              name:      piece.name     || anchorItem?.name     || "Uploaded piece",
              category:  piece.category || anchorItem?.category || "",
              color:     piece.color    || anchorItem?.color    || "",
              role:      piece.role,
              source:    piece.source,
              image_url: anchorItem?.image_url || "",
            };
          }

          const matched =
            wardrobeItems.find((w) => String(w.id)          === String(piece.idx)) ||
            wardrobeItems.find((w) => String(w.doc_id)      === String(piece.idx)) ||
            wardrobeItems.find((w) => String(w.wardrobe_id) === String(piece.idx));

          return {
            id:        piece.idx || `w-${lookIdx}-${pieceIdx}`,
            name:      matched?.displayName || matched?.name || piece.name || "",
            category:  matched?.category    || piece.category || "",
            color:     matched?.color       || piece.color    || "",
            role:      piece.role,
            source:    piece.source || "wardrobe",
            image_url: matched?.image_url   || piece.image_url || "",
          };
        });

        return {
          id:              look.id || `look-${lookIdx}`,
          title:           look.title || "Curated Look",
          why_it_works:    look.why_it_works    || look.style_note || "",
          weather_note:    look.weather_note    || "",
          silhouette_note: look.silhouette_note || "",
          color_note:      look.color_note      || "",
          items:           mappedItems.filter((p) => p && (p.image_url || p.source === "uploaded_item" || p.name)),
        };
      });

      setLooks(mappedLooks);
    } catch (err) {
      console.error(err);
      alert("Could not style this piece. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Feedback handlers (fire-and-forget, never crash the UI) ───────────────
  const handleLike = async (look) => {
    try {
      const pieceList = (look.items || []).map((p) => ({ id: p.id, name: p.name, category: p.category }));
      await fetch(`${BASE_URL}/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user?.uid, event_type: "like", outfit_id: look.id, items: pieceList, occasion, vibe }),
      });
      await logOutfitFeedback({ uid: user?.uid, occasion, vibe, action: "like", outfit_id: look.id, items: pieceList });
    } catch (e) { console.warn("[like]", e); }
  };

  const handleSave = async (look) => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const pieceList = (look.items || []).map((p) => ({ id: p.id, name: p.name, category: p.category }));
      await fetch(`${BASE_URL}/plan-outfit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user?.uid, date: today, outfit: { items: look.items || [], title: look.title } }),
      });
      await logOutfitFeedback({ uid: user?.uid, occasion, vibe, action: "save", outfit_id: look.id, items: pieceList });
    } catch (e) { console.warn("[save]", e); }
  };

  const handleDislike = async (look, chip) => {
    try {
      const pieceList = (look.items || []).map((p) => ({ id: p.id, name: p.name, category: p.category }));
      await fetch(`${BASE_URL}/dislike-outfit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user?.uid, outfit_id: look.id, reason: chip, items: pieceList, occasion, vibe }),
      });
      await logOutfitFeedback({ uid: user?.uid, occasion, vibe, action: "dislike", outfit_id: look.id, items: pieceList, reason_tags: [chip] });
    } catch (e) { console.warn("[dislike]", e); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="section section-wardrobe sp-page">

      <h2 className="section-title">Style a Piece</h2>
      <p className="sp-tagline">Upload any item — Tina builds 3 complete looks around it.</p>

      {/* ── Input panel ── */}
      <div className="sp-panel">

        {/* Hero upload zone */}
        <div className="hero-upload-zone">
          {anchorItem ? (
            <div className="anchor-selected">
              <img src={anchorItem.image_url} alt={anchorItem.name || "piece"} className="anchor-img" />
              <div className="anchor-meta">
                <span className="anchor-name">{anchorItem.name}</span>
                <span className="anchor-cat">
                  {anchorItem.category}{anchorItem.color ? ` · ${anchorItem.color}` : ""}
                </span>
                <button type="button" className="anchor-remove" onClick={reset}>
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
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAnchorUpload(f); e.target.value = ""; }}
              />
              <div className="hero-upload-icon">+</div>
              <p className="hero-upload-text">Drop a photo of the piece</p>
              <p className="hero-upload-sub">Tina will build outfits around it</p>
            </label>
          )}
        </div>

        <div className="input-block">
          <label className="input-label">Occasion</label>
          <ChipGroup options={OCCASIONS} value={occasion} onChange={setOccasion} />
        </div>
        <div className="input-block">
          <label className="input-label">Vibe</label>
          <ChipGroup options={VIBES} value={vibe} onChange={setVibe} />
        </div>
        <div className="input-block">
          <label className="input-label">Comfort today</label>
          <ChipGroup options={COMFORT} value={comfort} onChange={setComfort} />
        </div>
        <div className="input-block">
          <label className="input-label">How adventurous?</label>
          <ChipGroup options={EXPERIMENT} value={experimentLevel} onChange={setExperimentLevel} />
        </div>
        <div className="input-block">
          <label className="input-label">City (for weather)</label>
          <input
            className="form-input"
            value={city || ""}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Delhi, Mumbai, London"
          />
        </div>
        <div className="input-block">
          <label className="input-label">
            Anything specific? <span className="input-label-opt">(optional)</span>
          </label>
          <textarea
            className="form-textarea"
            value={userNote}
            onChange={(e) => setUserNote(e.target.value)}
            placeholder="e.g. I'm petite, need pockets, avoid bulky layers…"
            rows={2}
          />
        </div>

        <button
          className="sp-generate-btn"
          onClick={handleStylePiece}
          disabled={!anchorItem || loading}
        >
          {loading
            ? <><span className="sp-spinner" /> Tina is styling…</>
            : "Build looks around this piece"}
        </button>
      </div>

      {/* ── Context bar ── */}
      {looks.length > 0 && (
        <div className="sp-context-bar">
          <span className="sp-context-label">Styled for</span>
          {[occasion, vibe, comfort, experimentLevel, city].filter(Boolean).map((t) => (
            <span key={t} className="sp-context-chip">{t}</span>
          ))}
        </div>
      )}

      {/* ── Look cards ── */}
      {looks.length > 0 && (
        <div className="sp-looks">
          {looks.map((look, i) => (
            <LookCard
              key={look.id}
              look={look}
              lookIndex={i}
              occasion={occasion}
              vibe={vibe}
              user={user}
              onLike={handleLike}
              onSave={handleSave}
              onDislike={handleDislike}
            />
          ))}
          <div style={{ height: 40 }} />
        </div>
      )}

      {/* Debug accordion — hidden in production */}
      {rawResponse && (
        <details className="sp-debug">
          <summary>Debug: raw API response</summary>
          <pre>{JSON.stringify(rawResponse, null, 2)}</pre>
        </details>
      )}

      {/* Version marker */}
      <p style={{ textAlign: "center", color: "rgba(255,255,255,.2)", fontSize: ".65rem", marginTop: 12, letterSpacing: ".08em" }}>
        Style UX v2 · stable
      </p>

    </section>
  );
}
