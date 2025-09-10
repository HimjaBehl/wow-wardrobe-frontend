import { doc, getDoc, deleteDoc, addDoc, collection, serverTimestamp, writeBatch } from "firebase/firestore";
import { useState, useEffect, useMemo } from "react";
import "./App.css";
import Onboarding from "./Onboarding";
import { storage, auth, provider, signInWithPopup, signOut, db } from "./firebase";
import { query, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import WeeklyPlanner from "./WeeklyPlanner";
import VirtualTryOn from "./VirtualTryOn";




const BASE_URL = "https://wow-wardrobe-backend-himjabehl.replit.app";

/* ========== mood-board helpers ========== */
async function saveOutfitToPlanner({ uid, outfit }) {
  const date = new Date().toISOString().split("T")[0];
  await fetch(`${BASE_URL}/plan-outfit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, date, outfit }),
  });
  alert("📅 Outfit saved!");
}

async function likeOutfit({ uid, outfit, context = {} }) {
  try {
    const res = await fetch(`${BASE_URL}/like-outfit`, {
     method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ uid, outfit, context }),
    });

    /** 🔍 DEBUG */
    console.log("➡️  like-outfit response status:", res.status);

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Backend replied ${res.status}: ${txt.slice(0,200)}`);
    }

    alert("❤️  Look liked");
  } catch (err) {
    console.error("❌ likeOutfit failed:", err);
    alert("Couldn’t like this look – see console.");
  }
}

/* ======================================== */

