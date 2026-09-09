import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAppData } from "../context/AppDataContext";
import { roundTo2, formatCurrency, mmToFeet } from "../utils/unitConversions";
import { buildRoomRows, buildRoomEdgeBanding, buildRoomHardware, buildRoomCarpenter } from "../utils/projectRows";
import { computeSheetCounts } from "../utils/binPack";

const QUOT_MODELS = ["economy", "standard", "premium"];
const QUOT_MODEL_LABELS = { economy: "Economy", standard: "Standard", premium: "Premium" };
const QUOT_MODEL_COLORS = { economy: "#059669", standard: "#2563eb", premium: "#7c3aed" };

// Rate lookup shared by wood/laminate, edge banding, and hardware — project
// Material Models rate for the selected variant, falling back to Items
// Pricing. When falling back, Profit % for that model is applied on top —
// the project's own Profit % if it's been set there, else the global
// Material Models template's Profit % (the Material Models table already
// bakes profit into any explicit per-material override it saves, so that
// branch doesn't need it again here — only the un-overridden fallback does).
function rateFor(material, model, projectObj, prices, globalProfitPercent) {
  if (model) {
    const modelEntry = projectObj?.materialModelRates?.[material]?.[model];
    if (modelEntry?.rate) return Number(modelEntry.rate);
  }
  const rateData = prices.find((p) => p.materialName === material);
  const base = rateData ? Number(rateData.rate) : 0;
  let profit = 0;
  if (model) {
    const projectProfit = (projectObj?.materialModelProfitPercent || {})[model];
    profit = projectProfit !== undefined && projectProfit !== null && projectProfit !== ""
      ? Number(projectProfit) || 0
      : Number((globalProfitPercent || {})[model]) || 0;
  }
  return base * (1 + profit / 100);
}

// Room's Area (sq ft) = Σ (H ft × W ft) of every box — the box's own
// footprint, same formula/rounding as Area Sft ({Sft}) elsewhere in the app
// (Projects.jsx / TemplateMaster.jsx) — not the total cut-piece surface area
// (which double-counts a panel's Ply + Laminate faces as separate rows).
function roomAreaSft(room) {
  return (room.boxes || []).reduce((sum, box) => sum + boxAreaSftQ(box), 0);
}

// Same per-box formula/rounding roomAreaSft sums over — kept as its own
// function so a room's boxes can be priced/displayed as separate rows while
// still adding back up to exactly roomAreaSft(room).
function boxAreaSftQ(box) {
  const hMm = Number(box.heightMm) || 0;
  const wMm = Number(box.widthMm) || 0;
  return hMm && wMm ? Math.ceil(mmToFeet(hMm) * mmToFeet(wMm)) : 0;
}

// Annotates each item with `roomSpan` — the number of rows its room's name
// should visually merge over (relies on same-room items being consecutive,
// which buildLineItems guarantees via rooms.flatMap). 0 means "this row is a
// continuation of the room above it — don't render the Room cell at all".
function withRoomRowSpans(items) {
  return items.map((item, i) => {
    if (i > 0 && items[i - 1].roomName === item.roomName) return { ...item, roomSpan: 0 };
    let span = 1;
    while (items[i + span] && items[i + span].roomName === item.roomName) span++;
    return { ...item, roomSpan: span };
  });
}

// Real nested sheet count + edge banding + hardware for a room's actual
// boxes/parts, priced via the project's Material Models rates (falling back
// to global Items Pricing) — including Transportation and Carpenter, both
// item-priced from whatever was picked in Items Pricing/Box Type.
function computeRoomCost(room, model, projectObj, prices, materialStockSettings, globalProfitPercent) {
  const rate = (mat) => rateFor(mat, model, projectObj, prices, globalProfitPercent);
  const rows = buildRoomRows(room, prices);
  const getStockSize = (mat) => {
    const s = materialStockSettings?.[mat];
    return { sheetW: s?.sheetW || 2440, sheetH: s?.sheetH || 1220, sheetTexture: s?.sheetTexture ?? 1 };
  };
  const sheetCounts = computeSheetCounts(
    rows.map((r) => ({ material: r.material, lengthMm: r.w, widthMm: r.h, qty: r.qty })),
    getStockSize
  );
  const materials = [...new Set(rows.map((r) => r.material))];
  const areaSqMm = rows.reduce((s, r) => s + r.w * r.h * r.qty, 0);
  const woodAmount = materials.reduce((total, mat) =>
    total + (sheetCounts[mat] || 0) * rate(mat), 0);

  const edgeTotals = buildRoomEdgeBanding(room, prices);
  const edgeAmount = Object.entries(edgeTotals).reduce((total, [mat, lengthMm]) => {
    const meters = Math.round((lengthMm / 1000) * 100) / 100;
    return total + meters * rate(mat);
  }, 0);

  // Manually-added Hardware & Consumables — Transportation and Carpenter split
  // out into their own totals so nothing double-counts against the Carpenter
  // auto-row below.
  const hwTotals = buildRoomHardware(room);
  const priceGroupOf = (mat) => prices.find((p) => p.materialName === mat)?.group;
  const hardwareAmount = Object.entries(hwTotals).reduce((total, [mat, qty]) => {
    const g = priceGroupOf(mat);
    if (g === "Transportation" || g === "Carpenter") return total;
    return total + qty * rate(mat);
  }, 0);
  const transportationAmount = Object.entries(hwTotals).reduce((total, [mat, qty]) =>
    priceGroupOf(mat) === "Transportation" ? total + qty * rate(mat) : total, 0);
  const manualCarpenterAmount = Object.entries(hwTotals).reduce((total, [mat, qty]) =>
    priceGroupOf(mat) === "Carpenter" ? total + qty * rate(mat) : total, 0);

  // Carpenter auto-row (Box Type × Area Sft), item-priced the same as any
  // other material.
  const carpTotals = buildRoomCarpenter(room);
  const carpenterAmount = Object.entries(carpTotals).reduce((total, [mat, qty]) =>
    total + qty * rate(mat), 0) + manualCarpenterAmount;
  const laborAmount = carpenterAmount;

  const totalAmount = woodAmount + edgeAmount + hardwareAmount + transportationAmount + laborAmount;
  return { woodAmount, edgeAmount, hardwareAmount, transportationAmount, laborAmount, totalAmount, areaSqMm };
}

