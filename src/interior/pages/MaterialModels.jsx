import { useState, useRef } from "react";
import { useAppData } from "../context/AppDataContext";
import { GROUP_OPTIONS } from "../data/priceData";

const MODELS = ["economy", "standard", "premium"];
const MODEL_LABELS = { economy: "Economy", standard: "Standard", premium: "Premium" };
const MODEL_COLORS = { economy: "#059669", standard: "#2563eb", premium: "#7c3aed" };

const emptyModel = () => ({ brand: "", baseRate: "", rate: "", gst: "18", rateWithGst: "" });
const emptyRates = () => ({ economy: emptyModel(), standard: emptyModel(), premium: emptyModel() });

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcWithGst(rate, gst) {
  const r = parseFloat(rate);
  const g = parseFloat(gst);
  if (isNaN(r) || isNaN(g)) return "";
  return (r * (1 + g / 100)).toFixed(2);
}
function calcWithoutGst(rateWithGst, gst) {
  const r = parseFloat(rateWithGst);
  const g = parseFloat(gst);
  if (isNaN(r) || isNaN(g)) return "";
  return (r / (1 + g / 100)).toFixed(2);
}
// Base (pre-profit) rate × (1 + profit%) → the effective rate that GST is
// then calculated on, and the value actually saved/used everywhere downstream
// (BOQ/Quotation) — so profit flows through automatically once saved.
function applyProfit(baseRate, profitPercent) {
  const b = parseFloat(baseRate);
  const p = parseFloat(profitPercent) || 0;
  if (isNaN(b)) return "";
  return (b * (1 + p / 100)).toFixed(2);
}

