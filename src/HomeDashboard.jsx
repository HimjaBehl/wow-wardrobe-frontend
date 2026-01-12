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
    // If there's a saved plan for today, go to planner to view it.
    // Otherwise, send user to stylist to create one.
    handleGo(firstLook ? "planner" : "stylist");
  };

  return (
    <section className="home-wrap">
      {/* Hero */}
      <div className="home-hero">
        <div>
          <h1 className="home-title">Hi, {firstName} 👋</h1>
          <p className="home-sub">Ready in 10 seconds • Uses your wardrobe</p>
        </div>

        <button className="home-cta" onClick={() => handleGo("stylist")}>
          ✨ Style me for today
        </button>
      </div>

      {/* Today (Hero card) */}
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
        <div className="premium-card__inner" style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
          <div className="recent-strip" style={{ paddingTop: 0 }}>
            {firstLook.items.slice(0, 6).map((it, i) => (
              <div key={`${it.id || it.name || "it"}_${i}`} className="recent-item">
                <img src={it.image_url || it.image} alt={it.name || `Item ${i + 1}`} />
                <p>{it.name || it.category || "Item"}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Quick actions */}
      <div className="row">
        <div className="tile" role="button" tabIndex={0} onClick={() => handleGo("wardrobe")}>
          <div>
            <strong>Wardrobe</strong>
            <span>{items.length} items</span>
          </div>
          <div aria-hidden>👗</div>
        </div>

        <div className="tile" role="button" tabIndex={0} onClick={() => handleGo("upload")}>
          <div>
            <strong>Add item</strong>
            <span>Photo or staple</span>
          </div>
          <div aria-hidden>＋</div>
        </div>
      </div>

      {/* Recently added */}
      {recent.length > 0 && (
        <div className="premium-card" style={{ marginTop: 12 }}>
          <div className="premium-card__inner" style={{ display: "flex", alignItems: "center" }}>
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
