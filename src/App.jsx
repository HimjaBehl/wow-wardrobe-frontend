import {
  doc,
  getDoc,
  deleteDoc,
  addDoc,
  collection,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
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
import VirtualTryOn from "./VirtualTryOn";
// near the other imports
import TrendsPanel from "./trendPanel";
import StylePiecePage from "./StylePiecePage";
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
    emptyText:
      "I couldn’t build a complete look yet. Try adding footwear or changing the occasion.",
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
    url.search = ""; // drop query (?alt=media etc.)
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
  if (
    c.includes("bottom") ||
    c.includes("pants") ||
    c.includes("trouser") ||
    c.includes("jeans")
  )
    return "Bottom";
  if (
    c.includes("top") ||
    c.includes("upper") ||
    c.includes("shirt") ||
    c.includes("tee") ||
    c.includes("blouse")
  )
    return "Top";
  if (c.includes("dress") || c.includes("gown")) return "Dress";
  if (
    c.includes("outerwear") ||
    c.includes("blazer") ||
    c.includes("coat") ||
    c.includes("jacket") ||
    c.includes("suit")
  )
    return "Outerwear";
  if (
    c.includes("footwear") ||
    c.includes("heel") ||
    c.includes("shoe") ||
    c.includes("sandal") ||
    c.includes("sneaker") ||
    c.includes("boot")
  )
    return "Footwear";
  if (
    c.includes("bag") ||
    c.includes("handbag") ||
    c.includes("tote") ||
    c.includes("clutch") ||
    c.includes("purse")
  )
    return "Bag";
  if (
    c.includes("accessory") ||
    c.includes("belt") ||
    c.includes("sunglass") ||
    c.includes("jewelry") ||
    c.includes("jewellery") ||
    c.includes("bracelet") ||
    c.includes("watch")
  )
    return "Accessory";

  // If category is weak (like "Misc") infer from name
  if (
    /trouser|pants|jeans|chinos|skirt|shorts|palazzo|salwar|gharara|sharara|dhoti/.test(
      n,
    )
  )
    return "Bottom";
  if (/shirt|t-?shirt|tee|blouse|kurta|kameez|sweater|hoodie/.test(n))
    return "Top";
  if (/dress|gown|jumpsuit|saree|lehenga|anarkali/.test(n)) return "Dress";
  if (/blazer|jacket|coat|suit/.test(n)) return "Outerwear";
  if (/heel|shoe|sneaker|boot|sandal|loafer|mule|trainer/.test(n))
    return "Footwear";
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
  const ids = (look?.items || [])
    .map((x) => String(x.id || ""))
    .filter(Boolean)
    .sort();
  return ids.length
    ? `outfit_${ids.join("_")}`
    : `outfit_${Date.now()}_${fallbackIdx}`;
}

