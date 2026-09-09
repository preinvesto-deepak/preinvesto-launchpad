import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { mmToFeet, sqMmToSqFt, roundTo2, formatCurrency } from "../utils/unitConversions";
import { computeSheetCounts } from "../utils/binPack";

function Quotation() {
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

  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  const [companyName, setCompanyName] = useState("Interior App");
  const [companyMobile, setCompanyMobile] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");

  const [quotationNo, setQuotationNo] = useState("QTN-001");
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split("T")[0]);

  const [markupPercent, setMarkupPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [gstPercent, setGstPercent] = useState(18);

  const [validityDays, setValidityDays] = useState(7);
  const [advancePercent, setAdvancePercent] = useState(50);
  const [deliveryDays, setDeliveryDays] = useState(21);
  const [scopeIncluded, setScopeIncluded] = useState(
    "Material supply, fabrication, delivery, and installation."
  );
  const [scopeExcluded, setScopeExcluded] = useState(
    "Civil work, electrical shifting, plumbing work, and painting touchups unless mentioned."
  );
  const [termsText, setTermsText] = useState(
    "Final measurements to be confirmed at site before execution."
  );

  const record = useMemo(() => {
    if (selectedRecordId == null) return wardrobeRecords[0] || null;
    return wardrobeRecords.find((r) => r.id === selectedRecordId) || null;
  }, [wardrobeRecords, selectedRecordId]);

  if (!wardrobeRecords.length || !record) {
    return (
      <div className="page-card">
        <h2>Quotation</h2>
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

  const invalidParts = generatedParts.filter((p) => !canFitInSheet(p.lengthMm, p.widthMm));

  const hardwareItems = Array.isArray(record.hardwareItems) ? record.hardwareItems : [];
  const normalizedHardwareItems = hardwareItems
    .map((item) => ({ ...item, amount: Number(item.qty || 0) * Number(item.rate || 0) }))
    .filter((item) =>
      String(item.itemName || "").trim() !== "" ||
      Number(item.qty || 0) > 0 ||
      Number(item.rate || 0) > 0
    );

  const hardwareAmount =
    normalizedHardwareItems.length > 0
      ? normalizedHardwareItems.reduce((sum, item) => sum + item.amount, 0)
      : Number(record.hardwareAmount || 0);

  // Actual sheet count from real nesting — honors per-material stock
  // size/texture from the Cut Sheet Optimizer when set.
  const getStockSize = (mat) => {
    const s = materialStockSettings?.[mat];
    return {
      sheetW: s?.sheetW || Number(sheetLength),
      sheetH: s?.sheetH || Number(sheetWidth),
      sheetTexture: s?.sheetTexture ?? 1,
    };
  };
  const sheetCounts = computeSheetCounts(generatedParts, getStockSize);

  const materialGroups = generatedParts.reduce((acc, part) => {
    const key = part.material || "Unknown";
    const partArea = Number(part.lengthMm) * Number(part.widthMm) * Number(part.qty);
    if (!acc[key]) acc[key] = { material: key, totalAreaSqMm: 0 };
    acc[key].totalAreaSqMm += partArea;
    return acc;
  }, {});

  const groupedRows = Object.values(materialGroups).map((group) => {
    const rateData = prices.find((p) => p.materialName === group.material);
    const requiredSheets = sheetCounts[group.material] || 0;
    const sheetRate = rateData ? Number(rateData.rate) : 0;
    return { material: group.material, totalAreaSqMm: group.totalAreaSqMm, requiredSheets, sheetRate, basicAmount: sheetRate * requiredSheets };
  });

  const woodAmount = groupedRows.reduce((t, r) => t + r.basicAmount, 0);
  const laminateAmount = Number(record.laminateAmount || 0);
  const edgeBandAmount = Number(record.edgeBandAmount || 0);
  const glueAmount = Number(record.glueAmount || 0);
  const drawerAmount = Number(record.drawerAmount || 0);
  const frontFrameAmount = Number(record.frontFrameAmount || 0);
  const laborAmount = Number(record.laborAmount || 0);
  const transportAmount = Number(record.transportAmount || 0);

  const costTotal =
    woodAmount + laminateAmount + edgeBandAmount + hardwareAmount +
    glueAmount + drawerAmount + frontFrameAmount + laborAmount + transportAmount;

  const markupAmount = (costTotal * Number(markupPercent || 0)) / 100;
  const subTotal = costTotal + markupAmount;
  const netAmount = subTotal - Number(discountAmount || 0);
  const gstAmount = (netAmount * Number(gstPercent || 0)) / 100;
  const grandTotal = netAmount + gstAmount;
  const advanceAmount = (netAmount * Number(advancePercent || 0)) / 100;

  const totalPanelAreaSqMm = groupedRows.reduce((t, r) => t + r.totalAreaSqMm, 0);

  const inputRow = { display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center", marginBottom: 8 };
  const label = { fontWeight: 600, fontSize: 13 };

  return (
    <div className="page-card">
      <div className="no-print" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Quotation Settings</h3>

        {invalidParts.length > 0 && (
          <div style={{ padding: 12, border: "1px solid #dc2626", background: "#fef2f2", borderRadius: 8, marginBottom: 12 }}>
            <strong>Warning:</strong> Some parts exceed standard sheet size. Reconfigure in Wardrobe Configurator.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <div>
            <h4 style={{ margin: "0 0 10px" }}>Record & Sheet</h4>
            <div style={inputRow}>
              <span style={label}>Wardrobe Record</span>
              <select value={selectedRecordId ?? ""} onChange={(e) => setSelectedRecordId(Number(e.target.value))}>
                {wardrobeRecords.map((r) => (
                  <option key={r.id} value={r.id}>#{r.id} — {r.itemName} ({r.subProjectName})</option>
                ))}
              </select>
            </div>
            <div style={inputRow}>
              <span style={label}>Sheet L (mm)</span>
              <input type="number" value={sheetLength} onChange={(e) => setSheetLength(e.target.value)} />
            </div>
            <div style={inputRow}>
              <span style={label}>Sheet W (mm)</span>
              <input type="number" value={sheetWidth} onChange={(e) => setSheetWidth(e.target.value)} />
            </div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px" }}>Company</h4>
            <div style={inputRow}><span style={label}>Company Name</span><input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
            <div style={inputRow}><span style={label}>Mobile</span><input type="text" value={companyMobile} onChange={(e) => setCompanyMobile(e.target.value)} /></div>
            <div style={inputRow}><span style={label}>Email</span><input type="text" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} /></div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px" }}>Customer</h4>
            <div style={inputRow}><span style={label}>Name</span><input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
            <div style={inputRow}><span style={label}>Mobile</span><input type="text" value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value)} /></div>
            <div style={inputRow}><span style={label}>Address</span><input type="text" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} /></div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px" }}>Quotation</h4>
            <div style={inputRow}><span style={label}>Quotation No</span><input type="text" value={quotationNo} onChange={(e) => setQuotationNo(e.target.value)} /></div>
            <div style={inputRow}><span style={label}>Date</span><input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} /></div>
            <div style={inputRow}><span style={label}>Markup %</span><input type="number" value={markupPercent} onChange={(e) => setMarkupPercent(e.target.value)} /></div>
            <div style={inputRow}><span style={label}>Discount (₹)</span><input type="number" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} /></div>
            <div style={inputRow}><span style={label}>GST %</span><input type="number" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} /></div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px" }}>Terms</h4>
            <div style={inputRow}><span style={label}>Validity (days)</span><input type="number" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} /></div>
            <div style={inputRow}><span style={label}>Advance %</span><input type="number" value={advancePercent} onChange={(e) => setAdvancePercent(e.target.value)} /></div>
            <div style={inputRow}><span style={label}>Delivery (days)</span><input type="number" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} /></div>
          </div>

          <div>
            <h4 style={{ margin: "0 0 10px" }}>Scope & Terms Text</h4>
            <textarea placeholder="Included Scope" value={scopeIncluded} onChange={(e) => setScopeIncluded(e.target.value)} rows="2" style={{ width: "100%", marginBottom: 8 }} />
            <textarea placeholder="Excluded Scope" value={scopeExcluded} onChange={(e) => setScopeExcluded(e.target.value)} rows="2" style={{ width: "100%", marginBottom: 8 }} />
            <textarea placeholder="Terms Text" value={termsText} onChange={(e) => setTermsText(e.target.value)} rows="2" style={{ width: "100%" }} />
          </div>
        </div>

        <button onClick={() => window.print()} style={{ marginTop: 16 }}>Print / Save as PDF</button>
      </div>

      {/* ─── Printable Quotation ─── */}
      <div className="quotation-print-area" style={{ background: "#fff", padding: 30, border: "1px solid #d1d5db", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>{companyName}</h2>
            <p style={{ margin: "4px 0", color: "#6b7280" }}>Interior Design Quotation</p>
            {companyMobile && <p style={{ margin: "4px 0" }}><strong>Mobile:</strong> {companyMobile}</p>}
            {companyEmail && <p style={{ margin: "4px 0" }}><strong>Email:</strong> {companyEmail}</p>}
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: "4px 0" }}><strong>Quotation No:</strong> {quotationNo}</p>
            <p style={{ margin: "4px 0" }}><strong>Date:</strong> {quotationDate}</p>
            <p style={{ margin: "4px 0" }}><strong>Customer:</strong> {customerName || "-"}</p>
            {customerMobile && <p style={{ margin: "4px 0" }}><strong>Mobile:</strong> {customerMobile}</p>}
            {customerAddress && <p style={{ margin: "4px 0" }}><strong>Address:</strong> {customerAddress}</p>}
          </div>
        </div>

        <hr />

        <div style={{ margin: "16px 0", padding: "12px 0", borderBottom: "1px solid #e5e7eb" }}>
          <p style={{ margin: "3px 0" }}><strong>Project:</strong> {record.projectName} / {record.subProjectName}</p>
          <p style={{ margin: "3px 0" }}><strong>Item:</strong> {record.itemName} — {record.doorType} door</p>
          {record.specification && <p style={{ margin: "3px 0" }}><strong>Specification:</strong> {record.specification}</p>}
          {record.remarks && <p style={{ margin: "3px 0" }}><strong>Remarks:</strong> {record.remarks}</p>}
          <p style={{ margin: "3px 0" }}>
            <strong>Size:</strong> W {roundTo2(mmToFeet(record.widthMm))} ft × H {roundTo2(mmToFeet(record.heightMm))} ft × D {roundTo2(mmToFeet(record.depthMm))} ft
            &nbsp;({record.widthMm} × {record.heightMm} × {record.depthMm} mm)
          </p>
          <p style={{ margin: "3px 0" }}>
            <strong>Panel Area:</strong> {roundTo2(sqMmToSqFt(totalPanelAreaSqMm))} sq ft
          </p>
        </div>

        {normalizedHardwareItems.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h3>Hardware Breakdown</h3>
            <table border="1" cellPadding="8" cellSpacing="0" width="100%">
              <thead>
                <tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
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
          </div>
        )}

        <h3>Cost Summary</h3>
        <table border="1" cellPadding="8" cellSpacing="0" style={{ minWidth: 360, marginBottom: 20 }}>
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
            {markupPercent > 0 && (
              <tr><td>Markup {markupPercent}%</td><td>{formatCurrency(markupAmount)}</td></tr>
            )}
            <tr style={{ background: "#f3f4f6" }}>
              <td><strong>Sub Total</strong></td><td><strong>{formatCurrency(subTotal)}</strong></td>
            </tr>
            {Number(discountAmount) > 0 && (
              <tr><td>Discount</td><td>- {formatCurrency(discountAmount)}</td></tr>
            )}
            {Number(discountAmount) > 0 && (
              <tr><td><strong>Net Amount</strong></td><td><strong>{formatCurrency(netAmount)}</strong></td></tr>
            )}
            <tr><td>GST {gstPercent}%</td><td>{formatCurrency(gstAmount)}</td></tr>
            <tr style={{ background: "#eff6ff" }}>
              <td><strong>Grand Total</strong></td><td><strong>{formatCurrency(grandTotal)}</strong></td>
            </tr>
            <tr><td>Advance {advancePercent}%</td><td>{formatCurrency(advanceAmount)}</td></tr>
          </tbody>
        </table>

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
      </div>
    </div>
  );
}

export default Quotation;
