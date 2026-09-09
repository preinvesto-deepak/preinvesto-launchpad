import { useState, useRef } from "react";
import { useAppData } from "../context/AppDataContext";
import { priceList, GROUP_OPTIONS, UNIT_OPTIONS } from "../data/priceData";

const emptyForm = {
  group: "", materialName: "", materialSpec: "", unit: "",
  brand: "", modelNumber: "", rate: "", gst: "18", rateWithGst: "",
  images: [], plyThickness: "", suitableThickness: [],
  // Wood-only: default sheet size 4' × 8' = 32 sqft, editable, used to convert
  // an ₹/sqft rate into the sheet's Rate without GST (and back).
  woodDimW: 4, woodDimH: 8, sftRate: "",
  // MRP + supplier discount% drive Rate without GST (mrp × (1 - discount/100))
  // — the actual net cost after what the supplier discounts off list price.
  // showInQuotation controls whether this item's MRP-vs-final savings shows
  // up in the Project Quotation's savings summary.
  mrp: "", discountPercent: "", showInQuotation: true,
};

// Standard panel thicknesses (mm) used to match a Ply material to a
// compatible Edge Band product in the Template's edge banding calc.
const PLY_THICKNESS_OPTIONS = [6, 8, 9, 12, 16, 18, 19, 25];

