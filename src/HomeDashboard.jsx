import React, { useState } from "react";

export default function HomeDashboard({ 
  user, 
  items = [], 
  todayPlan, 
  onGo,
  autoSuggestedOutfit,
  autoSuggestLoading,
  onSaveSuggestion,
  onStylePieceUpload,
  anchorUploading,
  anchorPreview,
  anchorItem,
}) {
  const displayLook = autoSuggestedOutfit;
  const isSuggestion = !!autoSuggestedOutfit;

  const firstName = user?.displayName ? user.displayName.split(" ")[0] : "there";

  const handleGo = (key) => {
    if (typeof onGo === "function") onGo(key);
  };

  const handleSaveSuggestion = (e) => {
    e.stopPropagation();
    if (typeof onSaveSuggestion === "function" && autoSuggestedOutfit) {
      onSaveSuggestion(autoSuggestedOutfit);
    }
  };

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (f && typeof onStylePieceUpload === "function") {
      onStylePieceUpload(f);
    }
    e.target.value = "";
  };

  return (
    <section className="home-wrap">
      {/* HERO: Today's Outfit - The Main Feature */}
      <div className="outfit-hero">
        <div className="outfit-hero__header">
          <div>
            <h1 className="outfit-hero__greeting">Hi, {firstName}</h1>
            <p className="outfit-hero__tagline">
              {autoSuggestLoading 
                ? "Tina is styling your look..." 
                : displayLook 
                  ? "Your outfit is ready" 
                  : "Let's style your day"}
            </p>
          </div>
          {isSuggestion && (
            <span className="outfit-hero__badge">Picked for today • From your wardrobe</span>
          )}
        </div>

        {autoSuggestLoading ? (
          <div className="outfit-hero__loading">
            <div className="outfit-loading-grid">
              <div className="loading-shimmer loading-shimmer--large"></div>
              <div className="loading-shimmer loading-shimmer--large"></div>
              <div className="loading-shimmer loading-shimmer--large"></div>
              <div className="loading-shimmer loading-shimmer--large"></div>
            </div>
            <p className="outfit-hero__loading-text">Creating your look...</p>
          </div>
        ) : displayLook?.items?.length > 0 ? (
          <>
            <div className="outfit-hero__items">
              {displayLook.items.slice(0, 6).map((it, i) => (
                <div key={`${it.id || it.name || "it"}_${i}`} className="outfit-hero__item">
                  <img src={it.image_url || it.image} alt={it.name || `Item ${i + 1}`} />
                  <p className="outfit-hero__item-name">{it.name || it.category || "Item"}</p>
                </div>
              ))}
            </div>
            
            {displayLook.style_note && (
              <p className="outfit-hero__note">{displayLook.style_note}</p>
            )}

            <div className="outfit-hero__actions">
              {isSuggestion ? (
                <>
                  <button
                    type="button"
                    className="outfit-hero__btn outfit-hero__btn--save"
                    onClick={handleSaveSuggestion}
                  >
                    Wear this today
                  </button>
                  <div className="outfit-hero__divider">
                    <span>or</span>
                  </div>
                  <button
                    type="button"
                    className="outfit-hero__btn outfit-hero__btn--occasion"
                    onClick={() => handleGo("stylist")}
                  >
                    <span className="occasion-label">Have an occasion?</span>
                    <span className="occasion-cta">Refine this look →</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="outfit-hero__btn outfit-hero__btn--primary"
                    onClick={() => handleGo("planner")}
                  >
                    View full plan
                  </button>
                  <button
                    type="button"
                    className="outfit-hero__btn outfit-hero__btn--secondary"
                    onClick={() => handleGo("stylist")}
                  >
                    Style something new
                  </button>
                </>
              )}
            </div>
          </>
        ) : items.length === 0 ? (
          <div className="outfit-hero__empty">
            <p className="outfit-hero__empty-text">Add clothes to your wardrobe to get started</p>
            <button
              type="button"
              className="outfit-hero__btn outfit-hero__btn--primary"
              onClick={() => handleGo("upload")}
            >
              Add your first item
            </button>
          </div>
        ) : (
          <div className="outfit-hero__empty">
            <p className="outfit-hero__empty-text">Ready to style your wardrobe?</p>
            <button
              type="button"
              className="outfit-hero__btn outfit-hero__btn--primary"
              onClick={() => handleGo("stylist")}
            >
              Create my look
            </button>
          </div>
        )}
      </div>

      {/* Style a Piece - Upload/Camera */}
      <div className="home-style-piece">
        <p className="home-style-piece__title">Have a piece you want styled?</p>
        <p className="home-style-piece__sub">Upload or snap a photo — Tina will style a full outfit around it and save it to your wardrobe</p>

        {anchorItem && !autoSuggestLoading ? (
          <div className="anchor-piece__selected">
            <img src={anchorItem.image_url} alt={anchorItem.name || "Piece"} className="anchor-piece__img" />
            <div className="anchor-piece__info">
              <span className="anchor-piece__name">{anchorItem.displayName || anchorItem.name || anchorItem.category || "Your piece"}</span>
              <span className="anchor-piece__saved">Saved to wardrobe</span>
            </div>
          </div>
        ) : anchorUploading ? (
          <div className="anchor-piece__uploading">
            {anchorPreview && <img src={anchorPreview} alt="Uploading..." className="anchor-piece__preview" />}
            <div className="anchor-piece__uploading-text">
              <div className="loading-shimmer" style={{ width: 120, height: 14, borderRadius: 7 }}></div>
              <span>Detecting and styling...</span>
            </div>
          </div>
        ) : (
          <div className="anchor-piece__upload-row">
            <label className="anchor-piece__upload-btn">
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
              <span className="anchor-piece__upload-icon">+</span>
              <span>Upload photo</span>
            </label>
            <label className="anchor-piece__upload-btn">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
              <span className="anchor-piece__upload-icon">&#128247;</span>
              <span>Use camera</span>
            </label>
          </div>
        )}
      </div>

      {/* Quick actions - secondary */}
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
