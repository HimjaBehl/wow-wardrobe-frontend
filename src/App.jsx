import { useState, useEffect } from "react";
import "./App.css";
import { storage, auth, provider, signInWithPopup, signOut } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const BASE_URL = "https://wow-wardrobe-backend-himjabehl.replit.app";

export default function App() {
  const [file, setFile] = useState(null);
  const [items, setItems] = useState([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [occasion, setOccasion] = useState("casual");
  const [vibe, setVibe] = useState("fun");
  const [city, setCity] = useState("Delhi");
  const [editItemIndex, setEditItemIndex] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", category: "", color: "", tags: "" });
  const [constraints, setConstraints] = useState("");
  const [outfit, setOutfit] = useState(null);
  const [user, setUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editedTags, setEditedTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detectedItems, setDetectedItems] = useState([]);
  const formatLabel = (str) => {
    return str
      .split("/")
      .pop()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };


  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) fetchItems(firebaseUser.uid);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      fetchItems(result.user.uid);
    } catch (err) {
      console.error("Login failed:", err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setItems([]);
    } catch (err) {
      console.error("Logout failed:", err.message);
    }
  };

  const fetchItems = async (uid) => {
    try {
      const res = await fetch(`${BASE_URL}/wardrobe?uid=${uid}`);
      const text = await res.text();
      const data = JSON.parse(text);
      setItems(data);
    } catch (e) {
      console.error("❌ Error fetching wardrobe:", e.message);
    }
  };

  const handleUpload = async () => {
    if (!file || !user) {
      alert("Please select a file and login first.");
      return;
    }

    const storageRef = ref(storage, `wardrobe/${file.name}`);
    try {
      await uploadBytes(storageRef, file);
      const imageUrl = await getDownloadURL(storageRef);

      const res = await fetch(`${BASE_URL}/auto-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("❌ Upload failed:", text);
        alert("Auto-tagging failed. Try another image.");
        return;
      }

      const data = await res.json();
      const tagged = (data.detected || []).map((obj) => ({
        ...obj,
        approved: true,
      }));
      setDetectedItems(tagged);
    } catch (err) {
      console.error("Upload error:", err);
      alert("Something went wrong during upload.");
    }
  };

  const toggleItemApproval = (index) => {
    const updated = [...detectedItems];
    updated[index].approved = !updated[index].approved;
    setDetectedItems(updated);
  };

  const confirmSelectedItems = async () => {
    const approved = detectedItems.filter((item) => item.approved);

    if (approved.length === 0) {
      alert("No items selected to save.");
      return;
    }

    try {
      for (const item of approved) {
        const res = await fetch(`${BASE_URL}/wardrobe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uid: user.uid,
            image_url: item.image_url,
            name: item.name,
            category: item.category,
            color: item.color,
            tags: item.tags,
          }),
        });

        if (!res.ok) {
          throw new Error(`Failed to save item: ${item.name}`);
        }
      }

      alert("✅ Selected items added to wardrobe!");

      // ✅ Clear detectedItems from UI (only show wardrobe now)
      setDetectedItems([]);

      // ✅ Re-fetch wardrobe to show latest
      fetchItems(user.uid);
    } catch (err) {
      console.error("❌ Error saving selected items:", err);
      alert("Something went wrong while saving wardrobe items.");
    }

    alert("Selected items added to wardrobe!");
    fetchItems(user.uid); // ✅ Refresh wardrobe
    setDetectedItems([]); // ✅ Reset detected
  };



  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      const res = await fetch(`${BASE_URL}/wardrobe/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        alert("Item deleted!");
        fetchItems(user.uid); // Refresh wardrobe
      } else {
        const errText = await res.text();
        alert("Failed to delete item: " + errText);
        console.error("❌ Delete failed:", errText);
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Something went wrong while deleting.");
    }
  };


  const handleSuggestOutfit = async () => {
    try {
      console.log("🧥 Sending items to AI:", items);
      const res = await fetch(`${BASE_URL}/suggest-outfit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, occasion, vibe, city, constraints }),
      });

      const text = await res.text();
      const data = JSON.parse(text);
      const outfits = Array.isArray(data.outfits)
        ? data.outfits
        : data.outfits?.outfits || [];
      setOutfit(outfits);
    } catch (err) {
      console.error("❌ Outfit suggestion failed:", err.message);
      alert("Failed to generate outfit. Try again.");
      
    }
  };

  const openEditModal = (item) => {
    setSelectedItem(item);
    setEditedTags(item.tags || []);
    setShowModal(true);
  };

  const saveEditedTags = () => {
    const updatedItems = items.map((it) =>
      it.id === selectedItem.id ? { ...it, tags: editedTags } : it
    );
    setItems(updatedItems);
    setShowModal(false);
  };

  const filteredItems = items.filter((item) => {
    return (
      (filterCategory ? item.category === filterCategory : true) &&
      (filterColor
        ? item.color?.toLowerCase() === filterColor.toLowerCase()
        : true)
    );
  });

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          backgroundColor: "#000",
          color: "#fff",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
        }}
      >
        <h1 style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>W.O.W.</h1>
        <p style={{ fontSize: "1.2rem" }}>What. Outfit. When</p>
      </div>
    );
  }

  return (
    <div className="App" style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <header
        style={{ display: "flex", justifyContent: "space-between", marginBottom: "2rem" }}
      >
        <h1>W.O.W. Wardrobe 👗</h1>
        {user ? (
          <div>
            <span>👋 {user.displayName}</span>
            <button onClick={handleLogout} style={{ marginLeft: "1rem" }}>
              Logout
            </button>
          </div>
        ) : (
          <button onClick={handleLogin}>Login with Google</button>
        )}
      </header>

      {user && (
        <>
          {/* Upload Section */}
          <section style={{ marginBottom: "2rem" }}>
            <h2>Upload Item</h2>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files[0])}
            />
            <button onClick={handleUpload} style={{ marginLeft: "1rem" }}>
              Upload & Auto-Tag
            </button>

            {detectedItems.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <h4>Detected Items</h4>
                {detectedItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: "0.5rem",
                      border: "1px solid #ccc",
                      padding: "0.5rem",
                    }}
                  >
                    <img
                      src={item.image_url}
                      alt={item.name}
                      style={{ width: "100px" }}
                    />
                    <p>
                      {item.name} — {item.category} • {item.color}
                    </p>
                    <button
                      onClick={() => toggleItemApproval(i)}
                      style={{ marginTop: "0.5rem" }}
                    >
                      {item.approved ? "✅ Keep" : "❌ Remove"}
                    </button>
                    <button
                      onClick={() => {
                        setEditItemIndex(i);
                        setEditForm({
                          name: item.name || "",
                          category: item.category || "",
                          color: item.color || "",
                          tags: (item.tags || []).join(", ")
                        });
                      }}
                      style={{ marginTop: "0.5rem" }}
                    >
                      ✏️ Edit
                    </button>

                  </div>
                ))}
                <button
                  onClick={confirmSelectedItems}
                  style={{
                    marginTop: "1rem",
                    padding: "0.5rem 1rem",
                    backgroundColor: "black",
                    color: "white",
                  }}
                >
                  Add Selected to Wardrobe
                </button>
                {editItemIndex !== null && (
                  <div style={{
                    position: "fixed",
                    top: 0, left: 0,
                    width: "100vw", height: "100vh",
                    backgroundColor: "rgba(0,0,0,0.6)",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    zIndex: 1000
                  }}>
                    <div style={{
                      background: "#fff",
                      padding: "2rem",
                      borderRadius: "10px",
                      width: "90%",
                      maxWidth: "400px"
                    }}>
                      <h3>Edit Detected Item</h3>

                      <label style={{ fontWeight: "bold" }}>Name</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        style={{ width: "100%", marginBottom: "1rem", padding: "0.5rem" }}
                      />

                      <label style={{ fontWeight: "bold" }}>Category</label>
                      <input
                        type="text"
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                        style={{ width: "100%", marginBottom: "1rem", padding: "0.5rem" }}
                      />

                      <label style={{ fontWeight: "bold" }}>Color</label>
                      <input
                        type="text"
                        value={editForm.color}
                        onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                        style={{ width: "100%", marginBottom: "1rem", padding: "0.5rem" }}
                      />

                      <label style={{ fontWeight: "bold" }}>Tags (comma separated)</label>
                      <input
                        type="text"
                        value={editForm.tags}
                        onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                        style={{ width: "100%", marginBottom: "1rem", padding: "0.5rem" }}
                      />

                      <div style={{ textAlign: "right" }}>
                        <button
                          onClick={() => setEditItemIndex(null)}
                          style={{ marginRight: "1rem" }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            const updated = [...detectedItems];
                            updated[editItemIndex] = {
                              ...updated[editItemIndex],
                              name: editForm.name,
                              category: editForm.category,
                              color: editForm.color,
                              tags: editForm.tags.split(",").map((tag) => tag.trim())
                            };
                            setDetectedItems(updated);
                            setEditItemIndex(null);
                          }}
                          style={{ backgroundColor: "#007bff", color: "white", padding: "0.5rem 1rem" }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}
          </section>

          {/* Wardrobe Section */}
          <section style={{ marginBottom: "2rem" }}>
            <h2>Your Wardrobe 🧥</h2>
            <div>
              <select
                onChange={(e) => setFilterCategory(e.target.value)}
                defaultValue=""
              >
                <option value="">Filter by category</option>
                <option value="Topwear">Topwear</option>
                <option value="Bottomwear">Bottomwear</option>
                <option value="Dresses">Dresses</option>
                <option value="Outerwear">Outerwear</option>
                <option value="Footwear">Footwear</option>
              </select>
              <select
                onChange={(e) => setFilterColor(e.target.value)}
                defaultValue=""
                style={{ marginLeft: "1rem" }}
              >
                <option value="">Filter by color</option>
                <option value="White">White</option>
                <option value="Black">Black</option>
                <option value="Blue">Blue</option>
                <option value="Beige">Beige</option>
                <option value="Green">Green</option>
              </select>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    width: "200px",
                    margin: "10px",
                    background: "#fff",
                    borderRadius: "8px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <img
                    src={item.image_url}
                    alt={item.name}
                    style={{ width: "100%", height: "240px", objectFit: "cover" }}
                  />
                  <div
                    style={{
                      padding: "0.5rem",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    {formatLabel(item.color) + " " + formatLabel(item.name)}
                  </div>
                  <p style={{ textAlign: "center", fontSize: "0.9rem", margin: 0 }}>
                    {formatLabel(item.category)}
                  </p>{/* Tag chip row */}
                  {item.tags && item.tags.length > 0 && (
                    <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "4px", padding: "4px" }}>
                      {item.tags.map((tag, i) => (
                        <span key={i} style={{ background: "#eee", borderRadius: "12px", padding: "2px 8px", fontSize: "0.8rem" }}>
                          {formatLabel(tag)}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => openEditModal(item)}
                    style={{
                      position: "absolute",
                      top: "8px",
                      left: "8px",
                      background: "#fff",
                      border: "1px solid #ccc",
                      borderRadius: "50%",
                      padding: "4px",
                      cursor: "pointer",
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    style={{
                      position: "absolute",
                      top: "8px",
                      right: "8px",
                      background: "#fff",
                      border: "1px solid #ccc",
                      borderRadius: "50%",
                      padding: "4px",
                      cursor: "pointer",
                    }}
                  >
                    🗑️
                  </button>

                </div>
              ))}
            </div>
          </section>

          {/* Outfit Suggestions */}
          <section>
            <h2>AI Outfit Suggestions 🤖</h2>
            <div style={{ marginBottom: "1rem" }}>
              <select
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
              >
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
                <option value="party">Party</option>
                <option value="vacation">Vacation</option>
                <option value="wedding">Wedding</option>
              </select>
              <select
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                style={{ marginLeft: "1rem" }}
              >
                <option value="fun">Fun</option>
                <option value="elegant">Elegant</option>
                <option value="chill">Chill</option>
                <option value="bold">Bold</option>
                <option value="romantic">Romantic</option>
              </select>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                style={{ marginLeft: "1rem", padding: "4px" }}
              />
            </div>
            <input
              type="text"
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="Any style preferences or constraints?"
              style={{ width: "100%", padding: "8px", marginBottom: "1rem" }}
            />
            <button
              onClick={handleSuggestOutfit}
              style={{
                backgroundColor: "white",
                color: "black",
                padding: "0.5rem 1rem",
                border: "1px solid black",
                cursor: "pointer",
              }}
            >
              Get Outfit Suggestions
            </button>

            {Array.isArray(outfit) && outfit.length > 0 ? (
              <div style={{ marginTop: "2rem" }}>
                <h3>Suggested Looks</h3>
                {outfit.map((look, idx) => (
                  <div key={idx} style={{ marginBottom: "2rem" }}>
                    <h4>Look {idx + 1}</h4>
                    <p><em>{look.style_note}</em></p>
                    <div className="grid">
                      {look.items.map((piece, i) => (
                        <div key={i} className="card">
                          <img src={piece.image_url} alt={piece.name || "No name"} />
                          <p><strong>{piece.name || "Unnamed"}</strong></p>
                          <p>Category: {piece.category || "N/A"}</p>
                          <p>Color: {piece.color || "N/A"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : outfit !== null && (
              <p style={{ marginTop: "1rem" }}>
                No outfits found. Try changing your filters or uploading more items.
              </p>
            )}
          </section>

          {/* Tag Editor Modal */}
          {showModal && selectedItem && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                backgroundColor: "rgba(0,0,0,0.5)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 1000,
              }}
            >
              <div
                style={{
                  background: "white",
                  padding: "2rem",
                  borderRadius: "10px",
                  width: "90%",
                  maxWidth: "400px",
                }}
              >
                <h3>Edit Tags for {selectedItem.name}</h3>
                <textarea
                  value={editedTags.join(", ")}
                  onChange={(e) =>
                    setEditedTags(
                      e.target.value.split(",").map((t) => t.trim())
                    )
                  }
                  rows={5}
                  style={{ width: "100%", marginBottom: "1rem" }}
                />
                <div style={{ textAlign: "right" }}>
                  <button
                    onClick={() => setShowModal(false)}
                    style={{ marginRight: "1rem" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEditedTags}
                    style={{ backgroundColor: "#007bff", color: "white" }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
