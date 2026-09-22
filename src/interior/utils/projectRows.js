/**
 * Shared row-generation helpers for turning a Project's applied-template
 * rooms/boxes into flat cut-list rows — the same source of truth used by
 * the Cut Sheet Optimizer and the per-box Material Summary in Projects.jsx.
 *
 * This lets BOQ/Quotation pages compute real material quantities (and real
 * nested sheet counts via computeSheetCounts) directly from a project's
 * actual applied templates.
 */

import { mmToFeet } from "./unitConversions";

const DEFAULT_REFS = {
  heightMm: "H", widthMm: "W", depthMm: "D",
  doorsH: "DoorsH", doorsV: "DoorsV",
  backParts: "BackParts", partitions: "VP", shelves: "Shelves",
};

export function boxVars(box) {
  const refs = { ...DEFAULT_REFS, ...(box.refs || {}) };
  const result = {};
  Object.entries(refs).forEach(([field, varName]) => {
    if (varName) result[varName] = Number(box[field]) || 0;
  });
  (box.customFields || []).forEach(({ ref, value }) => {
    if (ref) result[ref] = Number(value) || 0;
  });
  return result;
}

export function resolveFormula(expr, vars) {
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

/**
 * A box's own cut-list parts plus every Sub Sheet Calculation's parts
 * (Section 1's "+ Add Sub Sheet" — e.g. drawers living inside a Wardrobe
 * box), each with its own H/W/D-derived vars, so callers can treat a box's
 * total cut-list as one flat list without caring whether a part came from
 * the box itself or one of its sub-sheets. A sheet with its "Include in
 * Material Calculation" checkbox off contributes no parts here — the single
 * point where that opt-out is enforced for BOQ/Quotation/Cut Sheet Optimizer.
 * returns: [{ label, vars, parts }]
 */
function boxPartGroups(box) {
  const baseLabel = box.shortName || box.boxName || box.name || "";
  const partsOf = (sheet) => sheet.includeInMaterialCalc === false ? [] : (sheet.parts || []);
  const groups = [{ label: baseLabel, vars: boxVars(box), parts: partsOf(box) }];
  (box.subSheets || []).forEach((sub) => {
    groups.push({
      label: `${baseLabel} ${sub.name || ""}`.trim(),
      vars: boxVars(sub),
      parts: partsOf(sub),
    });
  });
  return groups;
}

/**
 * Flat cut-list rows for a single box — mirrors Projects.jsx's own
 * generateCutSheet(), generalized to take a box + prices directly. Includes
 * the box's Sub Sheet Calculations (see boxPartGroups) so drawers etc. added
 * under a box are counted in the same Cut Sheet Optimizer/BOQ/Quotation runs.
 * returns: [{ w, h, qty, material, label, rowNum }]
 */
export function buildBoxRows(box, prices) {
  const rows = [];
  const rmat = (name, id) => id != null ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name) : name;
  let rowNum = 0;
  boxPartGroups(box).forEach(({ label: groupLabel, vars, parts }) => {
    (parts || []).forEach((part) => {
      if (part.req === false) return;
      const w = resolveFormula(part.widthMm, vars);
      const h = resolveFormula(part.heightMm, vars);
      const qty = resolveFormula(part.qty, vars);
      if (!w || !h || w === "?" || h === "?" || !qty || qty === "?") return;
      rowNum += 1;
      const label = `${groupLabel} ${part.partName || ""}`.trim();
      const push = (mat) => { if (mat) rows.push({ rowNum, w, h, qty, material: mat, label }); };
      if (part.material || part.materialId) push(rmat(part.material, part.materialId));
      if (part.sideA    || part.sideAId)   push(rmat(part.sideA,    part.sideAId));
      if (part.sideB    || part.sideBId)   push(rmat(part.sideB,    part.sideBId));
    });
  });
  return rows;
}

/** Flat rows for every box in a single room. */
export function buildRoomRows(room, prices) {
  return (room.boxes || []).flatMap((box) => buildBoxRows(box, prices));
}

const rmat = (name, id, prices) => id != null ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name) : name;

/**
 * Edge banding required for one box, in mm — sums each required part edge
 * (top/bottom use the piece's width, left/right use its height) × qty.
 * Mirrors the per-part edge flags already tracked in Sheets Calculation.
 * returns: { material, lengthMm }
 */
