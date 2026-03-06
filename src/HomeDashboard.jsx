import React, { useRef } from "react";

const OCCASIONS = ["Smart Casual", "Work", "Date", "Dinner", "Festive", "Party", "Brunch", "Travel"];

export default function HomeDashboard({
  user,
  items = [],
  onGo,
  heroFile,
  heroPreview,
  heroOccasion,
  setHeroOccasion,
  heroLoading,
  heroResult,
  heroDetectedItem,
  onSelectFile,
  onStyleMe,
  onSaveSuggestion,
  onTryAgain,
}) {
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const firstName = user?.displayName ? user.displayName.split(" ")[0] : "there";

  const handleGo = (key) => {
    if (typeof onGo === "function") onGo(key);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f && typeof onSelectFile === "function") onSelectFile(f);
  };

  const phase = heroLoading
    ? "loading"
    : heroResult?.items?.length > 0
    ? "result"
    : heroPreview
    ? "preview"
    : "prompt";

  return (
    <section className="home-wrap">
      <div className="outfit-hero">
        {/* ── PHASE: PROMPT ── */}
        {phase === "prompt" && (
          <>
            <h1 className="hero-greeting">Hi, {firstName}</h1>
            <p className="hero-question">What are you wearing today?</p>
            <p className="hero-sub">Snap or upload one piece and Tina will style the rest.</p>

            <div className="hero-upload-area">
              <label className="hero-upload-btn" tabIndex={0}>
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={handleFileChange}
                />
                <span className="hero-upload-icon">📷</span>
                <span>Take a photo</span>
              </label>

              <label className="hero-upload-btn" tabIndex={0}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFileChange}
                />
                <span className="hero-upload-icon">🖼️</span>
                <span>Choose from gallery</span>
              </label>
            </div>
          </>
        )}

        {/* ── PHASE: PREVIEW – image selected, pick occasion ── */}
        {phase === "preview" && (
          <>
            <h1 className="hero-greeting">Great choice!</h1>
            <p className="hero-sub">Pick an occasion and Tina will build your outfit.</p>

            <div className="hero-preview-row">
              <div className="hero-preview-img-wrap">
                <img src={heroPreview} alt="Your piece" className="hero-preview-img" />
                <button
                  type="button"
                  className="hero-preview-change"
                  onClick={() => {
                    if (typeof onSelectFile === "function") onSelectFile(null);
                  }}
                >
                  Change
                </button>
              </div>

              <div className="hero-occasion-wrap">
                <p className="hero-occasion-label">Occasion</p>
                <div className="hero-occasion-pills">
                  {OCCASIONS.map((occ) => (
                    <button
                      key={occ}
                      type="button"
                      className={`hero-pill ${heroOccasion === occ ? "hero-pill--active" : ""}`}
                      onClick={() => setHeroOccasion(occ)}
                    >
                      {occ}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="hero-style-btn"
              onClick={onStyleMe}
              disabled={!heroFile}
            >
              Style me →
            </button>
          </>
        )}

        {/* ── PHASE: LOADING ── */}
        {phase === "loading" && (
          <>
            <h1 className="hero-greeting">Tina is styling your look...</h1>
            <p className="hero-sub">Finding the perfect pieces from your wardrobe.</p>

            <div className="hero-loading-row">
              {heroPreview && (
                <img src={heroPreview} alt="Your piece" className="hero-loading-anchor" />
              )}
              <div className="hero-loading-grid">
                <div className="loading-shimmer loading-shimmer--large"></div>
                <div className="loading-shimmer loading-shimmer--large"></div>
                <div className="loading-shimmer loading-shimmer--large"></div>
              </div>
            </div>
            <p className="hero-loading-text">Building your {heroOccasion} outfit...</p>
          </>
        )}

        {/* ── PHASE: RESULT ── */}
        {phase === "result" && (
          <>
            <div className="hero-result-header">
              <div>
                <h1 className="hero-greeting">Your outfit is ready</h1>
                <p className="hero-sub">Picked for today • From your wardrobe</p>
              </div>
              <span className="hero-result-badge">{heroOccasion}</span>
            </div>

            <div className="hero-result-items">
              {heroResult.items.slice(0, 6).map((it, i) => {
                const isAnchor = heroDetectedItem && (
                  it.id === heroDetectedItem.id ||
                  it.image_url === heroDetectedItem.image_url
                );
                return (
                  <div
                    key={`${it.id || it.name || "it"}_${i}`}
                    className={`hero-result-item ${isAnchor ? "hero-result-item--anchor" : ""}`}
                  >
                    <img src={it.image_url || it.image} alt={it.name || `Item ${i + 1}`} />
                    <p className="hero-result-item-name">{it.name || it.category || "Item"}</p>
                    {isAnchor && <span className="hero-anchor-tag">Your piece</span>}
                  </div>
                );
              })}
            </div>

            {heroResult.style_note && (
              <div className="hero-tips">
                <p className="hero-tips-label">Tina's styling tips</p>
                <p className="hero-tips-text">{heroResult.style_note}</p>
              </div>
            )}

            <div className="hero-result-actions">
              <button
                type="button"
                className="hero-style-btn"
                onClick={() => {
                  if (typeof onSaveSuggestion === "function") onSaveSuggestion(heroResult);
                }}
              >
                Wear this today
              </button>
              <button
                type="button"
                className="hero-btn-ghost"
                onClick={onTryAgain}
              >
                Try a different look
              </button>
            </div>
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="home-actions">
        <button type="button" className="action-tile" onClick={() => handleGo("wardrobe")}>
          <div className="action-tile__left">
            <div className="action-title">Wardrobe</div>
            <div className="action-sub">{items.length} items</div>
          </div>
          <div className="action-tile__right">Open →</div>
        </button>

        <button
          type="button"
          className="action-tile action-tile--accent"
          onClick={() => handleGo("upload")}
        >
          <div className="action-tile__left">
            <div className="action-title">Add item</div>
            <div className="action-sub">Upload a photo</div>
          </div>
          <div className="action-tile__right">Add →</div>
        </button>
      </div>
    </section>
  );
}
