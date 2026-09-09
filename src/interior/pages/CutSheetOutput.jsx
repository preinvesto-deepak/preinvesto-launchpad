import { useMemo, useState } from "react";
import { useAppData } from "../context/AppDataContext";

function CutSheetOutput() {
  const { generatedParts, configuredWardrobe } = useAppData();

  const STANDARD_SHEET_LENGTH = 2400;
  const STANDARD_SHEET_WIDTH = 1200;

  const [sheetLength, setSheetLength] = useState(2440);
  const [sheetWidth, setSheetWidth] = useState(1220);

  if (generatedParts.length === 0 || !configuredWardrobe) {
    return (
      <div className="page-card">
        <h2>Cut Sheet Output</h2>
        <p>No generated parts available. Please save parts from Wardrobe Configurator first.</p>
      </div>
    );
  }

  const canFitInSheet = (lengthMm, widthMm) => {
    return (
      (lengthMm <= STANDARD_SHEET_LENGTH && widthMm <= STANDARD_SHEET_WIDTH) ||
      (lengthMm <= STANDARD_SHEET_WIDTH && widthMm <= STANDARD_SHEET_LENGTH)
    );
  };

  const validatedParts = generatedParts.map((part) => ({
    ...part,
    fitsInSheet: canFitInSheet(part.lengthMm, part.widthMm),
    totalAreaSqMm: Number(part.lengthMm) * Number(part.widthMm) * Number(part.qty),
  }));

  const invalidParts = validatedParts.filter((part) => !part.fitsInSheet);

  const sheetArea = Number(sheetLength) * Number(sheetWidth);

  const totalPanelArea = validatedParts.reduce((total, part) => {
    return total + part.totalAreaSqMm;
  }, 0);

  const requiredSheets = sheetArea > 0 ? Math.ceil(totalPanelArea / sheetArea) : 0;

  const groupedByMaterial = useMemo(() => {
    return validatedParts.reduce((acc, part) => {
      const key = part.material || "Unknown";
      if (!acc[key]) acc[key] = [];
      acc[key].push(part);
      return acc;
    }, {});
  }, [generatedParts]);

  const materialSummary = useMemo(() => {
    return Object.entries(groupedByMaterial).map(([material, parts]) => {
      const totalQty = parts.reduce((sum, part) => sum + Number(part.qty || 0), 0);
      const totalAreaSqMm = parts.reduce(
        (sum, part) => sum + Number(part.totalAreaSqMm || 0),
        0
      );
      return {
        material,
        totalQty,
        totalAreaSqMm,
      };
    });
  }, [groupedByMaterial]);

  const csvText = useMemo(() => {
    const header = [
      "Material",
      "Part Name",
      "Height (mm)",
      "Width (mm)",
      "Qty",
      "Total Area (sq mm)",
      "Sheet Fit",
    ];

    const rows = validatedParts.map((part) => [
      part.material,
      part.partName,
      part.lengthMm,
      part.widthMm,
      part.qty,
      part.totalAreaSqMm,
      part.fitsInSheet ? "OK" : "Exceeds Sheet",
    ]);

    return [header, ...rows].map((row) => row.join(",")).join("\n");
  }, [validatedParts]);

  const optimizerText = useMemo(() => {
    const header = ["Part Name", "Height (mm)", "Width (mm)", "Qty", "Material"];
    const rows = validatedParts.map((part) => [
      part.partName,
      part.lengthMm,
      part.widthMm,
      part.qty,
      part.material,
    ]);

    return [header, ...rows].map((row) => row.join("\t")).join("\n");
  }, [validatedParts]);

  const handleCopyCsv = async () => {
    try {
      await navigator.clipboard.writeText(csvText);
      alert("Cut sheet CSV copied");
    } catch (error) {
      alert("Copy failed");
    }
  };

  const handleCopyOptimizerText = async () => {
    try {
      await navigator.clipboard.writeText(optimizerText);
      alert("Optimizer text copied");
    } catch (error) {
      alert("Copy failed");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="page-card">
      <h2>Cut Sheet Output</h2>

      <p><strong>Project:</strong> {configuredWardrobe.projectName}</p>
      <p><strong>Sub Project:</strong> {configuredWardrobe.subProjectName}</p>
      <p><strong>Item Name:</strong> {configuredWardrobe.itemName}</p>
      <p><strong>Door Type:</strong> {configuredWardrobe.doorType || "-"}</p>
      <p><strong>Specification:</strong> {configuredWardrobe.specification || "-"}</p>
      <p><strong>Remarks:</strong> {configuredWardrobe.remarks || "-"}</p>
      <p><strong>Template:</strong> {configuredWardrobe.templateName}</p>
      <p><strong>Standard Full Sheet:</strong> {STANDARD_SHEET_LENGTH} x {STANDARD_SHEET_WIDTH} mm</p>

      {invalidParts.length > 0 && (
        <div
          style={{
            marginBottom: "20px",
            padding: "14px",
            border: "1px solid #dc2626",
            background: "#fef2f2",
            borderRadius: "10px",
          }}
        >
          <p><strong>Sheet Size Warning:</strong> Some parts do not fit within 2400 x 1200 mm.</p>
          {invalidParts.map((part) => (
            <p key={part.id}>
              {part.partName}: {part.lengthMm} x {part.widthMm} mm
            </p>
          ))}
        </div>
      )}

      <div
        className="no-print"
        style={{
          display: "grid",
          gap: "10px",
          maxWidth: "320px",
          marginBottom: "20px",
        }}
      >
        <input
          type="number"
          placeholder="Sheet Length (mm)"
          value={sheetLength}
          onChange={(e) => setSheetLength(e.target.value)}
        />

        <input
          type="number"
          placeholder="Sheet Width (mm)"
          value={sheetWidth}
          onChange={(e) => setSheetWidth(e.target.value)}
        />

        <button onClick={handleCopyCsv}>Copy CSV</button>
        <button onClick={handleCopyOptimizerText}>Copy Optimizer Text</button>
        <button onClick={handlePrint}>Print / Save as PDF</button>
      </div>

      <div
        style={{
          marginBottom: "20px",
          padding: "16px",
          background: "#ffffff",
          border: "1px solid #d1d5db",
          borderRadius: "10px",
        }}
      >
        <p><strong>Selected Sheet Size:</strong> {sheetLength} mm x {sheetWidth} mm</p>
        <p><strong>Total Panel Area:</strong> {totalPanelArea} sq mm</p>
        <p><strong>Estimated Sheets Required:</strong> {requiredSheets}</p>
        <p><strong>Total Part Rows:</strong> {validatedParts.length}</p>
      </div>

      <h3>Material Summary</h3>
      <table
        border="1"
        cellPadding="10"
        cellSpacing="0"
        width="100%"
        style={{ marginBottom: "20px" }}
      >
        <thead>
          <tr>
            <th>#</th>
            <th>Material</th>
            <th>Total Qty</th>
            <th>Total Area (sq mm)</th>
          </tr>
        </thead>
        <tbody>
          {materialSummary.map((row, index) => (
            <tr key={`${row.material}-${index}`}>
              <td>{index + 1}</td>
              <td>{row.material}</td>
              <td>{row.totalQty}</td>
              <td>{row.totalAreaSqMm}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {Object.entries(groupedByMaterial).map(([material, parts]) => (
        <div key={material} style={{ marginBottom: "24px" }}>
          <h3>{material}</h3>
          <table border="1" cellPadding="10" cellSpacing="0" width="100%">
            <thead>
              <tr>
                <th>ID</th>
                <th>Part Name</th>
                <th>Height (mm)</th>
                <th>Width (mm)</th>
                <th>Qty</th>
                <th>Total Area (sq mm)</th>
                <th>Sheet Fit</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => (
                <tr
                  key={`${material}-${part.id}-${part.partName}`}
                  style={!part.fitsInSheet ? { background: "#fef2f2" } : {}}
                >
                  <td>{part.id}</td>
                  <td>{part.partName}</td>
                  <td>{part.lengthMm}</td>
                  <td>{part.widthMm}</td>
                  <td>{part.qty}</td>
                  <td>{part.totalAreaSqMm}</td>
                  <td>{part.fitsInSheet ? "OK" : "Exceeds Sheet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div style={{ marginTop: "20px" }}>
        <h3>Optimizer Export Text</h3>
        <textarea
          readOnly
          value={optimizerText}
          rows="10"
          style={{ width: "100%" }}
        />
      </div>

      <SectionNote />
    </div>
  );
}

function SectionNote() {
  return (
    <div
      style={{
        marginTop: "20px",
        padding: "14px",
        background: "#f9fafb",
        border: "1px solid #d1d5db",
        borderRadius: "10px",
      }}
    >
      <p><strong>Export Note:</strong></p>
      <p>Use “Copy CSV” for spreadsheet use.</p>
      <p>Use “Copy Optimizer Text” for quick paste into your optimizer input sheet.</p>
      <p>Check all rows marked “OK” before sending for final cutting.</p>
    </div>
  );
}

export default CutSheetOutput;