import { useState, useEffect, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { formatCurrency, mmToFeet, feetToMm, roundTo2 } from "../utils/unitConversions";
import CutSheetOptimizer from "./CutSheetOptimizer";
import ProjectQuotation from "./ProjectQuotation";
import { packSheets } from "../utils/binPack";
import { GROUP_OPTIONS } from "../data/priceData";

// Annotates a group-sorted row list with rowSpan info so the "Group" cell can
// be rendered once per group (merged) instead of repeated on every row.
function withGroupSpan(rows, groupKey = "group") {
  return rows.map((row, i) => {
    const isFirst = i === 0 || rows[i - 1][groupKey] !== row[groupKey];
    let span = 0;
    if (isFirst) {
      let j = i;
      while (j < rows.length && rows[j][groupKey] === row[groupKey]) { span++; j++; }
    }
    return { ...row, _groupFirst: isFirst, _groupSpan: span };
  });
}

// Groups shown in the Hardware & Consumables table — every Items Pricing
// group except the sheet-material ones (Wood/Laminate qty is finalized via
// the Sheet Calculation & Cut List section instead).
const HARDWARE_GROUPS = GROUP_OPTIONS.filter((g) => g !== "Wood" && g !== "Laminate");

const LABEL_TO_GROUP = {
  "Door Ply":         "Wood",
  "Carcase Ply":      "Wood",
  "Outside Laminate": "Laminate",
  "Inside Laminate":  "Laminate",
  "Edge Beading":     "Edge Beading",
};

// ── Collapsible Section Header (mirrors TemplateMaster) ─────────────────────
function SectionHeader({ title, open, onToggle, action, style: extraStyle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#1e3a5f", color: "#fff",
        padding: "9px 14px", cursor: "pointer",
        borderRadius: open ? "8px 8px 0 0" : 8,
        userSelect: "none", marginTop: 10,
        ...extraStyle,
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: "0.02em" }}>{title}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
        <span style={{
          fontSize: 11, fontWeight: 700,
          transition: "transform 0.2s",
          display: "inline-block",
          transform: open ? "rotate(90deg)" : "none",
        }}>▶</span>
      </div>
    </div>
  );
}

const TEMPLATE_ICONS = {
  Wardrobe: "🚪", Kitchen: "🍳", "TV Unit": "📺", "Study Unit": "📚", Loft: "📦",
};

// ── Formula resolution (mirrors TemplateMaster) ───────────────────────────────
const DEFAULT_REFS = {
  heightMm: "H", widthMm: "W", depthMm: "D",
  doorsH: "DoorsH", doorsV: "DoorsV",
  backParts: "BackParts", partitions: "VP", shelves: "Shelves",
};
const PART_GROUPS = ["Ply", "Inside Laminate", "Outside Laminate", "Edge Beading"];
const PART_GROUP_COLORS = {
  "Ply": "#dbeafe", "Inside Laminate": "#fef3c7",
  "Outside Laminate": "#dcfce7", "Edge Beading": "#fce7f3",
};
const CUT_MAT_COLORS = ["#dbeafe","#fef3c7","#dcfce7","#fce7f3","#ede9fe","#fef9c3","#d1fae5","#fee2e2"];
const SHEET_MAT_FIELDS = [
  ["Door Ply", "matDoor"], ["Carcase Ply", "matCarcas"],
  ["Outside Laminate", "matOutsideLaminate"], ["Inside Laminate", "matInsideLaminate"],
  ["Edge Beading", "matEdgeBeading"],
];
// Everything a "Sheet Calculation and Cut List" entry (the box's own "1." or
// a Sub Sheet Calculation "1.1", "1.2", ...) owns — copied wholesale by the
// Copy/Paste buttons on each sheet's header. Deliberately excludes id/name
// (each sheet keeps its own identity) and box-only fields (hardwareItems,
// templateId, quotationBoxType, subSheets, ...) that aren't part of a sheet.
const SHEET_COPY_FIELDS = [
  "boxType", "doorType", "includeInMaterialCalc",
  "heightMm", "widthMm", "depthMm",
  "shortName",
  "matDoor", "matDoorId", "matCarcas", "matCarcasId",
  "matOutsideLaminate", "matOutsideLaminateId",
  "matInsideLaminate", "matInsideLaminateId",
  "matEdgeBeading", "matEdgeBeadingId",
  "customMaterials",
  "doorsH", "doorsV", "backParts", "partitions", "shelves",
  "customFields", "refs", "parts",
];
const emptyPart = (id) => ({
  id, group: "Ply", partName: "", req: true,
  widthMm: "", heightMm: "", qty: 1,
  material: "", materialId: null,
  rotation: 1, label: "",
  sideA: "", sideAId: null,
  sideB: "", sideBId: null,
  edgeReq: true,
  edgeTop: 2, edgeTopReq: true,
  edgeBottom: 2, edgeBottomReq: true,
  edgeLeft: 2, edgeLeftReq: true,
  edgeRight: 2, edgeRightReq: true,
  remarks: "",
});

const BOX_VARS = (box) => {
  const refs = { ...DEFAULT_REFS, ...(box.refs || {}) };
  const result = {};
  Object.entries(refs).forEach(([field, varName]) => {
    if (varName) result[varName] = Number(box[field]) || 0;
  });
  (box.customFields || []).forEach(({ ref, value }) => {
    if (ref) result[ref] = Number(value) || 0;
  });
  // Area Sft — reserved formula variable, always H × W in sq ft (auto-calculated,
  // not editable/remappable like the other refs) so any part/hardware formula
  // can reference {Sft} directly.
  const hMm = Number(box.heightMm) || 0;
  const wMm = Number(box.widthMm) || 0;
  result.Sft = hMm && wMm ? Math.ceil(mmToFeet(hMm) * mmToFeet(wMm)) : 0;
  return result;
};

// A Sub Sheet Calculation (e.g. "Draw") — a full peer of the box's own
// Sheet Calculation ("1."), numbered "1.1", "1.2", ... under the same
// collapsible. Mirrors every field a box itself has for Section 1: its own
// Type of Work/Door Type, own H/W/D, own materials, own fields/refs, and
// own parts — fully independent of the box and of every other sub-sheet.
const newSubSheet = (id) => ({
  id,
  name: `Sub Sheet ${id}`,
  shortName: "",
  boxType: "", doorType: "", includeInMaterialCalc: true,
  heightMm: "", widthMm: "", depthMm: "",
  matDoor: "", matDoorId: null,
  matCarcas: "", matCarcasId: null,
  matOutsideLaminate: "", matOutsideLaminateId: null,
  matInsideLaminate: "", matInsideLaminateId: null,
  matEdgeBeading: "", matEdgeBeadingId: null,
  customMaterials: [],
  doorsH: 2, doorsV: 1, backParts: 1, partitions: 0, shelves: 2,
  customFields: [],
  refs: { ...DEFAULT_REFS },
  parts: [],
});

// A box's own cut-list parts ("1.") plus every Sub Sheet Calculation's parts
// ("1.1", "1.2", ... e.g. drawers living inside a Wardrobe box) — each sheet
// is a full peer with its own H/W/D-derived vars and its own Edge Beading
// material, so cut-list/edge-banding totals can walk one flat list without
// caring whether a part came from the box itself or one of its sub-sheets.
// `sheet` is the box or sub-sheet object itself, for reading its own
// matEdgeBeading/matEdgeBeadingId. A sheet with its "Include in Material
// Calculation" checkbox off contributes no parts here at all — the single
// point where that opt-out is enforced for every consumer (Cut Sheet
// Optimizer, Hardware & Consumables' auto edge banding, Material Summary,
// BOQ, Quotation).
const boxPartGroups = (box) => {
  const groupOf = (sheet, label) => ({
    label, vars: BOX_VARS(sheet), sheet,
    parts: sheet.includeInMaterialCalc === false ? [] : (sheet.parts || []),
  });
  const groups = [groupOf(box, box.shortName || box.boxName || box.name || "")];
  (box.subSheets || []).forEach((sub) => {
    groups.push(groupOf(sub, sub.shortName || sub.name || ""));
  });
  return groups;
};

// H × W in sq ft from the fields shown below Box Name — independent of
// {Sft} above, which always stays on Section 1's H/W for cut-list formulas.
// Falls back to Section 1's H/W for boxes that predate the new fields.
const quotationAreaSft = (box) => {
  const hMm = Number(box.quotationHeightMm) || Number(box.heightMm) || 0;
  const wMm = Number(box.quotationWidthMm) || Number(box.widthMm) || 0;
  return hMm && wMm ? Math.ceil(mmToFeet(hMm) * mmToFeet(wMm)) : 0;
};

function resolveFormula(expr, vars) {
  if (expr === "" || expr === null || expr === undefined) return "";
  const str = String(expr).trim();
  if (/^-?\d+(\.\d+)?$/.test(str)) return Number(str);
  const sub = str.replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? String(vars[k]) : "0");
  try {
    // eslint-disable-next-line no-new-func
    const r = new Function('"use strict"; return (' + sub + ')')();
    if (typeof r !== "number" || !isFinite(r)) return "?";
    return Math.round(r);
  } catch { return "?"; }
}

