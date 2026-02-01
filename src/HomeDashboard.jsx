// HomeDashboard.jsx
import React from "react";

export default function HomeDashboard({ 
  user, 
  items = [], 
  todayPlan, 
  onGo,
  autoSuggestedOutfit,
  autoSuggestLoading,
  onSaveSuggestion
}) {
  // Always show the fresh auto-generated suggestion on each refresh
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
            <p className="outfit-hero__loading-text">Creating your Smart Casual look...</p>
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
                    className="outfit-hero__btn outfit-hero__btn--primary"
                    onClick={handleSaveSuggestion}
                  >
                    Wear this today
                  </button>
                  <button
                    type="button"
                    className="outfit-hero__btn outfit-hero__btn--secondary"
                    onClick={() => handleGo("stylist")}
                  >
                    Show me more
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
