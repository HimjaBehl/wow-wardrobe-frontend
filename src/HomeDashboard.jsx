// HomeDashboard.jsx
import React from "react";

export default function HomeDashboard({ user, items = [], todayPlan, onGo }) {
  const firstLook = todayPlan?.outfit || todayPlan?.look || null;
  const firstName = user?.displayName ? user.displayName.split(" ")[0] : "there";

  const handleGo = (key) => {
    if (typeof onGo === "function") onGo(key);
  };

  const handleTodayClick = () => {
    handleGo(firstLook ? "planner" : "stylist");
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
        aria-label={firstLook ? "View today's plan" : "Create a look for today"}
      >
        <div className="today-card__header">
          <div style={{ flex: 1 }}>
            <h3 className="card-title">Today</h3>
            {firstLook ? (
              <p className="card-meta">{firstLook.style_note || "Planned look"}</p>
            ) : (
              <p className="card-meta">No outfit saved yet. Tap to create a look.</p>
            )}
          </div>

          <button
            type="button"
            className="card-action"
            onClick={(e) => {
              e.stopPropagation();
              handleTodayClick();
            }}
          >
            {firstLook ? "View plan →" : "Create a look →"}
          </button>
        </div>

        {firstLook?.items?.length ? (
          <div className="today-items">
            {firstLook.items.slice(0, 6).map((it, i) => (
              <div key={`${it.id || it.name || "it"}_${i}`} className="today-item">
                <img src={it.image_url || it.image} alt={it.name || `Item ${i + 1}`} />
                <p className="caption">{it.name || it.category || "Item"}</p>
              </div>
            ))}
          </div>
        ) : null}
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
