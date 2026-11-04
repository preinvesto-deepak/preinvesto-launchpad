import { useState } from "react";
import { useAppData } from "../context/AppDataContext";
import { ALL_SERVICES, SERVICES, WARDROBE_SERVICE, WARDROBE_HIDDEN } from "../utils/services";
import AddServiceModal from "./AddServiceModal";

// Chip row for narrowing a list to one service — "All", Wardrobe / Modular,
// the built-ins, then any the account added. `counts` (optional) is
// { [service]: n }. "+ Add service" defines a new one; ✎ on a chip opens the
// rename / delete dialog.
export default function ServiceFilter({ value, onChange, counts, style }) {
  const { setCompanyProfile } = useAppData();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(null);

  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, ...style }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 2 }}>Service</span>
      {["All", ...ALL_SERVICES].map((s) => {
        const active = value === s;
        const n = counts ? (s === "All" ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[s] || 0) : null;
        const editable = !!SERVICES[s] || s === WARDROBE_SERVICE;
        return (
          <span key={s} style={{ display: "inline-flex", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => onChange(s)}
              style={{
                padding: "4px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                borderRadius: editable ? "999px 0 0 999px" : 999, ...(editable ? { borderRight: "none" } : null),
                border: `1px solid ${active ? "#7c3aed" : "#ddd6fe"}`,
                background: active ? "#7c3aed" : "#faf5ff",
                color: active ? "#fff" : "#6d28d9",
                fontWeight: active ? 700 : 500,
              }}
            >
              {s}{n !== null && <span style={{ opacity: 0.7 }}> ({n})</span>}
            </button>
            {editable && (
              <button
                type="button"
                title={`Rename "${s}"`}
                onClick={() => setRenaming(s)}
                style={{ padding: "4px 6px", fontSize: 11, cursor: "pointer", border: "1px solid #ddd6fe", borderLeft: "none", borderRight: "1px solid #ddd6fe", borderRadius: "0 999px 999px 0", background: "#faf5ff", color: "#7c3aed" }}
              >✎</button>
            )}
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => setAdding(true)}
        style={{ padding: "4px 12px", fontSize: 12, borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", border: "1px dashed #a78bfa", background: "#fff", color: "#7c3aed", fontWeight: 600 }}
      >+ Add service</button>
      {WARDROBE_HIDDEN && (
        <button
          type="button"
          onClick={() => setCompanyProfile((c) => ({ ...c, wardrobeHidden: false }))}
          style={{ padding: "4px 12px", fontSize: 12, borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", border: "1px dashed #d1d5db", background: "#fff", color: "#6b7280" }}
        >Restore {WARDROBE_SERVICE}</button>
      )}
      {adding && <AddServiceModal onClose={() => setAdding(false)} onAdded={(name) => onChange(name)} />}
      {renaming && <AddServiceModal editing={renaming} onClose={() => setRenaming(null)} onAdded={(name) => { if (value === renaming) onChange(name); }} onDeleted={(name) => { if (value === name) onChange("All"); }} />}
    </div>
  );
}
