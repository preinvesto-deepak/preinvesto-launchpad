import { useState } from "react";
import { GROUP_OPTIONS } from "../data/priceData";

// Which Items Pricing group a box-material label belongs to — opens the
// picker on the right tab so "Door Ply" starts in Wood, etc.
const LABEL_TO_GROUP = {
  "Door Ply":         "Wood",
  "Back Ply":         "Wood",
  "Carcase Ply":      "Wood",
  "Outside Laminate": "Laminate",
  "Inside Laminate":  "Laminate",
  "Edge Beading":     "Edge Beading",
};

// Picks a MATERIAL (the same one-row-per-name list the Material Models page
// shows) — no brand, no rate. Brand and cost are decided afterwards, per
// Economy/Standard/Premium, on Material Models; templates and projects only
// record which material is needed.
//
// onSelect receives one Items Pricing row of the chosen material (the first,
// exactly what typing the name into the field resolves to), so callers keep
// storing { name, id } as before — everything downstream is keyed by name.
function MaterialModelPicker({ label, prices, onSelect, onClose, initialGroup }) {
  const [filterGroup, setFilterGroup] = useState(initialGroup || LABEL_TO_GROUP[label] || "All");
  const [search, setSearch] = useState("");

  const seen = new Set();
  const materials = (prices || []).filter((p) => {
    if (!p.materialName || seen.has(p.materialName)) return false;
    seen.add(p.materialName);
    return true;
  });

  const allGroups = ["All", ...Array.from(new Set([
    ...GROUP_OPTIONS,
    ...materials.map((p) => p.group || "").filter(Boolean),
  ]))];

  const q = search.toLowerCase();
  const results = materials.filter((p) => {
    const matchTab = filterGroup === "All" || (p.group || "") === filterGroup;
    const matchSearch = !q ||
      p.materialName.toLowerCase().includes(q) ||
      (p.group || "").toLowerCase().includes(q) ||
      (p.materialSpec || "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "84vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ background: "#1e3a5f", color: "#fff", padding: "14px 20px", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Pick a material</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>For "{label || "Hardware & Consumables"}" — brand and cost are set on Material Models</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, width: 30, height: 30, fontSize: 16, cursor: "pointer", padding: 0 }}>✕</button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 0", borderBottom: "2px solid #e5e7eb", padding: "8px 16px 0", background: "#fff", flexShrink: 0 }}>
          {allGroups.map((g) => {
            const active = filterGroup === g;
            const count = g === "All" ? materials.length : materials.filter((p) => (p.group || "") === g).length;
            return (
              <button key={g} onClick={() => setFilterGroup(g)} style={{
                padding: "6px 12px", fontSize: 12, fontWeight: active ? 700 : 500,
                border: "none", borderBottom: active ? "3px solid #2563eb" : "3px solid transparent",
                borderRadius: "6px 6px 0 0", background: "transparent",
                color: active ? "#2563eb" : "#6b7280", cursor: "pointer", whiteSpace: "nowrap", marginBottom: -2,
              }}>
                {g} <span style={{ fontSize: 10, opacity: 0.65 }}>({count})</span>
              </button>
            );
          })}
        </div>

        <div style={{ padding: "10px 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
          <input
            autoFocus type="text" placeholder="Search by material name, spec, group…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", fontSize: 14, borderRadius: 8, border: "1px solid #d1d5db", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {results.length === 0 ? (
            <p style={{ color: "#9ca3af", textAlign: "center", padding: 32 }}>No matching materials found.</p>
          ) : results.map((p) => {
            const displayImg = (p.images || []).find((i) => i.isDisplay);
            return (
              <div
                key={p.materialName}
                onClick={() => onSelect(p)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 7, overflow: "hidden", border: "1px solid #e5e7eb", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {displayImg ? <img src={displayImg.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 18, color: "#d1d5db" }}>🖼</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{p.materialName}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{[p.group, p.materialSpec, p.unit].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default MaterialModelPicker;