// ─── Material Search Modal ───────────────────────────────────────────────────
function MaterialModal({ prices, onSelect, onClose }) {
  const [q, setQ] = useState("");
  const filtered = (prices || []).filter((p) =>
    (p.materialName || "").toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 480, maxWidth: "95vw", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Select from Material Library</h3>
          <button onClick={onClose} style={{ background: "#6b7280", padding: "5px 12px", fontSize: 13 }}>✕</button>
        </div>
        <input
          autoFocus
          type="text"
          placeholder="Search material name..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginBottom: 12, padding: 10 }}
        />
        <div style={{ overflowY: "auto", flex: 1, border: "1px solid #e5e7eb", borderRadius: 8 }}>
          {filtered.length === 0 ? (
            <p style={{ padding: 20, color: "#6b7280", textAlign: "center" }}>
              No materials found.{" "}
              <button onClick={() => { onSelect(q); onClose(); }} style={{ background: "none", color: "#2563eb", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                Use "{q}"
              </button>
            </p>
          ) : (
            filtered.map((p, i) => (
              <div
                key={p.id || i}
                onClick={() => { onSelect(p.materialName); onClose(); }}
                style={{ padding: "11px 16px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <span style={{ fontWeight: 500 }}>{p.materialName}</span>
                <span style={{ fontSize: 13, color: "#6b7280" }}>₹{Number(p.rate || 0).toLocaleString("en-IN")} / sheet</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Template Picker Modal ───────────────────────────────────────────────────
function TemplatePickerModal({ templates = [], onSelect, onClose }) {
  const [q, setQ] = useState("");
  const filtered = templates.filter((t) =>
    (t.templateName || "").toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 28, width: 680, maxWidth: "95vw", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Apply a Template to this Room</h3>
          <button onClick={onClose} style={{ background: "#6b7280", padding: "5px 12px", fontSize: 13 }}>✕</button>
        </div>
        <input autoFocus type="text" placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16 }} />
        {filtered.length === 0 && (
          <p style={{ color: "#9ca3af", fontSize: 13 }}>No templates found. Create one in Template Master.</p>
        )}
        <div style={{ overflowY: "auto", flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12, alignContent: "start" }}>
          {filtered.map((t) => {
            const boxCount = (t.boxes || []).length;
            const firstBox = t.boxes?.[0];
            return (
              <div
                key={t.id}
                onClick={() => { onSelect(t); onClose(); }}
                style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", cursor: "pointer", textAlign: "center", transition: "border-color 0.15s", background: "#fff" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#7c3aed")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
              >
                {/* Same photo set on the template in Template Master — was
                    hardcoded to a 📐 icon here regardless, so an uploaded
                    photo never showed up while picking a template to apply. */}
                {t.templateImage ? (
                  <img
                    src={t.templateImage}
                    alt=""
                    style={{ width: "100%", aspectRatio: 4 / 3, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div style={{ width: "100%", aspectRatio: 4 / 3, background: "#f9fafb", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "#d1d5db" }}>
                    📐
                  </div>
                )}
                <div style={{ padding: "10px 12px 12px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{t.templateName}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                    {boxCount} box{boxCount !== 1 ? "es" : ""}
                  </div>
                  {firstBox && (
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                      {firstBox.widthMm || "—"} × {firstBox.heightMm || "—"} × {firstBox.depthMm || "—"} mm
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible Section ─────────────────────────────────────────────────────
function Section({ title, badge, children, defaultOpen = true, accent = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: `1px solid ${accent ? "#c7d2fe" : "#e5e7eb"}`, borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "11px 16px",
          background: accent ? "#eef2ff" : (open ? "#f9fafb" : "#fff"),
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong style={{ fontSize: 14, color: accent ? "#3730a3" : "#111827" }}>{title}</strong>
          {badge != null && (
            <span style={{ background: "#e5e7eb", borderRadius: 12, padding: "1px 9px", fontSize: 12, fontWeight: 600 }}>{badge}</span>
          )}
        </div>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div style={{ padding: 16 }}>{children}</div>}
    </div>
  );
}

// ─── Label + Input row ───────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 8, alignItems: "center", marginBottom: 10 }}>
      <label style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Material row with search button ─────────────────────────────────────────
function MatField({ label, value, onChange, onSearch }) {
  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. HDHMR 18mm"
          style={{ flex: 1 }}
        />
        <button
          onClick={onSearch}
          title="Browse material library"
          style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "0 12px", fontSize: 16, flexShrink: 0 }}
        >
          🔍
        </button>
      </div>
    </Field>
  );
}

// ─── Project / Room modal ─────────────────────────────────────────────────────
// Red outline applied to a field the user needs to fix.
const INVALID_FIELD = { borderColor: "#dc2626", background: "#fef2f2" };

function FormModal({ title, fields, onSave, onClose, saveLabel = "Save", error }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 580, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <h3 style={{ margin: "0 0 20px", fontSize: 17 }}>{title}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px", marginBottom: 20 }}>
          {fields}
        </div>
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, borderRadius: 8, padding: "9px 12px", marginBottom: 14 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onSave}>{saveLabel}</button>
          <button onClick={onClose} style={{ background: "#6b7280" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Project Material Models ──────────────────────────────────────────────────
const PROJ_MODELS = ["economy", "standard", "premium"];
const PROJ_MODEL_LABELS = { economy: "Economy", standard: "Standard", premium: "Premium" };
const PROJ_MODEL_COLORS = { economy: "#059669", standard: "#2563eb", premium: "#7c3aed" };
const emptyM = () => ({ brand: "", rate: "", gst: "18", rateWithGst: "" });
const emptyProjRates = () => ({ economy: emptyM(), standard: emptyM(), premium: emptyM() });

function ProjItemPickerModal({ materialName, prices, onSelect, onClose, initialGroup }) {
  const defaultGroup = initialGroup || LABEL_TO_GROUP[materialName] || "All";
  const [filterGroup, setFilterGroup] = useState(defaultGroup);
  const [search, setSearch] = useState("");

  const allGroups = ["All", ...Array.from(new Set([
    ...GROUP_OPTIONS,
    ...(prices || []).map((p) => p.group || "").filter(Boolean),
  ]))];

  const q = search.toLowerCase();
  const results = (prices || []).filter((p) => {
    const grp = p.group || "";
    const matchTab = filterGroup === "All" || grp === filterGroup;
    const matchSearch = !q ||
      (p.materialName || "").toLowerCase().includes(q) ||
      (p.brand || "").toLowerCase().includes(q) ||
      (p.group || "").toLowerCase().includes(q) ||
      (p.materialSpec || "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "84vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ background: "#1e3a5f", color: "#fff", padding: "14px 20px", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Pick from Items Pricing</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>For "{materialName || "Hardware & Consumables"}"</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, width: 30, height: 30, fontSize: 16, cursor: "pointer", padding: 0 }}>✕</button>
        </div>

        {/* Group tabs — same set/counts as the Items Pricing page */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 0", borderBottom: "2px solid #e5e7eb", padding: "8px 16px 0", background: "#fff", flexShrink: 0 }}>
          {allGroups.map((g) => {
            const active = filterGroup === g;
            const count = g === "All" ? (prices || []).length : (prices || []).filter((p) => (p.group || "") === g).length;
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
          <input autoFocus type="text" placeholder="Search by name, brand, spec, group…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", fontSize: 14, borderRadius: 8, border: "1px solid #d1d5db", boxSizing: "border-box" }} />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {results.length === 0 ? (
            <p style={{ color: "#9ca3af", textAlign: "center", padding: 32 }}>No matching items found.</p>
          ) : results.map((p) => {
            const rateWithGst = p.rate > 0 ? (p.rate * (1 + (p.gst || 0) / 100)) : 0;
            const displayImg = (p.images || []).find((i) => i.isDisplay);
            return (
              <div key={p.id} onClick={() => onSelect(p)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f3f4f6", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 7, overflow: "hidden", border: "1px solid #e5e7eb", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {displayImg ? <img src={displayImg.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 18, color: "#d1d5db" }}>🖼</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{p.materialName}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{[p.group, p.brand, p.materialSpec, p.unit].filter(Boolean).join(" · ")}</div>
                </div>
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

function ProjectMaterialModels({ project, prices, globalRates, setProjects }) {
  const [resetConfirm, setResetConfirm] = useState(false);
  const [activeGroup, setActiveGroup] = useState("All");
  const [searchGroup, setSearchGroup] = useState("");
  const [searchName, setSearchName] = useState("");
  const [picker, setPicker] = useState(null); // { materialName, model }
  const [hideEmpty, setHideEmpty] = useState(false);

  const rates = project.materialModelRates || {};
  const profitPercent = project.materialModelProfitPercent || { economy: 0, standard: 0, premium: 0 };
  const globalHasRates = Object.keys(globalRates || {}).length > 0;

  const groups = ["All", ...Array.from(new Set((prices || []).map((p) => p.group || p.category || "").filter(Boolean)))];
  const filteredRaw = (prices || []).filter((p) => {
    const grp = p.group || p.category || "";
    const matchTab = activeGroup === "All" || grp === activeGroup;
    const matchGroup = !searchGroup || grp.toLowerCase().includes(searchGroup.toLowerCase());
    const matchName = !searchName || (p.materialName || "").toLowerCase().includes(searchName.toLowerCase());
    return matchTab && matchGroup && matchName;
  });
  // A material can have several brand-specific Items Pricing rows (e.g. "9mm
  // Ply" priced separately from Gurjan/green Ply/Century), but Economy/
  // Standard/Premium rates are tracked once per material name, not once per
  // supplier row (see updateField/getRates below), so only list it once here.
  const seenNames = new Set();
  const filtered = filteredRaw.filter((p) => {
    if (!p.materialName || seenNames.has(p.materialName)) return false;
    seenNames.add(p.materialName);
    return true;
  });

  const hasAnyData = (matName) => {
    const matRates = rates[matName];
    if (!matRates) return false;
    return PROJ_MODELS.some((m) => {
      const cell = matRates[m];
      return cell && (cell.brand || cell.rate || cell.rateWithGst);
    });
  };
  const displayItems = hideEmpty ? filtered.filter((item) => hasAnyData(item.materialName)) : filtered;

  // Rate (excl GST) input edits the BASE (pre-profit) rate; the effective
  // rate — what GST applies to, and what's actually used by the Quotation —
  // is baseRate × (1 + profit%), same pattern as the global Material Models page.
  const updateField = (matName, model, field, value) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== project.id) return p;
      const currentRates = p.materialModelRates || {};
      const matRates = currentRates[matName] || emptyProjRates();
      const cell = matRates[model] || emptyM();
      const profit = Number((p.materialModelProfitPercent || {})[model]) || 0;
      let updated = { ...cell, [field]: value };
      const gst = Number(field === "gst" ? value : updated.gst) || 0;
      if (field === "rate") {
        updated.baseRate = value;
        const base = Number(value) || 0;
        const effective = base * (1 + profit / 100);
        updated.rate = base > 0 ? String(roundTo2(effective)) : "";
        if (base > 0) updated.rateWithGst = String(roundTo2(effective * (1 + gst / 100)));
      } else if (field === "rateWithGst") {
        const rg = Number(value) || 0;
        if (rg > 0) {
          const effective = rg / (1 + gst / 100);
          updated.rate = String(roundTo2(effective));
          updated.baseRate = String(roundTo2(effective / (1 + profit / 100)));
        }
      } else if (field === "gst") {
        const r = Number(updated.rate) || 0;
        if (r > 0) updated.rateWithGst = String(roundTo2(r * (1 + Number(value) / 100)));
      }
      return { ...p, materialModelRates: { ...currentRates, [matName]: { ...matRates, [model]: updated } } };
    }));
  };

  const onPickerSelect = (priceItem) => {
    const { materialName, model } = picker;
    const gst = priceItem.gst ?? 18;
    const baseRate = priceItem.rate > 0 ? String(priceItem.rate) : "";
    setProjects((prev) => prev.map((p) => {
      if (p.id !== project.id) return p;
      const profit = Number((p.materialModelProfitPercent || {})[model]) || 0;
      const rate = baseRate ? String(roundTo2(Number(baseRate) * (1 + profit / 100))) : "";
      const rateWithGst = rate ? String(roundTo2(Number(rate) * (1 + gst / 100))) : "";
      const currentRates = p.materialModelRates || {};
      const matRates = currentRates[materialName] || emptyProjRates();
      return {
        ...p,
        materialModelRates: {
          ...currentRates,
          [materialName]: { ...matRates, [model]: { brand: priceItem.brand || "", baseRate, rate, gst: String(gst), rateWithGst } },
        },
      };
    }));
    setPicker(null);
  };

  // Profit % changed — recompute rate/rateWithGst from baseRate for every
  // material that has one, so nothing compounds on top of an already
  // profit-inflated rate.
  const applyProfitChange = (model, newProfitPercent) => {
    const profit = Number(newProfitPercent) || 0;
    setProjects((prev) => prev.map((p) => {
      if (p.id !== project.id) return p;
      const currentRates = p.materialModelRates || {};
      const nextRates = { ...currentRates };
      displayItems.forEach((item) => {
        const matRates = nextRates[item.materialName];
        const cell = matRates?.[model];
        if (!cell) return;
        const base = cell.baseRate !== undefined && cell.baseRate !== "" ? cell.baseRate : cell.rate;
        if (base === "" || base === undefined) return;
        const rate = roundTo2(Number(base) * (1 + profit / 100));
        const rateWithGst = roundTo2(rate * (1 + (Number(cell.gst) || 0) / 100));
        nextRates[item.materialName] = { ...matRates, [model]: { ...cell, baseRate: base, rate: String(rate), rateWithGst: String(rateWithGst) } };
      });
      return {
        ...p,
        materialModelRates: nextRates,
        materialModelProfitPercent: { ...(p.materialModelProfitPercent || { economy: 0, standard: 0, premium: 0 }), [model]: newProfitPercent },
      };
    }));
  };

  const resetToGlobal = () => {
    const snapshot = JSON.parse(JSON.stringify(globalRates || {}));
    setProjects((prev) => prev.map((p) =>
      p.id === project.id ? { ...p, materialModelRates: snapshot } : p
    ));
    setResetConfirm(false);
  };

  const inp = { fontSize: 11, padding: "3px 6px", borderRadius: 5, border: "1px solid #d1d5db", boxSizing: "border-box" };

  return (
    <div>
      {/* ── Group Tabs ── */}
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

      {/* ── Filter bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", flexWrap: "wrap" }}>
        {[{ ph: "Group…", v: searchGroup, s: setSearchGroup }, { ph: "Name…", v: searchName, s: setSearchName }].map(({ ph, v, s }) => (
          <div key={ph} style={{ position: "relative", flex: 1, minWidth: 120, maxWidth: 220 }}>
            <input type="text" placeholder={ph} value={v} onChange={(e) => s(e.target.value)}
              style={{ padding: "7px 26px 7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #d1d5db", width: "100%", boxSizing: "border-box" }} />
            {v && <span onClick={() => s("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#9ca3af", fontSize: 13 }}>✕</span>}
          </div>
        ))}
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{displayItems.length}{hideEmpty ? ` / ${filtered.length}` : ""} items</span>
        <button
          onClick={() => setHideEmpty((h) => !h)}
          style={{ background: hideEmpty ? "#2563eb" : "#f3f4f6", color: hideEmpty ? "#fff" : "#374151", border: "1px solid #d1d5db", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}
        >
          {hideEmpty ? "✓ Hide Unused" : "Hide Unused"}
        </button>
        {!globalHasRates && (
          <span style={{ fontSize: 11, color: "#854d0e", background: "#fef9c3", border: "1px solid #fde047", borderRadius: 6, padding: "4px 10px" }}>
            No global template yet — go to Configure → Material Models, save rates, then Reset here.
          </span>
        )}
        <button onClick={() => setResetConfirm(true)} style={{ marginLeft: "auto", background: "#dc2626", padding: "7px 14px", fontSize: 12 }}>
          ↺ Reset to Global Template
        </button>
      </div>

      {/* ── Column header ── */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 1fr 1fr", gap: 0, padding: "8px 24px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Material</div>
        {PROJ_MODELS.map((m) => (
          <div key={m} style={{ fontSize: 11, fontWeight: 700, color: PROJ_MODEL_COLORS[m], textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", borderLeft: "2px solid #e5e7eb", paddingLeft: 10 }}>
            {PROJ_MODEL_LABELS[m]}
          </div>
        ))}
      </div>

      {/* ── Profit % row — applied on top of every material's base rate below,
          before GST, so every Rate/Rate+GST in the table includes it. ── */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 1fr 1fr", gap: 0, padding: "10px 24px", background: "#fffbeb", borderBottom: "2px solid #fde68a" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", display: "flex", alignItems: "center" }}>Profit %</div>
        {PROJ_MODELS.map((model) => (
          <div key={model} style={{ borderLeft: "2px solid #fde68a", paddingLeft: 10, paddingRight: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="number" placeholder="0" value={profitPercent[model] ?? 0}
              onChange={(e) => applyProfitChange(model, e.target.value)}
              style={{ ...inp, width: 70, fontWeight: 700, color: PROJ_MODEL_COLORS[model], borderColor: "#f59e0b" }}
            />
            <span style={{ fontSize: 11, color: "#92400e" }}>added to every rate below</span>
          </div>
        ))}
      </div>

      {/* ── Items ── */}
      <div style={{ padding: "0 24px 40px" }}>
        {displayItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#6b7280", border: "2px dashed #e5e7eb", borderRadius: 10, marginTop: 16 }}>
            {hideEmpty ? "No materials with rates yet. Click \"Hide Unused\" to show all." : "No materials found. Add materials in Items Pricing first."}
          </div>
        ) : displayItems.map((item, idx) => {
          const matRates = rates[item.materialName] || {};
          return (
            <div key={item.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr 1fr 1fr", gap: 0, borderBottom: "1px solid #f0f0f0", background: idx % 2 === 0 ? "#fff" : "#fafafa", padding: "8px 0", alignItems: "start" }}>
              {/* Material info */}
              <div style={{ padding: "4px 8px 4px 0" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{item.materialName}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{item.group}{item.materialSpec ? ` · ${item.materialSpec}` : ""}{item.unit ? ` · ${item.unit}` : ""}</div>
              </div>
              {/* 3 model columns */}
              {PROJ_MODELS.map((model) => {
                const rawCell = matRates[model] || emptyM();
                // Legacy entries saved before Profit % existed have no
                // baseRate — treat their existing rate as the base.
                const cell = { ...rawCell, baseRate: rawCell.baseRate !== undefined && rawCell.baseRate !== "" ? rawCell.baseRate : rawCell.rate };
                const globalBrand = globalRates?.[item.materialName]?.[model]?.brand || "";
                const projBrand = cell.brand || "";
                const brandDiffers = globalBrand !== "" && projBrand !== globalBrand;
                return (
                  <div key={model} style={{ borderLeft: "2px solid #e5e7eb", paddingLeft: 10, paddingRight: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <input
                        type="text" placeholder="Brand" value={cell.brand || ""}
                        onChange={(e) => updateField(item.materialName, model, "brand", e.target.value)}
                        title={brandDiffers ? `Global template: "${globalBrand}"` : undefined}
                        style={{ ...inp, color: PROJ_MODEL_COLORS[model], fontWeight: 600, flex: 1, background: brandDiffers ? "#fef3c7" : undefined, borderColor: brandDiffers ? "#f59e0b" : undefined, boxShadow: brandDiffers ? "0 0 0 2px #fde68a" : undefined }}
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
                        <input type="number" placeholder="0.00" value={cell.baseRate || ""}
                          onChange={(e) => updateField(item.materialName, model, "rate", e.target.value)}
                          style={{ ...inp, width: "100%" }} />
                      </div>
                      <div style={{ width: 46 }}>
                        <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>GST %</div>
                        <input type="number" placeholder="18" value={cell.gst !== undefined ? cell.gst : "18"}
                          onChange={(e) => updateField(item.materialName, model, "gst", e.target.value)}
                          style={{ ...inp, width: 46 }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>Rate+GST (incl. Profit)</div>
                        <input type="number" placeholder="0.00" value={cell.rateWithGst || ""}
                          onChange={(e) => updateField(item.materialName, model, "rateWithGst", e.target.value)}
                          style={{ ...inp, width: "100%", background: cell.rateWithGst ? "#f0fdf4" : undefined }} />
                      </div>
                    </div>
                    {Number(profitPercent[model]) > 0 && cell.baseRate !== "" && (
                      <div style={{ fontSize: 10, color: "#92400e" }}>
                        Rate incl. Profit: ₹{cell.rate} <span style={{ color: "#9ca3af" }}>(base ₹{cell.baseRate} + {profitPercent[model]}%)</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {picker && (
        <ProjItemPickerModal
          materialName={picker.materialName}
          prices={prices}
          initialGroup={picker.group}
          onSelect={onPickerSelect}
          onClose={() => setPicker(null)}
        />
      )}

      {resetConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 420, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 17 }}>Reset Material Models?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#374151" }}>
              This will overwrite all project-specific rates with the current global template values. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={resetToGlobal} style={{ background: "#dc2626" }}>Yes, Reset</button>
              <button onClick={() => setResetConfirm(false)} style={{ background: "#6b7280" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
function Projects() {
  const navigate = useNavigate();
  const {
    projects, setProjects,
    subProjects, setSubProjects,
    setSelectedTemplateId,
    prices,
    materialModelRates,
    materialStockSettings,
    templates,
  } = useAppData();

  const [searchParams, setSearchParams] = useSearchParams();

  // Selection — initialise from ?id= URL param, fall back to first project
  const [selectedProjectId, setSelectedProjectId] = useState(() => {
    const p = searchParams.get("id");
    if (p) {
      const id = Number(p);
      if (projects.find((proj) => proj.id === id)) return id;
    }
    return projects[0]?.id ?? null;
  });
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [editingBoxName, setEditingBoxName] = useState(false);
  const [boxNameDraft, setBoxNameDraft] = useState("");

  // Sidebar's "+ New Project" link passes ?new=1 instead of a project id
  // (there's nothing to select yet) — open the Add Project modal for it, then
  // drop the param so refreshing the page doesn't reopen the modal.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openAddProject();
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync when sidebar navigates to ?id=X
  useEffect(() => {
    const p = searchParams.get("id");
    if (p) {
      const id = Number(p);
      if (projects.find((proj) => proj.id === id)) {
        setSelectedProjectId(id);
        setActiveRoomId(null);
        setActiveBoxId(null);
      }
    }
  }, [searchParams]);

  // Project modal
  const [projectModal, setProjectModal] = useState(false);
  const [editProjectId, setEditProjectId] = useState(null);
  // Submit-time validation feedback for the project modal. submitAttempted
  // keeps required-field highlighting off until the user actually tries to save.
  const [projectError, setProjectError] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const emptyP = { name: "", client: "", contact: "", email: "", location: "", address: "" };
  const [pForm, setPForm] = useState(emptyP);

  // Room modal
  const [roomModal, setRoomModal] = useState(false);
  const [editRoomId, setEditRoomId] = useState(null);
  const emptyR = { subProject: "", roomType: "" };
  const [rForm, setRForm] = useState(emptyR);

  // Box tabs
  const [activeBoxId, setActiveBoxId] = useState(null);
  const [boxMatPicker, setBoxMatPicker] = useState(null); // { field, label }
  const [hardwarePicker, setHardwarePicker] = useState(null); // { hwId }
  const [confirmDeleteBoxId, setConfirmDeleteBoxId] = useState(null);
  const [dimUnit, setDimUnit] = useState("mm"); // "mm" or "ft"
  const [confirmDeleteRoomId, setConfirmDeleteRoomId] = useState(null);
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState(null);

  const [cutSheetOpen, setCutSheetOpen] = useState(false);
  const [allCutSheetOpen, setAllCutSheetOpen] = useState(false);
  const [expandedEdgeId, setExpandedEdgeId] = useState(null);

  // Collapsible section state (mirrors TemplateMaster's numbered sections).
  // Each Sub Sheet Calculation gets its own key ("sheet_<id>"), toggled the
  // same way as "sheets"/"hardware"/"summary".
  const [openSections, setOpenSections] = useState({ sheets: false, hardware: false, summary: false });
  const toggleSection = (key) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // One-slot clipboard for the Copy/Paste buttons on each Sheet Calculation.
  const [copiedSheet, setCopiedSheet] = useState(null);
  // Extra length added to each edge band product's calculated meterage before
  // rounding, to cover cutting wastage/offcuts — editable, defaults to 0.
  // Persisted on the room (not just local state) so Project BOQ/Quotation compute
  // the same numbers shown here — see the sync effect below.
  const [edgeExtraMtr, setEdgeExtraMtrLocal] = useState(0);
  // Extra sq ft buffer added to the auto Carpenter row's Qty (= Area Sft),
  // same shared-across-all-Carpenter-rows pattern as edgeExtraMtr above.
  const [carpenterExtraSft, setCarpenterExtraSftLocal] = useState(0);
  // Fevicol Merino qty is auto-calculated (not hand-entered) as this multiplier
  // times the total Inside + Outside Laminate sheets required in the room —
  // editable, defaults to 0.7. Persisted on the room, same pattern as above.
  const [fevicolMultiplier, setFevicolMultiplierLocal] = useState(0.7);
  // GST % applied on top of Material Summary's Total/Sft Cost rows to show
  // both Excl. and Incl. GST figures — editable, defaults to 18%. Persisted
  // on the room, same pattern as above.
  const [gstPercent, setGstPercentLocal] = useState(18);

  // Project-level tab: "rooms" | "material-models"
  const [projectTab, setProjectTab] = useState("rooms");
  // Summary tab: hides materials whose Economy/Standard/Premium rate all
  // resolve to the exact same value — usually means no tier differentiation
  // has been set for that material, so it's just noise once comparing models.
  const [hideSamePricedSummary, setHideSamePricedSummary] = useState(false);

  // Reset tab when switching projects
  useEffect(() => {
    setProjectTab("rooms");
  }, [selectedProjectId]);

  // Auto-clone global material model rates into project on first open
  useEffect(() => {
    if (projectTab !== "material-models") return;
    if (!selectedProject) return;
    if (selectedProject.materialModelRates) return;
    setProjects(projects.map((p) =>
      p.id === selectedProjectId
        ? { ...p, materialModelRates: JSON.parse(JSON.stringify(materialModelRates)) }
        : p
    ));
  }, [projectTab, selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Material search modal — stores a callback so any field (room or box) can use it
  const [matModal, setMatModal] = useState(null); // { onSelect: (value) => void }

  // Template picker modal
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null); // template awaiting confirm-replace

  // ── Derived data ────────────────────────────────────────────────────────────
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const rooms = selectedProject
    ? subProjects.filter((s) => s.project === selectedProject.name)
    : [];
  const activeRoom =
    rooms.find((r) => r.id === activeRoomId) ??
    rooms[0] ??
    null;

  // Seed the Extra drafts from the active room's persisted values whenever the
  // room changes, so typing stays smooth (raw string while typing, committed
  // number on blur) while still reading/writing real room data — see the
  // setEdgeExtraMtr/setCarpenterExtraSft wrappers below.
  useEffect(() => {
    setEdgeExtraMtrLocal(Number(activeRoom?.edgeExtraMtr) || 0);
    setCarpenterExtraSftLocal(Number(activeRoom?.carpenterExtraSft) || 0);
    setFevicolMultiplierLocal(activeRoom?.fevicolMultiplier != null ? Number(activeRoom.fevicolMultiplier) : 0.7);
    setGstPercentLocal(activeRoom?.gstPercent != null ? Number(activeRoom.gstPercent) : 18);
  }, [activeRoomId]); // eslint-disable-line react-hooks/exhaustive-deps
  const setEdgeExtraMtr = (v) => {
    setEdgeExtraMtrLocal(v);
    if (typeof v === "number") updateRoomField("edgeExtraMtr", v);
  };
  const setCarpenterExtraSft = (v) => {
    setCarpenterExtraSftLocal(v);
    if (typeof v === "number") updateRoomField("carpenterExtraSft", v);
  };
  const setFevicolMultiplier = (v) => {
    setFevicolMultiplierLocal(v);
    if (typeof v === "number") updateRoomField("fevicolMultiplier", v);
  };
  const setGstPercent = (v) => {
    setGstPercentLocal(v);
    if (typeof v === "number") updateRoomField("gstPercent", v);
  };

  // ── Project CRUD ────────────────────────────────────────────────────────────
  const updatePForm = (patch) => {
    setPForm((f) => ({ ...f, ...patch }));
    setProjectError("");
  };

  const openAddProject = () => {
    setEditProjectId(null);
    setPForm(emptyP);
    setProjectError("");
    setSubmitAttempted(false);
    setProjectModal(true);
  };

  const openEditProject = (p) => {
    setEditProjectId(p.id);
    setPForm({
      name: p.name || "", client: p.client || "",
      contact: p.contact || "", email: p.email || "",
      location: p.location || "", address: p.address || "",
    });
    setProjectError("");
    setSubmitAttempted(false);
    setProjectModal(true);
  };

  const saveProject = () => {
    setSubmitAttempted(true);

    // Every field except Email ID is mandatory.
    const missing = [];
    if (!pForm.name.trim()) missing.push("Project Name");
    if (!pForm.client.trim()) missing.push("Client Name");
    if (!pForm.contact.trim()) missing.push("Contact Number");
    if (!pForm.location.trim()) missing.push("City / Location");
    if (!pForm.address.trim()) missing.push("Full Address");
    if (missing.length > 0) {
      setProjectError(`Please fill in: ${missing.join(", ")}.`);
      return;
    }
    if (!/^[0-9]{10}$/.test(pForm.contact)) {
      setProjectError("Contact Number must be exactly 10 digits.");
      return;
    }
    setProjectError("");
    setSubmitAttempted(false);
    if (editProjectId) {
      const oldName = projects.find((p) => p.id === editProjectId)?.name;
      const newName = pForm.name.trim();
      setProjects(projects.map((p) => p.id === editProjectId ? { ...p, ...pForm } : p));
      if (oldName && oldName !== newName) {
        setSubProjects((prev) =>
          prev.map((s) => s.project === oldName ? { ...s, project: newName } : s)
        );
      }
    } else {
      const id = projects.length ? Math.max(...projects.map((p) => p.id)) + 1 : 1;
      setProjects([...projects, { id, ...pForm }]);
      setSelectedProjectId(id);
    }
    setProjectModal(false);
  };

  const deleteProject = (proj) => {
    setProjects(projects.filter((p) => p.id !== proj.id));
    setSubProjects(subProjects.filter((s) => s.project !== proj.name));
    if (selectedProjectId === proj.id) {
      setSelectedProjectId(projects.find((p) => p.id !== proj.id)?.id ?? null);
      setActiveRoomId(null);
    }
    setConfirmDeleteProjectId(null);
  };

  // ── Room CRUD ───────────────────────────────────────────────────────────────
  const openAddRoom = () => {
    setEditRoomId(null);
    setRForm(emptyR);
    setRoomModal(true);
  };

  const openEditRoom = (r) => {
    setEditRoomId(r.id);
    setRForm({ subProject: r.subProject, roomType: r.roomType });
    setRoomModal(true);
  };

  const saveRoom = () => {
    if (!rForm.subProject.trim()) { alert("Room name is required."); return; }
    if (editRoomId) {
      setSubProjects(subProjects.map((s) => s.id === editRoomId ? { ...s, ...rForm } : s));
    } else {
      const id = subProjects.length ? Math.max(...subProjects.map((s) => s.id)) + 1 : 1;
      const newRoom = {
        id,
        project: selectedProject.name,
        subProject: rForm.subProject,
        roomType: rForm.roomType,
        matPly: "", matLaminate: "", matEdgeBand: "",
      };
      setSubProjects([...subProjects, newRoom]);
      setActiveRoomId(id);
    }
    setRoomModal(false);
  };

  const deleteRoom = (room) => {
    setSubProjects(subProjects.filter((s) => s.id !== room.id));
    if (activeRoomId === room.id) {
      setActiveRoomId(rooms.find((r) => r.id !== room.id)?.id ?? null);
    }
    setConfirmDeleteRoomId(null);
  };

  // ── Generic room field update ────────────────────────────────────────────────
  const updateRoomField = (field, value) => {
    if (!activeRoom) return;
    setSubProjects((prev) => prev.map((s) => s.id === activeRoom.id ? { ...s, [field]: value } : s));
  };

  const updateRoomMat = (field, value) => updateRoomField(field, value);

  // ── Box CRUD ─────────────────────────────────────────────────────────────────
  const boxes = activeRoom?.boxes || [];
  const activeBox = boxes.find((b) => b.id === activeBoxId) ?? boxes[0] ?? null;

  const addBox = () => {
    const id = boxes.length ? Math.max(...boxes.map((b) => b.id)) + 1 : 1;
    const newBox = {
      id, name: `Box ${id}`,
      includeInQuotation: true,
      boxType: "", frameType: "Framed", doorType: "", includeInMaterialCalc: true,
      widthMm: "", heightMm: "", depthMm: "",
      // Shown below Box Name, independent of the Sheet Calculation H/W/D
      // above — these drive the Quotation's Type of Work/Area/Carpenter
      // cost instead (see boxAreaSft/buildBoxCarpenterRow in projectRows.js).
      quotationBoxType: "", quotationDoorType: "",
      quotationWidthMm: "", quotationHeightMm: "", quotationDepthMm: "",
      matDoor: "", matDoorId: null, matCarcas: "", matCarcasId: null,
      matOutsideLaminate: "", matOutsideLaminateId: null,
      matInsideLaminate: "", matInsideLaminateId: null,
      matEdgeBeading: "", matEdgeBeadingId: null,
      templateId: null, templateName: "", templateType: "", hasDoors: false,
      itemName: "",
      doorsH: 2, doorsV: 1,
      shelves: 2, partitions: 0, backParts: 1, frontFrame: 0,
      parts: [], subSheets: [],
    };
    updateRoomField("boxes", [...boxes, newBox]);
    setActiveBoxId(id);
  };

  const applyTemplate = (template) => {
    const tBoxes = template.boxes || [];
    if (!tBoxes.length) return;
    const newBoxes = tBoxes.map((tb, i) => ({
      id: i + 1,
      name: tb.boxName || `Box ${i + 1}`,
      includeInQuotation: true,
      boxType: tb.boxType || "",
      frameType: "Framed",
      doorType: tb.doorType || "",
      includeInMaterialCalc: tb.includeInMaterialCalc !== false,
      widthMm: tb.widthMm || "",
      heightMm: tb.heightMm || "",
      depthMm: tb.depthMm || "",
      quotationBoxType: tb.quotationBoxType || "",
      quotationDoorType: tb.quotationDoorType || "",
      quotationWidthMm: tb.quotationWidthMm || "",
      quotationHeightMm: tb.quotationHeightMm || "",
      quotationDepthMm: tb.quotationDepthMm || "",
      matDoor: tb.matDoor || "", matDoorId: tb.matDoorId ?? null,
      matCarcas: tb.matCarcas || "", matCarcasId: tb.matCarcasId ?? null,
      matOutsideLaminate: tb.matOutsideLaminate || "", matOutsideLaminateId: tb.matOutsideLaminateId ?? null,
      matInsideLaminate: tb.matInsideLaminate || "", matInsideLaminateId: tb.matInsideLaminateId ?? null,
      matEdgeBeading: tb.matEdgeBeading || "", matEdgeBeadingId: tb.matEdgeBeadingId ?? null,
      templateId: template.id,
      templateName: template.templateName,
      hasDoors: !!tb.doorType,
      itemName: "",
      doorsH: tb.doorsH ?? 2, doorsV: tb.doorsV ?? 1,
      shelves: tb.shelves ?? 2, partitions: tb.partitions ?? 0,
      backParts: tb.backParts ?? 1, frontFrame: tb.frontFrame ?? 0,
      // Template formula & parts data (snapshot at apply-time)
      shortName: tb.shortName || "",
      refs: tb.refs || { ...DEFAULT_REFS },
      parts: JSON.parse(JSON.stringify(tb.parts || [])),
      subSheets: JSON.parse(JSON.stringify(tb.subSheets || [])),
      hardwareItems: JSON.parse(JSON.stringify(tb.hardwareItems || [])),
      customFields: JSON.parse(JSON.stringify(tb.customFields || [])),
      customMaterials: JSON.parse(JSON.stringify(tb.customMaterials || [])),
      materialLabels: { ...(tb.materialLabels || {}) },
      fieldLabels: { ...(tb.fieldLabels || {}) },
    }));
    updateRoomField("boxes", newBoxes);
    setActiveBoxId(newBoxes[0].id);
    setPendingTemplate(null);
  };


  const updateBox = (field, value) => {
    if (!activeBox) return;
    updateRoomField(
      "boxes",
      boxes.map((b) => b.id === activeBox.id ? { ...b, [field]: value } : b)
    );
  };

  // subSheetId omitted/null: acts on the box's own parts (as before). Given:
  // acts on that Sub Sheet Calculation's own parts instead — each sheet only
  // ever renames materials within its own parts, since sheets no longer share
  // a materials selection.
  const renameMaterialInParts = (updates, oldMat, newMat, oldId = null, newId = null, subSheetId) => {
    if (!activeBox) return;
    const hasChange = (oldMat && oldMat !== newMat) || (oldId != null && oldId !== newId);
    const renameParts = (parts) => hasChange
      ? (parts || []).map((p) => {
          const matchMat   = (oldId != null && p.materialId === oldId) || (p.material === oldMat && p.materialId == null);
          const matchSideA = (oldId != null && p.sideAId   === oldId) || (p.sideA    === oldMat && p.sideAId   == null);
          const matchSideB = (oldId != null && p.sideBId   === oldId) || (p.sideB    === oldMat && p.sideBId   == null);
          return {
            ...p,
            ...(matchMat   ? { material: newMat, materialId: newId ?? null } : {}),
            ...(matchSideA ? { sideA:    newMat, sideAId:    newId ?? null } : {}),
            ...(matchSideB ? { sideB:    newMat, sideBId:    newId ?? null } : {}),
          };
        })
      : parts;
    updateRoomField(
      "boxes",
      boxes.map((b) => {
        if (b.id !== activeBox.id) return b;
        if (subSheetId == null) {
          return { ...b, ...updates, parts: renameParts(b.parts) };
        }
        return {
          ...b,
          subSheets: (b.subSheets || []).map((s) =>
            s.id === subSheetId ? { ...s, ...updates, parts: renameParts(s.parts) } : s
          ),
        };
      })
    );
  };

  const deleteBox = (boxId) => {
    const updated = boxes.filter((b) => b.id !== boxId);
    updateRoomField("boxes", updated);
    if (activeBoxId === boxId) setActiveBoxId(updated[0]?.id ?? null);
    setConfirmDeleteBoxId(null);
  };


  // ── Cut Sheet Generator (mirrors TemplateMaster) ──────────────────────────
  const generateCutSheet = () => {
    if (!activeBox) return [];
    const rows = [];
    const rmat = (name, id) => id != null ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name) : name;
    let rowNum = 0;
    boxPartGroups(activeBox).forEach(({ vars, parts, label: groupLabel }) => {
      (parts || []).forEach((part) => {
        if (part.req === false) return;
        rowNum += 1;
        const w   = resolveFormula(part.widthMm,  vars);
        const h   = resolveFormula(part.heightMm, vars);
        const qty = resolveFormula(part.qty,       vars);
        const label    = `${groupLabel} ${part.partName}`.trim();
        const rotation = part.rotation || 1;
        const edgeData = {
          top:    part.edgeTopReq    !== false ? (part.edgeTop    ?? 0) : 0,
          bottom: part.edgeBottomReq !== false ? (part.edgeBottom ?? 0) : 0,
          left:   part.edgeLeftReq   !== false ? (part.edgeLeft   ?? 0) : 0,
          right:  part.edgeRightReq  !== false ? (part.edgeRight  ?? 0) : 0,
        };
        if (part.material || part.materialId) rows.push({ rowNum, w, h, qty, material: rmat(part.material, part.materialId), rotation, label, ...edgeData });
        if (part.sideA    || part.sideAId)   rows.push({ rowNum, w, h, qty, material: rmat(part.sideA,    part.sideAId),    rotation, label, ...edgeData });
        if (part.sideB    || part.sideBId)   rows.push({ rowNum, w, h, qty, material: rmat(part.sideB,    part.sideBId),    rotation, label, ...edgeData });
      });
    });
    rows.sort((a, b) => a.rowNum - b.rowNum || (a.material || "").localeCompare(b.material || ""));
    return rows;
  };

  // ── Cut Sheet for ALL boxes in the active room ───────────────────────────────
  const generateAllBoxesCutSheet = () => {
    const rows = [];
    const rmat = (name, id) => id != null ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name) : name;
    boxes.forEach((box) => {
      let rowNum = 0;
      boxPartGroups(box).forEach(({ vars, parts, label: groupLabel }) => {
        (parts || []).forEach((part) => {
          if (part.req === false) return;
          rowNum += 1;
          const w   = resolveFormula(part.widthMm,  vars);
          const h   = resolveFormula(part.heightMm, vars);
          const qty = resolveFormula(part.qty,       vars);
          const label    = `${groupLabel} ${part.partName}`.trim();
          const rotation = part.rotation || 1;
          const edgeData = {
            top:    part.edgeTopReq    !== false ? (part.edgeTop    ?? 0) : 0,
            bottom: part.edgeBottomReq !== false ? (part.edgeBottom ?? 0) : 0,
            left:   part.edgeLeftReq   !== false ? (part.edgeLeft   ?? 0) : 0,
            right:  part.edgeRightReq  !== false ? (part.edgeRight  ?? 0) : 0,
          };
          if (part.material || part.materialId) rows.push({ rowNum, w, h, qty, material: rmat(part.material, part.materialId), rotation, label, ...edgeData });
          if (part.sideA    || part.sideAId)   rows.push({ rowNum, w, h, qty, material: rmat(part.sideA,    part.sideAId),    rotation, label, ...edgeData });
          if (part.sideB    || part.sideBId)   rows.push({ rowNum, w, h, qty, material: rmat(part.sideB,    part.sideBId),    rotation, label, ...edgeData });
        });
      });
    });
    return rows;
  };

  // Edge banding for ONE box — auto-matched per Ply row to a compatible Edge
  // Band product (by thickness) instead of one manually-picked material for
  // the whole box. Falls back to the box's own Edge Beading selection when no
  // thickness match is found. Pure geometry — no wastage buffer applied here.
  // returns: { [edgeBandMaterialName]: lengthMm }
  const computeBoxEdgeBandingMm = (box) => {
    const totals = {};
    const rmat = (name, id) => id != null ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name) : name;
    boxPartGroups(box).forEach(({ vars, parts, sheet }) => {
      (parts || []).forEach((part) => {
        if (part.req === false) return;
        if (part.group !== "Ply") return;
        if (part.edgeReq === false) return;
        const w = resolveFormula(part.widthMm, vars);
        const h = resolveFormula(part.heightMm, vars);
        const qty = resolveFormula(part.qty, vars);
        if (!w || !h || w === "?" || h === "?" || !qty || qty === "?") return;
        let perPiece = 0;
        if (part.edgeTopReq    !== false) perPiece += w;
        if (part.edgeBottomReq !== false) perPiece += w;
        if (part.edgeLeftReq   !== false) perPiece += h;
        if (part.edgeRightReq  !== false) perPiece += h;
        if (!perPiece) return;
        const lengthMm = perPiece * qty;

        const plyName = rmat(part.material, part.materialId);
        const plyThickness = (prices || []).find((p) => p.materialName === plyName)?.plyThickness;
        const matched = plyThickness
          ? (prices || []).find((p) => p.group === "Edge Beading" && (p.suitableThickness || []).includes(Number(plyThickness)))
          : null;
        // Each sheet (box or sub-sheet) has its own Edge Beading selection now.
        const edgeBandName = matched?.materialName || rmat(sheet.matEdgeBeading, sheet.matEdgeBeadingId) || "Edge Band";

        totals[edgeBandName] = (totals[edgeBandName] || 0) + lengthMm;
      });
    });
    return totals;
  };

  // Edge banding rows for a box, ready to list in Hardware & Consumables.
  const computeBoxEdgeBandingRows = (box) => {
    const extra = Math.max(0, Number(edgeExtraMtr) || 0);
    return Object.entries(computeBoxEdgeBandingMm(box)).map(([material, lengthMm]) => {
      const base = Math.ceil(lengthMm / 1000);
      return { material, base, extra, qty: base + extra };
    });
  };

  // Carpenter row for a box — appears the moment a Box Type is chosen in
  // Section 1 Inputs (Box Type shares the same list as the Carpenter group in
  // Items Pricing), auto-filled with the item of the same name and qty from
  // that box's Area Sft ({Sft}).
  const computeBoxCarpenterRows = (box) => {
    const boxType = box.quotationBoxType || box.boxType;
    if (!boxType) return [];
    const extra = Math.max(0, Number(carpenterExtraSft) || 0);
    const base = quotationAreaSft(box);
    return [{ material: boxType, base, extra, qty: Math.round((base + extra) * 100) / 100 }];
  };

  // ── Material Summary across ALL boxes in the active room ────────────────────
  const computeMatSummary = () => {
    const rows = generateAllBoxesCutSheet();
    const getStockSize = (mat) => {
      const s = materialStockSettings?.[mat];
      return { sheetW: s?.sheetW || 2440, sheetH: s?.sheetH || 1220, sheetTexture: s?.sheetTexture ?? 1 };
    };
    const packed = packSheets(rows, getStockSize);
    const sheetCount = {};
    packed.forEach((s) => { sheetCount[s.material] = (sheetCount[s.material] || 0) + 1; });
    const materials = [...new Set(rows.map((r) => r.material).filter(Boolean))];
    const sheetRows = materials.map((material) => {
      const priceEntry = (prices || []).find((p) => p.materialName === material);
      const extraSheets = Math.max(0, Number(materialStockSettings?.[material]?.extraQty) || 0);
      return { material, group: priceEntry?.group || "Other", requiredQty: (sheetCount[material] || 0) + extraSheets, unit: priceEntry?.unit || "Sheet" };
    });

    const edgeSummed = {};
    boxes.forEach((box) => {
      computeBoxEdgeBandingRows(box).forEach(({ material, qty }) => {
        edgeSummed[material] = (edgeSummed[material] || 0) + qty;
      });
    });
    const edgeRows = Object.entries(edgeSummed).map(([material, requiredQty]) => ({
      material, group: "Edge Beading", requiredQty, unit: "Mtr",
    }));

    const carpSummed = {};
    boxes.forEach((box) => {
      computeBoxCarpenterRows(box).forEach(({ material, qty }) => {
        carpSummed[material] = (carpSummed[material] || 0) + qty;
      });
    });
    const carpRows = Object.entries(carpSummed).map(([material, requiredQty]) => ({
      material, group: "Carpenter", requiredQty: Math.round(requiredQty * 100) / 100,
      unit: (prices || []).find((p) => p.materialName === material)?.unit || "Sq.ft",
    }));

    const FEVICOL_NAME = "Fevicol Merino";
    const hwSummed = {};
    boxes.forEach((box) => {
      (box.hardwareItems || []).forEach((hw) => {
        if (!hw.materialName) return;
        if (hw.materialName === FEVICOL_NAME) return; // auto-calculated below instead of hand-entered
        const total = (Number(hw.qty) || 0) + (Number(hw.extra) || 0);
        hwSummed[hw.materialName] = (hwSummed[hw.materialName] || 0) + total;
      });
    });
    const hwRows = Object.entries(hwSummed).map(([material, requiredQty]) => {
      const priceEntry = (prices || []).find((p) => p.materialName === material);
      return { material, group: priceEntry?.group || "Other", requiredQty, unit: priceEntry?.unit || "Nos" };
    });

    // Fevicol Merino = multiplier × total Inside + Outside Laminate sheets
    // required (every "Laminate" group sheet in this room).
    const totalLaminateSheets = sheetRows.filter((r) => r.group === "Laminate").reduce((s, r) => s + r.requiredQty, 0);
    const fevicolQty = Math.round(totalLaminateSheets * (Number(fevicolMultiplier) || 0) * 100) / 100;
    const fevicolPriceEntry = (prices || []).find((p) => p.materialName === FEVICOL_NAME);
    const fevicolRows = fevicolQty > 0
      ? [{ material: FEVICOL_NAME, group: fevicolPriceEntry?.group || "Glue", requiredQty: fevicolQty, unit: fevicolPriceEntry?.unit || "KG" }]
      : [];

    return [...sheetRows, ...edgeRows, ...carpRows, ...hwRows, ...fevicolRows].sort((a, b) => a.group.localeCompare(b.group) || a.material.localeCompare(b.material));
  };

  // ── Material Summary across EVERY room/box in the project (Summary tab) ─────
  // Same aggregation as computeMatSummary above, but not scoped to activeRoom —
  // walks every room, using each room's own persisted Edge/Carpenter extra
  // buffers (not the currently-active room's local state).
  const computeProjectMatSummary = () => {
    const rmat = (name, id) => id != null ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name) : name;
    const rows = [];
    rooms.forEach((room) => {
      (room.boxes || []).forEach((box) => {
        let rowNum = 0;
        boxPartGroups(box).forEach(({ vars, parts, label: groupLabel }) => {
          (parts || []).forEach((part) => {
            if (part.req === false) return;
            rowNum += 1;
            const w   = resolveFormula(part.widthMm,  vars);
            const h   = resolveFormula(part.heightMm, vars);
            const qty = resolveFormula(part.qty,       vars);
            const label    = `${groupLabel} ${part.partName}`.trim();
            const rotation = part.rotation || 1;
            const edgeData = {
              top:    part.edgeTopReq    !== false ? (part.edgeTop    ?? 0) : 0,
              bottom: part.edgeBottomReq !== false ? (part.edgeBottom ?? 0) : 0,
              left:   part.edgeLeftReq   !== false ? (part.edgeLeft   ?? 0) : 0,
              right:  part.edgeRightReq  !== false ? (part.edgeRight  ?? 0) : 0,
            };
            if (part.material || part.materialId) rows.push({ rowNum, w, h, qty, material: rmat(part.material, part.materialId), rotation, label, ...edgeData });
            if (part.sideA    || part.sideAId)   rows.push({ rowNum, w, h, qty, material: rmat(part.sideA,    part.sideAId),    rotation, label, ...edgeData });
            if (part.sideB    || part.sideBId)   rows.push({ rowNum, w, h, qty, material: rmat(part.sideB,    part.sideBId),    rotation, label, ...edgeData });
          });
        });
      });
    });
    const getStockSize = (mat) => {
      const s = materialStockSettings?.[mat];
      return { sheetW: s?.sheetW || 2440, sheetH: s?.sheetH || 1220, sheetTexture: s?.sheetTexture ?? 1 };
    };
    const packed = packSheets(rows, getStockSize);
    const sheetCount = {};
    packed.forEach((s) => { sheetCount[s.material] = (sheetCount[s.material] || 0) + 1; });
    const materials = [...new Set(rows.map((r) => r.material).filter(Boolean))];
    const sheetRows = materials.map((material) => {
      const priceEntry = (prices || []).find((p) => p.materialName === material);
      const extraSheets = Math.max(0, Number(materialStockSettings?.[material]?.extraQty) || 0);
      return { material, group: priceEntry?.group || "Other", requiredQty: (sheetCount[material] || 0) + extraSheets, unit: priceEntry?.unit || "Sheet" };
    });

    const edgeSummed = {};
    rooms.forEach((room) => {
      const extra = Math.max(0, Number(room.edgeExtraMtr) || 0);
      (room.boxes || []).forEach((box) => {
        Object.entries(computeBoxEdgeBandingMm(box)).forEach(([material, lengthMm]) => {
          const base = Math.ceil(lengthMm / 1000);
          edgeSummed[material] = (edgeSummed[material] || 0) + base + extra;
        });
      });
    });
    const edgeRows = Object.entries(edgeSummed).map(([material, requiredQty]) => ({
      material, group: "Edge Beading", requiredQty, unit: "Mtr",
    }));

    const carpSummed = {};
    rooms.forEach((room) => {
      const extra = Math.max(0, Number(room.carpenterExtraSft) || 0);
      (room.boxes || []).forEach((box) => {
        if (!box.boxType) return;
        const base = Number(BOX_VARS(box).Sft) || 0;
        const qty = Math.round((base + extra) * 100) / 100;
        carpSummed[box.boxType] = (carpSummed[box.boxType] || 0) + qty;
      });
    });
    const carpRows = Object.entries(carpSummed).map(([material, requiredQty]) => ({
      material, group: "Carpenter", requiredQty: Math.round(requiredQty * 100) / 100,
      unit: (prices || []).find((p) => p.materialName === material)?.unit || "Sq.ft",
    }));

    const hwSummed = {};
    rooms.forEach((room) => {
      (room.boxes || []).forEach((box) => {
        (box.hardwareItems || []).forEach((hw) => {
          if (!hw.materialName) return;
          const total = (Number(hw.qty) || 0) + (Number(hw.extra) || 0);
          hwSummed[hw.materialName] = (hwSummed[hw.materialName] || 0) + total;
        });
      });
    });
    const hwRows = Object.entries(hwSummed).map(([material, requiredQty]) => {
      const priceEntry = (prices || []).find((p) => p.materialName === material);
      return { material, group: priceEntry?.group || "Other", requiredQty, unit: priceEntry?.unit || "Nos" };
    });

    return [...sheetRows, ...edgeRows, ...carpRows, ...hwRows].sort((a, b) => a.group.localeCompare(b.group) || a.material.localeCompare(b.material));
  };

  // ── Part CRUD for Sheets Calculation in Room ─────────────────────────────────
  // Every fn takes an optional trailing subSheetId: omitted (undefined), it acts
  // on the box's own parts as before; given, it acts on that Sub Sheet
  // Calculation's parts instead (see Sub Sheet Calculations UI below Section 1).
  const updatePart = (partId, field, value, subSheetId) => {
    if (!activeBox) return;
    if (subSheetId == null) {
      updateBox("parts", (activeBox.parts || []).map((p) => p.id === partId ? { ...p, [field]: value } : p));
    } else {
      updateBox("subSheets", (activeBox.subSheets || []).map((s) =>
        s.id === subSheetId ? { ...s, parts: (s.parts || []).map((p) => p.id === partId ? { ...p, [field]: value } : p) } : s
      ));
    }
  };

  const updatePartFields = (partId, fields, subSheetId) => {
    if (!activeBox) return;
    if (subSheetId == null) {
      updateBox("parts", (activeBox.parts || []).map((p) => p.id === partId ? { ...p, ...fields } : p));
    } else {
      updateBox("subSheets", (activeBox.subSheets || []).map((s) =>
        s.id === subSheetId ? { ...s, parts: (s.parts || []).map((p) => p.id === partId ? { ...p, ...fields } : p) } : s
      ));
    }
  };

  const addPart = (subSheetId) => {
    if (!activeBox) return;
    if (subSheetId == null) {
      const parts = activeBox.parts || [];
      const id = parts.length ? Math.max(...parts.map((p) => p.id)) + 1 : 1;
      updateBox("parts", [...parts, emptyPart(id)]);
    } else {
      const sub = (activeBox.subSheets || []).find((s) => s.id === subSheetId);
      const parts = sub?.parts || [];
      const id = parts.length ? Math.max(...parts.map((p) => p.id)) + 1 : 1;
      updateBox("subSheets", (activeBox.subSheets || []).map((s) =>
        s.id === subSheetId ? { ...s, parts: [...parts, emptyPart(id)] } : s
      ));
    }
  };

  const deletePart = (partId, subSheetId) => {
    if (!activeBox) return;
    if (subSheetId == null) {
      updateBox("parts", (activeBox.parts || []).filter((p) => p.id !== partId));
    } else {
      updateBox("subSheets", (activeBox.subSheets || []).map((s) =>
        s.id === subSheetId ? { ...s, parts: (s.parts || []).filter((p) => p.id !== partId) } : s
      ));
    }
  };

  // ── Sub Sheet Calculation CRUD (nested cut-lists under a box, e.g. drawers
  // inside a Wardrobe) ──────────────────────────────────────────────────────────
  const addSubSheet = () => {
    if (!activeBox) return;
    const subs = activeBox.subSheets || [];
    const id = subs.length ? Math.max(...subs.map((s) => s.id)) + 1 : 1;
    updateBox("subSheets", [...subs, newSubSheet(id)]);
  };

  const updateSubSheet = (subSheetId, field, value) => {
    if (!activeBox) return;
    updateBox("subSheets", (activeBox.subSheets || []).map((s) => s.id === subSheetId ? { ...s, [field]: value } : s));
  };

  const deleteSubSheet = (subSheetId) => {
    if (!activeBox) return;
    updateBox("subSheets", (activeBox.subSheets || []).filter((s) => s.id !== subSheetId));
  };

  // Copy the full Materials/Fields/Parts config off one sheet (box's own "1."
  // or a Sub Sheet Calculation), so it can be Pasted onto another sheet in
  // the same box — a one-slot clipboard, not per-sheet state, so Copy on one
  // sheet and Paste on another is the whole interaction.
  const copySheetData = (subSheetId) => {
    if (!activeBox) return;
    const sheet = subSheetId == null ? activeBox : (activeBox.subSheets || []).find((s) => s.id === subSheetId);
    if (!sheet) return;
    const fields = {};
    SHEET_COPY_FIELDS.forEach((f) => {
      const v = sheet[f];
      fields[f] = v === undefined ? v : JSON.parse(JSON.stringify(v));
    });
    setCopiedSheet({ fields, sourceLabel: subSheetId == null ? (activeBox.boxName || activeBox.name || "1.") : (sheet.name || "Sub Sheet") });
  };

  const pasteSheetData = (subSheetId) => {
    if (!activeBox || !copiedSheet) return;
    const fields = {};
    SHEET_COPY_FIELDS.forEach((f) => {
      const v = copiedSheet.fields[f];
      fields[f] = v === undefined ? v : JSON.parse(JSON.stringify(v));
    });
    if (subSheetId == null) {
      updateRoomField("boxes", boxes.map((b) => b.id === activeBox.id ? { ...b, ...fields } : b));
    } else {
      updateBox("subSheets", (activeBox.subSheets || []).map((s) => s.id === subSheetId ? { ...s, ...fields } : s));
    }
  };

  // ── Hardware & Consumables CRUD (Hardware, Handles, Glue, Addons, Tape, Hinges & Sliders) ──
  // Cross-box editor (Section 3 sits at room level, listing every box), so
  // these take an explicit boxId instead of implicitly acting on activeBox.
  const updateBoxById = (boxId, field, value) => {
    updateRoomField("boxes", boxes.map((b) => b.id === boxId ? { ...b, [field]: value } : b));
  };
  const addHardwareItem = (boxId, fields = {}) => {
    if (!boxId) return;
    const box = boxes.find((b) => b.id === boxId);
    const items = box?.hardwareItems || [];
    const id = items.length ? Math.max(...items.map((h) => h.id)) + 1 : 1;
    updateBoxById(boxId, "hardwareItems", [...items, { id, materialName: "", materialId: null, qty: 1, extra: 0, ...fields }]);
  };
  const updateHardwareItem = (boxId, id, field, value) => {
    if (!boxId) return;
    const box = boxes.find((b) => b.id === boxId);
    updateBoxById(boxId, "hardwareItems", (box?.hardwareItems || []).map((h) => h.id === id ? { ...h, [field]: value } : h));
  };
  const updateHardwareItemFields = (boxId, id, fields) => {
    if (!boxId) return;
    const box = boxes.find((b) => b.id === boxId);
    updateBoxById(boxId, "hardwareItems", (box?.hardwareItems || []).map((h) => h.id === id ? { ...h, ...fields } : h));
  };
  const deleteHardwareItem = (boxId, id) => {
    if (!boxId) return;
    const box = boxes.find((b) => b.id === boxId);
    updateBoxById(boxId, "hardwareItems", (box?.hardwareItems || []).filter((h) => h.id !== id));
  };


  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 12, overflow: "hidden" }}>

      {/* ── Project Detail ──────────────────────────────────────────────────── */}
      <div style={{ overflowY: "auto", padding: "0 0 24px" }}>
        {!selectedProject ? (
          <div style={{ padding: 60, textAlign: "center", color: "#6b7280" }}>
            <p style={{ fontSize: 16, marginBottom: 20 }}>Select a project or create a new one.</p>
            <button onClick={openAddProject}>+ Create Project</button>
          </div>
        ) : (
          <>
            {/* ── Project Header ── */}
            <div style={{ padding: "12px 24px 8px", borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{selectedProject.name}</h2>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: 13, color: "#374151" }}>
                    <span><strong>Client:</strong> {selectedProject.client || "—"}</span>
                    {selectedProject.contact && <span>📞 {selectedProject.contact}</span>}
                    {selectedProject.email && <span>✉ {selectedProject.email}</span>}
                  </div>
                  {(selectedProject.location || selectedProject.address) && (
                    <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                      📍 {[selectedProject.location, selectedProject.address].filter(Boolean).join(", ")}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={openAddProject} style={{ background: "#2563eb", padding: "6px 14px", fontSize: 13 }}>
                    + New Project
                  </button>
                  <button onClick={() => openEditProject(selectedProject)} style={{ background: "#6b7280", padding: "6px 14px", fontSize: 13 }}>
                    ✏ Edit Info
                  </button>
                  {confirmDeleteProjectId === selectedProject.id ? (
                    <>
                      <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>Delete project?</span>
                      <button onClick={() => deleteProject(selectedProject)} style={{ background: "#dc2626", padding: "6px 14px", fontSize: 13 }}>Yes</button>
                      <button onClick={() => setConfirmDeleteProjectId(null)} style={{ background: "#6b7280", padding: "6px 14px", fontSize: 13 }}>No</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteProjectId(selectedProject.id)} style={{ background: "#dc2626", padding: "6px 14px", fontSize: 13 }}>
                      🗑 Delete
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Project-level Tab Bar ── */}
            <div style={{ borderBottom: "2px solid #e5e7eb", padding: "0 24px", display: "flex", alignItems: "flex-end", gap: 0, background: "#fff" }}>
              {[["rooms", "🏠 Rooms & Boxes"], ["material-models", "📋 Material Models"], ["summary", "📊 Summary"], ["quotation", "🧾 Quotation"]].map(([tab, label]) => {
                const active = projectTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setProjectTab(tab)}
                    style={{
                      padding: "7px 20px",
                      border: "none",
                      borderBottom: active ? "3px solid #2563eb" : "3px solid transparent",
                      background: "none",
                      color: active ? "#2563eb" : "#374151",
                      fontWeight: active ? 700 : 400,
                      cursor: "pointer",
                      fontSize: 14,
                      marginBottom: -2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* ── Project Material Models Tab ── */}
            {projectTab === "material-models" && (
              <ProjectMaterialModels
                project={selectedProject}
                prices={prices}
                globalRates={materialModelRates}
                setProjects={setProjects}
              />
            )}

            {/* ── Project Quotation Tab ── */}
            {projectTab === "quotation" && (
              <div style={{ padding: "20px 24px" }}>
                <ProjectQuotation initialProjectName={selectedProject.name} lockProject />
              </div>
            )}

            {/* ── Project Summary Tab — total material required + costed across
                every room, with each Items Pricing group's own subtotal so a
                model/budget decision can be made group-by-group, not just on
                the grand total. ── */}
            {projectTab === "summary" && (() => {
              // Rate for a material under one Material Model variant — this
              // project's own override if set, else the global Items Pricing rate.
              const modelRateFor = (material, model) => {
                const modelEntry = selectedProject?.materialModelRates?.[material]?.[model];
                if (modelEntry?.rate) return Number(modelEntry.rate);
                const rateData = (prices || []).find((p) => p.materialName === material);
                return rateData ? Number(rateData.rate) : 0;
              };
              // Cost each row (Standard model — the default-selected tier
              // elsewhere) up front so both the group ordering and the
              // material ordering within a group can rank by total cost,
              // highest first, instead of alphabetically.
              const costedRows = computeProjectMatSummary().map((row) => ({
                ...row, _stdAmount: row.requiredQty * modelRateFor(row.material, "standard"),
              }));
              const groupTotals = {};
              costedRows.forEach((row) => {
                const g = (groupTotals[row.group] ??= { economy: 0, standard: 0, premium: 0 });
                PROJ_MODELS.forEach((model) => {
                  g[model] += row.requiredQty * modelRateFor(row.material, model);
                });
              });
              const modelTotals = { economy: 0, standard: 0, premium: 0 };
              Object.values(groupTotals).forEach((g) => {
                PROJ_MODELS.forEach((model) => { modelTotals[model] += g[model]; });
              });
              const sortedRows = [...costedRows].sort((a, b) =>
                groupTotals[b.group].standard - groupTotals[a.group].standard ||
                b._stdAmount - a._stdAmount
              );
              // "Same priced" = Economy/Standard/Premium all resolve to the
              // same non-zero rate — no tier differentiation set for that
              // material, so it's just noise once you're comparing models.
              const isSamePriced = (row) => {
                const rates = PROJ_MODELS.map((m) => modelRateFor(row.material, m));
                if (rates.some((r) => !r)) return false;
                return rates.every((r) => r === rates[0]);
              };
              const samePricedCount = sortedRows.filter(isSamePriced).length;
              const visibleRows = hideSamePricedSummary ? sortedRows.filter((r) => !isSamePriced(r)) : sortedRows;
              const summaryRows = withGroupSpan(visibleRows);
              return (
                <div style={{ padding: "20px 24px" }}>
                  <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Material Summary — All Rooms</h3>
                      <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
                        Total material required and costed (Economy/Standard/Premium) across {rooms.length} room{rooms.length !== 1 ? "s" : ""} in this project, with each group's own contribution to the total.
                      </p>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer", whiteSpace: "nowrap" }}>
                      <input type="checkbox" checked={hideSamePricedSummary} onChange={(e) => setHideSamePricedSummary(e.target.checked)} />
                      Hide same-priced items{samePricedCount > 0 ? ` (${samePricedCount})` : ""}
                    </label>
                  </div>
                  {summaryRows.length === 0 ? (
                    <div style={{ padding: "16px 14px", color: "#9ca3af", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" }}>
                      {sortedRows.length === 0 ? "No materials assigned across any room yet." : "All materials are same-priced across models — nothing left to show with the filter on."}
                    </div>
                  ) : (
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
                        <thead>
                          <tr>
                            <th rowSpan={2} style={{ background: "#1e3a5f", color: "#fff", padding: "9px 14px", fontWeight: 700, fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Group</th>
                            <th rowSpan={2} style={{ background: "#1e3a5f", color: "#fff", padding: "9px 14px", fontWeight: 700, fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Material</th>
                            <th rowSpan={2} style={{ background: "#1e3a5f", color: "#fff", padding: "9px 14px", fontWeight: 700, fontSize: 11, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Required Qty</th>
                            <th rowSpan={2} style={{ background: "#1e3a5f", color: "#fff", padding: "9px 14px", fontWeight: 700, fontSize: 11, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>UOM</th>
                            {PROJ_MODELS.map((model) => (
                              <th key={model} colSpan={2} style={{ background: PROJ_MODEL_COLORS[model], color: "#fff", padding: "6px 14px", fontWeight: 700, fontSize: 11, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", borderLeft: "2px solid rgba(255,255,255,0.3)" }}>{PROJ_MODEL_LABELS[model]}</th>
                            ))}
                          </tr>
                          <tr>
                            {PROJ_MODELS.map((model) => (
                              <Fragment key={model}>
                                <th style={{ background: "#1e3a5f", color: "#cbd5e1", padding: "6px 10px", fontWeight: 600, fontSize: 10, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", borderLeft: "2px solid rgba(255,255,255,0.15)" }}>Rate</th>
                                <th style={{ background: "#1e3a5f", color: "#cbd5e1", padding: "6px 10px", fontWeight: 600, fontSize: 10, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Amount</th>
                              </Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {summaryRows.map((row, i) => {
                            const isLastOfGroup = i === summaryRows.length - 1 || summaryRows[i + 1].group !== row.group;
                            return (
                              <Fragment key={`${row.group}::${row.material}`}>
                                <tr style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                                  {row._groupFirst && (
                                    <td rowSpan={row._groupSpan} style={{ padding: "8px 14px", borderBottom: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb", color: "#6b7280", verticalAlign: "top", background: "#fff" }}>{row.group}</td>
                                  )}
                                  <td style={{ padding: "8px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, color: "#111827" }}>{row.material}</td>
                                  <td style={{ padding: "8px 14px", borderBottom: "1px solid #e5e7eb", textAlign: "center", color: "#374151", fontWeight: 700 }}>{row.requiredQty}</td>
                                  <td style={{ padding: "8px 14px", borderBottom: "1px solid #e5e7eb", textAlign: "center", color: "#6b7280" }}>{row.unit}</td>
                                  {PROJ_MODELS.map((model) => {
                                    const rate = modelRateFor(row.material, model);
                                    const amount = row.requiredQty * rate;
                                    return (
                                      <Fragment key={model}>
                                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", borderLeft: "1px solid #e5e7eb", textAlign: "center", color: PROJ_MODEL_COLORS[model] }}>
                                          {rate > 0 ? formatCurrency(rate) : <span style={{ color: "#d1d5db" }}>—</span>}
                                        </td>
                                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", textAlign: "center", fontWeight: 600, color: "#111827" }}>
                                          {amount > 0 ? formatCurrency(amount) : <span style={{ color: "#d1d5db" }}>—</span>}
                                        </td>
                                      </Fragment>
                                    );
                                  })}
                                </tr>
                                {isLastOfGroup && (
                                  <tr style={{ background: "#eef2ff" }}>
                                    <td colSpan={4} style={{ padding: "7px 14px", fontWeight: 700, color: "#374151", fontSize: 12 }}>{row.group} Total</td>
                                    {PROJ_MODELS.map((model) => (
                                      <td key={model} colSpan={2} style={{ padding: "7px 14px", textAlign: "center", fontWeight: 700, color: PROJ_MODEL_COLORS[model], fontSize: 12, borderLeft: "1px solid #e0e7ff" }}>
                                        {formatCurrency(groupTotals[row.group][model])}
                                      </td>
                                    ))}
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                          <tr style={{ background: "#1e3a5f" }}>
                            <td colSpan={4} style={{ padding: "9px 14px", fontWeight: 700, color: "#fff", fontSize: 12 }}>Grand Total (Excl. GST)</td>
                            {PROJ_MODELS.map((model) => (
                              <td key={model} colSpan={2} style={{ padding: "9px 14px", textAlign: "center", fontWeight: 700, color: "#fff", fontSize: 12, borderLeft: "2px solid rgba(255,255,255,0.15)" }}>
                                {formatCurrency(modelTotals[model])}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Room Tabs — only shown when Rooms tab is active ── */}
            {projectTab === "rooms" && <div style={{ borderBottom: "2px solid #e5e7eb", padding: "0 24px", display: "flex", alignItems: "flex-end", gap: 2, flexWrap: "wrap", background: "#fff" }}>
              {rooms.map((room) => {
                const isActive =
                  activeRoom?.id === room.id ||
                  (!activeRoomId && rooms[0]?.id === room.id);
                return (
                  <button
                    key={room.id}
                    onClick={() => { setActiveRoomId(room.id); setActiveBoxId(null); setEditingBoxName(false); }}
                    style={{
                      padding: "7px 16px",
                      border: "none",
                      borderBottom: isActive ? "3px solid #2563eb" : "3px solid transparent",
                      background: "none",
                      color: isActive ? "#2563eb" : "#374151",
                      fontWeight: isActive ? 700 : 400,
                      cursor: "pointer",
                      fontSize: 14,
                      marginBottom: -2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {room.subProject}
                    {room.roomType && (
                      <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 5 }}>({room.roomType})</span>
                    )}
                  </button>
                );
              })}
              <button
                onClick={openAddRoom}
                style={{ padding: "10px 14px", border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 13, marginLeft: 4, whiteSpace: "nowrap" }}
              >
                + Room
              </button>
            </div>}

            {/* ── Room Content ── */}
            {projectTab === "rooms" && <div style={{ padding: "12px 24px" }}>
              {rooms.length === 0 ? (
                <div style={{ textAlign: "center", padding: 48, border: "2px dashed #e5e7eb", borderRadius: 12, color: "#6b7280" }}>
                  <p style={{ fontSize: 15, marginBottom: 16 }}>No rooms added yet.</p>
                  <button onClick={openAddRoom}>+ Add First Room</button>
                </div>
              ) : activeRoom ? (
                <>
                  {/* Room title row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>{activeRoom.subProject}</span>
                      {activeRoom.roomType && (
                        <span style={{ marginLeft: 10, fontSize: 13, color: "#6b7280", background: "#f3f4f6", padding: "2px 10px", borderRadius: 12 }}>
                          {activeRoom.roomType}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button onClick={() => openEditRoom(activeRoom)} style={{ background: "#6b7280", padding: "5px 12px", fontSize: 12 }}>Edit Room</button>
                      {confirmDeleteRoomId === activeRoom.id ? (
                        <>
                          <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>Delete room?</span>
                          <button onClick={() => deleteRoom(activeRoom)} style={{ background: "#dc2626", padding: "5px 12px", fontSize: 12 }}>Yes</button>
                          <button onClick={() => setConfirmDeleteRoomId(null)} style={{ background: "#6b7280", padding: "5px 12px", fontSize: 12 }}>No</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDeleteRoomId(activeRoom.id)} style={{ background: "#dc2626", padding: "5px 12px", fontSize: 12 }}>Delete</button>
                      )}
                    </div>
                  </div>


                  {/* 1. Box Tabs */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{
                      display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: 2,
                      borderBottom: "2px solid #e5e7eb", marginBottom: 0,
                    }}>
                      {boxes.map((box) => {
                        const isActive = activeBox?.id === box.id || (!activeBoxId && boxes[0]?.id === box.id);
                        const excluded = box.includeInQuotation === false;
                        return (
                          <button
                            key={box.id}
                            onClick={() => { setActiveBoxId(box.id); setEditingBoxName(false); }}
                            title={excluded ? "Not included in Quotation" : undefined}
                            style={{
                              padding: "6px 14px",
                              border: "none",
                              borderBottom: isActive ? "3px solid #7c3aed" : "3px solid transparent",
                              background: "none",
                              color: isActive ? "#7c3aed" : excluded ? "#9ca3af" : "#374151",
                              fontWeight: isActive ? 700 : 400,
                              fontStyle: excluded ? "italic" : "normal",
                              cursor: "pointer",
                              fontSize: 13,
                              marginBottom: -2,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {box.name}
                            {excluded && <span style={{ marginLeft: 4, fontSize: 11 }}>🚫</span>}
                          </button>
                        );
                      })}
                      <button
                        onClick={addBox}
                        style={{ padding: "7px 12px", border: "none", background: "none", color: "#7c3aed", cursor: "pointer", fontSize: 12, marginLeft: 2, whiteSpace: "nowrap" }}
                      >
                        + Add Box
                      </button>
                      <button
                        onClick={() => setTemplatePickerOpen(true)}
                        style={{ padding: "7px 12px", border: "none", background: "none", color: "#1d4ed8", cursor: "pointer", fontSize: 12, marginLeft: 2, whiteSpace: "nowrap" }}
                      >
                        📐 Apply Template
                      </button>
                    </div>
                    {pendingTemplate && (
                      <div style={{ background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 8, padding: "10px 14px", marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, color: "#92400e" }}>
                          Apply template <strong>"{pendingTemplate.templateName}"</strong>? This will replace {boxes.length} existing box{boxes.length !== 1 ? "es" : ""}.
                        </span>
                        <button onClick={() => applyTemplate(pendingTemplate)} style={{ background: "#7c3aed", padding: "4px 14px", fontSize: 12 }}>Replace</button>
                        <button onClick={() => setPendingTemplate(null)} style={{ background: "#6b7280", padding: "4px 14px", fontSize: 12 }}>Cancel</button>
                      </div>
                    )}

                    {/* Box card */}
                    {activeBox && (
                      <div style={{ border: "1px solid #ede9fe", borderTop: "none", borderRadius: "0 0 10px 10px", background: "#faf5ff", padding: "10px 16px 16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          {editingBoxName ? (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input
                                autoFocus
                                value={boxNameDraft}
                                onChange={(e) => setBoxNameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { updateBox("name", boxNameDraft); setEditingBoxName(false); }
                                  if (e.key === "Escape") setEditingBoxName(false);
                                }}
                                style={{ fontWeight: 700, fontSize: 14, border: "1px solid #ddd6fe", borderRadius: 6, padding: "4px 10px", background: "#fff", width: 180 }}
                              />
                              <button
                                onClick={() => { updateBox("name", boxNameDraft); setEditingBoxName(false); }}
                                style={{ padding: "4px 10px", fontSize: 12 }}
                              >Save</button>
                              <button
                                onClick={() => setEditingBoxName(false)}
                                style={{ padding: "4px 10px", fontSize: 12, background: "#6b7280" }}
                              >Cancel</button>
                            </div>
                          ) : (
                            <span style={{ fontWeight: 700, fontSize: 15, color: "#4c1d95" }}>{activeBox.name}</span>
                          )}
                          <div style={{ display: "flex", gap: 6 }}>
                            {!editingBoxName && (
                              <button
                                onClick={() => { setBoxNameDraft(activeBox.name); setEditingBoxName(true); }}
                                style={{ background: "#6b7280", padding: "4px 10px", fontSize: 12 }}
                              >Edit</button>
                            )}
                            {confirmDeleteBoxId === activeBox.id ? (
                              <>
                                <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>Delete?</span>
                                <button
                                  onClick={() => deleteBox(activeBox.id)}
                                  style={{ background: "#dc2626", padding: "4px 10px", fontSize: 12 }}
                                >Yes</button>
                                <button
                                  onClick={() => setConfirmDeleteBoxId(null)}
                                  style={{ background: "#6b7280", padding: "4px 10px", fontSize: 12 }}
                                >No</button>
                              </>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteBoxId(activeBox.id)}
                                style={{ background: "#dc2626", padding: "4px 10px", fontSize: 12 }}
                              >Delete</button>
                            )}
                          </div>
                        </div>

                        {/* ── Quotation Inputs — always visible, independent of Section 1's
                            H/W/D/Type of Work used for Sheet Calculation. These drive what
                            the Project Quotation shows (Type of Work, Area, Carpenter cost). ── */}
                        <div style={{ border: "1px solid #ede9fe", borderRadius: 8, background: "#fff", padding: "10px 12px", marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                            Quotation Details
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>Box Type</label>
                              <select value={activeBox.quotationBoxType || ""} onChange={(e) => updateBox("quotationBoxType", e.target.value)} style={{ fontSize: 12, padding: "3px 6px", width: 120 }}>
                                <option value="">— Select —</option>
                                {(prices || []).filter((p) => p.group === "Carpenter").map((p) => (
                                  <option key={p.id} value={p.materialName}>{p.materialName}</option>
                                ))}
                              </select>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>Door Type</label>
                              <select value={activeBox.quotationDoorType || ""} onChange={(e) => updateBox("quotationDoorType", e.target.value)} style={{ fontSize: 12, padding: "3px 6px", width: 140 }}>
                                <option value="">— Select —</option>
                                <option value="Sliding Door">Sliding Door</option>
                                <option value="Swing Door">Swing Door</option>
                              </select>
                            </div>
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer", whiteSpace: "nowrap" }}>
                              <input
                                type="checkbox"
                                checked={activeBox.includeInQuotation !== false}
                                onChange={(e) => updateBox("includeInQuotation", e.target.checked)}
                                style={{ width: 14, height: 14, cursor: "pointer" }}
                              />
                              Include in Quotation
                            </label>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            {[["H", "quotationHeightMm"], ["W", "quotationWidthMm"], ["D", "quotationDepthMm"]].map(([lbl, key]) => {
                              const mmVal = activeBox[key] ?? "";
                              const ftVal = mmVal !== "" ? roundTo2(mmToFeet(Number(mmVal))) : "";
                              return (
                                <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{lbl}</span>
                                  <input
                                    type="number"
                                    value={dimUnit === "mm" ? mmVal : ftVal}
                                    onChange={(e) => {
                                      if (dimUnit === "mm") {
                                        updateBox(key, e.target.value);
                                      } else {
                                        const ft = Number(e.target.value);
                                        if (!isNaN(ft)) updateBox(key, String(Math.round(feetToMm(ft))));
                                      }
                                    }}
                                    placeholder={dimUnit}
                                    style={{ width: 72, fontSize: 12, padding: "3px 6px" }}
                                  />
                                  <span style={{ fontSize: 11, color: "#9ca3af" }}>
                                    {dimUnit === "mm" ? (ftVal ? ftVal + " ft" : "") : (mmVal ? mmVal + " mm" : "")}
                                  </span>
                                </div>
                              );
                            })}
                            <button
                              onClick={() => setDimUnit(dimUnit === "mm" ? "ft" : "mm")}
                              style={{ fontSize: 11, padding: "3px 10px", background: "#ede9fe", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: 6 }}
                            >{dimUnit === "mm" ? "→ ft" : "→ mm"}</button>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Area Sft</span>
                              <input
                                type="text"
                                readOnly
                                value={quotationAreaSft(activeBox) || ""}
                                placeholder="—"
                                title="Auto-calculated: H × W in sq ft — used for Quotation"
                                style={{ width: 72, fontSize: 12, padding: "3px 6px", background: "#f3f4f6", color: "#374151", fontWeight: 600, cursor: "default" }}
                              />
                              <span style={{ fontSize: 11, color: "#9ca3af" }}>sq ft</span>
                            </div>
                          </div>
                        </div>

                        {/* ══ SECTION 1: SHEET CALCULATION AND CUT LIST — each numbered
                            entry (1., 1.1, 1.2, ...) is its own top-level collapsible,
                            same as Sections 2/3 below. ══ */}
                        {(() => {
                          const priceNames = new Set((prices || []).map((pr) => pr.materialName));
                          const resolveMat = (name, id) => {
                            if (id != null) return (prices || []).find((pr) => pr.id === id)?.materialName ?? name;
                            return priceNames.has(name) ? name : "";
                          };
                          const numCell = { padding: "3px 4px", borderBottom: "1px solid #ede9fe", textAlign: "center" };
                          const txtCell = { padding: "3px 4px", borderBottom: "1px solid #ede9fe" };

                          // Every sheet has the exact same shape/capabilities: box's own ("1.")
                          // plus every Sub Sheet Calculation ("1.1", "1.2", ... e.g. a "Draw"
                          // that lives inside a Wardrobe) — each is a full peer with its own
                          // Type of Work/Door Type row, H/W/D, materials, fields, and parts.
                          const updateSheetField = (subSheetId, field, value) => {
                            if (subSheetId == null) updateBox(field, value);
                            else updateSubSheet(subSheetId, field, value);
                          };

                          // Renders one cut-list table — shared by every sheet below.
                          // subSheetId is passed straight through to updatePart/
                          // updatePartFields/addPart/deletePart, which act on the box's own
                          // parts when it's null/undefined and on that sub-sheet's otherwise.
                          const renderPartsTable = ({ parts, vars, refsMap, sheet, subSheetId, labelPrefix, matOptions, laminateOptions, extraButtons }) => {
                            const formulaInp = (part, field) => {
                              const raw = String(part[field] ?? "");
                              const isFormula = raw.includes("{");
                              const resolved = isFormula ? resolveFormula(raw, vars) : null;
                              const usedVars = isFormula
                                ? [...new Set([...raw.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))]
                                : [];
                              const VAR_TO_FIELD = Object.fromEntries(
                                Object.entries(refsMap).filter(([, v]) => v).map(([f, v]) => [v, f])
                              );
                              return (
                                <div style={{ minWidth: 64 }}>
                                  <input
                                    type="text"
                                    value={raw}
                                    onChange={(e) => updatePart(part.id, field, e.target.value, subSheetId)}
                                    placeholder="mm or {H}"
                                    style={{
                                      width: "100%", fontSize: 12, padding: "2px 5px",
                                      fontFamily: isFormula ? "monospace" : "inherit",
                                      borderColor: isFormula ? "#7c3aed" : undefined,
                                      color: isFormula ? "#4c1d95" : undefined,
                                    }}
                                  />
                                  {isFormula && (
                                    <div style={{ marginTop: 2, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                                      <span style={{ fontSize: 10, color: resolved === "?" ? "#dc2626" : "#059669", fontWeight: 600 }}>= {resolved}</span>
                                      {usedVars.map((v) => {
                                        const fld = VAR_TO_FIELD[v];
                                        if (!fld) return null;
                                        return (
                                          <span key={v} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                            <span style={{ fontSize: 10, color: "#7c3aed", fontFamily: "monospace" }}>{`{${v}}`}=</span>
                                            <input
                                              type="number"
                                              value={sheet[fld] ?? ""}
                                              onChange={(e) => updateSheetField(subSheetId, fld, e.target.value)}
                                              style={{ width: 46, fontSize: 10, padding: "1px 3px" }}
                                            />
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            };
                            return (
                              <div style={{ border: "1px solid #ede9fe", borderRadius: "0 0 8px 8px", padding: "12px 12px 4px", background: "#fff" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1e3a5f" }}>Sheets Calculation</div>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    {extraButtons}
                                    <button onClick={() => addPart(subSheetId)} style={{ background: "#2563eb", padding: "4px 14px", fontSize: 12 }}>+ Add Part</button>
                                  </div>
                                </div>
                                <div style={{ overflow: "auto", maxHeight: "65vh" }}>
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
                                    <thead>
                                      <tr>
                                        {["#", "Group", "Ply Name", "Req", "EB", "Side A", "Side B", "W (mm)", "H (mm)", "Qty", "Material", "Rotation", "Label", "Edge", "Remarks", ""].map((h) => (
                                          <th key={h} style={{ position: "sticky", top: 0, zIndex: 2, background: "#1e3a5f", color: "#fff", padding: "6px 8px", textAlign: h === "#" || h === "Req" || h === "EB" || h === "Qty" || h === "Rotation" || h === "Edge" ? "center" : "left", fontWeight: 600, whiteSpace: "nowrap" }} title={h === "EB" ? "Edge Beading required for this part" : undefined}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {parts.length === 0 ? (
                                        <tr>
                                          <td colSpan={16} style={{ textAlign: "center", padding: "16px", color: "#9ca3af", fontStyle: "italic" }}>
                                            No parts defined. Click "+ Add Part" or apply a template with Sheets Calculation data.
                                          </td>
                                        </tr>
                                      ) : parts.map((p, i) => {
                                        const autoLabel = `${labelPrefix} ${p.partName}`.trim();
                                        const isReq = p.req !== false;
                                        const rowBg = isReq
                                          ? (PART_GROUP_COLORS[p.group] ?? (i % 2 === 0 ? "#f5f3ff" : "#fff"))
                                          : "#f3f4f6";
                                        const edgeKey = `${subSheetId ?? "main"}_${p.id}`;
                                        const edgeOpen = expandedEdgeId === edgeKey;
                                        return (
                                          <tr key={p.id} style={{ background: rowBg, verticalAlign: "top", opacity: isReq ? 1 : 0.45 }}>
                                            <td style={{ ...numCell, color: "#6b7280", fontWeight: 600, paddingTop: 6 }}>{i + 1}</td>
                                            <td style={txtCell}>
                                              <select
                                                value={p.group || "Ply"}
                                                onChange={(e) => updatePart(p.id, "group", e.target.value, subSheetId)}
                                                style={{ fontSize: 11, padding: "2px 3px", width: "100%", minWidth: 90, background: PART_GROUP_COLORS[p.group] || "#fff" }}
                                              >
                                                {PART_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                                              </select>
                                            </td>
                                            <td style={{ ...txtCell, textDecoration: isReq ? "none" : "line-through" }}>
                                              <input
                                                type="text"
                                                value={p.partName ?? ""}
                                                onChange={(e) => updatePart(p.id, "partName", e.target.value, subSheetId)}
                                                style={{ width: "100%", fontSize: 12, padding: "2px 5px", minWidth: 60 }}
                                              />
                                            </td>
                                            <td style={{ ...numCell, textAlign: "center" }}>
                                              <input type="checkbox" checked={isReq} onChange={(e) => updatePart(p.id, "req", e.target.checked, subSheetId)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#7c3aed" }} title={isReq ? "Included" : "Excluded"} />
                                            </td>
                                            <td style={{ ...numCell, textAlign: "center" }}>
                                              <input type="checkbox" checked={p.edgeReq !== false} onChange={(e) => updatePart(p.id, "edgeReq", e.target.checked, subSheetId)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#059669" }} title={p.edgeReq !== false ? "Edge beading applied" : "No edge beading"} />
                                            </td>
                                            <td style={txtCell}>
                                              <select value={resolveMat(p.sideA, p.sideAId) || ""} onChange={(e) => { const name = e.target.value; const pi = (prices || []).find((pr) => pr.materialName === name); updatePartFields(p.id, { sideA: name, sideAId: pi?.id ?? null }, subSheetId); }} style={{ fontSize: 11, padding: "2px 3px", width: "100%", minWidth: 110, background: (p.sideA || p.sideAId) ? "#fef3c7" : "#fff" }}>
                                                <option value="">— None —</option>
                                                {laminateOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                                              </select>
                                            </td>
                                            <td style={txtCell}>
                                              <select value={resolveMat(p.sideB, p.sideBId) || ""} onChange={(e) => { const name = e.target.value; const pi = (prices || []).find((pr) => pr.materialName === name); updatePartFields(p.id, { sideB: name, sideBId: pi?.id ?? null }, subSheetId); }} style={{ fontSize: 11, padding: "2px 3px", width: "100%", minWidth: 110, background: (p.sideB || p.sideBId) ? "#dcfce7" : "#fff" }}>
                                                <option value="">— None —</option>
                                                {laminateOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                                              </select>
                                            </td>
                                            <td style={{ ...numCell, padding: "3px 4px" }}>{formulaInp(p, "widthMm")}</td>
                                            <td style={{ ...numCell, padding: "3px 4px" }}>{formulaInp(p, "heightMm")}</td>
                                            <td style={{ ...numCell, padding: "3px 4px" }}>{formulaInp(p, "qty")}</td>
                                            <td style={txtCell}>
                                              <select value={resolveMat(p.material, p.materialId) || ""} onChange={(e) => { const name = e.target.value; const pi = (prices || []).find((pr) => pr.materialName === name); updatePartFields(p.id, { material: name, materialId: pi?.id ?? null }, subSheetId); }} style={{ fontSize: 12, padding: "2px 4px", width: "100%" }}>
                                                <option value="">— Select —</option>
                                                {matOptions.filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
                                              </select>
                                            </td>
                                            <td style={numCell}>
                                              <input type="number" value={p.rotation ?? 1} onChange={(e) => updatePart(p.id, "rotation", Number(e.target.value), subSheetId)} style={{ width: 44, fontSize: 12, padding: "2px 5px", minWidth: 44 }} min={1} />
                                            </td>
                                            <td style={txtCell}>
                                              <input type="text" readOnly value={autoLabel} style={{ fontSize: 12, padding: "2px 5px", width: "100%", minWidth: 80, background: "#f3f4f6", color: "#374151", cursor: "default" }} />
                                            </td>
                                            <td style={{ ...numCell, textAlign: "center", minWidth: 70, opacity: p.edgeReq !== false ? 1 : 0.35 }}>
                                              {edgeOpen && p.edgeReq !== false ? (
                                                <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "stretch", minWidth: 130 }}>
                                                  {[["T", "edgeTop", "edgeTopReq"], ["B", "edgeBottom", "edgeBottomReq"], ["L", "edgeLeft", "edgeLeftReq"], ["R", "edgeRight", "edgeRightReq"]].map(([lbl, fld, reqFld]) => {
                                                    const isEdgeReq = p[reqFld] !== false;
                                                    return (
                                                      <div key={fld} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <input type="checkbox" checked={isEdgeReq} onChange={(e) => updatePart(p.id, reqFld, e.target.checked, subSheetId)} style={{ width: 13, height: 13, cursor: "pointer", accentColor: "#7c3aed", flexShrink: 0 }} />
                                                        <span style={{ fontSize: 10, fontWeight: 700, color: isEdgeReq ? "#374151" : "#9ca3af", width: 10 }}>{lbl}</span>
                                                        <input type="number" value={p[fld] ?? 0} onChange={(e) => updatePart(p.id, fld, Number(e.target.value), subSheetId)} disabled={!isEdgeReq} style={{ width: 42, fontSize: 11, padding: "1px 3px", opacity: isEdgeReq ? 1 : 0.35 }} min={0} />
                                                      </div>
                                                    );
                                                  })}
                                                  <button onClick={() => setExpandedEdgeId(null)} style={{ fontSize: 10, padding: "1px 4px", background: "#e5e7eb", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", marginTop: 2 }}>Done</button>
                                                </div>
                                              ) : (
                                                <button onClick={() => setExpandedEdgeId(edgeOpen ? null : edgeKey)} title="Edit edge beading" style={{ fontSize: 10, padding: "2px 6px", background: "#ede9fe", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" }}>
                                                  {[["T", "edgeTopReq"], ["B", "edgeBottomReq"], ["L", "edgeLeftReq"], ["R", "edgeRightReq"]].map(([lbl, rf]) => (
                                                    <span key={lbl} style={{ color: p[rf] !== false ? "#7c3aed" : "#d1d5db", marginRight: 1 }}>{lbl}</span>
                                                  ))}
                                                </button>
                                              )}
                                            </td>
                                            <td style={txtCell}>
                                              <input type="text" value={p.remarks || ""} onChange={(e) => updatePart(p.id, "remarks", e.target.value, subSheetId)} placeholder="Notes..." style={{ fontSize: 12, padding: "2px 5px", width: "100%", minWidth: 100 }} />
                                            </td>
                                            <td style={{ ...numCell, textAlign: "center" }}>
                                              <button onClick={() => deletePart(p.id, subSheetId)} style={{ background: "#dc2626", padding: "2px 7px", fontSize: 11 }} title="Delete part">✕</button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          };

                          // Renders one full sheet ("1." or "1.1", "1.2", ...): its own Type
                          // of Work/Door Type/Include in Quotation row, H/W/D + Area, the
                          // Materials/Fields grid, and the parts table above — a full peer of
                          // the box's own Sheet Calculation.
                          const renderSheetBlock = ({ subSheetId, sheet, numbering }) => {
                            const vars = BOX_VARS(sheet);
                            const sheetParts = sheet.parts || [];
                            const refsMap = { ...DEFAULT_REFS, ...(sheet.refs || {}) };
                            const priceLaminates = (prices || [])
                              .filter((pr) => (pr.group || "").toLowerCase() === "laminate" && pr.materialName)
                              .map((pr) => pr.materialName);
                            const sheetLaminates = [sheet.matInsideLaminate, sheet.matOutsideLaminate].filter(Boolean);
                            const existingSides = [...new Set(sheetParts.flatMap((p) => [resolveMat(p.sideA, p.sideAId), resolveMat(p.sideB, p.sideBId)]).filter(Boolean))];
                            const laminateOptions = [...new Set([...(priceLaminates.length > 0 ? priceLaminates : sheetLaminates), ...existingSides])];
                            const existingMats = [...new Set(sheetParts.map((p) => resolveMat(p.material, p.materialId)).filter(Boolean))];
                            const matOptions = [...new Set([
                              ...SHEET_MAT_FIELDS.map(([lbl, fld]) => {
                                const idf = `${fld}Id`;
                                const iid = sheet[idf];
                                const res = iid != null
                                  ? (prices || []).find((pr) => pr.id === iid)?.materialName ?? sheet[fld]
                                  : sheet[fld];
                                return res || lbl;
                              }),
                              ...(sheet.customMaterials || []).map((cm) => cm.value || cm.label).filter(Boolean),
                              ...existingMats,
                            ])];
                            const labelPrefix = sheet.shortName || sheet.name || (subSheetId == null ? (activeBox.boxName || activeBox.name || "") : "");

                            return (
                              <div key={subSheetId ?? "main"} style={{ border: "1px solid #ede9fe", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "12px 12px 4px", background: "#fff" }}>
                                {subSheetId != null && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>Name</label>
                                    <input
                                      type="text"
                                      value={sheet.name || ""}
                                      onChange={(e) => updateSheetField(subSheetId, "name", e.target.value)}
                                      placeholder="Name (e.g. Draw)"
                                      style={{ fontWeight: 700, fontSize: 13, color: "#4c1d95", border: "1px solid #ddd6fe", borderRadius: 6, padding: "4px 10px", background: "#faf5ff", width: 180 }}
                                    />
                                  </div>
                                )}

                                {/* ── Type of Work / Door Type (inline row) ── */}
                                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>Type of Work</label>
                                    <select value={sheet.boxType || ""} onChange={(e) => updateSheetField(subSheetId, "boxType", e.target.value)} style={{ fontSize: 12, padding: "3px 6px", width: 120 }}>
                                      <option value="">— Select —</option>
                                      {(prices || []).filter((p) => p.group === "Carpenter").map((p) => (
                                        <option key={p.id} value={p.materialName}>{p.materialName}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>Door Type</label>
                                    <select value={sheet.doorType || ""} onChange={(e) => updateSheetField(subSheetId, "doorType", e.target.value)} style={{ fontSize: 12, padding: "3px 6px", width: 140 }}>
                                      <option value="">— Select —</option>
                                      <option value="Sliding Door">Sliding Door</option>
                                      <option value="Swing Door">Swing Door</option>
                                    </select>
                                  </div>
                                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer", whiteSpace: "nowrap" }} title="Uncheck to stop this sheet's parts from being counted in Hardware & Consumables, Material Summary, BOQ, and the Cut Sheet Optimizer.">
                                    <input
                                      type="checkbox"
                                      checked={sheet.includeInMaterialCalc !== false}
                                      onChange={(e) => updateSheetField(subSheetId, "includeInMaterialCalc", e.target.checked)}
                                      style={{ width: 14, height: 14, cursor: "pointer" }}
                                    />
                                    Include in Material Calculation
                                  </label>
                                </div>

                                {/* ── Dimensions (compact inline) ── */}
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 2 }}>
                                  {[["H", "heightMm"], ["W", "widthMm"], ["D", "depthMm"]].map(([lbl, key]) => {
                                    const mmVal = sheet[key] ?? "";
                                    const ftVal = mmVal !== "" ? roundTo2(mmToFeet(Number(mmVal))) : "";
                                    return (
                                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{lbl}</span>
                                        <input
                                          type="number"
                                          value={dimUnit === "mm" ? mmVal : ftVal}
                                          onChange={(e) => {
                                            if (dimUnit === "mm") {
                                              updateSheetField(subSheetId, key, e.target.value);
                                            } else {
                                              const ft = Number(e.target.value);
                                              if (!isNaN(ft)) updateSheetField(subSheetId, key, String(Math.round(feetToMm(ft))));
                                            }
                                          }}
                                          placeholder={dimUnit}
                                          style={{ width: 72, fontSize: 12, padding: "3px 6px" }}
                                        />
                                        <span style={{ fontSize: 11, color: "#9ca3af" }}>
                                          {dimUnit === "mm" ? (ftVal ? ftVal + " ft" : "") : (mmVal ? mmVal + " mm" : "")}
                                        </span>
                                      </div>
                                    );
                                  })}
                                  <button
                                    onClick={() => setDimUnit(dimUnit === "mm" ? "ft" : "mm")}
                                    style={{ fontSize: 11, padding: "3px 10px", background: "#ede9fe", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: 6 }}
                                  >{dimUnit === "mm" ? "→ ft" : "→ mm"}</button>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Area Sft</span>
                                    <input
                                      type="text"
                                      readOnly
                                      value={vars.Sft || ""}
                                      placeholder="—"
                                      title="Auto-calculated: H × W in sq ft"
                                      style={{ width: 72, fontSize: 12, padding: "3px 6px", background: "#f3f4f6", color: "#374151", fontWeight: 600, cursor: "default" }}
                                    />
                                    <span style={{ fontSize: 11, color: "#9ca3af" }}>sq ft</span>
                                    <span style={{ fontSize: 10, color: "#7c3aed", fontFamily: "monospace" }} title="Reference this in any formula">{`{Sft}`}</span>
                                  </div>
                                </div>

                                {/* ── Materials (left) + Fields (right) — 2-column grid ── */}
                                <div style={{ marginTop: 14, borderTop: "1px solid #ede9fe", paddingTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

                                  {/* Materials table */}
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                    <thead>
                                      <tr>
                                        <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 10px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Material</th>
                                        <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 10px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Selection</th>
                                        <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 6px", width: 32 }}></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {[
                                        ["Door Ply", "matDoor"],
                                        ["Carcase Ply", "matCarcas"],
                                        ["Outside Laminate", "matOutsideLaminate"],
                                        ["Inside Laminate", "matInsideLaminate"],
                                        ["Edge Beading", "matEdgeBeading"],
                                      ].map(([label, field], i) => {
                                        const idField = `${field}Id`;
                                        const itemId = sheet[idField];
                                        const resolved = itemId != null
                                          ? (prices || []).find((p) => p.id === itemId)?.materialName ?? sheet[field]
                                          : sheet[field];
                                        return (
                                          <tr key={field} style={{ background: i % 2 === 0 ? "#f5f3ff" : "#fff" }}>
                                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", fontWeight: 600, color: "#374151", fontSize: 12 }}>{label}</td>
                                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>
                                              <input type="text" value={resolved || ""} onChange={(e) => { const nv = e.target.value; const pi = (prices || []).find((pr) => pr.materialName === nv); renameMaterialInParts({ [field]: nv, [idField]: pi?.id ?? null }, resolved || "", nv, itemId, pi?.id ?? null, subSheetId); }} placeholder="Select..." style={{ width: "100%", fontSize: 12, padding: "3px 6px" }} />
                                            </td>
                                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", textAlign: "center" }}>
                                              <button onClick={() => setBoxMatPicker({ field, label, oldValue: resolved || "", oldId: itemId, subSheetId })} title="Browse" style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "3px 7px", fontSize: 13 }}>🔍</button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                      {(sheet.customMaterials || []).map((cm) => (
                                        <tr key={cm.id} style={{ background: "#fffbeb" }}>
                                          <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>
                                            <input type="text" value={cm.label || ""} onChange={(e) => updateSheetField(subSheetId, "customMaterials", (sheet.customMaterials || []).map((m) => m.id === cm.id ? { ...m, label: e.target.value } : m))} placeholder="Label..." style={{ width: "100%", fontSize: 12, padding: "3px 6px", fontWeight: 600, color: "#374151", background: "#fff" }} />
                                          </td>
                                          <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>
                                            <input type="text" value={cm.value || ""} onChange={(e) => { const newVal = e.target.value; const oldVal = cm.value || ""; const upd = (sheet.customMaterials || []).map((m) => m.id === cm.id ? { ...m, value: newVal, itemId: null } : m); renameMaterialInParts({ customMaterials: upd }, oldVal, newVal, null, null, subSheetId); }} placeholder="Select..." style={{ width: "100%", fontSize: 12, padding: "3px 6px" }} />
                                          </td>
                                          <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", textAlign: "center", display: "flex", gap: 4 }}>
                                            <button onClick={() => setBoxMatPicker({ field: `__cm_${cm.id}`, label: cm.label || "Material", oldValue: cm.value || "", subSheetId })} title="Browse" style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "3px 7px", fontSize: 13 }}>🔍</button>
                                            <button onClick={() => updateSheetField(subSheetId, "customMaterials", (sheet.customMaterials || []).filter((m) => m.id !== cm.id))} style={{ background: "#dc2626", padding: "3px 7px", fontSize: 12 }} title="Remove">✕</button>
                                          </td>
                                        </tr>
                                      ))}
                                      <tr>
                                        <td colSpan={3} style={{ padding: "5px 8px" }}>
                                          <button
                                            onClick={() => updateSheetField(subSheetId, "customMaterials", [...(sheet.customMaterials || []), { id: Date.now(), label: "", value: "", itemId: null }])}
                                            style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", fontSize: 12, padding: "3px 14px", borderRadius: 6, cursor: "pointer" }}
                                          >+ Add Material</button>
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>

                                  {/* Fields table */}
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                    <thead>
                                      <tr>
                                        <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 10px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Field</th>
                                        <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 10px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Value</th>
                                        <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 8px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Ref</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr style={{ background: "#f5f3ff" }}>
                                        <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", fontWeight: 600, color: "#374151", fontSize: 12 }}>Short Name</td>
                                        <td style={{ padding: "4px 10px", borderBottom: "1px solid #ede9fe" }}>
                                          <input type="text" value={sheet.shortName || ""} onChange={(e) => updateSheetField(subSheetId, "shortName", e.target.value)} placeholder="e.g. MBR" style={{ width: "100%", fontSize: 13, padding: "3px 8px" }} />
                                        </td>
                                        <td style={{ padding: "4px 8px", borderBottom: "1px solid #ede9fe" }}></td>
                                      </tr>
                                      {[
                                        ["Doors Horizontal", "doorsH", "doorsH"],
                                        ["Doors Vertical", "doorsV", "doorsV"],
                                        ["Back Ply Parts", "backParts", "backParts"],
                                        ["Vertical Panels (VP)", "partitions", "partitions"],
                                        ["Shelf Planks Qty", "shelves", "shelves"],
                                      ].map(([label, field, refKey], i) => {
                                        const varName = refsMap[refKey];
                                        return (
                                          <tr key={field} style={{ background: i % 2 === 0 ? "#fff" : "#f5f3ff" }}>
                                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", fontWeight: 600, color: "#374151", fontSize: 12 }}>{label}</td>
                                            <td style={{ padding: "4px 10px", borderBottom: "1px solid #ede9fe" }}>
                                              <input type="number" value={sheet[field] ?? ""} onChange={(e) => updateSheetField(subSheetId, field, Number(e.target.value))} placeholder="0" min={0} style={{ width: "100%", fontSize: 13, padding: "3px 8px" }} />
                                            </td>
                                            <td style={{ padding: "4px 8px", borderBottom: "1px solid #ede9fe", whiteSpace: "nowrap" }}>
                                              {varName && <span style={{ fontSize: 11, color: "#7c3aed", fontFamily: "monospace", background: "#ede9fe", padding: "1px 6px", borderRadius: 4 }}>{`{${varName}}`}</span>}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                      {(sheet.customFields || []).map((cf) => {
                                        const rv2 = [...Object.values(refsMap), ...(sheet.customFields || []).map((f) => f.ref)].filter(Boolean);
                                        const dup2 = new Set(rv2.filter((v, _, a) => a.filter(x => x === v).length > 1));
                                        const isDup = cf.ref && dup2.has(cf.ref);
                                        return (
                                          <tr key={cf.id} style={{ background: "#fffbeb" }}>
                                            <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>
                                              <input type="text" value={cf.label || ""} onChange={(e) => updateSheetField(subSheetId, "customFields", (sheet.customFields || []).map((f) => f.id === cf.id ? { ...f, label: e.target.value } : f))} placeholder="Field label..." style={{ width: "100%", fontSize: 12, padding: "3px 6px" }} />
                                            </td>
                                            <td style={{ padding: "4px 10px", borderBottom: "1px solid #ede9fe" }}>
                                              <input type="number" value={cf.value ?? 0} onChange={(e) => { const upd = (sheet.customFields || []).map((f) => f.id === cf.id ? { ...f, value: Number(e.target.value) } : f); updateSheetField(subSheetId, "customFields", upd); }} placeholder="0" style={{ width: "100%", fontSize: 13, padding: "3px 8px" }} />
                                            </td>
                                            <td style={{ padding: "4px 8px", borderBottom: "1px solid #ede9fe", whiteSpace: "nowrap" }}>
                                              <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                                                <span style={{ fontSize: 10, color: isDup ? "#dc2626" : "#7c3aed", fontFamily: "monospace" }}>{`{`}</span>
                                                <input
                                                  type="text"
                                                  value={cf.ref || ""}
                                                  onChange={(e) => updateSheetField(subSheetId, "customFields", (sheet.customFields || []).map((f) => f.id === cf.id ? { ...f, ref: e.target.value } : f))}
                                                  title={isDup ? `"${cf.ref}" is used by multiple fields — each ref must be unique` : ""}
                                                  style={{ width: 62, fontSize: 10, padding: "1px 4px", fontFamily: "monospace", color: isDup ? "#dc2626" : "#7c3aed", background: isDup ? "#fee2e2" : "#ede9fe", border: `1px solid ${isDup ? "#fca5a5" : "#ddd6fe"}`, borderRadius: 4, textAlign: "center" }}
                                                />
                                                <span style={{ fontSize: 10, color: isDup ? "#dc2626" : "#7c3aed", fontFamily: "monospace" }}>{`}`}</span>
                                                <button
                                                  onClick={() => updateSheetField(subSheetId, "customFields", (sheet.customFields || []).filter((f) => f.id !== cf.id))}
                                                  style={{ background: "#dc2626", padding: "1px 6px", fontSize: 11, marginLeft: 4 }}
                                                  title="Remove field"
                                                >✕</button>
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                      <tr>
                                        <td colSpan={3} style={{ padding: "5px 8px" }}>
                                          <button
                                            onClick={() => updateSheetField(subSheetId, "customFields", [...(sheet.customFields || []), { id: Date.now(), label: "", value: 0, ref: "" }])}
                                            style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", fontSize: 12, padding: "3px 14px", borderRadius: 6, cursor: "pointer" }}
                                          >+ Add Field</button>
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>

                                </div>

                                {renderPartsTable({
                                  parts: sheetParts,
                                  vars,
                                  refsMap,
                                  sheet,
                                  subSheetId,
                                  labelPrefix,
                                  matOptions,
                                  laminateOptions,
                                  extraButtons: subSheetId == null
                                    ? <button onClick={() => setCutSheetOpen(true)} style={{ background: "#0369a1", padding: "4px 14px", fontSize: 12 }}>📋 Cut Sheet</button>
                                    : null,
                                })}
                              </div>
                            );
                          };

                          const sheets = [
                            { subSheetId: null, sheet: activeBox, numbering: "1." },
                            ...(activeBox.subSheets || []).map((sub, i) => ({ subSheetId: sub.id, sheet: sub, numbering: `1.${i + 1}` })),
                          ];

                          return (
                            <>
                              {sheets.map(({ subSheetId, sheet, numbering }) => {
                                const sectionKey = subSheetId == null ? "sheets" : `sheet_${subSheetId}`;
                                const isOpen = !!openSections[sectionKey];
                                const title = subSheetId == null
                                  ? "1. Sheet Calculation and Cut List"
                                  : `${numbering} Sheet Calculation and Cut List — ${sheet.name || "Sub Sheet"}`;
                                return (
                                  <Fragment key={subSheetId ?? "main"}>
                                    <SectionHeader
                                      title={title}
                                      open={isOpen}
                                      onToggle={() => toggleSection(sectionKey)}
                                      style={{ marginTop: subSheetId == null ? 0 : 10 }}
                                      action={
                                        <div style={{ display: "flex", gap: 6 }}>
                                          {copiedSheet && (
                                            <button onClick={() => pasteSheetData(subSheetId)} title={`Paste ${copiedSheet.sourceLabel}'s data here`} style={{ background: "#059669", padding: "3px 10px", fontSize: 11 }}>📋 Paste</button>
                                          )}
                                          <button onClick={() => copySheetData(subSheetId)} title="Copy this sheet's materials/fields/parts" style={{ background: "#ede9fe", color: "#4c1d95", padding: "3px 10px", fontSize: 11 }}>⧉ Copy</button>
                                          {subSheetId != null && (
                                            <button onClick={() => deleteSubSheet(subSheetId)} style={{ background: "#dc2626", padding: "3px 10px", fontSize: 11 }}>Delete</button>
                                          )}
                                        </div>
                                      }
                                    />
                                    {isOpen && renderSheetBlock({ subSheetId, sheet, numbering })}
                                  </Fragment>
                                );
                              })}
                              <button onClick={addSubSheet} style={{ background: "#7c3aed", padding: "6px 16px", fontSize: 13, marginTop: 10 }}>+ Add Sub Sheet</button>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {boxes.length === 0 && (
                      <div style={{ padding: "12px 0", color: "#9ca3af", fontSize: 13 }}>
                        No boxes yet — click <strong>+ Add Box</strong> to define a furniture unit for this room.
                      </div>
                    )}

                    {/* ══ SECTION 3: HARDWARE & CONSUMABLES — ALL BOXES ══ */}
                    {boxes.length > 0 && (() => {
                      const groupOf = (mat) => (prices || []).find((p) => p.materialName === mat)?.group || "Other";
                      // Every group present in Items Pricing shows up here automatically —
                      // including ones added after HARDWARE_GROUPS was written — except
                      // Wood/Laminate, whose quantities are finalized via Sheet Calculation
                      // & Cut List instead of this hardware table.
                      const dynamicGroups = Array.from(new Set([
                        ...HARDWARE_GROUPS,
                        ...(prices || []).map((p) => p.group || "").filter((g) => g && g !== "Wood" && g !== "Laminate"),
                      ]));
                      const allRows = [];
                      boxes.forEach((box) => {
                        computeBoxEdgeBandingRows(box).forEach((r) => {
                          allRows.push({
                            id: `edge_${box.id}_${r.material}`, materialName: r.material, base: r.base, extra: r.extra,
                            unit: "Mtr", auto: true, autoType: "edge",
                            boxId: box.id, boxName: box.name || `Box ${box.id}`,
                          });
                        });
                        computeBoxCarpenterRows(box).forEach((r) => {
                          allRows.push({
                            id: `carpenter_${box.id}_${r.material}`, materialName: r.material, base: r.base, extra: r.extra,
                            unit: (prices || []).find((p) => p.materialName === r.material)?.unit || "Sq.ft",
                            auto: true, autoType: "carpenter",
                            boxId: box.id, boxName: box.name || `Box ${box.id}`,
                          });
                        });
                        (box.hardwareItems || []).forEach((hw) => {
                          if (hw.materialName === "Fevicol Merino") return; // now auto-calculated in Material Summary instead
                          allRows.push({
                            ...hw,
                            boxId: box.id,
                            boxName: box.name || `Box ${box.id}`,
                            base: Number(hw.qty) || 0,
                            extra: Number(hw.extra) || 0,
                            unit: hw.materialName ? ((prices || []).find((p) => p.materialName === hw.materialName)?.unit || "") : "",
                          });
                        });
                      });
                      const rowsByGroup = {};
                      dynamicGroups.forEach((g) => { rowsByGroup[g] = []; });
                      const unassignedHwRows = [];
                      allRows.forEach((hw) => {
                        const g = hw.materialName ? groupOf(hw.materialName) : null;
                        if (g && rowsByGroup[g]) rowsByGroup[g].push(hw);
                        else unassignedHwRows.push(hw);
                      });

                      return (
                        <div style={{ marginTop: 16 }}>
                          <SectionHeader
                            title="2. Hardware & Consumables — All Boxes"
                            open={openSections.hardware}
                            onToggle={() => toggleSection("hardware")}
                            style={{ marginTop: 0 }}
                          />
                          {openSections.hardware && (
                            <div style={{ border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "10px 10px 6px", background: "#fff" }}>
                              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>
                                Select items for any of the {boxes.length} box{boxes.length !== 1 ? "es" : ""} below — no need to switch box tabs.
                              </div>
                              <div style={{ overflow: "auto", maxHeight: "65vh" }}>
                                <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%", minWidth: 760 }}>
                                  <thead>
                                    <tr>
                                      {["Group", "Box", "Item", "Units", "Qty", "Extra", "Final Qty", ""].map((h) => (
                                        <th key={h} style={{ position: "sticky", top: 0, zIndex: 2, background: "#1e3a5f", color: "#fff", padding: "5px 10px", textAlign: ["Group", "Box", "Item"].includes(h) ? "left" : "center", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dynamicGroups.map((group) => {
                                      const rows = rowsByGroup[group];
                                      return (
                                        <Fragment key={group}>
                                          {boxes.map((box, bi) => (
                                            <tr key={`${group}-add-${box.id}`} style={{ background: "#eef2ff" }}>
                                              {bi === 0 && (
                                                <td rowSpan={boxes.length + rows.length} style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", borderRight: "1px solid #ede9fe", color: "#374151", verticalAlign: "top", background: "#fff", fontWeight: 700 }}>{group}</td>
                                              )}
                                              <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", color: "#6b7280", fontSize: 11 }}>{box.name || `Box ${box.id}`}</td>
                                              <td colSpan={4} style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe" }}>
                                                <button
                                                  onClick={() => setHardwarePicker({ hwId: null, group, boxId: box.id })}
                                                  style={{ fontSize: 12, textAlign: "left", background: "none", border: "1px dashed #93c5fd", borderRadius: 4, padding: "3px 8px", cursor: "pointer", color: "#2563eb" }}
                                                >+ Select item —</button>
                                              </td>
                                              <td style={{ padding: "3px 8px", borderBottom: "1px solid #ede9fe" }} />
                                            </tr>
                                          ))}
                                          {rows.map((hw, i) => {
                                            const total = hw.base + hw.extra;
                                            return (
                                              <tr key={`${hw.boxId}-${hw.id}`} style={{ background: i % 2 === 0 ? "#fff" : "#f5f3ff" }}>
                                                <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", color: "#6b7280", fontSize: 11 }}>{hw.boxName}</td>
                                                <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe" }}>
                                                  {hw.auto ? (
                                                    <span style={{ fontSize: 12, color: "#111827" }}>
                                                      {hw.materialName}
                                                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#059669", background: "#d1fae5", borderRadius: 4, padding: "1px 5px" }}>AUTO</span>
                                                    </span>
                                                  ) : (
                                                    <button
                                                      onClick={() => setHardwarePicker({ hwId: hw.id, group, boxId: hw.boxId })}
                                                      style={{ fontSize: 12, textAlign: "left", background: "none", border: "1px solid #e2e8f0", borderRadius: 4, padding: "3px 8px", cursor: "pointer", width: 180, color: hw.materialName ? "#111827" : "#9ca3af" }}
                                                    >{hw.materialName || "— Select item —"}</button>
                                                  )}
                                                </td>
                                                <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", textAlign: "center", color: "#6b7280" }}>{hw.unit || "—"}</td>
                                                <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", textAlign: "center" }}>
                                                  {hw.auto ? (
                                                    <span style={{ fontSize: 12, color: "#374151" }}>{hw.base}</span>
                                                  ) : (
                                                    <input type="number" min={0} value={hw.base}
                                                      onChange={(e) => updateHardwareItem(hw.boxId, hw.id, "qty", Math.max(0, Number(e.target.value) || 0))}
                                                      style={{ width: 56, fontSize: 12, padding: "2px 4px", textAlign: "center" }} />
                                                  )}
                                                </td>
                                                <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", textAlign: "center" }}>
                                                  <input type="number" min={0} step={hw.auto ? 0.5 : 1} value={hw.extra || ""} placeholder="0"
                                                    onChange={(e) => {
                                                      if (hw.autoType === "edge") setEdgeExtraMtr(e.target.value);
                                                      else if (hw.autoType === "carpenter") setCarpenterExtraSft(e.target.value);
                                                      else updateHardwareItem(hw.boxId, hw.id, "extra", e.target.value);
                                                    }}
                                                    onBlur={(e) => {
                                                      const v = Math.max(0, Number(e.target.value) || 0);
                                                      if (hw.autoType === "edge") setEdgeExtraMtr(v);
                                                      else if (hw.autoType === "carpenter") setCarpenterExtraSft(v);
                                                      else updateHardwareItem(hw.boxId, hw.id, "extra", v);
                                                    }}
                                                    style={{ width: 48, fontSize: 12, padding: "2px 4px", textAlign: "center" }} />
                                                </td>
                                                <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", textAlign: "center" }}>
                                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>{total}</span>
                                                </td>
                                                <td style={{ padding: "3px 8px", borderBottom: "1px solid #ede9fe", textAlign: "center" }}>
                                                  {!hw.auto && (
                                                    <button onClick={() => deleteHardwareItem(hw.boxId, hw.id)} style={{ fontSize: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }} title="Remove">✕</button>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </Fragment>
                                      );
                                    })}
                                    {unassignedHwRows.map((hw) => {
                                      const total = hw.base + hw.extra;
                                      return (
                                        <tr key={`${hw.boxId}-${hw.id}`} style={{ background: "#fff7ed" }}>
                                          <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", borderRight: "1px solid #ede9fe", color: "#9ca3af" }}>—</td>
                                          <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", color: "#6b7280", fontSize: 11 }}>{hw.boxName}</td>
                                          <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe" }}>
                                            <button
                                              onClick={() => setHardwarePicker({ hwId: hw.id, boxId: hw.boxId })}
                                              style={{ fontSize: 12, textAlign: "left", background: "none", border: "1px solid #e2e8f0", borderRadius: 4, padding: "3px 8px", cursor: "pointer", width: 180, color: "#9ca3af" }}
                                            >— Select item —</button>
                                          </td>
                                          <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", textAlign: "center", color: "#6b7280" }}>{hw.unit || "—"}</td>
                                          <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", textAlign: "center" }}>
                                            <input type="number" min={0} value={hw.base}
                                              onChange={(e) => updateHardwareItem(hw.boxId, hw.id, "qty", Math.max(0, Number(e.target.value) || 0))}
                                              style={{ width: 56, fontSize: 12, padding: "2px 4px", textAlign: "center" }} />
                                          </td>
                                          <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", textAlign: "center" }}>
                                            <input type="number" min={0} value={hw.extra || ""} placeholder="0"
                                              onChange={(e) => updateHardwareItem(hw.boxId, hw.id, "extra", e.target.value)}
                                              onBlur={(e) => updateHardwareItem(hw.boxId, hw.id, "extra", Math.max(0, Number(e.target.value) || 0))}
                                              style={{ width: 48, fontSize: 12, padding: "2px 4px", textAlign: "center" }} />
                                          </td>
                                          <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", textAlign: "center" }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>{total}</span>
                                          </td>
                                          <td style={{ padding: "3px 8px", borderBottom: "1px solid #ede9fe", textAlign: "center" }}>
                                            <button onClick={() => deleteHardwareItem(hw.boxId, hw.id)} style={{ fontSize: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }} title="Remove">✕</button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ══ SECTION 4: MATERIAL SUMMARY (all boxes in this room) ══ */}
                    {boxes.length > 0 && (() => {
                      const summaryRows = withGroupSpan(computeMatSummary());
                      // Rate for a material under one Material Model variant — this
                      // project's own override if set, else the global Items Pricing rate.
                      const modelRateFor = (material, model) => {
                        const modelEntry = selectedProject?.materialModelRates?.[material]?.[model];
                        if (modelEntry?.rate) return Number(modelEntry.rate);
                        const rateData = (prices || []).find((p) => p.materialName === material);
                        return rateData ? Number(rateData.rate) : 0;
                      };
                      const modelTotals = { economy: 0, standard: 0, premium: 0 };
                      summaryRows.forEach((row) => {
                        PROJ_MODELS.forEach((model) => {
                          modelTotals[model] += row.requiredQty * modelRateFor(row.material, model);
                        });
                      });
                      // Sum of every box's own Area Sft (H × W in sq ft) in this room —
                      // the denominator for the per-sqft cost row below the Total.
                      const totalAreaSft = boxes.reduce((s, b) => s + (Number(BOX_VARS(b).Sft) || 0), 0);
                      return (
                        <div style={{ marginTop: 16 }}>
                          <SectionHeader
                            title="3. Material Summary"
                            open={openSections.summary}
                            onToggle={() => toggleSection("summary")}
                            style={{ marginTop: 0 }}
                            action={
                              <button
                                onClick={() => setAllCutSheetOpen(true)}
                                style={{ background: "#0369a1", color: "#fff", border: "none", padding: "4px 12px", fontSize: 12, borderRadius: 5, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}
                              >
                                📋 Cut Sheet
                              </button>
                            }
                          />
                          {openSections.summary && (
                            summaryRows.length === 0 ? (
                              <div style={{ padding: "16px 14px", color: "#9ca3af", fontSize: 13, border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px", background: "#fff" }}>
                                No materials assigned across any box yet.
                              </div>
                            ) : (
                              <div style={{ border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px", overflowX: "auto" }}>
                                <div style={{ padding: "8px 14px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Fevicol Merino qty = </span>
                                  <input
                                    type="number" step="0.05" min={0}
                                    value={fevicolMultiplier}
                                    onChange={(e) => setFevicolMultiplier(e.target.value)}
                                    onBlur={(e) => setFevicolMultiplier(Math.max(0, Number(e.target.value) || 0))}
                                    style={{ width: 60, fontSize: 12, padding: "3px 6px", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: 5 }}
                                  />
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>× total Inside + Outside Laminate sheets required</span>
                                  <span style={{ width: 1, alignSelf: "stretch", background: "#e5e7eb", margin: "0 4px" }} />
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>GST</span>
                                  <input
                                    type="number" step="1" min={0}
                                    value={gstPercent}
                                    onChange={(e) => setGstPercent(e.target.value)}
                                    onBlur={(e) => setGstPercent(Math.max(0, Number(e.target.value) || 0))}
                                    style={{ width: 50, fontSize: 12, padding: "3px 6px", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: 5 }}
                                  />
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>%</span>
                                </div>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
                                  <thead>
                                    <tr>
                                      <th rowSpan={2} style={{ background: "#1e3a5f", color: "#fff", padding: "9px 14px", fontWeight: 700, fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Group</th>
                                      <th rowSpan={2} style={{ background: "#1e3a5f", color: "#fff", padding: "9px 14px", fontWeight: 700, fontSize: 11, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Material</th>
                                      <th rowSpan={2} style={{ background: "#1e3a5f", color: "#fff", padding: "9px 14px", fontWeight: 700, fontSize: 11, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Required Qty</th>
                                      <th rowSpan={2} style={{ background: "#1e3a5f", color: "#fff", padding: "9px 14px", fontWeight: 700, fontSize: 11, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>UOM</th>
                                      {PROJ_MODELS.map((model) => (
                                        <th key={model} colSpan={2} style={{ background: PROJ_MODEL_COLORS[model], color: "#fff", padding: "6px 14px", fontWeight: 700, fontSize: 11, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", borderLeft: "2px solid rgba(255,255,255,0.3)" }}>{PROJ_MODEL_LABELS[model]}</th>
                                      ))}
                                    </tr>
                                    <tr>
                                      {PROJ_MODELS.map((model) => (
                                        <Fragment key={model}>
                                          <th style={{ background: "#1e3a5f", color: "#cbd5e1", padding: "6px 10px", fontWeight: 600, fontSize: 10, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", borderLeft: "2px solid rgba(255,255,255,0.15)" }}>Rate</th>
                                          <th style={{ background: "#1e3a5f", color: "#cbd5e1", padding: "6px 10px", fontWeight: 600, fontSize: 10, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Amount</th>
                                        </Fragment>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {summaryRows.map((row, i) => (
                                      <tr key={`${row.group}::${row.material}`} style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                                        {row._groupFirst && (
                                          <td rowSpan={row._groupSpan} style={{ padding: "8px 14px", borderBottom: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb", color: "#6b7280", verticalAlign: "top", background: "#fff" }}>{row.group}</td>
                                        )}
                                        <td style={{ padding: "8px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, color: "#111827" }}>{row.material}</td>
                                        <td style={{ padding: "8px 14px", borderBottom: "1px solid #e5e7eb", textAlign: "center", color: "#374151", fontWeight: 700 }}>{row.requiredQty}</td>
                                        <td style={{ padding: "8px 14px", borderBottom: "1px solid #e5e7eb", textAlign: "center", color: "#6b7280" }}>{row.unit}</td>
                                        {PROJ_MODELS.map((model) => {
                                          const rate = modelRateFor(row.material, model);
                                          const amount = row.requiredQty * rate;
                                          return (
                                            <Fragment key={model}>
                                              <td style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", borderLeft: "1px solid #e5e7eb", textAlign: "center", color: PROJ_MODEL_COLORS[model] }}>
                                                {rate > 0 ? formatCurrency(rate) : <span style={{ color: "#d1d5db" }}>—</span>}
                                              </td>
                                              <td style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", textAlign: "center", fontWeight: 600, color: "#111827" }}>
                                                {amount > 0 ? formatCurrency(amount) : <span style={{ color: "#d1d5db" }}>—</span>}
                                              </td>
                                            </Fragment>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                    <tr style={{ background: "#1e3a5f" }}>
                                      <td colSpan={2} style={{ padding: "8px 14px", fontWeight: 700, color: "#fff", fontSize: 12 }}>Total (Excl. GST)</td>
                                      <td style={{ padding: "8px 14px", textAlign: "center", fontWeight: 700, color: "#fff", fontSize: 12 }}>
                                        {summaryRows.reduce((s, r) => s + r.requiredQty, 0)}
                                      </td>
                                      <td style={{ padding: "8px 14px", textAlign: "center", color: "#cbd5e1", fontSize: 12 }}>Sheets</td>
                                      {PROJ_MODELS.map((model) => (
                                        <td key={model} colSpan={2} style={{ padding: "8px 14px", textAlign: "center", fontWeight: 700, color: "#fff", fontSize: 12, borderLeft: "2px solid rgba(255,255,255,0.15)" }}>
                                          {formatCurrency(modelTotals[model])}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr style={{ background: "#334e68" }}>
                                      <td colSpan={2} style={{ padding: "8px 14px", fontWeight: 700, color: "#fff", fontSize: 12 }}>Total (Incl. GST {gstPercent}%)</td>
                                      <td colSpan={2} style={{ padding: "8px 14px" }} />
                                      {PROJ_MODELS.map((model) => (
                                        <td key={model} colSpan={2} style={{ padding: "8px 14px", textAlign: "center", fontWeight: 700, color: "#fff", fontSize: 12, borderLeft: "2px solid rgba(255,255,255,0.15)" }}>
                                          {formatCurrency(modelTotals[model] * (1 + (Number(gstPercent) || 0) / 100))}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr style={{ background: "#f1f5f9" }}>
                                      <td colSpan={4} style={{ padding: "8px 14px", fontWeight: 700, color: "#374151", fontSize: 12 }}>
                                        Sft Cost (Excl. GST) <span style={{ fontWeight: 400, color: "#9ca3af" }}>(Total ÷ {roundTo2(totalAreaSft)} sqft)</span>
                                      </td>
                                      {PROJ_MODELS.map((model) => (
                                        <td key={model} colSpan={2} style={{ padding: "8px 14px", textAlign: "center", fontWeight: 700, color: PROJ_MODEL_COLORS[model], fontSize: 12, borderLeft: "1px solid #e5e7eb" }}>
                                          {totalAreaSft > 0 ? `${formatCurrency(modelTotals[model] / totalAreaSft)}/sqft` : <span style={{ color: "#d1d5db" }}>—</span>}
                                        </td>
                                      ))}
                                    </tr>
                                    <tr style={{ background: "#e5e7eb" }}>
                                      <td colSpan={4} style={{ padding: "8px 14px", fontWeight: 700, color: "#374151", fontSize: 12 }}>
                                        Sft Cost (Incl. GST {gstPercent}%) <span style={{ fontWeight: 400, color: "#9ca3af" }}>(Total ÷ {roundTo2(totalAreaSft)} sqft)</span>
                                      </td>
                                      {PROJ_MODELS.map((model) => (
                                        <td key={model} colSpan={2} style={{ padding: "8px 14px", textAlign: "center", fontWeight: 700, color: PROJ_MODEL_COLORS[model], fontSize: 12, borderLeft: "1px solid #e5e7eb" }}>
                                          {totalAreaSft > 0 ? `${formatCurrency((modelTotals[model] * (1 + (Number(gstPercent) || 0) / 100)) / totalAreaSft)}/sqft` : <span style={{ color: "#d1d5db" }}>—</span>}
                                        </td>
                                      ))}
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            )
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* 2. Output Actions */}
                  <Section title="Output" defaultOpen={false}>
                    <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 14px" }}>
                      Generate reports for <strong>{selectedProject.name}</strong>
                    </p>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={() => navigate(`/interior/project-boq?project=${encodeURIComponent(selectedProject.name)}`)} style={{ background: "#047857" }}>Project BOQ</button>
                      <button onClick={() => navigate(`/interior/project-quotation?project=${encodeURIComponent(selectedProject.name)}`)} style={{ background: "#6d28d9" }}>Project Quotation</button>
                    </div>
                  </Section>
                </>
              ) : null}
            </div>}
          </>
        )}
      </div>

      {/* ── Project Modal ──────────────────────────────────────────────────── */}
      {projectModal && (
        <FormModal
          title={editProjectId ? "Edit Project" : "New Project"}
          saveLabel={editProjectId ? "Update Project" : "Create Project"}
          onSave={saveProject}
          onClose={() => setProjectModal(false)}
          error={projectError}
          fields={
            <>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Project Name *</label>
                <input
                  autoFocus
                  value={pForm.name}
                  onChange={(e) => updatePForm({ name: e.target.value })}
                  placeholder="e.g. Villa Interior"
                  style={submitAttempted && !pForm.name.trim() ? INVALID_FIELD : undefined}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Client Name *</label>
                <input
                  value={pForm.client}
                  onChange={(e) => updatePForm({ client: e.target.value })}
                  placeholder="e.g. Ramesh Kumar"
                  style={submitAttempted && !pForm.client.trim() ? INVALID_FIELD : undefined}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Contact Number *</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={pForm.contact}
                  // Strip non-digits and cap at 10 so the field can never hold
                  // something saveProject would reject.
                  onChange={(e) => updatePForm({ contact: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) })}
                  placeholder="10-digit mobile number"
                  style={
                    (pForm.contact !== "" && !/^[0-9]{10}$/.test(pForm.contact)) || (submitAttempted && pForm.contact === "")
                      ? INVALID_FIELD
                      : undefined
                  }
                />
                {pForm.contact !== "" && !/^[0-9]{10}$/.test(pForm.contact) && (
                  <div style={{ color: "#dc2626", fontSize: 11, marginTop: 4 }}>
                    Contact number must be exactly 10 digits.
                  </div>
                )}
                {submitAttempted && pForm.contact === "" && (
                  <div style={{ color: "#dc2626", fontSize: 11, marginTop: 4 }}>
                    Contact number is required.
                  </div>
                )}
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Email ID</label>
                <input type="email" value={pForm.email} onChange={(e) => updatePForm({ email: e.target.value })} placeholder="client@email.com" />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>City / Location *</label>
                <input
                  value={pForm.location}
                  onChange={(e) => updatePForm({ location: e.target.value })}
                  placeholder="e.g. Hyderabad"
                  style={submitAttempted && !pForm.location.trim() ? INVALID_FIELD : undefined}
                />
                {submitAttempted && !pForm.location.trim() && (
                  <div style={{ color: "#dc2626", fontSize: 11, marginTop: 4 }}>
                    City / Location is required.
                  </div>
                )}
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Full Address *</label>
                <input
                  value={pForm.address}
                  onChange={(e) => updatePForm({ address: e.target.value })}
                  placeholder="e.g. Plot 12, Jubilee Hills, Hyderabad 500033"
                  style={submitAttempted && !pForm.address.trim() ? INVALID_FIELD : undefined}
                />
                {submitAttempted && !pForm.address.trim() && (
                  <div style={{ color: "#dc2626", fontSize: 11, marginTop: 4 }}>
                    Full Address is required.
                  </div>
                )}
              </div>
            </>
          }
        />
      )}

      {/* ── Room Modal ─────────────────────────────────────────────────────── */}
      {roomModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 420, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 17 }}>{editRoomId ? "Edit Room" : "Add Room"}</h3>
            <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Room / Area Name *</label>
                <input
                  autoFocus
                  value={rForm.subProject}
                  onChange={(e) => setRForm((f) => ({ ...f, subProject: e.target.value }))}
                  placeholder="e.g. Master Bedroom / 2D Modeling"
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Type</label>
                <input
                  value={rForm.roomType}
                  onChange={(e) => setRForm((f) => ({ ...f, roomType: e.target.value }))}
                  placeholder="e.g. Bedroom / Kitchen / 3D Design / Living"
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={saveRoom}>{editRoomId ? "Update Room" : "Add Room"}</button>
              <button onClick={() => setRoomModal(false)} style={{ background: "#6b7280" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Material Search Modal ───────────────────────────────────────────── */}
      {matModal && (
        <MaterialModal
          prices={prices}
          onSelect={(v) => { matModal.onSelect(v); setMatModal(null); }}
          onClose={() => setMatModal(null)}
        />
      )}

      {templatePickerOpen && (
        <TemplatePickerModal
          templates={templates}
          onSelect={(t) => {
            setTemplatePickerOpen(false);
            if (boxes.length > 0) {
              setPendingTemplate(t);
            } else {
              applyTemplate(t);
            }
          }}
          onClose={() => setTemplatePickerOpen(false)}
        />
      )}

      {boxMatPicker && (
        <ProjItemPickerModal
          materialName={boxMatPicker.label}
          prices={prices}
          onSelect={(p) => {
            const f = boxMatPicker.field;
            const subSheetId = boxMatPicker.subSheetId ?? null;
            const sheetObj = subSheetId == null ? activeBox : (activeBox.subSheets || []).find((s) => s.id === subSheetId);
            const oldMat = boxMatPicker.oldValue || "";
            const oldId  = boxMatPicker.oldId ?? null;
            const newMat = p.materialName;
            const newId  = p.id ?? null;
            if (f && f.startsWith("__cm_")) {
              const cmId = Number(f.replace("__cm_", ""));
              const updated = (sheetObj?.customMaterials || []).map((m) =>
                m.id === cmId ? { ...m, value: newMat, itemId: newId } : m
              );
              renameMaterialInParts({ customMaterials: updated }, oldMat, newMat, oldId, newId, subSheetId);
            } else {
              renameMaterialInParts({ [f]: newMat, [`${f}Id`]: newId }, oldMat, newMat, oldId, newId, subSheetId);
            }
            setBoxMatPicker(null);
          }}
          onClose={() => setBoxMatPicker(null)}
        />
      )}

      {hardwarePicker && (
        <ProjItemPickerModal
          materialName="Hardware & Consumables"
          prices={prices}
          initialGroup={hardwarePicker.group}
          onSelect={(p) => {
            const boxId = hardwarePicker.boxId;
            if (hardwarePicker.hwId != null) {
              updateHardwareItemFields(boxId, hardwarePicker.hwId, { materialName: p.materialName, materialId: p.id ?? null });
            } else {
              addHardwareItem(boxId, { materialName: p.materialName, materialId: p.id ?? null });
            }
            setHardwarePicker(null);
          }}
          onClose={() => setHardwarePicker(null)}
        />
      )}

      {/* ── Cut Sheet Optimizer Modal ── */}
      {cutSheetOpen && activeBox && (
        <CutSheetOptimizer
          rows={generateCutSheet()}
          title={activeBox.boxName || activeBox.name || ""}
          subtitle={`${activeBox.widthMm || ""}W × ${activeBox.heightMm || ""}H × ${activeBox.depthMm || ""}D mm`}
          onClose={() => setCutSheetOpen(false)}
        />
      )}

      {/* ── Cut Sheet Optimizer Modal (all boxes in this room) ── */}
      {allCutSheetOpen && activeRoom && (
        <CutSheetOptimizer
          rows={generateAllBoxesCutSheet()}
          title={activeRoom.subProject || "All Boxes"}
          subtitle={`All Boxes · ${boxes.length} box${boxes.length !== 1 ? "es" : ""}`}
          onClose={() => setAllCutSheetOpen(false)}
        />
      )}
    </div>
  );
}

export default Projects;
