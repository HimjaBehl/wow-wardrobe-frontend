// HomeDashboard.jsx
import React from "react";

export default function HomeDashboard({ user, items = [], todayPlan, onGo }) {
  const recent = items.slice(0, 10);

  const firstLook = todayPlan?.outfit || todayPlan?.look || null;
  const firstName = user?.displayName ? user.displayName.split(" ")[0] : "there";

  const handleGo = (key) => {
    if (typeof onGo === "function") onGo(key);
  };

  const handleTodayClick = () => {
    handleGo(firstLook ? "planner" : "stylist");
  };

  const lookItems = Array.isArray(firstLook?.items) ? firstLook.items : [];

  return (
    <section className="home-wrap">
      {/* Hero */}
      <div className="home-hero">
        <div>
          <h1 className="home-title">Hi, {firstName}</h1>
          <p className="home-sub">Ready in 10 seconds • Uses your wardrobe</p>
        </div>

        <button
          className="btn-premium btn-premium--primary btn-premium--lg"
          onClick={() => handleGo("stylist")}
        >
          Style me for today
        </button>

      </div>

      {/* Today (premium card) */}
      <div
        className="today-card"
        role="button"
        tabIndex={0}
        onClick={handleTodayClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleTodayClick();
        }}
        aria-label={firstLook ? "View today's plan" : "Create a look for today"}
      >
        <div className="today-top">
          <div className="today-left">
            <div className="today-kicker">Today</div>

            {firstLook ? (
              <>
                <div className="today-title">
                  {firstLook.title || "Your planned look"}
                </div>
                <div className="today-meta">
                  {firstLook.style_note || "Tap to view your plan"}
                </div>
              </>
            ) : (
              <>
                <div className="today-title">No outfit saved yet</div>
                <div className="today-meta">Tap to create a look for today</div>
              </>
            )}
          </div>

          <button
            type="button"
            className="today-action"
            onClick={(e) => {
              e.stopPropagation();
              handleTodayClick();
            }}
          >
            {firstLook ? "View plan" : "Create look"}
          </button>
        </div>

        {/* mini item strip (only when look has items) */}
        {lookItems.length > 0 && (
          <div className="today-strip">
            {lookItems.slice(0, 5).map((it, i) => (
              <div key={`${it.id || it.name || "it"}_${i}`} className="today-chip">
                <img
                  src={it.image_url || it.image}
                  alt={it.name || it.category || `Item ${i + 1}`}
                />
              </div>
            ))}
            <div className="today-strip-hint">
              {lookItems.length > 5 ? `+${lookItems.length - 5}` : " "}
            </div>
          </div>
        )}
      </div>

      {/* Quick actions (premium row) */}
      <div className="home-actions">
        <button className="action-btn" onClick={() => handleGo("wardrobe")}>
          <span className="action-title">Wardrobe</span>
          <span className="action-meta">{items.length} items</span>
        </button>

        <button className="action-btn action-btn--primary" onClick={() => handleGo("upload")}>
          <span className="action-title">Add item</span>
          <span className="action-meta">Upload photo</span>
        </button>
      </div>

      {/* Recently added */}
      {recent.length > 0 && (
        <div className="premium-card" style={{ marginTop: 12 }}>
          <div className="premium-card__inner home-card-head">
            <h3 className="card-title">Recently added</h3>
            <button type="button" className="card-action" onClick={() => handleGo("wardrobe")}>
              See all
            </button>
          </div>

          <div className="recent-strip">
            {recent.map((it) => (
              <div
                key={it.id || it.image_url || it.name}
                className="recent-item"
                role="button"
                tabIndex={0}
                onClick={() => handleGo("wardrobe")}
                aria-label={`Open wardrobe item ${it.displayName || it.name || "Item"}`}
              >
                <img src={it.image_url} alt={it.displayName || it.name || "Item"} />
                <p>{it.displayName || it.name || "Item"}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
