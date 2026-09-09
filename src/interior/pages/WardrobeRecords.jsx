import { useNavigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { mmToFeet, roundTo2, formatCurrency } from "../utils/unitConversions";
import { useState } from "react";

function WardrobeRecords() {
  const navigate = useNavigate();

  const {
    projects,
    prices,
    wardrobeRecords,
    setWardrobeRecords,
    setConfiguredWardrobe,
    setGeneratedParts,
    setSelectedTemplateId,
    setEditingWardrobeRecordId,
  } = useAppData();

  const [selectedProject, setSelectedProject] = useState("All");
  const [searchText, setSearchText] = useState("");

  const handleEditRecord = (record) => {
    setConfiguredWardrobe(record);
    setGeneratedParts(record.parts || []);
    setSelectedTemplateId(String(record.templateId || ""));
    setEditingWardrobeRecordId(record.id);
    navigate("/interior/wardrobe-configurator");
  };

  const handleDeleteRecord = (id) => {
    if (!window.confirm("Delete this record?")) return;
    setWardrobeRecords(wardrobeRecords.filter((r) => r.id !== id));
  };

  const getEstimatedCost = (record) => {
    const sheetArea = 2440 * 1220;
    const materialGroups = (record.parts || []).reduce((acc, part) => {
      const key = part.material || "Unknown";
      const area = Number(part.lengthMm) * Number(part.widthMm) * Number(part.qty);
      if (!acc[key]) acc[key] = 0;
      acc[key] += area;
      return acc;
    }, {});

    const woodAmount = Object.entries(materialGroups).reduce((total, [mat, area]) => {
      const rateData = prices.find((p) => p.materialName === mat);
      const sheets = sheetArea > 0 ? Math.ceil(area / sheetArea) : 0;
      return total + sheets * (rateData ? Number(rateData.rate) : 0);
    }, 0);

    const hardwareItems = Array.isArray(record.hardwareItems) ? record.hardwareItems : [];
    const hwAmount = hardwareItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.rate || 0), 0)
      || Number(record.hardwareAmount || 0);

    return woodAmount
      + Number(record.laminateAmount || 0)
      + Number(record.edgeBandAmount || 0)
      + hwAmount
      + Number(record.glueAmount || 0)
      + Number(record.drawerAmount || 0)
      + Number(record.frontFrameAmount || 0)
      + Number(record.laborAmount || 0)
      + Number(record.transportAmount || 0);
  };

  const filteredRecords = wardrobeRecords.filter((record) => {
    const matchesProject = selectedProject === "All" || record.projectName === selectedProject;
    const v = searchText.toLowerCase();
    return matchesProject && (
      String(record.projectName || "").toLowerCase().includes(v) ||
      String(record.subProjectName || "").toLowerCase().includes(v) ||
      String(record.itemName || "").toLowerCase().includes(v) ||
      String(record.templateName || "").toLowerCase().includes(v) ||
      String(record.doorType || "").toLowerCase().includes(v)
    );
  });

  return (
    <div className="page-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <h2 style={{ margin: 0 }}>Saved Records</h2>
        <button onClick={() => navigate("/interior/wardrobe-configurator")}>+ New Item</button>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <select style={{ width: "200px" }} value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
          <option value="All">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
        <input
          style={{ flex: 1, minWidth: "180px" }}
          type="text"
          placeholder="Search by item, template, door type…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      {filteredRecords.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No records found. Configure an item and save it from the Configurator.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table border="1" cellPadding="10" cellSpacing="0" width="100%" style={{ fontSize: "13px" }}>
            <thead>
              <tr>
                <th>#</th>
                <th style={{ textAlign: "left" }}>Item Name</th>
                <th style={{ textAlign: "left" }}>Location</th>
                <th style={{ textAlign: "left" }}>Size (W×H×D mm)</th>
                <th style={{ textAlign: "right" }}>Est. Cost</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td style={{ color: "#6b7280" }}>{record.id}</td>
                  <td>
                    <strong>{record.itemName}</strong>
                    {record.doorType && record.doorType !== "none" && (
                      <span style={{ marginLeft: 6, fontSize: "11px", color: "#6b7280" }}>({record.doorType})</span>
                    )}
                  </td>
                  <td style={{ color: "#374151" }}>
                    {record.projectName}
                    {record.subProjectName ? <><br /><span style={{ fontSize: "12px", color: "#6b7280" }}>{record.subProjectName}</span></> : ""}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {record.widthMm} × {record.heightMm} × {record.depthMm}
                    <br />
                    <span style={{ fontSize: "11px", color: "#6b7280" }}>
                      {roundTo2(mmToFeet(record.widthMm))} × {roundTo2(mmToFeet(record.heightMm))} × {roundTo2(mmToFeet(record.depthMm))} ft
                    </span>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    {formatCurrency(getEstimatedCost(record))}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "5px", justifyContent: "center", flexWrap: "wrap" }}>
                      <button
                        onClick={() => handleEditRecord(record)}
                        style={{ background: "#6b7280", padding: "5px 10px", fontSize: "12px" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => navigate(`/interior/boq?record=${record.id}`)}
                        style={{ background: "#059669", padding: "5px 10px", fontSize: "12px" }}
                      >
                        BOQ
                      </button>
                      <button
                        onClick={() => navigate(`/interior/quotation?record=${record.id}`)}
                        style={{ background: "#7c3aed", padding: "5px 10px", fontSize: "12px" }}
                      >
                        Quote
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(record.id)}
                        style={{ background: "#dc2626", padding: "5px 10px", fontSize: "12px" }}
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default WardrobeRecords;
