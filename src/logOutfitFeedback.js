// src/lib/logOutfitFeedback.js
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export async function logOutfitFeedback({
  uid,
  occasion,
  vibe,
  action,
  outfit_id,
  items = [],
  reason_tags = [],
  meta = {}
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
    meta: meta && typeof meta === "object" ? meta : {},
    created_at: serverTimestamp(),
  };


  const ref = await addDoc(collection(db, "outfitFeedback"), payload);
  console.log("✅ outfitFeedback saved:", ref.id, payload);
  return { id: ref.id, ...payload };
}
