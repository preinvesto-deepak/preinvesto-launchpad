import { useState, useEffect, Fragment } from "react";
import { useLocation } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { mmToFeet, feetToMm, roundTo2, formatCurrency } from "../utils/unitConversions";
import CutSheetOptimizer from "./CutSheetOptimizer";
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

const DOOR_TYPES = ["Sliding Door", "Swing Door"];

// Material Models pricing tiers — same set shown on the Material Models page
// and in Projects' Material Summary, so template costing reads identically.
const MODEL_KEYS = ["economy", "standard", "premium"];
const MODEL_LABELS = { economy: "Economy", standard: "Standard", premium: "Premium" };
const MODEL_COLORS = { economy: "#059669", standard: "#2563eb", premium: "#7c3aed" };

const PART_GROUPS = ["Ply", "Inside Laminate", "Outside Laminate", "Edge Beading"];
const PART_GROUP_COLORS = {
  "Ply":               "#dbeafe",
  "Inside Laminate":   "#fef3c7",
  "Outside Laminate":  "#dcfce7",
  "Edge Beading":      "#fce7f3",
};

const DEFAULT_REFS = {
  heightMm: "H", widthMm: "W", depthMm: "D",
  doorsH: "DoorsH", doorsV: "DoorsV",
  backParts: "BackParts", partitions: "VP", shelves: "Shelves",
};

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
  // roundTo2() returns a string (.toFixed(2)) — keep this a real number so it
  // stays safe to add/sum elsewhere (e.g. Carpenter row totals).
  result.Sft = hMm && wMm ? Math.ceil(mmToFeet(hMm) * mmToFeet(wMm)) : 0;
  return result;
};

// A Sub Sheet Calculation (e.g. "Draw") — a full peer of the box's own
// Sheet Calculation ("1."), numbered "1.1", "1.2", ... under the same
// collapsible. Mirrors every field a box itself has for Section 1: its own
// Box Type/Door Type, own H/W/D, own materials, own fields/refs, and own
// parts — fully independent of the box and of every other sub-sheet.
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
  materialLabels: {},
  fieldLabels: {},
  doorsH: 2, doorsV: 1, backParts: 1, partitions: 0, shelves: 2,
  customFields: [],
  refs: { ...DEFAULT_REFS },
  parts: [],
});

// A box's own cut-list parts ("1.") plus every Sub Sheet Calculation's parts
// ("1.1", "1.2", ... e.g. a "Draw" living inside a Wardrobe box) — each
// sheet is a full peer with its own H/W/D-derived vars and its own Edge
// Beading material, so cut-list/edge-banding totals can walk one flat list
// without caring whether a part came from the box itself or one of its
// sub-sheets. `sheet` is the box or sub-sheet object itself, for reading its
// own matEdgeBeading/matEdgeBeadingId. A sheet with its "Include in Material
// Calculation" checkbox off contributes no parts here at all — the single
// point where that opt-out is enforced for every consumer (Cut Sheet
// Optimizer, Hardware & Consumables' auto edge banding, Material Summary,
// BOQ).
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
  const substituted = str.replace(/\{(\w+)\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : "0"
  );
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function('"use strict"; return (' + substituted + ')')();
    if (typeof result !== "number" || !isFinite(result)) return "?";
    return Math.round(result);
  } catch {
    return "?";
  }
}

const MATERIAL_FIELDS = [
  ["Door Ply",         "matDoor"],
  ["Carcase Ply",      "matCarcas"],
  ["Outside Laminate", "matOutsideLaminate"],
  ["Inside Laminate",  "matInsideLaminate"],
  ["Edge Beading",     "matEdgeBeading"],
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
  "customMaterials", "materialLabels", "fieldLabels",
  "doorsH", "doorsV", "backParts", "partitions", "shelves",
  "customFields", "refs", "parts",
];

const emptyPart = (id) => ({
  id,
  group: "Ply",
  partName: "",
  req: true,
  widthMm: "",
  heightMm: "",
  qty: 1,
  material: "",   materialId: null,
  rotation: 1,
  label: "",
  sideA: "",      sideAId: null,
  sideB: "",      sideBId: null,
  edgeReq: true,
  edgeTop: 2,    edgeTopReq: true,
  edgeBottom: 2, edgeBottomReq: true,
  edgeLeft: 2,   edgeLeftReq: true,
  edgeRight: 2,  edgeRightReq: true,
  remarks: "",
});

const emptyBox = (id) => ({
  id,
  boxName: `Box ${id}`,
  shortName: "",
  boxType: "",
  doorType: "",
  includeInMaterialCalc: true,
  heightMm: "",
  widthMm: "",
  depthMm: "",
  // Shown below Box Name, independent of the Sheet Calculation H/W/D
  // above — these drive the Quotation's Type of Work/Area/Carpenter
  // cost instead (see boxAreaSft/buildBoxCarpenterRow in projectRows.js).
  quotationBoxType: "", quotationDoorType: "",
  quotationWidthMm: "", quotationHeightMm: "", quotationDepthMm: "",
  matDoor: "",        matDoorId: null,
  matCarcas: "",      matCarcasId: null,
  matOutsideLaminate: "", matOutsideLaminateId: null,
  matInsideLaminate: "", matInsideLaminateId: null,
  matEdgeBeading: "", matEdgeBeadingId: null,
  customMaterials: [],
  customFields: [],
  materialLabels: {},
  fieldLabels: {},
  doorsH: 2,
  doorsV: 1,
  backParts: 1,
  partitions: 0,
  shelves: 2,
  refs: { ...DEFAULT_REFS },
  parts: [],
  subSheets: [],
});

const emptyTemplate = (id, name) => ({
  id,
  templateName: name,
  description: "",
  templateImage: "",
  boxes: [emptyBox(1)],
});

// Template card photos are cropped to this exact ratio at upload time (see
// TemplateImageCropModal below) and the card renders them at the same ratio
// — so what the user selects in the crop tool is exactly what's visible on
// the card, with no further browser-side cropping (object-fit: cover) to
// surprise them by hiding the top/bottom.
const TEMPLATE_IMAGE_RATIO = 4 / 3;
const CROP_FRAME_W = 420;
const CROP_FRAME_H = Math.round(CROP_FRAME_W / TEMPLATE_IMAGE_RATIO);
// Output resolution is 2x the on-screen crop frame for a crisp card image
// without storing a full-resolution phone photo inline in the template's
// JSON (templateImage is a data: URI in the same blob that autosaves on
// every edit — a multi-MB photo would bloat every save/load of the whole
// workspace, not just this one template).
const CROP_OUTPUT_W = CROP_FRAME_W * 2;
const CROP_OUTPUT_H = CROP_FRAME_H * 2;

/**
 * Drag-to-reposition + zoom cropper. Lets the user pick exactly which part
 * of an uploaded photo becomes the template's card image, instead of the
 * browser silently cropping whatever doesn't fit via object-fit: cover.
 */