export function buildBoxEdgeBanding(box, prices) {
  let lengthMm = 0;
  boxPartGroups(box).forEach(({ vars, parts }) => {
    (parts || []).forEach((part) => {
      if (part.req === false) return;
      const w = resolveFormula(part.widthMm, vars);
      const h = resolveFormula(part.heightMm, vars);
      const qty = resolveFormula(part.qty, vars);
      if (!w || !h || w === "?" || h === "?" || !qty || qty === "?") return;
      let perPiece = 0;
      if (part.edgeTopReq    !== false) perPiece += w;
      if (part.edgeBottomReq !== false) perPiece += w;
      if (part.edgeLeftReq   !== false) perPiece += h;
      if (part.edgeRightReq  !== false) perPiece += h;
      lengthMm += perPiece * qty;
    });
  });
  return { material: rmat(box.matEdgeBeading, box.matEdgeBeadingId, prices), lengthMm };
}

/** Edge banding for every box in a room, grouped by material — { [material]: lengthMm } */
export function buildRoomEdgeBanding(room, prices) {
  const totals = {};
  (room.boxes || []).forEach((box) => {
    const { material, lengthMm } = buildBoxEdgeBanding(box, prices);
    if (!material || !lengthMm) return;
    totals[material] = (totals[material] || 0) + lengthMm;
  });
  return totals;
}

/**
 * Hardware/consumable items for every box in a room, grouped by material —
 * { [material]: qty }. qty is base + extra (the same "Final Qty" shown in
 * Projects.jsx's Hardware & Consumables table), not just the base quantity.
 */
export function buildRoomHardware(room) {
  const totals = {};
  (room.boxes || []).forEach((box) => {
    (box.hardwareItems || []).forEach((item) => {
      if (!item.materialName) return;
      const qty = (Number(item.qty) || 0) + (Number(item.extra) || 0);
      if (!qty) return;
      totals[item.materialName] = (totals[item.materialName] || 0) + qty;
    });
  });
  return totals;
}

/**
 * H × W in sq ft for one box, rounded to a whole number — used for the
 * Carpenter cost only (see buildBoxCarpenterRow). Reads the box's
 * quotationHeightMm/quotationWidthMm (set below Box Name, independent of
 * Section 1's H/W used for Sheet Calculation) when present, falling back to
 * the Section 1 H/W for boxes that predate that field. Not the same as
 * {Sft} inside cut-list part formulas, which always stays on Section 1's
 * H/W via boxVars — deliberately untouched by this.
 */
export function boxAreaSft(box) {
  const hMm = Number(box.quotationHeightMm) || Number(box.heightMm) || 0;
  const wMm = Number(box.quotationWidthMm) || Number(box.widthMm) || 0;
  return hMm && wMm ? Math.round(mmToFeet(hMm) * mmToFeet(wMm)) : 0;
}

/**
 * Carpenter row for one box — appears the moment a Box Type is chosen (Box
 * Type shares the same list as the Carpenter group in Items Pricing), qty =
 * that box's Area Sft + the room's carpenter wastage buffer. Uses
 * quotationBoxType (set below Box Name) when present, falling back to
 * Section 1's Box Type for boxes that predate that field.
 * returns: { material, qty } | null (null when the box has no Box Type set)
 */
export function buildBoxCarpenterRow(box, extraSft = 0) {
  const boxType = box.quotationBoxType || box.boxType;
  if (!boxType) return null;
  const base = boxAreaSft(box);
  const extra = Math.max(0, Number(extraSft) || 0);
  return { material: boxType, qty: Math.round((base + extra) * 100) / 100 };
}

/** Carpenter rows for every box in a room, grouped by material — { [material]: qty } */
export function buildRoomCarpenter(room) {
  const totals = {};
  const extraSft = Number(room.carpenterExtraSft) || 0;
  (room.boxes || []).forEach((box) => {
    const row = buildBoxCarpenterRow(box, extraSft);
    if (!row) return;
    totals[row.material] = (totals[row.material] || 0) + row.qty;
  });
  return totals;
}

/** Flat rows for every room/box belonging to a project (matched by project name). */
export function buildProjectRows(project, subProjects, prices) {
  if (!project) return [];
  const rooms = (subProjects || []).filter((s) => s.project === project.name);
  return rooms.flatMap((room) =>
    buildRoomRows(room, prices).map((r) => ({ ...r, room: room.subProject || room.name }))
  );
}