// ── Item Picker Modal ─────────────────────────────────────────────────────────
function ItemPickerModal({ materialName, prices, onSelect, onClose, initialGroup }) {
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState(initialGroup || "All");

  const allGroups = ["All", ...Array.from(new Set([
    ...GROUP_OPTIONS,
    ...(prices || []).map((p) => p.group || "").filter(Boolean),
  ]))];

  // Show items from Items Pricing — prioritise same-name matches, then all
  const results = prices.filter((p) => {
    const grp = p.group || "";
    const matchTab = filterGroup === "All" || grp === filterGroup;
    const q = search.toLowerCase();
    const matchSearch = q
      ? (p.materialName || "").toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.group || "").toLowerCase().includes(q) ||
        (p.materialSpec || "").toLowerCase().includes(q)
      : (p.materialName || "").toLowerCase().includes(materialName.toLowerCase());
    return matchTab && matchSearch;
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "84vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>

        {/* Header */}
        <div style={{ background: "#1e3a5f", color: "#fff", padding: "14px 20px", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Pick from Items Pricing</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>For "{materialName}"</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, width: 30, height: 30, fontSize: 16, cursor: "pointer", padding: 0 }}>✕</button>
        </div>

        {/* Group tabs — defaults to the material's own group so switching
            brands stays within the same category unless changed. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 0", borderBottom: "2px solid #e5e7eb", padding: "8px 16px 0", background: "#fff", flexShrink: 0 }}>
          {allGroups.map((g) => {
            const active = filterGroup === g;
            const count = g === "All" ? prices.length : prices.filter((p) => (p.group || "") === g).length;
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

        {/* Search */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
          <input
            autoFocus type="text" placeholder="Search by name, brand, spec, group…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", fontSize: 14, borderRadius: 8, border: "1px solid #d1d5db", boxSizing: "border-box" }}
          />
        </div>

        {/* Results */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {results.length === 0 ? (
            <p style={{ color: "#9ca3af", textAlign: "center", padding: 32 }}>No matching items found.</p>
          ) : results.map((p) => {
            const rateWithGst = p.rate > 0 ? (p.rate * (1 + (p.gst || 0) / 100)) : 0;
            const displayImg = (p.images || []).find((i) => i.isDisplay);
            return (
              <div key={p.id} onClick={() => onSelect(p)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#eff6ff"}
                onMouseLeave={(e) => e.currentTarget.style.background = ""}
              >
                {/* Thumb */}
                <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 7, overflow: "hidden", border: "1px solid #e5e7eb", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {displayImg
                    ? <img src={displayImg.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 18, color: "#d1d5db" }}>🖼</span>}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{p.materialName}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    {[p.group, p.brand, p.materialSpec, p.unit].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {/* Rate */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {p.rate > 0 ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>₹{Number(p.rate).toLocaleString("en-IN")}</div>
                      {rateWithGst > 0 && <div style={{ fontSize: 11, color: "#059669" }}>₹{rateWithGst.toLocaleString("en-IN", { maximumFractionDigits: 2 })} +GST</div>}
                    </>
                  ) : <span style={{ fontSize: 12, color: "#d1d5db" }}>No rate</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
function MaterialModels() {
  const { prices, materialModelRates, setMaterialModelRates, materialModelProfitPercent, setMaterialModelProfitPercent, projects, setProjects } = useAppData();

  const [searchGroup, setSearchGroup] = useState("");
  const [searchName, setSearchName] = useState("");
  const [activeGroup, setActiveGroup] = useState("All");

  // Local edits buffer — keyed by materialName
  const [edits, setEdits] = useState({});
  // picker: { materialName, model } | null
  const [picker, setPicker] = useState(null);

  const groups = ["All", ...Array.from(new Set(prices.map((p) => p.group || p.category || "").filter(Boolean)))];

  const filtered = prices.filter((p) => {
    const grp = p.group || p.category || "";
    const matchTab = activeGroup === "All" || grp === activeGroup;
    const matchGroup = !searchGroup || grp.toLowerCase().includes(searchGroup.toLowerCase());
    const matchName = !searchName || (p.materialName || "").toLowerCase().includes(searchName.toLowerCase());
    return matchTab && matchGroup && matchName;
  });

  // A material can have several brand-specific Items Pricing rows (e.g. "9mm
  // Ply" priced separately from Gurjan/green Ply/Century), but Economy/
  // Standard/Premium rates are tracked once per materialName (see getRates),
  // not once per supplier row — so only list each material name once here.
  const seenNames = new Set();
  const displayItems = filtered.filter((p) => {
    if (!p.materialName || seenNames.has(p.materialName)) return false;
    seenNames.add(p.materialName);
    return true;
  });

  // Get current rates for an item (edits > saved > empty). Legacy entries
  // saved before Profit % existed have no baseRate — treat their existing
  // rate as the base (equivalent to having been saved at 0% profit).
  const getRates = (name) => {
    const r = edits[name] ?? materialModelRates[name] ?? emptyRates();
    const withBase = {};
    MODELS.forEach((model) => {
      const cell = r[model] || emptyModel();
      withBase[model] = { ...cell, baseRate: cell.baseRate !== undefined && cell.baseRate !== "" ? cell.baseRate : cell.rate };
    });
    return withBase;
  };

  const setField = (name, model, field, value) => {
    const current = getRates(name);
    const profit = Number(materialModelProfitPercent?.[model]) || 0;
    const updated = {
      ...current,
      [model]: { ...current[model], [field]: value },
    };
    // auto-calc — the "Rate (excl GST)" input edits the BASE (pre-profit)
    // rate; the effective rate (what GST applies to, and what gets saved) is
    // baseRate × (1 + profit%).
    if (field === "rate") {
      updated[model].baseRate = value;
      const effectiveRate = applyProfit(value, profit);
      updated[model].rate = effectiveRate;
      updated[model].rateWithGst = calcWithGst(effectiveRate, current[model].gst);
    } else if (field === "rateWithGst") {
      const effectiveRate = calcWithoutGst(value, current[model].gst);
      updated[model].rate = effectiveRate;
      updated[model].baseRate = profit !== -100 ? (parseFloat(effectiveRate) / (1 + profit / 100)).toFixed(2) : effectiveRate;
    } else if (field === "gst") {
      if (current[model].rate !== "") {
        updated[model].rateWithGst = calcWithGst(current[model].rate, value);
      } else if (current[model].rateWithGst !== "") {
        updated[model].rate = calcWithoutGst(current[model].rateWithGst, value);
      }
    }
    setEdits((prev) => ({ ...prev, [name]: updated }));
  };

  const onPickerSelect = (priceItem) => {
    const { materialName, model } = picker;
    const current = getRates(materialName);
    const profit = Number(materialModelProfitPercent?.[model]) || 0;
    const gst = priceItem.gst ?? 18;
    const baseRate = priceItem.rate > 0 ? String(priceItem.rate) : "";
    const rate = baseRate ? applyProfit(baseRate, profit) : "";
    const rateWithGst = rate ? calcWithGst(rate, gst) : "";
    setEdits((prev) => ({
      ...prev,
      [materialName]: {
        ...current,
        [model]: { brand: priceItem.brand || "", baseRate, rate, gst: String(gst), rateWithGst },
      },
    }));
    setPicker(null);
  };

  // Profit % changed for a model — recompute rate/rateWithGst from baseRate
  // for every material that currently has one, so the table (and Save
  // Template) reflects the new profit immediately without compounding on
  // top of an already-inflated rate.
  const applyProfitChange = (model, newProfitPercent) => {
    setMaterialModelProfitPercent((prev) => ({ ...prev, [model]: newProfitPercent }));
    const profit = Number(newProfitPercent) || 0;
    setEdits((prevEdits) => {
      const next = { ...prevEdits };
      displayItems.forEach((item) => {
        const name = item.materialName;
        const current = next[name] ?? materialModelRates[name] ?? emptyRates();
        const cell = current[model] || emptyModel();
        const base = cell.baseRate !== undefined && cell.baseRate !== "" ? cell.baseRate : cell.rate;
        if (base === "" || base === undefined) return;
        const rate = applyProfit(base, profit);
        const rateWithGst = calcWithGst(rate, cell.gst);
        next[name] = { ...current, [model]: { ...cell, baseRate: base, rate, rateWithGst } };
      });
      return next;
    });
  };

  const saveAll = () => {
    const merged = { ...materialModelRates, ...edits };
    setMaterialModelRates(merged);
    setEdits({});
    alert("Material model rates saved as template.");
  };

  const resetProjectMaterials = (projectId) => {
    if (!window.confirm("Reset this project's material models to the global template? This cannot be undone.")) return;
    setProjects((prev) => prev.map((p) =>
      p.id === projectId ? { ...p, materialModelRates: null } : p
    ));
  };

  // ── Download comparison quotation ──────────────────────────────────────────
  const downloadCSV = () => {
    const saved = { ...materialModelRates, ...edits };
    const rows = [
      ["Group", "Material", "Spec", "Unit",
        "Economy Brand", "Economy Rate", "Economy Rate+GST",
        "Standard Brand", "Standard Rate", "Standard Rate+GST",
        "Premium Brand", "Premium Rate", "Premium Rate+GST"],
    ];
    const seenNames = new Set();
    prices.forEach((p) => {
      if (!p.materialName || seenNames.has(p.materialName)) return;
      seenNames.add(p.materialName);
      const r = saved[p.materialName] ?? emptyRates();
      rows.push([
        p.group || "", p.materialName || "", p.materialSpec || "", p.unit || "",
        r.economy.brand || "", r.economy.rate || "", r.economy.rateWithGst || "",
        r.standard.brand || "", r.standard.rate || "", r.standard.rateWithGst || "",
        r.premium.brand || "", r.premium.rate || "", r.premium.rateWithGst || "",
      ]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `material-models-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasEdits = Object.keys(edits).length > 0;

  const inp = { fontSize: 12, padding: "4px 6px", borderRadius: 5, border: "1px solid #d1d5db", width: "100%", boxSizing: "border-box" };
  const smInp = { ...inp, width: 80 };

  return (
    <div style={{ margin: "0 -24px -24px -24px", display: "flex", flexDirection: "column" }}>

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div style={{ position: "sticky", top: 0, zIndex: 200, background: "#f3f4f6" }}>

        <div style={{ padding: "16px 24px 12px", background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#111827" }}>Material Models</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>Global template — Economy / Standard / Premium rates for every material. Projects inherit this and can override per-project.</p>
        </div>

        {/* Group tabs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 0", borderBottom: "2px solid #e5e7eb", padding: "10px 24px 0", background: "#fff" }}>
          {groups.map((g) => {
            const active = activeGroup === g;
            return (
              <button key={g} onClick={() => setActiveGroup(g)} style={{
                padding: "6px 13px", fontSize: 12, fontWeight: active ? 700 : 500,
                border: "none", borderBottom: active ? "3px solid #2563eb" : "3px solid transparent",
                borderRadius: "6px 6px 0 0", background: "transparent",
                color: active ? "#2563eb" : "#6b7280", cursor: "pointer", whiteSpace: "nowrap", marginBottom: -2,
              }}>{g}</button>
            );
          })}
        </div>

        {/* Filter + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", flexWrap: "wrap" }}>
          {[{ ph: "Group…", v: searchGroup, s: setSearchGroup }, { ph: "Name…", v: searchName, s: setSearchName }].map(({ ph, v, s }) => (
            <div key={ph} style={{ position: "relative", flex: 1, minWidth: 120, maxWidth: 220 }}>
              <input type="text" placeholder={ph} value={v} onChange={(e) => s(e.target.value)}
                style={{ padding: "7px 26px 7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #d1d5db", width: "100%", boxSizing: "border-box" }} />
              {v && <span onClick={() => s("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#9ca3af", fontSize: 13 }}>✕</span>}
            </div>
          ))}
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{displayItems.length} items</span>
          {hasEdits && (
            <button onClick={() => setEdits({})} style={{ marginLeft: "auto", background: "#6b7280", padding: "7px 14px", fontSize: 13 }}>Discard</button>
          )}
          <button onClick={saveAll} style={{ marginLeft: hasEdits ? 0 : "auto", background: hasEdits ? "#2563eb" : "#9ca3af", padding: "7px 16px", fontSize: 13 }}>
            {hasEdits ? "Save Template" : "Saved"}
          </button>
          <button onClick={downloadCSV} style={{ background: "#7c3aed", padding: "7px 14px", fontSize: 13 }}>⬇ Download</button>
        </div>
      </div>

      {/* ── Column header legend ───────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 1fr 1fr", gap: 0, padding: "8px 24px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 140, zIndex: 100 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Material</div>
        {MODELS.map((m) => (
          <div key={m} style={{ fontSize: 11, fontWeight: 700, color: MODEL_COLORS[m], textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid #e5e7eb", paddingLeft: 10 }}>
            {MODEL_LABELS[m]}
          </div>
        ))}
      </div>

      {/* ── Profit % row — applied on top of every material's base rate below,
          before GST, so every Rate/Rate+GST in the table includes it. ── */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 1fr 1fr", gap: 0, padding: "10px 24px", background: "#fffbeb", borderBottom: "2px solid #fde68a" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", display: "flex", alignItems: "center" }}>Profit %</div>
        {MODELS.map((model) => (
          <div key={model} style={{ borderLeft: "2px solid #fde68a", paddingLeft: 10, paddingRight: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number" placeholder="0" value={materialModelProfitPercent?.[model] ?? 0}
              onChange={(e) => applyProfitChange(model, e.target.value)}
              style={{ ...smInp, width: 70, fontWeight: 700, color: MODEL_COLORS[model], borderColor: "#f59e0b" }}
            />
            <span style={{ fontSize: 11, color: "#92400e" }}>added to every rate below</span>
          </div>
        ))}
      </div>

      {/* ── Items ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: "0 24px 40px" }}>
        {displayItems.length === 0 ? (
          <p style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>No items found.</p>
        ) : (
          displayItems.map((item, idx) => {
            const rates = getRates(item.materialName);
            const isDirty = !!edits[item.materialName];
            return (
              <div key={item.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr 1fr 1fr", gap: 0, borderBottom: "1px solid #f0f0f0", background: isDirty ? "#fffbeb" : (idx % 2 === 0 ? "#fff" : "#fafafa"), padding: "8px 0", alignItems: "start" }}>

                {/* Material info */}
                <div style={{ padding: "4px 8px 4px 0" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{item.materialName}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{item.group}{item.materialSpec ? ` · ${item.materialSpec}` : ""} · {item.unit}</div>
                </div>

                {/* 3 model columns */}
                {MODELS.map((model) => {
                  const m = rates[model];
                  return (
                    <div key={model} style={{ borderLeft: "2px solid #e5e7eb", paddingLeft: 10, paddingRight: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <input
                          type="text" placeholder="Brand" value={m.brand}
                          onChange={(e) => setField(item.materialName, model, "brand", e.target.value)}
                          style={{ ...inp, color: MODEL_COLORS[model], fontWeight: 600, flex: 1 }}
                        />
                        <button
                          title="Pick from Items Pricing"
                          onClick={() => setPicker({ materialName: item.materialName, model, group: item.group || item.category })}
                          style={{ background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, padding: "0 8px", cursor: "pointer", fontSize: 14, color: "#6b7280", flexShrink: 0 }}
                        >🔍</button>
                      </div>
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>Rate (excl GST, excl Profit)</div>
                          <input type="number" placeholder="0.00" value={m.baseRate}
                            onChange={(e) => setField(item.materialName, model, "rate", e.target.value)}
                            style={smInp} />
                        </div>
                        <div style={{ width: 46 }}>
                          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>GST %</div>
                          <input type="number" placeholder="18" value={m.gst}
                            onChange={(e) => setField(item.materialName, model, "gst", e.target.value)}
                            style={{ ...smInp, width: 46 }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>Rate+GST (incl. Profit)</div>
                          <input type="number" placeholder="0.00" value={m.rateWithGst}
                            onChange={(e) => setField(item.materialName, model, "rateWithGst", e.target.value)}
                            style={{ ...smInp, background: m.rateWithGst ? "#f0fdf4" : undefined }} />
                        </div>
                      </div>
                      {Number(materialModelProfitPercent?.[model]) > 0 && m.baseRate !== "" && (
                        <div style={{ fontSize: 10, color: "#92400e" }}>
                          Rate incl. Profit: ₹{m.rate} <span style={{ color: "#9ca3af" }}>(base ₹{m.baseRate} + {materialModelProfitPercent[model]}%)</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {picker && (
        <ItemPickerModal
          materialName={picker.materialName}
          prices={prices}
          initialGroup={picker.group}
          onSelect={onPickerSelect}
          onClose={() => setPicker(null)}
        />
      )}

      {/* ── Bottom download ────────────────────────────────────────────────── */}
      <div style={{ position: "sticky", bottom: 0, background: "#1e3a5f", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 100 }}>
        <span style={{ color: "#e5e7eb", fontSize: 13 }}>
          {hasEdits ? "You have unsaved changes — save the template before downloading." : `Template has rates for ${Object.keys(materialModelRates).length} materials.`}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          {hasEdits && <button onClick={saveAll} style={{ background: "#2563eb", padding: "8px 18px", fontSize: 13 }}>Save Template</button>}
          <button onClick={downloadCSV} style={{ background: "#7c3aed", padding: "8px 18px", fontSize: 13 }}>⬇ Download Comparison Quotation (CSV)</button>
        </div>
      </div>
    </div>
  );
}

export default MaterialModels;
