import React, { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import "./Planner.css";

export default function WeeklyPlanner({ uid, onOpenPlan = () => {} }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [plannedOutfits, setPlannedOutfits] = useState({});
  const [user, setUser] = useState(null);

  // ✅ Get logged-in user
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsub();
  }, []);

  // ✅ Fetch outfit plans for current week
  useEffect(() => {
    const fetchPlannedOutfits = async () => {
      if (!user) return;

      const start = new Date(selectedDate);
      start.setDate(start.getDate() - start.getDay()); // Sunday
      const end = new Date(start);
      end.setDate(start.getDate() + 6); // Saturday

      const startKey = start.toISOString().split("T")[0];
      const endKey = end.toISOString().split("T")[0];

      try {
        const q = query(
          collection(db, "outfit_plans"),
          where("uid", "==", user.uid),
          where("date", ">=", startKey),
          where("date", "<=", endKey)
        );

        const snapshot = await getDocs(q);
        const plans = {};
        snapshot.forEach((snap) => {
          const data = snap.data();
          plans[data.date] = data.outfit;
        });

        setPlannedOutfits(plans);
      } catch (err) {
        console.error("❌ Error fetching weekly outfits:", err.message);
      }
    };

    fetchPlannedOutfits();
  }, [selectedDate, user]);

  const formatDateKey = (date) => date.toISOString().split("T")[0];

  const handleAddOutfit = async () => {
    const key = formatDateKey(selectedDate);
    const title = prompt("Enter outfit title:");
    if (!title) return;

    const outfitData = {
      title,
      vibe: "Professional",
      note: "Work meeting",
    };

    setPlannedOutfits((prev) => ({ ...prev, [key]: outfitData }));

    try {
      const myUid = user?.uid;
      if (!myUid) return alert("User not logged in.");

      await setDoc(doc(db, "outfit_plans", `${myUid}_${key}`), {
        uid: myUid,
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
    d.setDate(d.getDate() - d.getDay() + i); // Sunday to Saturday
    return d;
  });

  return (
    <div className="section">
      <h2 className="section-title">Weekly Outfit Planner</h2>

      <div className="planner-calendar">
        <h3 className="section-subtitle">📅 Choose Your Date</h3>
        <div className="calendar-container">
          <Calendar value={selectedDate} onChange={setSelectedDate} />
        </div>
        <button
          onClick={handleAddOutfit}
          className="btn btn-primary"
          style={{ marginTop: "var(--spacing-lg)" }}
        >
          ✨ Plan New Outfit
        </button>
      </div>

      <div className="week-overview">
        <h3 className="section-subtitle">🗓️ Your Week at a Glance</h3>
        <div className="week-grid">
          {weekDates.map((date, idx) => {
            const key = formatDateKey(date);
            const data = plannedOutfits[key];
            const isSelected = key === formatDateKey(selectedDate);

            return (
              <button
                type="button"
                className={`week-day-card card ${isSelected ? "selected" : ""}`}
                key={idx}
                onClick={() => {
                  setSelectedDate(date);
                  if (data) {
                    onOpenPlan({
                      id: `${user?.uid || "u"}_${key}`,
                      date: key,
                      outfit: data,
                    });
                  }
                }}
                aria-label={`Open planned outfit for ${key}`}
                style={{
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <div className="day-header">
                  <h4 className="day-name">
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                  </h4>
                  <p className="day-date">{date.getDate()}</p>
                </div>
                <div className="day-content">
                  {data ? (
                    <>
                      <p className="outfit-title">{data.title}</p>
                      <p className="outfit-note">{data.note}</p>
                      <span className="tag tag-accent">{data.vibe}</span>
                    </>
                  ) : (
                    <p className="no-plan">No outfit planned</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {Object.keys(plannedOutfits).length > 0 && (
        <div className="planned-outfits">
          <h3 className="section-subtitle">🧾 All Planned Outfits</h3>
          <div className="planned-grid">
            {Object.entries(plannedOutfits)
              .sort(([a], [b]) => new Date(a) - new Date(b))
              .map(([key, outfit], i) => {
                const date = new Date(key);
                return (
                  <button
                    type="button"
                    key={i}
                    className="planned-outfit-card card"
                    onClick={() =>
                      onOpenPlan({
                        id: `${user?.uid || "u"}_${key}`,
                        date: key,
                        outfit,
                      })
                    }
                    aria-label={`Open planned outfit for ${key}`}
                    style={{
                      textAlign: "left",
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    <div className="planned-date">
                      <span className="date-day">{date.getDate()}</span>
                      <span className="date-month">
                        {date.toLocaleDateString("en-US", { month: "short" })}
                      </span>
                    </div>
                    <div className="planned-details">
                      <h4 className="planned-title">{outfit.title}</h4>
                      <p className="planned-note">{outfit.note}</p>
                      <span className="tag">{outfit.vibe}</span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