export default function App() {
  const [file, setFile] = useState(null);
  const [items, setItems] = useState([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [occasion, setOccasion] = useState("casual");
  // 🆕 Theme selectors
  const [theme, setTheme] = useState("Western");
  const [subTheme, setSubTheme] = useState("Party");
  const [selectedItems, setSelectedItems] = useState([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [vibe, setVibe] = useState("fun");
  const [city, setCity] = useState("Delhi");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedMood, setSelectedMood] = useState("powerful");
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

  // 🆕 toggle between Tina agent (LangChain) and old route
  const [useTinaAgent, setUseTinaAgent] = useState(false);


  // 🔹 NEW – for the click-to-open modal
  const [modalItem,   setModalItem]   = useState(null);
  const [isModalOpen, setModalOpen]   = useState(false);
  const openModal  = (item) => { setModalItem(item); setModalOpen(true); };
  const closeModal = ()    => { setModalOpen(false); setModalItem(null); };

  const saveLook = async (lookObj) => {
    try {
      await fetch(`${BASE_URL}/like-outfit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user?.uid,
          outfit: {
            note: lookObj.style_note,
            items: lookObj.items,
          },
          context: { source: "manual_save" },
        }),
      });
      alert("💖 Look saved successfully!");
    } catch (error) {
      console.error("Error saving look:", error);
      alert("Failed to save look.");
    }
  };

  const confirmLook = (lookObj) => {
  console.log("✅ Selected Look:", lookObj);
    alert("✅ Look confirmed!");
  };


  // 🆕 derive dropdown lists from current wardrobe 
  const uniqueCategories = useMemo( () => [...new Set(items.map((it) => it.category).filter(Boolean))], [items] ); const uniqueColors = useMemo( () => [...new Set(items.map((it) => it.color).filter(Boolean))], [items] );

  const formatLabel = (str = "") => {
    return str
      .split("/")                // drop parent paths (“Clothing/Tops” → “Tops”)
      .pop()
      .replace(/_/g, " ")        // snake_case → spaces
      .toLowerCase()             // start with all-lower
      .replace(/\b\w/g, (c) => c.toUpperCase()) // Title-case each word
      .trim();
  };

  

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (user?.uid) {
      fetch(`${BASE_URL}/onboarding?uid=${user.uid}`)
        .then(res => res.json())
        .then(data => {
          if (data.error || !data.body) {
            console.warn("⚠️ No onboarding found, showing form...");
            setShowOnboarding(true);
          } else {
            console.log("✅ Onboarding data found:", data);
          }
        })
        .catch(err => {
          console.error("❌ Error fetching onboarding:", err);
          setShowOnboarding(true);
        });
    }
  }, [user]);

  
  useEffect(() => {
    const fetchOnboarding = async () => {
      if (!user || !user.uid) return;

      try {
        const res = await fetch(`https://wow-wardrobe-backend-himjabehl.replit.app/onboarding?uid=${user.uid}`);
        if (!res.ok) throw new Error("Not onboarded");
        const prefs = await res.json();
        console.log("🎯 Found onboarding prefs:", prefs);
        setShowOnboarding(false);
      } catch (err) {
        console.warn("⚠️ No onboarding found, showing form...");
        setShowOnboarding(true);
      }
    };

    fetchOnboarding();
  }, [user]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        console.log("🔥 Your UID is:", firebaseUser.uid);
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

      // 🔄 Ensure every item has an image_url
      const withUrls = data.map((item) => {
        if (item.image_url) return item;

        // 👇 Build the public URL from image_path
        if (item.image_path) {
          const bucket = "wowapp1406.appspot.com";  // your Firebase bucket
          return {
            ...item,
            image_url: `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
              item.image_path
            )}?alt=media`,
          };
        }

        console.warn("⚠️ Missing image_url for item:", item);
        return item;
      });




      setItems(withUrls);
      console.log("👗 Wardrobe items loaded:", withUrls);
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

    const uniqueName = `${user.uid}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `wardrobe/${uniqueName}`);
    try {
      await uploadBytes(storageRef, file);
      const imageUrl   = await getDownloadURL(storageRef);   // used for Ximilar preview
      const storagePath = storageRef.fullPath;               // ➡  "wardrobe/…filename…"

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
        imagePath: storagePath, // will be saved to Firestore
        image_url: imageUrl,
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

    // 🚦 throw out any item whose path is missing or “undefined”
    const bad = approved.find((it) => !it.imagePath || it.imagePath.includes("undefined"));
    if (bad) {
      alert("One of the selected items has an invalid image path — please re-upload.");
      return;
    }


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
            image_path: item.imagePath,
            image_url : item.image_url,   // ➕ keep the public link
            name     : item.name,
            category : item.category,
            color    : item.color,
            tags     : item.tags,
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


  // 💖 toggle / untoggle favourite
  const toggleFavorite = async (id, currentFav = false) => {
    try {
      const res = await fetch(`${BASE_URL}/wardrobe/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, isFavorite: !currentFav }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update favorite: ${res.status}`);
      }

      // Refresh UI quickly without full refetch
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, isFavorite: !currentFav } : it))
      );
    } catch (err) {
      console.error("Fav toggle failed:", err);
      alert("Couldn’t update favourite, sorry!");
    }
  };

  // ✅ mark as worn (stores ISO date only)
  const markAsWorn = async (id) => {
    const today = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch(`${BASE_URL}/mark-worn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, itemId: id, lastWorn: today }),
      });

      if (!res.ok) {
        throw new Error(`Failed to mark as worn: ${res.status}`);
      }
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, lastWorn: today } : it))
      );
    } catch (err) {
      console.error("Mark worn failed:", err);
      alert("Couldn’t mark as worn, sorry!");
    }
  };

  // 🔥 Bulk-delete selected wardrobe items
  const handleDeleteSelected = async () => {
    if (selectedItems.length === 0) return;
    if (!window.confirm(`Delete ${selectedItems.length} selected item(s)?`)) return;

    try {
      const res = await fetch(`${BASE_URL}/wardrobe/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, ids: selectedItems }),
      });

      if (!res.ok) {
        throw new Error(`Failed to delete items: ${res.status}`);
      }

      // Update local UI
      setItems((prev) => prev.filter((it) => !selectedItems.includes(it.id)));
      setSelectedItems([]);
      setIsMultiSelectMode(false);
      alert("🗑️ Deleted!");
    } catch (err) {
      console.error("Bulk delete failed:", err);
      alert("Couldn’t delete some items.");
    }
  };
  async function suggestOutfitAgent(options = {}) {
    const { uid, city, wardrobe, theme, subTheme } = options;

    if (!uid) return;

    console.log("🟢 Sending to Tina agent:", options);

    try {
      const res = await fetch(`${BASE_URL}/tina-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, city, wardrobe, theme, subTheme }),


      });

      const rawText = await res.text();
      console.log("🎯 Tina agent result (raw from backend):", rawText);

      let clean = rawText.trim();
      if (clean.startsWith("```")) {
        clean = clean.replace(/```json/i, "").replace(/```$/, "").trim();
      }

      let data;
      try {
        data = JSON.parse(clean);
        console.log("✅ Parsed Tina agent JSON:", data);
      } catch (err) {
        console.warn("⚠️ Could not parse Tina agent raw:", clean);
        data = { looks: [] };
      }

      if (!res.ok) throw new Error(data.error || "Agent failed");

      // 🔥 Fallback if Tina sends no looks
      if (!data.looks && data.look) {
        data.looks = [ { title: "Look 1", style_note: "Auto-fixed", items: data.look } ];
      }

      if (!data.looks || !Array.isArray(data.looks)) {
        console.warn("⚠️ Tina returned invalid schema:", data);
        setOutfit([]);
        return;
      }


      // ✅ Normal case
      setOutfit(
        data.looks.map((look, idx) => ({
          title: look.title || `Look ${idx + 1}`,
          style_note: look.style_note || "Suggested look",
          trends_used: look.trends_used || [],
          items: (look.items || []).map((it) => {
            const wardrobeItem = items.find((w) => String(w.id) === String(it.id)) || {};
            return {
              id: it.id,
              name: wardrobeItem.name || it.name || "Unnamed",
              category: wardrobeItem.category || it.category || "",
              color: wardrobeItem.color || it.color || "",
              image_url: wardrobeItem.image_url || it.image_url || "",
              tags: wardrobeItem.tags || it.tags || [],
            };
          }),
        }))
      );
    } catch (err) {
      console.error("❌ Tina agent failed:", err);
      alert("Tina agent could not generate looks.");
    }
  }

  async function suggestPinterestOutfits({ uid, theme, city, weather }) {
    const res = await fetch(`${BASE_URL}/pinterest-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, theme, city, weather }),
    });
    return await res.json();
  }


async function suggestOutfit(options = {}) {
    const {
      uid,
      vibe,
      occasion,
      style_mood,
      prompt = "",
      constraints = "",
      city = "Delhi",
    } = options;

    if (!uid) return;

    const attempt = async (payload) => {
      console.log("🟢 Sending to backend:", payload);
      // 👉 toggle here: use Tina agent or old suggest-outfit
      const endpoint = useTinaAgent ? "/tina-agent" : "/suggest-outfit";

      const response = await fetch(`${BASE_URL}${endpoint}`, {

        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        // Retry case if Tina failed with "no valid looks"
        if (data.error?.includes("no looks") || data.error?.includes("No valid looks")) {
          const reasons = data.rejected_reasons || [];
          const combinedReason = reasons.join(" | ");
          setOutfit([]);
          alert(`Tina tried her best but couldn't style a look.\nReasons: ${combinedReason}`);
        } else {
          alert(`Error: ${data.error || "Something went wrong"}`);
        }
        return null;
      }

      return data;
    };

    // 1️⃣ First attempt — full payload
    let result = await attempt({
      uid,
      city,
      occasion,
      vibe,
      constraints,
      prompt,
      style_mood,
    });

    // 2️⃣ If fail and retry allowed — fallback to minimal
    if (!result || !Array.isArray(result.looks) || result.looks.length === 0) {
      console.warn("⚠️ Retry: Tina failed to find a look. Trying simplified prompt...");

      result = await attempt({
        uid,
        city,
        occasion: "",
        vibe: "",
        constraints,
        prompt,
        style_mood,
      });
    }

    if (result && Array.isArray(result.looks)) {
      console.log("🎯 Final looks:", result.looks);
      setOutfit(
        result.looks.map((look) => ({
          title : look.title,
          style_note: look.style_note || "Suggested look",
          items : dedupe(
            (look.items || []).map((it) => ({
              ...it,
              image_url: it.image_url || it.image,
              name     : it.name      || `Item ${it.idx ?? "?"}`,
            }))
          ),
        }))
      );
    }
  }


  // 🔸 remove any exact-duplicate items (same image_url)
  function dedupe(list = []) {
    const map = new Map();
    list.forEach((it) => map.set(`${it.idx}-${it.image_url}`, it)); // idx + url
    return [...map.values()];
  }





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

  // 💎 Clean, case-friendly filtering
  const filteredItems = items.filter((item) => {
    const categoryMatch = filterCategory
      ? formatLabel(item.category) === formatLabel(filterCategory)
      : true;

    const colorMatch = filterColor
      ? formatLabel(item.color) === formatLabel(filterColor)
      : true;

    return categoryMatch && colorMatch;
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
        <p style={{ fontSize: "1.2rem" }}>What. Outfit. When.</p>
      </div>
    );
  }

  if (user && !onboardingDone) {
    return <Onboarding user={user} onDone={() => setOnboardingDone(true)} />;
  }


  // ✅ Add this right before return:
  if (showOnboarding) {
    return <Onboarding user={user} onDone={() => setShowOnboarding(false)} />;
  }

  return (
    <div
      className="App"
      style={{
        padding: "1rem 1rem 5rem",
        fontFamily: "sans-serif",
      }}
    >
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
        <h1>W.O.W. Wardrobe </h1>
        {user ? (
          <div>
            <span> {user.displayName}</span>
            <button aria-label="Logout" onClick={handleLogout} style={{ marginLeft: "1rem" }}>
              Logout
            </button>
          </div>
        ) : (
          <button onClick={handleLogin} style={{
              marginTop: "1rem",
              width: "100%",
              padding: "0.75rem",
              fontSize: "1rem",
              borderRadius: "8px",
            }}>Login with Google</button>
        )}
      </header>
      {user && (
        <>
          {/* Upload & Auto-tag section already included above */}
          {activeTab === "upload" && (
          <section id="add" style={{ marginBottom: "2rem" }}>
            <h2>Upload Item</h2>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} />
            <button onClick={handleUpload} style={{
                marginTop: "1rem",
                width: "100%",
                padding: "0.75rem",
                fontSize: "1rem",
                borderRadius: "8px",
              }}>
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
                      onClick={() => {
                        setEditItemIndex(i);
                        setEditForm({
                          name: item.name || "",
                          category: item.category || "",
                          color: item.color || "",
                          tags: (item.tags || []).join(", "),
                        });
                      }}
                      style={{ marginLeft: "0.5rem" }}
                    >
                      ✏️ Edit
                    </button>
                  </div>
                ))}
                <button onClick={confirmSelectedItems} style={{
                    marginTop: "1rem",
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "1rem",
                    borderRadius: "8px",
                  }}>
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
            <h2>Your Wardrobe 🧥</h2>

            {/* ── Multi-select toolbar ───────────────────── */}
            <div style={{ marginBottom: "10px" }}>
              <button
                onClick={() => {
                  setIsMultiSelectMode(!isMultiSelectMode);
                  if (isMultiSelectMode) setSelectedItems([]);     // leaving the mode resets
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  backgroundColor: isMultiSelectMode ? "#ffe0e0" : "#e0ffe0",
                  marginRight: "10px"
                }}
              >
                {isMultiSelectMode ? "Cancel Multi-Select" : "Select Items to Delete"}
              </button>

              {isMultiSelectMode && selectedItems.length > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    backgroundColor: "#ff4d4d",
                    color: "#fff"
                  }}
                >
                  Delete {selectedItems.length} Selected
                </button>
              )}
            </div>
            {/* ───────────────────────────────────────────── */}


            <div>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} > <option value="">All Categories</option> {uniqueCategories.map((cat) => ( <option key={cat} value={cat}>{formatLabel(cat)}</option> ))} </select>

              <select value={filterColor} onChange={(e) => setFilterColor(e.target.value)} style={{ marginLeft: "1rem" }} > <option value="">All Colors</option> {uniqueColors.map((col) => ( <option key={col} value={col}>{formatLabel(col)}</option> ))} </select>

            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1.5rem",
                paddingTop: "1rem",
              }}
            >
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => openModal(item)} 
                  aria-label={`Open details for ${item.name}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openModal(item)}
                  style={{
                    cursor: "pointer",
                    width: "200px",
                    margin: "10px",
                    background: "#fff",
                    borderRadius: "8px",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {isMultiSelectMode && (
                    <input
                      type="checkbox"
                      checked={selectedItems.includes(item.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...selectedItems, item.id]
                          : selectedItems.filter((sid) => sid !== item.id);
                        setSelectedItems(ids);
                      }}
                      style={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        width: 18,
                        height: 18,
                        cursor: "pointer",
                        zIndex: 12
                      }}
                      onClick={(e) => e.stopPropagation()}  // don’t open modal
                    />
                  )}

                  {item.image_url && (
                     <img
                       src={item.image_url}
                      alt={item.name}
                       style={{ width:"100%",height:"240px",objectFit:"cover" }}
                     />
                   )}
                  <div
                    style={{
                      padding: "0.5rem",
                      fontWeight: "bold",
                      textAlign: "center",
                    }}
                  >
                    {formatLabel(item.color)} {formatLabel(item.name)}
                  </div>
                  <p
                    style={{
                      textAlign: "center",
                      fontSize: "0.9rem",
                      margin: 0,
                    }}
                  >
                    {formatLabel(item.category)}
                  </p>
                  {item.tags && item.tags.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        flexWrap: "wrap",
                        gap: "4px",
                        padding: "4px",
                      }}
                    >
                      {[...new Set(item.tags || [])].map((tag, i) => (
                        <span
                          key={i}
                          style={{
                            background: "#eee",
                            borderRadius: "12px",
                            padding: "2px 8px",
                            fontSize: "0.8rem",
                          }}
                        >
                          {formatLabel(tag)}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* ————————— CARD CONTROLS ————————— */}
                  <div className="card-controls">


                    {/* existing edit / delete */}
                    <span
                      aria-label="Edit item"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                      onKeyDown={(e) => (["Enter"," "].includes(e.key)) && openEditModal(item)}
                    >
                      ✏️
                    </span>
                    <span
                      aria-label="Delete item"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                      onKeyDown={(e) => (["Enter"," "].includes(e.key)) && handleDelete(item.id)}
                    >
                      🗑️
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
          )}


          {/* AI Stylist Section */}
          {activeTab === "stylist" && (
            <section id="stylist">
              <h2>AI Outfit Suggestions 🤖</h2>
              <p style={{marginTop:"-0.5rem",marginBottom:"1rem",fontSize:"0.9rem",color:"#555"}}>
                Pick a sub-theme and city, Tina will style your look ✨
              </p>

              <div style={{ marginBottom: "1rem" }}>
                <select
                  value={subTheme}
                  onChange={(e) => setSubTheme(e.target.value)}
                >
                  <option value="Casual">Casual</option>
                  <option value="Party">Party</option>
                  <option value="Workwear">Workwear</option>
                  <option value="Athleisure">Athleisure</option>
                  <option value="Brunch">Brunch</option>
                  <option value="Dinner">Dinner</option>
                </select>

                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  style={{ marginLeft: "1rem", padding: "4px" }}
                />
              </div>

              <button
                onClick={async () => {
                  await suggestOutfitAgent({
                    uid: user.uid,
                    city,
                    wardrobe: items,
                    subTheme,
                  });
                }}
                style={{ backgroundColor: "white", border: "1px solid black", marginTop: "1rem" }}
              >
                Get Outfit Suggestions
              </button>
            </section>
          )}

          {/* Weekly Planner */}
          {activeTab === "planner" && (
            <section style={{ marginTop: "2rem" }}>
              <h2>🗓️ Weekly Outfit Planner</h2>
              <WeeklyPlanner />
            </section>
          )}

          {/* Display outfit suggestions */}
          {/* Display outfit suggestions */}
          {outfit && outfit.length > 0 ? (
            outfit.map((look, idx) => (
              <section key={idx} className="outfit-group">
                <h3>✨ {look.title || `Look ${idx + 1}`}</h3>
                <p className="style-note">📝 {look.style_note}</p>

                <div className="outfit-grid">
                  {look.items.map((piece, i) => {
                const hydrated = piece;


                    return (
                      <article key={i} className="outfit-card">
                        <img
                          src={hydrated.image_url}
                          alt={hydrated.name}

                          style={{ width: "100%", height: "240px", objectFit: "cover" }}
                        />
                        <p className="item-name">{hydrated.name || `Item ${piece.idx}`}</p>
                      </article>
                    );
                  })}

                </div>

                <div className="outfit-actions">
                  <button onClick={() => saveOutfitToPlanner({ uid: user.uid, outfit: look })}>
                    💾 Save
                  </button>
                  <button
                    onClick={() =>
                      likeOutfit({
                        uid    : user.uid,
                        outfit : look,
                        context: { occasion, vibe, style_mood: selectedMood },
                      })
                    }
                  >
                    ❤️ Like
                  </button>

                </div>
                {look.trends_used && look.trends_used.length > 0 && (
                  <div className="trends">
                    <h4>✨ Inspired by Trends</h4>
                    <ul>
                      {look.trends_used.map((trend, i) => (
                        <li key={i}>
                          {trend.content}
                          {trend.url && (
                            <a
                              href={trend.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ marginLeft: "6px", color: "#0070f3" }}
                            >
                              (Source)
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              </section>
            ))
          ) : (
            outfit !== null && (
              <p style={{ marginTop: "1rem", color: "#888" }}>
                Tina couldn’t style anything right now. Try again, or check wardrobe 👗
              </p>
            )
          )}


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

            </section>
          )}
        </>
      )}
      {/* -------------------------------------------- */}
      {/* 📌  NEW: wardrobe-card details modal         */}
      {isModalOpen && modalItem && (
        <div className="wow-overlay" onClick={closeModal}>
          <div
            className="wow-modal"
            onClick={(e) => e.stopPropagation()}   // keep clicks inside
          >
            <img src={modalItem.image_url} alt={modalItem.name} />

            <h3>{formatLabel(modalItem.color)} {formatLabel(modalItem.name)}</h3>
            <p className="sub">{formatLabel(modalItem.category)}</p>

            {modalItem.tags?.length > 0 && (
              <div className="tags">
                {[...new Set(modalItem.tags)].map((t, i) => (
                  <span key={i}>{formatLabel(t)}</span>
                ))}
              </div>
            )}


            <button onClick={closeModal}>Close</button>
          </div>
        </div>
      )}
      {/* -------------------------------------------- */}

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
      </div>
      );
      }