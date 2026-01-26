// src/lib/logOutfitFeedback.js
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export async function logOutfitFeedback({
  uid,
  occasion,
  vibe,
  action,       // "love" | "dislike" | "swap" | "save"
  outfit_id,    // must NOT be null
  items = [],   // [{ wardrobe_id, name, category }]
  reason_tags = []
}) {
  if (!uid) throw new Error("logOutfitFeedback: uid missing");
  if (!outfit_id) throw new Error("logOutfitFeedback: outfit_id missing");
  if (!action) throw new Error("logOutfitFeedback: action missing");

  const payload = {
    uid,
    occasion: occasion || null,
    vibe: vibe || null,
    action,
    outfit_id,
    items: Array.isArray(items) ? items : [],
    reason_tags: Array.isArray(reason_tags) ? reason_tags : [],
    created_at: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, "outfitFeedback"), payload);
  console.log("✅ outfitFeedback saved:", ref.id, payload);
  return { id: ref.id, ...payload };

}