// MRP-vs-net-rate savings for a room, counting only materials whose Items
// Pricing entry has an MRP set and "Show MRP savings in Project Quotation"
// checked. This is independent of the selected pricing Model — it reflects
// the supplier discount already baked into the item's own Rate, not any
// markup applied later in this quotation, so "you saved ₹X" always means
// the discount the supplier actually gave, not a moving target.
function computeRoomMrpSavings(room, prices, materialStockSettings) {
  const rows = buildRoomRows(room, prices);
  const getStockSize = (mat) => {
    const s = materialStockSettings?.[mat];
    return { sheetW: s?.sheetW || 2440, sheetH: s?.sheetH || 1220, sheetTexture: s?.sheetTexture ?? 1 };
  };
  const sheetCounts = computeSheetCounts(
    rows.map((r) => ({ material: r.material, lengthMm: r.w, widthMm: r.h, qty: r.qty })),
    getStockSize
  );
  const materials = [...new Set(rows.map((r) => r.material))];
  const edgeTotals = buildRoomEdgeBanding(room, prices);
  const hwTotals = buildRoomHardware(room);
  const carpTotals = buildRoomCarpenter(room);

  let mrpTotal = 0;
  let netTotal = 0;
  const addIfEligible = (mat, qty) => {
    const p = prices.find((pr) => pr.materialName === mat);
    if (!p || !(Number(p.mrp) > 0) || p.showInQuotation === false || !qty) return;
    const gstMult = 1 + (Number(p.gst) || 0) / 100;
    mrpTotal += qty * Number(p.mrp) * gstMult;
    netTotal += qty * Number(p.rate || 0) * gstMult;
  };

  materials.forEach((mat) => addIfEligible(mat, sheetCounts[mat] || 0));
  Object.entries(edgeTotals).forEach(([mat, lengthMm]) => addIfEligible(mat, Math.round((lengthMm / 1000) * 100) / 100));
  Object.entries(hwTotals).forEach(([mat, qty]) => addIfEligible(mat, qty));
  Object.entries(carpTotals).forEach(([mat, qty]) => addIfEligible(mat, qty));

  return { mrpTotal, netTotal, savings: mrpTotal - netTotal };
}

