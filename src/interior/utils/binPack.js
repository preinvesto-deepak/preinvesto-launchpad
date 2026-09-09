/**
 * 2D Guillotine Bin Packing — Best Short Side Fit (BSSF) with Max-Area split
 * Suitable for wood/sheet cutting where every cut must run straight edge to
 * edge (a real panel saw). Each sheet tracks a list of free rectangles; a
 * piece is placed into the free rectangle it fits best, then that rectangle
 * is guillotine-split into two smaller free rectangles.
 *
 * This out-performs shelf/row packing because leftover space isn't locked to
 * a single row — a free rectangle from an earlier split can be reused by any
 * later, smaller piece anywhere on the sheet, not just below/right of the
 * current row.
 *
 * Bin packing is NP-hard and a single greedy pass can land on a locally-bad
 * arrangement depending on the order pieces are considered in. Rather than
 * committing to one fixed sort order, each material is packed several times
 * with different orderings (by area, by height, by width, by longest side,
 * by perimeter) and the result using the fewest sheets is kept (ties broken
 * by higher average utilization). This closes most of the gap to dedicated
 * cut-list optimizers without needing an exact/exhaustive solver.
 *
 * rows        : [{ material, w, h, qty, label, rowNum, rotation }]
 *   rotation  : 0 = free (can rotate 90°), 1 = horizontal grain, 2 = vertical grain
 * getStockSize: (material) => { sheetW, sheetH, sheetTexture }
 *   sheetTexture: 0 = no texture, 1 = horizontal grain, 2 = vertical grain
 *
 * Grain rule: when the stock sheet HAS a texture (1 or 2) and the piece is
 * grain-locked (rotation 1 or 2), the piece keeps its original orientation so
 * printed/laminate grain matches the sheet's grain. It only rotates as a last
 * resort, if it cannot be placed on any sheet — new or existing — in its
 * original orientation. When the stock sheet has NO texture (0), or the piece
 * itself is grain-free (rotation 0), the piece is free to rotate for best fit.
 *
 * kerf        : saw blade width in mm (default 0). Reserved as a gap between
 *               a placed piece and the free rectangles split off to its right
 *               and below it, so real offcuts account for material the blade
 *               consumes. Piece dimensions themselves are unchanged.
 *
 * returns     : [{ material, sheetW, sheetH, sheetIndex, placements, utilization }]
 *   placements: [{ x, y, w, h, label, rowNum, rotated, grainDir }]
 *   grainDir  : 0=free, 1=horizontal, 2=vertical (mirrors the rotation field, pre-rotation)
 */

// Candidate processing orders to try per material — the packer keeps whichever wins.
const SORT_ORDERS = [
  (a, b) => b.origW * b.origH - a.origW * a.origH || b.origH - a.origH,         // area desc
  (a, b) => b.origH - a.origH || b.origW - a.origW,                             // height desc
  (a, b) => b.origW - a.origW || b.origH - a.origH,                             // width desc
  (a, b) => Math.max(b.origW, b.origH) - Math.max(a.origW, a.origH)
            || Math.min(b.origW, b.origH) - Math.min(a.origW, a.origH),         // longest side desc
  (a, b) => (b.origW + b.origH) - (a.origW + a.origH),                          // perimeter desc
];

// Pack one material's pieces (already expanded by qty) in a single given
// order. Returns { sheets: [{freeRects, placements}] } — geometry only, no
// material/index tagging yet (the caller adds that once a winner is picked).
function packOneOrder(piecesOrdered, sheetW, sheetH, sheetTexture, k) {
  const getOrientations = (ow, oh, grainDir) => {
    if (ow === oh) return { primary: [[ow, oh, false]], fallback: [] };
    const original = [ow, oh, false];
    const rotated = [oh, ow, true];
    const grainFree = sheetTexture === 0 || grainDir === 0;
    return grainFree
      ? { primary: [original, rotated], fallback: [] }
      : { primary: [original], fallback: [rotated] };
  };

  const sheets = [];
  const newSheet = () => ({ freeRects: [{ x: 0, y: 0, w: sheetW, h: sheetH }], placements: [] });

  // Best Short Side Fit score: how tightly (pw×ph) fits inside a free rect.
  // Lower is better. Returns null if it doesn't fit.
  const fitScore = (rect, pw, ph) => {
    if (pw > rect.w || ph > rect.h) return null;
    const leftoverW = rect.w - pw;
    const leftoverH = rect.h - ph;
    return { shortSide: Math.min(leftoverW, leftoverH), longSide: Math.max(leftoverW, leftoverH) };
  };
  const isBetter = (a, b) =>
    !b || a.shortSide < b.shortSide || (a.shortSide === b.shortSide && a.longSide < b.longSide);

  // Place a piece into freeRects[rectIdx], then guillotine-split the
  // consumed rectangle into up to two new free rectangles. The split axis
  // is chosen to maximise the larger resulting rectangle (keeps big usable
  // offcuts intact for future large pieces, rather than mincing space).
  const placeInRect = (sheet, rectIdx, pw, ph, rot, label, rowNum, grainDir) => {
    const rect = sheet.freeRects[rectIdx];
    sheet.placements.push({ x: rect.x, y: rect.y, w: pw, h: ph, label, rowNum, rotated: rot, grainDir });
    sheet.freeRects.splice(rectIdx, 1);

    const rightW = rect.w - pw - k;
    const bottomH = rect.h - ph - k;

    const variantA = []; // right rect spans full height; bottom rect spans piece width only
    if (rightW > 0) variantA.push({ x: rect.x + pw + k, y: rect.y, w: rightW, h: rect.h });
    if (bottomH > 0) variantA.push({ x: rect.x, y: rect.y + ph + k, w: pw, h: bottomH });

    const variantB = []; // bottom rect spans full width; right rect spans piece height only
    if (bottomH > 0) variantB.push({ x: rect.x, y: rect.y + ph + k, w: rect.w, h: bottomH });
    if (rightW > 0) variantB.push({ x: rect.x + pw + k, y: rect.y, w: rightW, h: ph });

    const maxArea = (v) => v.reduce((m, r) => Math.max(m, r.w * r.h), 0);
    const chosen = maxArea(variantA) >= maxArea(variantB) ? variantA : variantB;
    chosen.forEach((r) => { if (r.w > 0 && r.h > 0) sheet.freeRects.push(r); });
  };

  // Best-Fit search over a given orientation set across all open sheets +
  // free rectangles. Returns true if placed.
  const tryPlace = (oris, label, rowNum, grainDir) => {
    let bestSheet = null, bestRectIdx = -1, bestOri = null, bestScore = null;
    for (const sheet of sheets) {
      sheet.freeRects.forEach((rect, idx) => {
        for (const [pw, ph, rot] of oris) {
          const score = fitScore(rect, pw, ph);
          if (score && isBetter(score, bestScore)) {
            bestScore = score;
            bestSheet = sheet;
            bestRectIdx = idx;
            bestOri = [pw, ph, rot];
          }
        }
      });
    }
    if (bestSheet) {
      const [pw, ph, rot] = bestOri;
      placeInRect(bestSheet, bestRectIdx, pw, ph, rot, label, rowNum, grainDir);
      return true;
    }
    // No existing sheet can fit — open a new one
    for (const [pw, ph, rot] of oris) {
      if (pw <= sheetW && ph <= sheetH) {
        const sheet = newSheet();
        sheets.push(sheet);
        placeInRect(sheet, 0, pw, ph, rot, label, rowNum, grainDir);
        return true;
      }
    }
    return false;
  };

  piecesOrdered.forEach(({ origW, origH, label, rowNum, grainDir }) => {
    const { primary, fallback } = getOrientations(origW, origH, grainDir);
    // Try to keep grain orientation first; only rotate against grain if the
    // piece genuinely cannot be placed any other way.
    if (tryPlace(primary, label, rowNum, grainDir)) return;
    if (fallback.length && tryPlace(fallback, label, rowNum, grainDir)) return;
    // Piece too large for any sheet — skip
  });

  return sheets;
}