function TemplateImageCropModal({ src, onConfirm, onCancel }) {
  const imgRef = useState(() => ({ current: null }))[0];
  const [natSize, setNatSize] = useState(null); // { w, h } in natural pixels
  const [zoom, setZoom] = useState(1); // multiplier over the "fills the frame" scale
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // top-left of the image, in frame px
  const [dragging, setDragging] = useState(false);
  const dragStart = useState(() => ({ current: null }))[0];

  const minScale = natSize ? Math.max(CROP_FRAME_W / natSize.w, CROP_FRAME_H / natSize.h) : 1;
  const scale = minScale * zoom;
  const scaledW = natSize ? natSize.w * scale : 0;
  const scaledH = natSize ? natSize.h * scale : 0;

  // Keeps the frame always fully covered by the image — offset can't drift
  // past an edge and leave blank space inside the crop area.
  const clamp = (value, scaledDim, frameDim) => Math.min(0, Math.max(frameDim - scaledDim, value));

  const handleImgLoad = () => {
    const el = imgRef.current;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setNatSize({ w, h });
    const ms = Math.max(CROP_FRAME_W / w, CROP_FRAME_H / h);
    setOffset({ x: (CROP_FRAME_W - w * ms) / 2, y: (CROP_FRAME_H - h * ms) / 2 });
  };

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, offset };
  };
  const handlePointerMove = (e) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({
      x: clamp(dragStart.current.offset.x + dx, scaledW, CROP_FRAME_W),
      y: clamp(dragStart.current.offset.y + dy, scaledH, CROP_FRAME_H),
    });
  };
  const handlePointerUp = () => {
    dragStart.current = null;
    setDragging(false);
  };

  const handleZoomChange = (newZoom) => {
    if (!natSize) return;
    const sw = natSize.w * minScale * newZoom;
    const sh = natSize.h * minScale * newZoom;
    setZoom(newZoom);
    setOffset((prev) => ({
      x: clamp(prev.x, sw, CROP_FRAME_W),
      y: clamp(prev.y, sh, CROP_FRAME_H),
    }));
  };

  const handleConfirm = () => {
    const canvas = document.createElement("canvas");
    canvas.width = CROP_OUTPUT_W;
    canvas.height = CROP_OUTPUT_H;
    const ctx = canvas.getContext("2d");
    // Map the visible frame back to natural-pixel coordinates in the source
    // image, so the exported crop matches what was shown, 1:1.
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sW = CROP_FRAME_W / scale;
    const sH = CROP_FRAME_H / scale;
    ctx.drawImage(imgRef.current, sx, sy, sW, sH, 0, 0, CROP_OUTPUT_W, CROP_OUTPUT_H);
    onConfirm(canvas.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: CROP_FRAME_W + 48 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Position photo</h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6b7280" }}>
          Drag to reposition, use the slider to zoom. This is exactly what will show on the template card.
        </p>
        <div
          style={{
            width: CROP_FRAME_W, height: CROP_FRAME_H, overflow: "hidden", position: "relative",
            borderRadius: 8, background: "#f3f4f6", cursor: dragging ? "grabbing" : "grab",
            touchAction: "none", userSelect: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            ref={(el) => { imgRef.current = el; }}
            src={src}
            onLoad={handleImgLoad}
            draggable={false}
            alt=""
            style={{ position: "absolute", left: offset.x, top: offset.y, width: scaledW || "auto", height: scaledH || "auto", maxWidth: "none" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Zoom</span>
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            disabled={!natSize}
            style={{ flex: 1 }}
          />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "#6b7280", padding: "7px 16px", fontSize: 13 }}>Cancel</button>
          <button onClick={handleConfirm} disabled={!natSize} style={{ background: "#2563eb", padding: "7px 16px", fontSize: 13 }}>Use This Photo</button>
        </div>
      </div>
    </div>
  );
}

function ftLabel(mm) {
  return mm ? roundTo2(mmToFeet(Number(mm))) + " ft" : "—";
}

// ── Item Picker Modal ─────────────────────────────────────────────────────────
const LABEL_TO_GROUP = {
  "Door Ply":         "Wood",
  "Carcase Ply":      "Wood",
  "Outside Laminate": "Laminate",
  "Inside Laminate":  "Laminate",
  "Edge Beading":     "Edge Beading",
};

// Groups shown in the Hardware & Consumables table — every Items Pricing
// group except the sheet-material ones (Wood/Laminate qty is finalized via
// the Sheet Calculation & Cut List section instead).
const HARDWARE_GROUPS = GROUP_OPTIONS.filter((g) => g !== "Wood" && g !== "Laminate");

// Grouped tabs + multi-field search, mirroring the Items Pricing page's own
// filter UI so picking a material here feels the same as browsing it there.
function ItemPickerModal({ label, prices, onSelect, onClose, initialGroup }) {
  const defaultGroup = initialGroup || LABEL_TO_GROUP[label] || "All";
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

  const byBrand = {};
  results.forEach((p) => {
    const b = p.brand || "— No Brand —";
    (byBrand[b] = byBrand[b] || []).push(p);
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "84vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ background: "#1e3a5f", color: "#fff", padding: "14px 20px", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Pick from Items Pricing</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>For "{label}"</div>
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

        {/* Search — same fields (name/brand/spec/group) as the Items Pricing page */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
          <input
            autoFocus
            type="text"
            placeholder="Search by name, brand, spec, group…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 12px", fontSize: 14, borderRadius: 8, border: "1px solid #d1d5db", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {results.length === 0 ? (
            <p style={{ color: "#9ca3af", textAlign: "center", padding: 32 }}>No matching items found.</p>
          ) : Object.entries(byBrand).map(([brandName, items]) => (
            <div key={brandName}>
              <div style={{ background: "#e0e7ff", color: "#3730a3", padding: "5px 16px", fontWeight: 600, fontSize: 12, position: "sticky", top: 0 }}>
                {brandName} <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 6 }}>({items.length})</span>
              </div>
              {items.map((p) => {
                const displayImg = (p.images || []).find((i) => i.isDisplay);
                return (
                  <div
                    key={p.id}
                    onClick={() => onSelect(p.materialName, p.id)}
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
                    {p.rate > 0 && (
                      <div style={{ textAlign: "right", flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#111827" }}>
                        ₹{Number(p.rate).toLocaleString("en-IN")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Collapsible Section Header ────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
function TemplateMaster() {
  const { templates, setTemplates, prices, materialStockSettings, materialModelRates } = useAppData();

  // Left panel
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(() => templates[0]?.id ?? null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // New template modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");

  // Right panel — draft (local edits, not yet saved to context)
  const [draft, setDraft] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [view, setView] = useState("grid"); // "grid" | "detail"
  const [cutSheetOpen, setCutSheetOpen] = useState(false);
  const [allCutSheetOpen, setAllCutSheetOpen] = useState(false);

  // Clicking "Templates" in the sidebar while already on this page doesn't
  // remount the component (same route, so React Router leaves it alone) —
  // without this, `view` stayed stuck on "detail" and the click looked like
  // it did nothing, with "All Templates" the only way back. location.key
  // changes on every navigation, including to the same path, but not on our
  // own internal setView("detail") calls (no navigation involved) — so this
  // fires exactly when the sidebar link is clicked, and only then.
  const location = useLocation();
  useEffect(() => {
    setView("grid");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const [activeBoxId, setActiveBoxId] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [cropSrc, setCropSrc] = useState(null); // data URL of a freshly-picked photo, awaiting crop
  const [confirmDeleteBoxId, setConfirmDeleteBoxId] = useState(null);
  const [matPicker, setMatPicker] = useState(null);
  const [hardwarePicker, setHardwarePicker] = useState(null); // { hwId }
  const [expandedEdgeId, setExpandedEdgeId] = useState(null);
  const [dimUnit, setDimUnit] = useState("mm"); // "mm" or "ft"

  // Collapsible section state. Each Sub Sheet Calculation gets its own key
  // ("sheet_<id>"), toggled the same way as "sheets"/"hardware"/"summary".
  const [openSections, setOpenSections] = useState({ sheets: false, hardware: false, summary: false });
  // One-slot clipboard for the Copy/Paste buttons on each Sheet Calculation.
  const [copiedSheet, setCopiedSheet] = useState(null);
  // Extra length added to each edge band product's calculated meterage before
  // rounding, to cover cutting wastage/offcuts — editable, defaults to 2m.
  const [edgeExtraMtr, setEdgeExtraMtr] = useState(0);
  // Extra sq ft buffer added to the auto Carpenter row's Qty (= Area Sft),
  // same shared-across-all-Carpenter-rows pattern as edgeExtraMtr above.
  const [carpenterExtraSft, setCarpenterExtraSft] = useState(0);
  // Fevicol Merino qty is auto-calculated (not hand-entered) as this multiplier
  // times the total Inside + Outside Laminate sheets required across all boxes
  // — editable so the coverage-per-sheet ratio can be tuned, defaults to 0.7.
  const [fevicolMultiplier, setFevicolMultiplier] = useState(0.7);
  // GST % applied on top of Material Summary's Total/Sft Cost rows to show
  // both Excl. and Incl. GST figures side by side — editable, defaults to 18%.
  const [gstPercent, setGstPercent] = useState(18);
  const toggleSection = (key) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // Load draft whenever selected template changes
  const savedTemplate = templates.find((t) => t.id === selectedId) ?? templates[0] ?? null;
  useEffect(() => {
    if (savedTemplate) {
      setDraft(JSON.parse(JSON.stringify(savedTemplate)));
      setIsDirty(false);
      setActiveBoxId(null);
      setEditingName(false);
    } else {
      setDraft(null);
      setIsDirty(false);
    }
  }, [selectedId, templates.length]);

  const boxes = draft?.boxes || [];
  const activeBox = boxes.find((b) => b.id === activeBoxId) ?? boxes[0] ?? null;

  // Filtered list (left panel)
  const filtered = templates.filter((t) => {
    const q = search.toLowerCase();
    return (
      (t.templateName || "").toLowerCase().includes(q) ||
      (t.boxes || []).some(
        (b) =>
          (b.boxName || "").toLowerCase().includes(q) ||
          (b.boxType || "").toLowerCase().includes(q) ||
          (b.doorType || "").toLowerCase().includes(q)
      )
    );
  });

  // Edge banding for ONE box — auto-matched per Ply row to a compatible Edge
  // Band product (by thickness) instead of one manually-picked material for
  // the whole box. Falls back to the box's own Edge Beading selection when no
  // thickness match is found (e.g. thicknesses not set yet). Pure geometry —
  // no wastage buffer applied here. returns: { [edgeBandMaterialName]: lengthMm }
  const computeBoxEdgeBandingMm = (box) => {
    const totals = {};
    const rmat = (name, id) => id != null ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name) : name;
    boxPartGroups(box).forEach(({ vars, parts, sheet }) => {
      (parts || []).forEach((part) => {
        if (part.req === false) return;
        if (part.group !== "Ply") return; // only the core board carries a real edge to band
        if (part.edgeReq === false) return; // "EB" checkbox off — this row gets no edge banding at all
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
  // base = calculated length rounded up to a whole meter (you buy edge band
  // by the full/part roll, so rounding down would under-order); extra = the
  // editable wastage buffer, blank/0 by default; qty = base + extra, the
  // same "base + extra = total" pattern as every other row in the table.
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
  // that box's Area Sft ({Sft}). e.g. Box Type "Frame" → Carpenter "Frame" row.
  const computeBoxCarpenterRows = (box) => {
    const boxType = box.quotationBoxType || box.boxType;
    if (!boxType) return [];
    const extra = Math.max(0, Number(carpenterExtraSft) || 0);
    const base = quotationAreaSft(box);
    return [{ material: boxType, base, extra, qty: Math.round((base + extra) * 100) / 100 }];
  };

  // ── Material Summary across ALL boxes ────────────────────────────────────────
  // Sheet materials come from real nesting; Edge Banding is picked up directly
  // from what each box's own Hardware & Consumables panel already shows (same
  // per-box rows, summed across boxes) — one source of truth, not a second calc.
  const computeMatSummary = () => {
    if (!draft) return [];
    const rows = generateAllBoxesCutSheet();
    const getStockSize = (mat) => {
      const s = materialStockSettings?.[mat];
      return { sheetW: s?.sheetW || 2440, sheetH: s?.sheetH || 1220, sheetTexture: s?.sheetTexture ?? 1 };
    };
    const packed = packSheets(rows, getStockSize);
    const sheetCount = {};
    packed.forEach((s) => { sheetCount[s.material] = (sheetCount[s.material] || 0) + 1; });
    const materials = [...new Set(rows.map((r) => r.material).filter(Boolean))];
    // Segregate by the "group" field from Items Pricing (Wood, Laminate, ...)
    // so the summary mirrors the BOQ's category layout.
    const sheetRows = materials.map((material) => {
      const priceEntry = (prices || []).find((p) => p.materialName === material);
      const extraSheets = Math.max(0, Number(materialStockSettings?.[material]?.extraQty) || 0);
      return { material, group: priceEntry?.group || "Other", requiredQty: (sheetCount[material] || 0) + extraSheets, unit: priceEntry?.unit || "Sheet" };
    });

    const edgeSummed = {};
    (draft.boxes || []).forEach((box) => {
      computeBoxEdgeBandingRows(box).forEach(({ material, qty }) => {
        edgeSummed[material] = (edgeSummed[material] || 0) + qty;
      });
    });
    const edgeRows = Object.entries(edgeSummed).map(([material, requiredQty]) => ({
      material, group: "Edge Beading", requiredQty, unit: "Mtr",
    }));

    const carpSummed = {};
    (draft.boxes || []).forEach((box) => {
      computeBoxCarpenterRows(box).forEach(({ material, qty }) => {
        carpSummed[material] = (carpSummed[material] || 0) + qty;
      });
    });
    // requiredQty stays a number here (not roundTo2's string output) so it can
    // still be summed safely into the Total row below alongside every other group.
    const carpRows = Object.entries(carpSummed).map(([material, requiredQty]) => ({
      material, group: "Carpenter", requiredQty: Math.round(requiredQty * 100) / 100,
      unit: (prices || []).find((p) => p.materialName === material)?.unit || "Sq.ft",
    }));

    // Every manually-added Hardware & Consumables item (Handles, Hinges, Glue,
    // Addons, Tape, ...) across all boxes — same base+extra total shown in
    // Section 3 — summed here by material so nothing added there is missed.
    const FEVICOL_NAME = "Fevicol Merino";
    const hwSummed = {};
    (draft.boxes || []).forEach((box) => {
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
    // required (every "Laminate" group sheet, since a box's inside/outside
    // laminate selections are just different Laminate-group materials).
    const totalLaminateSheets = sheetRows.filter((r) => r.group === "Laminate").reduce((s, r) => s + r.requiredQty, 0);
    const fevicolQty = Math.round(totalLaminateSheets * (Number(fevicolMultiplier) || 0) * 100) / 100;
    const fevicolPriceEntry = (prices || []).find((p) => p.materialName === FEVICOL_NAME);
    const fevicolRows = fevicolQty > 0
      ? [{ material: FEVICOL_NAME, group: fevicolPriceEntry?.group || "Glue", requiredQty: fevicolQty, unit: fevicolPriceEntry?.unit || "KG" }]
      : [];

    return [...sheetRows, ...edgeRows, ...carpRows, ...hwRows, ...fevicolRows].sort((a, b) => a.group.localeCompare(b.group) || a.material.localeCompare(b.material));
  };

  // ── Cut Sheet Generator ───────────────────────────────────────────────────────
  const generateCutSheet = () => {
    if (!activeBox) return [];
    const rmat = (name, id) => id != null ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name) : name;
    const rows = [];
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

  // ── Cut Sheet for ALL boxes ───────────────────────────────────────────────────
  const generateAllBoxesCutSheet = () => {
    if (!draft) return [];
    const rows = [];
    const rmat = (name, id) => id != null ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name) : name;
    (draft.boxes || []).forEach((box) => {
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
    rows.sort((a, b) => (a.material || "").localeCompare(b.material || "") || a.rowNum - b.rowNum);
    return rows;
  };

  // ── Draft helpers ─────────────────────────────────────────────────────────────
  const updateDraft = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleTemplateImagePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => alert("Could not read that file.");
    reader.onload = () => setCropSrc(reader.result); // opens TemplateImageCropModal
    reader.readAsDataURL(file);
  };

  const handleCropConfirm = (dataUri) => {
    updateDraft("templateImage", dataUri);
    setCropSrc(null);
  };

  const updateBox = (field, value) => {
    if (!activeBox) return;
    setDraft((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b) => b.id === activeBox.id ? { ...b, [field]: value } : b),
    }));
    setIsDirty(true);
  };

  // ── Save ──────────────────────────────────────────────────────────────────────
  const saveTemplate = () => {
    if (!draft) return;
    setTemplates((prev) => prev.map((t) => t.id === draft.id ? { ...draft } : t));
    setIsDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  // ── Template CRUD ─────────────────────────────────────────────────────────────
  const createTemplate = () => {
    if (!newName.trim()) { alert("Template name is required."); return; }
    const id = templates.length ? Math.max(...templates.map((t) => t.id)) + 1 : 1;
    const t = emptyTemplate(id, newName.trim());
    setTemplates((prev) => [...prev, t]);
    setSelectedId(id);
    setActiveBoxId(1);
    setShowNewModal(false);
    setNewName("");
    setView("detail");
  };

  const deleteTemplate = (id) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (selectedId === id) setSelectedId(templates.find((t) => t.id !== id)?.id ?? null);
    setConfirmDeleteId(null);
  };

  // ── Box CRUD (operates on draft) ──────────────────────────────────────────────
  const addBox = () => {
    if (!draft) return;
    const id = boxes.length ? Math.max(...boxes.map((b) => b.id)) + 1 : 1;
    setDraft((prev) => ({ ...prev, boxes: [...prev.boxes, emptyBox(id)] }));
    setActiveBoxId(id);
    setIsDirty(true);
  };

  const deleteBox = (boxId) => {
    const updated = boxes.filter((b) => b.id !== boxId);
    setDraft((prev) => ({ ...prev, boxes: updated }));
    if (activeBoxId === boxId) setActiveBoxId(updated[0]?.id ?? null);
    setConfirmDeleteBoxId(null);
    setIsDirty(true);
  };

  // ── Parts CRUD (operates on activeBox within draft) ───────────────────────────
  // Every fn takes an optional trailing subSheetId: omitted (undefined), it acts
  // on the box's own parts as before; given, it acts on that Sub Sheet
  // Calculation's parts instead (see Sub Sheet Calculations UI below Section 1).
  const activeParts = activeBox?.parts || [];

  const addPart = (subSheetId) => {
    if (!activeBox) return;
    setDraft((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b) => {
        if (b.id !== activeBox.id) return b;
        if (subSheetId == null) {
          const parts = b.parts || [];
          const newId = parts.length ? Math.max(...parts.map((p) => p.id)) + 1 : 1;
          return { ...b, parts: [...parts, emptyPart(newId)] };
        }
        return {
          ...b,
          subSheets: (b.subSheets || []).map((s) => {
            if (s.id !== subSheetId) return s;
            const parts = s.parts || [];
            const newId = parts.length ? Math.max(...parts.map((p) => p.id)) + 1 : 1;
            return { ...s, parts: [...parts, emptyPart(newId)] };
          }),
        };
      }),
    }));
    setIsDirty(true);
  };

  const updatePart = (partId, field, value, subSheetId) => {
    if (!activeBox) return;
    setDraft((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b) => {
        if (b.id !== activeBox.id) return b;
        if (subSheetId == null) {
          return { ...b, parts: (b.parts || []).map((p) => p.id === partId ? { ...p, [field]: value } : p) };
        }
        return {
          ...b,
          subSheets: (b.subSheets || []).map((s) =>
            s.id === subSheetId ? { ...s, parts: (s.parts || []).map((p) => p.id === partId ? { ...p, [field]: value } : p) } : s
          ),
        };
      }),
    }));
    setIsDirty(true);
  };

  const updatePartFields = (partId, fields, subSheetId) => {
    if (!activeBox) return;
    setDraft((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b) => {
        if (b.id !== activeBox.id) return b;
        if (subSheetId == null) {
          return { ...b, parts: (b.parts || []).map((p) => p.id === partId ? { ...p, ...fields } : p) };
        }
        return {
          ...b,
          subSheets: (b.subSheets || []).map((s) =>
            s.id === subSheetId ? { ...s, parts: (s.parts || []).map((p) => p.id === partId ? { ...p, ...fields } : p) } : s
          ),
        };
      }),
    }));
    setIsDirty(true);
  };

  const deletePart = (partId, subSheetId) => {
    if (!activeBox) return;
    setDraft((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b) => {
        if (b.id !== activeBox.id) return b;
        if (subSheetId == null) {
          return { ...b, parts: (b.parts || []).filter((p) => p.id !== partId) };
        }
        return {
          ...b,
          subSheets: (b.subSheets || []).map((s) =>
            s.id === subSheetId ? { ...s, parts: (s.parts || []).filter((p) => p.id !== partId) } : s
          ),
        };
      }),
    }));
    setIsDirty(true);
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

  // Sets several fields on a sub-sheet in one update (e.g. a material name +
  // its id together) — calling updateSubSheet twice in a row would have the
  // second call overwrite the first, since both read the same stale
  // activeBox.subSheets snapshot.
  const updateSubSheetFields = (subSheetId, fields) => {
    if (!activeBox) return;
    updateBox("subSheets", (activeBox.subSheets || []).map((s) => s.id === subSheetId ? { ...s, ...fields } : s));
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
    setCopiedSheet({ fields, sourceLabel: subSheetId == null ? (activeBox.boxName || "1.") : (sheet.name || "Sub Sheet") });
  };

  const pasteSheetData = (subSheetId) => {
    if (!activeBox || !copiedSheet) return;
    const fields = {};
    SHEET_COPY_FIELDS.forEach((f) => {
      const v = copiedSheet.fields[f];
      fields[f] = v === undefined ? v : JSON.parse(JSON.stringify(v));
    });
    if (subSheetId == null) {
      setDraft((prev) => ({
        ...prev,
        boxes: prev.boxes.map((b) => b.id === activeBox.id ? { ...b, ...fields } : b),
      }));
      setIsDirty(true);
    } else {
      updateBox("subSheets", (activeBox.subSheets || []).map((s) => s.id === subSheetId ? { ...s, ...fields } : s));
    }
  };

  // ── Hardware & Consumables CRUD (operates on any box within draft, given its
  // id — Section 3 always passes activeBox.id; the cross-box editor in Section
  // 4 passes whichever box a row belongs to) ───────────────────────────────────
  // Qty is finalized here in the template; Project only adds Brand/Cost via Material Models.
  const addHardwareItem = (boxId, fields = {}) => {
    if (!boxId) return;
    const box = boxes.find((b) => b.id === boxId);
    const items = box?.hardwareItems || [];
    const id = items.length ? Math.max(...items.map((h) => h.id)) + 1 : 1;
    setDraft((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b) =>
        b.id === boxId ? { ...b, hardwareItems: [...(b.hardwareItems || []), { id, materialName: "", materialId: null, qty: 1, extra: 0, ...fields }] } : b
      ),
    }));
    setIsDirty(true);
  };
  const updateHardwareItem = (boxId, id, field, value) => {
    if (!boxId) return;
    setDraft((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b) =>
        b.id === boxId
          ? { ...b, hardwareItems: (b.hardwareItems || []).map((h) => h.id === id ? { ...h, [field]: value } : h) }
          : b
      ),
    }));
    setIsDirty(true);
  };
  const updateHardwareItemFields = (boxId, id, fields) => {
    if (!boxId) return;
    setDraft((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b) =>
        b.id === boxId
          ? { ...b, hardwareItems: (b.hardwareItems || []).map((h) => h.id === id ? { ...h, ...fields } : h) }
          : b
      ),
    }));
    setIsDirty(true);
  };
  const deleteHardwareItem = (boxId, id) => {
    if (!boxId) return;
    setDraft((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b) =>
        b.id === boxId ? { ...b, hardwareItems: (b.hardwareItems || []).filter((h) => h.id !== id) } : b
      ),
    }));
    setIsDirty(true);
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 12, overflow: "hidden", minHeight: 500 }}>

      {/* ══════════ GRID VIEW ══════════ */}
      {view === "grid" && (
        <div>
          {/* Header bar */}
          <div style={{ padding: "12px 24px 8px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Templates</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{templates.length} template{templates.length !== 1 ? "s" : ""} defined</div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: "7px 12px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 7, width: 220 }}
              />
              <button
                onClick={() => { setNewName(""); setShowNewModal(true); }}
                style={{ background: "#2563eb", padding: "8px 16px", fontSize: 13, whiteSpace: "nowrap" }}
              >
                + New Template
              </button>
            </div>
          </div>

          {/* Tile grid */}
          <div style={{ padding: "16px 24px 24px" }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📐</div>
                <p style={{ fontSize: 15, marginBottom: 16 }}>{search ? `No results for "${search}"` : "No templates yet."}</p>
                {!search && <button onClick={() => { setNewName(""); setShowNewModal(true); }}>+ Create First Template</button>}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                {filtered.map((t) => {
                  const boxCount = (t.boxes || []).length;
                  return (
                    <div
                      key={t.id}
                      onClick={() => { setSelectedId(t.id); setView("detail"); }}
                      style={{
                        border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden",
                        cursor: "pointer", background: "#fff",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                        transition: "box-shadow 0.15s, border-color 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#7c3aed"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(124,58,237,0.12)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; }}
                    >
                      {t.templateImage ? (
                        <img
                          src={t.templateImage}
                          alt=""
                          style={{ width: "100%", aspectRatio: TEMPLATE_IMAGE_RATIO, objectFit: "cover", display: "block" }}
                        />
                      ) : (
                        <div style={{ width: "100%", aspectRatio: TEMPLATE_IMAGE_RATIO, background: "#f9fafb", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, color: "#d1d5db" }}>
                          📐
                        </div>
                      )}
                      <div style={{ padding: "9px 14px", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.templateName}</div>
                        <div style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>{boxCount} box{boxCount !== 1 ? "es" : ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ DETAIL VIEW ══════════ */}
      {view === "detail" && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 500 }}>
          {!draft ? (
            <div style={{ padding: 60, textAlign: "center", color: "#6b7280" }}>
              <button onClick={() => setView("grid")} style={{ background: "#6b7280", marginBottom: 20 }}>← Back</button>
              <p>Template not found.</p>
            </div>
          ) : (
          <>
            {/* Template Header */}
            <div style={{ padding: "12px 24px 8px", borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <button
                    onClick={() => setView("grid")}
                    style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "6px 14px", fontSize: 13, marginTop: 2, whiteSpace: "nowrap" }}
                  >
                    ← All Templates
                  </button>
                <label
                  title={draft.templateImage ? "Change photo" : "Add photo"}
                  style={{
                    width: 64, height: 64, borderRadius: 8, flexShrink: 0, cursor: "pointer",
                    background: draft.templateImage ? `url(${draft.templateImage}) center/cover` : "#f9fafb",
                    border: draft.templateImage ? "1px solid #e5e7eb" : "1px dashed #d1d5db",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, color: "#9ca3af", position: "relative", overflow: "hidden",
                  }}
                >
                  {!draft.templateImage && "📷"}
                  {draft.templateImage && (
                    <div
                      style={{
                        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 11, fontWeight: 600,
                        opacity: 0, transition: "opacity 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = 0)}
                    >
                      Change
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleTemplateImagePick} style={{ display: "none" }} />
                </label>
                <div>
                  {editingName ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { updateDraft("templateName", nameDraft); setEditingName(false); }
                          if (e.key === "Escape") setEditingName(false);
                        }}
                        style={{ fontWeight: 700, fontSize: 18, border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 10px", width: 260 }}
                      />
                      <button onClick={() => { updateDraft("templateName", nameDraft); setEditingName(false); }} style={{ padding: "5px 12px", fontSize: 13 }}>OK</button>
                      <button onClick={() => setEditingName(false)} style={{ padding: "5px 12px", fontSize: 13, background: "#6b7280" }}>Cancel</button>
                    </div>
                  ) : (
                    <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>
                      {draft.templateName}
                      {isDirty && <span style={{ marginLeft: 8, fontSize: 12, color: "#d97706", fontWeight: 400 }}>• unsaved changes</span>}
                    </h2>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {savedFlash && (
                    <span style={{ fontSize: 12, color: "#059669", fontWeight: 600, background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 8, padding: "6px 12px" }}>
                      ✓ Saved
                    </span>
                  )}
                  <button
                    onClick={saveTemplate}
                    disabled={!isDirty}
                    style={{
                      background: isDirty ? "#059669" : "#d1fae5",
                      color: isDirty ? "#fff" : "#6b7280",
                      padding: "6px 18px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: isDirty ? "pointer" : "default",
                      border: isDirty ? "none" : "1px solid #a7f3d0",
                    }}
                  >
                    {isDirty ? "💾 Save Template" : "✓ Saved"}
                  </button>
                  {!editingName && (
                    <button
                      onClick={() => { setNameDraft(draft.templateName); setEditingName(true); }}
                      style={{ background: "#6b7280", padding: "6px 14px", fontSize: 13 }}
                    >
                      ✏ Edit Name
                    </button>
                  )}
                  {confirmDeleteId === draft.id ? (
                    <>
                      <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>Delete template?</span>
                      <button onClick={() => deleteTemplate(draft.id)} style={{ background: "#dc2626", padding: "6px 14px", fontSize: 13 }}>Yes</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ background: "#6b7280", padding: "6px 14px", fontSize: 13 }}>No</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(draft.id)} style={{ background: "#dc2626", padding: "6px 14px", fontSize: 13 }}>
                      🗑 Delete
                    </button>
                  )}
                </div>
                </div>
              </div>
            </div>

            {/* Box Tabs */}
            <div style={{ padding: "0 24px", borderBottom: "2px solid #e5e7eb", display: "flex", alignItems: "flex-end", gap: 2, flexWrap: "wrap", background: "#fff" }}>
              {boxes.map((box) => {
                const isActive = activeBox?.id === box.id || (!activeBoxId && boxes[0]?.id === box.id);
                return (
                  <button
                    key={box.id}
                    onClick={() => setActiveBoxId(box.id)}
                    style={{
                      padding: "7px 16px",
                      border: "none",
                      borderBottom: isActive ? "3px solid #7c3aed" : "3px solid transparent",
                      background: "none",
                      color: isActive ? "#7c3aed" : "#374151",
                      fontWeight: isActive ? 700 : 400,
                      cursor: "pointer",
                      fontSize: 14,
                      marginBottom: -2,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {box.boxName || `Box ${box.id}`}
                  </button>
                );
              })}
              <button
                onClick={addBox}
                style={{ padding: "10px 14px", border: "none", background: "none", color: "#7c3aed", cursor: "pointer", fontSize: 13, marginLeft: 4, whiteSpace: "nowrap" }}
              >
                + Add Box
              </button>
            </div>

            {/* Box Detail + Material Summary */}
            <div style={{ padding: "12px 24px" }}>
              {boxes.length === 0 ? (
                <div style={{ textAlign: "center", padding: 48, border: "2px dashed #e5e7eb", borderRadius: 12, color: "#6b7280" }}>
                  <p style={{ fontSize: 15, marginBottom: 16 }}>No boxes added yet.</p>
                  <button onClick={addBox}>+ Add First Box</button>
                </div>
              ) : activeBox ? (
                <div style={{ border: "1px solid #ede9fe", borderRadius: 10, padding: "10px 16px 16px", background: "#faf5ff" }}>
                  {/* Box name + delete */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <input
                      type="text"
                      value={activeBox.boxName}
                      onChange={(e) => updateBox("boxName", e.target.value)}
                      placeholder="Box name..."
                      style={{ fontWeight: 700, fontSize: 15, color: "#4c1d95", border: "1px solid #ddd6fe", borderRadius: 6, padding: "4px 10px", background: "#fff", width: 200 }}
                    />
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {confirmDeleteBoxId === activeBox.id ? (
                        <>
                          <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>Delete?</span>
                          <button onClick={() => deleteBox(activeBox.id)} style={{ background: "#dc2626", padding: "4px 10px", fontSize: 12 }}>Yes</button>
                          <button onClick={() => setConfirmDeleteBoxId(null)} style={{ background: "#6b7280", padding: "4px 10px", fontSize: 12 }}>No</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDeleteBoxId(activeBox.id)} style={{ background: "#dc2626", padding: "4px 10px", fontSize: 12 }}>Delete</button>
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

                      // subSheetId omitted/null: acts on the box itself. Given: acts on that
                      // Sub Sheet Calculation instead. Mirrors updateBox's single-field form
                      // plus a multi-field form (for setting a material + its id together).
                      const updateSheetFields = (subSheetId, fields) => {
                        if (subSheetId == null) {
                          setDraft((prev) => ({
                            ...prev,
                            boxes: prev.boxes.map((b) => b.id === activeBox.id ? { ...b, ...fields } : b),
                          }));
                          setIsDirty(true);
                        } else {
                          updateSubSheetFields(subSheetId, fields);
                        }
                      };
                      const updateSheetField = (subSheetId, field, value) => updateSheetFields(subSheetId, { [field]: value });

                      // Renders one cut-list table — shared by every sheet below.
                      const renderPartsTable = ({ parts, vars, refsMap, sheet, subSheetId, labelPrefix, matOptions, laminateOptions, extraButtons }) => (
                        <div style={{ border: "1px solid #ede9fe", borderRadius: "0 0 8px 8px", padding: "10px 10px 6px", background: "#fff" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: 8, gap: 8 }}>
                            {extraButtons}
                            <button onClick={() => addPart(subSheetId)} style={{ background: "#2563eb", padding: "4px 14px", fontSize: 12 }}>+ Add Part</button>
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
                                      No parts defined. Click "+ Add Part" to start building the cut list.
                                    </td>
                                  </tr>
                                ) : parts.map((p, i) => {
                                  const autoLabel = `${labelPrefix} ${p.partName}`.trim();
                                  const inp = (field, type = "text", width = "100%", min) => (
                                    <input
                                      type={type}
                                      value={p[field] ?? ""}
                                      onChange={(e) => updatePart(p.id, field, type === "number" ? Number(e.target.value) : e.target.value, subSheetId)}
                                      style={{ width, fontSize: 12, padding: "2px 5px", minWidth: type === "number" ? 44 : 60 }}
                                      min={min}
                                    />
                                  );
                                  const formulaInp = (field) => {
                                    const raw = String(p[field] ?? "");
                                    const isFormula = raw.includes("{");
                                    const resolved = isFormula ? resolveFormula(raw, vars) : null;
                                    const usedVars = isFormula
                                      ? [...new Set([...raw.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))]
                                      : [];
                                    const VAR_TO_FIELD = Object.fromEntries(
                                      Object.entries(refsMap).filter(([, varName]) => varName).map(([field, varName]) => [varName, field])
                                    );
                                    return (
                                      <div style={{ minWidth: 64 }}>
                                        <input
                                          type="text"
                                          value={raw}
                                          onChange={(e) => updatePart(p.id, field, e.target.value, subSheetId)}
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
                                      <td style={{ ...txtCell, textDecoration: isReq ? "none" : "line-through" }}>{inp("partName")}</td>
                                      <td style={{ ...numCell, textAlign: "center" }}>
                                        <input
                                          type="checkbox"
                                          checked={isReq}
                                          onChange={(e) => updatePart(p.id, "req", e.target.checked, subSheetId)}
                                          style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#7c3aed" }}
                                          title={isReq ? "Included in calculation" : "Excluded from calculation"}
                                        />
                                      </td>
                                      <td style={{ ...numCell, textAlign: "center" }}>
                                        <input
                                          type="checkbox"
                                          checked={p.edgeReq !== false}
                                          onChange={(e) => updatePart(p.id, "edgeReq", e.target.checked, subSheetId)}
                                          style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#059669" }}
                                          title={p.edgeReq !== false ? "Edge beading applied" : "No edge beading"}
                                        />
                                      </td>
                                      <td style={txtCell}>
                                        <select
                                          value={resolveMat(p.sideA, p.sideAId) || ""}
                                          onChange={(e) => { const name = e.target.value; const pi = (prices || []).find((pr) => pr.materialName === name); updatePartFields(p.id, { sideA: name, sideAId: pi?.id ?? null }, subSheetId); }}
                                          style={{ fontSize: 11, padding: "2px 3px", width: "100%", minWidth: 110, background: (p.sideA || p.sideAId) ? "#fef3c7" : "#fff" }}
                                        >
                                          <option value="">— None —</option>
                                          {laminateOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                      </td>
                                      <td style={txtCell}>
                                        <select
                                          value={resolveMat(p.sideB, p.sideBId) || ""}
                                          onChange={(e) => { const name = e.target.value; const pi = (prices || []).find((pr) => pr.materialName === name); updatePartFields(p.id, { sideB: name, sideBId: pi?.id ?? null }, subSheetId); }}
                                          style={{ fontSize: 11, padding: "2px 3px", width: "100%", minWidth: 110, background: (p.sideB || p.sideBId) ? "#dcfce7" : "#fff" }}
                                        >
                                          <option value="">— None —</option>
                                          {laminateOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                                        </select>
                                      </td>
                                      <td style={{ ...numCell, padding: "3px 4px" }}>{formulaInp("widthMm")}</td>
                                      <td style={{ ...numCell, padding: "3px 4px" }}>{formulaInp("heightMm")}</td>
                                      <td style={{ ...numCell, padding: "3px 4px" }}>{formulaInp("qty")}</td>
                                      <td style={txtCell}>
                                        <select
                                          value={resolveMat(p.material, p.materialId) || ""}
                                          onChange={(e) => { const name = e.target.value; const pi = (prices || []).find((pr) => pr.materialName === name); updatePartFields(p.id, { material: name, materialId: pi?.id ?? null }, subSheetId); }}
                                          style={{ fontSize: 12, padding: "2px 4px", width: "100%" }}
                                        >
                                          <option value="">— Select —</option>
                                          {[...new Set(matOptions)].filter(Boolean).map((m) => (
                                            <option key={m} value={m}>{m}</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td style={numCell}>{inp("rotation", "number", 44, 1)}</td>
                                      <td style={txtCell}>
                                        <input
                                          type="text"
                                          readOnly
                                          value={autoLabel}
                                          style={{ fontSize: 12, padding: "2px 5px", width: "100%", minWidth: 80, background: "#f3f4f6", color: "#374151", cursor: "default" }}
                                        />
                                      </td>
                                      <td style={{ ...numCell, textAlign: "center", minWidth: 70, opacity: p.edgeReq !== false ? 1 : 0.35 }}>
                                        {edgeOpen && p.edgeReq !== false ? (
                                          <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "stretch", minWidth: 130 }}>
                                            {[["T", "edgeTop", "edgeTopReq"], ["B", "edgeBottom", "edgeBottomReq"], ["L", "edgeLeft", "edgeLeftReq"], ["R", "edgeRight", "edgeRightReq"]].map(([lbl, fld, reqFld]) => {
                                              const isEdgeReq = p[reqFld] !== false;
                                              return (
                                                <div key={fld} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                  <input
                                                    type="checkbox"
                                                    checked={isEdgeReq}
                                                    onChange={(e) => updatePart(p.id, reqFld, e.target.checked, subSheetId)}
                                                    style={{ width: 13, height: 13, cursor: "pointer", accentColor: "#7c3aed", flexShrink: 0 }}
                                                    title={isEdgeReq ? `${lbl} edge required` : `${lbl} edge not required`}
                                                  />
                                                  <span style={{ fontSize: 10, fontWeight: 700, color: isEdgeReq ? "#374151" : "#9ca3af", width: 10 }}>{lbl}</span>
                                                  <input
                                                    type="number"
                                                    value={p[fld] ?? 0}
                                                    onChange={(e) => updatePart(p.id, fld, Number(e.target.value), subSheetId)}
                                                    disabled={!isEdgeReq}
                                                    style={{ width: 42, fontSize: 11, padding: "1px 3px", opacity: isEdgeReq ? 1 : 0.35 }}
                                                    min={0}
                                                  />
                                                </div>
                                              );
                                            })}
                                            <button onClick={() => setExpandedEdgeId(null)} style={{ fontSize: 10, padding: "1px 4px", background: "#e5e7eb", border: "1px solid #d1d5db", borderRadius: 4, cursor: "pointer", marginTop: 2 }}>Done</button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => setExpandedEdgeId(edgeOpen ? null : edgeKey)}
                                            title="Edit edge beading"
                                            style={{ fontSize: 10, padding: "2px 6px", background: "#ede9fe", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" }}
                                          >
                                            {[["T", "edgeTopReq"], ["B", "edgeBottomReq"], ["L", "edgeLeftReq"], ["R", "edgeRightReq"]].map(([lbl, rf]) => (
                                              <span key={lbl} style={{ color: p[rf] !== false ? "#7c3aed" : "#d1d5db", marginRight: 1 }}>{lbl}</span>
                                            ))}
                                          </button>
                                        )}
                                      </td>
                                      <td style={txtCell}>
                                        <input
                                          type="text"
                                          value={p.remarks || ""}
                                          onChange={(e) => updatePart(p.id, "remarks", e.target.value, subSheetId)}
                                          placeholder="Notes..."
                                          style={{ fontSize: 12, padding: "2px 5px", width: "100%", minWidth: 100 }}
                                        />
                                      </td>
                                      <td style={{ ...numCell, textAlign: "center" }}>
                                        <button
                                          onClick={() => deletePart(p.id, subSheetId)}
                                          style={{ background: "#dc2626", padding: "2px 7px", fontSize: 11 }}
                                          title="Delete part"
                                        >✕</button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );

                      // Renders one full sheet ("1." or "1.1", "1.2", ...): its own Box
                      // Type/Door Type row, H/W/D + Area, the Materials/Box Configuration
                      // grid, and the parts table above — a full peer of the box's own
                      // Sheet Calculation.
                      const renderSheetBlock = ({ subSheetId, sheet, numbering }) => {
                        const vars = BOX_VARS(sheet);
                        const sheetParts = sheet.parts || [];
                        const refsMap = { ...DEFAULT_REFS, ...(sheet.refs || {}) };
                        const priceLaminates = (prices || [])
                          .filter((pr) => (pr.group || "").toLowerCase() === "laminate" && pr.materialName)
                          .map((pr) => pr.materialName);
                        const sheetLaminates = [sheet.matInsideLaminate, sheet.matOutsideLaminate].filter(Boolean);
                        const existingSides = [...new Set(sheetParts.flatMap((pt) => [resolveMat(pt.sideA, pt.sideAId), resolveMat(pt.sideB, pt.sideBId)]).filter(Boolean))];
                        const laminateOptions = [...new Set([...(priceLaminates.length > 0 ? priceLaminates : sheetLaminates), ...existingSides])];
                        const matOptions = [
                          ...MATERIAL_FIELDS.map(([lbl, fld]) => {
                            const idf = `${fld}Id`;
                            const iid = sheet[idf];
                            const res = iid != null
                              ? (prices || []).find((pr) => pr.id === iid)?.materialName ?? sheet[fld]
                              : sheet[fld];
                            return res || lbl;
                          }),
                          ...(sheet.customMaterials || []).map((cm) => cm.value || cm.label).filter(Boolean),
                          ...[...new Set(sheetParts.map((pt) => resolveMat(pt.material, pt.materialId)).filter(Boolean))],
                        ];
                        const labelPrefix = sheet.shortName || sheet.name || (subSheetId == null ? (activeBox.boxName || activeBox.name || "") : "");
                        const refValues = [...Object.values(refsMap), ...(sheet.customFields || []).map((f) => f.ref)].filter(Boolean);
                        const dupSet = new Set(refValues.filter((v, _, a) => a.filter(x => x === v).length > 1));

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

                            {/* Box Type / Door Type */}
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>Box Type</label>
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
                                  {DOOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer", whiteSpace: "nowrap" }} title="Uncheck to stop this sheet's parts from being counted in Hardware & Consumables, Material Summary, and the Cut Sheet Optimizer.">
                                <input
                                  type="checkbox"
                                  checked={sheet.includeInMaterialCalc !== false}
                                  onChange={(e) => updateSheetField(subSheetId, "includeInMaterialCalc", e.target.checked)}
                                  style={{ width: 14, height: 14, cursor: "pointer" }}
                                />
                                Include in Material Calculation
                              </label>
                            </div>

                            {/* Dimensions */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                              {[["H", "heightMm"], ["W", "widthMm"], ["D", "depthMm"]].map(([lbl, key]) => {
                                const mmVal = sheet[key] ?? "";
                                const ftVal = mmVal !== "" ? roundTo2(mmToFeet(Number(mmVal))) : "";
                                const refName = refsMap[key] ?? DEFAULT_REFS[key];
                                const isDup = dupSet.has(refName);
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
                                    <span style={{ fontSize: 10, color: isDup ? "#dc2626" : "#7c3aed", fontFamily: "monospace" }}>{`{`}</span>
                                    <input
                                      type="text"
                                      value={refName}
                                      onChange={(e) => updateSheetField(subSheetId, "refs", { ...(sheet.refs || DEFAULT_REFS), [key]: e.target.value })}
                                      title={isDup ? `"${refName}" is used by multiple fields — each ref must be unique` : ""}
                                      style={{ width: 40, fontSize: 10, padding: "1px 4px", fontFamily: "monospace", color: isDup ? "#dc2626" : "#7c3aed", background: isDup ? "#fee2e2" : "#ede9fe", border: `1px solid ${isDup ? "#fca5a5" : "#ddd6fe"}`, borderRadius: 4, textAlign: "center" }}
                                    />
                                    <span style={{ fontSize: 10, color: isDup ? "#dc2626" : "#7c3aed", fontFamily: "monospace" }}>{`}`}</span>
                                  </div>
                                );
                              })}
                              <button
                                onClick={() => setDimUnit(dimUnit === "mm" ? "ft" : "mm")}
                                style={{ fontSize: 11, padding: "3px 10px", background: "#ede9fe", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: 6 }}
                              >
                                {dimUnit === "mm" ? "→ ft" : "→ mm"}
                              </button>
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

                            {/* Materials + Box Configuration side by side */}
                            <div style={{ marginTop: 8, borderTop: "1px solid #ede9fe", paddingTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

                              {/* Materials */}
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                  <tr>
                                    <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 10px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Material</th>
                                    <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 10px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Selection</th>
                                    <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 6px", width: 32 }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {MATERIAL_FIELDS.map(([label, field], i) => {
                                    const idField = `${field}Id`;
                                    const itemId = sheet[idField];
                                    const resolved = itemId != null
                                      ? (prices || []).find((p) => p.id === itemId)?.materialName ?? sheet[field]
                                      : sheet[field];
                                    const stale = itemId != null && resolved !== sheet[field] && sheet[field];
                                    return (
                                      <tr key={field} style={{ background: i % 2 === 0 ? "#f5f3ff" : "#fff" }}>
                                        <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>
                                          <input
                                            type="text"
                                            value={sheet.materialLabels?.[field] ?? label}
                                            onChange={(e) => updateSheetField(subSheetId, "materialLabels", { ...(sheet.materialLabels || {}), [field]: e.target.value })}
                                            style={{ width: "100%", fontSize: 12, padding: "3px 6px", fontWeight: 600, color: "#374151", background: "#fff" }}
                                          />
                                        </td>
                                        <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>
                                          <input
                                            type="text"
                                            value={resolved || ""}
                                            onChange={(e) => updateSheetFields(subSheetId, { [field]: e.target.value, [idField]: null })}
                                            placeholder="Select..."
                                            style={{ width: "100%", fontSize: 12, padding: "3px 6px", borderColor: stale ? "#f59e0b" : undefined }}
                                          />
                                        </td>
                                        <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", textAlign: "center" }}>
                                          <button
                                            onClick={() => setMatPicker({ field, label, subSheetId })}
                                            title="Browse item list"
                                            style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "3px 7px", fontSize: 13 }}
                                          >🔍</button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {(sheet.customMaterials || []).map((cm) => (
                                    <tr key={cm.id} style={{ background: "#fffbeb" }}>
                                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>
                                        <input
                                          type="text"
                                          value={cm.label || ""}
                                          onChange={(e) => updateSheetField(subSheetId, "customMaterials", (sheet.customMaterials || []).map((m) => m.id === cm.id ? { ...m, label: e.target.value } : m))}
                                          placeholder="Label..."
                                          style={{ width: "100%", fontSize: 12, padding: "3px 6px" }}
                                        />
                                      </td>
                                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>
                                        <input
                                          type="text"
                                          value={cm.value || ""}
                                          onChange={(e) => updateSheetField(subSheetId, "customMaterials", (sheet.customMaterials || []).map((m) => m.id === cm.id ? { ...m, value: e.target.value, itemId: null } : m))}
                                          placeholder="Select..."
                                          style={{ width: "100%", fontSize: 12, padding: "3px 6px" }}
                                        />
                                      </td>
                                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", textAlign: "center", display: "flex", gap: 4 }}>
                                        <button
                                          onClick={() => setMatPicker({ field: `customMat_${cm.id}`, label: cm.label || "Material", customMatId: cm.id, subSheetId })}
                                          title="Browse item list"
                                          style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "3px 7px", fontSize: 13 }}
                                        >🔍</button>
                                        <button
                                          onClick={() => updateSheetField(subSheetId, "customMaterials", (sheet.customMaterials || []).filter((m) => m.id !== cm.id))}
                                          style={{ background: "#dc2626", padding: "3px 7px", fontSize: 12 }}
                                          title="Remove"
                                        >✕</button>
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

                              {/* Box Configuration */}
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                                <thead>
                                  <tr>
                                    <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 10px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Field</th>
                                    <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 10px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Value</th>
                                    <th style={{ background: "#1e3a5f", color: "#fff", padding: "7px 8px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>Ref</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[
                                    ["Short Name",           "shortName",  "text",   null],
                                    ["Doors Horizontal",     "doorsH",     "number", "doorsH"],
                                    ["Doors Vertical",       "doorsV",     "number", "doorsV"],
                                    ["Back Ply Parts",       "backParts",  "number", "backParts"],
                                    ["Vertical Panels (VP)", "partitions", "number", "partitions"],
                                    ["Shelf Planks Qty",     "shelves",    "number", "shelves"],
                                  ].map(([label, field, type, refKey], i) => {
                                    const refName = refKey ? (refsMap[refKey] ?? DEFAULT_REFS[refKey]) : null;
                                    const isDup = refName != null && dupSet.has(refName);
                                    return (
                                    <tr key={field} style={{ background: i % 2 === 0 ? "#f5f3ff" : "#fff" }}>
                                      <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>
                                        <input
                                          type="text"
                                          value={sheet.fieldLabels?.[field] ?? label}
                                          onChange={(e) => updateSheetField(subSheetId, "fieldLabels", { ...(sheet.fieldLabels || {}), [field]: e.target.value })}
                                          style={{ width: "100%", fontSize: 12, padding: "3px 6px", fontWeight: 600, color: "#374151", background: "#fff" }}
                                        />
                                      </td>
                                      <td style={{ padding: "4px 10px", borderBottom: "1px solid #ede9fe" }}>
                                        <input
                                          type={type}
                                          value={sheet[field] ?? ""}
                                          onChange={(e) => updateSheetField(subSheetId, field, type === "number" ? Number(e.target.value) : e.target.value)}
                                          style={{ width: "100%", fontSize: 13, padding: "3px 8px" }}
                                          placeholder={type === "text" ? "e.g. MBR" : "0"}
                                          min={type === "number" ? 0 : undefined}
                                        />
                                      </td>
                                      <td style={{ padding: "4px 8px", borderBottom: "1px solid #ede9fe", whiteSpace: "nowrap" }}>
                                        {refName != null && (
                                          <span style={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                                            <span style={{ fontSize: 10, color: isDup ? "#dc2626" : "#7c3aed", fontFamily: "monospace" }}>{`{`}</span>
                                            <input
                                              type="text"
                                              value={refName}
                                              onChange={(e) => updateSheetField(subSheetId, "refs", { ...(sheet.refs || DEFAULT_REFS), [refKey]: e.target.value })}
                                              title={isDup ? `"${refName}" is used by multiple fields — each ref must be unique` : ""}
                                              style={{ width: 72, fontSize: 10, padding: "1px 4px", fontFamily: "monospace", color: isDup ? "#dc2626" : "#7c3aed", background: isDup ? "#fee2e2" : "#ede9fe", border: `1px solid ${isDup ? "#fca5a5" : "#ddd6fe"}`, borderRadius: 4, textAlign: "center" }}
                                            />
                                            <span style={{ fontSize: 10, color: isDup ? "#dc2626" : "#7c3aed", fontFamily: "monospace" }}>{`}`}</span>
                                          </span>
                                        )}
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
                                          <input
                                            type="text"
                                            value={cf.label || ""}
                                            onChange={(e) => updateSheetField(subSheetId, "customFields", (sheet.customFields || []).map((f) => f.id === cf.id ? { ...f, label: e.target.value } : f))}
                                            placeholder="Field label..."
                                            style={{ width: "100%", fontSize: 12, padding: "3px 6px" }}
                                          />
                                        </td>
                                        <td style={{ padding: "4px 10px", borderBottom: "1px solid #ede9fe" }}>
                                          <input
                                            type="number"
                                            value={cf.value ?? ""}
                                            onChange={(e) => updateSheetField(subSheetId, "customFields", (sheet.customFields || []).map((f) => f.id === cf.id ? { ...f, value: Number(e.target.value) } : f))}
                                            placeholder="0"
                                            style={{ width: "100%", fontSize: 13, padding: "3px 8px" }}
                                          />
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
              ) : null}

              {/* ══ SECTION 2: HARDWARE & CONSUMABLES — ALL BOXES ══ */}
              {draft && boxes.length > 0 && (() => {
                const groupOf = (mat) => (prices || []).find((p) => p.materialName === mat)?.group || "Other";
                // Every group present in Items Pricing shows up here automatically —
                // including ones added after HARDWARE_GROUPS was written — except
                // Wood/Laminate, whose quantities are finalized via Sheet Calculation
                // & Cut List instead of this hardware table.
                const dynamicGroups = Array.from(new Set([
                  ...HARDWARE_GROUPS,
                  ...(prices || []).map((p) => p.group || "").filter((g) => g && g !== "Wood" && g !== "Laminate"),
                ]));
                // Every box's rows — auto Edge Banding + auto Carpenter (same calc as
                // before, now just listed per box instead of per active-box tab) plus
                // its manually-added hardware/consumables — all tagged with their box.
                const allRows = [];
                boxes.forEach((box) => {
                  computeBoxEdgeBandingRows(box).forEach((r) => {
                    allRows.push({
                      id: `edge_${box.id}_${r.material}`, materialName: r.material, base: r.base, extra: r.extra,
                      unit: "Mtr", auto: true, autoType: "edge",
                      boxId: box.id, boxName: box.boxName || `Box ${box.id}`,
                    });
                  });
                  computeBoxCarpenterRows(box).forEach((r) => {
                    allRows.push({
                      id: `carpenter_${box.id}_${r.material}`, materialName: r.material, base: r.base, extra: r.extra,
                      unit: (prices || []).find((p) => p.materialName === r.material)?.unit || "Sq.ft",
                      auto: true, autoType: "carpenter",
                      boxId: box.id, boxName: box.boxName || `Box ${box.id}`,
                    });
                  });
                  (box.hardwareItems || []).forEach((hw) => {
                    if (hw.materialName === "Fevicol Merino") return; // now auto-calculated in Material Summary instead
                    allRows.push({
                      ...hw,
                      boxId: box.id,
                      boxName: box.boxName || `Box ${box.id}`,
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
                                        <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", color: "#6b7280", fontSize: 11 }}>{box.boxName || `Box ${box.id}`}</td>
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

              {/* ══ SECTION 4: MATERIAL SUMMARY (all boxes) ══ */}
              {draft && boxes.length > 0 && (() => {
                const summaryRows = withGroupSpan(computeMatSummary());
                // Rate for a material under one Material Models tier — the global
                // template rate if set, else the Items Pricing default rate. Same
                // resolution the Material Models page and Projects use.
                const modelRateFor = (material, model) => {
                  const modelEntry = materialModelRates?.[material]?.[model];
                  if (modelEntry?.rate) return Number(modelEntry.rate);
                  const rateData = (prices || []).find((p) => p.materialName === material);
                  return rateData ? Number(rateData.rate) : 0;
                };
                const modelTotals = { economy: 0, standard: 0, premium: 0 };
                summaryRows.forEach((row) => {
                  MODEL_KEYS.forEach((model) => {
                    modelTotals[model] += row.requiredQty * modelRateFor(row.material, model);
                  });
                });
                // Sum of every box's own Area Sft (H × W in sq ft) in this template —
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
                                {MODEL_KEYS.map((model) => (
                                  <th key={model} colSpan={2} style={{ background: MODEL_COLORS[model], color: "#fff", padding: "6px 14px", fontWeight: 700, fontSize: 11, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", borderLeft: "2px solid rgba(255,255,255,0.3)" }}>{MODEL_LABELS[model]}</th>
                                ))}
                              </tr>
                              <tr>
                                {MODEL_KEYS.map((model) => (
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
                                  {MODEL_KEYS.map((model) => {
                                    const rate = modelRateFor(row.material, model);
                                    const amount = row.requiredQty * rate;
                                    return (
                                      <Fragment key={model}>
                                        <td style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", borderLeft: "1px solid #e5e7eb", textAlign: "center", color: MODEL_COLORS[model] }}>
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
                                {MODEL_KEYS.map((model) => (
                                  <td key={model} colSpan={2} style={{ padding: "8px 14px", textAlign: "center", fontWeight: 700, color: "#fff", fontSize: 12, borderLeft: "2px solid rgba(255,255,255,0.15)" }}>
                                    {formatCurrency(modelTotals[model])}
                                  </td>
                                ))}
                              </tr>
                              <tr style={{ background: "#334e68" }}>
                                <td colSpan={2} style={{ padding: "8px 14px", fontWeight: 700, color: "#fff", fontSize: 12 }}>Total (Incl. GST {gstPercent}%)</td>
                                <td colSpan={2} style={{ padding: "8px 14px" }} />
                                {MODEL_KEYS.map((model) => (
                                  <td key={model} colSpan={2} style={{ padding: "8px 14px", textAlign: "center", fontWeight: 700, color: "#fff", fontSize: 12, borderLeft: "2px solid rgba(255,255,255,0.15)" }}>
                                    {formatCurrency(modelTotals[model] * (1 + (Number(gstPercent) || 0) / 100))}
                                  </td>
                                ))}
                              </tr>
                              <tr style={{ background: "#f1f5f9" }}>
                                <td colSpan={4} style={{ padding: "8px 14px", fontWeight: 700, color: "#374151", fontSize: 12 }}>
                                  Sft Cost (Excl. GST) <span style={{ fontWeight: 400, color: "#9ca3af" }}>(Total ÷ {roundTo2(totalAreaSft)} sqft)</span>
                                </td>
                                {MODEL_KEYS.map((model) => (
                                  <td key={model} colSpan={2} style={{ padding: "8px 14px", textAlign: "center", fontWeight: 700, color: MODEL_COLORS[model], fontSize: 12, borderLeft: "1px solid #e5e7eb" }}>
                                    {totalAreaSft > 0 ? `${formatCurrency(modelTotals[model] / totalAreaSft)}/sqft` : <span style={{ color: "#d1d5db" }}>—</span>}
                                  </td>
                                ))}
                              </tr>
                              <tr style={{ background: "#e5e7eb" }}>
                                <td colSpan={4} style={{ padding: "8px 14px", fontWeight: 700, color: "#374151", fontSize: 12 }}>
                                  Sft Cost (Incl. GST {gstPercent}%) <span style={{ fontWeight: 400, color: "#9ca3af" }}>(Total ÷ {roundTo2(totalAreaSft)} sqft)</span>
                                </td>
                                {MODEL_KEYS.map((model) => (
                                  <td key={model} colSpan={2} style={{ padding: "8px 14px", textAlign: "center", fontWeight: 700, color: MODEL_COLORS[model], fontSize: 12, borderLeft: "1px solid #e5e7eb" }}>
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

            {/* Save bar — sticky at bottom when dirty */}
            {isDirty && (
              <div style={{ position: "sticky", bottom: 0, background: "#fffbeb", borderTop: "1px solid #fde68a", padding: "10px 24px", display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#92400e" }}>You have unsaved changes.</span>
                <button
                  onClick={() => { setDraft(JSON.parse(JSON.stringify(savedTemplate))); setIsDirty(false); }}
                  style={{ background: "#6b7280", padding: "7px 16px", fontSize: 13 }}
                >
                  Discard
                </button>
                <button onClick={saveTemplate} style={{ background: "#059669", padding: "7px 18px", fontSize: 13, fontWeight: 600 }}>
                  💾 Save Template
                </button>
              </div>
            )}
          </>
          )}
        </div>
      )}

      {/* ── Cut Sheet Optimizer Modal (active box) ── */}
      {cutSheetOpen && activeBox && (
        <CutSheetOptimizer
          rows={generateCutSheet()}
          title={activeBox.boxName || ""}
          subtitle={`Template · ${activeBox.widthMm || ""}W × ${activeBox.heightMm || ""}H mm`}
          onClose={() => setCutSheetOpen(false)}
        />
      )}

      {/* ── Cut Sheet Optimizer Modal (all boxes) ── */}
      {allCutSheetOpen && draft && (
        <CutSheetOptimizer
          rows={generateAllBoxesCutSheet()}
          title={draft.templateName || "All Boxes"}
          subtitle={`All Boxes · ${(draft.boxes || []).length} box${(draft.boxes || []).length !== 1 ? "es" : ""}`}
          onClose={() => setAllCutSheetOpen(false)}
        />
      )}

      {/* ── New Template Modal ── */}
      {showNewModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 420, maxWidth: "96vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 20px" }}>New Template</h3>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Template Name *</label>
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createTemplate();
                  if (e.key === "Escape") setShowNewModal(false);
                }}
                placeholder="e.g. Master Bed Room"
                style={{ width: "100%", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowNewModal(false)} style={{ background: "#6b7280", padding: "8px 18px" }}>Cancel</button>
              <button onClick={createTemplate} style={{ padding: "8px 18px" }}>Create Template</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Item Picker Modal ── */}
      {matPicker && (
        <ItemPickerModal
          label={matPicker.label}
          prices={prices}
          onSelect={(name, id) => {
            const f = matPicker.field;
            const subSheetId = matPicker.subSheetId ?? null;
            if (matPicker.customMatId != null) {
              const sheetObj = subSheetId == null ? activeBox : (activeBox.subSheets || []).find((s) => s.id === subSheetId);
              const updated = (sheetObj?.customMaterials || []).map((m) =>
                m.id === matPicker.customMatId ? { ...m, value: name, itemId: id } : m
              );
              if (subSheetId == null) updateBox("customMaterials", updated);
              else updateSubSheet(subSheetId, "customMaterials", updated);
            } else if (subSheetId == null) {
              setDraft((prev) => ({
                ...prev,
                boxes: prev.boxes.map((b) =>
                  b.id === activeBox.id ? { ...b, [f]: name, [`${f}Id`]: id } : b
                ),
              }));
              setIsDirty(true);
            } else {
              updateSubSheetFields(subSheetId, { [f]: name, [`${f}Id`]: id });
            }
            setMatPicker(null);
          }}
          onClose={() => setMatPicker(null)}
        />
      )}

      {hardwarePicker && (
        <ItemPickerModal
          label="Hardware & Consumables"
          prices={prices}
          initialGroup={hardwarePicker.group}
          onSelect={(name, id) => {
            const boxId = hardwarePicker.boxId ?? activeBox?.id;
            if (hardwarePicker.hwId != null) {
              updateHardwareItemFields(boxId, hardwarePicker.hwId, { materialName: name, materialId: id });
            } else {
              addHardwareItem(boxId, { materialName: name, materialId: id });
            }
            setHardwarePicker(null);
          }}
          onClose={() => setHardwarePicker(null)}
        />
      )}

      {cropSrc && (
        <TemplateImageCropModal
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropSrc(null)}
        />
      )}
    </div>
  );
}

export default TemplateMaster;
