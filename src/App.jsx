import Onboarding from "./Onboarding";
import { doc, getDoc } from "firebase/firestore";
import { useState, useEffect } from "react";
import "./App.css";
import { storage, auth, provider, signInWithPopup, signOut, db } from "./firebase";
import { collection, query, where, addDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import WeeklyPlanner from "./WeeklyPlanner";
import VirtualTryOn from "./VirtualTryOn";
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import BottomNav from './BottomNav'; // This is the nav bar you created
import Home from './Home';         // Or whatever you call your homepage
import Wardrobe from './Wardrobe';
import Plan from './Plan';      // If you have a planner component
import Assistant from './Assistant';
import Tina from './Tina';
import { Pencil, Trash2 } from "lucide-react";

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
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    color: "",
    tags: "",
  });
  const [constraints, setConstraints] = useState("");
  const [outfit, setOutfit] = useState(null);
  const [user, setUser] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editedTags, setEditedTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("wardrobe");
  const [detectedItems, setDetectedItems] = useState([]);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(null); // 🆕 for like/dislike toast


  const formatLabel = (str) =>
    str
      .split("/")
      .pop()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  // --- NEW: getWeather helper -----------------
  const getWeather = async (city) => {
    try {
      // free no-API-key endpoint (wttr.in)
      const res = await fetch(`https://wttr.in/${city}?format=%t`);
      return await res.text();              // e.g. “+32°C”
    } catch (e) {
      console.warn("⚠️ Weather fetch failed:", e.message);
      return null;                          // fail silently
    }
  };
  // --------------------------------------------

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        fetchItems(firebaseUser.uid);
        const docRef = doc(db, "preferences", firebaseUser.uid);
        getDoc(docRef).then((docSnap) => {
          if (docSnap.exists()) {
            setOnboardingDone(true);
          } else {
            setOnboardingDone(false);
            setShowOnboarding(true);
          }
        });
        setShowOnboarding(true);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      fetchItems(result.user.uid);
      setShowOnboarding(true);
    } catch (err) {
      console.error("Login failed:", err.message);
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setItems([]);
    } catch (err) {
      console.error("Logout failed:", err.message);
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
      console.log("👗 outfits received in UI:", data);
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
      setDetectedItems([]);
      fetchItems(user.uid); // refresh wardrobe
    } catch (err) {
      console.error("❌ Error saving selected items:", err);
      alert("Something went wrong while saving wardrobe items.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      const res = await fetch(`${BASE_URL}/wardrobe/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        alert("Item deleted!");
        fetchItems(user.uid);
      } else {
        const errText = await res.text();
        alert("Failed to delete item: " + errText);
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Something went wrong while deleting.");
    }
  };

  async function handleFeedback(idx, liked) {
    const userObj = auth.currentUser;
    if (!userObj) {
      alert("Please log in first 🙂");
      return;
    }

    const lookObj = outfit[idx];          // the exact outfit the user judged

    const payload = {
      uid: userObj.uid,
      liked,                              // true / false
      timestamp: new Date(),
      occasion,
      vibe,
      outfit: lookObj
    };

    try {
      await addDoc(collection(db, "outfitFeedback"), payload);
      setFeedbackSubmitted(idx);          // show “saved” toast
      setTimeout(() => setFeedbackSubmitted(null), 3000);
    } catch (err) {
      console.error("Feedback save error →", err);
      alert("Couldn't save feedback, sorry!");
    }
  }

  const handleSuggestOutfit = async () => {
    if (!user) return alert("Please log in to get outfit suggestions!");

    const city = "Delhi"; // or auto-detect later with a dropdown or IP lookup

    try {
      console.log("🧠 Sending items to AI:", items);
      const res = await fetch(`${BASE_URL}/suggest-outfit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, occasion, vibe, city, uid: user.uid }),
      });

      const text = await res.text();
      const data = JSON.parse(text);
      setOutfit(data?.outfits || []);
    } catch (err) {
      console.error("💥 Outfit suggestion failed:", err.message);
      alert("Failed to generate outfit. Try again.");
    }
    // -------------  🆕 Save user feedback  -------------


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
      <Router>
        <div style={{ paddingBottom: "70px" }}>
          <Routes>
            <Route
              path="/"
              element={
                <div className="App">
                  {showOnboarding ? (
                  <Onboarding user={user} onDone={() => setShowOnboarding(false)} />
                  ) : (
                    <>
                      <Wardrobe />
                      <Assistant />
                      <Plan />
                    </>
                  )}
                </div>
              }
            />
          </Routes>
        </div>
        <BottomNav />
      </Router>
    );

  }

  if (user && !onboardingDone) {
    return <Onboarding user={user} onDone={() => setOnboardingDone(true)} />;
  }

  return (
    <div className="App" style={{  padding: "1rem",
                                  maxWidth: "600px",
                                  margin: "auto",
                                  textAlign: "center",}}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #ddd",
          paddingBottom: "1rem",
          marginBottom: "2rem",
        }}
      >
        <nav style={{ display: "flex", gap: "1rem" }}>
          {[
            { href: "#wardrobe", label: "Wardrobe" },
            { href: "#add", label: "Add Item" },
            { href: "#stylist", label: "AI Stylist" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{
                padding: "8px 14px",
                textDecoration: "none",
                color: "#333",
                border: "1px solid #ddd",
                borderRadius: "8px",
                backgroundColor: "#f9f9f9",
                fontWeight: 500,
                fontSize: "0.95rem",
                transition: "all 0.2s ease-in-out",
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = "#e0e0e0";
                e.target.style.cursor = "pointer";
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = "#f9f9f9";
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {user && (
          <div style={{ display: "flex", alignItems: "center" }}>
            {user.photoURL && (
              <img
                src={user.photoURL}
                alt="User"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  marginRight: "0.5rem",
                }}
              />
            )}
            <span style={{ fontWeight: "500" }}>{user.displayName}</span>
          </div>
        )}
      </header>

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "2rem",
        }}
      >
        <h1 style={{ fontSize: "2rem", fontWeight: "700", margin: "1rem 0", color: "#6C4AB6" }}>
          W.O.W. Wardrobe
        </h1>
        {user ? (
          <div>
            <span> {user.displayName}</span>
            <button  onClick={handleLogout} style={{ marginLeft: "1rem" }}>
              Logout
            </button>
          </div>
        ) : (
          <button onClick={handleLogin} style={{
              marginLeft: "1rem",
              padding: "0.6rem 1.2rem",
              fontSize: "0.95rem",
              borderRadius: "8px",
              backgroundColor: "#6C4AB6",
              color: "white",
              border: "none",
              fontWeight: "600",
              cursor: "pointer",
          }}
            >
            Login with Google</button>
        )}
      </header>
      {user && (
        <>
          {/* Upload & Auto-tag section already included above */}
          {activeTab === "upload" && (
          <section id="add" style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: window.innerWidth < 480 ? "1.1rem" : "1.4rem", marginBottom: "1rem" }}>Upload Item</h2>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} />
            <button
              onClick={handleUpload}
              style={{
                marginLeft: "1rem",
                padding: "0.6rem 1.2rem",
                fontSize: "0.95rem",
                borderRadius: "8px",
                backgroundColor: "#6C4AB6",
                color: "white",
                border: "none",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Upload & Auto-Tag
            </button>


            {detectedItems.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <h4>Detected Items</h4>
                {detectedItems.map((item, i) => (
                  <div key={i} style={{ marginBottom: "0.5rem", border: "1px solid #ccc", padding: "0.5rem" }}>
                    <img src={item.image_url} alt={item.name} style={{ width: "100px" }} />
                    <p>{item.name} — {item.category} • {item.color}</p>
                    <button onClick={() => toggleItemApproval(i)}>
                      {item.approved ? "✅ Keep" : "❌ Remove"}
                    </button>
                    <button
                      onClick={() => openEditModal(item)}
                      style={{
                        position: "absolute",
                        top: "8px",
                        left: "8px",
                        background: "#fff",
                        border: "1px solid #ccc",
                        borderRadius: "50%",
                        padding: "6px",
                        cursor: "pointer",
                      }}
                    >
                      <Pencil size={16} />
                    </button>

                  </div>
                ))}
                <button onClick={confirmSelectedItems} style={{
                      marginLeft: "1rem",
                      padding: "0.6rem 1.2rem",
                      fontSize: "0.95rem",
                      borderRadius: "8px",
                      backgroundColor: "#6C4AB6",
                      color: "white",
                      border: "none",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                  Add Selected to Wardrobe
                </button>
              </div>
            )}
          </section>
          )}
          {editItemIndex !== null && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                backgroundColor: "rgba(0,0,0,0.6)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 1000,
                paddingTop: "env(safe-area-inset-top)",  // ← ✅ ADD THIS
              }}
            >
              <div
                style={{
                  background: "#fff",
                  padding: "2rem",
                  borderRadius: "10px",
                  width: "90%",
                  maxWidth: "400px",
                }}
              >
                <h3>Edit Detected Item</h3>

                <label>Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  style={{
                    width: "100%",
                    marginBottom: "1rem",
                    padding: "0.5rem",
                  }}
                />

                <label>Category</label>
                <input
                  type="text"
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm({ ...editForm, category: e.target.value })
                  }
                  style={{
                    width: "100%",
                    marginBottom: "1rem",
                    padding: "0.5rem",
                  }}
                />

                <label>Color</label>
                <input
                  type="text"
                  value={editForm.color}
                  onChange={(e) =>
                    setEditForm({ ...editForm, color: e.target.value })
                  }
                  style={{
                    width: "100%",
                    marginBottom: "1rem",
                    padding: "0.5rem",
                  }}
                />

                <label>Tags (comma separated)</label>
                <input
                  type="text"
                  value={editForm.tags}
                  onChange={(e) =>
                    setEditForm({ ...editForm, tags: e.target.value })
                  }
                  style={{
                    width: "100%",
                    marginBottom: "1rem",
                    padding: "0.5rem",
                  }}
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
                        tags: editForm.tags.split(",").map((tag) => tag.trim()),
                      };
                      setDetectedItems(updated);
                      setEditItemIndex(null);
                    }}
                    style={{
                      backgroundColor: "#007bff",
                      color: "white",
                      padding: "0.5rem 1rem",
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Wardrobe Section */}
          {activeTab === "wardrobe" && (
          <section id="wardrobe" style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: window.innerWidth < 480 ? "1.1rem" : "1.4rem", marginBottom: "1rem" }}>Your Wardrobe 🧥</h2>
            <div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{
                  padding: "0.5rem",
                  borderRadius: "8px",
                  border: filterCategory ? "2px solid #6C4AB6" : "1px solid #ccc",
                  backgroundColor: filterCategory ? "#f3f0ff" : "#fff",
                  margin: "0.5rem",
                  width: "80%",
                  maxWidth: "300px",
                  fontWeight: "500",
                }}
              >

                <option value="">Filter by category</option>
                <option value="Topwear">Topwear</option>
                <option value="Bottomwear">Bottomwear</option>
                <option value="Dresses">Dresses</option>
                <option value="Outerwear">Outerwear</option>
                <option value="Footwear">Footwear</option>
              </select>
              <select
                value={filterCategory}
                onChange={(e) => setFilterColor(e.target.value)}
                style={{
                  padding: "0.5rem",
                  borderRadius: "8px",
                  border: filterCategory ? "2px solid #6C4AB6" : "1px solid #ccc",
                  backgroundColor: filterCategory ? "#f3f0ff" : "#fff",
                  margin: "0.5rem",
                  width: "80%",
                  maxWidth: "300px",
                  fontWeight: "500",
                }}
              >


                <option value="">Filter by color</option>
                <option value="White">White</option>
                <option value="Black">Black</option>
                <option value="Blue">Blue</option>
                <option value="Beige">Beige</option>
                <option value="Green">Green</option>
              </select>
            </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                  gap: "1rem",
                  paddingTop: "1rem",
                  paddingLeft: "1rem",
                  paddingRight: "1rem",
                }}
              >

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: "1.5rem",
                  paddingTop: "1rem",
                }}
              >
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: "#fff",
                      borderRadius: "12px",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                      overflow: "hidden",
                      position: "relative",
                      transition: "transform 0.2s ease, box-shadow 0.2s ease",
                      cursor: "pointer",
                      transform: "scale(1)",
                      marginBottom: "30px", // ✅ ADD THIS LINE
                    }}

                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.03)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.1)";
                  }}
                >
                    <img
                      src={item.image_url}
                      alt={item.name}
                      style={{
                        width: "100%",
                        height: "220px",               // ✅ slightly taller, consistent
                        objectFit: "contain",          // ✅ ensures no cropping
                        backgroundColor: "#fafafa",
                        padding: "12px",               // ✅ adds breathing space
                        borderBottom: "1px solid #eee",
                        display: "block",
                      }}
                    />


                  <div style={{ padding: "0.75rem 0.5rem 0 0.5rem" }}>
                    <h3 style={{
                      fontSize: window.innerWidth < 480 ? "1rem" : "1.2rem",
                      fontWeight: "600",
                      margin: "0 0 0.25rem",
                      textAlign: "center",
                      color: "#222",
                    }}>
                      {formatLabel(item.color)} {formatLabel(item.name)}
                    </h3>
                  <div style={{ textAlign: "center" }}>
                    <p style={{
                      fontSize: window.innerWidth < 480 ? "0.75rem" : "0.85rem",
                      margin: 0,
                      fontWeight: "500",
                    }}>
                      {formatLabel(item.category)}
                    </p>

                    {item.tags && item.tags.length > 0 && (
                      <div style={{
                        display: "flex",
                        justifyContent: "center",
                        flexWrap: "wrap",
                        gap: "6px",
                        padding: "6px",
                        marginTop: "4px",
                      }}>
                        {item.tags.map((tag, i) => (
                          <span
                            key={i}
                            style={{
                              background: "#eee",
                              borderRadius: "12px",
                              padding: "4px 10px",
                              fontSize: "0.75rem",
                            }}
                          >
                            {formatLabel(tag)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  </div>

                  {/* 📝 Edit Button */}
                  <button
                    onClick={() => openEditModal(item)}
                    style={{
                      position: "absolute",
                      top: "8px",
                      left: "8px",
                      background: "#fff",
                      border: "1px solid #ccc",
                      borderRadius: "50%",
                      width: "30px",
                      height: "30px",
                      fontSize: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                      cursor: "pointer",
                    }}
                  >
                    ✏️
                  </button>

                  {/* 🗑️ Delete Button */}
                  <button
                    onClick={() => handleDelete(item.id)}
                    style={{
                      position: "absolute",
                      top: "8px",
                      right: "8px",
                      background: "#fff",
                      border: "1px solid #ccc",
                      borderRadius: "50%",
                      width: "30px",
                      height: "30px",
                      fontSize: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                      cursor: "pointer",
                    }}
                  >
                    🗑️
                  </button>

                </div>
              ))}
            </div>
            </div>
          </section>
          )}


          {/* AI Stylist Section */}
          {activeTab === "stylist" && (
          <section id="stylist">
            <h2 style={{ fontSize: window.innerWidth < 480 ? "1.1rem" : "1.4rem", marginBottom: "1rem" }}> Outfit Suggestions 🤖</h2>
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
                padding: "0.6rem 1.2rem",
                background: "#6C4AB6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              Get Outfit Suggestions
            </button>
          </section>
          )}

          {/* Weekly Planner */}
          {activeTab === "planner" && (
            <section style={{ marginTop: "2rem" }}>
              <h2 style={{ fontSize:window.innerWidth < 480 ? "1.1rem" : "1.4rem", marginBottom: "1rem" }}> Weekly Outfit Planner</h2>
              <WeeklyPlanner />
            </section>
          )}

          {/* Suggested Looks */}
          <section style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: window.innerWidth < 480 ? "1.1rem" : "1.4rem", marginBottom: "1rem" }}>🧠 Suggested Looks</h2>
            {Array.isArray(outfit) && outfit.length > 0 ? (
              <div style={{ marginTop: "2rem" }}>
                {outfit.map((look, idx) => (
                  <div key={idx} style={{ marginBottom: "2rem", textAlign: "center" }}>
                    <h4 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>
                      Look {idx + 1}
                    </h4>
                    <p
                      style={{
                        backgroundColor: "#f5f5f5",
                        padding: "0.5rem 1rem",
                        borderLeft: "4px solid #000",
                        margin: "0 auto 1.5rem",
                        maxWidth: "400px",
                        fontStyle: "italic",
                        textAlign: "left",
                      }}
                    >
                      📝 {look.style_note}
                    </p>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "1.5rem",
                        justifyContent: "center",
                      }}
                    >
                      {look.items.map((piece, i) => (
                        <div
                          key={i}
                          style={{
                            width: "160px",
                            backgroundColor: "#fff",
                            borderRadius: "12px",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            padding: "1rem",
                            textAlign: "center",
                          }}
                        >
                          <img
                            src={piece.image_url}
                            alt={piece.name || "No name"}
                            style={{
                              width: "100%",
                              height: "180px",
                              objectFit: "cover",
                              borderRadius: "8px",
                              marginBottom: "0.5rem",
                            }}
                          />
                          <strong style={{ fontSize: "0.95rem" }}>
                            {piece.name || "Unnamed"}
                          </strong>
                          <p style={{ margin: "0.25rem 0", fontSize: window.innerWidth < 480 ? "0.75rem" : "0.85rem" }}>
                            Category: {piece.category || "N/A"}
                          </p>
                          <p style={{ margin: "0.25rem 0", fontSize:window.innerWidth < 480 ? "0.75rem" : "0.85rem" }}>
                            Color: {piece.color || "N/A"}
                          </p>
                          <button
                            onClick={() => {
                              const date = prompt("Enter date (YYYY-MM-DD) to save this look:");
                              if (!date) return;
                              fetch(`${BASE_URL}/plan-outfit`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ uid: user.uid, date, outfit: look }),
                              })
                                .then((r) => {
                                  if (!r.ok) throw new Error("Server error");
                                  alert(`✅ Look saved for ${date}`);
                                })
                                .catch((e) => alert("❌ " + e.message));
                            }}
                            style={{
                              marginTop: "1rem",
                              padding: "0.6rem 1.2rem",
                              background: "#6C4AB6",
                              color: "white",
                              border: "none",
                              borderRadius: "8px",
                              cursor: "pointer",
                              fontWeight: "600",
                            }}

                          >
                            Save This Look
                          </button>
                        </div>
                        {/* ---------- FEEDBACK BUTTONS ---------- */}
                        <div style={{ marginTop: "1rem" }}>
                          <button
                            onClick={() => handleFeedback(idx, true)}
                            style={{ marginRight: "0.6rem" }}
                          >
                            ❤️ Love it
                          </button>
                          <button onClick={() => handleFeedback(idx, false)}>
                            🙅 Not my vibe
                          </button>
                        </div>

                        {feedbackSubmitted === idx && (
                          <p
                            style={{
                              fontSize: "0.8rem",
                              color: "#6b7280",
                              marginTop: "0.25rem",
                            }}
                          >
                            Feedback saved. Tina's taking notes! 📝
                          </p>
                        )}
                        {/* -------------------------------------- */}
                      </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              outfit !== null && (
                <p style={{ marginTop: "1rem" }}>
                  No outfits found. Try changing your filters or uploading more items.
                </p>
              )
            )}
          </section>

          {/* Tag Edit Modal */}
          {showModal && selectedItem && (
            <section
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
                paddingTop: "env(safe-area-inset-top)",  // ← ✅ ADD THIS
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
                    style={{
                      backgroundColor: "#007bff",
                      color: "white",
                      padding: "0.5rem 1rem",
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>

              {activeTab === "wardrobe" && (
                <>
                  {/* Optional: Keep filters here */}
                  <div className="filter-bar">
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                    >
                      <option value="">All Categories</option>
                      <option value="Tops">Tops</option>
                      <option value="Bottoms">Bottoms</option>
                      <option value="Dresses">Dresses</option>
                      <option value="Accessories">Accessories</option>
                    </select>

                    <select
                      value={filterColor}
                      onChange={(e) => setFilterColor(e.target.value)}
                    >
                      <option value="">All Colors</option>
                      <option value="Red">Red</option>
                      <option value="Blue">Blue</option>
                      <option value="Black">Black</option>
                      <option value="White">White</option>
                    </select>
                  </div>

                  {/* ✅ New grid component */}
                  <Wardrobe
                    items={filteredItems}
                    onAddClick={() => setActiveTab("upload")}
                    onEdit={openEditModal}
                    onDelete={handleDelete}
                    filterCategory={filterCategory}
                    filterColor={filterColor}
                  />
                </>
              )}
            </section>
          )}
        </>
      )}
      {/* Virtual Try-On Section */}
      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: window.innerWidth < 480 ? "1.1rem" : "1.4rem", marginBottom: "1rem" }}> Try It On</h2>
        <VirtualTryOn />
      </section>
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          width: "100%",
          backgroundColor: "#fff",
          borderTop: "1px solid #ddd",
          display: "flex",
          justifyContent: "space-around",
          padding: "0.75rem 0",
          zIndex: 1000,
        }}
      >
        {[
          { label: "Wardrobe", key: "wardrobe" },
          { label: "Upload", key: "upload" },
          { label: "Stylist", key: "stylist" },
          { label: "Planner", key: "planner" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: "none",
              border: "none",
              fontWeight: tab.key === activeTab ? "bold" : "normal",
              color: tab.key === activeTab ? "#000" : "#666",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      )}
      {/* -------------------------------------- */}
      </div>
      );
      }