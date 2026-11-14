// One rule for "what rate does a Material Models / Material Analysis cell give
// a material under Economy / Standard / Premium?" — used by the Material
// Summary (templates and projects), BOQ, Quotation and the Material Models /
// Material Analysis tables, so they can never disagree.
//
//   1. A cell tied to an Items Pricing row (picked with 🔍 → priceId, or its
//      brand matches a row of that material) always shows that row's CURRENT
//      rate — edit it in Items Pricing.
//   2. A cell the user typed a rate into (manual) or a brand that matches no
//      row keeps its own rate. This is the real rate (baseRate); older cells
//      also stored a profit-inflated `rate` which is never used — profit is
//      decided in the Quotation tab only.
//   3. Anything else (no brand, nothing typed) follows Items Pricing: the
//      material's first row.

const norm = (s) => (s || "").trim().toLowerCase();

// The cell's own real rate, or 0 when it has none that should be honoured.
export function ownRate(cell) {
  if (!cell) return 0;
  const v = Number(cell.baseRate || cell.rate) || 0;
  if (!v) return 0;
  return cell.manual || norm(cell.brand) ? v : 0;
}

// The Items Pricing row a cell is tied to, or null.
export function linkedPriceRow(cell, material, prices) {
  if (!cell) return null;
  const sameName = (prices || []).filter((p) => p.materialName === material);
  return (cell.priceId && sameName.find((p) => p.id === cell.priceId))
    || (norm(cell.brand) && sameName.find((p) => norm(p.brand) === norm(cell.brand)))
    || null;
}

// The rate INCLUDING GST (the item's own GST %) — what every calculation uses.
export function resolveInclRate(cell, material, prices) {
  const r = resolveModelRate(cell, material, prices);
  return r.rate * (1 + (Number(r.gst) || 0) / 100);
}

// → { rate (excl. GST), gst, brand, row, linked, own }
export function resolveModelRate(cell, material, prices) {
  const linked = linkedPriceRow(cell, material, prices);
  if (linked) return { rate: Number(linked.rate) || 0, gst: Number(linked.gst ?? 18), brand: linked.brand || "", row: linked, linked: true, own: false };
  const own = ownRate(cell);
  if (own) {
    const g = cell.gst !== undefined && cell.gst !== "" ? Number(cell.gst) : 18;
    return { rate: own, gst: g, brand: cell.brand || "", row: null, linked: false, own: true };
  }
  const row = (prices || []).find((p) => p.materialName === material) || null;
  return { rate: row ? Number(row.rate) || 0 : 0, gst: row ? Number(row.gst ?? 18) : 18, brand: row?.brand || "", row, linked: false, own: false };
}
