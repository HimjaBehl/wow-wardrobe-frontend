import { useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

const BASE_URL = "https://wow-wardrobe-backend-himjabehl.replit.app";

const OCCASION_OPTIONS = [
  "workwear",
  "formal",
  "casual",
  "date night",
  "travel",
  "airport",
  "festive",
  "wedding",
  "vacation",
  "gym",
  "lounge",
  "streetwear",
];

const VIBE_OPTIONS = [
  "minimal",
  "chic",
  "bold",
  "elegant",
  "relaxed",
  "smart casual",
  "edgy",
  "classic",
  "trendy",
];

export default function StylePiecePage({
  user,
  userPrefs,
  items,
  city,
  setCity,
}) {
  const [occasion, setOccasion] = useState("workwear");
  const [vibe, setVibe] = useState("minimal");
  const [anchorItem, setAnchorItem] = useState(null);
  const [anchorPreview, setAnchorPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [looks, setLooks] = useState([]);
  const [rawResponse, setRawResponse] = useState(null);

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
    console.log("🎯 Calling /style-piece with:", {
      uid: user?.uid,
      occasion,
      vibe,
      city,
      gender: userPrefs?.gender || "",
      anchorItem,
    });
    try {
      const res = await fetch(`${BASE_URL}/style-piece`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user?.uid,
          occasion,
          vibe,
          city,
          gender: "male",
          include_wardrobe: true,
          include_staples: true,
          staples_version: "v2",
          anchor_item: {
            id: anchorItem?.id,
            wardrobe_id: anchorItem?.id,
            image_url: anchorItem?.image_url,
            name: anchorItem?.name || "",
            category: anchorItem?.category || "",
            color: anchorItem?.color || "",
            tags: Array.isArray(anchorItem?.tags) ? anchorItem.tags : [],
          },
        })
      });

      const data = await res.json();
      console.log("STYLE PIECE RAW:", data);
      setRawResponse(data);

      if (!res.ok) {
        throw new Error(data?.error || "style-piece failed");
      }

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
          why_it_works: look.why_it_works,
          items: mappedItems.filter((piece) => piece && (piece.image_url || piece.source === "uploaded_item")),
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

  return (
    <section className="section section-wardrobe">
      <h2 className="section-title">Style a Piece</h2>
      <p className="section-description">
        Upload any clothing item and get 3 complete looks built around it.
      </p>

      <div className="stylist-shell">
        <div className="stylist-card">
          <div className="anchor-piece">
            <p className="anchor-piece__label">Upload a clothing item</p>

            {anchorItem ? (
              <div className="anchor-piece__selected">
                <img
                  src={anchorItem.image_url}
                  alt={anchorItem.name}
                  className="anchor-piece__img"
                />
                <div className="anchor-piece__info">
                  <span className="anchor-piece__name">{anchorItem.name}</span>
                  <span className="anchor-piece__cat">
                    {anchorItem.category} {anchorItem.color ? `- ${anchorItem.color}` : ""}
                  </span>
                </div>
                <button
                  type="button"
                  className="anchor-piece__remove"
                  onClick={() => {
                    setAnchorItem(null);
                    setAnchorPreview(null);
                    setLooks([]);
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="anchor-piece__upload-row">
                <label className="anchor-piece__upload-btn">
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
                  <span>Upload photo</span>
                </label>
              </div>
            )}

            {!anchorItem && anchorPreview && (
              <div style={{ marginTop: 12 }}>
                <img
                  src={anchorPreview}
                  alt="preview"
                  style={{ width: 120, borderRadius: 12 }}
                />
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Occasion</label>
            <select
              value={occasion}
              onChange={(e) => setOccasion(e.target.value)}
              className="form-select"
            >
              {OCCASION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Vibe</label>
            <select
              value={vibe}
              onChange={(e) => setVibe(e.target.value)}
              className="form-select"
            >
              {VIBE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">City</label>
            <input
              className="form-input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          <div className="stylist-card__footer">
            <button
              className="btn btn-primary stylist-generate"
              onClick={handleStylePiece}
              disabled={!anchorItem || loading}
            >
              {loading ? "Styling your look…" : "Build outfits around this piece"}
            </button>
          </div>
        </div>
      </div>

      {/* Outfit suggestions — rendered outside the dark card so they use the white card theme */}
      {looks.length > 0 && (
        <div className="outfit-suggestions" style={{ marginTop: 24 }}>
          {looks.map((look) => (
            <div key={look.id} className="outfit-look" style={{ marginBottom: 24 }}>
              <div className="look-header">
                <h3 className="look-title">{look.title}</h3>
                <p className="look-description">{look.why_it_works}</p>
              </div>

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
                          const fallback = e.currentTarget.nextElementSibling;
                          if (fallback) fallback.style.display = "grid";
                        }}
                      />
                    ) : null}
                    <div
                      style={{
                        height: 180,
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
                      <p className="look-item-name" style={{ margin: 0, fontWeight: 600 }}>
                        {piece.name}
                      </p>
                      <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                        {[piece.role, piece.color].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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