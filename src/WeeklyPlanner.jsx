import React, { useState } from "react";
import { auth, db } from "./firebase"; // ✅ Firebase auth and firestore
import { doc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { useEffect } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css"; // ✅ keep if installed successfully
import "./Planner.css"; // We'll add custom styles here


export default function WeeklyPlanner() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [plannedOutfits, setPlannedOutfits] = useState({});
  const user = auth.currentUser;
  useEffect(() => {
    const fetchPlannedOutfits = async () => {
      const uid = user?.uid;
      if (!uid) return;

      const start = new Date(selectedDate);
      start.setDate(start.getDate() - start.getDay()); // Sunday

      const end = new Date(start);
      end.setDate(start.getDate() + 6); // Saturday

      const startKey = start.toISOString().split("T")[0];
      const endKey = end.toISOString().split("T")[0];

      try {
        const q = query(
          collection(db, "outfit_plans"),
          where("uid", "==", uid),
          where("date", ">=", startKey),
          where("date", "<=", endKey)
        );

        const snapshot = await getDocs(q);
        const plans = {};
        snapshot.forEach((doc) => {
          const data = doc.data();
          plans[data.date] = data.outfit;
        });

        setPlannedOutfits(plans);
      } catch (err) {
        console.error("❌ Error fetching weekly outfits:", err.message);
      }
    };

    fetchPlannedOutfits();
  }, [selectedDate, user]);


  const formatDateKey = (date) => date.toISOString().split("T")[0]; // YYYY-MM-DD

  const handleAddOutfit = async () => {
    const key = formatDateKey(selectedDate);
    const title = prompt("Enter outfit title:");

    if (!title) return;

    const outfitData = {
      title,
      vibe: "Professional",
      note: "Work meeting",
    };

    setPlannedOutfits({
      ...plannedOutfits,
      [key]: outfitData,
    });

    try {
      const uid = user?.uid;
      if (!uid) return alert("User not logged in.");

      await setDoc(doc(db, "outfit_plans", `${uid}_${key}`), {
        uid,
        date: key,
        outfit: outfitData,
      });

      console.log("✅ Outfit saved to Firestore!");
    } catch (err) {
      console.error("❌ Error saving outfit:", err.message);
      alert("Failed to save outfit. Try again.");
    }
  };

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - d.getDay() + i); // get week start (Sunday)
    return d;
  });

  return (
    <div className="planner-container">
      <h2>Plan Your Outfits</h2>

      <div className="calendar-wrapper">
        <h3>📅 Your Outfit Calendar</h3>
        <Calendar value={selectedDate} onChange={setSelectedDate} />
        <button onClick={handleAddOutfit} className="add-btn">
          Add Outfit
        </button>
      </div>

      <div className="week-slider">
        <h3>🗓️ Your Week at a Glance</h3>
        <div className="week-scroll">
          {weekDates.map((date, idx) => {
            const key = formatDateKey(date);
            const data = plannedOutfits[key];
            return (
              <div
                className={`day-card ${key === formatDateKey(selectedDate) ? "active" : ""}`}
                key={idx}
              >
                <h4>{date.toDateString().slice(0, 10)}</h4>
                {data ? (
                  <>
                    <p>
                      <strong>{data.title}</strong>
                    </p>
                    <p>{data.note}</p>
                    <span className="tag">{data.vibe}</span>
                  </>
                ) : (
                  <p>No plan yet</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="planned-list">
        <h3>🧾 Planned Outfits</h3>
        {Object.entries(plannedOutfits).map(([key, outfit], i) => (
          <div key={i} className="planned-card">
            <strong>{key}</strong> – {outfit.title} ({outfit.note}){" "}
            <span className="tag planned">{outfit.vibe}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
