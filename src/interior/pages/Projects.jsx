import { useState, useEffect, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { formatCurrency, mmToFeet, feetToMm, roundTo2 } from "../utils/unitConversions";
import { WARDROBE_SERVICE, SERVICES, MEASURE_LABELS, SERVICE_NAMES, serviceOf, boxQty, ALL_SERVICES, matchesService, serviceTagOf, serviceForGroup } from "../utils/services";
import ServiceFilter from "../components/ServiceFilter";
import { useAuth } from "@/context/AuthContext";
import { quotationMaterialRows } from "../utils/quotationMaterials";
import { canTab, isOwner, setProjectLock } from "../utils/access";
import AddServiceModal from "../components/AddServiceModal";
import CutSheetOptimizer from "./CutSheetOptimizer";
import NumInput from "../components/NumInput";
import RequirementsPanel from "../components/RequirementsPanel";
import ProjectQuotation from "./ProjectQuotation";
import { packSheets, findOversizedPieces } from "../utils/binPack";
import { TAPE_ITEM } from "../utils/projectRows";
import { calcFor, materialCalcGlobals, isMaterialCalcUniversal } from "../utils/materialCalc";
import { kerfFor, isKerfUniversal } from "../utils/kerf";
import { GROUP_OPTIONS } from "../data/priceData";
import { PROJECT_STATUSES, projectStatusInfo } from "../data/projectStatus";
import { LEAD_SOURCES, leadSourceLabel } from "../data/leadSource";
import ProjectDesignTab from "../components/ProjectDesignTab";
import MaterialModelPicker from "../components/MaterialModelPicker";
import { useSheetClipboard } from "../utils/sheetClipboard";

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

// Copies text to the clipboard, falling back to a hidden-textarea + execCommand
// for contexts where navigator.clipboard is unavailable (e.g. non-HTTPS).
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

// A "{H}"-style formula reference chip — click to copy "{H}" to the
// clipboard (paste with Ctrl+V into any formula field), or drag it onto a
// W (mm)/H (mm)/Qty field to insert it at the drop point directly. Dragging
// is mouse-only; copy/paste covers touch devices and anyone who'd rather not
// drag.
function RefChip({ label, style: extraStyle }) {
  const [status, setStatus] = useState(null); // null | "copied" | "failed"
  const text = `{${label}}`;
  const handleCopy = async (e) => {
    e.stopPropagation();
    const ok = await copyToClipboard(text);
    setStatus(ok ? "copied" : "failed");
    setTimeout(() => setStatus(null), 1200);
  };
  const label_ = status === "copied" ? "✓ Copied" : status === "failed" ? "✕ Copy failed" : text;
  const color = status === "copied" ? "#059669" : status === "failed" ? "#dc2626" : "#7c3aed";
  const background = status === "copied" ? "#d1fae5" : status === "failed" ? "#fee2e2" : "#ede9fe";
  return (
    <span
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", text); e.dataTransfer.effectAllowed = "copy"; }}
      onClick={handleCopy}
      title={status === "copied" ? "Copied!" : status === "failed" ? "Couldn't access the clipboard — try dragging the chip instead" : `Click to copy "${text}", or drag it into a formula field`}
      style={{
        fontSize: 10, fontFamily: "monospace", padding: "1px 6px", borderRadius: 4,
        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", transition: "background 0.15s, color 0.15s",
        color, background,
        ...extraStyle,
      }}
    >{label_}</span>
  );
}

// The "⠿" grip next to an editable {ref} box — drag it into a formula field, or
// click to copy "{ref}" to the clipboard.
function GripChip({ refName }) {
  const [status, setStatus] = useState(null); // null | "copied" | "failed"
  const text = `{${refName}}`;
  const handleCopy = async (e) => {
    e.stopPropagation();
    const ok = await copyToClipboard(text);
    setStatus(ok ? "copied" : "failed");
    setTimeout(() => setStatus(null), 1200);
  };
  const glyph = status === "copied" ? "✓" : status === "failed" ? "✕" : "⠿";
  const color = status === "copied" ? "#059669" : status === "failed" ? "#dc2626" : "#7c3aed";
  return (
    <span
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", text); e.dataTransfer.effectAllowed = "copy"; }}
      onClick={handleCopy}
      title={status === "copied" ? "Copied!" : status === "failed" ? "Couldn't access the clipboard — try dragging instead" : `Click to copy "${text}", or drag into a formula field`}
      style={{ fontSize: 11, color, cursor: "pointer", userSelect: "none", padding: "0 2px" }}
    >{glyph}</span>
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
  "customMaterials", "materialLabels", "fieldLabels",
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
function TemplatePickerModal({ templates = [], folders = [], onSelect, onClose }) {
  const [q, setQ] = useState("");
  const [folderId, setFolderId] = useState(null); // folder being browsed (null = top level)
  const [svc, setSvc] = useState("All");
  const searching = q.trim() !== "";

  // Same folder structure as the Templates page: a template sits in the
  // folder named by its folderId; a missing/deleted folder means top level.
  const folderById = (id) => folders.find((f) => f.id === id) || null;
  const activeFolderId = folderId !== null && folderById(folderId) ? folderId : null;
  const templateFolderOf = (t) => (t.folderId != null && folderById(t.folderId) ? t.folderId : null);
  const subfoldersOf = (id) => folders.filter((f) => (f.parentId ?? null) === id);
  const folderPath = (id) => {
    const path = [];
    let f = folderById(id);
    while (f) { path.unshift(f); f = f.parentId != null ? folderById(f.parentId) : null; }
    return path;
  };
  const deepTemplateCount = (id) =>
    templates.filter((t) => templateFolderOf(t) === id).length +
    subfoldersOf(id).reduce((n, f) => n + deepTemplateCount(f.id), 0);
  const coverImageOf = (f) => {
    const t = f.coverTemplateId != null ? templates.find((x) => x.id === f.coverTemplateId) : null;
    return t && templateFolderOf(t) === f.id ? t.templateImage || null : null;
  };

  // Searching looks through every folder (flat); otherwise just this folder.
  const filtered = (searching
    ? templates.filter((t) => (t.templateName || "").toLowerCase().includes(q.toLowerCase()))
    : templates.filter((t) => templateFolderOf(t) === activeFolderId)).filter((t) => matchesService(t, svc));
  const svcCounts = Object.fromEntries(ALL_SERVICES.map((s) => [s, templates.filter((t) => serviceTagOf(t) === s).length]));
  const visibleFolders = searching ? [] : subfoldersOf(activeFolderId);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 28, width: 680, maxWidth: "95vw", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Apply a Template to this Room</h3>
          <button onClick={onClose} style={{ background: "#6b7280", padding: "5px 12px", fontSize: 13 }}>✕</button>
        </div>
        <input autoFocus type="text" placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
        <ServiceFilter value={svc} onChange={setSvc} counts={svcCounts} style={{ marginBottom: 12 }} />
        {!searching && folders.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 13, marginBottom: 12 }}>
            {[{ id: null, name: "Templates" }, ...folderPath(activeFolderId)].map((f, i, arr) => (
              <span key={f.id ?? "root"} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <span style={{ color: "#d1d5db" }}>/</span>}
                {i === arr.length - 1 ? (
                  <span style={{ fontWeight: 700, color: "#111827" }}>{f.name}</span>
                ) : (
                  <button onClick={() => setFolderId(f.id)} style={{ background: "none", border: "none", color: "#2563eb", padding: 0, fontSize: 13, cursor: "pointer" }}>{f.name}</button>
                )}
              </span>
            ))}
          </div>
        )}
        {filtered.length === 0 && visibleFolders.length === 0 && (
          <p style={{ color: "#9ca3af", fontSize: 13 }}>
            {searching ? "No templates found." : activeFolderId ? "This folder is empty." : "No templates found. Create one in Template Master."}
          </p>
        )}
        <div style={{ overflowY: "auto", flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gridAutoRows: "max-content", gap: 12, alignContent: "start" }}>
          {visibleFolders.map((f) => {
            const cover = coverImageOf(f);
            const count = deepTemplateCount(f.id);
            return (
              <div
                key={f.id}
                onClick={() => setFolderId(f.id)}
                style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", cursor: "pointer", textAlign: "center", background: "#fffbeb" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#f59e0b")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
              >
                {cover ? (
                  <img src={cover} alt="" style={{ width: "100%", aspectRatio: 4 / 3, objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", aspectRatio: 4 / 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, borderBottom: "1px solid #fef3c7" }}>📁</div>
                )}
                <div style={{ padding: "10px 12px 12px" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>📁 {f.name}</div>
                  <div style={{ fontSize: 11, color: "#6b7280" }}>{count} template{count !== 1 ? "s" : ""}</div>
                </div>
              </div>
            );
          })}
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
  const [showAll, setShowAll] = useState(false); // false = only the material that was clicked

  const allGroups = ["All", ...Array.from(new Set([
    ...GROUP_OPTIONS,
    ...(prices || []).map((p) => p.group || "").filter(Boolean),
  ]))];

  const q = search.toLowerCase();
  const results = (prices || []).filter((p) => {
    const grp = p.group || "";
    const matchTab = filterGroup === "All" || grp === filterGroup;
    const matchSearch = q
      ? (p.materialName || "").toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.group || "").toLowerCase().includes(q) ||
        (p.materialSpec || "").toLowerCase().includes(q)
      : showAll || !materialName || p.materialName === materialName;
    return matchTab && matchSearch;
  })
    // Cheapest first; items with no rate yet go last.
    .sort((x, y) => (Number(x.rate) > 0 ? Number(x.rate) : Infinity) - (Number(y.rate) > 0 ? Number(y.rate) : Infinity) || 0);

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
        {!search && materialName && (
          <div style={{ padding: "6px 16px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
            {showAll ? "Showing every material in this group." : <>Showing only <strong>{materialName}</strong>.</>}{" "}
            <button type="button" onClick={() => setShowAll(!showAll)} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, padding: 0 }}>
              {showAll ? `Show only ${materialName}` : "Show all materials"}
            </button>
          </div>
        )}
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
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{[p.group, p.materialSpec, p.unit].filter(Boolean).join(" · ")}</div>
                  {(p.brand || Number(p.warranty) > 0) && (
                    <div style={{ fontSize: 12, marginTop: 1, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {p.brand && <span style={{ fontWeight: 700, color: "#1e3a5f" }}>{p.brand}</span>}
                      {Number(p.warranty) > 0 && <span style={{ color: "#b45309", background: "#fef3c7", borderRadius: 10, padding: "0 7px", fontSize: 11 }}>Warranty: {p.warranty} yr{Number(p.warranty) === 1 ? "" : "s"}</span>}
                    </div>
                  )}
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

// Service work in the project (False Ceiling, Electrical, ...) as analysis rows:
// one line per service + Items Pricing item, quantities summed across rooms —
// the same boxes and quantities the Quotation prices.
function serviceAnalysisRows(rooms) {
  const acc = new Map();
  (rooms || []).forEach((room) => (room.boxes || []).forEach((box) => {
    if (!serviceOf(box) || box.includeInQuotation === false) return;
    const { qty, unit } = boxQty(box);
    const material = box.serviceItem || "— no item picked —";
    const key = `${box.serviceType}::${material}`;
    const cur = acc.get(key) || { service: box.serviceType, group: box.serviceType, material, requiredQty: 0, unit };
    cur.requiredQty = Math.round((cur.requiredQty + qty) * 100) / 100;
    acc.set(key, cur);
  }));
  return [...acc.values()];
}

// ─── Analysis — Material Models + Summary (with and without rates) in one table ─
// One row per material the project needs (the Summary's quantity), with each
// pricing model's brand + rate (the Material Models tab) sitting next to the
// amount it produces, so a brand/rate decision and its cost are read — and
// changed — in the same place. Rates resolve exactly as the Quotation does:
// a brand tied to an Items Pricing row uses that row's current rate, a
// hand-typed rate keeps its own, and a material with neither falls back to its
// first Items Pricing row.
//   canSeeRates false → quantities only (the old "Summary (No Rates)")
//   canEdit false     → brands/rates are read-only
function ProjectAnalysis({ rows, project, prices, globalRates, setProjects, canSeeRates = true, canEdit = true }) {
  const [activeService, setActiveService] = useState("All");
  const [activeGroup, setActiveGroup] = useState("All");
  const [hideSame, setHideSame] = useState(false);
  const [showUnused, setShowUnused] = useState(false);
  const [ratesOn, setRatesOn] = useState(true);
  const [basis, setBasis] = useState("excl"); // rate/amount shown excl. or incl. GST
  const [nameQ, setNameQ] = useState("");
  const [groupQ, setGroupQ] = useState("");
  const [picker, setPicker] = useState(null); // { material, model, group }
  const [resetConfirm, setResetConfirm] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const rates = project.materialModelRates || {};
  const showRates = canSeeRates && ratesOn;
  const globalHasRates = Object.keys(globalRates || {}).length > 0;

  // Materials the project doesn't use yet can be listed (quantity 0) so their
  // brand/rate per model can be set ahead of time — what Material Models was for.
  const allRows = (() => {
    if (!showUnused || !showRates) return rows || [];
    const used = new Set((rows || []).map((r) => r.material));
    const seen = new Set();
    const extra = [];
    (prices || []).forEach((p) => {
      if (!p.materialName || used.has(p.materialName) || seen.has(p.materialName)) return;
      seen.add(p.materialName);
      const g = p.group || p.category || "Other";
      extra.push({ material: p.materialName, group: g, requiredQty: 0, unit: p.unit || "", service: serviceForGroup(g), unused: true });
    });
    return [...(rows || []), ...extra];
  })();

  const resolve = (material, model, qty) => {
    const cell = rates[material]?.[model] || {};
    const sameName = (prices || []).filter((p) => p.materialName === material);
    const linked = (cell.priceId && sameName.find((p) => p.id === cell.priceId))
      || (cell.brand && sameName.find((p) => (p.brand || "").trim().toLowerCase() === cell.brand.trim().toLowerCase()))
      || null;
    const fallback = sameName[0] || null;
    const own = Number(cell.baseRate || cell.rate) || 0;
    const source = linked || (own ? null : fallback);
    const rate = linked ? (Number(linked.rate) || 0) : own || (fallback ? Number(fallback.rate) || 0 : 0);
    const gst = linked ? Number(linked.gst ?? 18)
      : own ? (cell.gst !== undefined && cell.gst !== "" ? Number(cell.gst) : 18)
      : fallback ? Number(fallback.gst ?? 18) : 18;
    const amount = qty * rate;
    return {
      brand: cell.brand || source?.brand || "",
      cellBrand: cell.brand || "",
      rate, gst, amount, inclAmount: amount * (1 + gst / 100),
      linked: !!linked,            // follows Items Pricing — edit the rate there
      isDefault: !linked && !own,  // nothing set for this model: Items Pricing's first row
    };
  };

  const costed = allRows.map((row) => {
    const m = {};
    PROJ_MODELS.forEach((model) => { m[model] = resolve(row.material, model, row.requiredQty); });
    return { ...row, m };
  });
  const groupStd = {};
  costed.forEach((r) => { groupStd[r.group] = (groupStd[r.group] || 0) + r.m.standard.amount; });
  const sorted = [...costed].sort((a, b) =>
    (a.unused ? 1 : 0) - (b.unused ? 1 : 0) ||
    (groupStd[b.group] - groupStd[a.group]) || (b.m.standard.amount - a.m.standard.amount));

  // Service tabs: wardrobe materials plus each service's own lines.
  const svcOf = (r) => r.service || WARDROBE_SERVICE;
  const service = activeService === "All" || ALL_SERVICES.includes(activeService) ? activeService : "All";
  const svcCounts = {};
  sorted.forEach((r) => { svcCounts[svcOf(r)] = (svcCounts[svcOf(r)] || 0) + 1; });
  const inService = sorted.filter((r) => service === "All" || svcOf(r) === service);

  const groups = ["All", ...Array.from(new Set(inService.map((r) => r.group)))];
  const isSame = (r) => {
    const rs = PROJ_MODELS.map((mo) => r.m[mo].rate);
    return rs.every((x) => x > 0) && rs.every((x) => x === rs[0]);
  };
  const samePricedCount = inService.filter(isSame).length;
  const visible = inService
    .filter((r) => activeGroup === "All" || r.group === activeGroup)
    .filter((r) => !groupQ || r.group.toLowerCase().includes(groupQ.toLowerCase()))
    .filter((r) => !nameQ || r.material.toLowerCase().includes(nameQ.toLowerCase()))
    .filter((r) => !hideSame || !showRates || !isSame(r));
  const tableRows = withGroupSpan(visible);

  const totals = (list) => {
    const t = {};
    PROJ_MODELS.forEach((mo) => { t[mo] = { excl: 0, incl: 0 }; });
    list.forEach((r) => PROJ_MODELS.forEach((mo) => { t[mo].excl += r.m[mo].amount; t[mo].incl += r.m[mo].inclAmount; }));
    return t;
  };
  const grand = totals(visible);
  const pick = (t, mo) => (basis === "incl" ? t[mo].incl : t[mo].excl);

  // Typing a rate keeps the cell's brand/GST; it only applies to a rate that is
  // not tied to an Items Pricing row.
  const setCell = (material, model, patch) => {
    setProjects((prev) => prev.map((p) => {
      if (p.id !== project.id) return p;
      const current = p.materialModelRates || {};
      const matRates = current[material] || emptyProjRates();
      const cell = matRates[model] || emptyM();
      return { ...p, materialModelRates: { ...current, [material]: { ...matRates, [model]: { ...cell, ...patch } } } };
    }));
  };
  const onRate = (material, model, typed, gstNow) => {
    // What was typed is excl. GST, or incl. GST when that basis is selected.
    const base = typed === "" ? "" : String(basis === "incl" ? roundTo2(Number(typed) / (1 + gstNow / 100)) : typed);
    const n = Number(base) || 0;
    setCell(material, model, {
      baseRate: base, rate: base, gst: String(gstNow),
      rateWithGst: n > 0 ? String(roundTo2(n * (1 + gstNow / 100))) : "",
    });
  };
  const onGst = (material, model, value, rateNow) => {
    const g = Number(value) || 0;
    setCell(material, model, {
      baseRate: rateNow > 0 ? String(rateNow) : "", rate: rateNow > 0 ? String(rateNow) : "", gst: value,
      rateWithGst: rateNow > 0 ? String(roundTo2(rateNow * (1 + g / 100))) : "",
    });
  };
  const onPick = (priceItem) => {
    const { material, model } = picker;
    const gst = priceItem.gst ?? 18;
    const baseRate = priceItem.rate > 0 ? String(priceItem.rate) : "";
    setProjects((prev) => prev.map((p) => {
      if (p.id !== project.id) return p;
      const current = p.materialModelRates || {};
      const matRates = current[material] || emptyProjRates();
      return {
        ...p,
        materialModelRates: {
          ...current,
          [material]: { ...matRates, [model]: { brand: priceItem.brand || "", baseRate, rate: baseRate, gst: String(gst), rateWithGst: baseRate ? String(roundTo2(Number(baseRate) * (1 + gst / 100))) : "", priceId: priceItem.id } },
        },
      };
    }));
    setPicker(null);
  };
  const resetToGlobal = () => {
    const snapshot = JSON.parse(JSON.stringify(globalRates || {}));
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, materialModelRates: snapshot } : p)));
    setResetConfirm(false);
  };

  const th = { background: "#1e3a5f", color: "#fff", padding: "8px 10px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
  const sub = { background: "#1e3a5f", color: "#cbd5e1", padding: "5px 8px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", whiteSpace: "nowrap", textAlign: "center" };
  const td = { padding: "6px 8px", borderBottom: "1px solid #e5e7eb", fontSize: 12 };
  const inp = { fontSize: 11, padding: "3px 5px", borderRadius: 5, border: "1px solid #d1d5db", boxSizing: "border-box" };
  const search = { padding: "6px 10px", fontSize: 12, borderRadius: 8, border: "1px solid #d1d5db", width: 130, boxSizing: "border-box" };
  const money = (n) => (n > 0 ? formatCurrency(n) : <span style={{ color: "#d1d5db" }}>—</span>);
  const leadCols = 4;

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ marginBottom: 12, position: "relative" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
          Material Analysis
          <button
            type="button" onClick={() => setHelpOpen((v) => !v)} aria-label="How this table works" title="How this table works"
            style={{ width: 20, height: 20, borderRadius: "50%", border: "1px solid #9ca3af", background: helpOpen ? "#1e3a5f" : "#fff", color: helpOpen ? "#fff" : "#6b7280", fontSize: 12, fontWeight: 700, lineHeight: 1, padding: 0, cursor: "pointer" }}
          >?</button>
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
          {canSeeRates ? "What this project needs, and what each pricing model costs." : "What this project needs, by group and unit."}
        </p>
        {helpOpen && (
          <>
            <div onClick={() => setHelpOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div role="dialog" style={{ position: "absolute", top: 26, left: 0, zIndex: 41, width: 420, maxWidth: "92vw", background: "#fff", border: "1px solid #d1d5db", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.18)", padding: "12px 14px", fontSize: 12.5, color: "#374151", lineHeight: 1.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <strong style={{ fontSize: 13 }}>How this table works</strong>
                <button type="button" onClick={() => setHelpOpen(false)} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 15, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>
                <li>Each row is a material (or service item) the project needs, with its quantity — counted the same way as the Quotation, so the totals match it.</li>
                {canSeeRates && (
                  <>
                    <li>For Economy, Standard and Premium you see the brand and rate chosen and the amount it gives. Pick a brand with 🔍 or type a rate and the amounts move with it.</li>
                    <li><b style={{ color: "#b45309" }}>Amber brand</b> — differs from the global Material Models template (hover to see it).</li>
                    <li><i style={{ color: "#9ca3af" }}>Grey italic</i> — nothing set for that model, so the first Items Pricing row is used.</li>
                    <li>A grey rate box is tied to an Items Pricing row — change it there. A white box is this project's own rate (with its GST %).</li>
                    <li>Excl. / Incl. GST changes the rates and amounts shown. <b>Include unused materials</b> lists items the project doesn't use yet so you can set their rates ahead of time.</li>
                    <li>Untick <b>Show rates</b> for a quantities-only view.</li>
                  </>
                )}
                <li>The service tabs separate wardrobe materials from each service's items.</li>
              </ul>
            </div>
          </>
        )}
      </div>

      <ServiceFilter
        value={service}
        onChange={(v) => { setActiveService(v); setActiveGroup("All"); }}
        counts={svcCounts}
        style={{ marginBottom: 10 }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 0", borderBottom: "2px solid #e5e7eb", marginBottom: 10 }}>
        {groups.map((g) => {
          const active = activeGroup === g;
          return (
            <button key={g} onClick={() => setActiveGroup(g)} style={{
              padding: "6px 13px", fontSize: 12, fontWeight: active ? 700 : 500, border: "none",
              borderBottom: active ? "3px solid #2563eb" : "3px solid transparent", borderRadius: "6px 6px 0 0",
              background: "transparent", color: active ? "#2563eb" : "#6b7280", cursor: "pointer", whiteSpace: "nowrap", marginBottom: -2,
            }}>{g}</button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <input type="text" placeholder="Group…" value={groupQ} onChange={(e) => setGroupQ(e.target.value)} style={search} />
        <input type="text" placeholder="Name…" value={nameQ} onChange={(e) => setNameQ(e.target.value)} style={search} />
        {canSeeRates && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", cursor: "pointer" }} title="Untick to see quantities only, without any rate or amount">
            <input type="checkbox" checked={ratesOn} onChange={(e) => setRatesOn(e.target.checked)} /> Show rates
          </label>
        )}
        {showRates && (
          <>
            <span style={{ display: "inline-flex", border: "1px solid #d1d5db", borderRadius: 8, overflow: "hidden" }} title="Show rates and amounts excluding or including GST">
              {[["excl", "Excl. GST"], ["incl", "Incl. GST"]].map(([k, label]) => (
                <button key={k} onClick={() => setBasis(k)} style={{ border: "none", borderRadius: 0, padding: "5px 10px", fontSize: 12, cursor: "pointer", background: basis === k ? "#1e3a5f" : "#f9fafb", color: basis === k ? "#fff" : "#374151" }}>{label}</button>
              ))}
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", cursor: "pointer" }}>
              <input type="checkbox" checked={hideSame} onChange={(e) => setHideSame(e.target.checked)} />
              Hide same-priced{samePricedCount > 0 ? ` (${samePricedCount})` : ""}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", cursor: "pointer" }} title="Also list Items Pricing materials this project doesn't use yet, so their brand and rate per model can be set ahead of time">
              <input type="checkbox" checked={showUnused} onChange={(e) => setShowUnused(e.target.checked)} /> Include unused materials
            </label>
          </>
        )}
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{visible.length} item{visible.length !== 1 ? "s" : ""}</span>
        {showRates && canEdit && (
          <button onClick={() => setResetConfirm(true)} style={{ marginLeft: "auto", background: "#dc2626", padding: "6px 12px", fontSize: 12 }}>↺ Reset to Global Template</button>
        )}
      </div>
      {showRates && canEdit && !globalHasRates && (
        <div style={{ fontSize: 11, color: "#854d0e", background: "#fef9c3", border: "1px solid #fde047", borderRadius: 6, padding: "4px 10px", marginBottom: 10 }}>
          No global template yet — go to Configure → Material Models, save rates, then Reset here.
        </div>
      )}

      {tableRows.length === 0 ? (
        <div style={{ padding: "16px 14px", color: "#9ca3af", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 8 }}>
          {sorted.length === 0 ? "No materials or services assigned across any room yet." : "Nothing to show with these filters."}
        </div>
      ) : (
        // The table scrolls inside its own box, so its heading (Group / Material / Qty /
        // the three models) stays put while you scroll through the materials.
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "auto", maxHeight: "calc(100vh - 230px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: showRates ? 1180 : 480 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 3 }}>
              {showRates && (
                <tr>
                  <th colSpan={leadCols} style={{ background: "#f1f5f9", color: "#374151", padding: "8px 12px", textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e5e7eb" }}>
                    Grand Total <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>· incl. GST{activeService !== "All" || activeGroup !== "All" || hideSame || groupQ || nameQ ? " · filtered rows" : ""}</span>
                  </th>
                  {PROJ_MODELS.map((mo) => (
                    <th key={mo} colSpan={3} style={{ background: "#fff", color: PROJ_MODEL_COLORS[mo], padding: "8px 12px", textAlign: "center", fontSize: 17, fontWeight: 800, borderTop: `3px solid ${PROJ_MODEL_COLORS[mo]}`, borderLeft: "2px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>
                      {formatCurrency(grand[mo].incl)}
                    </th>
                  ))}
                  <th style={{ background: "#f1f5f9", borderLeft: "2px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }} />
                </tr>
              )}
              <tr>
                {["Group", "Material", "Qty", "UOM"].map((h, i) => <th key={h} rowSpan={showRates ? 2 : 1} style={{ ...th, textAlign: i < 2 ? "left" : "center" }}>{h}</th>)}
                {showRates && PROJ_MODELS.map((mo) => (
                  <th key={mo} colSpan={3} style={{ ...th, background: PROJ_MODEL_COLORS[mo], textAlign: "center", borderLeft: "2px solid rgba(255,255,255,0.3)" }}>{PROJ_MODEL_LABELS[mo]}</th>
                ))}
                {showRates && <th rowSpan={2} style={{ ...th, textAlign: "center", borderLeft: "2px solid rgba(255,255,255,0.3)" }}>Premium vs Economy</th>}
              </tr>
              {showRates && (
                <tr>
                  {PROJ_MODELS.map((mo) => (
                    <Fragment key={mo}>
                      <th style={{ ...sub, borderLeft: "2px solid rgba(255,255,255,0.15)" }}>Brand</th>
                      <th style={sub}>Rate{basis === "incl" ? " +GST" : ""}</th>
                      <th style={sub}>Amount</th>
                    </Fragment>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {tableRows.map((row, i) => {
                const last = i === tableRows.length - 1 || tableRows[i + 1].group !== row.group;
                const eco = row.m.economy.amount, prem = row.m.premium.amount;
                return (
                  <Fragment key={`${row.group}::${row.material}::${row.boxLabel || ""}`}>
                    <tr style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff", opacity: row.unused ? 0.75 : 1 }}>
                      {row._groupFirst && <td rowSpan={row._groupSpan} style={{ ...td, borderRight: "1px solid #e5e7eb", color: "#6b7280", verticalAlign: "top", background: "#fff" }}>{row.group}</td>}
                      <td style={{ ...td, fontWeight: 600, color: "#111827" }}>
                        {row.material}
                        {row.boxLabel && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "#6b7280" }}>— {row.boxLabel}</span>}
                        {row.unused && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: "#9ca3af" }}>not used</span>}
                      </td>
                      <td style={{ ...td, textAlign: "center", fontWeight: 700, color: "#374151" }}>{row.requiredQty}</td>
                      <td style={{ ...td, textAlign: "center", color: "#6b7280" }}>{row.unit}</td>
                      {showRates && PROJ_MODELS.map((mo) => {
                        const c = row.m[mo];
                        // Same warning Material Models gives: this project's brand
                        // for the model differs from the global template's.
                        const globalBrand = globalRates?.[row.material]?.[mo]?.brand || "";
                        const brandDiffers = globalBrand !== "" && c.cellBrand !== globalBrand;
                        const shownRate = c.rate > 0 ? roundTo2(basis === "incl" ? c.rate * (1 + c.gst / 100) : c.rate) : "";
                        return (
                          <Fragment key={mo}>
                            <td style={{ ...td, borderLeft: "1px solid #e5e7eb", minWidth: 120 }}>
                              <div
                                title={brandDiffers ? `Global template: "${globalBrand}"` : undefined}
                                style={{ display: "flex", gap: 3, alignItems: "center", ...(brandDiffers ? { background: "#fef3c7", border: "1px solid #f59e0b", boxShadow: "0 0 0 2px #fde68a", borderRadius: 6, padding: "2px 3px" } : null) }}
                              >
                                <span style={{ flex: 1, fontWeight: 600, color: c.isDefault ? "#9ca3af" : PROJ_MODEL_COLORS[mo], fontStyle: c.isDefault ? "italic" : "normal", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.isDefault ? "No brand set for this model — using the first Items Pricing row" : c.brand}>
                                  {c.brand || "—"}
                                </span>
                                {canEdit && (
                                  <button title="Pick from Items Pricing" onClick={() => setPicker({ material: row.material, model: mo, group: row.group })}
                                    style={{ background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 5, padding: "0 5px", cursor: "pointer", fontSize: 12, color: "#6b7280", flexShrink: 0 }}>🔍</button>
                                )}
                              </div>
                            </td>
                            <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }}>
                              <input type="number" placeholder="0.00" value={shownRate}
                                readOnly={c.linked || !canEdit}
                                title={c.linked ? "From Items Pricing — edit it there" : c.isDefault ? "Default from Items Pricing; type a rate to override for this model" : `Rate (${basis === "incl" ? "incl" : "excl"} GST)`}
                                onChange={(e) => onRate(row.material, mo, e.target.value, c.gst)}
                                style={{ ...inp, width: 74, textAlign: "right", background: c.linked || !canEdit ? "#f3f4f6" : "#fff", color: c.isDefault ? "#9ca3af" : "#111827" }} />
                              {!c.linked && (
                                <input type="number" placeholder="18" value={c.gst} readOnly={!canEdit} title="GST % for this hand-typed rate"
                                  onChange={(e) => onGst(row.material, mo, e.target.value, c.rate)}
                                  style={{ ...inp, width: 34, marginLeft: 3, textAlign: "center", color: "#6b7280" }} />
                              )}
                            </td>
                            <td style={{ ...td, textAlign: "center", fontWeight: 600, color: "#111827" }}>{money(basis === "incl" ? c.inclAmount : c.amount)}</td>
                          </Fragment>
                        );
                      })}
                      {showRates && (
                        <td style={{ ...td, borderLeft: "1px solid #e5e7eb", textAlign: "center", fontSize: 11, color: prem > eco ? "#b45309" : "#6b7280" }}>
                          {eco > 0 && prem > 0 ? <>{prem >= eco ? "+" : "−"}{formatCurrency(Math.abs(prem - eco))} <span style={{ color: "#9ca3af" }}>({prem >= eco ? "+" : "−"}{Math.abs(roundTo2(((prem - eco) / eco) * 100))}%)</span></> : "—"}
                        </td>
                      )}
                    </tr>
                    {showRates && last && (() => {
                      const t = totals(visible.filter((r) => r.group === row.group));
                      return (
                        <tr style={{ background: "#eef2ff" }}>
                          <td colSpan={leadCols} style={{ ...td, fontWeight: 700, color: "#374151" }}>{row.group} Total</td>
                          {PROJ_MODELS.map((mo) => (
                            <td key={mo} colSpan={3} style={{ ...td, textAlign: "right", fontWeight: 700, color: PROJ_MODEL_COLORS[mo], borderLeft: "1px solid #e0e7ff" }}>{formatCurrency(pick(t, mo))}</td>
                          ))}
                          <td style={{ ...td, borderLeft: "1px solid #e0e7ff" }} />
                        </tr>
                      );
                    })()}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {picker && (
        <ProjItemPickerModal
          materialName={picker.material}
          prices={prices}
          initialGroup={picker.group}
          onSelect={onPick}
          onClose={() => setPicker(null)}
        />
      )}

      {resetConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: 420, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 17 }}>Reset to the global template?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#374151" }}>
              This overwrites every project-specific brand and rate with the current global template values. This cannot be undone.
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
    setMaterialStockSettings,
    templates,
    templateFolders,
    designGallery,
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
  // drop the param so refreshing doesn't reopen it.
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
  // leadSource/referredBy are read-only provenance here — set once, at
  // "Convert to Project" time on the Leads page, from the lead's own record.
  // They can still be corrected via Edit Info, but a fresh project created
  // straight from "+ New Project" simply won't have them.
  const emptyP = { name: "", client: "", contact: "", email: "", location: "", address: "", leadSource: "", referredBy: "" };
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
  const [sftRowsHelpOpen, setSftRowsHelpOpen] = useState(false);
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState(null);

  const [cutSheetOpen, setCutSheetOpen] = useState(false);
  const [allCutSheetOpen, setAllCutSheetOpen] = useState(false);
  const [expandedEdgeId, setExpandedEdgeId] = useState(null);

  // Collapsible section state (mirrors TemplateMaster's numbered sections).
  // Each Sub Sheet Calculation gets its own key ("sheet_<id>"), toggled the
  // same way as "sheets"/"hardware"/"summary".
  const [openSections, setOpenSections] = useState({ sheets: false, hardware: false, summary: false });
  const toggleSection = (key) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // One-slot clipboard for the Copy/Paste buttons on each Sheet Calculation —
  // shared with Templates and kept across page changes, so a sheet copied here
  // can be pasted into a template or another project.
  const [copiedSheet, setCopiedSheet] = useSheetClipboard();
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
  // Masking Tape qty = the room's edge band metres ÷ this, rounded up — editable,
  // defaults to 10, 0 = off. Persisted on the room like the multiplier above.
  const [tapeDivisor, setTapeDivisorLocal] = useState(10);
  // GST % applied on top of Material Summary's Total/Sft Cost rows to show
  // both Excl. and Incl. GST figures — editable, defaults to 18%. Persisted
  // on the room, same pattern as above.
  const [gstPercent, setGstPercentLocal] = useState(18);
  // Those three come from App Settings > Material Calculation: one value for every
  // room when "apply to all" is on (fields locked), else each room keeps its own.
  const calcLocked = isMaterialCalcUniversal();
  const calcG = materialCalcGlobals();

  // Project-level tab: "rooms" | "material-models"
  const [projectTab, setProjectTab] = useState("reqform");

  // Which project tabs this person's group allows (the owner has them all).
  const { user: authUser } = useAuth();
  const tabAccess = authUser?.access;
  const PROJECT_TAB_DEFS = [
    ["reqform", "📋 Req Form"], ["req", "📝 Measurement"], ["design", "📐 Design"], ["rooms", "🏠 Room Estimation"], ["analysis", "📊 Material Analysis"],
    ["quotation", "🧾 Quotation"], ["customer-view", "🧾 Quotation (Customer View)"],
  ];
  const tabPermKey = (tab) => (tab === "reqform" ? "req-form" : tab);
  // Material Analysis is governed by three of a group's project-tab rules: open
  // it with any of them, see rates with "with rates" or "change brands & rates",
  // and change brands/rates with the latter's Edit.
  const tabCan = (tab, action) => (tab === "analysis"
    ? (action === "view"
      ? ["summary-rates", "summary-norates", "material-models"].some((k) => canTab(tabAccess, k, "view"))
      : canTab(tabAccess, "material-models", action))
    : canTab(tabAccess, tabPermKey(tab), action));
  const analysisSeesRates = canTab(tabAccess, "summary-rates", "view") || canTab(tabAccess, "material-models", "view");
  const allowedProjectTabs = PROJECT_TAB_DEFS.filter(([t]) => tabCan(t, "view"));
  const tabCanEdit = tabCan(projectTab, "edit");
  // Land on a tab they may open, and refuse project edits made from a view-only
  // tab (see setProjectLock) for as long as it is open.
  useEffect(() => {
    if (allowedProjectTabs.length && !allowedProjectTabs.some(([t]) => t === projectTab)) setProjectTab(allowedProjectTabs[0][0]);
  }, [tabAccess, projectTab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setProjectLock({ readOnly: !tabCan(projectTab, "edit"), noDelete: !tabCan(projectTab, "delete") });
    return () => setProjectLock(null);
  }, [tabAccess, projectTab]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reset tab when switching projects
  useEffect(() => {
    setProjectTab("reqform");
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
  // Sub sheet whose Delete button is showing its "Delete? Yes / No" check.
  const [confirmDeleteSubSheetId, setConfirmDeleteSubSheetId] = useState(null);
  const [addServiceTarget, setAddServiceTarget] = useState(null); // { table: true } (Measurement tab) | { active: true } (Rooms & Boxes)
  // Measurement tab: services whose (still empty) table was just added, per project, and the room each table's "+ Add row" targets.
  const [shownServicesByProject, setShownServicesByProject] = useState({});
  const [serviceAddRoom, setServiceAddRoom] = useState({});
  const [reqTemplateRoomId, setReqTemplateRoomId] = useState(null); // Measurement tab: room a picked template is applied to
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
    const c = calcFor(activeRoom);
    setFevicolMultiplierLocal(c.fevicolMultiplier);
    setTapeDivisorLocal(c.tapeDivisor);
    setGstPercentLocal(c.gstPercent);
  }, [activeRoomId, calcLocked, calcG.fevicolMultiplier, calcG.tapeDivisor, calcG.gstPercent]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const setTapeDivisor = (v) => {
    setTapeDivisorLocal(v);
    if (typeof v === "number") updateRoomField("tapeDivisor", v);
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
      leadSource: p.leadSource || "", referredBy: p.referredBy || "",
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
      setProjects([...projects, { id, ...pForm, createdAt: Date.now() }]);
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

  // ── Generic project field update ─────────────────────────────────────────────
  const updateProjectField = (field, value) => {
    if (!selectedProject) return;
    setProjects((prev) => prev.map((p) => p.id === selectedProject.id ? { ...p, [field]: value } : p));
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

  const makeBlankBox = (id) => ({
      id, name: `Box ${id}`,
      includeInQuotation: true,
      boxType: "", frameType: "Framed", doorType: "", includeInMaterialCalc: true,
      widthMm: "", heightMm: "", depthMm: "",
      // Shown below Box Name, independent of the Sheet Calculation H/W/D
      // above — these drive the Quotation's Type of Work/Area/Carpenter
      // cost instead (see boxAreaSft/buildBoxCarpenterRow in projectRows.js).
      quotationBoxType: "", quotationDoorType: "",
      // "" = wardrobe/modular; else a service from utils/services.js.
      serviceType: "", serviceItem: "", serviceQty: "",
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
  });

  const addBox = () => {
    const id = boxes.length ? Math.max(...boxes.map((b) => b.id)) + 1 : 1;
    updateRoomField("boxes", [...boxes, makeBlankBox(id)]);
    setActiveBoxId(id);
  };

  const applyTemplate = (template, roomId = activeRoom?.id) => {
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
      // A template tagged with a service makes service boxes (see utils/services.js).
      serviceType: template.serviceType || "",
      serviceItem: tb.serviceItem || "",
      serviceQty: tb.serviceQty ?? "",
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
    setSubProjects((prev) => prev.map((s) => s.id === roomId ? { ...s, boxes: newBoxes } : s));
    if (roomId === activeRoom?.id) setActiveBoxId(newBoxes[0].id);
    setPendingTemplate(null);
  };


  // Several fields at once (two updateBox calls in a row would each start
  // from the same stale `boxes` and the second would undo the first).
  const updateBoxFields = (patch) => {
    if (!activeBox) return;
    updateRoomField("boxes", boxes.map((b) => b.id === activeBox.id ? { ...b, ...patch } : b));
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
    // id unset: only trust the raw text if it still names a real priced
    // material — a stale/placeholder string means nothing is required on
    // that side, not "some unidentified material is required."
    const rmat = (name, id) => id != null
      ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name)
      : ((prices || []).some((pr) => pr.materialName === name) ? name : "");
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
    // id unset: only trust the raw text if it still names a real priced
    // material — a stale/placeholder string means nothing is required on
    // that side, not "some unidentified material is required."
    const rmat = (name, id) => id != null
      ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name)
      : ((prices || []).some((pr) => pr.materialName === name) ? name : "");
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
    // id unset: only trust the raw text if it still names a real priced
    // material — a stale/placeholder string means nothing is required on
    // that side, not "some unidentified material is required."
    const rmat = (name, id) => id != null
      ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name)
      : ((prices || []).some((pr) => pr.materialName === name) ? name : "");
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

  // Real sheet-nesting count per Wood/Laminate material for the active room —
  // one source of truth shared by "Material Details" (AUTO rows) and
  // "3. Material Summary" so the two sections never disagree. Deliberately
  // scoped to Wood/Laminate only (see computeAreaRows below for everything
  // else referenced in the cut list) — nesting a 2100×600mm glass panel onto
  // a "stock sheet" and calling the result its quantity made no sense for a
  // material actually priced and bought per sqft.
  // Saw-blade kerf in force for this project: the App Settings value, or the
  // project's own when the account lets each project have one.
  const projectKerf = kerfFor(selectedProject);
  const setProjectKerf = (v) => setProjects((prev) => prev.map((p) => (p.id === selectedProject?.id ? { ...p, kerfWidth: v } : p)));
  const kerfProps = {
    kerf: projectKerf,
    onKerfChange: isKerfUniversal() ? undefined : setProjectKerf,
    kerfHint: isKerfUniversal() ? "Same for every project — change it in App Settings" : "Kerf for this project",
  };
  const computeSheetRows = () => {
    const isSheetGroup = (g) => g === "Wood" || g === "Laminate";
    const rows = generateAllBoxesCutSheet().filter((r) => isSheetGroup((prices || []).find((p) => p.materialName === r.material)?.group));
    const getStockSize = (mat) => {
      const s = materialStockSettings?.[mat];
      return { sheetW: s?.sheetW || 2440, sheetH: s?.sheetH || 1220, sheetTexture: s?.sheetTexture ?? 1 };
    };
    const packed = packSheets(rows, getStockSize, projectKerf);
    const sheetCount = {};
    packed.forEach((s) => { sheetCount[s.material] = (sheetCount[s.material] || 0) + 1; });
    const materials = [...new Set(rows.map((r) => r.material).filter(Boolean))];
    return materials.map((material) => {
      const priceEntry = (prices || []).find((p) => p.materialName === material);
      const base = sheetCount[material] || 0;
      const extra = Math.max(0, Number(materialStockSettings?.[material]?.extraQty) || 0);
      return { material, group: priceEntry?.group || "Other", base, extra, requiredQty: base + extra, unit: priceEntry?.unit || "Sheet" };
    });
  };

  // Materials referenced in the cut list that aren't Wood/Laminate sheets
  // but ARE priced per sqft (e.g. glass, mirrors, stone tops picked as a
  // part's Material/Side A/Side B) — real area used (Σ w×h×qty converted to
  // sqft), not a sheet-nesting count, since these are bought/priced by area,
  // not by whole standard sheets.
  const computeAreaRows = () => {
    const totals = {};
    generateAllBoxesCutSheet().forEach((r) => {
      if (!r.material || !+r.w || !+r.h || !+r.qty) return;
      const priceEntry = (prices || []).find((p) => p.materialName === r.material);
      const group = priceEntry?.group;
      if (group === "Wood" || group === "Laminate") return; // handled by computeSheetRows
      if (!/sq\.?\s?ft/i.test(priceEntry?.unit || "")) return; // only meaningful when priced per sqft
      const areaSft = mmToFeet(+r.w) * mmToFeet(+r.h) * (+r.qty);
      totals[r.material] = (totals[r.material] || 0) + areaSft;
    });
    return Object.entries(totals).map(([material, area]) => {
      const priceEntry = (prices || []).find((p) => p.materialName === material);
      const base = Math.round(area * 100) / 100;
      const extra = Math.max(0, Number(materialStockSettings?.[material]?.extraQty) || 0);
      return { material, group: priceEntry?.group || "Other", base, extra, requiredQty: Math.round((base + extra) * 100) / 100, unit: priceEntry?.unit || "Sq.ft" };
    });
  };

  // Parts whose size doesn't fit their material's stock sheet in any
  // orientation — packSheets silently drops these (see findOversizedPieces),
  // which otherwise shows up as a confusing "0 sheets" with no explanation.
  // Surfaced as an error banner above "Material Details" and "3. Material
  // Summary" instead of failing silently.
  const computeOversizedPieces = () => {
    const rows = generateAllBoxesCutSheet();
    const getStockSize = (mat) => {
      const s = materialStockSettings?.[mat];
      return { sheetW: s?.sheetW || 2440, sheetH: s?.sheetH || 1220 };
    };
    return findOversizedPieces(rows, getStockSize);
  };

  // ── Material Summary across ALL boxes in the active room ────────────────────
  const computeMatSummary = () => {
    const sheetRows = computeSheetRows();
    const areaRows = computeAreaRows();

    const edgeSummed = {};
    boxes.forEach((box) => {
      computeBoxEdgeBandingRows(box).forEach(({ material, qty }) => {
        edgeSummed[material] = (edgeSummed[material] || 0) + qty;
      });
    });
    const edgeRows = Object.entries(edgeSummed).map(([material, requiredQty]) => ({
      material, group: "Edge Beading", requiredQty, unit: "Mtr",
    }));

    // Combined (one row per material, summed across every box in the room)
    // vs Per Box (one row per box, so e.g. Wardrobe and Loft1 each show their
    // own Sft instead of being merged into a single "Box" line) — per-room
    // toggle, set via the room title row above.
    const perBoxSft = activeRoom?.quotationSftMode === "perBox";
    const carpSummed = {};
    boxes.forEach((box) => {
      computeBoxCarpenterRows(box).forEach(({ material, qty }) => {
        const key = perBoxSft ? `${material}__${box.id}` : material;
        if (!carpSummed[key]) carpSummed[key] = { material, requiredQty: 0, boxLabel: perBoxSft ? (box.name || `Box ${box.id}`) : null };
        carpSummed[key].requiredQty += qty;
      });
    });
    const carpRows = Object.values(carpSummed).map(({ material, requiredQty, boxLabel }) => ({
      material, boxLabel, group: "Carpenter", requiredQty: Math.round(requiredQty * 100) / 100,
      unit: (prices || []).find((p) => p.materialName === material)?.unit || "Sq.ft",
    }));

    const FEVICOL_NAME = "Fevicol Merino";
    const tapeDiv = Number(tapeDivisor) || 0;
    const hwSummed = {};
    boxes.forEach((box) => {
      (box.hardwareItems || []).forEach((hw) => {
        if (!hw.materialName) return;
        if (hw.materialName === FEVICOL_NAME) return; // auto-calculated below instead of hand-entered
        if (tapeDiv > 0 && hw.materialName === TAPE_ITEM) return; // from edge band length, below
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

    // Masking tape = edge band length ÷ the account's divisor (Items Pricing), rounded up.
    const edgeMtr = edgeRows.reduce((s, r) => s + r.requiredQty, 0);
    const tapeQty = tapeDiv > 0 && edgeMtr > 0 ? Math.ceil(edgeMtr / tapeDiv) : 0;
    const tapePriceEntry = (prices || []).find((p) => p.materialName === TAPE_ITEM);
    const tapeRows = tapeQty > 0
      ? [{ material: TAPE_ITEM, group: tapePriceEntry?.group || "Tape", requiredQty: tapeQty, unit: tapePriceEntry?.unit || "Nos" }]
      : [];

    return [...sheetRows, ...areaRows, ...edgeRows, ...carpRows, ...hwRows, ...fevicolRows, ...tapeRows].sort((a, b) => a.group.localeCompare(b.group) || a.material.localeCompare(b.material));
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
    const where = `Project "${selectedProject?.name || "Untitled"}" › ${activeRoom?.subProject || activeRoom?.name || "Room"} › ${activeBox.boxName || activeBox.name || "Box"}`;
    setCopiedSheet({ fields, sourceLabel: subSheetId == null ? where : `${where} › ${sheet.name || "Sub Sheet"}` });
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
            <button onClick={() => openAddProject()}>+ Create Project</button>
          </div>
        ) : (
          <>
            {/* ── Project Header ── */}
            <div className="no-print" style={{ padding: "12px 24px 8px", borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {/* Name, status, client and location share one line (it wraps only on a narrow window). */}
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 18px", flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 20, whiteSpace: "nowrap" }}>{selectedProject.name}</h2>
                  <select
                    value={selectedProject.status || "inProgress"}
                    onChange={(e) => updateProjectField("status", e.target.value)}
                    style={{
                      fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: "none", cursor: "pointer", width: "auto", flexShrink: 0,
                      color: projectStatusInfo(selectedProject.status).color, background: projectStatusInfo(selectedProject.status).bg,
                    }}
                    title="Project status — also shown on the Dashboard"
                  >
                    {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  {selectedProject.leadSource && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, color: "#6b7280", background: "#f3f4f6", whiteSpace: "nowrap" }}>
                      {leadSourceLabel(selectedProject.leadSource)}
                      {selectedProject.leadSource === "reference" && selectedProject.referredBy ? ` — ${selectedProject.referredBy}` : ""}
                    </span>
                  )}
                  <span style={{ fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}><strong>Client:</strong> {selectedProject.client || "—"}</span>
                  {selectedProject.contact && <span style={{ fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>📞 {selectedProject.contact}</span>}
                  {selectedProject.email && <span style={{ fontSize: 13, color: "#374151", whiteSpace: "nowrap" }}>✉ {selectedProject.email}</span>}
                  {(selectedProject.location || selectedProject.address) && (
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                      📍 {[selectedProject.location, selectedProject.address].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <button onClick={() => openAddProject()} style={{ background: "#2563eb", padding: "6px 14px", fontSize: 13 }}>
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
            <div className="no-print" style={{ borderBottom: "2px solid #e5e7eb", padding: "0 24px", display: "flex", alignItems: "flex-end", gap: 0, background: "#fff" }}>
              {allowedProjectTabs.map(([tab, label]) => {
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

            {!isOwner(tabAccess) && !tabCanEdit && (
              <div className="no-print" style={{ margin: "10px 24px 0", padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, color: "#1e40af", fontSize: 12 }}>
                🔒 View only — your group can look at this tab but not change it.
              </div>
            )}

            {/* ── Req Tab — Wardrobe / Modular boxes room by room, then one table
                per service added to this project. Same box data as Rooms &
                Boxes (shared state, so each view reflects the other). ── */}
            {projectTab === "req" && (() => {
              const setBoxFields = (roomId, boxId, patch) =>
                setSubProjects((prev) => prev.map((s) => s.id !== roomId ? s : {
                  ...s,
                  boxes: (s.boxes || []).map((b) => b.id === boxId ? { ...b, ...patch } : b),
                }));
              const setBoxField = (roomId, boxId, field, value) => setBoxFields(roomId, boxId, { [field]: value });
              const th = { padding: "8px 10px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#4c1d95", background: "#f5f3ff", borderBottom: "2px solid #ddd6fe", whiteSpace: "nowrap" };
              const td = { padding: "6px 10px", borderBottom: "1px solid #ede9fe", fontSize: 13 };
              const setRoomName = (roomId, name) =>
                setSubProjects((prev) => prev.map((s) => s.id === roomId ? { ...s, subProject: name } : s));
              const nameIn = { width: 140, fontSize: 13, padding: "3px 6px" };
              const dimIn = { width: 76, fontSize: 12, padding: "3px 6px" };
              const nextBoxId = (bs) => (bs.length ? Math.max(...bs.map((b) => b.id)) + 1 : 1);
              const addBoxToRoom = (roomId) =>
                setSubProjects((prev) => prev.map((s) => {
                  if (s.id !== roomId) return s;
                  const bs = s.boxes || [];
                  return { ...s, boxes: [...bs, makeBlankBox(nextBoxId(bs))] };
                }));
              const addServiceRow = (roomId, serviceName) =>
                setSubProjects((prev) => prev.map((s) => {
                  if (s.id !== roomId) return s;
                  const bs = s.boxes || [];
                  return { ...s, boxes: [...bs, { ...makeBlankBox(nextBoxId(bs)), serviceType: serviceName }] };
                }));
              const removeRow = (roomId, boxId) => {
                if (!window.confirm("Remove this row?")) return;
                setSubProjects((prev) => prev.map((s) => s.id !== roomId ? s : { ...s, boxes: (s.boxes || []).filter((b) => b.id !== boxId) }));
              };
              // One H / W / D input, shown in mm or feet.
              const dimCell = (room, box, key, extra) => {
                const mmVal = box[key] ?? "";
                const ftVal = mmVal !== "" ? roundTo2(mmToFeet(Number(mmVal))) : "";
                return (
                  <td key={key} style={{ ...td, ...extra }}>
                    <input
                      type="number"
                      value={dimUnit === "mm" ? mmVal : ftVal}
                      placeholder={dimUnit}
                      onChange={(e) => {
                        if (dimUnit === "mm") setBoxField(room.id, box.id, key, e.target.value);
                        else {
                          const ft = Number(e.target.value);
                          if (!isNaN(ft)) setBoxField(room.id, box.id, key, e.target.value === "" ? "" : String(Math.round(feetToMm(ft))));
                        }
                      }}
                      style={dimIn}
                    />
                  </td>
                );
              };
              const unitText = (u) => (u === "sqft" ? "sft" : u);
              const sumText = (list) => {
                const t = {};
                list.forEach((box) => {
                  if (!box || box.includeInQuotation === false) return;
                  const { qty, unit } = boxQty(box);
                  t[unit] = (t[unit] || 0) + qty;
                });
                return Object.entries(t).filter(([, q]) => q > 0).map(([u, q]) => `${Math.round(q * 100) / 100} ${unitText(u)}`).join(" · ") || "—";
              };

              // ── Wardrobe / Modular table: every room, boxes without a service.
              // A room with no wardrobe boxes still gets one (box-less) row, so
              // this table is also where rooms are named and added to.
              const wardrobeRows = rooms.flatMap((room) => {
                const bs = (room.boxes || []).filter((b) => !serviceOf(b));
                return bs.length ? bs.map((box) => ({ room, box })) : [{ room, box: null }];
              });

              // ── One table per service that has rows, or was just added here.
              const shownNow = shownServicesByProject[selectedProject.id] || [];
              const hasRows = (n) => rooms.some((r) => (r.boxes || []).some((b) => b.serviceType === n));
              const serviceTables = SERVICE_NAMES.filter((n) => hasRows(n) || shownNow.includes(n));
              const addableServices = SERVICE_NAMES.filter((n) => !serviceTables.includes(n));

              const renderServiceTable = (name) => {
                const svc = SERVICES[name];
                const rows = rooms.flatMap((room) => (room.boxes || []).filter((b) => b.serviceType === name).map((box) => ({ room, box })));
                const dimKeys = svc.measure === "area" ? ["quotationHeightMm", "quotationWidthMm"] : svc.measure === "length" ? ["quotationWidthMm"] : [];
                const dimLabel = { quotationHeightMm: "H", quotationWidthMm: "W" };
                const qtyHead = svc.measure === "area" ? "Area (sft)" : svc.measure === "length" ? "Length (rft)" : "Qty (pt)";
                const addRoomId = rooms.some((r) => r.id === serviceAddRoom[name]) ? serviceAddRoom[name] : rooms[0]?.id;
                return (
                  <div key={name} style={{ marginTop: 22 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>
                      {name}
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: "#6b7280" }}>{MEASURE_LABELS[svc.measure]}</span>
                      {rows.length === 0 && (
                        <button
                          onClick={() => setShownServicesByProject((p) => ({ ...p, [selectedProject.id]: (p[selectedProject.id] || []).filter((n) => n !== name) }))}
                          style={{ marginLeft: 12, fontSize: 11, padding: "1px 8px", background: "none", border: "1px solid #fecaca", borderRadius: 6, color: "#dc2626", cursor: "pointer" }}
                        >Remove table</button>
                      )}
                    </div>
                    <div style={{ overflowX: "auto", border: "1px solid #ede9fe", borderRadius: 8 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
                        <thead>
                          <tr>
                            <th style={th}>Room</th>
                            <th style={th}>Description</th>
                            <th style={th}>Item</th>
                            <th style={{ ...th, textAlign: "center", lineHeight: 1.25, width: 84 }}>Include in<br />Quotation</th>
                            {dimKeys.map((k) => <th key={k} style={th}>{dimLabel[k]} ({dimUnit})</th>)}
                            <th style={{ ...th, textAlign: "right" }}>{qtyHead}</th>
                            <th style={th} />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 && (
                            <tr><td colSpan={6 + dimKeys.length} style={{ ...td, color: "#9ca3af" }}>No rows yet — use + Add row below.</td></tr>
                          )}
                          {rows.map(({ room, box }) => {
                            const excluded = box.includeInQuotation === false;
                            const q = boxQty(box);
                            return (
                              <tr key={`${room.id}-${box.id}`} style={{ opacity: excluded ? 0.55 : 1 }}>
                                <td style={{ ...td, fontWeight: 700, color: "#1e3a5f" }}>{room.subProject || "—"}</td>
                                <td style={td}>
                                  <input type="text" value={box.name || ""} onChange={(e) => setBoxField(room.id, box.id, "name", e.target.value)} placeholder="Description" style={nameIn} />
                                </td>
                                <td style={td}>
                                  <select
                                    value={box.serviceItem || ""}
                                    onChange={(e) => setBoxField(room.id, box.id, "serviceItem", e.target.value)}
                                    style={{ fontSize: 12, padding: "3px 6px", width: 150 }}
                                  >
                                    <option value="">— Select —</option>
                                    {(prices || []).filter((p) => p.group === svc.group).map((p) => (
                                      <option key={p.id} value={p.materialName}>{p.materialName}</option>
                                    ))}
                                  </select>
                                </td>
                                <td style={{ ...td, textAlign: "center" }}>
                                  <input
                                    type="checkbox"
                                    checked={!excluded}
                                    onChange={(e) => setBoxField(room.id, box.id, "includeInQuotation", e.target.checked)}
                                    style={{ width: 14, height: 14, cursor: "pointer" }}
                                  />
                                </td>
                                {dimKeys.map((k) => dimCell(room, box, k))}
                                <td style={{ ...td, textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>
                                  {svc.measure === "points" ? (
                                    <input type="number" min="0" value={box.serviceQty ?? ""} onChange={(e) => setBoxField(room.id, box.id, "serviceQty", e.target.value)} placeholder="Qty" style={dimIn} />
                                  ) : (q.qty || "—")}
                                </td>
                                <td style={{ ...td, textAlign: "center" }}>
                                  <button onClick={() => removeRow(room.id, box.id)} title="Remove row" style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3} style={{ ...td, background: "#faf5ff" }}>
                              <select
                                value={addRoomId ?? ""}
                                onChange={(e) => setServiceAddRoom((p) => ({ ...p, [name]: Number(e.target.value) }))}
                                style={{ fontSize: 12, padding: "3px 6px", width: 150, marginRight: 8 }}
                              >
                                {rooms.map((r) => <option key={r.id} value={r.id}>{r.subProject || `Room ${r.id}`}</option>)}
                              </select>
                              <button
                                disabled={addRoomId == null}
                                onClick={() => addServiceRow(addRoomId, name)}
                                style={{ fontSize: 12, padding: "3px 10px", background: "none", border: "none", color: "#7c3aed", cursor: "pointer" }}
                              >+ Add row</button>
                            </td>
                            <td colSpan={1 + dimKeys.length} style={{ ...td, textAlign: "right", fontWeight: 700, background: "#faf5ff" }}>Sub total (included)</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700, background: "#faf5ff", whiteSpace: "nowrap" }}>{sumText(rows.map((r) => r.box))}</td>
                            <td style={{ ...td, background: "#faf5ff" }} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              };

              return (
                <div style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontSize: 13, color: "#6b7280" }}>
                      Wardrobe / Modular work room by room, then a table for each extra service (False Ceiling, Tiles, Lighting, ...).
                      Changes here and in Room Estimation are the same data.
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={openAddRoom} style={{ fontSize: 12, padding: "4px 12px" }}>+ Add Room</button>
                      <select
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__new__") setAddServiceTarget({ table: true });
                          else if (v) setShownServicesByProject((p) => ({ ...p, [selectedProject.id]: [...(p[selectedProject.id] || []), v] }));
                        }}
                        style={{ fontSize: 12, padding: "4px 8px", width: 150 }}
                      >
                        <option value="">+ Add service…</option>
                        {addableServices.map((n) => <option key={n} value={n}>{n}</option>)}
                        <option value="__new__">+ New service…</option>
                      </select>
                      <button
                        onClick={() => setDimUnit(dimUnit === "mm" ? "ft" : "mm")}
                        style={{ fontSize: 11, padding: "3px 10px", background: "#ede9fe", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: 6 }}
                      >Show {dimUnit === "mm" ? "feet" : "mm"}</button>
                    </div>
                  </div>
                  {rooms.length === 0 ? (
                    <p style={{ color: "#9ca3af" }}>No rooms yet — use + Add Room.</p>
                  ) : (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1e3a5f", marginBottom: 6 }}>{WARDROBE_SERVICE}</div>
                      <div style={{ overflowX: "auto", border: "1px solid #ede9fe", borderRadius: 8 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
                          <thead>
                            <tr>
                              <th style={th}>Room</th>
                              <th style={th}>Box</th>
                              <th style={th}>Box Type</th>
                              <th style={th}>Door Type</th>
                              <th style={{ ...th, textAlign: "center", lineHeight: 1.25, width: 84 }}>Include in<br />Quotation</th>
                              <th style={th}>H ({dimUnit})</th>
                              <th style={th}>W ({dimUnit})</th>
                              <th style={th}>D ({dimUnit})</th>
                              <th style={{ ...th, textAlign: "right" }}>Area (sft)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {wardrobeRows.map(({ room, box }, i) => {
                              const firstOfRoom = i === 0 || wardrobeRows[i - 1].room.id !== room.id;
                              const lastOfRoom = i === wardrobeRows.length - 1 || wardrobeRows[i + 1].room.id !== room.id;
                              const sep = firstOfRoom && i ? "2px solid #ddd6fe" : undefined;
                              if (!box) {
                                return (
                                  <tr key={`${room.id}-empty`}>
                                    <td style={{ ...td, fontWeight: 700, color: "#1e3a5f", borderTop: sep }}><input type="text" value={room.subProject} onChange={(e) => setRoomName(room.id, e.target.value)} placeholder="Room name" style={{ ...nameIn, fontWeight: 700 }} /><button onClick={() => { setReqTemplateRoomId(room.id); setTemplatePickerOpen(true); }} style={{ display: "block", background: "none", border: "none", color: "#1d4ed8", cursor: "pointer", fontSize: 11, padding: 0, fontWeight: 400 }}>📐 Apply Template</button></td>
                                    <td colSpan={8} style={{ ...td, borderTop: sep, color: "#9ca3af" }}>
                                      No {WARDROBE_SERVICE} boxes
                                      <button onClick={() => addBoxToRoom(room.id)} style={{ marginLeft: 12, background: "none", border: "none", color: "#7c3aed", cursor: "pointer", fontSize: 12 }}>+ Add Box</button>
                                    </td>
                                  </tr>
                                );
                              }
                              const excluded = box.includeInQuotation === false;
                              const q = boxQty(box);
                              return (
                                <tr key={`${room.id}-${box.id}`} style={{ opacity: excluded ? 0.55 : 1 }}>
                                  <td style={{ ...td, fontWeight: 700, color: "#1e3a5f", borderTop: sep }}>{firstOfRoom && (<><input type="text" value={room.subProject} onChange={(e) => setRoomName(room.id, e.target.value)} placeholder="Room name" style={{ ...nameIn, fontWeight: 700 }} /><button onClick={() => { setReqTemplateRoomId(room.id); setTemplatePickerOpen(true); }} style={{ display: "block", background: "none", border: "none", color: "#1d4ed8", cursor: "pointer", fontSize: 11, padding: 0, fontWeight: 400 }}>📐 Apply Template</button></>)}</td>
                                  <td style={{ ...td, borderTop: sep }}>
                                    <input type="text" value={box.name} onChange={(e) => setBoxField(room.id, box.id, "name", e.target.value)} placeholder="Box name" style={nameIn} />
                                    {lastOfRoom && (
                                      <button onClick={() => addBoxToRoom(room.id)} style={{ marginLeft: 10, background: "none", border: "none", color: "#7c3aed", cursor: "pointer", fontSize: 11, padding: 0 }}>+ Add Box</button>
                                    )}
                                  </td>
                                  <td style={{ ...td, borderTop: sep }}>
                                    <select
                                      value={box.quotationBoxType || ""}
                                      onChange={(e) => setBoxField(room.id, box.id, "quotationBoxType", e.target.value)}
                                      style={{ fontSize: 12, padding: "3px 6px", width: 130 }}
                                    >
                                      <option value="">— Select —</option>
                                      {(prices || []).filter((p) => p.group === "Carpenter").map((p) => (
                                        <option key={p.id} value={p.materialName}>{p.materialName}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td style={{ ...td, borderTop: sep }}>
                                    <select value={box.quotationDoorType || ""} onChange={(e) => setBoxField(room.id, box.id, "quotationDoorType", e.target.value)} style={{ fontSize: 12, padding: "3px 6px", width: 130 }}>
                                      <option value="">— Select —</option>
                                      <option value="Sliding Door">Sliding Door</option>
                                      <option value="Swing Door">Swing Door</option>
                                    </select>
                                  </td>
                                  <td style={{ ...td, textAlign: "center", borderTop: sep }}>
                                    <input
                                      type="checkbox"
                                      checked={!excluded}
                                      onChange={(e) => setBoxField(room.id, box.id, "includeInQuotation", e.target.checked)}
                                      style={{ width: 14, height: 14, cursor: "pointer" }}
                                    />
                                  </td>
                                  {["quotationHeightMm", "quotationWidthMm", "quotationDepthMm"].map((k) => dimCell(room, box, k, { borderTop: sep }))}
                                  <td style={{ ...td, textAlign: "right", fontWeight: 600, borderTop: sep, whiteSpace: "nowrap" }}>
                                    {q.qty || "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={8} style={{ ...td, textAlign: "right", fontWeight: 700, background: "#faf5ff" }}>Sub total (included boxes)</td>
                              <td style={{ ...td, textAlign: "right", fontWeight: 700, background: "#faf5ff", whiteSpace: "nowrap" }}>{sumText(wardrobeRows.map((r) => r.box))}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      {serviceTables.map(renderServiceTable)}
                    </>
                  )}
                </div>
              );
            })()}

            {/* ── Req Form Tab — the room requirement questions (picked per room from
                Configure › Req Form), answered here or by the customer's own login ── */}
            {projectTab === "reqform" && (
              <div style={{ padding: "20px 24px" }}>
                <RequirementsPanel project={selectedProject} rooms={rooms} />
              </div>
            )}

            {/* ── Project Quotation Tab ── */}
            {projectTab === "quotation" && (
              <div style={{ padding: "20px 24px" }}>
                <ProjectQuotation initialProjectName={selectedProject.name} lockProject />
              </div>
            )}

            {/* ── Quotation, customer's view — just the customer-facing quotation
                (no settings, no model comparison) with Print / PDF / Share. ── */}
            {projectTab === "customer-view" && (
              <div style={{ padding: "20px 24px" }}>
                <ProjectQuotation initialProjectName={selectedProject.name} lockProject customerView />
              </div>
            )}

            {/* ── Design Tab — per room: Mood Board (build + finalize), CAD PDFs
                (shown inline) and final renders, all with version history ── */}
            {projectTab === "design" && (
              <ProjectDesignTab
                project={selectedProject}
                rooms={rooms}
                designGallery={designGallery}
                onAddRoom={openAddRoom}
                updateProject={(fn) => setProjects((prev) => prev.map((p) => (p.id === selectedProject.id ? fn(p) : p)))}
                updateRoom={(roomId, fn) => setSubProjects((prev) => prev.map((s) => (s.id === roomId ? fn(s) : s)))}
              />
            )}

            {/* ── Material Analysis — what the project needs, with the brand and rate
                chosen per pricing model and the amount each gives. Replaces the old
                Material Models and Summary (with / without rates) tabs. ── */}
            {projectTab === "analysis" && (
              <ProjectAnalysis
                rows={[
                  // Quantities as the Quotation counts them, so these totals tie to it.
                  ...quotationMaterialRows(
                    rooms.map((room) => ({ ...room, boxes: (room.boxes || []).filter((b) => b.includeInQuotation !== false && !serviceOf(b)) })),
                    prices,
                    materialStockSettings,
                    projectKerf
                  ).map((r) => ({ ...r, service: WARDROBE_SERVICE })),
                  ...serviceAnalysisRows(rooms),
                ]}
                project={selectedProject}
                prices={prices}
                globalRates={materialModelRates}
                setProjects={setProjects}
                canSeeRates={analysisSeesRates}
                canEdit={tabCanEdit}
              />
            )}

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
                      <label
                        style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6b7280", marginRight: 6, position: "relative" }}
                      >
                        <span style={{ fontWeight: 600 }}>Sft rows:</span>
                        <select
                          value={activeRoom.quotationSftMode || "combined"}
                          onChange={(e) => updateRoomField("quotationSftMode", e.target.value)}
                          style={{ fontSize: 11, padding: "3px 6px", borderRadius: 5 }}
                        >
                          <option value="combined">Combined</option>
                          <option value="perBox">Per Box</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setSftRowsHelpOpen((o) => !o)}
                          style={{
                            width: 16, height: 16, borderRadius: "50%", border: "1px solid #9ca3af", background: "#f3f4f6",
                            color: "#6b7280", fontSize: 10, fontWeight: 700, lineHeight: "14px", padding: 0, cursor: "pointer",
                          }}
                          title="What does this do?"
                        >?</button>
                        {sftRowsHelpOpen && (
                          <>
                            <div
                              onClick={() => setSftRowsHelpOpen(false)}
                              style={{ position: "fixed", inset: 0, zIndex: 999 }}
                            />
                            <div
                              style={{
                                position: "absolute", top: "100%", right: 0, marginTop: 6, width: 260, zIndex: 1000,
                                background: "#1f2937", color: "#fff", fontSize: 11, fontWeight: 400, lineHeight: 1.5,
                                padding: "10px 12px", borderRadius: 8, boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
                              }}
                            >
                              Controls how this room's boxes appear in <strong>Material Summary</strong> and the <strong>Quotation</strong> tab.
                              <br /><br />
                              <strong>Combined</strong> — every box in the room is rolled into one row (one Sft total, one blended rate).
                              <br />
                              <strong>Per Box</strong> — each box (e.g. Wardrobe, Loft1) gets its own row with its own Sft, Width and Height.
                            </div>
                          </>
                        )}
                      </label>
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
                              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>Service</label>
                              <select
                                value={activeBox.serviceType || ""}
                                onChange={(e) => e.target.value === "__new__"
                                  ? setAddServiceTarget({ active: true })
                                  : updateBoxFields({ serviceType: e.target.value, serviceItem: "" })}
                                style={{ fontSize: 12, padding: "3px 6px", width: 140 }}
                              >
                                <option value="">{WARDROBE_SERVICE}</option>
                                {SERVICE_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
                                <option value="__new__">+ Add new service…</option>
                              </select>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{serviceOf(activeBox) ? "Item" : "Box Type"}</label>
                              <select
                                value={(serviceOf(activeBox) ? activeBox.serviceItem : activeBox.quotationBoxType) || ""}
                                onChange={(e) => updateBox(serviceOf(activeBox) ? "serviceItem" : "quotationBoxType", e.target.value)}
                                style={{ fontSize: 12, padding: "3px 6px", width: 120 }}
                              >
                                <option value="">— Select —</option>
                                {(prices || []).filter((p) => p.group === (serviceOf(activeBox)?.group || "Carpenter")).map((p) => (
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
                              {serviceOf(activeBox)?.measure === "points" && (
                              <>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Qty (points)</span>
                                <input type="number" min="0" value={activeBox.serviceQty ?? ""} onChange={(e) => updateBox("serviceQty", e.target.value)} style={{ width: 72, fontSize: 12, padding: "3px 6px" }} />
                              </>
                            )}
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{serviceOf(activeBox) ? "Measured" : "Area Sft"}</span>
                              <input
                                type="text"
                                readOnly
                                value={boxQty(activeBox).qty || ""}
                                placeholder="—"
                                title="Auto-calculated: H × W in sq ft — used for Quotation"
                                style={{ width: 72, fontSize: 12, padding: "3px 6px", background: "#f3f4f6", color: "#374151", fontWeight: 600, cursor: "default" }}
                              />
                              <span style={{ fontSize: 11, color: "#9ca3af" }}>{boxQty(activeBox).unit === "sqft" ? "sq ft" : boxQty(activeBox).unit}</span>
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
                              // Dropping a dragged "{H}"-style chip inserts it at the drop
                              // point (cursor position when the drag started over this input)
                              // instead of replacing the whole formula.
                              const handleDrop = (e) => {
                                e.preventDefault();
                                const text = e.dataTransfer.getData("text/plain");
                                if (!text) return;
                                const start = e.target.selectionStart ?? raw.length;
                                const end = e.target.selectionEnd ?? raw.length;
                                updatePart(part.id, field, raw.slice(0, start) + text + raw.slice(end), subSheetId);
                              };
                              return (
                                <div style={{ minWidth: 64 }}>
                                  <input
                                    type="text"
                                    value={raw}
                                    onChange={(e) => updatePart(part.id, field, e.target.value, subSheetId)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={handleDrop}
                                    placeholder="mm or {H} — or drag a {ref} chip in"
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
                            // A part's own W×H can't be re-nested per material once cut — the
                            // core board and both laminate faces are the same physical piece —
                            // so one size check against each selected material's stock sheet
                            // catches what packSheets would otherwise drop silently later.
                            const oversizedInfo = (p) => {
                              const w = resolveFormula(p.widthMm, vars);
                              const h = resolveFormula(p.heightMm, vars);
                              if (!w || !h || w === "?" || h === "?") return null;
                              const mats = [resolveMat(p.material, p.materialId), resolveMat(p.sideA, p.sideAId), resolveMat(p.sideB, p.sideBId)].filter(Boolean);
                              const bad = [];
                              mats.forEach((mat) => {
                                const s = materialStockSettings?.[mat];
                                const sheetW = s?.sheetW || 2440, sheetH = s?.sheetH || 1220;
                                const fitsAsIs = w <= sheetW && h <= sheetH;
                                const fitsRotated = h <= sheetW && w <= sheetH;
                                if (!fitsAsIs && !fitsRotated) bad.push(`${mat}: ${w}×${h}mm doesn't fit its ${sheetW}×${sheetH}mm sheet in either orientation`);
                              });
                              return bad.length ? bad : null;
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
                                        const oversized = isReq ? oversizedInfo(p) : null;
                                        return (
                                          <tr key={p.id} style={{ background: rowBg, verticalAlign: "top", opacity: isReq ? 1 : 0.45, ...(oversized ? { boxShadow: "inset 3px 0 0 #dc2626" } : {}) }}>
                                            <td style={{ ...numCell, color: "#6b7280", fontWeight: 600, paddingTop: 6 }}>
                                              {i + 1}
                                              {oversized && (
                                                <div title={oversized.join("\n")} style={{ fontSize: 13, color: "#dc2626", cursor: "help", marginTop: 2 }}>⚠</div>
                                              )}
                                            </td>
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
                                            <td style={{ ...numCell, padding: "3px 4px", ...(oversized ? { background: "#fee2e2" } : {}) }}>{formulaInp(p, "widthMm")}</td>
                                            <td style={{ ...numCell, padding: "3px 4px", ...(oversized ? { background: "#fee2e2" } : {}) }}>{formulaInp(p, "heightMm")}</td>
                                            <td style={{ ...numCell, padding: "3px 4px" }}>{formulaInp(p, "qty")}</td>
                                            <td style={txtCell}>
                                              <select value={resolveMat(p.material, p.materialId) || ""} onChange={(e) => { const name = e.target.value; const pi = (prices || []).find((pr) => pr.materialName === name); updatePartFields(p.id, { material: name, materialId: pi?.id ?? null }, subSheetId); }} style={{ fontSize: 12, padding: "2px 4px", width: "100%" }}>
                                                <option value="">— Select —</option>
                                                {matOptions.filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
                                              </select>
                                            </td>
                                            <td style={numCell}>
                                              <NumInput value={p.rotation ?? 1} onChange={(v) => updatePart(p.id, "rotation", v, subSheetId)} style={{ width: 44, fontSize: 12, padding: "2px 5px", minWidth: 44 }} min={1} />
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
                                                        <NumInput value={p[fld] ?? 0} onChange={(v) => updatePart(p.id, fld, v, subSheetId)} disabled={!isEdgeReq} style={{ width: 42, fontSize: 11, padding: "1px 3px", opacity: isEdgeReq ? 1 : 0.35 }} min={0} />
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
                                {/* The main sheet "1." is the box itself, so its Name is the
                                    box's own name (same field as the box rename above). */}
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>Name</label>
                                  <input
                                    type="text"
                                    value={sheet.name || ""}
                                    onChange={(e) => updateSheetField(subSheetId, "name", e.target.value)}
                                    placeholder={subSheetId == null ? "Name (e.g. Wardrobe)" : "Name (e.g. Draw)"}
                                    style={{ fontWeight: 700, fontSize: 13, color: "#4c1d95", border: "1px solid #ddd6fe", borderRadius: 6, padding: "4px 10px", background: "#faf5ff", width: 180 }}
                                  />
                                </div>

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
                                        <RefChip label={refsMap[key] || lbl} />
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
                                    <RefChip label="Sft" />
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
                                              <NumInput value={sheet[field] ?? ""} onChange={(v) => updateSheetField(subSheetId, field, v)} placeholder="0" min={0} style={{ width: "100%", fontSize: 13, padding: "3px 8px" }} />
                                            </td>
                                            <td style={{ padding: "4px 8px", borderBottom: "1px solid #ede9fe", whiteSpace: "nowrap" }}>
                                              {varName && <RefChip label={varName} style={{ fontSize: 11, padding: "1px 6px" }} />}
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
                                              <NumInput value={cf.value ?? 0} onChange={(v) => { const upd = (sheet.customFields || []).map((f) => f.id === cf.id ? { ...f, value: v } : f); updateSheetField(subSheetId, "customFields", upd); }} placeholder="0" style={{ width: "100%", fontSize: 13, padding: "3px 8px" }} />
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
                                                {cf.ref && <GripChip refName={cf.ref} />}
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
                                  extraButtons: <button onClick={() => setCutSheetOpen(true)} style={{ background: "#0369a1", padding: "4px 14px", fontSize: 12 }} title="Shows the whole box's cut list — including every sub-sheet, not just this one">📋 Cut Sheet</button>,
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
                                  ? `1. Sheet Calculation and Cut List${sheet.name ? ` — ${sheet.name}` : ""}`
                                  :`${numbering} Sheet Calculation and Cut List — ${sheet.name || "Sub Sheet"}`;
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
                                            confirmDeleteSubSheetId === subSheetId ? (
                                          <>
                                            <span style={{ fontSize: 11, color: "#fecaca", fontWeight: 600 }}>Delete?</span>
                                            <button onClick={() => { deleteSubSheet(subSheetId); setConfirmDeleteSubSheetId(null); }} style={{ background: "#dc2626", padding: "3px 10px", fontSize: 11 }}>Yes</button>
                                            <button onClick={() => setConfirmDeleteSubSheetId(null)} style={{ background: "#6b7280", padding: "3px 10px", fontSize: 11 }}>No</button>
                                          </>
                                        ) : (
                                          <button onClick={() => setConfirmDeleteSubSheetId(subSheetId)} style={{ background: "#dc2626", padding: "3px 10px", fontSize: 11 }}>Delete</button>
                                        )
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
                      // including custom groups not in the fixed GROUP_OPTIONS list. Wood/
                      // Laminate get a single room-wide AUTO row per material below (real
                      // sheet nesting), not a per-box one.
                      const dynamicGroups = Array.from(new Set([
                        ...GROUP_OPTIONS,
                        ...(prices || []).map((p) => p.group || "").filter(Boolean),
                      ]));
                      const allRows = [];
                      // Wood/Laminate AUTO rows are room-wide (real sheet nesting spans
                      // every box, so they can't be split per box without overstating the
                      // sheet count) — one combined "All Boxes" row per material, the same
                      // numbers "3. Material Summary" shows.
                      computeSheetRows().forEach((r) => {
                        allRows.push({
                          id: `sheet_${r.material}`, materialName: r.material, base: r.base, extra: r.extra,
                          unit: r.unit, auto: true, autoType: "sheet",
                          boxId: "all", boxName: "All Boxes",
                        });
                      });
                      // Same "All Boxes" combined treatment as sheet rows, for
                      // non-Wood/Laminate cut-list materials priced per sqft
                      // (glass, mirrors, etc.) — real area used, not a sheet count.
                      computeAreaRows().forEach((r) => {
                        allRows.push({
                          id: `area_${r.material}`, materialName: r.material, base: r.base, extra: r.extra,
                          unit: r.unit, auto: true, autoType: "sheet",
                          boxId: "all", boxName: "All Boxes",
                        });
                      });
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
                          if (hw.materialName === "Fevicol Merino" || (Number(tapeDivisor) > 0 && hw.materialName === TAPE_ITEM)) return; // now auto-calculated in Material Summary instead
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
                      const oversizedPieces = computeOversizedPieces();

                      return (
                        <div style={{ marginTop: 16 }}>
                          <SectionHeader
                            title="2. Material Details — All Boxes"
                            open={openSections.hardware}
                            onToggle={() => toggleSection("hardware")}
                            style={{ marginTop: 0 }}
                          />
                          {openSections.hardware && (
                            <div style={{ border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "10px 10px 6px", background: "#fff" }}>
                              {oversizedPieces.length > 0 && (
                                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", marginBottom: 10, fontSize: 12, color: "#991b1b" }}>
                                  <strong>⚠ {oversizedPieces.length} part{oversizedPieces.length !== 1 ? "s" : ""} too large for its stock sheet</strong> — dropped from the sheet count below instead of being silently ignored. Fix the part's size or the material's sheet size in Material Models.
                                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                                    {oversizedPieces.map((p, i) => (
                                      <li key={i}>{p.label ? `${p.label} — ` : ""}{p.material}: {p.w}×{p.h}mm doesn't fit a {p.sheetW}×{p.sheetH}mm sheet in either orientation</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
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
                                                    <NumInput min={0} value={hw.base}
                                                      onChange={(v) => updateHardwareItem(hw.boxId, hw.id, "qty", Math.max(0, v))}
                                                      style={{ width: 56, fontSize: 12, padding: "2px 4px", textAlign: "center" }} />
                                                  )}
                                                </td>
                                                <td style={{ padding: "3px 10px", borderBottom: "1px solid #ede9fe", textAlign: "center" }}>
                                                  <input type="number" min={0} step={hw.auto ? 0.5 : 1} value={hw.extra || ""} placeholder="0"
                                                    onChange={(e) => {
                                                      if (hw.autoType === "edge") setEdgeExtraMtr(e.target.value);
                                                      else if (hw.autoType === "carpenter") setCarpenterExtraSft(e.target.value);
                                                      else if (hw.autoType === "sheet") setMaterialStockSettings((prev) => ({ ...prev, [hw.materialName]: { ...(prev?.[hw.materialName] || {}), extraQty: e.target.value } }));
                                                      else updateHardwareItem(hw.boxId, hw.id, "extra", e.target.value);
                                                    }}
                                                    onBlur={(e) => {
                                                      const v = Math.max(0, Number(e.target.value) || 0);
                                                      if (hw.autoType === "edge") setEdgeExtraMtr(v);
                                                      else if (hw.autoType === "carpenter") setCarpenterExtraSft(v);
                                                      else if (hw.autoType === "sheet") setMaterialStockSettings((prev) => ({ ...prev, [hw.materialName]: { ...(prev?.[hw.materialName] || {}), extraQty: v } }));
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
                                            <NumInput min={0} value={hw.base}
                                              onChange={(v) => updateHardwareItem(hw.boxId, hw.id, "qty", Math.max(0, v))}
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
                      // Sum of every "Include in Quotation" box's Quotation Details area
                      // (quotationAreaSft — H × W from Quotation Details, falling back to
                      // Section 1's H/W when left blank) in this room — the denominator
                      // for the per-sqft cost row below the Total, matching what the
                      // actual Project Quotation counts.
                      const totalAreaSft = boxes
                        .filter((b) => b.includeInQuotation !== false)
                        .reduce((s, b) => s + quotationAreaSft(b), 0);
                      const oversizedPieces = computeOversizedPieces();
                      return (
                        <div style={{ marginTop: 16 }}>
                          {oversizedPieces.length > 0 && (
                            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 12px", marginBottom: 8, fontSize: 12, color: "#991b1b" }}>
                              <strong>⚠ {oversizedPieces.length} part{oversizedPieces.length !== 1 ? "s" : ""} too large for its stock sheet</strong> — excluded from the sheet counts below (see "2. Material Details" for which parts).
                            </div>
                          )}
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
                                <div style={{ padding: "8px 14px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Fevicol Merino qty = </span>
                                  <input
                                    type="number" step="0.05" min={0}
                                    value={fevicolMultiplier}
                                    disabled={calcLocked}
                                    onChange={(e) => setFevicolMultiplier(e.target.value)}
                                    onBlur={(e) => setFevicolMultiplier(Math.max(0, Number(e.target.value) || 0))}
                                    style={{ width: 60, fontSize: 12, padding: "3px 6px", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: 5 }}
                                  />
                                  <span style={{ fontSize: 12, color: "#6b7280" }}>× total Inside + Outside Laminate sheets required</span>
<span style={{ width: 1, alignSelf: "stretch", background: "#e5e7eb", margin: "0 4px" }} />
<span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Masking Tape qty = edge band (m) ÷</span>
<input
  type="number" step="1" min={0}
  value={tapeDivisor}
  disabled={calcLocked}
  onChange={(e) => setTapeDivisor(e.target.value)}
  onBlur={(e) => setTapeDivisor(Math.max(0, Number(e.target.value) || 0))}
  style={{ width: 50, fontSize: 12, padding: "3px 6px", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: 5 }}
/>
<span style={{ fontSize: 12, color: "#6b7280" }}>(rounded up; 0 = type tapes per box){calcLocked ? " · same for every room — change in App Settings" : ""}</span>
                                  <span style={{ width: 1, alignSelf: "stretch", background: "#e5e7eb", margin: "0 4px" }} />
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>GST</span>
                                  <input
                                    type="number" step="1" min={0}
                                    value={gstPercent}
                                    disabled={calcLocked}
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
                                      <tr key={`${row.group}::${row.material}::${row.boxLabel || ""}`} style={{ background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                                        {row._groupFirst && (
                                          <td rowSpan={row._groupSpan} style={{ padding: "8px 14px", borderBottom: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb", color: "#6b7280", verticalAlign: "top", background: "#fff" }}>{row.group}</td>
                                        )}
                                        <td style={{ padding: "8px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, color: "#111827" }}>
                                          {row.material}
                                          {row.boxLabel && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: "#6b7280" }}>— {row.boxLabel}</span>}
                                        </td>
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
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Lead Source</label>
                <select value={pForm.leadSource} onChange={(e) => updatePForm({ leadSource: e.target.value })}>
                  <option value="">— Select —</option>
                  {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {pForm.leadSource === "reference" && (
                <div>
                  <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Referred By</label>
                  <input
                    value={pForm.referredBy}
                    onChange={(e) => updatePForm({ referredBy: e.target.value })}
                    placeholder="e.g. Suresh (past client)"
                  />
                </div>
              )}
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

      {addServiceTarget && (
        <AddServiceModal
          onClose={() => setAddServiceTarget(null)}
          onAdded={(name) => {
            const t = addServiceTarget;
            if (t.active) updateBoxFields({ serviceType: name, serviceItem: "" });
            else if (t.table) setShownServicesByProject((p) => ({ ...p, [selectedProject.id]: [...(p[selectedProject.id] || []), name] }));
          }}
        />
      )}

      {templatePickerOpen && (
        <TemplatePickerModal
          templates={templates}
          folders={templateFolders}
          onSelect={(t) => {
            setTemplatePickerOpen(false);
            if (reqTemplateRoomId != null) {
              const target = subProjects.find((s) => s.id === reqTemplateRoomId);
              setReqTemplateRoomId(null);
              const n = (target?.boxes || []).length;
              if (n > 0 && !window.confirm(`Apply template "${t.templateName}" to ${target.subProject}? This will replace its ${n} existing box${n !== 1 ? "es" : ""}.`)) return;
              applyTemplate(t, reqTemplateRoomId);
              return;
            }
            if (boxes.length > 0) {
              setPendingTemplate(t);
            } else {
              applyTemplate(t);
            }
          }}
          onClose={() => { setTemplatePickerOpen(false); setReqTemplateRoomId(null); }}
        />
      )}

      {boxMatPicker && (
        <MaterialModelPicker
          label={boxMatPicker.label}
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
        <MaterialModelPicker
          label="Material Details"
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
          {...kerfProps}
          title={activeBox.boxName || activeBox.name || ""}
          subtitle={`${activeBox.widthMm || ""}W × ${activeBox.heightMm || ""}H × ${activeBox.depthMm || ""}D mm`}
          onClose={() => setCutSheetOpen(false)}
        />
      )}

      {/* ── Cut Sheet Optimizer Modal (all boxes in this room) ── */}
      {allCutSheetOpen && activeRoom && (
        <CutSheetOptimizer
          rows={generateAllBoxesCutSheet()}
          {...kerfProps}
          title={activeRoom.subProject || "All Boxes"}
          subtitle={`All Boxes · ${boxes.length} box${boxes.length !== 1 ? "es" : ""}`}
          onClose={() => setAllCutSheetOpen(false)}
        />
      )}
    </div>
  );
}

export default Projects;