function toFeedbackItems(look) {
  return (look?.items || [])
    .map((it) => ({
      wardrobe_id: String(it.id || ""),
      name: it.name || "",
      category: it.category || "",
    }))
    .filter((x) => x.wardrobe_id);
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

function ProfileOnboardingEditor({
  userPrefs,
  onSave,
  bodyShapeAssets,
  assetsLoading,
}) {
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
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="wow-profile-select"
          >
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
          ) : (
            (() => {
              const isMale = String(gender || "").toLowerCase() === "male";
              const list = isMale
                ? bodyShapeAssets?.male || []
                : bodyShapeAssets?.female || [];
              if (list.length === 0) {
                return (
                  <div style={{ opacity: 0.7 }}>No body shapes found.</div>
                );
              }
              return (
                <div className="wow-card-grid">
                  {(lockedPrefs
                    ? list.filter(
                        (o) =>
                          (o.id || "").toLowerCase() ===
                          (bodyShape || "").toLowerCase(),
                      )
                    : list
                  ).map((opt) => {
                    const active =
                      (bodyShape || "").toLowerCase() ===
                      (opt.id || "").toLowerCase();
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
                        {opt.image_url && (
                          <img
                            src={opt.image_url}
                            alt={opt.label}
                            className="shapeImage"
                          />
                        )}
                        <div className="wow-choice-title">{opt.label}</div>
                        {opt.hint ? (
                          <div className="wow-choice-hint">{opt.hint}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>

        <div className="wow-profile-label">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Complexion</div>

          <div className="wow-swatch-grid" role="list">
            {(lockedPrefs
              ? COMPLEXION_OPTIONS.filter(
                  (o) =>
                    o.id.toLowerCase() === (complexion || "").toLowerCase(),
                )
              : COMPLEXION_OPTIONS
            ).map((opt) => {
              const active =
                (complexion || "").toLowerCase() === opt.id.toLowerCase();
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
                  <span
                    className="wow-swatch-dot"
                    style={{ backgroundColor: opt.hex }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <button
        className="wow-profile-save"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? "Saving..." : saved ? "Saved!" : "Save Preferences"}
      </button>
    </div>
  );
}

function OnboardingModal({
  open,
  uid,
  userPrefs,
  onClose,
  onSavePrefs,
  bodyShapeAssets,
  assetsLoading,
  setBodyShapeAssets,
  setAssetsLoading,
}) {
  const [formGender, setFormGender] = useState(userPrefs?.gender || "");
  const [formBodyShape, setFormBodyShape] = useState(
    userPrefs?.bodyShape || "",
  );
  const [formComplexion, setFormComplexion] = useState(
    userPrefs?.complexion || "",
  );
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
      await onSavePrefs({
        gender: formGender,
        bodyShape: formBodyShape,
        complexion: formComplexion,
      });
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
          <button
            className="wow-onb-close"
            type="button"
            onClick={handleDismiss}
            aria-label="Close onboarding"
          >
            ✕
          </button>
        </div>

        <h2 className="wow-onb-title">Welcome to WOW</h2>
        <p className="wow-onb-subtitle">
          Tell us a bit about yourself for better styling recommendations.
        </p>

        <div className="wow-onb-form">
          <label className="wow-onb-label">
            Gender
            <select
              value={formGender}
              onChange={(e) => setFormGender(e.target.value)}
              className="wow-onb-select"
            >
              <option value="">Select...</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </label>

          <div className="wow-onb-label">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Body Shape</div>

            {assetsLoading && (
              <div style={{ opacity: 0.7, marginBottom: 8 }}>
                Loading body shapes…
              </div>
            )}

            {lockedPrefs && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: 10,
                }}
              >
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
                const list =
                  (formGender === "Male"
                    ? bodyShapeAssets.male
                    : bodyShapeAssets.female) || [];
                const viewList = lockedPrefs
                  ? list.filter(
                      (o) =>
                        (o.id || "").toLowerCase() ===
                        (formBodyShape || "").toLowerCase(),
                    )
                  : list;
                return viewList.map((opt) => {
                  const active =
                    (formBodyShape || "").toLowerCase() ===
                    (opt.id || "").toLowerCase();
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
                      <img
                        src={opt.image_url}
                        alt={opt.label}
                        className="shapeImage"
                      />
                      <div className="wow-choice-title">{opt.label}</div>
                      {opt.hint ? (
                        <div className="wow-choice-hint">{opt.hint}</div>
                      ) : null}
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          <div className="wow-onb-label">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Complexion</div>

            <div className="wow-swatch-grid" role="list">
              {(lockedPrefs
                ? COMPLEXION_OPTIONS.filter(
                    (o) =>
                      o.id.toLowerCase() ===
                      (formComplexion || "").toLowerCase(),
                  )
                : COMPLEXION_OPTIONS
              ).map((opt) => {
                const active =
                  (formComplexion || "").toLowerCase() === opt.id.toLowerCase();
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
                    <span
                      className="wow-swatch-dot"
                      style={{ backgroundColor: opt.hex }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="wow-onb-actions">
          <button
            className="wow-onb-primary"
            type="button"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "Saving..." : "Get started →"}
          </button>
          <button
            className="wow-onb-skip"
            type="button"
            onClick={handleDismiss}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================================== */


export default function App() {
  const UI_BUILD = "2026-03-10-core-revamp-stylepiece-1";

  useEffect(() => {
    const prev = localStorage.getItem("wow_ui_build");
    if (prev !== UI_BUILD) {
      localStorage.setItem("wow_ui_build", UI_BUILD);
      // hard refresh to break cached JS chunks
      window.location.reload();
    }
  }, []);

  const [userPrefs, setUserPrefs] = useState({});
  const [file, setFile] = useState(null); // current preview (optional)
  const [files, setFiles] = useState([]); // selected files (multi)
  const [fileQueue, setFileQueue] = useState([]); // queue of remaining files
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

  // ── Onboarding modal UI state (e frontend-only) ──
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const BUILD_VERSION = "2026-02-04-2";

  useEffect(() => {
    console.log("✅ WOW BUILD VERSION:", BUILD_VERSION);
    console.log("SW supported:", "serviceWorker" in navigator);
  }, []);

  const feedbackSessionIdRef = useRef(String(Date.now())); // 🔎 Viewer for a saved plan/outfit
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

  const [bodyShapeAssets, setBodyShapeAssets] = useState({
    female: [],
    male: [],
  });
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
    note: "",
  });
  const [planLook, setPlanLook] = useState(null);
  const [anchorItem, setAnchorItem] = useState(null);
  const [anchorUploading, setAnchorUploading] = useState(false);
  const [anchorPreview, setAnchorPreview] = useState(null);

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
        uid: user.uid,
        date: planForm.date, // YYYY-MM-DD
        outfit: {
          title: planForm.title,
          note: planForm.note,
          items: planLook.items || [],
        },
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
          action: "plan", // ✅ calendar intent
          outfit_id:
            planLook?.outfit_id || `plan_${feedbackSessionIdRef.current}`,
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
  const [activeTab, setActiveTab] = useState("stylepiece");
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
  const [modalItem, setModalItem] = useState(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const openModal = (item) => {
    setModalItem(item);
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setModalItem(null);
  };

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
  const uniqueCategories = useMemo(
    () => [...new Set(items.map((it) => it.category).filter(Boolean))],
    [items],
  );
  const uniqueColors = useMemo(
    () => [...new Set(items.map((it) => it.color).filter(Boolean))],
    [items],
  );

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
      .split("/") // drop parent paths (“Clothing/Tops” → “Tops”)
      .pop()
      .replace(/_/g, " ") // snake_case → spaces
      .toLowerCase() // start with all-lower
      .replace(/\b\w/g, (c) => c.toUpperCase()) // Title-case each word
      .trim();
  };

  useEffect(() => {
    function onDocClick(e) {
      // Any click not on a swap menu/button closes it
      const el = e.target;
      if (!el.closest) return;
      if (!el.closest(".look-actions"))
        if (typeof setSwapOpenIdx === "function") setSwapOpenIdx(null);
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
      .then((res) => res.json())
      .then((data) => {
        const hasRealPrefs =
          (data.gender && data.gender.trim() !== "") ||
          (data.bodyShape && data.bodyShape.trim() !== "") ||
          (data.complexion && data.complexion.trim() !== "");

        setNeedsOnboarding(!hasRealPrefs);
        setUserPrefs({
          ...data,
          dislikes: data.dislikes || [],
        }); // ✅ save prefs including dislikes
      })
      .catch((err) => {
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
        Promise.allSettled([
          fetchItems(firebaseUser.uid),
          fetchTodayPlan(firebaseUser.uid),
        ]).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchStaples = async () => {
      const g = userPrefs?.gender?.toLowerCase();
      if (!user?.uid || !g) {
        console.log("Staples fetch skipped - uid:", user?.uid, "gender:", g);
        return;
      }
      const genderParam = g || "female";

      try {
        const url = `${BASE_URL}/staples?gender=${encodeURIComponent(
          genderParam,
        )}&uid=${encodeURIComponent(user.uid)}&v=${Date.now()}`; // ✅ cache-bust

        console.log("Fetching staples for gender:", genderParam, "url:", url);

        const res = await fetch(url, { cache: "no-store" }); // ✅ avoid cached responses
        if (!res.ok) {
          console.warn("Staples fetch failed:", res.status);
          setStaples([]);
          return;
        }

        const data = await res.json();

        // support both shapes: [] OR { staples: [] }
        let list = Array.isArray(data) ? data : Array.isArray(data?.staples) ? data.staples : [];

        // ✅ if backend sends grouped items with variants, flatten them safely
        // (won't break if not present)
        if (list.length && list[0]?.variants && Array.isArray(list[0].variants)) {
          list = list.flatMap((s) =>
            (s.variants || []).map((v) => ({
              ...s,
              color: v.color || s.color,
              image_url: v.image_url || s.image_url,
            })),
          );
        }

        console.log("Staples received:", list.length, "items for", genderParam);
        setStaples(list);
      } catch (err) {
        console.error("Failed to fetch staples:", err);
        setStaples([]);
      }
    };

    fetchStaples();
  }, [user?.uid, userPrefs?.gender]);

  const isInAppBrowser = () => {
    const ua = navigator.userAgent || navigator.vendor || window.opera || "";
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

    const result =
      isUIWebView ||
      isAndroidWebView ||
      isFacebookApp ||
      isInstagram ||
      isWhatsApp ||
      isTwitter ||
      isSnapchat ||
      isLine ||
      isTelegram;
    console.log("In-app browser check:", result, "UA:", ua.substring(0, 100));
    return result;
  };

  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  };

  const handleLogin = async () => {
    try {
      console.log("LOGIN CLICK");

      if (isInAppBrowser()) {
        const currentUrl = window.location.href;
        alert(
          "Please open this app in your regular browser (Chrome/Safari) for login to work.\n\nTap the menu (⋮ or ⋯) and select 'Open in Browser'",
        );
        return;
      }

      console.log("Using popup auth");
      const result = await signInWithPopup(auth, provider);
      console.log("LOGIN SUCCESS:", result?.user?.uid);
    } catch (err) {
      console.error("Login failed:", err?.code, err?.message);
      if (err?.code === "auth/popup-blocked") {
        alert(
          "Popup was blocked. Please allow popups for this site, or try opening in a different browser.",
        );
      } else if (err?.code === "auth/popup-closed-by-user") {
        console.log("User closed the popup");
      } else if (err?.code === "auth/unauthorized-domain") {
        alert(
          "This domain is not authorized. Please contact the app administrator.",
        );
      } else {
        alert(
          `Login failed: ${err?.message || "Unknown error"}. Try opening in Chrome or Safari.`,
        );
      }
    }
  };

  const fetchTodayPlan = async (uid) => {
    try {
      const date = new Date().toISOString().split("T")[0];
      const res = await fetch(
        `${BASE_URL}/plan-outfit?uid=${uid}&date=${date}`,
      );

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
      const hasItems =
        Array.isArray(outfitObj?.items) && outfitObj.items.length > 0;

      setTodayPlan(
        hasItems ? { outfit: outfitObj } : { outfit: { items: [] } },
      );
    } catch (e) {
      console.error("Error fetching today plan:", e);
      setTodayPlan(null);
    }
  };

  
  const fetchItems = async (uid) => {
    try {
      const genderParam =
        String(userPrefs?.gender || "").toLowerCase().startsWith("m") ? "male" :
        String(userPrefs?.gender || "").toLowerCase().startsWith("f") ? "female" :
        "female";

      const res = await fetch(
        `${BASE_URL}/wardrobe?uid=${uid}&include_staples=1&gender=${encodeURIComponent(
          genderParam,
        )}&version=v2&v=${Date.now()}`,
        { cache: "no-store" },
      );
      const text = await res.text();
      const data = JSON.parse(text);

      const withUrls = (Array.isArray(data) ? data : []).map((item, idx) => {
        // ✅ Always compute a stable image_url
        let imageUrl = item.image_url;
        if (!imageUrl && item.image_path) {
          const bucket = "wowapp1406.appspot.com";
          imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(
            item.image_path,
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
        image_url: imageUrl, // ✅ always stored
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

  const handleAnchorUpload = async (file, autoStyle = false) => {
    if (!file || !user?.uid) return;
    setAnchorUploading(true);
    setAnchorPreview(URL.createObjectURL(file));
    setAnchorItem(null);

    try {
      const uniqueName = `${user.uid}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `wardrobe/${uniqueName}`);
      await uploadBytes(storageRef, file);
      const imageUrl = await getDownloadURL(storageRef);
      const storagePath = storageRef.fullPath;

      const tagRes = await fetch(`${BASE_URL}/auto-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });

      let itemName = "Uploaded piece";
      let itemCategory = "";
      let itemColor = "";
      let itemTags = [];

      if (tagRes.ok) {
        const tagData = await tagRes.json();
        const detected = (tagData.detectedItems || tagData.detected || []);
        if (detected.length > 0) {
          const first = detected[0];
          itemName = first.name || "Uploaded piece";
          itemCategory = first.category || "";
          itemColor = first.color || "";
          itemTags = Array.isArray(first.tags) ? first.tags : [];
        }
      }

      const saveRes = await fetch(`${BASE_URL}/wardrobe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          image_path: storagePath,
          image_url: imageUrl,
          name: itemName,
          category: itemCategory,
          color: itemColor,
          tags: itemTags,
        }),
      });

      let savedId = `anchor_${Date.now()}`;
      if (saveRes.ok) {
        const saveData = await saveRes.json();
        savedId = saveData.id || saveData.doc_id || savedId;
      }

      await fetchItems(user.uid);

      const newAnchor = {
        id: savedId,
        image_url: imageUrl,
        image_path: storagePath,
        name: itemName,
        displayName: itemName,
        category: itemCategory,
        color: itemColor,
        tags: itemTags,
      };
      setAnchorItem(newAnchor);

      if (autoStyle) {
        setAnchorUploading(false);
        setStylistLoading(true);
        try {
          const anchorWardrobe = {
            wardrobe_id: String(savedId),
            id: String(savedId),
            image_url: imageUrl,
            name: itemName,
            category: itemCategory,
            color: itemColor,
          };
          const existingWardrobe = items.map((w) => ({
            wardrobe_id: String(w.id),
            id: String(w.id),
            image_url: w.image_url,
            name: w.displayName || w.name || "",
            category: w.category || "",
            color: w.color || "",
          }));
          const alreadyInList = existingWardrobe.some((w) => w.id === String(savedId));
          const fullWardrobe = alreadyInList ? existingWardrobe : [anchorWardrobe, ...existingWardrobe];

          console.log("[AutoStyle] Sending suggest-outfit with", fullWardrobe.length, "wardrobe items, anchor:", itemName);

            const styleRes = await fetch(`${BASE_URL}/style-piece`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                uid: user.uid,
                city,
                occasion: "Smart Casual",
                vibe: "",
                gender: userPrefs?.gender || "",
                include_wardrobe: true,
                include_staples: true,
                anchor_item: {
                  id: String(savedId),
                  wardrobe_id: String(savedId),
                  image_url: imageUrl,
                  name: itemName,
                  category: itemCategory,
                  color: itemColor,
                  tags: itemTags,
                },
              }),
          });
          const rawText = await styleRes.text();
          console.log("[AutoStyle] Raw response length:", rawText.length);
          let clean = rawText.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
          let data;
          try { data = JSON.parse(clean); } catch { data = { looks: [] }; }
          const looks = Array.isArray(data?.outfits)
          ? data.outfits
          : Array.isArray(data?.looks)
            ? data.looks
            : data?.look
              ? [data.look]
              : [];
          console.log("[AutoStyle] Parsed looks count:", looks.length);

          if (looks.length > 0) {
            const firstLook = looks[0];

            const localIdMap = new Map();
            for (const w of items) {
              if (w.id) localIdMap.set(String(w.id), w);
              if (w.doc_id) localIdMap.set(String(w.doc_id), w);
            }
            localIdMap.set(String(savedId), newAnchor);

            const localUrlMap = new Map();
            for (const w of items) {
              if (w.image_url) localUrlMap.set(normalizeUrl(w.image_url), w);
            }
            localUrlMap.set(normalizeUrl(imageUrl), newAnchor);

              const hydratedItems = (firstLook.pieces || firstLook.items || []).map((it, i) => {
                const tinaId = it.idx ?? it.wardrobe_id ?? it.wardrobeId ?? it.item_id ?? it.id;
                const tinaUrl =
                  it.image_url ??
                  it.image_uri ??
                  it.image ??
                  it.url ??
                  (it.source === "uploaded_item" ? imageUrl : "");

              let w = null;
              if (tinaId != null) w = localIdMap.get(String(tinaId)) || null;
              if (!w && tinaUrl) w = localUrlMap.get(normalizeUrl(tinaUrl)) || null;

              if (w) {
                return {
                  id: w.id,
                  name: w.displayName || w.name || it.name || `Item ${i + 1}`,
                  category: w.category || it.category || "",
                  color: w.color || it.color || "",
                  image_url: w.image_url,
                  tags: Array.isArray(w.tags) ? w.tags : [],
                  source: "wardrobe",
                };
              }
              if (tinaUrl && String(tinaUrl).startsWith("http")) {
                return {
                  id: it.wardrobe_id || it.id || `agent-${i}`,
                  name: it.name || it.title || "Extra piece",
                  category: it.category || "",
                  color: it.color || "",
                  image_url: tinaUrl,
                  source: "agent_unmatched",
                };
              }
              return {
                id: it.wardrobe_id || it.id || `raw-${i}`,
                name: it.name || it.title || it.category || `Item ${i + 1}`,
                category: it.category || "",
                color: it.color || "",
                image_url: tinaUrl || "",
                source: "raw",
              };
            });

            console.log("[AutoStyle] Hydrated items:", hydratedItems.length, hydratedItems.map(h => `${h.name} (${h.source})`));

            const validItems = hydratedItems.filter((h) => h.image_url);
            if (validItems.length > 0) {
              setOutfit([
                {
                  ...firstLook,
                  items: validItems,
                  style_note:
                    firstLook.style_note ||
                    firstLook.why_it_works ||
                    "Styled around your uploaded piece",
                },
              ]);
            } else {
              console.warn("[AutoStyle] No items with valid image URLs after hydration");
            }
          }
        } catch (e) {
          console.error("Auto-style after upload failed:", e);
        } finally {
          setStylistLoading(false);
        }
      }
    } catch (err) {
      console.error("Anchor upload failed:", err);
      alert("Failed to upload image. Please try again.");
      setAnchorPreview(null);
    } finally {
      setAnchorUploading(false);
    }
  };

  const startDetectionQueue = async () => {
    if (!user?.uid) {
      alert("Please login first.");
      return;
    }

    const chosen = files && files.length ? files : file ? [file] : [];
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
      }),
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
      tags: Array.isArray(it.tags) ? it.tags.join(", ") : it.tags || "",
    });
  };

  const confirmSelectedItems = async () => {
    const approved = detectedItems.filter((item) => item.approved);

    // 🚦 throw out any item whose path is missing or “undefined”
    const bad = approved.find(
      (it) => !it.imagePath || it.imagePath.includes("undefined"),
    );
    if (bad) {
      alert(
        "One of the selected items has an invalid image path — please re-upload.",
      );
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
            image_url: item.image_url, // ➕ keep the public link
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
        prev.map((it) =>
          it.id === id ? { ...it, isFavorite: !currentFav } : it,
        ),
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
          save_to_staples: true,
          gender:
            String(userPrefs?.gender || "").toLowerCase().startsWith("m") ? "male" :
            String(userPrefs?.gender || "").toLowerCase().startsWith("f") ? "female" :
            "female",
          version: "v2",
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
      setSearchResults(
        Array.isArray(data?.products)
          ? data.products
          : Array.isArray(data?.items)
            ? data.items
            : [],
      );
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
          name: product.name || product.title || "Unnamed",
          category: product.category || "Search",
          color: product.color || "Unknown",
          image_url: product.image_url || product.thumbnail || product.url || "",
          save_to_staples: true,
          gender:
            String(userPrefs?.gender || "").toLowerCase().startsWith("m") ? "male" :
            String(userPrefs?.gender || "").toLowerCase().startsWith("f") ? "female" :
            "female",
          version: "v2",
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
        prev.map((it) => (it.id === id ? { ...it, lastWorn: today } : it)),
      );
    } catch (err) {
      console.error("Mark worn failed:", err);
      alert("Couldn’t mark as worn, sorry!");
    }
  };

  // 🔥 Bulk-delete selected wardrobe items
  const handleDeleteSelected = async () => {
    if (selectedItems.length === 0) return;
    if (!window.confirm(`Delete ${selectedItems.length} selected item(s)?`))
      return;

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
    if (/footwear|shoe|sandal|heel|sneaker|jutti|boot/.test(norm))
      return "footwear";
    if (/bag|handbag|tote|purse|clutch/.test(norm)) return "bag";
    if (
      /bottom|jeans|pants|trouser|skirt|shorts|palazzo|salwar|gharara|sharara|dhoti/.test(
        norm,
      )
    )
      return "bottom";

    // Treat outerwear as top-slot for swap purposes (unless you want an explicit "outer" group later)
    if (/outerwear|blazer|jacket|coat|suit/.test(norm)) return "top";

    return "top";
  }

  function buildSwapInstruction(baseLook, targetGroup) {
    // lock everything that is NOT the target group
    const keepIds = (baseLook?.items || [])
      .filter((p) => groupOf(p.category, p.name) !== targetGroup)
      .map((p) => String(p.id))
      .filter(Boolean);

    // polite + explicit for the agent:
    return [
      `Swap only the ${targetGroup.toUpperCase()}.`,
      `Keep all other items identical (lock these wardrobe ids): ${keepIds.join(", ") || "none"}.`,
      `Use ONLY real wardrobe items; do not invent.`,
      `Respect same occasion and vibe.`,
    ].join(" ");
  }

  // single entry point for swap
  async function handleSwap(baseLook, targetGroup) {
    if (!user?.uid) return;

    const lockedIds = (baseLook?.items || [])
      .filter((p) => groupOf(p.category, p.name) !== targetGroup)
      .map((p) => String(p.id))
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
      `Respect same occasion and vibe.`,
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
      baseLook,
    });
  }

  // Turn a look into buckets
  function bucketByGroup(items = []) {
    const out = {
      top: [],
      bottom: [],
      footwear: [],
      bag: [],
      dress: [],
      other: [],
    };
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
    const newB = bucketByGroup(newLook.items || []);
    const result = [];

    // keep all locked groups exactly as-is
    for (const g of ["top", "bottom", "bag", "dress"]) {
      if (g === targetGroup) continue;
      result.push(...baseB[g]);
    }
    // footwear is also locked unless it's the target
    if (targetGroup !== "footwear") result.push(...baseB.footwear);

    // now inject the swapped group from the new look
    const swapped =
      newB[targetGroup] && newB[targetGroup].length
        ? newB[targetGroup]
        : baseB[targetGroup];
    result.push(...swapped);

    // keep any 'other' (belts/scarves etc.) from base
    result.push(...baseB.other);

    // dedupe by id to avoid doubles
    const seen = new Set();
    return result.filter((it) => {
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
      "swap-top":
        "Keep everything same but replace the TOP with a different option from the same wardrobe.",
      "change-shoes":
        "Swap only the FOOTWEAR. Keep all other items identical. Use ONLY real wardrobe items.",
      cooler: "Keep the vibe, make it cooler-weather appropriate with layers.",
      warmer:
        "Keep the vibe, make it warmer-weather appropriate with lighter fabrics.",
    };

    await suggestOutfitAgent({
      uid: user.uid,
      city,
      wardrobe: items,
      occasion,
      vibe,
      // pass a soft instruction for the agent
      constraints: constraintHints[intent] || "",
    });
  }

  async function suggestOutfitAgent(options = {}) {
    const {
      uid,
      city,
      wardrobe,
      occasion,
      vibe,
      constraints = "",
      swapTarget,
      baseLook,
      anchorPiece,
    } = options;

    if (!uid) return;

    setStylistLoading(true);

    try {
      const isStylePiece = !!anchorPiece;
      const endpoint = isStylePiece ? "/style-piece" : "/suggest-outfit";

      let body;

      if (isStylePiece) {
        const anchorPayload = {
          id: String(anchorPiece.id),
          wardrobe_id: String(anchorPiece.id),
          image_url: anchorPiece.image_url,
          name: anchorPiece.displayName || anchorPiece.name || "",
          category: anchorPiece.category || "",
          color: anchorPiece.color || "",
          tags: Array.isArray(anchorPiece.tags) ? anchorPiece.tags : [],
        };

        body = {
          uid,
          gender: userPrefs?.gender || "",
          occasion,
          vibe,
          weather: "warm",
          city,
          include_wardrobe: true,
          include_staples: true,
          anchor_item: anchorPayload,
        };
      } else {
        body = {
          uid,
          city,
          occasion,
          vibe,
          constraints,
          profile: {
            gender: userPrefs?.gender || "",
            bodyShape: userPrefs?.bodyShape || "",
            complexion: userPrefs?.complexion || "",
          },
          dislikes: userPrefs?.dislikes || [],
          wardrobe: (wardrobe || []).map((w) => ({
            wardrobe_id: String(w.id),
            id: String(w.id),
            image_url: w.image_url,
            image_path: w.image_path || w.imagePath || "",
            name: w.displayName || w.name || "",
            category: w.category || "",
            color: w.color || "",
            tags: Array.isArray(w.tags) ? w.tags : [],
          })),
        };
      }

      console.log("🟢 suggestOutfitAgent endpoint:", endpoint);
      console.log("🟢 suggestOutfitAgent body:", body);

      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const rawText = await res.text();
      console.log("🎯 Raw backend response:", rawText);

      let data;
      try {
        const clean = rawText
          .trim()
          .replace(/^```(?:json)?/i, "")
          .replace(/```$/i, "")
          .trim();
        data = JSON.parse(clean);
      } catch (err) {
        console.error("❌ Failed to parse backend JSON:", err);
        throw new Error("Backend returned invalid JSON");
      }

      console.log("✅ Parsed backend JSON:", data);

      if (!res.ok) {
        throw new Error(data?.error || "Agent failed");
      }

      let preparedLooks = [];

      // =========================
      // STYLE-PIECE RESPONSE PATH
      // =========================
        if (Array.isArray(data?.outfits)) {
        preparedLooks = data.outfits.map((outfitObj, lookIdx) => {
          const mappedItems = (outfitObj.pieces || [])
            .map((piece, pieceIdx) => {
              // uploaded anchor piece
              if (piece.source === "uploaded_item") {
                return {
                  id: piece.idx || `anchor-${lookIdx}-${pieceIdx}`,
                  name: piece.name || "Anchor piece",
                  category: piece.category || "",
                  color: piece.color || "",
                  image_url:
                    piece.image_url ||
                    anchorPiece?.image_url ||
                    anchorItem?.image_url ||
                    anchorPreview ||
                    "",
                  tags: [],
                  source: "uploaded_item",
                  role: piece.role || "",
                };
              }

              // wardrobe piece
              if (piece.source === "wardrobe") {
                const wardrobeMatch =
                  items.find((w) => String(w.id) === String(piece.idx)) ||
                  items.find((w) => String(w.doc_id) === String(piece.idx)) ||
                  items.find((w) => String(w.wardrobe_id) === String(piece.idx));

                if (wardrobeMatch) {
                  return {
                    id: wardrobeMatch.id,
                    name:
                      wardrobeMatch.displayName ||
                      wardrobeMatch.name ||
                      piece.name ||
                      `Item ${pieceIdx + 1}`,
                    category: wardrobeMatch.category || piece.category || "",
                    color: wardrobeMatch.color || piece.color || "",
                    image_url: wardrobeMatch.image_url || "",
                    tags: Array.isArray(wardrobeMatch.tags) ? wardrobeMatch.tags : [],
                    source: "wardrobe",
                    role: piece.role || "",
                  };
                }

                return {
                  id: piece.idx || `wardrobe-${lookIdx}-${pieceIdx}`,
                  name: piece.name || `Item ${pieceIdx + 1}`,
                  category: piece.category || "",
                  color: piece.color || "",
                  image_url: "",
                  tags: [],
                  source: "wardrobe",
                  role: piece.role || "",
                };
              }

              // staple / unknown fallback
              return {
                id: piece.idx || `piece-${lookIdx}-${pieceIdx}`,
                name: piece.name || `Item ${pieceIdx + 1}`,
                category: piece.category || "",
                color: piece.color || "",
                image_url: piece.image_url || "",
                tags: [],
                source: piece.source || "unknown",
                role: piece.role || "",
              };
            })
            .filter(Boolean);

          return {
            outfit_id:
              outfitObj.id || `outfit_${feedbackSessionIdRef.current}_${lookIdx}`,
            title: outfitObj.title || `Look ${lookIdx + 1}`,
            style_note:
              outfitObj.why_it_works ||
              outfitObj.style_note ||
              "Styled around your selected piece",
            tina_reasoning:
              outfitObj.why_it_works ||
              outfitObj.style_note ||
              "Styled around your selected piece",
            styling_tips: Array.isArray(outfitObj.styling_tips)
              ? outfitObj.styling_tips
              : [],
            direction: outfitObj.direction || "",
            occasion_fit: outfitObj.occasion_fit || "",
            trends_used: [],
            validation: null,
            items: mappedItems.filter(Boolean),
          };
        });
      }

      // =========================
      // OLD SUGGEST-OUTFIT PATH
      // =========================
      else {
        const looks =
          data.looks ||
          (data.look ? [{ title: "Look 1", items: data.look }] : []) ||
          [];

        preparedLooks = looks.map((look, idx) => {
          const mappedItems = (look.items || [])
            .map((it, i) => {
              const tinaId =
                it.wardrobe_id ??
                it.wardrobeId ??
                it.item_id ??
                it.doc_id ??
                it.id;
              const tinaIdx = it.idx ?? it.index ?? it.wardrobe_idx;
              const tinaPath = it.image_path ?? it.imagePath ?? "";
              const tinaUrl =
                it.image_url ?? it.image_uri ?? it.image ?? it.url ?? "";

              let w = null;

              if (tinaId != null) {
                w = WARDROBE_BY_ID.get(String(tinaId)) || null;
              }
              if (!w && tinaIdx != null) {
                w = WARDROBE_BY_ID.get(`idx:${String(tinaIdx)}`) || null;
              }
              if (!w && tinaPath) {
                w = WARDROBE_BY_PATH.get(String(tinaPath)) || null;
              }
              if (!w && tinaUrl) {
                const key = normalizeUrl(tinaUrl);
                w = WARDROBE_BY_URL.get(key) || null;
              }

              if (!w) {
                const canRenderFromUrl =
                  !!tinaUrl && String(tinaUrl).startsWith("http");

                if (canRenderFromUrl) {
                  return {
                    id: it.wardrobe_id || it.id || `agent-${idx}-${i}`,
                    name: it.name || it.title || "Extra piece",
                    category: it.category || "",
                    color: it.color || "",
                    image_url: tinaUrl,
                    tags: Array.isArray(it.tags) ? it.tags : [],
                    source: "agent_unmatched",
                  };
                }

                return null;
              }

              return {
                id: w.id,
                name:
                  w.displayName ||
                  w.name ||
                  it.name ||
                  (w.category ? formatLabel(w.category) : `Item ${i + 1}`),
                category: w.category || it.category || "",
                color: w.color || it.color || "",
                image_url: w.image_url,
                tags: Array.isArray(w.tags) ? w.tags : [],
                source: "wardrobe",
              };
            })
            .filter(Boolean);

          const { title, note } = sanitizeCopy(
            look.title || `Look ${idx + 1}`,
            look.style_note || "Suggested look",
            mappedItems,
          );

          return {
            outfit_id:
              look.outfit_id ||
              look.outfitId ||
              `outfit_${feedbackSessionIdRef.current}_${idx}`,
            title,
            style_note: note,
            trends_used: look.trends_used || [],
            validation: look.validation?.styleRules || null,
            items: mappedItems,
          };
        });
      }

      if (swapTarget && baseLook && Array.isArray(preparedLooks)) {
        preparedLooks = preparedLooks.map((lk) => ({
          ...lk,
          items: applyLocks(baseLook, lk, swapTarget),
        }));
      }

      const finalLooks = (preparedLooks || [])
      .map((look) => {
        const safeItems = (look.items || []).filter(
          (it) => !!it && (!!it.image_url || it.source === "uploaded_item")
        );
        return {
          ...look,
          items: safeItems,
        };
      })
      .filter((look) => Array.isArray(look.items) && look.items.length > 0);

      console.log("✅ Final looks for UI:", finalLooks);

      setOutfit(finalLooks);

      if (finalLooks.length === 0) {
        alert(
          "No complete looks could be made from the current wardrobe. Try adding footwear (and a bag for women) or switch the occasion.",
        );
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
        if (
          data.error?.includes("no looks") ||
          data.error?.includes("No valid looks")
        ) {
          const reasons = data.rejected_reasons || [];
          const combinedReason = reasons.join(" | ");
          setOutfit([]);
          alert(
            `Tina tried her best but couldn't style a look.\nReasons: ${combinedReason}`,
          );
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
      dislikes: userPrefs.dislikes || [], // ✅ new
    });

    // 2️⃣ If fail and retry allowed — fallback to minimal
    if (!result || !Array.isArray(result.looks) || result.looks.length === 0) {
      console.warn(
        "⚠️ Retry: Tina failed to find a look. Trying simplified prompt...",
      );

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
          title: look.title,
          style_note: look.style_note || "Suggested look",
          items: dedupe(
            (look.items || [])
              .map((it, i) => {
                const tinaUrl = it.image_url || it.image || "";
                const tinaId = it.wardrobe_id ?? it.item_id ?? it.id ?? it.idx;
                const tinaPath = it.image_path ?? it.imagePath ?? "";

                let w = null;
                // 1) ID match
                if (tinaId != null) w = WARDROBE_BY_ID.get(String(tinaId));
                // 2) image_path match
                if (!w && tinaPath) w = WARDROBE_BY_PATH.get(String(tinaPath));
                // 3) URL match (normalized)
                if (!w && tinaUrl) {
                  const key = normalizeUrl(tinaUrl);
                  w =
                    WARDROBE_BY_URL.get(key) ||
                    items.find(
                      (wi) => wi.image_url && sameImage(wi.image_url, tinaUrl),
                    );
                }

                if (!w && !SHOW_INSPIRATION) return null;

                if (w) {
                  console.debug("✅ Matched Tina item to wardrobe", {
                    tinaId,
                    tinaUrl: normalizeUrl(tinaUrl),
                    matchedId: w.id,
                    matchedUrl: normalizeUrl(w.image_url),
                  });
                }

                return w
                  ? {
                      id: w.id,
                      name:
                        w.displayName ||
                        w.name ||
                        it.name ||
                        (w.category
                          ? formatLabel(w.category)
                          : `Item ${i + 1}`),
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
              .filter(Boolean),
          ),
        })),
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
    const cats = (look.items || []).map((p) =>
      (p.category || "").toLowerCase(),
    );
    const hasTop = cats.some((c) =>
      /top|shirt|tee|t-?shirt|blouse|kurta|kameez|choli|outer|blazer|jacket|coat/.test(
        c,
      ),
    );

    const hasBottom = cats.some((c) =>
      /bottom|jeans|pants|trouser|skirt|shorts|palazzo|salwar|gharara|sharara|dhoti/.test(
        c,
      ),
    );

    const hasFootwear = cats.some((c) =>
      /footwear|shoe|sandal|heel|sneaker|jutti|boot/.test(c),
    );
    const hasOnePiece = cats.some((c) =>
      /dress|jumpsuit|saree|lehenga|gown|anarkali/.test(c),
    );

    const onlyAccessories =
      cats.length > 0 &&
      cats.every((c) =>
        /accessor|sunglass|watch|bag|belt|scarf|dupatta|stole|shawl/.test(c),
      );
    return (
      !onlyAccessories &&
      ((hasTop && hasBottom && hasFootwear) || (hasOnePiece && hasFootwear))
    );
  }

  // ✅ Keep title/note honest if model copy drifts (belt/jewelry wording is okay)
  function sanitizeCopy(title = "", note = "", items = []) {
    const text = `${title} ${note}`.toLowerCase();
    const cats = items.map((it) => (it.category || "").toLowerCase());
    const haveDress = cats.some((c) => /dress|jumpsuit|gown/.test(c));
    const haveHeels =
      cats.some((c) => /heel/.test(c)) &&
      cats.some((c) => /footwear|shoe|sandal|heel|sneaker|jutti|boot/.test(c));
    let safeTitle = title;
    let safeNote = note;

    if (!haveDress && /dress|gown/.test(text)) {
      safeTitle = safeTitle.replace(/dress|gown/gi, "look");
      safeNote = safeNote.replace(/dress|gown/gi, "outfit");
    }
    if (!haveHeels && /heels?/.test(text)) {
      safeNote = safeNote.replace(/heels?/gi, "footwear");
    }

    // If copy is now too vague, add factual pieces summary
    const names = items.map((h) => h.name || h.category || "").filter(Boolean);
    if (!/top|bottom|footwear|dress|jumpsuit|outer/i.test(safeNote)) {
      safeNote = `${safeNote ? safeNote + " " : ""}Pieces: ${names.slice(0, 3).join(", ")}.`;
    }

    return {
      title: safeTitle.trim() || "Polished Look",
      note: safeNote.trim(),
    };
  }

  // ✅ Badge helpers to show what was auto-added by backend
  function hasBag(items = []) {
    return items.some((i) =>
      /(bag|handbag|tote|purse)/i.test(i.name || i.category || ""),
    );
  }
  function hasBelt(items = []) {
    return items.some((i) => /belt/i.test(i.name || ""));
  }

  const openEditModal = (item) => {
    setSelectedItem(item);
    setEditedTags(item.tags || []);
    setShowModal(true);
  };

  const saveEditedTags = () => {
    const updatedItems = items.map((it) =>
      it.id === selectedItem.id ? { ...it, tags: editedTags } : it,
    );
    setItems(updatedItems);
    setShowModal(false);
  };

  // 💎 Clean, case-friendly filtering
  const filteredItems = items
  .filter((item) => item?.source !== "staple") // ✅ hide staples from wardrobe page
  .filter((item) => {
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
                alt={user.displayName || "User"}
                style={{ width: "100%", height: "100%", borderRadius: "50%" }}
              />
            ) : (
              (user.displayName || user.email || "U").charAt(0).toUpperCase()
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
            <h1 className="section-title">
              Welcome to W.O.W. – Your AI Stylist Assistant
            </h1>
            <p
              style={{
                fontSize: "1.125rem",
                color: "var(--neutral-600)",
                marginBottom: "var(--spacing-xl)",
              }}
            >
              Your personal wardrobe assistant. Please login to continue.
            </p>
            <button className="btn btn-accent" onClick={handleLogin}>
              Login with Google
            </button>
          </div>
        ) : (
          <>
            

            {activeTab === "upload" && (
              <section className="section upload-page">
                <h2 className="section-title">Add to Wardrobe</h2>
                <p className="section-description">
                  Upload photos, add staples, or search for items
                </p>

                {/* 1. Upload / Camera Section */}
                <div className="upload-section">
                  <div
                    className="section-header"
                    onClick={() => setUploadExpanded(!uploadExpanded)}
                  >
                    <h3 className="section-subtitle">Upload / Camera</h3>

                    <span
                      className={`expand-icon ${uploadExpanded ? "expanded" : ""}`}
                    >
                      ▼
                    </span>
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
                            <div className="upload-card__sub">
                              Choose from your device
                            </div>
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
                              setFiles(picked); // camera typically gives 1, but keep consistent
                              setFile(picked[0] || null);
                            }}
                            className="upload-input"
                          />

                          <div className="upload-card__top">
                            <div className="upload-card__title">Camera</div>
                            <div className="upload-card__sub">
                              Take a new photo
                            </div>
                          </div>
                          <div className="upload-card__cta">Open camera</div>
                        </label>
                      </div>

                      {file && (
                        <div className="upload-preview">
                          {activeFile && (
                            <div className="muted" style={{ marginBottom: 8 }}>
                              Processing: <b>{activeFile.name}</b>{" "}
                              {fileQueue?.length
                                ? `(${files.length - fileQueue.length + 1} / ${files.length})`
                                : ""}
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
                            {busyDetecting
                              ? "Detecting…"
                              : uiCopy.upload.detectBtn}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Detected Items Results */}
                {detectedItems.length > 0 && (
                  <div className="upload-results">
                    <h3 className="section-subtitle">
                      {uiCopy.upload.detectedTitle}
                    </h3>

                    <div className="detected-items">
                      {detectedItems.map((item, i) => (
                        <div key={i} className="detected-item card">
                          {/* Image + checkbox */}
                          <div className="detected-item-image">
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="preview-image"
                            />
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
                              <h4 className="detected-item-title">
                                {item.name || "Unnamed"}
                              </h4>
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
                                {item.category || "—"} •{" "}
                                <span className="color-highlight">
                                  {item.color || "—"}
                                </span>
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
                                    onChange={(e) =>
                                      handleDetectedChange(
                                        i,
                                        "name",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="e.g., T-shirt"
                                  />
                                </div>

                                <div className="form-row">
                                  <label className="form-label">Category</label>
                                  <input
                                    className="form-input"
                                    type="text"
                                    value={item.category || ""}
                                    onChange={(e) =>
                                      handleDetectedChange(
                                        i,
                                        "category",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="e.g., Clothing/Upper"
                                  />
                                </div>

                                <div className="form-row">
                                  <label className="form-label">Color</label>
                                  <input
                                    className="form-input"
                                    type="text"
                                    value={item.color || ""}
                                    onChange={(e) =>
                                      handleDetectedChange(
                                        i,
                                        "color",
                                        e.target.value,
                                      )
                                    }
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
                                    onChange={(e) =>
                                      handleDetectedChange(
                                        i,
                                        "tags",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="comma, separated, tags"
                                  />
                                </div>

                                <p className="muted" style={{ marginTop: 6 }}>
                                  These edits will be used when saving to your
                                  wardrobe.
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
                    <span
                      className={`expand-icon ${quickAddExpanded ? "expanded" : ""}`}
                    >
                      ▼
                    </span>
                  </div>

                  {quickAddExpanded && (
                    <div className="section-content">
                      <div className="quickadd-grid">
                        {staples.length === 0 && (
                          <p>No staples found. Try again later.</p>
                        )}
                        {staples.map((staple, index) => (
                          <div
                            key={`${staple.id || staple.name || "staple"}-${index}`}
                            className="quickadd-card"
                            onClick={() =>
                              handleQuickAdd(
                                {
                                  color: staple.color || "Default",
                                  image_url: staple.image_url || "",
                                },
                                staple.name || "Staple",
                                staple.category || "Staple",
                              )
                            }
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) =>
                              (e.key === "Enter" || e.key === " ") &&
                              handleQuickAdd(
                                {
                                  color: staple.color || "Default",
                                  image_url: staple.image_url || "",
                                },
                                staple.name || "Staple",
                                staple.category || "Staple",
                              )
                            }
                          >
                            <div className="quickadd-image-wrap">
                              {staple.image_url ? (
                                <img
                                  src={staple.image_url}
                                  alt={staple.name || "Staple"}
                                  loading="lazy"
                                  onError={(e) =>
                                    (e.currentTarget.style.display = "none")
                                  }
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
                    <span
                      className={`expand-icon ${searchExpanded ? "expanded" : ""}`}
                    >
                      ▼
                    </span>
                  </div>

                  {searchExpanded && (
                    <div className="section-content">
                      <div className="search-pill">
                        <input
                          type="text"
                          placeholder="Search products (e.g. white sneakers)"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleProductSearch()
                          }
                        />
                        <button onClick={handleProductSearch}>🔍</button>
                      </div>

                      {searchResults.length > 0 && (
                        <div className="search-results">
                          <h4 className="results-title">
                            Found {searchResults.length} products
                          </h4>
                          <div className="quickadd-grid">
                            {searchResults.map((product, i) => (
                              <div
                                key={i}
                                className="quickadd-card"
                                onClick={() =>
                                  handleProductSelect({
                                    image_url:
                                      product.image_url ||
                                      product.thumbnail ||
                                      product.url,
                                    name:
                                      product.name ||
                                      product.title ||
                                      "Unnamed",
                                    category: "Search",
                                    color: product.color || "Unknown",
                                    tags: [],
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
                  <div className="toast-notification">{toastMessage}</div>
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
                          tags: editForm.tags
                            .split(",")
                            .map((tag) => tag.trim()),
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
                  <p className="subtitle">
                    Tap an item to view details. Add more pieces to unlock
                    better looks.
                  </p>
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
                        style={{
                          background: "var(--accent-pink)",
                          color: "var(--primary-white)",
                        }}
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
                      onKeyDown={(e) =>
                        (e.key === "Enter" || e.key === " ") && openModal(item)
                      }
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
                        <img
                          className="item-img"
                          src={item.image_url}
                          alt={item.displayName || item.name || "Item"}
                        />
                      )}

                      {/* Hover actions (edit/delete) */}
                      <div
                        className="item-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="icon-btn"
                          aria-label="Edit item"
                          onClick={() => openEditModal(item)}
                        >
                          ✏️
                        </button>
                        <button
                          className="icon-btn"
                          aria-label="Delete item"
                          onClick={() => handleDelete(item.id)}
                        >
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

            
            {activeTab === "stylepiece" && (
            <StylePiecePage
              user={user}
              userPrefs={userPrefs}
              items={items}
              city={city}
              setCity={setCity}
              baseUrl={BASE_URL}
            />
            )}
            
            {/* Weekly Planner */}
            {activeTab === "planner" && (
              <section style={{ marginTop: "2rem" }}>
                <WeeklyPlanner uid={user?.uid} onOpenPlan={openPlanViewer} />
              </section>
            )}

            {/* Profile Section */}
            {activeTab === "profile" && (
              <section className="section" style={{ paddingBottom: 120 }}>
                {needsOnboarding && (
                  <div className="wow-profile-banner">
                    <span>Complete your profile for better styling</span>
                    <button onClick={() => setOnboardingOpen(true)}>
                      Complete Profile
                    </button>
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
                        e.target.value.split(",").map((t) => t.trim()),
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
            onClick={(e) => e.stopPropagation()} // keep clicks inside
          >
            <img src={modalItem.image_url} alt={modalItem.name} />

            <h3>
              {modalItem.primaryTag ||
                formatLabel(
                  modalItem.name || modalItem.category || "Wardrobe Item",
                )}
            </h3>

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
              boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Add to Calendar</h3>

            <label
              className="form-label"
              style={{ display: "block", marginTop: 10 }}
            >
              Date
            </label>
            <input
              type="date"
              className="form-input"
              value={planForm.date}
              onChange={(e) =>
                setPlanForm({ ...planForm, date: e.target.value })
              }
              style={{ width: "100%" }}
            />

            <label
              className="form-label"
              style={{ display: "block", marginTop: 12 }}
            >
              Title
            </label>
            <input
              type="text"
              className="form-input"
              value={planForm.title}
              onChange={(e) =>
                setPlanForm({ ...planForm, title: e.target.value })
              }
              placeholder="e.g., Airport Travel Look"
              style={{ width: "100%" }}
            />

            <label
              className="form-label"
              style={{ display: "block", marginTop: 12 }}
            >
              Note
            </label>
            <textarea
              className="form-input"
              value={planForm.note}
              onChange={(e) =>
                setPlanForm({ ...planForm, note: e.target.value })
              }
              placeholder="Add any extra comments…"
              rows={4}
              style={{ width: "100%" }}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 16,
              }}
            >
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
        <div
          className="wow-bottom-nav__pill"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            width: "min(1100px, calc(100vw - 24px))",
            gap: "4px",
          }}
        >
          {[
          { label: "Style", key: "stylepiece" },
          { label: "Closet", key: "wardrobe" },
          { label: "Add", key: "upload" },
          { label: "Plan", key: "planner" },
          { label: "Me", key: "profile" },
          ].map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`wow-bottom-nav__item ${active ? "is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className="wow-bottom-nav__label"
                  style={{
                    fontSize: "0.82rem",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
