import { useState, useEffect } from "react";
import "./App.css";
import { storage, auth, provider, signInWithPopup, signOut } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function App() {
  const [file, setFile] = useState(null);
  const [items, setItems] = useState([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [occasion, setOccasion] = useState("casual");
  const [vibe, setVibe] = useState("fun");
  const [city, setCity] = useState("Delhi");
  const [outfit, setOutfit] = useState(null);
  const [user, setUser] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editedTags, setEditedTags] = useState([]);

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
      const res = await fetch(`https://wow-wardrobe-backend-himjabehl.replit.app/wardrobe?uid=${uid}`);
      const text = await res.text();
      console.log("🪵 Raw /wardrobe response:", text);
      try {
        const data = JSON.parse(text);
        setItems(data);
      } catch (e) {
        console.error("❌ JSON parse error:", e.message);
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

      const res = await fetch("https://wow-wardrobe-backend-himjabehl.replit.app/auto-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl })
      });

      if (!res.ok) {
        alert("Upload failed.");
        return;
      }

      // ✅ Get cleaned image_url from /auto-tag response
      const { image_url: cleanedImageUrl, name, category, color, tags } = await res.json();

      const saveRes = await fetch("https://wow-wardrobe-backend-himjabehl.replit.app/wardrobe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          image_url: cleanedImageUrl, // ✅ cleaned image now saved
          name,
          category,
          color,
          tags
        })
      });


      if (saveRes.ok) {
        alert("Item uploaded!");
        setFile(null);
        fetchItems(user.uid);
      } else {
        console.error("❌ Save item failed", await saveRes.text());
        alert("Upload failed.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Something went wrong during upload.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      const res = await fetch(`https://wow-wardrobe-backend-himjabehl.replit.app/wardrobe/${id}`, {
        method: "DELETE",
      });
      if (res.ok) fetchItems(user.uid);
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const handleSuggestOutfit = async () => {
    try {
      const res = await fetch("https://wow-wardrobe-backend-himjabehl.replit.app/suggest-outfit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, occasion, vibe, city }),
      });

      const text = await res.text();
      console.log("📦 AI raw response:", text);

      try {
        const data = JSON.parse(text);
        const outfits = Array.isArray(data.outfits) ? data.outfits : data.outfits?.outfits || [];
        setOutfit(outfits);
      } catch (parseErr) {
        console.error("❌ Failed to parse AI response:", parseErr.message);
        setOutfit([]);
      }
    } catch (err) {
      console.error("❌ Outfit suggestion request failed:", err.message);
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
      (filterColor ? item.color?.toLowerCase() === filterColor.toLowerCase() : true)
    );
  });

  return (
    <div className="App" style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", marginBottom: "2rem" }}>
        <h1>W.O.W. Wardrobe 👗</h1>
        {user ? (
          <div>
            <span>👋 {user.displayName}</span>
            <button onClick={handleLogout} style={{ marginLeft: "1rem" }}>Logout</button>
          </div>
        ) : (
          <button onClick={handleLogin}>Login with Google</button>
        )}
      </header>

      {user && (
        <>
          <section style={{ marginBottom: "2rem" }}>
            <h2>Upload Item</h2>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} />
            <button onClick={handleUpload} style={{ marginLeft: "1rem" }}>Upload & Auto-Tag</button>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2>Your Wardrobe 🧥</h2>
            <div>
              <select onChange={(e) => setFilterCategory(e.target.value)} defaultValue="">
                <option value="">Filter by category</option>
                <option value="Topwear">Topwear</option>
                <option value="Bottomwear">Bottomwear</option>
                <option value="Dresses">Dresses</option>
                <option value="Outerwear">Outerwear</option>
                <option value="Footwear">Footwear</option>
              </select>
              <select onChange={(e) => setFilterColor(e.target.value)} defaultValue="" style={{ marginLeft: "1rem" }}>
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
                <div key={item.id} style={{ width: "200px", margin: "10px", background: "#fff", borderRadius: "8px", boxShadow: "0 2px 6px rgba(0,0,0,0.1)", overflow: "hidden", position: "relative" }}>
                  <img src={item.image_url} alt={item.name} style={{ width: "100%", height: "240px", objectFit: "cover" }} />
                  <div style={{ padding: "0.5rem", fontWeight: "bold", textAlign: "center" }}>{item.name || "Unnamed"}</div>
                  <button onClick={() => openEditModal(item)} style={{ position: "absolute", top: "8px", left: "8px", background: "#fff", border: "1px solid #ccc", borderRadius: "50%", padding: "4px", cursor: "pointer" }}>✏️</button>
                  <button onClick={() => handleDelete(item.id)} style={{ position: "absolute", top: "8px", right: "8px", background: "#fff", border: "1px solid #ccc", borderRadius: "50%", padding: "4px", cursor: "pointer" }}>🗑️</button>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>AI Outfit Suggestions 🤖</h2>
            <div style={{ marginBottom: "1rem" }}>
              <select value={occasion} onChange={(e) => setOccasion(e.target.value)}>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
                <option value="party">Party</option>
                <option value="vacation">Vacation</option>
                <option value="wedding">Wedding</option>
              </select>
              <select value={vibe} onChange={(e) => setVibe(e.target.value)} style={{ marginLeft: "1rem" }}>
                <option value="fun">Fun</option>
                <option value="elegant">Elegant</option>
                <option value="chill">Chill</option>
                <option value="bold">Bold</option>
                <option value="romantic">Romantic</option>
              </select>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" style={{ marginLeft: "1rem", padding: "4px" }} />
            </div>
            <button onClick={handleSuggestOutfit} style={{ backgroundColor: "white", color: "black", padding: "0.5rem 1rem", border: "1px solid black", cursor: "pointer" }}>
              Get Outfit Suggestions
            </button>

            {Array.isArray(outfit) && outfit.length > 0 ? (
              <div style={{ marginTop: "2rem" }}>
                <h3>Suggested Looks</h3>
                {outfit.map((look, idx) => (
                  <div key={idx} style={{ marginBottom: "2rem" }}>
                    <h4>Look {idx + 1}</h4>
                    <p><em>{look.style_note}</em></p>
                    {Array.isArray(look.items) && look.items.length > 0 ? (
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
                    ) : (
                      <p><em>This look doesn’t include any outfit items.</em></p>
                    )}
                  </div>
                ))}
              </div>
            ) : outfit !== null && (
              <p style={{ marginTop: "1rem" }}>
                No outfits found. Try changing your filters or uploading more items.
              </p>
            )}
          </section>

          {showModal && selectedItem && (
            <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundColor: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
              <div style={{ background: "white", padding: "2rem", borderRadius: "10px", width: "90%", maxWidth: "400px" }}>
                <h3>Edit Tags for {selectedItem.name}</h3>
                <textarea value={editedTags.join(", ")} onChange={(e) => setEditedTags(e.target.value.split(",").map(t => t.trim()))} rows={5} style={{ width: "100%", marginBottom: "1rem" }} />
                <div style={{ textAlign: "right" }}>
                  <button onClick={() => setShowModal(false)} style={{ marginRight: "1rem" }}>Cancel</button>
                  <button onClick={saveEditedTags} style={{ backgroundColor: "#007bff", color: "white" }}>Save</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
