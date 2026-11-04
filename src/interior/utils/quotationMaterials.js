import { buildRoomRows, buildRoomEdgeBanding, buildRoomHardware, buildRoomCarpenter } from "./projectRows";
import { computeSheetCounts } from "./binPack";

// What the project needs, worked out exactly the way the Quotation prices it
// (see computeRoomCost in ProjectQuotation.jsx), so Σ qty × rate here equals the
// Quotation's Sub Total for the same pricing model:
//   • sheets    — nested room by room (not the whole project at once), so each
//                 room rounds up on its own; every cut-list material is counted
//                 in sheets, as the Quotation does
//   • edge band — metres per room, rounded to 2 decimals, then added up
//   • hardware, transportation and carpenter — each room's own lines
// `rooms` are the quotation's rooms: only boxes included in the quotation, and
// no service boxes (those are listed by serviceAnalysisRows).
export function quotationMaterialRows(rooms, prices, materialStockSettings) {
  const getStock = (mat) => {
    const s = materialStockSettings?.[mat];
    return { sheetW: s?.sheetW || 2440, sheetH: s?.sheetH || 1220, sheetTexture: s?.sheetTexture ?? 1 };
  };
  const totals = new Map(); // material -> { qty, unit }
  const add = (material, qty, unit) => {
    if (!material || !qty) return;
    const cur = totals.get(material) || { qty: 0, unit };
    cur.qty += qty;
    totals.set(material, cur);
  };

  (rooms || []).forEach((room) => {
    const rows = buildRoomRows(room, prices);
    const sheets = computeSheetCounts(
      rows.map((r) => ({ material: r.material, lengthMm: r.w, widthMm: r.h, qty: r.qty })),
      getStock
    );
    Object.entries(sheets).forEach(([mat, n]) => add(mat, n, "Sheet"));

    Object.entries(buildRoomEdgeBanding(room, prices)).forEach(([mat, lengthMm]) =>
      add(mat, Math.round((lengthMm / 1000) * 100) / 100, "Mtr"));

    const unitOf = (mat) => (prices || []).find((p) => p.materialName === mat)?.unit || "Nos";
    Object.entries(buildRoomHardware(room)).forEach(([mat, qty]) => add(mat, qty, unitOf(mat)));
    Object.entries(buildRoomCarpenter(room)).forEach(([mat, qty]) => add(mat, qty, unitOf(mat)));
  });

  return [...totals.entries()].map(([material, { qty, unit }]) => ({
    material,
    group: (prices || []).find((p) => p.materialName === material)?.group || "Other",
    requiredQty: Math.round(qty * 100) / 100,
    unit,
  })).sort((a, b) => a.group.localeCompare(b.group) || a.material.localeCompare(b.material));
}
