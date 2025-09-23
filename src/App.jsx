import { doc, getDoc, deleteDoc, addDoc, collection, serverTimestamp, writeBatch } from "firebase/firestore";
import Profile from "./Profile";
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
  const [userPrefs, setUserPrefs] = useState({});
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

// AI stylist source: "n8n" or "agent"
const [stylistSource, setStylistSource] = useState("n8n");

useEffect(() => {
  console.log("🎛️ Stylist source changed:", stylistSource);
}, [stylistSource]);


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
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editedTags, setEditedTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("wardrobe");
  const [detectedItems, setDetectedItems] = useState([]);
  
  // New upload features state
  const [uploadExpanded, setUploadExpanded] = useState(true);
  const [quickAddExpanded, setQuickAddExpanded] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [toastMessage, setToastMessage] = useState("");
  const [staples, setStaples] = useState([]);

  


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
    if (!user?.uid) return;

    setLoadingPrefs(true);
    fetch(`${BASE_URL}/onboarding?uid=${user.uid}`)
    .then(res => res.json())
    .then(data => {
      const hasRealPrefs =
        (data.gender && data.gender.trim() !== "") ||
        (data.bodyShape && data.bodyShape.trim() !== "") ||
        (data.complexion && data.complexion.trim() !== "");

      setNeedsOnboarding(!hasRealPrefs);
      setUserPrefs(data);   // ✅ save prefs globally
    })
    .catch(err => {
      console.error("❌ Error fetching onboarding:", err);
      setNeedsOnboarding(true);
    })
    .finally(() => setLoadingPrefs(false));

  }, [user]);


  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        console.log("🔥 Your UID is:", firebaseUser.uid);
        fetchItems(firebaseUser.uid);
      }
    });

    if (loading) {
      return (
        <div className="loading-screen">
          <h1 className="loading-title">W.O.W.</h1>
          <p className="loading-subtitle">What. Outfit. When.</p>
        </div>
      );
    }

    if (loadingPrefs) {
      return <p style={{ textAlign: "center", marginTop: "2rem" }}>Loading preferences…</p>;
    }

    if (user && needsOnboarding) {
      return <Onboarding user={user} onDone={() => setNeedsOnboarding(false)} />;
    }

    return () => unsubscribe();
  }, []);

  // Fetch staples from backend
  useEffect(() => {
    const fetchStaples = async () => {
      if (!user?.uid || !userPrefs.gender) return; // wait for prefs

      try {
        const res = await fetch(`${BASE_URL}/staples?gender=${userPrefs.gender}`);
        if (!res.ok) throw new Error("Failed to fetch staples");
        const staplesData = await res.json();

      if (staplesData.success && Array.isArray(staplesData.staples)) {
              setStaples(staplesData.staples);
            }
          } catch (err) {
            console.error("Failed to fetch staples:", err);
          }
        };

        fetchStaples();
      }, [user?.uid, userPrefs.gender]); // ✅ dependency array belongs here

  


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

  // ⚡ New upload features functions
  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const handleQuickAdd = async (variant, stapleName, stapleCategory) => {
    try {
      const res = await fetch(`${BASE_URL}/quick-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          name: stapleName,
          category: stapleCategory,
          color: variant.color,
          image_url: variant.image_url,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to add ${stapleName}`);
      }

      showToast(`✅ Added ${stapleName} (${variant.color})`);
      fetchItems(user.uid); // refresh wardrobe
    } catch (err) {
      console.error("Quick add failed:", err);
      showToast(`❌ Failed to add ${stapleName}`);
    }
  };

  const handleProductSearch = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      const res = await fetch(`${BASE_URL}/search-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });

      if (!res.ok) {
        throw new Error("Search failed");
      }

      const data = await res.json();
      setSearchResults(data.products || []);

    } catch (err) {
      console.error("Product search failed:", err);
      showToast("❌ Search failed");
    }
  };

      const handleProductSelect = async (product) => {
        try {
          const res = await fetch(`${BASE_URL}/quick-add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              uid: user.uid,
              name: product.name,
              category: product.category || "Search",
              color: product.color || "Unknown",
              image_url: product.image_url,
            }),
          });

          if (!res.ok) {
            throw new Error("Failed to save product");
          }

          showToast(`✅ ${product.name} added to wardrobe!`);
          setSearchResults([]);
          setSearchQuery("");
          fetchItems(user.uid); // refresh wardrobe
        } catch (err) {
          console.error("Product save failed:", err);
          showToast("❌ Failed to save product");
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
       console.log("🟣 Payload to Tina:", { uid, city, wardrobe, theme, subTheme });



       try {
         const res = await fetch(`${BASE_URL}/suggest-outfit`, {
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

         if (!data.looks && data.look) {
           data.looks = [ { title: "Look 1", style_note: "Auto-fixed", items: data.look } ];
         }

         if (!data.looks || !Array.isArray(data.looks)) {
           console.warn("⚠️ Tina returned invalid schema:", data);
           setOutfit([]);
           return;
         }

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


// ✅ Moved outside so it’s globally accessible
async function suggestOutfitN8N({ uid, city, occasion }) {
  if (!uid) return;

  try {
    const res = await fetch("https://himja.app.n8n.cloud/webhook/suggest-outfit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, city, occasion,vibe }),
    });

    const data = await res.json();
    console.log("🎯 N8N AI Outfits:", data);

    if (data.looks && Array.isArray(data.looks)) {
      console.log("👗 Wardrobe IDs:", items.map(i => i.id));
      console.log("🎯 N8N Look IDs:", data.looks.flatMap(l => l.ids));

      console.log("👗 Firebase wardrobe IDs:", items.map(i => i.id));
      console.log("🎯 N8N outfit IDs:", data.looks.flatMap(l => l.ids));

      setOutfit(
        data.looks.map((look, idx) => ({
          title: `Look ${idx + 1}`,
          style_note: look.note || look.style_note || "Suggested look",
          items: (look.ids || []).map((id) => {
            const wardrobeItem = items.find(
              (w) => String(w.id).trim() === String(id).trim()
            );

            if (!wardrobeItem) {
              console.warn("⚠️ Missing wardrobe item for ID:", id);
            }
            return {
              id,
              name: wardrobeItem?.name || `Item ${id}`,
              category: wardrobeItem?.category || "",
              color: wardrobeItem?.color || "",
              image_url: wardrobeItem?.image_url || "/placeholder.png",
              tags: wardrobeItem?.tags || [],
            };
          }),
        }))
      );

    

    

    } else {
      console.warn("⚠️ No looks returned from N8N:", data);
      setOutfit([]);
    }
  } catch (err) {
    console.error("❌ N8N suggestOutfit failed:", err);
    alert("Could not fetch looks from N8N");
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
      const response = await fetch(`${BASE_URL}/suggest-outfit`, {


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
      <div className="loading-screen">
        <h1 className="loading-title">W.O.W.</h1>
        <p className="loading-subtitle">What. Outfit. When.</p>
      </div>
    );
  }

  


  

  return (
    <div className="app">
      {/* Modern Header */}
      <header className="app-header">
        <a href="#" className="app-logo">
          W.O.W.
        </a>
        {user && (
          <div className="app-profile">
            {user.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user.displayName || 'User'}
                style={{ width: '100%', height: '100%', borderRadius: '50%' }}
              />
            ) : (
              (user.displayName || user.email || 'U').charAt(0).toUpperCase()
            )}
          </div>
        )}
        {!user && (
          <button className="btn btn-primary" onClick={handleLogin}>
            Login
          </button>
        )}
      </header>

      {/* Main Content */}
      <main className="app-main">
        {!user ? (
          <div className="section text-center">
            <h1 className="section-title">Welcome to W.O.W.</h1>
            <p style={{ fontSize: '1.125rem', color: 'var(--neutral-600)', marginBottom: 'var(--spacing-xl)' }}>
              Your personal wardrobe assistant. Please login to continue.
            </p>
            <button className="btn btn-accent" onClick={handleLogin}>
              Login with Google
            </button>
          </div>
        ) : (
          <>
          {activeTab === "upload" && (
          <section className="section">
            <h2 className="section-title">Add to Wardrobe</h2>
            <p className="section-description">Upload photos, add staples, or search for items</p>
            
            {/* 1. Upload / Camera Section */}
            <div className="upload-section">
              <div 
                className="section-header"
                onClick={() => setUploadExpanded(!uploadExpanded)}
              >
                <h3 className="section-subtitle">📸 Upload / Camera</h3>
                <span className={`expand-icon ${uploadExpanded ? 'expanded' : ''}`}>▼</span>
              </div>
              
              {uploadExpanded && (
                <div className="section-content">
                  <div className="upload-methods">
                    <div className="upload-zone">
                      <div className="upload-icon">📷</div>
                      <h4>Choose Photo</h4>
                      <p>Upload from gallery</p>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => setFile(e.target.files[0])}
                        className="file-input"
                      />
                    </div>
                    
                    <div className="upload-zone">
                      <div className="upload-icon">📱</div>
                      <h4>Take Photo</h4>
                      <p>Use camera</p>
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        onChange={(e) => setFile(e.target.files[0])}
                        className="file-input"
                      />
                    </div>
                  </div>
                  
                  {file && (
                    <div className="selected-file">
                      <p>📄 {file.name}</p>
                      <button 
                        className="btn btn-primary"
                        onClick={handleUpload}
                        style={{ marginTop: "var(--spacing-md)", width: "100%" }}
                      >
                        ✨ Auto-Tag & Detect Items
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Detected Items Results */}
            {detectedItems.length > 0 && (
              <div className="upload-results">
                <h3 className="section-subtitle">✨ Detected Items</h3>
                <div className="detected-items">
                  {detectedItems.map((item, i) => (
                    <div key={i} className="detected-item card">
                      <div className="detected-item-image">
                        <img src={item.image_url} alt={item.name} className="preview-image" />
                        <div className="checkbox-overlay">
                          <input
                            type="checkbox"
                            checked={item.approved}
                            onChange={() => toggleItemApproval(i)}
                            className="item-checkbox"
                          />
                        </div>
                      </div>
                      <div className="detected-item-content">
                        <h4 className="detected-item-title">{item.name}</h4>
                        <p className="detected-item-details">
                          {item.category} • <span className="color-highlight">{item.color}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <button 
                  className="btn btn-primary"
                  onClick={confirmSelectedItems}
                  style={{ marginTop: "var(--spacing-lg)", width: "100%" }}
                >
                  ➕ Add Selected to Wardrobe
                </button>
              </div>
            )}
            
            {/* 2. Quick Add Section */}
            <div className="upload-section">
              <div 
                className="section-header"
                onClick={() => setQuickAddExpanded(!quickAddExpanded)}
              >
                <h3 className="section-subtitle">⚡ Quick Add Staples</h3>
                <span className={`expand-icon ${quickAddExpanded ? 'expanded' : ''}`}>▼</span>
              </div>
              
            {quickAddExpanded && (
              <div className="grid grid-wardrobe">
                {staples.flatMap((staple) =>
                  staple.variants.map((variant, index) => (
                    <div
                      key={`${staple.name}-${index}`}
                      className="card"
                      onClick={() => handleQuickAdd(variant, staple.name, staple.category)}
                      style={{ cursor: "pointer" }}
                    >
                      {/* Image */}
                      {variant.image_url && (
                        <img
                          className="card-image"
                          src={variant.image_url}
                          alt={`${staple.name} in ${variant.color}`}
                          onError={(e) => (e.target.style.display = "none")}
                        />
                      )}

                      {/* Content */}
                      <div className="card-content">
                        <h3 className="card-title">
                          {staple.name}
                        </h3>
                        <p className="card-subtitle">
                          {staple.category}
                        </p>
                      </div>

                      {/* Tags */}
                      <div className="tags" style={{ padding: "0 var(--spacing-md) var(--spacing-sm)" }}>
                        <span className="tag">{variant.color}</span>
                        <span className="tag">Staple</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            </div>
            
            {/* 3. Search & Link Section */}
            <div className="upload-section">
              <div 
                className="section-header"
                onClick={() => setSearchExpanded(!searchExpanded)}
              >
                <h3 className="section-subtitle">🔍 Search & Link</h3>
                <span className={`expand-icon ${searchExpanded ? 'expanded' : ''}`}>▼</span>
              </div>
              
              {searchExpanded && (
                <div className="section-content">
                  <div className="search-bar">
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search for product..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleProductSearch()}
                    />
                    <button 
                      className="btn btn-primary"
                      onClick={handleProductSearch}
                      style={{ marginTop: "var(--spacing-md)" }}
                    >
                      🔍 Search Products
                    </button>
                  </div>
                  
                  {searchResults.length > 0 && (
                    <div className="search-results">
                      <h4 className="results-title">Found {searchResults.length} products</h4>
                      <div className="results-grid">
                        {searchResults.map((product, i) => (
                          <div key={i} className="product-card card" onClick={() => handleProductSelect({
                            image_url: product.image_url || product.url,
                            name: product.name || product.title || "Unnamed",
                            category: "Search",
                            color: "Unknown",
                            tags: []
                          })}>
                            <img 
                              src={product.image_url || product.thumbnail} 
                              alt={product.name} 
                              className="product-image" 
                            />
                            <div className="product-info">
                              <p className="product-name">{product.name || "Unnamed"}</p>
                              <p className="product-price">{product.price}</p>
                            </div>
                          </div>
                        ))}


                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            
            {/* Toast Notification */}
            {toastMessage && (
              <div className="toast-notification">
                {toastMessage}
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

          {/* Modern Wardrobe Section */}
          {activeTab === "wardrobe" && (
          <section className="section">
            <h2 className="section-title">Your Wardrobe</h2>

            {/* Modern Multi-select Toolbar */}
            <div className="flex gap-md" style={{ marginBottom: "var(--spacing-lg)" }}>
              <button
                className={`btn ${isMultiSelectMode ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => {
                  setIsMultiSelectMode(!isMultiSelectMode);
                  if (isMultiSelectMode) setSelectedItems([]);     // leaving the mode resets
                }}
              >
                {isMultiSelectMode ? "✕ Cancel" : "Select Items"}
              </button>

              {isMultiSelectMode && selectedItems.length > 0 && (
                <button
                  className="btn"
                  onClick={handleDeleteSelected}
                  style={{
                    background: "var(--accent-pink)",
                    color: "var(--primary-white)"
                  }}
                >
                  🗑️ Delete {selectedItems.length}
                </button>
              )}
            </div>
            {/* ───────────────────────────────────────────── */}


            {/* Modern Filters */}
            <div className="flex gap-md" style={{ marginBottom: "var(--spacing-lg)" }}>
              <div className="form-group">
                <select 
                  className="form-select" 
                  value={filterCategory} 
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="">All Categories</option>
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat}>{formatLabel(cat)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <select 
                  className="form-select" 
                  value={filterColor} 
                  onChange={(e) => setFilterColor(e.target.value)}
                >
                  <option value="">All Colors</option>
                  {uniqueColors.map((col) => (
                    <option key={col} value={col}>{formatLabel(col)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Modern Wardrobe Grid */}
            <div className="grid grid-wardrobe">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="card"
                  onClick={() => openModal(item)} 
                  aria-label={`Open details for ${item.name}`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openModal(item)}
                  style={{ cursor: "pointer", position: "relative" }}
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
                       className="card-image"
                       src={item.image_url}
                      alt={item.name}
                     />
                   )}
                  <div className="card-content">
                    <h3 className="card-title">
                      {formatLabel(item.color)} {formatLabel(item.name)}
                    </h3>
                    <p className="card-subtitle">
                      {formatLabel(item.category)}
                    </p>
                  </div>
                  {item.tags && item.tags.length > 0 && (
                    <div className="tags" style={{ padding: "0 var(--spacing-md) var(--spacing-sm)" }}>
                      {[...new Set(item.tags || [])].slice(0, 3).map((tag, i) => (
                        <span key={i} className="tag">
                          {formatLabel(tag)}
                        </span>
                      ))}
                      {item.tags.length > 3 && (
                        <span className="tag tag-accent">+{item.tags.length - 3}</span>
                      )}
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
            <section className="section">
              <h2 className="section-title">AI Style Assistant</h2>
              <p className="section-description">
                Let our AI stylist create personalized looks from your wardrobe ✨
              </p>

              {/* Modern Style Controls */}
              <div className="style-controls">
                <div className="form-group">
                  <label className="form-label">Occasion</label>
                  <select
                    className="form-select"
                    value={subTheme}
                    onChange={(e) => setSubTheme(e.target.value)}
                  >
                    <option value="Casual">😎 Casual</option>
                    <option value="Party">🎉 Party</option>
                    <option value="Workwear">💼 Workwear</option>
                    <option value="Athleisure">🏃‍♀️ Athleisure</option>
                    <option value="Brunch">🥐 Brunch</option>
                    <option value="Dinner">🍽️ Dinner</option>
                    <option value="Gym">🏋️ Gym / Workout</option>
                    <option value="Travel">✈️ Travel / Airport</option>
                    <option value="Date">💖 Date Night</option>
                    <option value="Wedding">💃 Wedding / Festive</option>
                    <option value="Beach">🏖️ Beach / Resort</option>
                    <option value="Formal">🎩 Formal Event / Gala</option>
                    <option value="Interview">🗂️ Interview / Presentation</option>
                    <option value="Shopping">🛍️ Shopping / Errands</option>
                    <option value="Concert">🎶 Concert / Festival</option>
                    <option value="Winter">❄️ Winter Casual / Layered</option>
                    <option value="Summer">☀️ Summer Casual / Lightwear</option>
                    <option value="Lounge">🛋️ Lounge / Homewear</option>
                    <option value="Streetwear">🕶️ Streetwear / Urban</option>
                    <option value="Business">📊 Business Casual</option>
                    <option value="Adventure">🏔️ Outdoor Adventure / Hiking</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Vibe</label>
                  <input
                    className="form-input"
                    type="text"
                    value={vibe}
                    onChange={(e) => setVibe(e.target.value)}
                    placeholder="e.g., edgy, romantic, minimalist"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input
                    className="form-input"
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g., New York, Paris, Tokyo"
                  />
                </div>
              </div>
<div className="form-group">
  <label className="form-label">Stylist Source</label>
  <select
    className="form-select"
    value={stylistSource}
    onChange={(e) => setStylistSource(e.target.value)}
  >
    <option value="n8n">🌐 N8N Workflow</option>
    <option value="agent">🤖 Tina Agent (Replit)</option>
  </select>
</div>

              <button
  className="btn btn-primary"
  onClick={async () => {
  console.log("🖱️ Generate clicked, source:", stylistSource);

  if (stylistSource === "n8n") {
    await suggestOutfitN8N({
      uid: user.uid,
      city,
      occasion: subTheme,
      vibe,
    });
  } else {
    await suggestOutfitAgent({
  uid: user.uid,
  city,
  wardrobe: items,
  theme,
  subTheme,
});
  }
}}

  style={{ marginTop: "var(--spacing-lg)", width: "100%" }}
>
  🪄 Generate Outfit Ideas ({stylistSource === "n8n" ? "via N8N" : "via Tina Agent"})
</button>


              {/* Modern Outfit Suggestions */}
              {outfit && outfit.length > 0 ? (
            <div className="outfit-suggestions">
              {outfit.map((look, idx) => (
                <div key={idx} className="outfit-look">
                  <div className="look-header">
                    <h3 className="look-title">✨ {look.title || `Look ${idx + 1}`}</h3>
                    <p className="look-description">{look.style_note}</p>
                  </div>

                  <div className="look-items">
                    {look.items.map((piece, i) => {
                      const hydrated = piece;
                      return (
                        <div key={i} className="look-item card">
                          <img
                            className="look-item-image"
                            src={hydrated.image_url}
                            alt={hydrated.name}
                          />
                          <div className="look-item-info">
                            <p className="look-item-name">{hydrated.name || `Item ${piece.idx}`}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="look-actions">
                    <button 
                      className="btn btn-outline"
                      onClick={() => saveOutfitToPlanner({ uid: user.uid, outfit: look })}
                    >
                      💾 Save to Planner
                    </button>
                    <button
                      className="btn btn-accent"
                      onClick={() =>
                        likeOutfit({
                          uid    : user.uid,
                          outfit : look,
                          context: { occasion, vibe, style_mood: selectedMood },
                        })
                      }
                    >
                      ❤️ Love This Look
                    </button>
                  </div>
                  {look.trends_used && look.trends_used.length > 0 && (
                    <div className="look-trends">
                      <h4 className="trends-title">🔥 Trending Inspiration</h4>
                      <div className="trends-list">
                        {look.trends_used.map((trend, i) => (
                          <div key={i} className="trend-item">
                            <span className="trend-content">{trend.content}</span>
                            {trend.url && (
                              <a
                                className="trend-source"
                                href={trend.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                🔗 Source
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            outfit !== null && (
              <p style={{ marginTop: "1rem", color: "#888" }}>
                Tina couldn’t style anything right now. Try again, or check wardrobe 👗
              </p>
            )
          )}
            </section>
          )}

          {/* Weekly Planner */}
          {activeTab === "planner" && (
            <section style={{ marginTop: "2rem" }}>
              <h2>🗓️ Weekly Outfit Planner</h2>
              <WeeklyPlanner />
            </section>
          )}

            {/* Profile Section */}
            {activeTab === "profile" && (
              <section className="section">
                <Profile user={user} />
              </section>
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
      </main>

      {/* Modern Bottom Navigation */}
      {user && (
        <nav className="bottom-nav">
          <ul className="bottom-nav-list">
            <li className="bottom-nav-item">
              <button 
                className={`bottom-nav-link ${activeTab === 'wardrobe' ? 'active' : ''}`}
                onClick={() => setActiveTab('wardrobe')}
                aria-label="Wardrobe"
              >
                <span className="bottom-nav-icon">👗</span>
                Wardrobe
              </button>
            </li>
            <li className="bottom-nav-item">
              <button 
                className={`bottom-nav-link ${activeTab === 'upload' ? 'active' : ''}`}
                onClick={() => setActiveTab('upload')}
                aria-label="Upload"
              >
                <span className="bottom-nav-icon">📱</span>
                Upload
              </button>
            </li>
            <li className="bottom-nav-item">
              <button 
                className={`bottom-nav-link ${activeTab === 'stylist' ? 'active' : ''}`}
                onClick={() => setActiveTab('stylist')}
                aria-label="AI Stylist"
              >
                <span className="bottom-nav-icon">✨</span>
                Stylist
              </button>
            </li>
            <li className="bottom-nav-item">
              <button 
                className={`bottom-nav-link ${activeTab === 'planner' ? 'active' : ''}`}
                onClick={() => setActiveTab('planner')}
                aria-label="Planner"
              >
                <span className="bottom-nav-icon">📅</span>
                Planner
              </button>
            </li>
            <li className="bottom-nav-item">
              <button 
                className={`bottom-nav-link ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => setActiveTab('profile')}
                aria-label="Profile"
              >
                <span className="bottom-nav-icon">👤</span>
                Profile
              </button>
            </li>

          </ul>
        </nav>
      )}

      {/* Modern Modals */}
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