// Resize image to max 320px, JPEG 0.75 quality — keeps base64 size small
function resizeImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 320;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.75), name: file.name });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Image Manager (inside modal) ─────────────────────────────────────────────
function ImageManager({ images, onChange }) {
  const fileRef = useRef();
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");

  const append = (newImgs) => {
    const next = [...images];
    newImgs.forEach((img) => next.push({ ...img, isDisplay: next.length === 0 }));
    onChange(next);
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files);
    const resized = await Promise.all(files.map(resizeImage));
    append(resized.map(({ dataUrl, name }) => ({ id: Date.now() + Math.random(), dataUrl, name })));
    e.target.value = "";
  };

  const handleAddUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    try { new URL(url); } catch { setUrlError("Enter a valid URL (https://…)"); return; }
    setUrlError("");
    append([{ id: Date.now() + Math.random(), dataUrl: url, name: url.split("/").pop() || "image" }]);
    setUrlInput("");
  };

  const setDisplay = (id) =>
    onChange(images.map((img) => ({ ...img, isDisplay: img.id === id })));

  const remove = (id) => {
    const remaining = images.filter((img) => img.id !== id);
    if (remaining.length && !remaining.some((i) => i.isDisplay)) remaining[0].isDisplay = true;
    onChange(remaining);
  };

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Images</div>

      {/* URL + File row */}
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          type="text"
          placeholder="Paste image URL (https://…)"
          value={urlInput}
          onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
          style={{ flex: 1, padding: "6px 10px", fontSize: 13, borderRadius: 6, border: `1px solid ${urlError ? "#ef4444" : "#d1d5db"}` }}
        />
        <button type="button" onClick={handleAddUrl} style={{ background: "#2563eb", padding: "6px 14px", fontSize: 13, flexShrink: 0 }}>Add URL</button>
        <button type="button" onClick={() => fileRef.current.click()} style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "6px 12px", fontSize: 13, flexShrink: 0 }}>Upload File</button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFiles} />
      </div>
      {urlError && <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 6px" }}>{urlError}</p>}
      <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 10px" }}>Click ★ on a thumbnail to set it as the display image shown in the list.</p>

      {/* Thumbnails */}
      {images.length === 0 ? (
        <div onClick={() => fileRef.current.click()} style={{ border: "2px dashed #e5e7eb", borderRadius: 8, padding: "18px 0", textAlign: "center", cursor: "pointer", color: "#9ca3af", fontSize: 13 }}>
          Upload a file or paste a URL above
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {images.map((img) => (
            <div key={img.id} style={{ position: "relative", width: 80, height: 80, border: img.isDisplay ? "2px solid #2563eb" : "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
              <img src={img.dataUrl} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
              {img.isDisplay && (
                <div style={{ position: "absolute", top: 3, left: 3, background: "#2563eb", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>★</div>
              )}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", background: "rgba(0,0,0,0.55)" }}>
                <button onClick={() => setDisplay(img.id)} title="Set as display" style={{ flex: 1, background: "none", color: img.isDisplay ? "#fbbf24" : "#d1d5db", border: "none", fontSize: 13, padding: "2px 0", cursor: "pointer" }}>★</button>
                <button onClick={() => remove(img.id)} title="Remove" style={{ flex: 1, background: "none", color: "#f87171", border: "none", fontSize: 13, padding: "2px 0", cursor: "pointer" }}>✕</button>
              </div>
            </div>
          ))}
          <div onClick={() => fileRef.current.click()} style={{ width: 80, height: 80, border: "2px dashed #e5e7eb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9ca3af", fontSize: 22, flexShrink: 0 }}>+</div>
        </div>
      )}
    </div>
  );
}

// ── Add / Edit Modal ─────────────────────────────────────────────────────────
function ItemFormModal({ initial, onSave, onClose, allPrices }) {
  const [form, setForm] = useState({ ...emptyForm, ...(initial || {}), images: initial?.images || [] });
  const [nameSuggestions, setNameSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showGroupSuggestions, setShowGroupSuggestions] = useState(false);
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // Total sqft for the Wood sheet size (W ft × H ft) — default 4×8 = 32 sqft.
  const woodSqFt = () => (Number(form.woodDimW) || 0) * (Number(form.woodDimH) || 0);

  // When Rate (without GST) is edited directly and an MRP is already set,
  // back-solve the discount% so the two stay consistent (e.g. rate dropped
  // to match a new supplier quote → discount% updates to match).
  const discountFromRate = (rate, mrp) =>
    rate !== "" && Number(mrp) > 0 ? Math.max(0, (1 - Number(rate) / Number(mrp)) * 100).toFixed(2) : "";

  const handleRate = (e) => {
    const rate = e.target.value;
    const gst = Number(form.gst) || 0;
    const withGst = rate !== "" ? (Number(rate) * (1 + gst / 100)).toFixed(2) : "";
    const sqft = woodSqFt();
    const sftRate = form.group === "Wood" && rate !== "" && sqft ? (Number(rate) / sqft).toFixed(2) : form.sftRate;
    setForm((f) => ({
      ...f, rate, rateWithGst: withGst, sftRate: f.group === "Wood" ? sftRate : f.sftRate,
      discountPercent: discountFromRate(rate, f.mrp),
    }));
  };

  const handleRateWithGst = (e) => {
    const rateWithGst = e.target.value;
    const gst = Number(form.gst) || 0;
    const without = rateWithGst !== "" ? (Number(rateWithGst) / (1 + gst / 100)).toFixed(2) : "";
    const sqft = woodSqFt();
    const sftRate = form.group === "Wood" && without !== "" && sqft ? (Number(without) / sqft).toFixed(2) : form.sftRate;
    setForm((f) => ({
      ...f, rateWithGst, rate: without, sftRate: f.group === "Wood" ? sftRate : f.sftRate,
      discountPercent: discountFromRate(without, f.mrp),
    }));
  };

  // MRP + Discount% → Rate without GST (and cascades to Rate with GST). MRP
  // is the supplier's list price; discount% is what the supplier knocks off
  // it — the app computes the actual net rate from the two.
  const recalcFromMrp = (mrp, discountPercent) => {
    if (mrp === "" || discountPercent === "") return null;
    const rate = (Number(mrp) * (1 - Number(discountPercent) / 100)).toFixed(2);
    const gst = Number(form.gst) || 0;
    const withGst = (Number(rate) * (1 + gst / 100)).toFixed(2);
    return { rate, withGst };
  };

  const handleMrp = (e) => {
    const mrp = e.target.value;
    const result = recalcFromMrp(mrp, form.discountPercent);
    setForm((f) => ({
      ...f, mrp,
      ...(result ? { rate: result.rate, rateWithGst: result.withGst } : {}),
    }));
  };

  const handleDiscountPercent = (e) => {
    const discountPercent = e.target.value;
    const result = recalcFromMrp(form.mrp, discountPercent);
    setForm((f) => ({
      ...f, discountPercent,
      ...(result ? { rate: result.rate, rateWithGst: result.withGst } : {}),
    }));
  };

  // SFT Rate (₹/sqft, without GST) — Wood only. Editing this drives Rate
  // without GST (and Rate with GST) as sftRate × total sqft.
  const handleSftRate = (e) => {
    const sftRate = e.target.value;
    const sqft = woodSqFt();
    const rate = sftRate !== "" && sqft ? (Number(sftRate) * sqft).toFixed(2) : "";
    const gst = Number(form.gst) || 0;
    const withGst = rate !== "" ? (Number(rate) * (1 + gst / 100)).toFixed(2) : "";
    setForm((f) => ({ ...f, sftRate, rate, rateWithGst: withGst }));
  };

  // Changing the Wood sheet dimensions recomputes Rate without GST from the
  // existing SFT Rate (SFT Rate stays the source of truth, not the total).
  const handleWoodDim = (field) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const w = Number(field === "woodDimW" ? value : f.woodDimW) || 0;
      const h = Number(field === "woodDimH" ? value : f.woodDimH) || 0;
      const sqft = w * h;
      const next = { ...f, [field]: value };
      if (f.sftRate !== "" && sqft) {
        const rate = (Number(f.sftRate) * sqft).toFixed(2);
        const gst = Number(f.gst) || 0;
        next.rate = rate;
        next.rateWithGst = (Number(rate) * (1 + gst / 100)).toFixed(2);
      }
      return next;
    });
  };

  const handleNameChange = (e) => {
    const val = e.target.value;
    setForm((f) => ({ ...f, materialName: val }));
    if (val.trim().length > 0) {
      const q = val.toLowerCase();
      const matches = (allPrices || []).filter((p) =>
        (p.materialName || "").toLowerCase().includes(q) && p.materialName !== form.materialName
      );
      setNameSuggestions(matches.slice(0, 8));
      setShowSuggestions(true);
    } else {
      setNameSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (p) => {
    setForm((f) => ({ ...f, materialName: p.materialName }));
    setShowSuggestions(false);
    setNameSuggestions([]);
  };

  const handleGst = (e) => {
    const gst = e.target.value;
    const rate = Number(form.rate) || 0;
    const withGst = form.rate !== "" ? (rate * (1 + Number(gst) / 100)).toFixed(2) : "";
    setForm((f) => ({ ...f, gst, rateWithGst: withGst }));
  };

  const save = () => {
    if (!form.group || !form.materialName || !form.unit) {
      alert("Group, Name and Unit are required.");
      return;
    }
    onSave({
      group: form.group, materialName: form.materialName, materialSpec: form.materialSpec,
      unit: form.unit, brand: form.brand, modelNumber: form.modelNumber,
      rate: Number(form.rate) || 0, gst: Number(form.gst) || 0,
      images: form.images || [],
      plyThickness: form.group === "Wood" ? (Number(form.plyThickness) || null) : null,
      suitableThickness: form.group === "Edge Beading" ? (form.suitableThickness || []) : [],
      woodDimW: form.group === "Wood" ? (Number(form.woodDimW) || null) : null,
      woodDimH: form.group === "Wood" ? (Number(form.woodDimH) || null) : null,
      sftRate: form.group === "Wood" ? (Number(form.sftRate) || null) : null,
      mrp: Number(form.mrp) || 0,
      discountPercent: Number(form.discountPercent) || 0,
      showInQuotation: form.showInQuotation !== false,
    });
  };

  const toggleSuitableThickness = (t) => {
    setForm((f) => {
      const list = f.suitableThickness || [];
      return { ...f, suitableThickness: list.includes(t) ? list.filter((x) => x !== t) : [...list, t] };
    });
  };

  const inp = { padding: "7px 10px", fontSize: 13, borderRadius: 6, border: "1px solid #d1d5db", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 660, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{initial?.id ? "Edit Item" : "Add New Item"}</h3>
          <button onClick={onClose} style={{ background: "#6b7280", padding: "5px 12px", fontSize: 13 }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
          <div style={{ position: "relative" }}>
            <label style={lbl}>Group *</label>
            <input
              style={inp}
              type="text"
              placeholder="Select or type new group…"
              value={form.group}
              onChange={set("group")}
              onFocus={() => setShowGroupSuggestions(true)}
              onBlur={() => setTimeout(() => setShowGroupSuggestions(false), 150)}
            />
            {showGroupSuggestions && (() => {
              const q = (form.group || "").toLowerCase();
              const matches = GROUP_OPTIONS.filter((g) => g.toLowerCase().includes(q));
              return matches.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: "0 0 8px 8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 3000, maxHeight: 220, overflowY: "auto" }}>
                  {matches.map((g) => (
                    <div key={g} onMouseDown={() => setForm((f) => ({ ...f, group: g }))}
                      style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#eff6ff"}
                      onMouseLeave={(e) => e.currentTarget.style.background = ""}
                    >
                      {g}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div style={{ position: "relative" }}>
            <label style={lbl}>Name *</label>
            <input
              style={inp} type="text" placeholder="e.g. 18mm Ply"
              value={form.materialName}
              onChange={handleNameChange}
              onFocus={handleNameChange}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              autoFocus
            />
            {showSuggestions && nameSuggestions.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: "0 0 8px 8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 3000, maxHeight: 220, overflowY: "auto" }}>
                {nameSuggestions.map((p) => (
                  <div key={p.id} onMouseDown={() => selectSuggestion(p)}
                    style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#eff6ff"}
                    onMouseLeave={(e) => e.currentTarget.style.background = ""}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{p.materialName}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                      {[p.group, p.brand, p.materialSpec, p.unit].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={lbl}>Material Spec</label>
            <input style={inp} type="text" placeholder="e.g. 18mm, BWP Grade" value={form.materialSpec} onChange={set("materialSpec")} />
          </div>
          <div>
            <label style={lbl}>Unit of Measure *</label>
            <select value={form.unit} onChange={set("unit")} style={inp}>
              <option value="">Select unit…</option>
              {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ position: "relative" }}>
            <label style={lbl}>Brand</label>
            <input
              style={inp}
              type="text"
              placeholder="e.g. Century, Greenlam"
              value={form.brand}
              onChange={set("brand")}
              onFocus={() => setShowBrandSuggestions(true)}
              onBlur={() => setTimeout(() => setShowBrandSuggestions(false), 150)}
            />
            {showBrandSuggestions && (() => {
              const q = (form.brand || "").toLowerCase();
              const brands = Array.from(new Set((allPrices || []).map((p) => p.brand).filter(Boolean)));
              const matches = brands.filter((b) => b.toLowerCase().includes(q));
              return matches.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d1d5db", borderRadius: "0 0 8px 8px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 3000, maxHeight: 220, overflowY: "auto" }}>
                  {matches.map((b) => (
                    <div key={b} onMouseDown={() => setForm((f) => ({ ...f, brand: b }))}
                      style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#eff6ff"}
                      onMouseLeave={(e) => e.currentTarget.style.background = ""}
                    >
                      {b}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
          <div>
            <label style={lbl}>Model / Code</label>
            <input style={inp} type="text" placeholder="e.g. BWR-710" value={form.modelNumber} onChange={set("modelNumber")} />
          </div>

          {form.group === "Wood" && (
            <div>
              <label style={lbl}>Ply Thickness (mm)</label>
              <select value={form.plyThickness} onChange={set("plyThickness")} style={inp}>
                <option value="">Select thickness…</option>
                {PLY_THICKNESS_OPTIONS.map((t) => <option key={t} value={t}>{t} mm</option>)}
              </select>
            </div>
          )}

          {form.group === "Wood" && (
            <div>
              <label style={lbl}>Sheet Size (ft)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input style={{ ...inp, width: 70 }} type="number" min={0} step="0.1" value={form.woodDimW} onChange={handleWoodDim("woodDimW")} />
                <span style={{ fontSize: 13, color: "#9ca3af" }}>×</span>
                <input style={{ ...inp, width: 70 }} type="number" min={0} step="0.1" value={form.woodDimH} onChange={handleWoodDim("woodDimH")} />
                <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>= {woodSqFt() || 0} sqft</span>
              </div>
            </div>
          )}

          {form.group === "Edge Beading" && (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={lbl}>Suitable Ply Thickness (mm)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {PLY_THICKNESS_OPTIONS.map((t) => {
                  const active = (form.suitableThickness || []).includes(t);
                  return (
                    <button key={t} type="button" onClick={() => toggleSuitableThickness(t)} style={{
                      padding: "5px 12px", fontSize: 12, fontWeight: active ? 700 : 500,
                      borderRadius: 999, border: "1px solid " + (active ? "#1e3a5f" : "#d1d5db"),
                      background: active ? "#1e3a5f" : "#fff", color: active ? "#fff" : "#374151", cursor: "pointer",
                    }}>{t} mm</button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                Used in the Template to auto-pick this edge band for any Ply row matching one of these thicknesses.
              </div>
            </div>
          )}

          {/* Pricing */}
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                MRP + Supplier Discount → Rate below (or enter Rate directly)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px", marginBottom: 10 }}>
                <div>
                  <label style={lbl}>MRP (₹)</label>
                  <input style={inp} type="number" placeholder="0.00" value={form.mrp} onChange={handleMrp} />
                </div>
                <div>
                  <label style={lbl}>Supplier Discount %</label>
                  <input style={inp} type="number" placeholder="0" value={form.discountPercent} onChange={handleDiscountPercent} />
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Pricing — enter any two, the third auto-calculates
              </div>
              {form.group === "Wood" && (
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>SFT Rate (₹/sqft, without GST)</label>
                  <input style={inp} type="number" placeholder="0.00" value={form.sftRate} onChange={handleSftRate} />
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                    × {woodSqFt() || 0} sqft = Rate without GST below
                  </div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 0.6fr 1fr", gap: "0 12px" }}>
                <div>
                  <label style={lbl}>Rate without GST (₹)</label>
                  <input style={inp} type="number" placeholder="0.00" value={form.rate} onChange={handleRate} />
                </div>
                <div>
                  <label style={lbl}>GST %</label>
                  <input style={inp} type="number" placeholder="18" value={form.gst} onChange={handleGst} />
                </div>
                <div>
                  <label style={lbl}>Rate with GST (₹)</label>
                  <input style={{ ...inp, background: form.rateWithGst !== "" ? "#fffbeb" : "#fff" }} type="number" placeholder="0.00" value={form.rateWithGst} onChange={handleRateWithGst} />
                </div>
              </div>

              {Number(form.mrp) > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#059669", fontWeight: 600 }}>
                  Customer saves ₹{(Number(form.mrp) - Number(form.rate || 0)).toLocaleString("en-IN", { maximumFractionDigits: 2 })} per {form.unit || "unit"} vs MRP
                  {form.gst ? ` (₹${((Number(form.mrp) - Number(form.rate || 0)) * (1 + Number(form.gst) / 100)).toLocaleString("en-IN", { maximumFractionDigits: 2 })} incl. GST)` : ""}
                </div>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "#374151", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={form.showInQuotation !== false}
                  onChange={(e) => setForm((f) => ({ ...f, showInQuotation: e.target.checked }))}
                  style={{ width: 15, height: 15, cursor: "pointer" }}
                />
                Show MRP savings for this item in Project Quotation
              </label>
            </div>
          </div>

          {/* Images */}
          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #f3f4f6", paddingTop: 14 }}>
            <ImageManager
              images={form.images}
              onChange={(imgs) => setForm((f) => ({ ...f, images: imgs }))}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "#6b7280", padding: "8px 20px" }}>Cancel</button>
          <button onClick={save} style={{ padding: "8px 24px" }}>{initial?.id ? "Update Item" : "Add Item"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Thumbnail helper ─────────────────────────────────────────────────────────
// ── Item Detail Modal ─────────────────────────────────────────────────────────
function ItemDetailModal({ item, onClose, onEdit }) {
  const rateWithGst = item.rate > 0 ? item.rate * (1 + (item.gst || 0) / 100) : 0;
  const images = item.images || [];
  const [activeImg, setActiveImg] = useState(images.find((i) => i.isDisplay) || images[0] || null);

  const row = (label, value) => value ? (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ fontSize: 12, color: "#9ca3af", width: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>{value}</span>
    </div>
  ) : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>

        {/* Header */}
        <div style={{ background: "#1e3a5f", color: "#fff", padding: "16px 20px", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{item.materialName}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{item.group}{item.brand ? ` · ${item.brand}` : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, width: 30, height: 30, fontSize: 16, cursor: "pointer", flexShrink: 0, padding: 0 }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {/* Image gallery */}
          {images.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ width: "100%", height: 200, borderRadius: 10, overflow: "hidden", background: "#f3f4f6", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {activeImg
                  ? <img src={activeImg.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
                  : <span style={{ fontSize: 40, color: "#d1d5db" }}>🖼</span>}
              </div>
              {images.length > 1 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {images.map((img) => (
                    <div key={img.id} onClick={() => setActiveImg(img)} style={{ width: 52, height: 52, borderRadius: 7, overflow: "hidden", border: activeImg?.id === img.id ? "2px solid #2563eb" : "1px solid #e5e7eb", cursor: "pointer", flexShrink: 0 }}>
                      <img src={img.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Details */}
          {row("Group", item.group)}
          {row("Spec", item.materialSpec)}
          {row("Unit", item.unit)}
          {row("Brand", item.brand)}
          {row("Model / Code", item.modelNumber)}
          {row("Ply Thickness", item.plyThickness ? `${item.plyThickness} mm` : "")}
          {row("Suitable Ply Thickness", (item.suitableThickness || []).length ? item.suitableThickness.map((t) => `${t}mm`).join(", ") : "")}
          {row("Sheet Size", item.woodDimW && item.woodDimH ? `${item.woodDimW}' × ${item.woodDimH}' = ${item.woodDimW * item.woodDimH} sqft` : "")}
          {row("SFT Rate", item.sftRate ? `₹${Number(item.sftRate).toLocaleString("en-IN")}/sqft` : "")}
          {row("GST", `${item.gst ?? 0}%`)}
          {item.mrp > 0 && row("MRP", `₹${Number(item.mrp).toLocaleString("en-IN")}`)}
          {item.mrp > 0 && row("Supplier Discount", `${item.discountPercent ?? 0}%`)}
          {item.rate > 0 && row("Rate (excl. GST)", `₹${Number(item.rate).toLocaleString("en-IN")}`)}
          {rateWithGst > 0 && row("Rate (incl. GST)", `₹${rateWithGst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`)}
          {item.mrp > 0 && row("You Save", `₹${(Number(item.mrp) - Number(item.rate || 0)).toLocaleString("en-IN", { maximumFractionDigits: 2 })} vs MRP`)}
          {item.mrp > 0 && row("In Quotation", item.showInQuotation !== false ? "✓ Shown" : "✕ Hidden")}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 24px 20px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "8px 20px", fontSize: 13 }}>Close</button>
          <button onClick={() => onEdit(item)} style={{ padding: "8px 20px", fontSize: 13 }}>Edit Item</button>
        </div>
      </div>
    </div>
  );
}

function Thumb({ images }) {
  const display = (images || []).find((i) => i.isDisplay);
  return display ? (
    <img src={display.dataUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb", display: "block" }} />
  ) : (
    <div style={{ width: 40, height: 40, background: "#f3f4f6", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#d1d5db" }}>🖼</div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
function ItemsPricing() {
  const { prices, setPrices, renamePrice } = useAppData();

  const [filterGroup, setFilterGroup] = useState("All");
  const [searchGroup, setSearchGroup] = useState("");
  const [searchName, setSearchName] = useState("");
  const [searchSpec, setSearchSpec] = useState("");
  const [searchBrand, setSearchBrand] = useState("");
  const [sortBy, setSortBy] = useState("brand"); // "brand" | "name"
  const [modalItem, setModalItem] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const openAdd = () => setModalItem({});
  const openEdit = (item) => setModalItem({
    ...item,
    images: item.images || [],
    rateWithGst: item.rate > 0 ? (item.rate * (1 + (item.gst || 0) / 100)).toFixed(2) : "",
  });
  const closeModal = () => setModalItem(null);

  const saveItem = (data) => {
    if (modalItem?.id) {
      // renamePrice handles both the price update and propagation to all parts
      renamePrice(modalItem.id, data);
    } else {
      const id = prices.length ? Math.max(...prices.map((p) => p.id)) + 1 : 1;
      setPrices([...prices, { id, ...data }]);
    }
    closeModal();
  };

  const toggleShowInQuotation = (item) => {
    setPrices((prev) => prev.map((p) => p.id === item.id ? { ...p, showInQuotation: !(p.showInQuotation !== false) } : p));
  };

  const deleteItem = (id) => {
    setPrices((prev) => prev.filter((p) => p.id !== id));
    setConfirmDeleteId(null);
  };

  const duplicateItem = (item) => {
    const newItem = { ...item, id: Date.now(), materialName: item.materialName + " (Copy)" };
    const idx = prices.findIndex((p) => p.id === item.id);
    const next = [...prices];
    next.splice(idx + 1, 0, newItem);
    setPrices(next);
  };

  const loadDefaults = () => {
    const existingNames = new Set(prices.map((p) => p.materialName?.toLowerCase().trim()));
    const toAdd = priceList.filter((d) => !existingNames.has(d.materialName?.toLowerCase().trim()));
    if (toAdd.length === 0) { alert("All default items are already in your list."); return; }
    const withIds = toAdd.map((d) => ({ ...d, id: Date.now() + Math.random(), images: [] }));
    setPrices([...prices, ...withIds]);
    alert(`Added ${withIds.length} default item${withIds.length !== 1 ? "s" : ""} to your list.`);
  };

  const exportPrices = () => {
    const json = JSON.stringify(prices, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `items-pricing-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importRef = useRef();
  const importPrices = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) { alert("Invalid file: expected a JSON array."); return; }
        const existingNames = new Set(prices.map((p) => p.materialName?.toLowerCase().trim()));
        const toAdd = imported.filter((p) => !existingNames.has(p.materialName?.toLowerCase().trim()));
        const toUpdate = imported.filter((p) => existingNames.has(p.materialName?.toLowerCase().trim()));
        const merged = prices.map((p) => {
          const match = toUpdate.find((u) => u.materialName?.toLowerCase().trim() === p.materialName?.toLowerCase().trim());
          return match ? { ...p, ...match, id: p.id } : p;
        });
        const withNewIds = toAdd.map((p) => ({ ...p, id: Date.now() + Math.random() }));
        setPrices([...merged, ...withNewIds]);
        alert(`Import complete: ${toUpdate.length} updated, ${toAdd.length} added.`);
      } catch {
        alert("Failed to read file. Make sure it is a valid JSON export from this app.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const allGroups = ["All", ...Array.from(new Set([...GROUP_OPTIONS, ...prices.map((p) => p.group || p.category || "").filter(Boolean)].filter(Boolean)))];

  const filtered = prices.filter((p) => {
    const grp = p.group || p.category || "";
    const matchTab   = filterGroup === "All" || grp === filterGroup;
    const matchGroup = !searchGroup || grp.toLowerCase().includes(searchGroup.toLowerCase());
    const matchName  = !searchName  || (p.materialName || "").toLowerCase().includes(searchName.toLowerCase());
    const matchSpec  = !searchSpec  || (p.materialSpec  || "").toLowerCase().includes(searchSpec.toLowerCase());
    const matchBrand = !searchBrand || (p.brand         || "").toLowerCase().includes(searchBrand.toLowerCase());
    return matchTab && matchGroup && matchName && matchSpec && matchBrand;
  });

  const byName = (a, b) => (a.materialName || "").localeCompare(b.materialName || "");
  const byBrandName = (a, b) => (a.brand || "").localeCompare(b.brand || "");

  // Bucket a flat item list by material name — every "9mm Ply" (regardless of
  // brand) lands in the same sub-header, items inside sorted by brand.
  const bucketByName = (items) => {
    const byMatName = {};
    items.forEach((item) => {
      const n = item.materialName || "—";
      (byMatName[n] = byMatName[n] || []).push(item);
    });
    Object.values(byMatName).forEach((arr) => arr.sort(byBrandName));
    return byMatName;
  };

  // Sort By: "brand" nests each group's items under a brand sub-header (the
  // long-standing layout); "name" nests them under a material-name sub-header
  // instead — same structure, swapped axis — with Brand shown as its own column.
  const sections = (() => {
    if (sortBy === "name") {
      if (filterGroup === "All") {
        const byGroup = {};
        filtered.forEach((item) => {
          const g = item.group || item.category || "Other";
          (byGroup[g] = byGroup[g] || []).push(item);
        });
        return Object.entries(byGroup).map(([title, items]) => ({ title, brands: bucketByName(items) }));
      }
      return [{ title: null, brands: bucketByName(filtered) }];
    }
    if (filterGroup === "All") {
      const byGroup = {};
      filtered.forEach((item) => {
        const g = item.group || item.category || "Other";
        const b = item.brand || "— No Brand —";
        if (!byGroup[g]) byGroup[g] = {};
        if (!byGroup[g][b]) byGroup[g][b] = [];
        byGroup[g][b].push(item);
      });
      Object.values(byGroup).forEach((brands) => Object.values(brands).forEach((items) => items.sort(byName)));
      return Object.entries(byGroup).map(([title, brands]) => ({ title, brands }));
    } else {
      const byBrand = {};
      filtered.forEach((item) => {
        const b = item.brand || "— No Brand —";
        if (!byBrand[b]) byBrand[b] = [];
        byBrand[b].push(item);
      });
      Object.values(byBrand).forEach((items) => items.sort(byName));
      return [{ title: null, brands: byBrand }];
    }
  })();

  const TABLE_HEADERS = sortBy === "name"
    ? ["", "Brand", "Spec", "Unit", "Model / Code", "MRP (₹)", "Rate (₹)", "GST %", "Rate+GST (₹)", "Quote", ""]
    : ["", "Name", "Spec", "Unit", "Model / Code", "MRP (₹)", "Rate (₹)", "GST %", "Rate+GST (₹)", "Quote", ""];

  return (
    <div style={{ margin: "0 -24px -24px -24px", display: "flex", flexDirection: "column" }}>

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div style={{ position: "sticky", top: 0, zIndex: 200, background: "#f3f4f6" }}>

        {/* Page title */}
        <div style={{ padding: "16px 24px 12px", background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#111827" }}>Items Pricing</h1>
        </div>

        {/* Group tabs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 0", borderBottom: "2px solid #e5e7eb", padding: "12px 24px 0", background: "#fff" }}>
          {allGroups.map((g) => {
            const active = filterGroup === g;
            const count = g === "All" ? prices.length : prices.filter((p) => (p.group || p.category) === g).length;
            return (
              <button key={g} onClick={() => setFilterGroup(g)} style={{
                padding: "7px 14px", fontSize: 12, fontWeight: active ? 700 : 500,
                border: "none", borderBottom: active ? "3px solid #2563eb" : "3px solid transparent",
                borderRadius: "6px 6px 0 0", background: "transparent",
                color: active ? "#2563eb" : "#6b7280", cursor: "pointer", whiteSpace: "nowrap", marginBottom: -2,
              }}>
                {g} <span style={{ fontSize: 11, opacity: 0.65 }}>({count})</span>
              </button>
            );
          })}
        </div>

        {/* Filter row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", flexWrap: "wrap" }}>
          {[
            { placeholder: "Group…",  value: searchGroup, set: setSearchGroup },
            { placeholder: "Name…",   value: searchName,  set: setSearchName },
            { placeholder: "Spec…",   value: searchSpec,  set: setSearchSpec },
            { placeholder: "Brand…",  value: searchBrand, set: setSearchBrand },
          ].map(({ placeholder, value, set }) => (
            <div key={placeholder} style={{ position: "relative", flex: 1, minWidth: 90 }}>
              <input
                type="text" placeholder={placeholder} value={value}
                onChange={(e) => set(e.target.value)}
                style={{ padding: "7px 26px 7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #d1d5db", width: "100%", boxSizing: "border-box" }}
              />
              {value && (
                <span onClick={() => set("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#9ca3af", fontSize: 13 }}>✕</span>
              )}
            </div>
          ))}
          <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>{filtered.length} item{filtered.length !== 1 ? "s" : ""}</span>
          <div style={{ display: "flex", border: "1px solid #d1d5db", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
            {[["brand", "Sort: Brand"], ["name", "Sort: Name"]].map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)} style={{
                padding: "6px 12px", fontSize: 12, fontWeight: sortBy === key ? 700 : 500,
                border: "none", background: sortBy === key ? "#2563eb" : "#fff",
                color: sortBy === key ? "#fff" : "#6b7280", cursor: "pointer", whiteSpace: "nowrap",
              }}>{label}</button>
            ))}
          </div>
          <input ref={importRef} type="file" accept=".json" onChange={importPrices} style={{ display: "none" }} />
          <button onClick={loadDefaults} style={{ marginLeft: "auto", padding: "7px 14px", fontSize: 13, whiteSpace: "nowrap", flexShrink: 0, background: "#059669" }}>Load Defaults</button>
          <button onClick={exportPrices} style={{ padding: "7px 14px", fontSize: 13, whiteSpace: "nowrap", flexShrink: 0, background: "#7c3aed" }}>⬇ Export</button>
          <button onClick={() => importRef.current.click()} style={{ padding: "7px 14px", fontSize: 13, whiteSpace: "nowrap", flexShrink: 0, background: "#b45309" }}>⬆ Import</button>
          <button onClick={openAdd} style={{ padding: "7px 18px", fontSize: 13, whiteSpace: "nowrap", flexShrink: 0 }}>+ Add Item</button>
        </div>
      </div>

      {/* ── Scrollable items ───────────────────────────────────────────────── */}
      <div style={{ padding: "16px 24px 32px" }}>
        {filtered.length === 0 ? (
          <p style={{ color: "#6b7280", textAlign: "center", padding: 40 }}>No items found.</p>
        ) : (
          sections.map(({ title, brands }) => (
            <div key={title || "__single__"} style={{ marginBottom: title ? 24 : 0 }}>
              {title && (
                <div style={{ background: "#3730a3", color: "#fff", padding: "7px 16px", borderRadius: "8px 8px 0 0", fontWeight: 700, fontSize: 13 }}>
                  {title} <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 8 }}>({Object.values(brands).flat().length})</span>
                </div>
              )}
              {Object.entries(brands).sort(([a], [b]) => a.localeCompare(b)).map(([brandName, items], bi) => (
                <div key={brandName} style={{ marginBottom: 8 }}>
                  {brandName !== "" && (
                    <div style={{ background: "#e0e7ff", color: "#3730a3", padding: "5px 16px", fontWeight: 600, fontSize: 12, borderLeft: "3px solid #6366f1", borderRight: "1px solid #e5e7eb", borderTop: title && bi === 0 ? "none" : "1px solid #e5e7eb" }}>
                      {brandName} <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 6 }}>({items.length})</span>
                    </div>
                  )}
                  <table cellPadding="0" cellSpacing="0" width="100%" style={{ borderCollapse: "collapse", border: "1px solid #e5e7eb", borderTop: "none", background: "#fff" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb" }}>
                        {TABLE_HEADERS.map((h, i) => (
                          <th key={i} style={{ padding: "6px 10px", fontSize: 10, fontWeight: 600, color: "#9ca3af", textAlign: ["MRP (₹)", "Rate (₹)", "Rate+GST (₹)"].includes(h) ? "right" : h === "Quote" ? "center" : "left", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => {
                        const rateWithGst = item.rate > 0 ? item.rate * (1 + (item.gst || 0) / 100) : 0;
                        return (
                          <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ padding: "6px 10px", width: 50 }}><Thumb images={item.images} /></td>
                            {sortBy === "name" ? (
                              <td onClick={() => setViewItem(item)} style={{ padding: "7px 10px", fontSize: 13, fontWeight: 500, color: "#2563eb", cursor: "pointer", textDecoration: "underline" }}>{item.brand || "— No Brand —"}</td>
                            ) : (
                              <td onClick={() => setViewItem(item)} style={{ padding: "7px 10px", fontSize: 13, fontWeight: 500, color: "#2563eb", cursor: "pointer", textDecoration: "underline" }}>{item.materialName}</td>
                            )}
                            <td style={{ padding: "7px 10px", fontSize: 12, color: "#6b7280" }}>{item.materialSpec || "—"}</td>
                            <td style={{ padding: "7px 10px", fontSize: 13 }}>{item.unit}</td>
                            <td style={{ padding: "7px 10px", fontSize: 12, color: "#6b7280" }}>{item.modelNumber || "—"}</td>
                            <td style={{ padding: "7px 10px", fontSize: 12, textAlign: "right", color: "#9ca3af", textDecoration: item.mrp > 0 ? "line-through" : "none" }}>
                              {item.mrp > 0 ? `₹${Number(item.mrp).toLocaleString("en-IN")}` : <span style={{ color: "#d1d5db" }}>—</span>}
                            </td>
                            <td style={{ padding: "7px 10px", fontSize: 13, textAlign: "right", fontWeight: 600 }}>
                              {item.rate > 0 ? `₹${Number(item.rate).toLocaleString("en-IN")}` : <span style={{ color: "#d1d5db" }}>—</span>}
                            </td>
                            <td style={{ padding: "7px 10px", fontSize: 12, color: "#6b7280", textAlign: "center" }}>{item.gst ?? 0}%</td>
                            <td style={{ padding: "7px 10px", fontSize: 13, textAlign: "right", fontWeight: 600, color: "#059669" }}>
                              {rateWithGst > 0 ? `₹${rateWithGst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : <span style={{ color: "#d1d5db" }}>—</span>}
                            </td>
                            <td style={{ padding: "7px 10px", textAlign: "center" }}>
                              {item.mrp > 0 ? (
                                <input
                                  type="checkbox"
                                  checked={item.showInQuotation !== false}
                                  onChange={() => toggleShowInQuotation(item)}
                                  title="Show this item's MRP savings in Project Quotation"
                                  style={{ width: 15, height: 15, cursor: "pointer" }}
                                />
                              ) : <span style={{ color: "#d1d5db" }}>—</span>}
                            </td>
                            <td style={{ padding: "7px 10px" }}>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button onClick={() => openEdit(item)} style={{ background: "#6b7280", padding: "3px 10px", fontSize: 11 }}>Edit</button>
                                <button onClick={() => duplicateItem(item)} style={{ background: "#7c3aed", padding: "3px 10px", fontSize: 11 }}>Copy</button>
                                {confirmDeleteId === item.id ? (
                                  <>
                                    <button onClick={() => deleteItem(item.id)} style={{ background: "#dc2626", padding: "3px 10px", fontSize: 11 }}>Yes</button>
                                    <button onClick={() => setConfirmDeleteId(null)} style={{ background: "#6b7280", padding: "3px 10px", fontSize: 11 }}>No</button>
                                  </>
                                ) : (
                                  <button onClick={() => setConfirmDeleteId(item.id)} style={{ background: "#dc2626", padding: "3px 10px", fontSize: 11 }}>Del</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {modalItem !== null && (
        <ItemFormModal initial={modalItem} onSave={saveItem} onClose={closeModal} allPrices={prices} />
      )}

      {viewItem && (
        <ItemDetailModal item={viewItem} onClose={() => setViewItem(null)} onEdit={(item) => { setViewItem(null); openEdit(item); }} />
      )}
    </div>
  );
}

export default ItemsPricing;