export function packSheets(rows, getStockSize, kerf = 0) {
  const k = Math.max(0, +kerf || 0);
  // Expand by qty and group by material
  const byMaterial = {};
  rows.forEach((row) => {
    if (!row.material || !+row.w || !+row.h) return;
    const qty = Math.max(1, Math.round(+row.qty) || 1);
    const grainDir = +row.rotation || 0;
    for (let q = 0; q < qty; q++) {
      (byMaterial[row.material] = byMaterial[row.material] || []).push({
        origW: +row.w, origH: +row.h, label: row.label || "",
        rowNum: row.rowNum || 0, grainDir,
      });
    }
  });

  const allSheets = [];

  Object.entries(byMaterial).forEach(([material, allPieces]) => {
    const { sheetW = 2440, sheetH = 1220, sheetTexture = 1 } = getStockSize(material);

    // Try each candidate ordering, keep whichever uses fewest sheets
    // (tie-broken by higher average utilization — less wasted material).
    let best = null;
    for (const comparator of SORT_ORDERS) {
      const pieces = [...allPieces].sort(comparator);
      const sheets = packOneOrder(pieces, sheetW, sheetH, sheetTexture, k);
      const totalUtil = sheets.reduce((s, sh) => {
        const used = sh.placements.reduce((a, p) => a + p.w * p.h, 0);
        return s + used / (sheetW * sheetH);
      }, 0);
      const avgUtil = sheets.length ? totalUtil / sheets.length : 0;
      if (!best || sheets.length < best.sheets.length || (sheets.length === best.sheets.length && avgUtil > best.avgUtil)) {
        best = { sheets, avgUtil };
      }
    }

    best.sheets.forEach((sh) => {
      const usedArea = sh.placements.reduce((s, p) => s + p.w * p.h, 0);
      allSheets.push({
        material, sheetW, sheetH, placements: sh.placements,
        utilization: Math.round((usedArea / (sheetW * sheetH)) * 100),
      });
    });
  });

  // Tag each sheet with a per-material index
  const matIdx = {};
  return allSheets.map((s) => ({
    ...s,
    sheetIndex: (matIdx[s.material] = (matIdx[s.material] || 0) + 1),
  }));
}

/**
 * Actual required sheet count per material, computed via real nesting
 * (packSheets) instead of a naive area-ratio estimate. Used by BOQ and
 * Quotation pages so cost reflects real waste (leftover offcuts that can't
 * be reused still consume a full sheet), not just total piece area.
 *
 * parts       : [{ material, lengthMm, widthMm, qty, partName }] — the flat
 *               part list used by wardrobe records (lengthMm/widthMm, not w/h).
 * getStockSize: (material) => { sheetW, sheetH } — defaults to 2440×1220.
 * returns     : { [material]: sheetCount }
 */
export function computeSheetCounts(parts, getStockSize = () => ({})) {
  const rows = (parts || [])
    .filter((p) => p.material && +p.lengthMm && +p.widthMm && +p.qty)
    .map((p, idx) => ({
      material: p.material,
      w: +p.lengthMm,
      h: +p.widthMm,
      qty: +p.qty,
      label: p.partName || "",
      rowNum: idx + 1,
      rotation: 0, // legacy parts carry no grain preference — free to rotate for best fit
    }));

  const sheets = packSheets(rows, getStockSize, 0);
  const counts = {};
  sheets.forEach((s) => { counts[s.material] = (counts[s.material] || 0) + 1; });
  return counts;
}