// Itemized MRP-vs-Discount breakdown for Hardware & Consumables only (edge
// banding, hardware, handles, glue, addons, tape, hinges/sliders,
// transportation, carpenter — everything except the Wood/Laminate sheet
// materials, which get their own aggregate line in the savings banner) —
// summed across every room in the project. Feeds the Quotation's dedicated
// "Hardware & Consumables — Your Discount" page so the customer can see
// exactly which fittings/consumables they're saving on and by how much.
// Inclusion is controlled purely by each item's own "Show in Quotation"
// checkbox in Items Pricing — not by whether MRP/Discount happen to be
// filled in, so unchecking is the only way to hide an item here; one with
// no MRP set just shows 0 discount instead of being silently dropped.
function computeHardwareMrpSavingsItems(projectRooms, prices) {
  const byMaterial = {};
  projectRooms.forEach((room) => {
    const edgeTotals = buildRoomEdgeBanding(room, prices);
    Object.entries(edgeTotals).forEach(([mat, lengthMm]) => {
      const meters = Math.round((lengthMm / 1000) * 100) / 100;
      byMaterial[mat] = (byMaterial[mat] || 0) + meters;
    });
    const hwTotals = buildRoomHardware(room);
    Object.entries(hwTotals).forEach(([mat, qty]) => {
      byMaterial[mat] = (byMaterial[mat] || 0) + qty;
    });
    const carpTotals = buildRoomCarpenter(room);
    Object.entries(carpTotals).forEach(([mat, qty]) => {
      byMaterial[mat] = (byMaterial[mat] || 0) + qty;
    });
  });

  return Object.entries(byMaterial)
    .map(([material, qty]) => {
      const p = prices.find((pr) => pr.materialName === material);
      if (!p || p.showInQuotation === false || !qty) return null;
      const mrp = Number(p.mrp) || 0;
      const rate = Number(p.rate) || 0;
      const gstMult = 1 + (Number(p.gst) || 0) / 100;
      const netAmount = qty * rate * gstMult;
      // No MRP set on this item → nothing to compare against, so show it
      // with zero discount rather than a misleading negative "savings".
      const mrpAmount = mrp > 0 ? qty * mrp * gstMult : netAmount;
      const discountPercent = mrp > 0 ? ((mrp - rate) / mrp) * 100 : 0;
      return {
        material, group: p.group || "Other", unit: p.unit || "",
        qty: roundTo2(qty), mrp, rate, discountPercent: roundTo2(discountPercent),
        mrpAmount, netAmount, savings: mrpAmount - netAmount,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.group || "").localeCompare(b.group) || a.material.localeCompare(b.material));
}

// Flat cut-list rows (every panel, every box) across every room in the
// project, each tagged with its room name — feeds the Quotation's dedicated
// Cut List page so the customer can see exactly what's being cut, not just
// the priced totals.
function buildProjectCutListRows(projectRooms, prices) {
  const rows = [];
  projectRooms.forEach((room) => {
    const roomName = room.subProject || room.name;
    buildRoomRows(room, prices).forEach((r) => {
      rows.push({ ...r, room: roomName });
    });
  });
  return rows;
}

function ProjectQuotation({ initialProjectName, lockProject = false } = {}) {
  const { projects, setProjects, subProjects, prices, materialStockSettings, materialModelProfitPercent } = useAppData();

  const [selectedProject, setSelectedProject] = useState(initialProjectName || projects[0]?.name || "");

  // Embedded mode (inside a Project's own Quotation tab) — stay pinned to
  // that project even if the caller re-renders with a different name (e.g.
  // switching Projects while this tab is active).
  useEffect(() => {
    if (lockProject && initialProjectName) setSelectedProject(initialProjectName);
  }, [lockProject, initialProjectName]);
  const [selectedModel, setSelectedModel] = useState(""); // "" = default cost

  const [companyName, setCompanyName] = useState("Interior App");
  const [companyMobile, setCompanyMobile] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");

  const [quotationNo, setQuotationNo] = useState("PRJ-QTN-001");
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split("T")[0]);

  const [markupPercent, setMarkupPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [gstPercent, setGstPercent] = useState(18);

  const [validityDays, setValidityDays] = useState(7);
  const [advancePercent, setAdvancePercent] = useState(50);
  const [deliveryDays, setDeliveryDays] = useState(30);
  const [scopeIncluded, setScopeIncluded] = useState(
    "Material supply, fabrication, delivery, and installation for listed items."
  );
  const [scopeExcluded, setScopeExcluded] = useState(
    "Civil, electrical shifting, plumbing, painting, and site rectification unless specified."
  );
  const [termsText, setTermsText] = useState(
    "Final site measurements and finish selection to be reconfirmed before production."
  );

  // In-page print/preview modal — an <iframe srcDoc> instead of window.open(),
  // so it isn't at the mercy of the browser's popup blocker (which silently
  // swallowed window.open() for some users, making the buttons look "dead").
  const [previewDoc, setPreviewDoc] = useState(null); // { title, html, autoPrint }
  const previewIframeRef = useRef(null);

  const selectedProjectObj = useMemo(
    () => projects.find((p) => p.name === selectedProject),
    [projects, selectedProject]
  );

  // Customer details come from the project record itself (entered once when
  // the project was created) instead of a separate editable copy here — one
  // source of truth, no risk of the two drifting apart.
  const customerName = selectedProjectObj?.client || "";
  const customerMobile = selectedProjectObj?.contact || "";
  const customerAddress = selectedProjectObj?.address || selectedProjectObj?.location || "";

  const projectRooms = useMemo(
    () => subProjects.filter((s) => s.project === selectedProject),
    [subProjects, selectedProject]
  );

  // Persist every quotation-settings field on the project itself (like
  // materialModelRates / room extra-buffers elsewhere in the app) so nothing
  // is lost switching tabs, reloading, or coming back later — was previously
  // local-only state that reset on every unmount.
  useEffect(() => {
    const saved = selectedProjectObj?.quotationSettings || {};
    setSelectedModel(saved.selectedModel ?? "");
    setCompanyName(saved.companyName ?? "Interior App");
    setCompanyMobile(saved.companyMobile ?? "");
    setCompanyEmail(saved.companyEmail ?? "");
    setQuotationNo(saved.quotationNo ?? "PRJ-QTN-001");
    // Always today's date on open — a quotation date should reflect when
    // it's actually being generated, not freeze at whatever date it was
    // first saved on (which could be days/weeks stale by the time you're
    // back here). Still fully editable per visit for backdating if needed,
    // just not persisted across sessions.
    setQuotationDate(new Date().toISOString().split("T")[0]);
    setMarkupPercent(saved.markupPercent ?? 0);
    setDiscountAmount(saved.discountAmount ?? 0);
    setGstPercent(saved.gstPercent ?? 18);
    setValidityDays(saved.validityDays ?? 7);
    setAdvancePercent(saved.advancePercent ?? 50);
    setDeliveryDays(saved.deliveryDays ?? 30);
    setScopeIncluded(saved.scopeIncluded ?? "Material supply, fabrication, delivery, and installation for listed items.");
    setScopeExcluded(saved.scopeExcluded ?? "Civil, electrical shifting, plumbing, painting, and site rectification unless specified.");
    setTermsText(saved.termsText ?? "Final site measurements and finish selection to be reconfirmed before production.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject]);

  // Write-through: every field's onChange calls this alongside its own
  // setState, so the project record always reflects the latest edit.
  const persistField = (key, value) => {
    if (!selectedProjectObj) return;
    setProjects((prev) => prev.map((p) =>
      p.id === selectedProjectObj.id
        ? { ...p, quotationSettings: { ...(p.quotationSettings || {}), [key]: value } }
        : p
    ));
  };

  // One row per box (not per room) — e.g. a room with a "Box" and two
  // "Frame" boxes shows 3 separate rows. Sheet-nesting/edge-banding/hardware
  // costs are still computed once for the whole room (nesting boxes together
  // is what makes material usage efficient), then each box's row gets its
  // proportional share of that room total by its own Area (sq ft), so the
  // rows still add up to exactly the room's real cost.
  const buildLineItems = (rooms, model) =>
    rooms.flatMap((room) => {
      const cost = computeRoomCost(room, model, selectedProjectObj, prices, materialStockSettings, materialModelProfitPercent);
      const roomName = room.subProject || room.name;
      const boxes = room.boxes || [];
      if (boxes.length === 0) {
        return [{
          id: room.id,
          roomName,
          boxCount: 0,
          typeOfWork: "—",
          areaSqFt: 0,
          costTotal: 0,
          woodAmount: 0, edgeAmount: 0, hardwareAmount: 0, transportationAmount: 0, laborAmount: 0, totalAmount: 0, areaSqMm: 0,
        }];
      }
      const roomTotalArea = roomAreaSft(room);
      return boxes.map((box, idx) => {
        const boxArea = boxAreaSftQ(box);
        const share = roomTotalArea > 0 ? boxArea / roomTotalArea : 1 / boxes.length;
        return {
          id: `${room.id}-${idx}`,
          roomName,
          boxCount: 1,
          typeOfWork: box.boxType || "—",
          areaSqFt: boxArea,
          costTotal: cost.totalAmount * share,
          woodAmount: cost.woodAmount * share,
          edgeAmount: cost.edgeAmount * share,
          hardwareAmount: cost.hardwareAmount * share,
          transportationAmount: cost.transportationAmount * share,
          laborAmount: cost.laborAmount * share,
          totalAmount: cost.totalAmount * share,
          areaSqMm: cost.areaSqMm * share,
        };
      });
    });

  const lineItems = useMemo(
    () => buildLineItems(projectRooms, selectedModel),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectRooms, prices, selectedModel, selectedProjectObj, materialStockSettings, materialModelProfitPercent]
  );

  // MRP-vs-net savings across every room — items only, not model-adjusted
  // (see computeRoomMrpSavings above for why).
  const mrpSavings = useMemo(() => {
    return projectRooms.reduce((acc, room) => {
      const s = computeRoomMrpSavings(room, prices, materialStockSettings);
      return { mrpTotal: acc.mrpTotal + s.mrpTotal, netTotal: acc.netTotal + s.netTotal, savings: acc.savings + s.savings };
    }, { mrpTotal: 0, netTotal: 0, savings: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRooms, prices, materialStockSettings]);

  // Itemized Hardware & Consumables MRP/Discount breakdown — feeds the
  // Quotation's dedicated savings page (see computeHardwareMrpSavingsItems).
  const hardwareMrpItems = useMemo(
    () => computeHardwareMrpSavingsItems(projectRooms, prices),
    [projectRooms, prices]
  );

  // Flat cut-list rows across every room — feeds the Quotation's Cut List page.
  const cutListRows = useMemo(
    () => buildProjectCutListRows(projectRooms, prices),
    [projectRooms, prices]
  );

  const costTotal = lineItems.reduce((s, i) => s + i.costTotal, 0);
  const markupAmount = (costTotal * Number(markupPercent || 0)) / 100;
  const subTotal = costTotal + markupAmount;
  const netAmount = subTotal - Number(discountAmount || 0);
  const gstAmount = (netAmount * Number(gstPercent || 0)) / 100;
  const grandTotal = netAmount + gstAmount;
  const advanceAmount = (netAmount * Number(advancePercent || 0)) / 100;

  // Amount shown per room is GST-inclusive — each room's proportional share
  // of Grand Total (not Sub Total) — so the Rooms table's Amount column adds
  // up to the same Grand Total shown below, not a pre-GST figure.
  const itemsWithSelling = lineItems.map((item) => {
    const proportion = costTotal > 0 ? item.costTotal / costTotal : 0;
    const sellingAmount = grandTotal * proportion;
    return { ...item, sellingAmount };
  });

  // ── Print / Preview helpers ──────────────────────────────────────────────
  // Opening a standalone window (instead of window.print()'ing the live page)
  // keeps the printed/previewed output to just the quotation — important now
  // that this component is also embedded inside a Project's own tab, where
  // window.print() on the live DOM would otherwise pick up the surrounding
  // project chrome (tabs, room boxes, etc.) too.
  const fmtCurrency = (n) =>
    "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const buildVariant = (model) => {
    const items = buildLineItems(projectRooms, model);
    const ct = items.reduce((s, i) => s + i.costTotal, 0);
    const mu = (ct * Number(markupPercent || 0)) / 100;
    const st = ct + mu;
    const net = st - Number(discountAmount || 0);
    const gst = (net * Number(gstPercent || 0)) / 100;
    const gt = net + gst;
    const adv = (net * Number(advancePercent || 0)) / 100;
    // GST-inclusive, same as the on-screen itemsWithSelling — proportional
    // share of Grand Total (gt), not Sub Total (st).
    const withSelling = items.map((item) => {
      const prop = ct > 0 ? item.costTotal / ct : 0;
      return { ...item, sellingAmount: gt * prop };
    });
    return { model, items: withSelling, ct, st, net, gst, gt, adv };
  };

  const variantPageHTML = (v, pageBreakBefore) => {
    const modelLabel = v.model ? `${QUOT_MODEL_LABELS[v.model]} Variant` : "Default (Cost Rates)";
    const modelColor = v.model ? QUOT_MODEL_COLORS[v.model] : "#2563eb";
    const qtnSuffix = v.model ? `-${v.model.toUpperCase()[0]}` : "";
    return `
      <div style="page-break-before:${pageBreakBefore ? "always" : "avoid"};padding:30px;font-family:sans-serif">
        <div style="display:flex;justify-content:space-between;margin-bottom:20px">
          <div>
            <h2 style="margin:0">${companyName}</h2>
            <p style="margin:4px 0;color:#6b7280">Project Quotation — <span style="color:${modelColor};font-weight:700">${modelLabel}</span></p>
            ${companyMobile ? `<p style="margin:4px 0"><strong>Mobile:</strong> ${companyMobile}</p>` : ""}
            ${companyEmail ? `<p style="margin:4px 0"><strong>Email:</strong> ${companyEmail}</p>` : ""}
          </div>
          <div style="text-align:right">
            <p style="margin:4px 0"><strong>Quotation No:</strong> ${quotationNo}${qtnSuffix}</p>
            <p style="margin:4px 0"><strong>Date:</strong> ${quotationDate}</p>
            <p style="margin:4px 0"><strong>Customer:</strong> ${customerName || "-"}</p>
            ${customerMobile ? `<p style="margin:4px 0"><strong>Mobile:</strong> ${customerMobile}</p>` : ""}
          </div>
        </div>
        <p><strong>Project:</strong> ${selectedProject}</p>
        <h3>Rooms</h3>
        <table border="1" cellpadding="7" cellspacing="0" width="100%" style="margin-bottom:16px;font-size:13px">
          <thead style="background:#f9fafb">
            <tr><th>#</th><th>Room</th><th>Type of Work</th><th>Area (sq ft)</th><th>Cost/Sft</th><th>Amount (Incl. GST)</th></tr>
          </thead>
          <tbody>
            ${withRoomRowSpans(v.items)
              .map(
                (item, i) => `
              <tr>
                <td>${i + 1}</td>
                ${item.roomSpan > 0 ? `<td rowspan="${item.roomSpan}">${item.roomName}</td>` : ""}
                <td>${item.typeOfWork}</td>
                <td>${item.areaSqFt}</td>
                <td style="text-align:right">${item.areaSqFt > 0 ? `${fmtCurrency(item.sellingAmount / item.areaSqFt)}/sqft` : "—"}</td>
                <td style="text-align:right">${fmtCurrency(item.sellingAmount)}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
        ${mrpSavings.mrpTotal > 0 ? `
        <div style="padding:12px 14px;border:1px solid #a7f3d0;background:#ecfdf5;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:13px;font-weight:700;color:#065f46">You save ${fmtCurrency(mrpSavings.savings)} vs MRP</div>
            <div style="font-size:11px;color:#047857;margin-top:2px">MRP Value ${fmtCurrency(mrpSavings.mrpTotal)} &rarr; Your Price ${fmtCurrency(mrpSavings.netTotal)} (incl. GST, on items with MRP set)</div>
          </div>
          <div style="font-size:20px;font-weight:800;color:#059669">${roundTo2((mrpSavings.savings / mrpSavings.mrpTotal) * 100)}% OFF</div>
        </div>` : ""}
        <div style="display:flex;justify-content:flex-end;margin-bottom:20px">
          <table border="1" cellpadding="7" cellspacing="0" style="min-width:300px;font-size:13px">
            <tbody>
              <tr style="background:#f3f4f6"><td><strong>Sub Total</strong></td><td><strong>${fmtCurrency(v.st)}</strong></td></tr>
              ${Number(discountAmount) > 0 ? `<tr><td>Discount</td><td>- ${fmtCurrency(discountAmount)}</td></tr>` : ""}
              <tr><td>GST ${gstPercent}%</td><td>${fmtCurrency(v.gst)}</td></tr>
              <tr style="background:${modelColor}22"><td><strong>Grand Total</strong></td><td><strong style="color:${modelColor}">${fmtCurrency(v.gt)}</strong></td></tr>
              <tr><td>Advance ${advancePercent}%</td><td>${fmtCurrency(v.adv)}</td></tr>
            </tbody>
          </table>
        </div>
        <p><strong>Scope Included:</strong> ${scopeIncluded}</p>
        <p><strong>Scope Excluded:</strong> ${scopeExcluded}</p>
        <p>Validity: ${validityDays} days · Delivery: ${deliveryDays} days · ${termsText}</p>
        <div style="margin-top:40px;display:flex;justify-content:space-between">
          <div style="width:45%"><p><strong>Customer Acceptance</strong></p><div style="border-top:1px solid #000;margin-top:50px"/></div>
          <div style="width:45%;text-align:right"><p><strong>Authorized Signatory</strong></p><div style="border-top:1px solid #000;margin-top:50px"/></div>
        </div>
      </div>
      ${hardwareMrpItems.length > 0 ? `
      <div style="page-break-before:always;padding:30px;font-family:sans-serif">
        <h2 style="margin:0 0 4px">${companyName}</h2>
        <p style="margin:0 0 16px;color:#6b7280">Hardware &amp; Consumables — Your Discount <span style="color:${modelColor};font-weight:700">(${modelLabel})</span></p>
        <table border="1" cellpadding="7" cellspacing="0" width="100%" style="font-size:12px">
          <thead>
            <tr>
              ${["Group", "Item", "Qty", "Unit", "MRP (₹)", "Your Rate (₹)", "Discount %", "MRP Amount", "Your Amount", "You Save"]
                .map((h) => `<th style="background:#1e3a5f;color:#fff">${h}</th>`)
                .join("")}
            </tr>
          </thead>
          <tbody>
            ${hardwareMrpItems
              .map(
                (row) => `
              <tr>
                <td>${row.group}</td>
                <td>${row.material}</td>
                <td style="text-align:center">${row.qty}</td>
                <td style="text-align:center">${row.unit}</td>
                <td style="text-align:right">${row.mrp > 0 ? `₹${row.mrp.toLocaleString("en-IN")}` : "—"}</td>
                <td style="text-align:right">₹${row.rate.toLocaleString("en-IN")}</td>
                <td style="text-align:center;color:${row.mrp > 0 ? "#059669" : "#9ca3af"};font-weight:700">${row.mrp > 0 ? `${row.discountPercent}%` : "—"}</td>
                <td style="text-align:right">${row.mrp > 0 ? fmtCurrency(row.mrpAmount) : "—"}</td>
                <td style="text-align:right">${fmtCurrency(row.netAmount)}</td>
                <td style="text-align:right;color:${row.mrp > 0 ? "#059669" : "#9ca3af"};font-weight:700">${row.mrp > 0 ? fmtCurrency(row.savings) : "—"}</td>
              </tr>`
              )
              .join("")}
          </tbody>
          <tfoot>
            <tr style="background:#ecfdf5;font-weight:700">
              <td colspan="7" style="text-align:right">Total You Save on Hardware &amp; Consumables</td>
              <td style="text-align:right">${fmtCurrency(hardwareMrpItems.reduce((s, r) => s + r.mrpAmount, 0))}</td>
              <td style="text-align:right">${fmtCurrency(hardwareMrpItems.reduce((s, r) => s + r.netAmount, 0))}</td>
              <td style="text-align:right;color:#059669">${fmtCurrency(hardwareMrpItems.reduce((s, r) => s + r.savings, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>` : ""}
      ${cutListRows.length > 0 ? `
      <div style="page-break-before:always;padding:30px;font-family:sans-serif">
        <h2 style="margin:0 0 4px">${companyName}</h2>
        <p style="margin:0 0 16px;color:#6b7280">Cut List <span style="color:${modelColor};font-weight:700">(${modelLabel})</span></p>
        <table border="1" cellpadding="6" cellspacing="0" width="100%" style="font-size:11px">
          <thead>
            <tr>
              ${["#", "Room", "Label", "Material", "W (mm)", "H (mm)", "Qty"]
                .map((h) => `<th style="background:#1e3a5f;color:#fff">${h}</th>`)
                .join("")}
            </tr>
          </thead>
          <tbody>
            ${cutListRows
              .map(
                (row, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${row.room}</td>
                <td>${row.label || ""}</td>
                <td>${row.material || ""}</td>
                <td style="text-align:center">${row.w}</td>
                <td style="text-align:center">${row.h}</td>
                <td style="text-align:center">${row.qty}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>` : ""}`;
  };

  // Shows the print-ready HTML in the in-page preview modal (an iframe, not
  // a popup window) — works regardless of the browser's popup blocker.
  // autoPrint=true fires the iframe's print dialog once its content loads.
  const showPreview = (bodyHTML, title, autoPrint) => {
    setPreviewDoc({ title, html: bodyHTML, autoPrint });
  };

  const printAllVariants = () => {
    const html = QUOT_MODELS.map((m, vi) => variantPageHTML(buildVariant(m), vi > 0)).join("");
    showPreview(html, "Project Quotation — All 3 Variants", true);
  };

  // Print Preview — shows the currently selected pricing model's quotation
  // in the in-page preview modal (no page chrome), print dialog included so
  // the browser's native preview pane shows before anything actually prints.
  const openPrintPreview = () => {
    const html = variantPageHTML(buildVariant(selectedModel), false);
    showPreview(html, "Project Quotation — Print Preview", true);
  };

  // One-click PDF download — writes real PDF bytes with jsPDF and triggers a
  // normal file download directly, no print dialog step required (unlike
  // "Print / Save as PDF", which still needs the user to manually choose
  // Save-as-PDF and a location in the browser's print dialog). Same fix
  // pattern used for the Cut Sheet Optimizer's PDF export. jsPDF's built-in
  // fonts don't have a ₹ glyph, so amounts use "Rs." here instead.
  const downloadQuotationPDF = () => {
    const fmtPdf = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const v = buildVariant(selectedModel);
    const modelLabel = v.model ? `${QUOT_MODEL_LABELS[v.model]} Variant` : "Default (Cost Rates)";
    const qtnSuffix = v.model ? `-${v.model.toUpperCase()[0]}` : "";

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 16;

    doc.setFontSize(16);
    doc.text(companyName || "Interior App", margin, y);
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(`Project Quotation - ${modelLabel}`, margin, y + 6);
    doc.setTextColor(0);

    let ry = 16;
    doc.setFontSize(9);
    const rightX = pageW - margin;
    doc.text(`Quotation No: ${quotationNo}${qtnSuffix}`, rightX, ry, { align: "right" }); ry += 5;
    doc.text(`Date: ${quotationDate}`, rightX, ry, { align: "right" }); ry += 5;
    doc.text(`Customer: ${customerName || "-"}`, rightX, ry, { align: "right" }); ry += 5;
    if (customerMobile) { doc.text(`Mobile: ${customerMobile}`, rightX, ry, { align: "right" }); ry += 5; }
    if (customerAddress) { doc.text(`Address: ${customerAddress}`, rightX, ry, { align: "right" }); ry += 5; }

    y = Math.max(y + 10, ry) + 4;
    doc.setFontSize(10);
    doc.text(`Project: ${selectedProject}`, margin, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["#", "Room", "Type of Work", "Area (sqft)", "Cost/Sft", "Amount (Incl. GST)"]],
      body: withRoomRowSpans(v.items).map((item, i) => {
        const row = [i + 1];
        if (item.roomSpan > 0) row.push({ content: item.roomName, rowSpan: item.roomSpan });
        row.push(
          item.typeOfWork, item.areaSqFt,
          item.areaSqFt > 0 ? `${fmtPdf(item.sellingAmount / item.areaSqFt)}/sqft` : "-",
          fmtPdf(item.sellingAmount),
        );
        return row;
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 95] },
      theme: "grid",
    });
    y = doc.lastAutoTable.finalY + 6;

    if (mrpSavings.mrpTotal > 0) {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(167, 243, 208);
      doc.roundedRect(margin, y, pageW - margin * 2, 16, 2, 2, "FD");
      doc.setFontSize(10);
      doc.setTextColor(6, 95, 70);
      doc.text(`You save ${fmtPdf(mrpSavings.savings)} vs MRP`, margin + 4, y + 6);
      doc.setFontSize(8);
      doc.setTextColor(4, 120, 87);
      doc.text(`MRP Value ${fmtPdf(mrpSavings.mrpTotal)} -> Your Price ${fmtPdf(mrpSavings.netTotal)}`, margin + 4, y + 11);
      doc.setFontSize(12);
      doc.setTextColor(5, 150, 105);
      doc.text(`${roundTo2((mrpSavings.savings / mrpSavings.mrpTotal) * 100)}% OFF`, pageW - margin - 4, y + 9, { align: "right" });
      doc.setTextColor(0);
      y += 22;
    }

    const totalsBody = [["Sub Total", fmtPdf(v.st)]];
    if (Number(discountAmount) > 0) totalsBody.push(["Discount", `- ${fmtPdf(discountAmount)}`]);
    totalsBody.push([`GST ${gstPercent}%`, fmtPdf(v.gst)]);
    totalsBody.push(["Grand Total", fmtPdf(v.gt)]);
    totalsBody.push([`Advance ${advancePercent}%`, fmtPdf(v.adv)]);
    autoTable(doc, {
      startY: y,
      margin: { left: pageW - margin - 80, right: margin },
      tableWidth: 80,
      body: totalsBody,
      styles: { fontSize: 9 },
      theme: "grid",
    });
    y = doc.lastAutoTable.finalY + 8;

    doc.setFontSize(9);
    const wrapW = pageW - margin * 2;
    const scopeIncLines = doc.splitTextToSize(`Scope Included: ${scopeIncluded}`, wrapW);
    doc.text(scopeIncLines, margin, y); y += scopeIncLines.length * 4 + 2;
    const scopeExcLines = doc.splitTextToSize(`Scope Excluded: ${scopeExcluded}`, wrapW);
    doc.text(scopeExcLines, margin, y); y += scopeExcLines.length * 4 + 2;
    const termsLines = doc.splitTextToSize(`Validity: ${validityDays} days . Delivery: ${deliveryDays} days . ${termsText}`, wrapW);
    doc.text(termsLines, margin, y); y += termsLines.length * 4 + 14;

    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(9);
    doc.text("Customer Acceptance", margin, y);
    doc.line(margin, y + 14, margin + 70, y + 14);
    doc.text("Authorized Signatory", pageW - margin - 70, y);
    doc.line(pageW - margin - 70, y + 14, pageW - margin, y + 14);

    if (hardwareMrpItems.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text("Hardware & Consumables - Your Discount", margin, 16);
      autoTable(doc, {
        startY: 22,
        margin: { left: margin, right: margin },
        head: [["Group", "Item", "Qty", "Unit", "MRP", "Your Rate", "Disc %", "MRP Amt", "Your Amt", "You Save"]],
        body: hardwareMrpItems.map((r) => [
          r.group, r.material, r.qty, r.unit,
          r.mrp > 0 ? fmtPdf(r.mrp) : "-", fmtPdf(r.rate),
          r.mrp > 0 ? `${r.discountPercent}%` : "-",
          r.mrp > 0 ? fmtPdf(r.mrpAmount) : "-", fmtPdf(r.netAmount),
          r.mrp > 0 ? fmtPdf(r.savings) : "-",
        ]),
        foot: [["", "", "", "", "", "", "Total", fmtPdf(hardwareMrpItems.reduce((s, r) => s + r.mrpAmount, 0)), fmtPdf(hardwareMrpItems.reduce((s, r) => s + r.netAmount, 0)), fmtPdf(hardwareMrpItems.reduce((s, r) => s + r.savings, 0))]],
        styles: { fontSize: 7 },
        headStyles: { fillColor: [30, 58, 95] },
        footStyles: { fillColor: [236, 253, 245], textColor: [5, 150, 105], fontStyle: "bold" },
        theme: "grid",
      });
    }

    if (cutListRows.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text("Cut List", margin, 16);
      autoTable(doc, {
        startY: 22,
        margin: { left: margin, right: margin },
        head: [["#", "Room", "Label", "Material", "W (mm)", "H (mm)", "Qty"]],
        body: cutListRows.map((r, i) => [i + 1, r.room, r.label || "", r.material || "", r.w, r.h, r.qty]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [30, 58, 95] },
        theme: "grid",
      });
    }

    const fileSafe = (selectedProject || "Quotation").replace(/[^\w-]+/g, "_");
    doc.save(`Quotation_${fileSafe}${qtnSuffix}_${quotationDate}.pdf`);
  };

  const inputRow = { display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center", marginBottom: 8 };
  const labelStyle = { fontWeight: 600, fontSize: 13 };
  const activeModel = selectedModel;
  const modelColor = activeModel ? QUOT_MODEL_COLORS[activeModel] : "#2563eb";

  if (!projects.length) {
    return (
      <div className="page-card">
        <h2>Project Quotation</h2>
        <p>No projects found. Create a project first.</p>
      </div>
    );
  }

  return (
    <div className="page-card">
      <div className="no-print" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Project Quotation Settings</h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <div>
            <h4 style={{ margin: "0 0 10px" }}>Project</h4>
            <div style={inputRow}>
              <span style={labelStyle}>Project</span>
              {lockProject ? (
                <span style={{ fontWeight: 600 }}>{selectedProject}</span>
              ) : (
                <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div style={inputRow}>
              <span style={labelStyle}>Pricing Model</span>
              <select value={selectedModel} onChange={(e) => { setSelectedModel(e.target.value); persistField("selectedModel", e.target.value); }}>
                <option value="">Default (Cost Rates)</option>
                {QUOT_MODELS.map((m) => (
                  <option key={m} value={m}>{QUOT_MODEL_LABELS[m]}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px" }}>Company</h4>
            <div style={inputRow}><span style={labelStyle}>Company Name</span><input type="text" value={companyName} onChange={(e) => { setCompanyName(e.target.value); persistField("companyName", e.target.value); }} /></div>
            <div style={inputRow}><span style={labelStyle}>Mobile</span><input type="text" value={companyMobile} onChange={(e) => { setCompanyMobile(e.target.value); persistField("companyMobile", e.target.value); }} /></div>
            <div style={inputRow}><span style={labelStyle}>Email</span><input type="text" value={companyEmail} onChange={(e) => { setCompanyEmail(e.target.value); persistField("companyEmail", e.target.value); }} /></div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px" }}>Customer <span style={{ fontWeight: 400, fontSize: 11, color: "#9ca3af" }}>(from Project)</span></h4>
            <div style={inputRow}><span style={labelStyle}>Name</span><span>{customerName || "—"}</span></div>
            <div style={inputRow}><span style={labelStyle}>Mobile</span><span>{customerMobile || "—"}</span></div>
            <div style={inputRow}><span style={labelStyle}>Address</span><span>{customerAddress || "—"}</span></div>
            {!lockProject && (
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
                Edit client details from the Projects page ("✏ Edit Info").
              </p>
            )}
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px" }}>Quotation & Pricing</h4>
            <div style={inputRow}><span style={labelStyle}>Quotation No</span><input type="text" value={quotationNo} onChange={(e) => { setQuotationNo(e.target.value); persistField("quotationNo", e.target.value); }} /></div>
            <div style={inputRow}><span style={labelStyle}>Date</span><input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} /></div>
            <div style={inputRow}><span style={labelStyle}>Markup %</span><input type="number" value={markupPercent} onChange={(e) => { setMarkupPercent(e.target.value); persistField("markupPercent", e.target.value); }} /></div>
            <div style={inputRow}><span style={labelStyle}>Discount (₹)</span><input type="number" value={discountAmount} onChange={(e) => { setDiscountAmount(e.target.value); persistField("discountAmount", e.target.value); }} /></div>
            <div style={inputRow}><span style={labelStyle}>GST %</span><input type="number" value={gstPercent} onChange={(e) => { setGstPercent(e.target.value); persistField("gstPercent", e.target.value); }} /></div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px" }}>Terms</h4>
            <div style={inputRow}><span style={labelStyle}>Validity (days)</span><input type="number" value={validityDays} onChange={(e) => { setValidityDays(e.target.value); persistField("validityDays", e.target.value); }} /></div>
            <div style={inputRow}><span style={labelStyle}>Advance %</span><input type="number" value={advancePercent} onChange={(e) => { setAdvancePercent(e.target.value); persistField("advancePercent", e.target.value); }} /></div>
            <div style={inputRow}><span style={labelStyle}>Delivery (days)</span><input type="number" value={deliveryDays} onChange={(e) => { setDeliveryDays(e.target.value); persistField("deliveryDays", e.target.value); }} /></div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px" }}>Scope & Terms Text</h4>
            <textarea placeholder="Included Scope" value={scopeIncluded} onChange={(e) => { setScopeIncluded(e.target.value); persistField("scopeIncluded", e.target.value); }} rows="2" style={{ width: "100%", marginBottom: 8 }} />
            <textarea placeholder="Excluded Scope" value={scopeExcluded} onChange={(e) => { setScopeExcluded(e.target.value); persistField("scopeExcluded", e.target.value); }} rows="2" style={{ width: "100%", marginBottom: 8 }} />
            <textarea placeholder="Terms Text" value={termsText} onChange={(e) => { setTermsText(e.target.value); persistField("termsText", e.target.value); }} rows="2" style={{ width: "100%" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button
            onClick={() => showPreview(variantPageHTML(buildVariant(selectedModel), false), "Project Quotation — Print Preview", false)}
            style={{ background: "#0891b2" }}
            title="Shows a clean preview of just this quotation — no print dialog"
          >
            👁 Print Preview{activeModel ? ` — ${QUOT_MODEL_LABELS[activeModel]} Variant` : ""}
          </button>
          <button onClick={openPrintPreview} style={{ background: "#2563eb" }}>
            🖨 {activeModel ? `Print — ${QUOT_MODEL_LABELS[activeModel]} Variant` : "Print / Save as PDF"}
          </button>
          <button
            onClick={downloadQuotationPDF}
            style={{ background: "#059669" }}
            title="Generates and downloads a PDF file in one click — no print dialog"
          >
            ⬇ Download PDF{activeModel ? ` — ${QUOT_MODEL_LABELS[activeModel]} Variant` : ""}
          </button>
          <button
            onClick={printAllVariants}
            style={{ background: "#7c3aed" }}
            title="Opens Economy, Standard and Premium quotations in one print dialog"
          >
            ⬇ Print All 3 Variants (Economy / Standard / Premium)
          </button>
        </div>
      </div>

      {/* ─── Printable Quotation ─── */}
      <div className="quotation-print-area" style={{ background: "#fff", padding: 30, border: "1px solid #d1d5db", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>{companyName}</h2>
            <p style={{ margin: "4px 0", color: "#6b7280" }}>
              Project Quotation
              {activeModel && (
                <span style={{ marginLeft: 8, color: modelColor, fontWeight: 700 }}>— {QUOT_MODEL_LABELS[activeModel]} Variant</span>
              )}
            </p>
            {companyMobile && <p style={{ margin: "4px 0" }}><strong>Mobile:</strong> {companyMobile}</p>}
            {companyEmail && <p style={{ margin: "4px 0" }}><strong>Email:</strong> {companyEmail}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: "4px 0" }}><strong>Quotation No:</strong> {quotationNo}{activeModel ? `-${activeModel[0].toUpperCase()}` : ""}</p>
            <p style={{ margin: "4px 0" }}><strong>Date:</strong> {quotationDate}</p>
            <p style={{ margin: "4px 0" }}><strong>Customer:</strong> {customerName || "-"}</p>
            {customerMobile && <p style={{ margin: "4px 0" }}><strong>Mobile:</strong> {customerMobile}</p>}
            {customerAddress && <p style={{ margin: "4px 0" }}><strong>Address:</strong> {customerAddress}</p>}
          </div>
        </div>

        <hr />

        <p style={{ margin: "12px 0" }}><strong>Project:</strong> {selectedProject || "-"}</p>

        {lineItems.length === 0 ? (
          <p>No rooms/boxes in this project yet. Apply a template under Rooms &amp; Boxes first.</p>
        ) : (
          <>
            <h3>Rooms</h3>
            <table border="1" cellPadding="8" cellSpacing="0" width="100%" style={{ marginBottom: 20 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Room</th>
                  <th>Type of Work</th>
                  <th>Area (sq ft)</th>
                  <th>Cost/Sft</th>
                  <th>Amount (Incl. GST)</th>
                </tr>
              </thead>
              <tbody>
                {withRoomRowSpans(itemsWithSelling).map((item, i) => (
                  <tr key={item.id}>
                    <td>{i + 1}</td>
                    {item.roomSpan > 0 && <td rowSpan={item.roomSpan}>{item.roomName}</td>}
                    <td>{item.typeOfWork}</td>
                    <td>{item.areaSqFt}</td>
                    <td>{item.areaSqFt > 0 ? `${formatCurrency(item.sellingAmount / item.areaSqFt)}/sqft` : "—"}</td>
                    <td>{formatCurrency(item.sellingAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding: 12, border: "1px solid #e5e7eb", background: "#f9fafb", borderRadius: 8, marginBottom: 20, fontSize: 12, color: "#6b7280" }}>
              Amount includes wood/laminate, edge banding, hardware &amp; consumables, transportation, and carpenter/labor for each room.
            </div>

            {mrpSavings.mrpTotal > 0 && (
              <div style={{ padding: "14px 16px", border: "1px solid #a7f3d0", background: "#ecfdf5", borderRadius: 8, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46" }}>You save {formatCurrency(mrpSavings.savings)} vs MRP</div>
                  <div style={{ fontSize: 11, color: "#047857", marginTop: 2 }}>
                    MRP Value {formatCurrency(mrpSavings.mrpTotal)} → Your Price {formatCurrency(mrpSavings.netTotal)} (incl. GST, on items with MRP set)
                  </div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#059669" }}>
                  {roundTo2((mrpSavings.savings / mrpSavings.mrpTotal) * 100)}% OFF
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
              <table border="1" cellPadding="8" cellSpacing="0" style={{ minWidth: 320 }}>
                <tbody>
                  <tr><td>Cost Sub Total</td><td>{formatCurrency(costTotal)}</td></tr>
                  {markupPercent > 0 && <tr><td>Markup {markupPercent}%</td><td>{formatCurrency(markupAmount)}</td></tr>}
                  <tr style={{ background: "#f3f4f6" }}><td><strong>Sub Total</strong></td><td><strong>{formatCurrency(subTotal)}</strong></td></tr>
                  {Number(discountAmount) > 0 && <tr><td>Discount</td><td>- {formatCurrency(discountAmount)}</td></tr>}
                  {Number(discountAmount) > 0 && <tr><td><strong>Net Amount</strong></td><td><strong>{formatCurrency(netAmount)}</strong></td></tr>}
                  <tr><td>GST {gstPercent}%</td><td>{formatCurrency(gstAmount)}</td></tr>
                  <tr style={{ background: activeModel ? `${modelColor}15` : "#eff6ff" }}>
                    <td><strong>Grand Total</strong></td>
                    <td><strong style={{ color: activeModel ? modelColor : undefined }}>{formatCurrency(grandTotal)}</strong></td>
                  </tr>
                  <tr><td>Advance {advancePercent}%</td><td>{formatCurrency(advanceAmount)}</td></tr>
                </tbody>
              </table>
            </div>

            {hardwareMrpItems.length > 0 && (
              <div style={{ marginBottom: 24, pageBreakBefore: "always" }}>
                <h3>Hardware &amp; Consumables — Your Discount</h3>
                <table border="1" cellPadding="7" cellSpacing="0" width="100%" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["Group", "Item", "Qty", "Unit", "MRP (₹)", "Your Rate (₹)", "Discount %", "MRP Amount", "Your Amount", "You Save"].map((h) => (
                        <th key={h} style={{ background: "#1e3a5f", color: "#fff" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hardwareMrpItems.map((row) => (
                      <tr key={row.material}>
                        <td>{row.group}</td>
                        <td>{row.material}</td>
                        <td style={{ textAlign: "center" }}>{row.qty}</td>
                        <td style={{ textAlign: "center" }}>{row.unit}</td>
                        <td style={{ textAlign: "right" }}>{row.mrp > 0 ? `₹${row.mrp.toLocaleString("en-IN")}` : "—"}</td>
                        <td style={{ textAlign: "right" }}>₹{row.rate.toLocaleString("en-IN")}</td>
                        <td style={{ textAlign: "center", color: row.mrp > 0 ? "#059669" : "#9ca3af", fontWeight: 700 }}>{row.mrp > 0 ? `${row.discountPercent}%` : "—"}</td>
                        <td style={{ textAlign: "right" }}>{row.mrp > 0 ? formatCurrency(row.mrpAmount) : "—"}</td>
                        <td style={{ textAlign: "right" }}>{formatCurrency(row.netAmount)}</td>
                        <td style={{ textAlign: "right", color: row.mrp > 0 ? "#059669" : "#9ca3af", fontWeight: 700 }}>{row.mrp > 0 ? formatCurrency(row.savings) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#ecfdf5", fontWeight: 700 }}>
                      <td colSpan={7} style={{ textAlign: "right" }}>Total You Save on Hardware &amp; Consumables</td>
                      <td style={{ textAlign: "right" }}>{formatCurrency(hardwareMrpItems.reduce((s, r) => s + r.mrpAmount, 0))}</td>
                      <td style={{ textAlign: "right" }}>{formatCurrency(hardwareMrpItems.reduce((s, r) => s + r.netAmount, 0))}</td>
                      <td style={{ textAlign: "right", color: "#059669" }}>{formatCurrency(hardwareMrpItems.reduce((s, r) => s + r.savings, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {cutListRows.length > 0 && (
              <div style={{ marginBottom: 24, pageBreakBefore: "always" }}>
                <h3>Cut List</h3>
                <table border="1" cellPadding="6" cellSpacing="0" width="100%" style={{ fontSize: 11 }}>
                  <thead>
                    <tr>
                      {["#", "Room", "Label", "Material", "W (mm)", "H (mm)", "Qty"].map((h) => (
                        <th key={h} style={{ background: "#1e3a5f", color: "#fff" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cutListRows.map((row, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{row.room}</td>
                        <td>{row.label || ""}</td>
                        <td>{row.material || ""}</td>
                        <td style={{ textAlign: "center" }}>{row.w}</td>
                        <td style={{ textAlign: "center" }}>{row.h}</td>
                        <td style={{ textAlign: "center" }}>{row.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <h3>Scope of Work</h3>
              <p><strong>Included:</strong> {scopeIncluded || "-"}</p>
              <p><strong>Excluded:</strong> {scopeExcluded || "-"}</p>

              <h3>Terms & Conditions</h3>
              <p>Validity: {validityDays} days from quotation date</p>
              <p>Advance: {advancePercent}% ({formatCurrency(advanceAmount)}) on order confirmation</p>
              <p>Delivery: {deliveryDays} days from advance and final measurements</p>
              {termsText && <p>{termsText}</p>}
            </div>

            <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between", gap: 30 }}>
              <div style={{ width: "45%" }}>
                <p><strong>Customer Acceptance</strong></p>
                <div style={{ borderTop: "1px solid #000", marginTop: 50 }} />
              </div>
              <div style={{ width: "45%", textAlign: "right" }}>
                <p><strong>Authorized Signatory</strong></p>
                <div style={{ borderTop: "1px solid #000", marginTop: 50 }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── In-page Print/Preview Modal ── */}
      {previewDoc && (
        <div
          className="no-print"
          onClick={() => setPreviewDoc(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 4000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 900, height: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}
          >
            <div style={{ background: "#1e3a5f", color: "#fff", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{previewDoc.title}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => previewIframeRef.current?.contentWindow?.print()}
                  style={{ background: "#2563eb", color: "#fff", border: "none", padding: "6px 14px", fontSize: 13, borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
                >
                  🖨 Print
                </button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", padding: "6px 12px", fontSize: 13, borderRadius: 6, cursor: "pointer" }}
                >
                  ✕ Close
                </button>
              </div>
            </div>
            <iframe
              ref={previewIframeRef}
              title={previewDoc.title}
              srcDoc={`<!DOCTYPE html><html><head><style>@media print{@page{size:A4;margin:0}body{margin:0}} body{margin:0}</style></head><body>${previewDoc.html}</body></html>`}
              onLoad={() => {
                if (previewDoc.autoPrint) previewIframeRef.current?.contentWindow?.print();
              }}
              style={{ flex: 1, border: "none", background: "#fff" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectQuotation;
