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
  const firstLookRaw = todayPlan?.outfit || todayPlan?.look || null;
  const firstLook =
    Array.isArray(firstLookRaw?.items) && firstLookRaw.items.length > 0
      ? firstLookRaw
      : null;

  // Use auto-suggested outfit if no saved plan
  const displayLook = firstLook || autoSuggestedOutfit;
  const isSuggestion = !firstLook && autoSuggestedOutfit;

  const firstName = user?.displayName ? user.displayName.split(" ")[0] : "there";

  const handleGo = (key) => {
    if (typeof onGo === "function") onGo(key);
  };

  const handleTodayClick = () => {
    handleGo(firstLook ? "planner" : "stylist");
  };

  const handleSaveSuggestion = (e) => {
    e.stopPropagation();
    if (typeof onSaveSuggestion === "function" && autoSuggestedOutfit) {
      onSaveSuggestion(autoSuggestedOutfit);
    }
  };

  return (
    <section className="home-wrap">
      {/* Hero */}
      <div className="home-hero">
        <div>
          <h1 className="home-title">Hi, {firstName}</h1>
          <p className="home-sub">Ready in seconds • Styled from your wardrobe</p>
        </div>

        <button className="home-cta" onClick={() => handleGo("stylist")}>
          Style me for today
        </button>
      </div>

      {/* Today */}
      <div
        className="premium-card"
        role="button"
        tabIndex={0}
        onClick={handleTodayClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleTodayClick();
        }}
        aria-label={displayLook ? "View today's look" : "Create a look for today"}
      >
        <div className="today-card__header">
          <div className="today-left">
            <div className="today-kicker">
              {isSuggestion ? "Tina's Pick for Today" : "Today"}
            </div>

            {autoSuggestLoading ? (
              <p className="today-meta today-meta--loading">
                Tina is styling your look...
              </p>
            ) : displayLook ? (
              <p className="today-meta">
                {displayLook.style_note || (isSuggestion ? "Smart Casual suggestion" : "Planned look")}
              </p>
            ) : (
              <p className="today-meta today-meta--empty">No outfit saved yet</p>
            )}
          </div>

          {isSuggestion ? (
            <button
              type="button"
              className="today-cta today-cta--save"
              onClick={handleSaveSuggestion}
            >
              Save to plan
            </button>
          ) : (
            <button
              type="button"
              className="today-cta"
              onClick={(e) => {
                e.stopPropagation();
                handleTodayClick();
              }}
            >
              {displayLook ? "View plan →" : "Create a look →"}
            </button>
          )}
        </div>

        {autoSuggestLoading ? (
          <div className="today-items today-items--loading">
            <div className="loading-shimmer"></div>
            <div className="loading-shimmer"></div>
            <div className="loading-shimmer"></div>
            <div className="loading-shimmer"></div>
          </div>
        ) : displayLook?.items?.length > 0 ? (
          <div className="today-items">
            {displayLook.items.slice(0, 6).map((it, i) => (
              <div key={`${it.id || it.name || "it"}_${i}`} className="today-item">
                <img src={it.image_url || it.image} alt={it.name || `Item ${i + 1}`} />
                <p className="caption">{it.name || it.category || "Item"}</p>
              </div>
            ))}
          </div>
        ) : null}

        {isSuggestion && displayLook?.items?.length > 0 && (
          <div className="suggestion-actions">
            <button
              type="button"
              className="suggestion-btn suggestion-btn--save"
              onClick={handleSaveSuggestion}
            >
              Add to today's plan
            </button>
            <button
              type="button"
              className="suggestion-btn suggestion-btn--regen"
              onClick={(e) => {
                e.stopPropagation();
                handleGo("stylist");
              }}
            >
              Try another look →
            </button>
          </div>
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
