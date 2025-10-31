import { useEffect, useMemo, useState } from "react";

const BASE_URL = "https://wow-wardrobe-backend-himjabehl.replit.app";

function Chip({ children }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      marginRight: 6,
      marginBottom: 6,
      fontSize: 12,
      borderRadius: 999,
      background: "rgba(0,0,0,.06)"
    }}>{children}</span>
  );
}

function ScoreBar({ score = 0 }) {
  const pct = Math.min(100, Math.max(0, Math.round(score * 100)));
  return (
    <div style={{ background:"#eee", height:8, borderRadius:8, overflow:"hidden" }}>
      <div style={{ width:`${pct}%`, height:8, background:"#6b46c1" }} />
    </div>
  );
}

export default function TrendsPanel({ initialQuery = "general", initialLimit = 8 }) {
  const [q, setQ] = useState(initialQuery);
  const [limit, setLimit] = useState(initialLimit);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);

  const presetTags = useMemo(() => ([
    "general", "cocktail", "wedding", "festive", "workwear",
    "date", "brunch", "mehendi", "haldi", "reception"
  ]), []);

  async function fetchTrends() {
    try {
      setLoading(true);
      setErr("");
      const url = `${BASE_URL}/trends?limit=${limit}&query=${encodeURIComponent(q || "general")}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || "Failed to load trends");
      setRows(Array.isArray(json.trends) ? json.trends : []);
    } catch (e) {
      setErr(e.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTrends(); /* on mount */ }, []);     // eslint-disable-line
  useEffect(() => { fetchTrends(); /* on query change */ }, [q, limit]);   // eslint-disable-line

  return (
    <div style={{ border:"1px solid #e5e7eb", borderRadius:12, padding:16, marginTop:16 }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", marginBottom:12 }}>
        <strong style={{ fontSize:16 }}>Trending style cues</strong>

        {/* Preset filter chips */}
        <div style={{ marginLeft:"auto", display:"flex", gap:6, flexWrap:"wrap" }}>
          {presetTags.map(tag => (
            <button
              key={tag}
              onClick={() => setQ(tag)}
              style={{
                padding:"4px 10px",
                borderRadius:999,
                border: q === tag ? "1px solid #6b46c1" : "1px solid #ddd",
                background: q === tag ? "rgba(107,70,193,.08)" : "white",
                cursor:"pointer",
                fontSize:12
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Limit control */}
      <div style={{ marginBottom:12, display:"flex", gap:8, alignItems:"center" }}>
        <span style={{ fontSize:12, opacity:.7 }}>Query:</span>
        <input
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          placeholder="e.g., cocktail"
          style={{ padding:"6px 8px", border:"1px solid #ddd", borderRadius:8 }}
        />
        <span style={{ fontSize:12, opacity:.7 }}>Limit:</span>
        <input
          type="number"
          min={1}
          max={20}
          value={limit}
          onChange={(e)=>setLimit(Number(e.target.value||8))}
          style={{ width:64, padding:"6px 8px", border:"1px solid #ddd", borderRadius:8 }}
        />
        <button onClick={fetchTrends} style={{
          marginLeft:"auto",
          padding:"6px 12px",
          borderRadius:8,
          border:"1px solid #6b46c1",
          background:"#6b46c1",
          color:"white",
          cursor:"pointer"
        }}>
          Refresh
        </button>
      </div>

      {loading && <div style={{ fontSize:14, opacity:.7 }}>Loading trends…</div>}
      {err && <div style={{ color:"#b91c1c", fontSize:14 }}>Error: {err}</div>}
      {!loading && !err && rows.length === 0 && (
        <div style={{ fontSize:14, opacity:.7 }}>No trends found for “{q}”. Try “general”.</div>
      )}

      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",
        gap:12,
        marginTop:8
      }}>
        {rows.map((t) => (
          <div key={t.id || t.keyword} style={{ border:"1px solid #eee", borderRadius:12, padding:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:8 }}>
              <div style={{ fontWeight:700 }}>{t.keyword || "Trend"}</div>
              {t.season && <Chip>{t.season}</Chip>}
            </div>
            {t.content && <p style={{ fontSize:14, margin:"8px 0 10px" }}>{t.content}</p>}

            <div style={{ marginBottom:8 }}>
              <ScoreBar score={Number(t.score ?? 0.5)} />
              <div style={{ fontSize:11, opacity:.6, marginTop:4 }}>
                momentum {(Math.round((t.score ?? 0.5)*100))}%
              </div>
            </div>

            <div style={{ marginTop:6 }}>
              {(t.vibes || []).slice(0,6).map(v => <Chip key={`v-${v}`}>{v}</Chip>)}
              {(t.occasion || []).slice(0,6).map(o => <Chip key={`o-${o}`}>{o}</Chip>)}
            </div>

            {t.updated_at && (
              <div style={{ fontSize:11, opacity:.6, marginTop:8 }}>
                updated {new Date(t.updated_at).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
