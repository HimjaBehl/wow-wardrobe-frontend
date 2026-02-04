import { doc, getDoc, deleteDoc, addDoc, collection, serverTimestamp, writeBatch } from "firebase/firestore";
import Profile from "./Profile";
import FeedbackPanel from "./FeedbackPanel";

import { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import "./Wardrobe.css";
import Onboarding from "./Onboarding";
import { storage, auth, provider, db } from "./firebase";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";

import { getDocs, query, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import WeeklyPlanner from "./WeeklyPlanner";
import PlanViewer from "./PlanViewer";
import HomeDashboard from "./HomeDashboard";
import VirtualTryOn from "./VirtualTryOn";
// near the other imports
import TrendsPanel from "./trendPanel";
import { logOutfitFeedback } from "./logOutfitFeedback";






const BASE_URL = "https://wow-wardrobe-backend-himjabehl.replit.app";


const uiCopy = {
  home: {
    title: "W.O.W.",
    subtitle: "What. Outfit. When.",
    primaryCta: "Generate a look from my wardrobe",
    planCta: "Plan today’s outfit →",
  },
  upload: {
    detectBtn: "Detect clothing items",
    detectedTitle: " Detected Items",
    addSelectedBtn: " Add selected to wardrobe",
  },
  stylist: {
    generateBtn: "Create outfits from my wardrobe",
    loadingText: "Tina is styling your look…",
    emptyText: "I couldn’t build a complete look yet. Try adding footwear or changing the occasion.",
    loveBtn: " Love this look",
    calendarBtn: " Add to calendar",
    swapBtn: " Swap…",
  },
  wardrobe: {
    emptyTitle: "Your wardrobe is empty.",
    emptySubtitle: "Upload your first item to get started ",
    selectBtn: "Select items",
    cancelBtn: "✕ Cancel",
  },
};


// —— Normalizers to compare images/ids reliably ——
function normalizeUrl(u = "") {
  try {
    const url = new URL(u);
    url.search = "";               // drop query (?alt=media etc.)
    // normalize double-encoded firebase paths
    url.pathname = decodeURIComponent(url.pathname || "");
    return url.toString();
  } catch {
    const base = (u || "").split("?")[0];
    try {
      return decodeURIComponent(base);
    } catch {
      return base;
    }
  }
}
function sameImage(a, b) {
  if (!a || !b) return false;

  const A = normalizeUrl(a);
  const B = normalizeUrl(b);

  // ✅ Exact normalized match
  if (A === B) return true;

  // ✅ Ignore bucket prefixes (wowapp1406 → wowapp) and token params
  const clean = (s) => s.replace(/wowapp\d*/g, "wowapp").replace(/\?.*$/, "");
  if (clean(A) === clean(B)) return true;

  // ✅ Partial match: last 40 chars of the path (helps with encoded image names)
  const tail = (s) => {
    const last = (s || "").split("/").pop() || "";
    return last.slice(-40);
  };
  return !!tail(A) && tail(A) === tail(B);
}

// —— Category normalizer (frontend) ——
// We store categories like "Clothing/Bottoms" or "Footwear/Heels" but UI + swap logic needs canonical buckets.
function normalizeCategoryFront(category = "", name = "") {
  const c = String(category || "").toLowerCase();
  const n = String(name || "").toLowerCase();

  // Use taxonomy path style strings too ("Clothing/Bottoms")
  if (c.includes("bottom") || c.includes("pants") || c.includes("trouser") || c.includes("jeans")) return "Bottom";
  if (c.includes("top") || c.includes("upper") || c.includes("shirt") || c.includes("tee") || c.includes("blouse")) return "Top";
  if (c.includes("dress") || c.includes("gown")) return "Dress";
  if (c.includes("outerwear") || c.includes("blazer") || c.includes("coat") || c.includes("jacket") || c.includes("suit")) return "Outerwear";
  if (c.includes("footwear") || c.includes("heel") || c.includes("shoe") || c.includes("sandal") || c.includes("sneaker") || c.includes("boot")) return "Footwear";
  if (c.includes("bag") || c.includes("handbag") || c.includes("tote") || c.includes("clutch") || c.includes("purse")) return "Bag";
  if (c.includes("accessory") || c.includes("belt") || c.includes("sunglass") || c.includes("jewelry") || c.includes("jewellery") || c.includes("bracelet") || c.includes("watch")) return "Accessory";

  // If category is weak (like "Misc") infer from name
  if (/trouser|pants|jeans|chinos|skirt|shorts|palazzo|salwar|gharara|sharara|dhoti/.test(n)) return "Bottom";
  if (/shirt|t-?shirt|tee|blouse|kurta|kameez|sweater|hoodie/.test(n)) return "Top";
  if (/dress|gown|jumpsuit|saree|lehenga|anarkali/.test(n)) return "Dress";
  if (/blazer|jacket|coat|suit/.test(n)) return "Outerwear";
  if (/heel|shoe|sneaker|boot|sandal|loafer|mule|trainer/.test(n)) return "Footwear";
  if (/bag|tote|purse|clutch|backpack/.test(n)) return "Bag";
  if (/belt|watch|sunglass|jewel|earring|bracelet/.test(n)) return "Accessory";

  return category || "Misc";
}


// Toggle this if you want to also show external “inspiration” items that are not in the wardrobe.
const SHOW_INSPIRATION = false;

// -----------------------------
// Outfit Feedback helpers
// -----------------------------
function makeOutfitId(look, fallbackIdx = 0) {
  // stable-ish id based on wardrobe ids (so it doesn't change every click)
  const ids = (look?.items || []).map(x => String(x.id || "")).filter(Boolean).sort();
  return ids.length ? `outfit_${ids.join("_")}` : `outfit_${Date.now()}_${fallbackIdx}`;
}

function toFeedbackItems(look) {
  return (look?.items || []).map((it) => ({
    wardrobe_id: String(it.id || ""),
    name: it.name || "",
    category: it.category || "",
  })).filter(x => x.wardrobe_id);
}
const SHOW_TRENDS = false;

const COMPLEXION_OPTIONS = [
  // light (less “white”)
  { id: "light_1", label: "Light 1", hex: "#F2D6C9" },
  { id: "light_2", label: "Light 2", hex: "#E7C3B0" },

  // medium (more variety)
  { id: "medium_1", label: "Medium 1", hex: "#D2A07C" },
  { id: "medium_2", label: "Medium 2", hex: "#C38961" },
  { id: "medium_3", label: "Medium 3", hex: "#B1734B" },

  // brown (3 shades)
  { id: "brown_1", label: "Brown 1", hex: "#9A5E3D" },
  { id: "brown_2", label: "Brown 2", hex: "#7E442B" },
  { id: "brown_3", label: "Brown 3", hex: "#5F2F1E" },

  // deep brown (3 shades)
  { id: "deep_1", label: "Deep 1", hex: "#4B2417" },
  { id: "deep_2", label: "Deep 2", hex: "#35180F" },
  { id: "deep_3", label: "Deep 3", hex: "#241009" },
];


function LoadingState({ text = "Loading…" }) {
  return (
    <div className="section text-center" style={{ padding: "2rem 1rem" }}>
      <p style={{ fontSize: "1.05rem", opacity: 0.8 }}>{text}</p>
    </div>
  );
}

function ProfileOnboardingEditor({ userPrefs, onSave, bodyShapeAssets, assetsLoading }) {

  const [gender, setGender] = useState(userPrefs?.gender || "");
  const [bodyShape, setBodyShape] = useState(userPrefs?.bodyShape || "");
  const [complexion, setComplexion] = useState(userPrefs?.complexion || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ✅ NEW: stop userPrefs from overwriting while editing
  const [dirtyPrefs, setDirtyPrefs] = useState(false);

  // ✅ lock UI after both selections
  const [lockedPrefs, setLockedPrefs] = useState(false);




  useEffect(() => {
    // ✅ if user is actively editing, don't overwrite their picks
    if (dirtyPrefs) return;

    setGender(userPrefs?.gender || "");
    setBodyShape(userPrefs?.bodyShape || "");
    setComplexion(userPrefs?.complexion || "");

    // ✅ if prefs already exist, keep locked view
    const hasBoth = !!(userPrefs?.bodyShape && userPrefs?.complexion);
    setLockedPrefs(hasBoth);
  }, [userPrefs, dirtyPrefs]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await onSave({ gender, bodyShape, complexion });
      setSaved(true);

      // ✅ persist locked state after saving
      setDirtyPrefs(false);
      setLockedPrefs(true);

      setTimeout(() => setSaved(false), 2000);

    } catch (err) {
      console.error("Error saving profile:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wow-profile-editor">
      
        <div className="wow-profile-editor-grid">
          <div className="prefs-head">
            

            {lockedPrefs && (
              <button
                type="button"
                className="change-pref-btn"
                onClick={() => {
                  setLockedPrefs(false);
                  setDirtyPrefs(false);
                }}
              >
                Change
              </button>
            )}
          </div>

        <label className="wow-profile-label">
          Gender
          <select value={gender} onChange={(e) => setGender(e.target.value)} className="wow-profile-select">
            <option value="">Select...</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other">Other</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>
        </label>
        <div className="wow-profile-label">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Body Shape</div>

          {assetsLoading ? (
            <div style={{ opacity: 0.7 }}>Loading body shapes…</div>
          ) : (() => {
            const isMale = String(gender || "").toLowerCase() === "male";
            const list = isMale ? (bodyShapeAssets?.male || []) : (bodyShapeAssets?.female || []);
            if (list.length === 0) {
              return <div style={{ opacity: 0.7 }}>No body shapes found.</div>;
            }
            return (
              <div className="wow-card-grid">
                {(lockedPrefs ? list.filter(o => (o.id || "").toLowerCase() === (bodyShape || "").toLowerCase()) : list).map((opt) => {
                  const active = (bodyShape || "").toLowerCase() === (opt.id || "").toLowerCase();
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`wow-choice-card ${active ? "is-active" : ""}`}
                      onClick={() => {
                        setDirtyPrefs(true);
                        setBodyShape(opt.id);
                        if (complexion) setLockedPrefs(true);
                      }}

                    >
                      {opt.image_url && <img src={opt.image_url} alt={opt.label} className="shapeImage" />}
                      <div className="wow-choice-title">{opt.label}</div>
                      {opt.hint ? <div className="wow-choice-hint">{opt.hint}</div> : null}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>

        <div className="wow-profile-label">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Complexion</div>

          <div className="wow-swatch-grid" role="list">
      {(lockedPrefs ? COMPLEXION_OPTIONS.filter(o => o.id.toLowerCase() === (complexion || "").toLowerCase()) : COMPLEXION_OPTIONS).map((opt) => {

              const active = (complexion || "").toLowerCase() === opt.id.toLowerCase();
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`wow-swatch ${active ? "is-active" : ""}`}
                  onClick={() => {
                    setDirtyPrefs(true);
                    setComplexion(opt.id);
                    if (bodyShape) setLockedPrefs(true);
                  }}

                  aria-label={opt.label}
                  title={opt.label}
                  role="listitem"
                >
                  <span className="wow-swatch-dot" style={{ backgroundColor: opt.hex }} />
                  
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <button className="wow-profile-save" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : saved ? "Saved!" : "Save Preferences"}
      </button>
    </div>
  );
}

function OnboardingModal({ open, uid, userPrefs, onClose, onSavePrefs, bodyShapeAssets, assetsLoading, setBodyShapeAssets, setAssetsLoading }) {
  const [formGender, setFormGender] = useState(userPrefs?.gender || "");
  const [formBodyShape, setFormBodyShape] = useState(userPrefs?.bodyShape || "");
  const [formComplexion, setFormComplexion] = useState(userPrefs?.complexion || "");
  const [saving, setSaving] = useState(false);

// ✅ NEW: lock UI after both selections
const [lockedPrefs, setLockedPrefs] = useState(false);


  useEffect(() => {
    setFormGender(userPrefs?.gender || "");
    setFormBodyShape(userPrefs?.bodyShape || "");
    setFormComplexion(userPrefs?.complexion || "");

    // ✅ if prefs already exist, start locked (and don't keep flipping)
    const hasBoth = !!(userPrefs?.bodyShape && userPrefs?.complexion);
    setLockedPrefs(hasBoth);
  }, [userPrefs]);



  useEffect(() => {
    const loadBodyShapes = async () => {
      try {
        setAssetsLoading(true);

        const refDoc = doc(db, "app_config", "onboarding_assets");
        const snap = await getDoc(refDoc);

        if (!snap.exists()) {
          setBodyShapeAssets({ female: [], male: [] });
          return;
        }

        const data = snap.data() || {};
        console.log("onboarding_assets keys:", Object.keys(data));

        const shapes =
          data.bodyShapes ||
          data.bodyshapes ||
          data.bodyShape ||
          data.body_shapes ||
          {};

        const normalize = (val) => {
          if (Array.isArray(val)) return val;

          if (val && typeof val === "object") {
            return Object.entries(val)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([k, v]) => ({
                id: v?.id || v?.key || v?.label || `shape_${k}`,
                ...v,
              }));
          }

          return [];
        };

        const femaleList = normalize(shapes?.female);
        const maleList = normalize(shapes?.male);

        console.log("female normalized length:", femaleList.length);
        console.log("male normalized length:", maleList.length);

        setBodyShapeAssets({ female: femaleList, male: maleList });
      } catch (e) {
        console.error("Failed to load bodyShapes:", e);
        setBodyShapeAssets({ female: [], male: [] });
      } finally {
        setAssetsLoading(false);
      }
    };

    loadBodyShapes();
  }, []);


  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDismiss = () => {
    if (uid) localStorage.setItem(`wow_welcome_dismissed_${uid}`, "true");
    onClose?.();
  };

  const handleSubmit = async () => {
    if (!formGender.trim() || !formBodyShape.trim() || !formComplexion.trim()) {
      alert("Please fill in all fields.");
      return;
    }
    setSaving(true);
    try {
      await onSavePrefs({ gender: formGender, bodyShape: formBodyShape, complexion: formComplexion });
      if (uid) localStorage.setItem(`wow_welcome_dismissed_${uid}`, "true");
    } catch (err) {
      console.error("Error saving onboarding:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
      <div
        className="wow-onb-overlay"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) handleDismiss();
        }}
        onTouchStart={(e) => {
          if (e.target === e.currentTarget) handleDismiss();
        }}
      >

      <div className="wow-onb-card" onClick={(e) => e.stopPropagation()}>
        <div className="wow-onb-header">
          <div className="wow-onb-progress" aria-label="Onboarding progress">
            <span className="wow-onb-dot is-active" />
            <span className="wow-onb-count">Profile Setup</span>
          </div>
          <button className="wow-onb-close" type="button" onClick={handleDismiss} aria-label="Close onboarding">
            ✕
          </button>
        </div>

        <h2 className="wow-onb-title">Welcome to WOW</h2>
        <p className="wow-onb-subtitle">Tell us a bit about yourself for better styling recommendations.</p>

        <div className="wow-onb-form">
          <label className="wow-onb-label">
            Gender
            <select value={formGender} onChange={(e) => setFormGender(e.target.value)} className="wow-onb-select">
              <option value="">Select...</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </label>

          <div className="wow-onb-label">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Body Shape</div>

            {assetsLoading && <div style={{ opacity: 0.7, marginBottom: 8 }}>Loading body shapes…</div>}

            {lockedPrefs && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <button
                  type="button"
                  className="change-pref-btn"
                  onClick={() => setLockedPrefs(false)}
                >
                  Change
                </button>
              </div>
            )}

            <div className="wow-card-grid">

      {(() => {
        const list = (formGender === "Male" ? bodyShapeAssets.male : bodyShapeAssets.female) || [];
        const viewList = lockedPrefs
          ? list.filter(o => (o.id || "").toLowerCase() === (formBodyShape || "").toLowerCase())
          : list;
        return viewList.map((opt) => {

                const active = (formBodyShape || "").toLowerCase() === (opt.id || "").toLowerCase();
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`wow-choice-card ${active ? "is-active" : ""}`}
                    onClick={() => {
                      setFormBodyShape(opt.id);
                      if (formComplexion) setLockedPrefs(true);
                    }}

                  >
                    <img src={opt.image_url} alt={opt.label} className="shapeImage" />
                    <div className="wow-choice-title">{opt.label}</div>
                    {opt.hint ? <div className="wow-choice-hint">{opt.hint}</div> : null}
                  </button>
                );
              });
            })()}
            </div>
          </div>

          <div className="wow-onb-label">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Complexion</div>

            <div className="wow-swatch-grid" role="list">
              {(lockedPrefs ? COMPLEXION_OPTIONS.filter(o => o.id.toLowerCase() === (formComplexion || "").toLowerCase()) : COMPLEXION_OPTIONS).map((opt) => {
                const active = (formComplexion || "").toLowerCase() === opt.id.toLowerCase();
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`wow-swatch ${active ? "is-active" : ""}`}
                    onClick={() => {
                      setFormComplexion(opt.id);
                      if (formBodyShape) setLockedPrefs(true);
                    }}

                    aria-label={opt.label}
                    title={opt.label}
                    role="listitem"
                  >
                    <span className="wow-swatch-dot" style={{ backgroundColor: opt.hex }} />
                    
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="wow-onb-actions">
          <button className="wow-onb-primary" type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Get started →"}
          </button>
          <button className="wow-onb-skip" type="button" onClick={handleDismiss}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================================== */

export default function App() {
  const [userPrefs, setUserPrefs] = useState({});
  const [file, setFile] = useState(null); // current preview (optional)
  const [files, setFiles] = useState([]);           // selected files (multi)
  const [fileQueue, setFileQueue] = useState([]);   // queue of remaining files
  const [activeFile, setActiveFile] = useState(null); // current file being processed
  const [busyDetecting, setBusyDetecting] = useState(false);
  const [items, setItems] = useState([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterColor, setFilterColor] = useState("");
  const [occasion, setOccasion] = useState("Casual");
  const [selectedItems, setSelectedItems] = useState([]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [vibe, setVibe] = useState("fun");
  const [city, setCity] = useState("Delhi");
  const [todayPlan, setTodayPlan] = useState({ outfit: { items: [] } });
  const [autoSuggestedOutfit, setAutoSuggestedOutfit] = useState(null);
  const [autoSuggestLoading, setAutoSuggestLoading] = useState(false);
  const hasTodayPlan =
    !!todayPlan?.outfit &&
    Array.isArray(todayPlan.outfit.items) &&
    todayPlan.outfit.items.length > 0;


  // ── Onboarding modal UI state (frontend-only) ──
  const [onboardingOpen, setOnboardingOpen] = useState(false);


    const feedbackSessionIdRef = useRef(String(Date.now()));// 🔎 Viewer for a saved plan/outfit
  const [viewOpen, setViewOpen] = useState(false);
  const [viewPlan, setViewPlan] = useState(null);

  const openPlanViewer = (plan) => {
    const safe = plan || { outfit: { items: [] } };
    // also guard missing outfit/items
    if (!safe.outfit) safe.outfit = { items: [] };
    if (!Array.isArray(safe.outfit.items)) safe.outfit.items = [];
    setViewPlan(safe);
    setViewOpen(true);
  };

  const [selectedBodyshape, setSelectedBodyshape] = useState(null);
  const [selectedComplexion, setSelectedComplexion] = useState(null);

  // NEW
  const [lockedPrefs, setLockedPrefs] = useState(false);

  const [bodyShapeAssets, setBodyShapeAssets] = useState({ female: [], male: [] });
  const [assetsLoading, setAssetsLoading] = useState(true);

  const closePlanViewer = () => {
    setViewOpen(false);
    setViewPlan(null);
  };
  // ── Add-to-Calendar modal state ──────────────────────────────
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({
    date: new Date().toISOString().split("T")[0],
    title: "",
    note: ""
  });
  const [planLook, setPlanLook] = useState(null);

  const openPlanModal = (look) => {
    setPlanLook(look);
    setPlanForm((prev) => ({
      ...prev,
      title: look?.title || "Planned Look",
      // keep today's date by default
    }));
    setShowPlanModal(true);
  };

  
  const closePlanModal = () => {
    setShowPlanModal(false);
    setPlanLook(null);
  };

  // submit to backend and refresh planner
  const addLookToCalendar = async () => {
    if (!user?.uid || !planLook) return;
    try {
      const payload = {
        uid   : user.uid,
        date  : planForm.date,               // YYYY-MM-DD
        outfit: {
          title: planForm.title,
          note : planForm.note,
          items: planLook.items || []
        }
      };

      const res = await fetch(`${BASE_URL}/plan-outfit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Failed to add to calendar: ${t}`);
      }

      // Optional: quick feedback + refresh (today will only show if date == today)
      alert("🗓️ Added to your calendar!");
   
      try {
        await logOutfitFeedback({
          uid: user.uid,
          occasion,
          vibe,
          action: "plan",                 // ✅ calendar intent
          outfit_id: planLook?.outfit_id || `plan_${feedbackSessionIdRef.current}`,
          items: (planLook?.items || []).map((it) => ({
            wardrobe_id: String(it.id),
            name: it.name || "",
            category: it.category || "",
          })),
          reason_tags: [],
        });
      } catch (e) {
        console.warn("Plan feedback log failed (non-blocking):", e);
      }

      closePlanModal();
      fetchTodayPlan(user.uid);
 } catch (err) {
      console.error("Add-to-calendar failed:", err);
      alert("Couldn’t add to calendar. Please try again.");
    }
  };




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
  const [activeTab, setActiveTab] = useState("home");
  const [stylistLoading, setStylistLoading] = useState(false);
  const [detectedItems, setDetectedItems] = useState([]);
  const [openEditors, setOpenEditors] = useState({}); // idx -> true/false
  
  // New upload features state
  const [uploadExpanded, setUploadExpanded] = useState(true);
  const [quickAddExpanded, setQuickAddExpanded] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [toastMessage, setToastMessage] = useState("");
  const [staples, setStaples] = useState([]);

  // 🔁 swap menu state: which look index is open (or null)
  const [swapOpenIdx, setSwapOpenIdx] = useState(null);


  


  // 🔹 NEW – for the click-to-open modal
  const [modalItem,   setModalItem]   = useState(null);
  const [isModalOpen, setModalOpen]   = useState(false);
  const openModal  = (item) => { setModalItem(item); setModalOpen(true); };
  const closeModal = ()    => { setModalOpen(false); setModalItem(null); };

  const saveLook = async (lookObj) => {
    try {
      await fetch(`${BASE_URL}/feedback`, {
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

  // 🔎 Wardrobe indexes for fast matching
  // 🔎 Wardrobe indexes for fast matching
  // 🔎 Wardrobe indexes for fast matching
  const WARDROBE_BY_ID = useMemo(() => {
    const m = new Map();
    for (const w of items) {
      // canonical id (Firestore doc id)
      if (w.id) m.set(String(w.id), w);

      // older field, same doc id
      if (w.doc_id) m.set(String(w.doc_id), w);

      // strict idx mapping
      if (w.idx != null) m.set(`idx:${String(w.idx)}`, w);
    }
    return m;
  }, [items]);



  const WARDROBE_BY_URL = useMemo(() => {
    const m = new Map();
    for (const w of items) if (w.image_url) m.set(normalizeUrl(w.image_url), w);
    return m;
  }, [items]);

  const WARDROBE_BY_PATH = useMemo(() => {
    const m = new Map();
    for (const w of items) if (w.image_path) m.set(String(w.image_path), w);
    return m;
  }, [items]);

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
    function onDocClick(e) {
      // Any click not on a swap menu/button closes it
      const el = e.target;
      if (!el.closest) return;
      if (!el.closest(".look-actions")) if (typeof setSwapOpenIdx === "function") setSwapOpenIdx(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // ── Frontend-only onboarding gate (opens modal when prefs are missing + not dismissed) ──
  useEffect(() => {
    if (!user?.uid) {
      setOnboardingOpen(false);
      return;
    }

    const dismissedKey = `wow_welcome_dismissed_${user.uid}`;
    const wasDismissed = localStorage.getItem(dismissedKey) === "true";

    if (!loadingPrefs && needsOnboarding && !wasDismissed) {
      setOnboardingOpen(true);
    }

    if (!loadingPrefs && !needsOnboarding) {
      setOnboardingOpen(false);
    }
  }, [user?.uid, loadingPrefs, needsOnboarding]);

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
      setUserPrefs({
  ...data,
  dislikes: data.dislikes || [],
});   // ✅ save prefs including dislikes

    })
    .catch(err => {
      console.error("❌ Error fetching onboarding:", err);
      setNeedsOnboarding(true);
    })
    .finally(() => setLoadingPrefs(false));

  }, [user]);



      useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
          console.log("AUTH STATE:", firebaseUser ? firebaseUser.uid : null);
          setUser(firebaseUser);
      if (firebaseUser) {
        console.log("🔥 Your UID is:", firebaseUser.uid);
        Promise.allSettled([fetchItems(firebaseUser.uid), fetchTodayPlan(firebaseUser.uid)])
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
        });
          return () => unsubscribe();
        }, []);


  // Fetch staples from backend (list of individual items)
  useEffect(() => {
    const fetchStaples = async () => {
      if (!user?.uid || !userPrefs.gender) {
        console.log("Staples fetch skipped - uid:", user?.uid, "gender:", userPrefs.gender);
        return;
      }
      try {
        const genderParam = userPrefs.gender.toLowerCase();
        console.log("Fetching staples for gender:", genderParam);
        const res = await fetch(`${BASE_URL}/staples?gender=${genderParam}`);
        if (!res.ok) { setStaples([]); return; }
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.staples || []);
        console.log("Staples received:", list.length, "items for", genderParam);
        setStaples(list);

      } catch (err) {
        console.error("Failed to fetch staples:", err);
        setStaples([]);
      }
    };

    fetchStaples();
  }, [user?.uid, userPrefs.gender]);


  


  const isInAppBrowser = () => {
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    const isStandalone = window.navigator.standalone;
    const isUIWebView = /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua);
    const isAndroidWebView = /wv|WebView/i.test(ua);
    const isFacebookApp = /FBAN|FBAV/i.test(ua);
    const isInstagram = /Instagram/i.test(ua);
    const isWhatsApp = /WhatsApp/i.test(ua);
    const isTwitter = /Twitter/i.test(ua);
    const isSnapchat = /Snapchat/i.test(ua);
    const isLine = /Line\//i.test(ua);
    const isTelegram = /Telegram/i.test(ua);
    
    const result = isUIWebView || isAndroidWebView || isFacebookApp || isInstagram || 
                   isWhatsApp || isTwitter || isSnapchat || isLine || isTelegram;
    console.log("In-app browser check:", result, "UA:", ua.substring(0, 100));
    return result;
  };

  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const handleLogin = async () => {
    try {
      console.log("LOGIN CLICK");
      
      if (isInAppBrowser()) {
        const currentUrl = window.location.href;
        alert("Please open this app in your regular browser (Chrome/Safari) for login to work.\n\nTap the menu (⋮ or ⋯) and select 'Open in Browser'");
        return;
      }

      console.log("Using popup auth");
      const result = await signInWithPopup(auth, provider);
      console.log("LOGIN SUCCESS:", result?.user?.uid);
    } catch (err) {
      console.error("Login failed:", err?.code, err?.message);
      if (err?.code === "auth/popup-blocked") {
        alert("Popup was blocked. Please allow popups for this site, or try opening in a different browser.");
      } else if (err?.code === "auth/popup-closed-by-user") {
        console.log("User closed the popup");
      } else if (err?.code === "auth/unauthorized-domain") {
        alert("This domain is not authorized. Please contact the app administrator.");
      } else {
        alert(`Login failed: ${err?.message || "Unknown error"}. Try opening in Chrome or Safari.`);
      }
    }
  };


  const fetchTodayPlan = async (uid) => {
    try {
      const date = new Date().toISOString().split("T")[0];
      const res = await fetch(`${BASE_URL}/plan-outfit?uid=${uid}&date=${date}`);

      if (!res.ok) {
        setTodayPlan(null);
        return;
      }

      const data = await res.json();

      // Backend might return:
      // 1) { outfit: {...} }
      // 2) { look: {...} }
      // 3) outfit object directly
      const outfitObj = data?.outfit || data?.look || data || {};


      // ✅ Only treat it as a "real plan" if it has items
      const hasItems = Array.isArray(outfitObj?.items) && outfitObj.items.length > 0;

      setTodayPlan(hasItems ? { outfit: outfitObj } : { outfit: { items: [] } });

    } catch (e) {
      console.error("Error fetching today plan:", e);
      setTodayPlan(null);
    }
  };

  // Track if we've already generated a suggestion this session
  const [hasGeneratedThisSession, setHasGeneratedThisSession] = useState(false);

  // Auto-generate outfit suggestion on every login/refresh
  useEffect(() => {
    const hasWardrobe = items.length > 0;
    const isReady = user?.uid && userPrefs.gender && !loadingPrefs && !autoSuggestLoading;
    
    const onHome = activeTab === "home";

    // ✅ Only auto-suggest on Home + only if no saved plan exists
    if (onHome && hasWardrobe && isReady && !hasTodayPlan && !hasGeneratedThisSession) {

      console.log("Auto-generating fresh outfit for today...");
      setHasGeneratedThisSession(true);
      setAutoSuggestLoading(true);
      
      // Get user's location for weather-appropriate suggestions
      const getLocationAndSuggest = async () => {
        let userCity = city;
        
        try {
          // Try to get user's location
          if (navigator.geolocation) {
            const position = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            
            // Reverse geocode to get city name
            const { latitude, longitude } = position.coords;
            const geoRes = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
            );
            const geoData = await geoRes.json();
            userCity = geoData.address?.city || geoData.address?.town || geoData.address?.state || city;
            setCity(userCity);
          }
        } catch (err) {
          console.log("Location not available, using default city:", city);
        }
        
        try {
          const res = await fetch(`${BASE_URL}/suggest-outfit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              uid: user.uid,
              city: userCity,
              wardrobe: items.map((w) => ({
                wardrobe_id: String(w.id),
                id: String(w.id),
                image_url: w.image_url,
                name: w.displayName || w.name || "",
                category: w.category || "",
                color: w.color || "",
              })),
              profile: {
                gender: userPrefs.gender,
                bodyShape: userPrefs.bodyShape,
                complexion: userPrefs.complexion
              },
              constraints: `Smart casual everyday look for ${new Date().toISOString().slice(0, 10)}. Make it feel fresh, avoid repeating the same outerwear/shoes combo.`,

            }),
          });
          
          const rawText = await res.text();
          let clean = rawText.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
          
          let data;
          try {
            data = JSON.parse(clean);
          } catch {
            data = { looks: [] };
          }
          
          // Extract the first look
          const looks = data.looks || (data.look ? [data.look] : []) || (data.outfits || []);
          if (looks.length > 0) {
            const firstLook = looks[0];
            setAutoSuggestedOutfit({
              ...firstLook,
              style_note: firstLook.style_note || "Tina's suggestion for today",
              isSuggestion: true
            });
            console.log("Auto-suggestion ready:", firstLook);
          }
        } catch (err) {
          console.error("Auto-suggestion failed:", err);
        } finally {
          setAutoSuggestLoading(false);
        }
      };
      
      getLocationAndSuggest();
    }
  }, [
    items,
    user?.uid,
    userPrefs.gender,
    loadingPrefs,
    hasGeneratedThisSession,
    autoSuggestLoading,
    city,
    activeTab,
    hasTodayPlan
  ]);



  const fetchItems = async (uid) => {
    try {
      const res = await fetch(`${BASE_URL}/wardrobe?uid=${uid}`);
      const text = await res.text();
      const data = JSON.parse(text);

      const withUrls = (Array.isArray(data) ? data : []).map((item, idx) => {
        // ✅ Always compute a stable image_url
        let imageUrl = item.image_url;
        if (!imageUrl && item.image_path) {
          const bucket = "wowapp1406.appspot.com";
          imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
            item.image_path
          )}?alt=media`;
        }

        // ✅ Canonical Firestore doc id
        const docId = String(item.doc_id || item.firestoreId || item.id || "");

        return {
          ...item,

          // ✅ IMPORTANT: UI canonical id is Firestore doc id
          id: docId,

          // keep doc_id for backwards compatibility
          doc_id: docId,

          // idx (if present); else we can store undefined (don't invent)
          idx: item.idx != null ? String(item.idx) : undefined,

          // always have a public image_url
          image_url: imageUrl,

          displayName:
            item.primaryTag ||
            formatLabel(item.name || item.category || "Unnamed"),
        };
      });

      setItems(withUrls);
    } catch (e) {
      console.error(" Error fetching wardrobe:", e.message);
      setItems([]);
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
  // -----------------------------
  // Multi-upload queue (safe sequential processing)
  // -----------------------------
  const detectSingleFile = async (oneFile) => {
    if (!oneFile || !user) return;

    setBusyDetecting(true);

    const uniqueName = `${user.uid}/${Date.now()}_${oneFile.name}`;
    const storageRef = ref(storage, `wardrobe/${uniqueName}`);

    try {
      await uploadBytes(storageRef, oneFile);

      const imageUrl = await getDownloadURL(storageRef);
      const storagePath = storageRef.fullPath;

      const res = await fetch(`${BASE_URL}/auto-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("❌ Auto-tag failed:", text);
        alert("Auto-tagging failed for this photo. Try another image.");
        setDetectedItems([]);
        return;
      }

      const data = await res.json();
      const tagged = (data.detectedItems || data.detected || []).map((obj) => ({
        ...obj,
        approved: true,
        imagePath: storagePath, // ✅ always stored
        image_url: imageUrl,    // ✅ always stored
      }));

      setDetectedItems(tagged);
    } catch (err) {
      console.error("Upload/detect error:", err);
      alert("Something went wrong during upload/detection.");
      setDetectedItems([]);
    } finally {
      setBusyDetecting(false);
    }
  };

  const startDetectionQueue = async () => {
    if (!user?.uid) {
      alert("Please login first.");
      return;
    }

    const chosen = (files && files.length) ? files : (file ? [file] : []);
    if (!chosen.length) {
      alert("Please select at least one photo.");
      return;
    }

    setFileQueue(chosen);
    setActiveFile(chosen[0]);
    setDetectedItems([]);
    setOpenEditors({});
    await detectSingleFile(chosen[0]);
  };

  const goNextPhoto = async () => {
    setDetectedItems([]);
    setOpenEditors({});

    setFileQueue((prev) => {
      const remaining = prev.slice(1);

      if (remaining.length === 0) {
        setActiveFile(null);
        setFiles([]);
        setFile(null);
        alert("✅ All photos processed!");
        return [];
      }

      setActiveFile(remaining[0]);
      // run detection for next photo
      detectSingleFile(remaining[0]);
      return remaining;
    });
  };

  const skipCurrentPhoto = async () => {
    if (!activeFile) return;

    // Clear current detections and move on
    await goNextPhoto();
  };

  const toggleItemApproval = (index) => {
    const updated = [...detectedItems];
    updated[index].approved = !updated[index].approved;
    setDetectedItems(updated);
  };

  const toggleEditor = (index) => {
    setOpenEditors((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleDetectedChange = (index, field, value) => {
    setDetectedItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        if (field === "tags") {
          const arr = value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          return { ...it, tags: arr, _tagsInput: value };
        }
        return { ...it, [field]: value };
      })
    );
  };

  const openEditDetected = (index) => {
    const it = detectedItems[index] || {};
    setEditItemIndex(index);
    setEditForm({
      name: it.name || "",
      category: it.category || "",
      color: it.color || "",
      // show tags as a comma-separated string for the input
      tags: Array.isArray(it.tags) ? it.tags.join(", ") : (it.tags || "")
    });
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
            image_path: item.imagePath || item.image_path || "",
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
      fetchItems(user.uid); // refresh wardrobe

      // ✅ continue to next selected photo (if any)
      await goNextPhoto();

    } catch (err) {
      console.error(" Error saving selected items:", err);
      alert("Something went wrong while saving wardrobe items.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try {
      const res = await fetch(`${BASE_URL}/wardrobe/${id}?uid=${user.uid}`, {
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
      showToast(` Failed to add ${stapleName}`);
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
      setSearchResults(Array.isArray(data?.products) ? data.products : (Array.isArray(data?.items) ? data.items : []));


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
          showToast(" Failed to save product");
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

  // Get unique outfit ID
  function getLookOutfitId(look, idx = 0) {
    return (
      look?.outfit_id ||
      look?.outfitId ||
      look?.id ||
      `outfit_${Date.now()}_${idx}`
    );
  }

  // ——— Swap helpers ———
  function groupOf(category = "", name = "") {
    // Normalize to canonical bucket labels first
    const norm = normalizeCategoryFront(category, name).toLowerCase();

    if (/dress|gown|jumpsuit|saree|lehenga|anarkali/.test(norm)) return "dress";
    if (/footwear|shoe|sandal|heel|sneaker|jutti|boot/.test(norm)) return "footwear";
    if (/bag|handbag|tote|purse|clutch/.test(norm)) return "bag";
    if (/bottom|jeans|pants|trouser|skirt|shorts|palazzo|salwar|gharara|sharara|dhoti/.test(norm)) return "bottom";

    // Treat outerwear as top-slot for swap purposes (unless you want an explicit "outer" group later)
    if (/outerwear|blazer|jacket|coat|suit/.test(norm)) return "top";

    return "top";
  }


  function buildSwapInstruction(baseLook, targetGroup) {
    // lock everything that is NOT the target group
    const keepIds = (baseLook?.items || [])
      .filter(p => groupOf(p.category, p.name) !== targetGroup)
      .map(p => String(p.id))
      .filter(Boolean);

    // polite + explicit for the agent:
    return [
      `Swap only the ${targetGroup.toUpperCase()}.`,
      `Keep all other items identical (lock these wardrobe ids): ${keepIds.join(", ") || "none"}.`,
      `Use ONLY real wardrobe items; do not invent.`,
      `Respect same occasion and vibe.`
    ].join(" ");
  }

  // single entry point for swap
  async function handleSwap(baseLook, targetGroup) {
    if (!user?.uid) return;

    const lockedIds = (baseLook?.items || [])
      .filter(p => groupOf(p.category, p.name) !== targetGroup)
      .map(p => String(p.id))
      .filter(Boolean);

    // ✅ LOG SWAP action to Firestore
    try {
      await logOutfitFeedback({
        uid: user.uid,
        occasion,
        vibe,
        action: "swap",
        outfit_id: getLookOutfitId(baseLook, 0),
        items: (baseLook?.items || []).map((it) => ({
          wardrobe_id: String(it.id),
          name: it.name || "",
          category: it.category || "",
        })),
        reason_tags: [],
        meta: { swap_target: targetGroup, locked_ids: lockedIds },
      });
      console.log("✅ swap feedback saved");
    } catch (e) {
      console.error("❌ swap feedback failed:", e);
    }

    const instruction = [
      `Swap only the ${targetGroup.toUpperCase()}.`,
      `Keep all other items IDENTICAL (locked wardrobe ids): ${lockedIds.join(", ") || "none"}.`,
      `Use ONLY real wardrobe items; do not invent.`,
      `Respect same occasion and vibe.`
    ].join(" ");

    setSwapOpenIdx?.(null);

    await suggestOutfitAgent({
      uid: user.uid,
      city,
      wardrobe: items,
      occasion,
      vibe,
      constraints: instruction,
      swapTarget: targetGroup,
      lockedIds,
      baseLook
    });
  }


  // Turn a look into buckets
  function bucketByGroup(items = []) {
    const out = { top: [], bottom: [], footwear: [], bag: [], dress: [], other: [] };
    for (const it of items) {
      const g = groupOf(it.category);
      if (out[g]) out[g].push(it);
      else out.other.push(it);
    }
    return out;
  }

  // Enforce locks: keep every group except targetGroup from baseLook; take targetGroup from newLook
  function applyLocks(baseLook, newLook, targetGroup) {
    const baseB = bucketByGroup(baseLook.items || []);
    const newB  = bucketByGroup(newLook.items  || []);
    const result = [];

    // keep all locked groups exactly as-is
    for (const g of ["top","bottom","bag","dress"]) {
      if (g === targetGroup) continue;
      result.push(...baseB[g]);
    }
    // footwear is also locked unless it's the target
    if (targetGroup !== "footwear") result.push(...baseB.footwear);

    // now inject the swapped group from the new look
    const swapped = newB[targetGroup] && newB[targetGroup].length ? newB[targetGroup] : baseB[targetGroup];
    result.push(...swapped);

    // keep any 'other' (belts/scarves etc.) from base
    result.push(...baseB.other);

    // dedupe by id to avoid doubles
    const seen = new Set();
    return result.filter(it => {
      const key = String(it.id || it.image_url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }


  // One-tap regenerate variants (swap a piece / change just shoes etc.)
  async function handleRegenerate(baseLook, intent = "") {
    if (!user?.uid) return;

    const constraintHints = {
      "swap-top": "Keep everything same but replace the TOP with a different option from the same wardrobe.",
      "change-shoes": "Swap only the FOOTWEAR. Keep all other items identical. Use ONLY real wardrobe items.",
      "cooler": "Keep the vibe, make it cooler-weather appropriate with layers.",
      "warmer": "Keep the vibe, make it warmer-weather appropriate with lighter fabrics.",
    };

    await suggestOutfitAgent({
      uid: user.uid,
      city,
      wardrobe: items,
      occasion,
      vibe,
      // pass a soft instruction for the agent
      constraints: constraintHints[intent] || ""
    });
  }

  async function suggestOutfitAgent(options = {}) {
  const { uid, city, wardrobe, occasion, vibe, constraints = "", swapTarget, lockedIds = [], baseLook } = options;



       if (!uid) return;

    setStylistLoading(true);

       console.log("🟢 Sending to Tina agent:", options);
    console.log("🟣 Payload to Tina:", { uid, city, wardrobe, occasion, vibe, constraints });




       try {
         const res = await fetch(`${BASE_URL}/suggest-outfit`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ 
             uid,
             city,
               wardrobe: (wardrobe || items).map((w) => ({
               wardrobe_id: String(w.id),                 // ✅ Firestore doc id
               id: String(w.id),                          // backward compat
               idx: w.idx != null ? String(w.idx) : undefined,
               image_url: w.image_url,
               name: w.displayName || w.name || "",
               category: w.category || "",
               color: w.color || "",
             })),

  profile: {
               gender: userPrefs.gender,
               bodyShape: userPrefs.bodyShape,
               complexion: userPrefs.complexion
             },
             constraints,
             locked_ids: lockedIds,       // 👈 NEW (backend may honor)
               swap_target: swapTarget      // 👈 NEW (backend may honor)
           }),
           });

         const rawText = await res.text();
         console.log("🎯 Tina agent result (raw from backend):", rawText);

         let clean = rawText.trim();
         // Strip any code fences (```json ... ```)
         clean = clean
           .replace(/^```(?:json)?/i, "")
           .replace(/```$/i, "")
           .trim();


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

         
         if (!data.looks && Array.isArray(data.outfits)) {
           data.looks = data.outfits;
         }

         if (!data.looks || !Array.isArray(data.looks)) {
           console.warn("⚠️ Tina returned invalid schema:", data);
           setOutfit([]);
           return;
         }


         const preparedLooks = (data.looks || []).map((look, idx) => {
           const mappedItems = (look.items || [])
           .map((it, i) => {
             const tinaId = it.wardrobe_id ?? it.wardrobeId ?? it.item_id ?? it.doc_id ?? it.id;
             const tinaIdx = it.idx ?? it.index ?? it.wardrobe_idx;
             const tinaPath = it.image_path ?? it.imagePath ?? "";
             const tinaUrl = it.image_url ?? it.image_uri ?? it.image ?? it.url ?? "";

             let w = null;

             // 1) Strict ID match (best)
             if (tinaId != null) {
               w = WARDROBE_BY_ID.get(String(tinaId)) || null;
             }

             // 2) Strict IDX match fallback (still strict, not fuzzy)
             if (!w && tinaIdx != null) {
               w = WARDROBE_BY_ID.get(`idx:${String(tinaIdx)}`) || null;
             }

             // 3) image_path match
             if (!w && tinaPath) {
               w = WARDROBE_BY_PATH.get(String(tinaPath)) || null;
             }

             // 4) If strict id match fails, try exact normalized URL match (NOT fuzzy).
             if (!w && tinaUrl) {
               const key = normalizeUrl(tinaUrl);
               w = WARDROBE_BY_URL.get(key) || null;
             }

             // If still no match, allow rendering as "inspiration/staple" (so 5 items show, not 3)
             if (!w) {
               const canRenderFromUrl = !!tinaUrl && String(tinaUrl).startsWith("http");
               const looksLikeStaple =
                 /staples/i.test(String(tinaUrl || "")) ||
                 /staple/i.test(String(it?.source || "")) ||
                 it?.is_staple === true;

               console.warn("🧨 Tina item not matched to wardrobe:", {
                 tinaId: tinaId != null ? String(tinaId) : null,
                 tinaIdx: tinaIdx != null ? String(tinaIdx) : null,
                 tinaPath,
                 tinaUrl: tinaUrl ? normalizeUrl(tinaUrl) : null,
                 looksLikeStaple,
                 tinaItem: it,
               });

               // Render staples/inspiration instead of dropping
               if (canRenderFromUrl && looksLikeStaple) {
                 return {
                   id: it.wardrobe_id || it.id || `insp-${idx}-${i}`,
                   name: it.name || it.title || "Extra piece",
                   category: it.category || "",
                   color: it.color || "",
                   image_url: tinaUrl,
                   tags: Array.isArray(it.tags) ? it.tags : [],
                   source: "inspiration", // will show a badge if you want
                 };
               }

               // otherwise keep strict behavior
               return null;
             }


             return {
               id: w.id,
               name: w.displayName || w.name || it.name || (w.category ? formatLabel(w.category) : `Item ${i + 1}`),
               category: w.category || it.category || "",
               color: w.color || it.color || "",
               image_url: w.image_url,
               tags: Array.isArray(w.tags) ? w.tags : [],
               source: "wardrobe",
             };
           })
           .filter(Boolean);

           console.log("🧮 Item counts:", {
             tinaReturned: (look.items || []).length,
             matchedWardrobe: mappedItems.length,
           })

           if ((look.items || []).length !== mappedItems.length) {
             console.warn("🧨 DROPPED items due to no strict match:", {
               returnedByBackend: look.items,
               matchedOnClient: mappedItems
             });
           }
           console.log("🧩 Tina->UI mapping", {
             tina: (look.items || []).map(x => ({ id: x.id, wardrobe_id: x.wardrobe_id, idx: x.idx, image_url: x.image_url, name: x.name })),
             rendered: mappedItems.map(x => ({ id: x.id, image_url: x.image_url, name: x.name }))
           });

           const { title, note } = sanitizeCopy(
             look.title || `Look ${idx + 1}`,
             look.style_note || "Suggested look",
             mappedItems
           );

           const validation = look.validation?.styleRules || null;

               const stableOutfitId =
             look.outfit_id ||
             look.outfitId ||
             `outfit_${feedbackSessionIdRef.current}_${idx}`;

           return {
             outfit_id: stableOutfitId, // ✅ stable per look in this session
             title,
             style_note: note,
             trends_used: look.trends_used || [],
             validation,
             items: mappedItems,
           };
      });


         // If this was a swap request, hard-enforce locks on the client
         let patchedLooks = preparedLooks;
         if (swapTarget && baseLook && Array.isArray(preparedLooks)) {
           patchedLooks = preparedLooks.map((lk) => ({
             ...lk,
             items: applyLocks(baseLook, lk, swapTarget)
           }));
         }

         const finalLooks = (patchedLooks || []).filter(
           l => Array.isArray(l.items) && l.items.length > 0
         );
         setOutfit(finalLooks);



         if (preparedLooks.length === 0) {
            alert("No complete looks could be made from the current wardrobe. Try adding footwear (and a bag for women) or switch the occasion.");
          }

       } catch (err) {
         console.error("❌ Tina agent failed:", err);
         alert("Tina agent could not generate looks.");
       } finally {
         setStylistLoading(false);
       }

     }






  async function suggestPinterestOutfits({ uid, occasion, city, weather }) {
    const res = await fetch(`${BASE_URL}/pinterest-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, occasion, city, weather }),
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
  dislikes: userPrefs.dislikes || [],   // ✅ new
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
          items: dedupe(
            (look.items || [])
              .map((it, i) => {
                const tinaUrl = it.image_url || it.image || "";
                const tinaId  = it.wardrobe_id ?? it.item_id ?? it.id ?? it.idx;
                const tinaPath = it.image_path ?? it.imagePath ?? "";

                let w = null;
                // 1) ID match
                if (tinaId != null) w = WARDROBE_BY_ID.get(String(tinaId));
                // 2) image_path match
                if (!w && tinaPath) w = WARDROBE_BY_PATH.get(String(tinaPath));
                // 3) URL match (normalized)
                if (!w && tinaUrl) {
                  const key = normalizeUrl(tinaUrl);
                  w = WARDROBE_BY_URL.get(key) || items.find((wi) => wi.image_url && sameImage(wi.image_url, tinaUrl));
                }

                if (!w && !SHOW_INSPIRATION) return null;

                if (w) {
                  console.debug("✅ Matched Tina item to wardrobe", {
                    tinaId, tinaUrl: normalizeUrl(tinaUrl),
                    matchedId: w.id,
                    matchedUrl: normalizeUrl(w.image_url)
                  });
                }

                return w
                ? {
                    id: w.id,
                    name: w.displayName || w.name || it.name || (w.category ? formatLabel(w.category) : `Item ${i + 1}`),
                    category: w.category || it.category || "",
                    color: w.color || it.color || "",
                    image_url: w.image_url,
                    tags: Array.isArray(w.tags) ? w.tags : [],
                    source: "wardrobe",
                  }
                : {
                      id: it.id || `insp-${i}`,
                      name: it.name || "Inspiration",
                      category: it.category || "",
                      color: it.color || "",
                      image_url: tinaUrl,
                      tags: Array.isArray(it.tags) ? it.tags : [],
                      source: "inspiration",
                    };
              })
              .filter(Boolean)
          ),
        }))
      );
    }
  }

  // 🔸 remove any exact-duplicate items (same image_url)
  function dedupe(list = []) {
    const map = new Map();
    list.forEach((it) => {
      const key = String(it.id || normalizeUrl(it.image_url) || Math.random());
      map.set(key, it);
    });
    return [...map.values()];
  }


  // ✅ What counts as a complete look on the client (belt/jewelry optional)
  function isCompleteLook(look = {}) {
    const cats = (look.items || []).map(p => (p.category || "").toLowerCase());
    const hasTop = cats.some(c => /top|shirt|tee|t-?shirt|blouse|kurta|kameez|choli|outer|blazer|jacket|coat/.test(c));


    const hasBottom = cats.some(c => /bottom|jeans|pants|trouser|skirt|shorts|palazzo|salwar|gharara|sharara|dhoti/.test(c));

    const hasFootwear  = cats.some(c => /footwear|shoe|sandal|heel|sneaker|jutti|boot/.test(c));
    const hasOnePiece  = cats.some(c => /dress|jumpsuit|saree|lehenga|gown|anarkali/.test(c));

    const onlyAccessories = cats.length > 0 && cats.every(c => /accessor|sunglass|watch|bag|belt|scarf|dupatta|stole|shawl/.test(c));
    return !onlyAccessories && ((hasTop && hasBottom && hasFootwear) || (hasOnePiece && hasFootwear));
  }

  // ✅ Keep title/note honest if model copy drifts (belt/jewelry wording is okay)
  function sanitizeCopy(title = "", note = "", items = []) {
    const text = `${title} ${note}`.toLowerCase();
    const cats = items.map(it => (it.category || "").toLowerCase());
    const haveDress    = cats.some(c => /dress|jumpsuit|gown/.test(c));
    const haveHeels    = cats.some(c => /heel/.test(c)) && cats.some(c => /footwear|shoe|sandal|heel|sneaker|jutti|boot/.test(c));
    let safeTitle = title;
    let safeNote  = note;

    if (!haveDress && /dress|gown/.test(text)) {
      safeTitle = safeTitle.replace(/dress|gown/ig, "look");
      safeNote  = safeNote.replace(/dress|gown/ig, "outfit");
    }
    if (!haveHeels && /heels?/.test(text)) {
      safeNote  = safeNote.replace(/heels?/ig, "footwear");
    }

    // If copy is now too vague, add factual pieces summary
    const names = items.map(h => h.name || h.category || "").filter(Boolean);
    if (!/top|bottom|footwear|dress|jumpsuit|outer/i.test(safeNote)) {
      safeNote = `${safeNote ? safeNote + " " : ""}Pieces: ${names.slice(0,3).join(", ")}.`;
    }

    return { title: safeTitle.trim() || "Polished Look", note: safeNote.trim() };
  }

  // ✅ Badge helpers to show what was auto-added by backend
  function hasBag(items = []) {
    return items.some(i => /(bag|handbag|tote|purse)/i.test((i.name||i.category||"")));
  }
  function hasBelt(items = []) {
    return items.some(i => /belt/i.test((i.name||"")));
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

      <OnboardingModal
        open={!!user && onboardingOpen}
        uid={user?.uid}
        userPrefs={userPrefs}
        onClose={() => setOnboardingOpen(false)}
        onSavePrefs={async (prefs) => {
          const res = await fetch(`${BASE_URL}/onboarding`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid: user.uid, ...prefs }),
          });
          if (!res.ok) throw new Error("Failed to save");
          setUserPrefs((prev) => ({ ...prev, ...prefs }));
          setNeedsOnboarding(false);
          setOnboardingOpen(false);
        }}
        bodyShapeAssets={bodyShapeAssets}
        assetsLoading={assetsLoading}
        setBodyShapeAssets={setBodyShapeAssets}
        setAssetsLoading={setAssetsLoading}
      />

      


      {/* Main Content */}
      <main className="app-main wow-has-bottom-nav">

        {!user ? (
          <div className="section text-center">
            <h1 className="section-title">Welcome to W.O.W. – Your AI Stylist Assistant</h1>
            <p style={{ fontSize: '1.125rem', color: 'var(--neutral-600)', marginBottom: 'var(--spacing-xl)' }}>
              Your personal wardrobe assistant. Please login to continue.
            </p>
            <button className="btn btn-accent" onClick={handleLogin}>
              Login with Google
            </button>
          </div>
        ) : (
          <>

            {activeTab === "home" && (
              <>
                <HomeDashboard
                  user={user}
                  items={items}
                  todayPlan={todayPlan?.outfit?.items ? todayPlan : { outfit: { items: [] } }}
                  onGo={(tab) => setActiveTab(tab)}
                  autoSuggestedOutfit={autoSuggestedOutfit}
                  autoSuggestLoading={autoSuggestLoading}
                  onSaveSuggestion={async (look) => {
                    if (!user?.uid || !look?.items?.length) return;
                    try {
                      const date = new Date().toISOString().split("T")[0];
                      const res = await fetch(`${BASE_URL}/plan-outfit`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          uid: user.uid,
                          date,
                          outfit: {
                            items: look.items,
                            style_note: look.style_note || "Tina's Smart Casual suggestion"
                          }
                        })
                      });
                      if (res.ok) {
                        setTodayPlan({ outfit: look });
                        setAutoSuggestedOutfit(null);
                        alert("Saved to today's plan!");
                      }
                    } catch (err) {
                      console.error("Failed to save suggestion:", err);
                      alert("Could not save. Please try again.");
                    }
                  }}
                />

                {/* 🔥 Trends below the dashboard */}
                {SHOW_TRENDS && (
                  <section className="section" style={{ marginTop: "1rem" }}>
                    <TrendsPanel initialQuery="general" initialLimit={8} />
                  </section>
                )}

              </>
            )}


            {activeTab === "upload" && (
            <section className="section upload-page">

            <h2 className="section-title">Add to Wardrobe</h2>
            <p className="section-description">Upload photos, add staples, or search for items</p>
            
            {/* 1. Upload / Camera Section */}
            <div className="upload-section">
              <div 
                className="section-header"
                onClick={() => setUploadExpanded(!uploadExpanded)}
              >
                <h3 className="section-subtitle">Upload / Camera</h3>

                <span className={`expand-icon ${uploadExpanded ? 'expanded' : ''}`}>▼</span>
              </div>
              
              {uploadExpanded && (
                <div className="section-content">
                  <div className="upload-methods">
                    <label className="upload-card">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const picked = Array.from(e.target.files || []);
                          setFiles(picked);
                          setFile(picked[0] || null); // keep preview working
                        }}
                        className="upload-input"
                      />

                      <div className="upload-card__top">
                        <div className="upload-card__title">Browse</div>
                        <div className="upload-card__sub">Choose from your device</div>
                      </div>
                      <div className="upload-card__cta">Select photo</div>
                    </label>

                    <label className="upload-card">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          const picked = Array.from(e.target.files || []);
                          setFiles(picked);           // camera typically gives 1, but keep consistent
                          setFile(picked[0] || null);
                        }}
                        className="upload-input"
                      />

                      <div className="upload-card__top">
                        <div className="upload-card__title">Camera</div>
                        <div className="upload-card__sub">Take a new photo</div>
                      </div>
                      <div className="upload-card__cta">Open camera</div>
                    </label>
                  </div>


                  
                      {file && (
                        <div className="upload-preview">
                          {activeFile && (
                            <div className="muted" style={{ marginBottom: 8 }}>
                              Processing: <b>{activeFile.name}</b>{" "}
                              {fileQueue?.length ? `(${(files.length - fileQueue.length + 1)} / ${files.length})` : ""}
                            </div>
                          )}

                          <img
                            src={URL.createObjectURL(activeFile || file)}
                            alt="Preview"
                            className="preview-image"
                          />

                      <button 
                        className="btn btn-primary"
                        onClick={startDetectionQueue}
                        disabled={busyDetecting}
                        style={{ marginTop: "var(--spacing-md)" }}
                      >
                        {busyDetecting ? "Detecting…" : uiCopy.upload.detectBtn}
                      </button>

                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Detected Items Results */}
            {detectedItems.length > 0 && (
              <div className="upload-results">
                <h3 className="section-subtitle">{uiCopy.upload.detectedTitle}</h3>


                    <div className="detected-items">
                      {detectedItems.map((item, i) => (
                        <div key={i} className="detected-item card">
                          {/* Image + checkbox */}
                          <div className="detected-item-image">
                            <img src={item.image_url} alt={item.name} className="preview-image" />
                            <div className="checkbox-overlay">
                              <input
                                type="checkbox"
                                checked={!!item.approved}
                                onChange={() => toggleItemApproval(i)}
                                className="item-checkbox"
                                aria-label="Select item for saving"
                              />
                            </div>
                          </div>

                          {/* Content */}
                          <div className="detected-item-content">
                            <div className="detected-item-title-row">
                              <h4 className="detected-item-title">{item.name || "Unnamed"}</h4>
                              <button
                                type="button"
                                className="linklike small"
                                onClick={() => toggleEditor(i)}
                                aria-expanded={!!openEditors[i]}
                              >
                                {openEditors[i] ? "Done" : "✏️ Edit"}
                              </button>
                            </div>

                            {/* Read view */}
                            {!openEditors[i] && (
                              <p className="detected-item-details">
                                {(item.category || "—")} •{" "}
                                <span className="color-highlight">{item.color || "—"}</span>
                              </p>
                            )}

                            {/* Inline editor */}
                            {openEditors[i] && (
                              <div className="detected-editor">
                                <div className="form-row">
                                  <label className="form-label">Name</label>
                                  <input
                                    className="form-input"
                                    type="text"
                                    value={item.name || ""}
                                    onChange={(e) => handleDetectedChange(i, "name", e.target.value)}
                                    placeholder="e.g., T-shirt"
                                  />
                                </div>

                                <div className="form-row">
                                  <label className="form-label">Category</label>
                                  <input
                                    className="form-input"
                                    type="text"
                                    value={item.category || ""}
                                    onChange={(e) => handleDetectedChange(i, "category", e.target.value)}
                                    placeholder="e.g., Clothing/Upper"
                                  />
                                </div>

                                <div className="form-row">
                                  <label className="form-label">Color</label>
                                  <input
                                    className="form-input"
                                    type="text"
                                    value={item.color || ""}
                                    onChange={(e) => handleDetectedChange(i, "color", e.target.value)}
                                    placeholder="e.g., White"
                                  />
                                </div>

                                <div className="form-row">
                                  <label className="form-label">Tags</label>
                                  <input
                                    className="form-input"
                                    type="text"
                                    value={
                                      item._tagsInput ??
                                      (Array.isArray(item.tags)
                                        ? item.tags.join(", ")
                                        : item.tags || "")
                                    }
                                    onChange={(e) => handleDetectedChange(i, "tags", e.target.value)}
                                    placeholder="comma, separated, tags"
                                  />
                                </div>

                                <p className="muted" style={{ marginTop: 6 }}>
                                  These edits will be used when saving to your wardrobe.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                <div className="upload-results-actions">
                  <button
                    className="btn btn-primary"
                    onClick={confirmSelectedItems}
                    disabled={busyDetecting}
                  >
                    {uiCopy.upload.addSelectedBtn}
                  </button>

                  <button
                    type="button"
                    className="skip-link"
                    onClick={skipCurrentPhoto}
                    disabled={busyDetecting}
                  >
                    Skip this photo
                  </button>
                </div>
              </div>
            )}

            {/* 2. Quick Add Staples Section */}
              <div className="upload-section quickadd-section">

              <div
                className="section-header"
                onClick={() => setQuickAddExpanded(!quickAddExpanded)}
              >
                <h3 className="section-subtitle"> Quick Add Staples</h3>
                <span className={`expand-icon ${quickAddExpanded ? 'expanded' : ''}`}>▼</span>
              </div>

              {quickAddExpanded && (
                <div className="section-content">
                  <div className="quickadd-grid">

                    {staples.length === 0 && <p>No staples found. Try again later.</p>}
                    {staples.map((staple, index) => (
                  <div
                    key={`${staple.id || staple.name || "staple"}-${index}`}
                    className="quickadd-card"
                    onClick={() =>
                      handleQuickAdd(
                        { color: staple.color || "Default", image_url: staple.image_url || "" },
                        staple.name || "Staple",
                        staple.category || "Staple"
                      )
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleQuickAdd(
                      { color: staple.color || "Default", image_url: staple.image_url || "" },
                      staple.name || "Staple",
                      staple.category || "Staple"
                    )}
                  >
                    <div className="quickadd-image-wrap">
                      {staple.image_url ? (
                        <img
                          src={staple.image_url}
                          alt={staple.name || "Staple"}
                          loading="lazy"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                      ) : null}
                      <div className="quickadd-overlay">＋ Add</div>
                    </div>

                    <div className="quickadd-name">
                      {staple.name || "Staple"}
                    </div>
                  </div>

                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Search & Link Section */}
            <div className="upload-section">
              <div 
                className="section-header"
                onClick={() => setSearchExpanded(!searchExpanded)}
              >
                <h3 className="section-subtitle"> Search & Link</h3>
                <span className={`expand-icon ${searchExpanded ? 'expanded' : ''}`}>▼</span>
              </div>
              
              {searchExpanded && (
                <div className="section-content">
                  <div className="search-pill">
                    <input
                      type="text"
                      placeholder="Search products (e.g. white sneakers)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleProductSearch()}
                    />
                    <button onClick={handleProductSearch}>🔍</button>
                  </div>

                  
                  {searchResults.length > 0 && (
                    <div className="search-results">
                      <h4 className="results-title">Found {searchResults.length} products</h4>
                      <div className="quickadd-grid">
                        {searchResults.map((product, i) => (
                          <div
                            key={i}
                            className="quickadd-card"
                            onClick={() =>
                              handleProductSelect({
                                image_url: product.image_url || product.thumbnail || product.url,
                                name: product.name || product.title || "Unnamed",
                                category: "Search",
                                color: product.color || "Unknown",
                                tags: []
                              })
                            }
                          >
                            <div className="quickadd-image-wrap">
                              <img
                                src={product.image_url || product.thumbnail}
                                alt={product.name || "Product"}
                                loading="lazy"
                              />
                              <div className="quickadd-overlay">＋ Add</div>
                            </div>

                            <div className="quickadd-name">
                              {product.name || product.title || "Unnamed"}
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
              <section className="wardrobe-page">
                <div className="wardrobe-header">
                  <h1>Your Wardrobe</h1>
                  <p className="subtitle">Tap an item to view details. Add more pieces to unlock better looks.</p>
                </div>

                {/* Multi-select Toolbar (kept) */}
                  <div className="wardrobeTopRow">
                    <div className="flex gap-md">
                  <button
                    className={`btn ${isMultiSelectMode ? "btn-secondary" : "btn-primary"}`}
                    onClick={() => {
                      setIsMultiSelectMode(!isMultiSelectMode);
                      if (isMultiSelectMode) setSelectedItems([]);
                    }}
                  >
                    {isMultiSelectMode ? "✕ Cancel" : "Select Items"}
                  </button>

                  {isMultiSelectMode && selectedItems.length > 0 && (
                    <button
                      className="btn"
                      onClick={handleDeleteSelected}
                      style={{ background: "var(--accent-pink)", color: "var(--primary-white)" }}
                    >
                      🗑️ Delete {selectedItems.length}
                    </button>
                  )}
                </div>

                {/* Filters (kept as-is for now) */}
                <div className="filter-bar">
                  <div className="form-group">
                    <select
                      className="form-select"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                    >
                      <option value="">All Categories</option>
                      {uniqueCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {formatLabel(cat)}
                        </option>
                      ))}
                    </select>
                  </div>

                </div>
                    

                  <div className="form-group">
                    <select
                      className="form-select"
                      value={filterColor}
                      onChange={(e) => setFilterColor(e.target.value)}
                    >
                      <option value="">All Colors</option>
                      {uniqueColors.map((col) => (
                        <option key={col} value={col}>
                          {formatLabel(col)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ✅ Grid now uses wardrobe.css card system */}
                <div className="wardrobe-grid">
                  {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="wardrobe-item"
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => e.currentTarget.focus()}
                  aria-label={`Open details for ${item.displayName || item.name}`}
                  onClick={() => openModal(item)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openModal(item)}
                  style={{ cursor: "pointer" }}
                >

                      {/* Multi-select checkbox */}
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
                            top: 10,
                            left: 10,
                            width: 18,
                            height: 18,
                            cursor: "pointer",
                            zIndex: 12,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}

                      {/* Image */}
                      {item.image_url && (
                        <img className="item-img" src={item.image_url} alt={item.displayName || item.name || "Item"} />
                      )}

                      {/* Hover actions (edit/delete) */}
                      <div className="item-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="icon-btn" aria-label="Edit item" onClick={() => openEditModal(item)}>
                          ✏️
                        </button>
                        <button className="icon-btn" aria-label="Delete item" onClick={() => handleDelete(item.id)}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Keep your FAB if you want (optional) */}
                {/* <button className="fab" onClick={() => setActiveTab("upload")}>+</button> */}
              </section>
            )}



          {/* AI Stylist Section */}
          {activeTab === "stylist" && (
            <section className="section section-wardrobe">

              <h2 className="section-title">AI Style Assistant</h2>
              <p className="section-description">
                Let our AI stylist create personalized looks from your wardrobe 
              </p>

              <div className="stylist-shell">
                <div className="stylist-card">
                  <div className="stylist-card__head">
                    <h2 className="stylist-title">AI Style Assistant</h2>
                    <p className="stylist-subtitle">Create personalized looks from your wardrobe</p>
                  </div>

                  {/* Controls */}
                  <div className="style-controls">

                <div className="form-group">
                  <label className="form-label">Occasion</label>
                  <select
                    className="form-select"
                    value={occasion}
                    onChange={(e) => setOccasion(e.target.value)}
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

                  <div className="stylist-card__footer">
                    <button
                      className="btn btn-primary stylist-generate"
                      onClick={async () => {
                        console.log(" Generate clicked (Tina Agent)");
                        await suggestOutfitAgent({
                          uid: user.uid,
                          city,
                          wardrobe: items,
                           occasion: String(occasion || "").toLowerCase(),
                          vibe,
                        });
                      }}
                    >
                      {uiCopy.stylist.generateBtn}
                    </button>
                  </div>


              {stylistLoading && <LoadingState text={uiCopy.stylist.loadingText} />}

              {outfit && outfit.length > 0 ? (
                <div className="outfit-suggestions">
                  {outfit.map((look, idx) => (

                <div key={idx} className="outfit-look">
                  <div className="look-header">
                    <h3 className="look-title">✨ {look.title || `Look ${idx + 1}`}</h3>
                    <p className="look-description">{look.style_note}</p>
                    {(() => {
                      // show when backend fixed/completed (we look for our backend phrasing OR evidence)
                       const note = (look.style_note || "").toLowerCase();
                       const autoCompleted = /completed with real wardrobe items|added matching footwear|minor backend fix/i.test(note);
                       const showBag  = userPrefs.gender?.toLowerCase() === "female" && hasBag(look.items);
                       const showBelt = userPrefs.gender?.toLowerCase() === "male"   && hasBelt(look.items);
                       return (
                         <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                           {autoCompleted && <span className="tag">Auto-completed</span>}
                           {showBag && <span className="tag">Bag included</span>}
                           {showBelt && <span className="tag">Belt added</span>}
                         </div>
                       );
                     })()}
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
                            <p className="look-item-name" style={{ margin: 0, fontWeight: 600 }}>
                              {hydrated?.name
                                || hydrated?.displayName
                                || (hydrated?.category ? formatLabel(hydrated.category) : `Item ${i + 1}`)}
                            </p>
                            {hydrated.source === "inspiration" && (
                              <span className="tag" style={{ marginTop: 6 }}>Inspiration</span>
                            )}
                          </div>

                        </div>
                      );
                    })}
                  </div>

                  <div className="look-actions wow-look-actions">
                    {/* Primary CTA */}
                    <button
                      className="btn btn-accent wow-love-btn"
                      onClick={async () => {
                        try {
                          const outfit_id = look?.outfit_id;

                          await logOutfitFeedback({
                            uid: user.uid,
                            action: "love",
                            outfit_id,
                            occasion,
                            vibe,
                            items: toFeedbackItems(look),
                            meta: { source: "stylist", look_index: idx },
                          });

                          alert("❤️ Loved this look!");
                        } catch (e) {
                          console.error("Love feedback failed:", e);
                          alert("Couldn’t save feedback. Try again.");
                        }
                      }}
                    >
                      ❤️ Love this look
                    </button>

                    {/* Secondary row */}
                    <div className="wow-look-actions__row">
                      <button
                        className="btn btn-outline wow-action-btn"
                        onClick={() => openPlanModal(look)}
                        title="Add to calendar"
                      >
                        📅
                      </button>

                      <button
                        className="btn btn-outline wow-action-btn"
                        onClick={async () => {
                          try {
                            const outfit_id = look?.outfit_id;

                            await logOutfitFeedback({
                              uid: user.uid,
                              occasion,
                              vibe,
                              action: "dislike",
                              outfit_id,
                              items: (look?.items || []).map((it) => ({
                                wardrobe_id: String(it.id),
                                name: it.name || "",
                                category: it.category || "",
                              })),
                              reason_tags: ["outfit_only"], // 👈 IMPORTANT
                            });


                            alert("💔 Noted — won’t repeat this vibe.");
                          } catch (e) {
                            console.error("Dislike feedback failed:", e);
                            alert("Couldn’t save feedback. Try again.");
                          }
                        }}
                        title="Not my style"
                      >
                        💔
                      </button>

                      {/* Swap menu */}
                      <div className="wow-swap-wrap">
                        <button
                          className="btn btn-outline wow-action-btn"
                          onClick={() => setSwapOpenIdx(swapOpenIdx === idx ? null : idx)}
                          title="Swap one piece"
                        >
                          🔁
                        </button>

                        {swapOpenIdx === idx && (
                          <div className="wow-swap-menu">
                            <div className="wow-swap-title">Swap only:</div>

                            <div className="wow-swap-grid">
                              <button className="wow-swap-chip" onClick={() => handleSwap(look, "top")}>Top</button>
                              <button className="wow-swap-chip" onClick={() => handleSwap(look, "bottom")}>Bottom</button>
                              <button className="wow-swap-chip" onClick={() => handleSwap(look, "footwear")}>Footwear</button>
                              <button className="wow-swap-chip" onClick={() => handleSwap(look, "bag")}>Bag</button>
                              <button className="wow-swap-chip" onClick={() => handleSwap(look, "dress")}>Dress</button>
                            </div>

                            <button className="wow-swap-close" onClick={() => setSwapOpenIdx(null)}>
                              Close
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {look.trends_used?.length > 0 && (
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
                {uiCopy.stylist.emptyText}
              </p>
            )
          )}
                </div>
              </div>
            </section>
          )}

          {/* Weekly Planner */}
          {activeTab === "planner" && (
            <section style={{ marginTop: "2rem" }}>
              <WeeklyPlanner
                uid={user?.uid}
                onOpenPlan={openPlanViewer}
              />
            </section>
          )}


            {/* Profile Section */}
                {activeTab === "profile" && (
              <section className="section" style={{ paddingBottom: 120 }}>
                {needsOnboarding && (
                  <div className="wow-profile-banner">
                    <span>Complete your profile for better styling</span>
                    <button onClick={() => setOnboardingOpen(true)}>Complete Profile</button>
                  </div>
                )}

                <ProfileOnboardingEditor
                  userPrefs={userPrefs}
                  onSave={async (prefs) => {
                    const res = await fetch(`${BASE_URL}/onboarding`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ uid: user.uid, ...prefs }),
                    });
                    if (!res.ok) throw new Error("Failed to save");
                    setUserPrefs((prev) => ({ ...prev, ...prefs }));
                    setNeedsOnboarding(false);
                  }}
                  bodyShapeAssets={bodyShapeAssets}
                  assetsLoading={assetsLoading}
                />

                <div style={{ marginTop: 16 }}>
                  <button className="btn btn-secondary" onClick={handleLogout}>
                    Logout
                  </button>
                </div>

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

      

      {/* Modern Modals */}
      {/* 📌  NEW: wardrobe-card details modal         */}
      {isModalOpen && modalItem && (
        <div className="wow-overlay" onClick={closeModal}>
          <div
            className="wow-modal"
            onClick={(e) => e.stopPropagation()}   // keep clicks inside
          >
            <img src={modalItem.image_url} alt={modalItem.name} />

            <h3>{modalItem.primaryTag || formatLabel(modalItem.name || modalItem.category || "Wardrobe Item")}</h3>


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

        {showPlanModal && (
          <section
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 2000,
            }}
            aria-modal="true"
            role="dialog"
          >
            <div
              style={{
                background: "white",
                padding: "1.5rem",
                borderRadius: 12,
                width: "92%",
                maxWidth: 480,
                boxShadow: "0 10px 30px rgba(0,0,0,0.15)"
              }}
            >
              <h3 style={{ marginTop: 0 }}>Add to Calendar</h3>

              <label className="form-label" style={{ display: "block", marginTop: 10 }}>
                Date
              </label>
              <input
                type="date"
                className="form-input"
                value={planForm.date}
                onChange={(e) => setPlanForm({ ...planForm, date: e.target.value })}
                style={{ width: "100%" }}
              />

              <label className="form-label" style={{ display: "block", marginTop: 12 }}>
                Title
              </label>
              <input
                type="text"
                className="form-input"
                value={planForm.title}
                onChange={(e) => setPlanForm({ ...planForm, title: e.target.value })}
                placeholder="e.g., Airport Travel Look"
                style={{ width: "100%" }}
              />

              <label className="form-label" style={{ display: "block", marginTop: 12 }}>
                Note
              </label>
              <textarea
                className="form-input"
                value={planForm.note}
                onChange={(e) => setPlanForm({ ...planForm, note: e.target.value })}
                placeholder="Add any extra comments…"
                rows={4}
                style={{ width: "100%" }}
              />

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={closePlanModal}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={addLookToCalendar}>
                  ➕ Add
                </button>
              </div>
            </div>
          </section>
        )}

       
        {/* -------------------------------------------- */}
      {viewOpen && viewPlan && (
        <PlanViewer open={viewOpen} plan={viewPlan} onClose={closePlanViewer} />
      )}

      <nav className="wow-bottom-nav" aria-label="Primary">
        <div className="wow-bottom-nav__pill">
          {[
              { label: "Home", key: "home" },
              { label: "Wardrobe", key: "wardrobe" }, // keeping Wardrobe 
              { label: "Add", key: "upload" },
              { label: "Style", key: "stylist" },
              { label: "Plan", key: "planner" },
              { label: "Me", key: "profile" },
            ]
.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`wow-bottom-nav__item ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="wow-bottom-nav__label">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

    </div>
  );
}