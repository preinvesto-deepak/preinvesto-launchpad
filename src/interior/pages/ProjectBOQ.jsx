import { useMemo, useState } from "react";
import { useAppData } from "../context/AppDataContext";
import { formatCurrency, roundTo2 } from "../utils/unitConversions";
import { buildRoomRows, buildRoomEdgeBanding, buildRoomHardware, buildRoomCarpenter } from "../utils/projectRows";
import { computeSheetCounts } from "../utils/binPack";

const MODELS = ["default", "economy", "standard", "premium"];
const MODEL_LABELS = { default: "Cost (Default)", economy: "Economy", standard: "Standard", premium: "Premium" };
const MODEL_COLORS = { default: "#374151", economy: "#059669", standard: "#2563eb", premium: "#7c3aed" };

function ProjectBOQ() {
  const { projects, subProjects, prices, materialStockSettings } = useAppData();

  const [selectedProject, setSelectedProject] = useState(projects[0]?.name || "");
  const [gstPercent, setGstPercent] = useState(18);
  const [selectedModel, setSelectedModel] = useState("default");

  const selectedProjectObj = useMemo(
    () => projects.find((p) => p.name === selectedProject),
    [projects, selectedProject]
  );

  const projectRooms = useMemo(
    () => subProjects.filter((s) => s.project === selectedProject),
    [subProjects, selectedProject]
  );

  const getStockSize = (mat) => {
    const s = materialStockSettings?.[mat];
    return { sheetW: s?.sheetW || 2440, sheetH: s?.sheetH || 1220, sheetTexture: s?.sheetTexture ?? 1 };
  };

  const rateFor = (material) => {
    if (selectedModel !== "default") {
      const modelEntry = selectedProjectObj?.materialModelRates?.[material]?.[selectedModel];
      if (modelEntry?.rate) return { rate: Number(modelEntry.rate), brand: modelEntry.brand || "", source: selectedModel };
    }
    const rateData = prices.find((p) => p.materialName === material);
    return { rate: rateData ? Number(rateData.rate) : 0, brand: rateData?.brand || "", source: "default", priceFound: !!rateData };
  };

  // One line per room — real nested sheet count computed from that room's actual boxes/parts,
  // plus edge banding (meters × rate), hardware/consumables (qty × rate), Transportation and
  // Carpenter — all item-priced from Items Pricing/Material Models, not flat manual amounts.
  const roomLineItems = useMemo(() => {
    return projectRooms.map((room) => {
      const rows = buildRoomRows(room, prices);
      const areaSqMm = rows.reduce((s, r) => s + r.w * r.h * r.qty, 0);
      const sheetCounts = computeSheetCounts(
        rows.map((r) => ({ material: r.material, lengthMm: r.w, widthMm: r.h, qty: r.qty })),
        getStockSize
      );
      const materials = [...new Set(rows.map((r) => r.material))];
      const materialRateDetails = materials.map((mat) => {
        const { rate, brand, source, priceFound } = rateFor(mat);
        const sheets = sheetCounts[mat] || 0;
        return { material: mat, group: "Wood/Laminate", qty: sheets, unit: "Sheet", rate, brand, source, priceFound, amount: sheets * rate };
      });

      const edgeTotals = buildRoomEdgeBanding(room, prices);
      const edgeDetails = Object.entries(edgeTotals).map(([mat, lengthMm]) => {
        // roundTo2 returns a string (.toFixed) — keep this a real Number since it
        // gets summed with += later; only format for display at render time.
        const meters = Math.round((lengthMm / 1000) * 100) / 100;
        const { rate, brand, source, priceFound } = rateFor(mat);
        return { material: mat, group: "Edge Beading", qty: meters, unit: "Mtr", rate, brand, source, priceFound, amount: meters * rate };
      });

      // Manually-added Hardware & Consumables items — split Transportation and
      // Carpenter into their own columns/totals below so nothing is double-counted
      // against the item-priced Carpenter auto-row.
      const hwTotals = buildRoomHardware(room);
      const allHwDetails = Object.entries(hwTotals).map(([mat, qty]) => {
        const { rate, brand, source, priceFound } = rateFor(mat);
        const priceEntry = prices.find((p) => p.materialName === mat);
        return { material: mat, group: priceEntry?.group || "Hardware", qty, unit: priceEntry?.unit || "Nos", rate, brand, source, priceFound, amount: qty * rate };
      });
      const transportDetails = allHwDetails.filter((d) => d.group === "Transportation");
      const carpManualDetails = allHwDetails.filter((d) => d.group === "Carpenter");
      const hwDetails = allHwDetails.filter((d) => d.group !== "Transportation" && d.group !== "Carpenter");

      // Carpenter auto-row (Box Type × Area Sft) — item-priced the same way as
      // every other material, using whichever Carpenter-group item was picked
      // as the box's Box Type in Section 1 Inputs.
      const carpTotals = buildRoomCarpenter(room);
      const carpAutoDetails = Object.entries(carpTotals).map(([mat, qty]) => {
        const { rate, brand, source, priceFound } = rateFor(mat);
        const priceEntry = prices.find((p) => p.materialName === mat);
        return { material: mat, group: "Carpenter", qty, unit: priceEntry?.unit || "Sq.ft", rate, brand, source, priceFound, amount: qty * rate };
      });
      const carpDetails = [...carpAutoDetails, ...carpManualDetails];

      const allDetails = [...materialRateDetails, ...edgeDetails, ...hwDetails, ...transportDetails, ...carpDetails];
      const woodAmount = materialRateDetails.reduce((s, d) => s + d.amount, 0);
      const edgeAmount = edgeDetails.reduce((s, d) => s + d.amount, 0);
      const hardwareAmount = hwDetails.reduce((s, d) => s + d.amount, 0);
      const transportationAmount = transportDetails.reduce((s, d) => s + d.amount, 0);
      const laborAmount = carpDetails.reduce((s, d) => s + d.amount, 0);
      const roomTotal = woodAmount + edgeAmount + hardwareAmount + transportationAmount + laborAmount;

      return {
        id: room.id,
        roomName: room.subProject || room.name,
        boxCount: (room.boxes || []).length,
        areaSqFt: roundTo2(areaSqMm / 92903.04),
        materialRateDetails: allDetails,
        woodAmount, edgeAmount, hardwareAmount, transportationAmount, laborAmount, roomTotal,
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [projectRooms, prices, selectedModel, selectedProjectObj, materialStockSettings]);

  // Combined material breakdown across all rooms in the project — grouped like the
  // reference BOQ sheet (Wood/Laminate, Edge Beading, Hardware, Handles, Glue, ...).
  const materialSummary = useMemo(() => {
    const grouped = {};
    roomLineItems.forEach((room) => {
      room.materialRateDetails.forEach((d) => {
        const key = `${d.group}::${d.material}`;
        if (!grouped[key]) grouped[key] = { ...d, qty: 0, amount: 0 };
        grouped[key].qty += d.qty;
        grouped[key].amount += d.amount;
      });
    });
    return Object.values(grouped).sort((a, b) => a.group.localeCompare(b.group) || a.material.localeCompare(b.material));
  }, [roomLineItems]);

  const totalWood = roomLineItems.reduce((s, r) => s + r.woodAmount, 0);
  const totalEdge = roomLineItems.reduce((s, r) => s + r.edgeAmount, 0);
  const totalHardware = roomLineItems.reduce((s, r) => s + r.hardwareAmount, 0);
  const totalTransportation = roomLineItems.reduce((s, r) => s + r.transportationAmount, 0);
  const totalLabor = roomLineItems.reduce((s, r) => s + r.laborAmount, 0);
  const subTotal = totalWood + totalEdge + totalHardware + totalTransportation + totalLabor;
  const gstAmount = (subTotal * Number(gstPercent || 0)) / 100;
  const grandTotal = subTotal + gstAmount;

  const modelColor = MODEL_COLORS[selectedModel];

  const projectHasModelRates =
    selectedModel !== "default" &&
    Object.values(selectedProjectObj?.materialModelRates || {}).some((m) => m[selectedModel]?.rate);

  if (!projects.length) {
    return (
      <div className="page-card">
        <h2>Project BOQ</h2>
        <p>No projects found. Create a project first.</p>
      </div>
    );
  }

  return (
    <div className="page-card">
      <div className="no-print" style={{ marginBottom: 20, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 260px" }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Project</label>
          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: "0 0 120px" }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>GST %</label>
          <input type="number" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} style={{ width: 80 }} />
        </div>
        <div>
          <button onClick={() => window.print()} style={{ marginTop: 20 }}>Print / Save PDF</button>
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "2px solid #e5e7eb" }}>
        {MODELS.map((m) => (
          <button
            key={m}
            onClick={() => setSelectedModel(m)}
            style={{
              padding: "8px 16px", fontWeight: selectedModel === m ? 700 : 500,
              color: selectedModel === m ? MODEL_COLORS[m] : "#6b7280",
              background: "none", border: "none", cursor: "pointer",
              borderBottom: selectedModel === m ? `2px solid ${MODEL_COLORS[m]}` : "2px solid transparent",
              marginBottom: -2,
            }}
          >{MODEL_LABELS[m]}</button>
        ))}
      </div>

      {selectedModel !== "default" && !projectHasModelRates && (
        <div style={{ padding: 12, border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          No {MODEL_LABELS[selectedModel]} rates saved for this project yet — set them in Project → Material Models. Falling back to default Items Pricing rates where missing.
        </div>
      )}

      <p style={{ margin: "4px 0" }}><strong>Project:</strong> {selectedProject}</p>
      <p style={{ margin: "4px 0" }}><strong>Rooms:</strong> {projectRooms.length}</p>

      <h3>Rooms & Boxes</h3>
      {roomLineItems.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No rooms/boxes in this project yet. Apply a template under Rooms &amp; Boxes first.</p>
      ) : (
        <table border="1" cellPadding="10" cellSpacing="0" width="100%" style={{ marginBottom: 20 }}>
          <thead>
            <tr>
              <th>Room</th>
              <th>Boxes</th>
              <th>Area (sq ft)</th>
              <th>Wood/Laminate</th>
              <th>Edge Band</th>
              <th>Hardware</th>
              <th>Transport</th>
              <th>Labor</th>
              <th>Room Total</th>
            </tr>
          </thead>
          <tbody>
            {roomLineItems.map((room) => (
              <tr key={room.id}>
                <td>{room.roomName}</td>
                <td style={{ textAlign: "center" }}>{room.boxCount}</td>
                <td style={{ textAlign: "center" }}>{room.areaSqFt}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(room.woodAmount)}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(room.edgeAmount)}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(room.hardwareAmount)}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(room.transportationAmount)}</td>
                <td style={{ textAlign: "right" }}>{formatCurrency(room.laborAmount)}</td>
                <td style={{ textAlign: "right" }}><strong>{formatCurrency(room.roomTotal)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {materialSummary.length > 0 && (
        <>
          <h3>Material Rate Breakdown{selectedModel !== "default" ? ` — ${MODEL_LABELS[selectedModel]}` : ""}</h3>
          <table border="1" cellPadding="10" cellSpacing="0" width="100%" style={{ marginBottom: 20 }}>
            <thead>
              <tr>
                <th>Group</th>
                <th>Material</th>
                <th>Brand</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Rate</th>
                <th>Source</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {materialSummary.map((row) => (
                <tr key={`${row.group}::${row.material}`} style={!row.priceFound && row.source === "default" ? { background: "#fef9c3" } : {}}>
                  <td>{row.group}</td>
                  <td>{row.material}{!row.priceFound && row.source === "default" && " ⚠ no rate"}</td>
                  <td>{row.brand || "-"}</td>
                  <td style={{ textAlign: "center" }}>{row.qty}</td>
                  <td style={{ textAlign: "center" }}>{row.unit}</td>
                  <td>{formatCurrency(row.rate)}</td>
                  <td style={{ color: MODEL_COLORS[row.source] }}>{MODEL_LABELS[row.source] || row.source}</td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>Cost Summary</h3>
      <table border="1" cellPadding="10" cellSpacing="0" style={{ marginBottom: 20, minWidth: 360 }}>
        <tbody>
          <tr><td>Wood / Laminate</td><td>{formatCurrency(totalWood)}</td></tr>
          <tr><td>Edge Banding</td><td>{formatCurrency(totalEdge)}</td></tr>
          <tr><td>Hardware & Consumables</td><td>{formatCurrency(totalHardware)}</td></tr>
          <tr><td>Transportation</td><td>{formatCurrency(totalTransportation)}</td></tr>
          <tr><td>Carpenter / Labor</td><td>{formatCurrency(totalLabor)}</td></tr>
          <tr style={{ background: "#f3f4f6" }}>
            <td><strong>Sub Total</strong></td>
            <td><strong>{formatCurrency(subTotal)}</strong></td>
          </tr>
          <tr><td>GST {gstPercent}%</td><td>{formatCurrency(gstAmount)}</td></tr>
          <tr style={{ background: `${modelColor}15` }}>
            <td><strong>Grand Total</strong></td>
            <td><strong style={{ color: modelColor }}>{formatCurrency(grandTotal)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default ProjectBOQ;
