// HomeDashboard.jsx
export default function HomeDashboard({ user, items = [], todayPlan, onGo }) {
  const recent = items.slice(0, 6);
  const firstLook = todayPlan?.outfit || todayPlan?.look || null;

  return (
    <section className="home">
      <div className="home-hero">
        <div>
          <h1 className="home-title">
            Hi{user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="home-sub">What outfit are we planning today?</p>
        </div>
        <button className="btn btn-accent home-primary-cta" onClick={() => onGo("stylist")}>
          ✨ Style me for today
        </button>

      </div>

      {/* Tiles */}
      <div className="home-grid home-grid-2">
        <button className="tile" onClick={() => onGo("wardrobe")}>
          <span className="tile-emoji">👗</span>
          <span className="tile-title">Wardrobe</span>
          <span className="tile-sub">{items.length} items</span>
        </button>

        <button className="tile" onClick={() => onGo("upload")}>
          <span className="tile-emoji">➕</span>
          <span className="tile-title">Add Item</span>
          <span className="tile-sub">Photo or staple</span>
        </button>
      </div>


      {/* Today glance (opens Planner) */}
        <div className="home-card" onClick={() => onGo(firstLook ? "planner" : "stylist")} role="button">

        <div className="home-card-header">
          <h3>Today</h3>
          <span className="linklike">{firstLook ? "View plan →" : "Create a look →"}</span>

        </div>
        {firstLook ? (
          <>
            <p className="muted">{firstLook.style_note || "Planned look"}</p>
            <div className="home-row">
              {(firstLook.items || []).slice(0, 4).map((it, i) => (
                <div key={i} className="home-item">
                  <img src={it.image_url || it.image} alt={it.name || `Item ${i+1}`} />
                  <p className="caption">{it.name || it.category || "Item"}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
      <p className="muted">No outfit saved yet. Tap to create a look.</p>

        )}
      </div>

      {/* Recent wardrobe */}
      {recent.length > 0 && (
        <div className="home-card">
          <div className="home-card-header">
            <h3>Recently added</h3>
            <button className="linklike" onClick={() => onGo("wardrobe")}>See all</button>
          </div>
          <div className="home-row">
            {recent.map((it) => (
              <div key={it.id} className="home-item">
                <img src={it.image_url} alt={it.name} />
                <p className="caption">{it.displayName || it.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
