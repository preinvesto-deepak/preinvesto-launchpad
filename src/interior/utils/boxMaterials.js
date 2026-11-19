// Box-level material selection, shared by Projects and Template Master.
export const SHEET_MAT_FIELDS = [
  ["Door Ply", "matDoor"], ["Back Ply", "matBack"], ["Carcass Ply", "matCarcas"],
  ["Outside Laminate 1", "matOutsideLaminate"], ["Inside Laminate", "matInsideLaminate"],
  ["Edge Beading 1", "matEdgeBeading"],
];
// ── Box-level material selection ("Quotation Details" → Material Selection) ──
// box.qMat holds the materials picked once for the whole box. Every sheet (the
// box's own "1." and each sub sheet) that is "Same as Quotation Details" gets
// them copied in, parts included. A sheet without the explicit flag counts as
// the same when its materials already match (or are still empty), so nothing
// changes in existing projects until someone edits the selection.
export const MASTER_FIELDS = SHEET_MAT_FIELDS.map(([, f]) => f);
export const matNameOf = (obj, f, prices) => {
  const id = obj?.[`${f}Id`];
  return id != null ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? obj?.[f] ?? "") : (obj?.[f] || "");
};
// The selection always lists Outside Laminate 2 and Edge Beading 2 after their
// first rows; any a sheet already has under those names are picked up.
export const defaultMasterCustom = (box) => [
  { id: 1001, label: "Outside Laminate 2", after: "matOutsideLaminate" },
  { id: 1002, label: "Edge Beading 2", after: "matEdgeBeading" },
].map((d) => {
  const own = (box?.customMaterials || []).find((c) => (c.label || "").trim().toLowerCase() === d.label.toLowerCase());
  return { ...d, value: own?.value || "", itemId: own?.itemId ?? null };
});
export const masterMatsOf = (box) => {
  let m;
  if (box?.qMat) m = { ...box.qMat };
  else {
    m = {};
    MASTER_FIELDS.forEach((f) => { m[f] = box?.[f] ?? ""; m[`${f}Id`] = box?.[`${f}Id`] ?? null; });
  }
  if (!Array.isArray(m.custom)) m.custom = defaultMasterCustom(box);
  else {
    // the two standing rows are always there; a same-named row added earlier becomes that row
    const defs = defaultMasterCustom(box);
    const have = m.custom.map((c) => {
      const d = defs.find((x) => x.label.toLowerCase() === (c.label || "").trim().toLowerCase());
      return d && !c.after ? { ...c, after: d.after } : c;
    });
    const missing = defs.filter((d) => !have.some((c) => c.after === d.after));
    m.custom = [...missing, ...have];
  }
  return m;
};
// Edge band a part was told to use (Sheets Calculation "EB" drop-down):
// "1" = the sheet's Edge Beading 1, "2" = its Edge Beading 2 row. "" (Auto) or an
// empty selection returns "" so callers fall back to their own default.
export const explicitEdgeBand = (part, sheet, prices) => {
  const c = part?.edgeBand;
  if (!c) return "";
  const nm = (name, id) => id != null
    ? ((prices || []).find((pr) => pr.id === id)?.materialName ?? name ?? "")
    : ((prices || []).some((pr) => pr.materialName === name) ? name : "");
  if (c === "2") {
    const cm = (sheet?.customMaterials || []).find((m) => (m.label || "").trim().toLowerCase() === "edge beading 2");
    return cm ? nm(cm.value, cm.itemId ?? null) : "";
  }
  return nm(sheet?.matEdgeBeading, sheet?.matEdgeBeadingId ?? null);
};
export const sheetUsesMaster = (sheet, box, prices) => {
  if (sheet?.useBoxMat != null) return sheet.useBoxMat !== false;
  const m = masterMatsOf(box);
  return MASTER_FIELDS.every((f) => { const a = matNameOf(sheet, f, prices); return !a || a === matNameOf(m, f, prices); });
};
export const renamePartMats = (parts, oldMat, newMat, oldId, newId) => (parts || []).map((p) => {
  const mM = (oldId != null && p.materialId === oldId) || (p.material === oldMat && p.materialId == null);
  const mA = (oldId != null && p.sideAId === oldId) || (p.sideA === oldMat && p.sideAId == null);
  const mB = (oldId != null && p.sideBId === oldId) || (p.sideB === oldMat && p.sideBId == null);
  return {
    ...p,
    ...(mM ? { material: newMat, materialId: newId ?? null } : {}),
    ...(mA ? { sideA: newMat, sideAId: newId ?? null } : {}),
    ...(mB ? { sideB: newMat, sideBId: newId ?? null } : {}),
  };
});
export const applyMasterToSheet = (sheet, master, prices) => {
  const upd = {};
  let parts = sheet.parts;
  MASTER_FIELDS.forEach((f) => {
    const newMat = matNameOf(master, f, prices);
    if (!newMat) return; // an empty slot in the selection leaves the sheet alone
    const newId = master[`${f}Id`] ?? null;
    const oldMat = matNameOf(sheet, f, prices);
    const oldId = sheet[`${f}Id`] ?? null;
    if (oldMat === newMat && oldId === newId) return;
    upd[f] = newMat; upd[`${f}Id`] = newId;
    if ((oldMat && oldMat !== newMat) || (oldId != null && oldId !== newId)) parts = renamePartMats(parts, oldMat, newMat, oldId, newId);
  });
  // Extra materials added in the selection ("+ Add Material"): kept on the sheet
  // as rows tagged fromMaster, so they can be updated or removed later.
  const mc = master.custom || [];
  const cur = sheet.customMaterials || [];
  if (mc.length || cur.some((c) => c.fromMaster != null)) {
    const next = cur.filter((c) => c.fromMaster == null || mc.some((m) => m.id === c.fromMaster));
    mc.forEach((m) => {
      const val = m.itemId != null ? ((prices || []).find((pr) => pr.id === m.itemId)?.materialName ?? m.value ?? "") : (m.value || "");
      const itemId = m.itemId ?? null;
      let i = next.findIndex((c) => c.fromMaster === m.id);
      if (i < 0 && (m.label || "").trim()) {
        // a row the sheet already has under the same name becomes the selection's row
        i = next.findIndex((c) => c.fromMaster == null && (c.label || "").trim().toLowerCase() === m.label.trim().toLowerCase());
        if (i >= 0) next[i] = { ...next[i], fromMaster: m.id };
      }
      if (i < 0) {
        if (!val) return; // nothing chosen yet: no blank row on the sheet
        next.push({ id: Date.now() + Math.floor(Math.random() * 100000), label: m.label || "", value: val, itemId, fromMaster: m.id });
        return;
      }
      if (!val) { next[i] = { ...next[i], label: m.label || next[i].label || "" }; return; }
      const o = next[i];
      if (o.value && o.value !== val && val) parts = renamePartMats(parts, o.value, val, o.itemId ?? null, itemId);
      next[i] = { ...o, label: m.label || "", value: val, itemId };
    });
    if (JSON.stringify(next) !== JSON.stringify(cur)) upd.customMaterials = next;
  }
  return Object.keys(upd).length ? { ...sheet, ...upd, parts } : sheet;
};
// New selection for the whole box: pushed into every sheet that follows it.
export const applyMasterToBox = (box, master, prices) => {
  const mainSynced = sheetUsesMaster(box, box, prices);
  const subs = (box.subSheets || []).map((sub) => sheetUsesMaster(sub, box, prices) ? { ...applyMasterToSheet(sub, master, prices), useBoxMat: true } : sub);
  const main = mainSynced ? { ...applyMasterToSheet(box, master, prices), useBoxMat: true } : box;
  return { ...main, qMat: master, subSheets: subs };
};


// Room-level selection: pushed into every sheet of the box except those the
// user has explicitly unticked ("Same materials" off), even when the sheet had
// other materials before. The box keeps the room's selection as its own.
export const applyMasterToBoxForce = (box, master, prices) => {
  const f = (sh) => sh.useBoxMat === false ? sh : { ...applyMasterToSheet(sh, master, prices), useBoxMat: true };
  return { ...f(box), qMat: master, subSheets: (box.subSheets || []).map(f) };
};
