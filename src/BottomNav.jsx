// src/BottomNav.jsx
import React from "react";

export default function BottomNav({ activeTab, setActiveTab }) {
  const tabs = [
    { label: "Wardrobe", key: "wardrobe" },
    { label: "Upload", key: "upload" },
    { label: "Stylist", key: "stylist" },
    { label: "Planner", key: "planner" },
  ];

  return (
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
      {tabs.map((tab) => (
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
  );
}
