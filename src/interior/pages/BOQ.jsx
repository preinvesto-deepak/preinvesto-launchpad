import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { formatCurrency } from "../utils/unitConversions";
import { computeSheetCounts } from "../utils/binPack";

function BOQ() {
  const { wardrobeRecords, prices, materialStockSettings } = useAppData();
  const [searchParams] = useSearchParams();

  const initialId = (() => {
    const p = searchParams.get("record");
    if (p) {
      const id = Number(p);
      if (wardrobeRecords.find((r) => r.id === id)) return id;
    }
    return wardrobeRecords[0]?.id ?? null;
  })();

  const [selectedRecordId, setSelectedRecordId] = useState(initialId);
  const [sheetLength, setSheetLength] = useState(2440);
  const [sheetWidth, setSheetWidth] = useState(1220);
  const [gstPercent, setGstPercent] = useState(18);

  const record = useMemo(() => {
    if (selectedRecordId == null) return wardrobeRecords[0] || null;
    return wardrobeRecords.find((r) => r.id === selectedRecordId) || null;
  }, [wardrobeRecords, selectedRecordId]);

  if (!wardrobeRecords.length || !record) {
    return (
      <div className="page-card">
        <h2>BOQ</h2>
        <p>No wardrobe records found. Save a wardrobe from the Configurator first.</p>
      </div>
    );
  }

  const generatedParts = record.parts || [];

  const STANDARD_SHEET_LENGTH = 2400;
  const STANDARD_SHEET_WIDTH = 1200;

  const canFitInSheet = (l, w) =>
    (l <= STANDARD_SHEET_LENGTH && w <= STANDARD_SHEET_WIDTH) ||
    (l <= STANDARD_SHEET_WIDTH && w <= STANDARD_SHEET_LENGTH);

  const invalidParts = generatedParts.filter(
    (p) => !canFitInSheet(p.lengthMm, p.widthMm)
  );

  const hardwareItems = Array.isArray(record.hardwareItems)
    ? record.hardwareItems
    : [];

  const normalizedHardwareItems = hardwareItems
    .map((item) => ({
      ...item,
      amount: Number(item.qty || 0) * Number(item.rate || 0),
    }))
    .filter(
      (item) =>
        String(item.itemName || "").trim() !== "" ||
        Number(item.qty || 0) > 0 ||
        Number(item.rate || 0) > 0
    );

  const hardwareAmount =
    normalizedHardwareItems.length > 0
      ? normalizedHardwareItems.reduce((sum, item) => sum + item.amount, 0)
      : Number(record.hardwareAmount || 0);

  // Actual sheet count from real nesting (not naive area ÷ sheet area) —
  // per-material stock size/texture from the Cut Sheet Optimizer is honored
  // when set, else falls back to the sheet size entered above.
  const getStockSize = (mat) => {
    const s = materialStockSettings?.[mat];
    return {
      sheetW: s?.sheetW || Number(sheetLength),
      sheetH: s?.sheetH || Number(sheetWidth),
      sheetTexture: s?.sheetTexture ?? 1,
    };
  };
  const sheetCounts = computeSheetCounts(
    generatedParts.map((p) => ({ ...p, partName: p.partName })),
    getStockSize
  );

  const materialGroups = generatedParts.reduce((acc, part) => {
    const key = part.material || "Unknown";
    const partArea = Number(part.lengthMm) * Number(part.widthMm) * Number(part.qty);
    if (!acc[key]) acc[key] = { material: key, totalAreaSqMm: 0, totalQty: 0 };
    acc[key].totalAreaSqMm += partArea;
    acc[key].totalQty += Number(part.qty);
    return acc;
  }, {});

  const groupedRows = Object.values(materialGroups).map((group) => {
    const materialRateData = prices.find((p) => p.materialName === group.material);
    const requiredSheets = sheetCounts[group.material] || 0;
    const sheetRate = materialRateData ? Number(materialRateData.rate) : 0;
    return {
      material: group.material,
      totalQty: group.totalQty,
      totalAreaSqMm: group.totalAreaSqMm,
      requiredSheets,
      sheetRate,
      basicAmount: sheetRate * requiredSheets,
      priceFound: !!materialRateData,
    };
  });

  const woodAmount = groupedRows.reduce((t, r) => t + r.basicAmount, 0);
  const laminateAmount = Number(record.laminateAmount || 0);
  const edgeBandAmount = Number(record.edgeBandAmount || 0);
  const glueAmount = Number(record.glueAmount || 0);
  const drawerAmount = Number(record.drawerAmount || 0);
  const frontFrameAmount = Number(record.frontFrameAmount || 0);
  const laborAmount = Number(record.laborAmount || 0);
  const transportAmount = Number(record.transportAmount || 0);

  const subTotal =
    woodAmount + laminateAmount + edgeBandAmount + hardwareAmount +
    glueAmount + drawerAmount + frontFrameAmount + laborAmount + transportAmount;

  const gstAmount = (subTotal * Number(gstPercent || 0)) / 100;
  const grandTotal = subTotal + gstAmount;

  const sectionCard = {
    border: "1px solid #d1d5db",
    borderRadius: "10px",
    padding: "16px",
    background: "#fff",
    marginBottom: "20px",
  };

  return (
    <div className="page-card">
      <div className="no-print" style={{ marginBottom: "20px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 260px" }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Wardrobe Record</label>
          <select
            value={selectedRecordId ?? ""}
            onChange={(e) => setSelectedRecordId(Number(e.target.value))}
          >
            {wardrobeRecords.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} — {r.itemName} ({r.projectName} / {r.subProjectName})
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "0 0 160px" }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>Sheet L × W (mm)</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" value={sheetLength} onChange={(e) => setSheetLength(e.target.value)} style={{ width: 80 }} />
            <input type="number" value={sheetWidth} onChange={(e) => setSheetWidth(e.target.value)} style={{ width: 80 }} />
          </div>
        </div>
        <div style={{ flex: "0 0 120px" }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>GST %</label>
          <input type="number" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} style={{ width: 80 }} />
        </div>
        <div>
          <button onClick={() => window.print()} style={{ marginTop: 20 }}>Print / Save PDF</button>
        </div>
      </div>

      <div style={sectionCard}>
        <p style={{ margin: "4px 0" }}><strong>Project:</strong> {record.projectName}</p>
        <p style={{ margin: "4px 0" }}><strong>Sub Project:</strong> {record.subProjectName}</p>
        <p style={{ margin: "4px 0" }}><strong>Item Name:</strong> {record.itemName}</p>
        <p style={{ margin: "4px 0" }}><strong>Door Type:</strong> {record.doorType || "-"}</p>
        {record.specification && <p style={{ margin: "4px 0" }}><strong>Specification:</strong> {record.specification}</p>}
        {record.remarks && <p style={{ margin: "4px 0" }}><strong>Remarks:</strong> {record.remarks}</p>}
        <p style={{ margin: "4px 0" }}><strong>Template:</strong> {record.templateName}</p>
        <p style={{ margin: "4px 0" }}><strong>Size:</strong> {record.widthMm} × {record.heightMm} × {record.depthMm} mm</p>
      </div>

      {invalidParts.length > 0 && (
        <div style={{ padding: 14, border: "1px solid #dc2626", background: "#fef2f2", borderRadius: 10, marginBottom: 20 }}>
          <strong>Sheet Size Warning:</strong> Some parts exceed 2400 × 1200 mm.
          {invalidParts.map((p) => (
            <p key={p.id}>{p.partName}: {p.lengthMm} × {p.widthMm} mm</p>
          ))}
        </div>
      )}

      <h3>Material Breakdown</h3>
      <table border="1" cellPadding="10" cellSpacing="0" width="100%" style={{ marginBottom: 20 }}>
        <thead>
          <tr>
            <th>Material</th>
            <th>Total Parts Qty</th>
            <th>Area (sq mm)</th>
            <th>Sheets Required</th>
            <th>Rate / Sheet</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {groupedRows.map((row) => (
            <tr key={row.material} style={!row.priceFound ? { background: "#fef9c3" } : {}}>
              <td>{row.material}{!row.priceFound && " ⚠ no rate"}</td>
              <td>{row.totalQty}</td>
              <td>{row.totalAreaSqMm.toLocaleString("en-IN")}</td>
              <td>{row.requiredSheets}</td>
              <td>{formatCurrency(row.sheetRate)}</td>
              <td>{formatCurrency(row.basicAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {normalizedHardwareItems.length > 0 && (
        <>
          <h3>Hardware Breakdown</h3>
          <table border="1" cellPadding="10" cellSpacing="0" width="100%" style={{ marginBottom: 20 }}>
            <thead>
              <tr><th>#</th><th>Hardware Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {normalizedHardwareItems.map((item, i) => (
                <tr key={`${item.itemName}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{item.itemName || "-"}</td>
                  <td>{item.qty}</td>
                  <td>{formatCurrency(item.rate)}</td>
                  <td>{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>Cost Summary</h3>
      <table border="1" cellPadding="10" cellSpacing="0" style={{ marginBottom: 20, minWidth: 360 }}>
        <tbody>
          <tr><td>Wood / Sheet Material</td><td>{formatCurrency(woodAmount)}</td></tr>
          <tr><td>Laminate</td><td>{formatCurrency(laminateAmount)}</td></tr>
          <tr><td>Edge Band</td><td>{formatCurrency(edgeBandAmount)}</td></tr>
          <tr><td>Hardware</td><td>{formatCurrency(hardwareAmount)}</td></tr>
          <tr><td>Glue / Adhesive</td><td>{formatCurrency(glueAmount)}</td></tr>
          <tr><td>Drawer</td><td>{formatCurrency(drawerAmount)}</td></tr>
          <tr><td>Front Frame</td><td>{formatCurrency(frontFrameAmount)}</td></tr>
          <tr><td>Labor</td><td>{formatCurrency(laborAmount)}</td></tr>
          <tr><td>Transport</td><td>{formatCurrency(transportAmount)}</td></tr>
          <tr style={{ background: "#f3f4f6" }}>
            <td><strong>Sub Total</strong></td>
            <td><strong>{formatCurrency(subTotal)}</strong></td>
          </tr>
          <tr><td>GST {gstPercent}%</td><td>{formatCurrency(gstAmount)}</td></tr>
          <tr style={{ background: "#eff6ff" }}>
            <td><strong>Grand Total</strong></td>
            <td><strong>{formatCurrency(grandTotal)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default BOQ;
