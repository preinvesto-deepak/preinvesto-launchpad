import { Link } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { fetchState, saveState } from "../utils/api";
import { mmToFeet } from "../utils/unitConversions";
import { PROJECT_STATUSES, projectStatusInfo } from "../data/projectStatus";
import { LEAD_SOURCES, leadSourceLabel } from "../data/leadSource";

// Same H × W → sq ft formula Projects.jsx's Quotation Details uses (falls
// back to Section 1's H/W for boxes that predate the dedicated fields) — kept
// as its own small copy here rather than importing from Projects.jsx, which
// doesn't export it.
function quotationAreaSft(box) {
  const hMm = Number(box.quotationHeightMm) || Number(box.heightMm) || 0;
  const wMm = Number(box.quotationWidthMm) || Number(box.widthMm) || 0;
  return hMm && wMm ? Math.ceil(mmToFeet(hMm) * mmToFeet(wMm)) : 0;
}

function Dashboard() {
  const {
    projects,
    subProjects,
    templates,
    prices,
    leads,
    resetAllData,
    restoreSampleData,
  } = useAppData();

  // Rooms link to their project by name (see Projects.jsx's own `rooms`
  // filter) rather than an id field.
  const roomsForProject = (project) => subProjects.filter((s) => s.project === project.name);

  const projectStats = projects.map((p) => {
    const rooms = roomsForProject(p);
    const areaSft = rooms.reduce(
      (sum, room) =>
        sum + (room.boxes || [])
          .filter((b) => b.includeInQuotation !== false)
          .reduce((s, b) => s + quotationAreaSft(b), 0),
      0
    );
    return { ...p, roomCount: rooms.length, areaSft };
  });

  const totalAreaSft = projectStats.reduce((s, p) => s + p.areaSft, 0);
  const recentProjects = [...projectStats].reverse().slice(0, 8);

  const statusCounts = PROJECT_STATUSES.map((s) => ({
    ...s,
    count: projectStats.filter((p) => (p.status || "inProgress") === s.value).length,
  }));

  const openLeadCount = leads.filter((l) => l.status !== "converted").length;

  // Every lead's own source, regardless of whether it's since been converted
  // to a project — the full picture of where enquiries come from.
  const sourceCounts = LEAD_SOURCES.map((s) => ({
    ...s,
    count: leads.filter((l) => l.source === s.value).length,
  })).filter((s) => s.count > 0);

  const cardStyle = {
    background: "#ffffff",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    padding: "18px",
  };

  const quickLinkStyle = {
    display: "block",
    textDecoration: "none",
    border: "1px solid #d1d5db",
    borderRadius: "12px",
    padding: "16px",
    background: "#ffffff",
    color: "#111827",
    fontWeight: "bold",
  };

  const handleResetAllData = () => {
    const confirmReset = window.confirm(
      "This will clear all current app data. Do you want to continue?"
    );

    if (!confirmReset) return;
    resetAllData();
  };

  const handleRestoreSampleData = () => {
    const confirmRestore = window.confirm(
      "This will restore the original sample data. Do you want to continue?"
    );

    if (!confirmRestore) return;
    restoreSampleData();
  };

  const handleExport = async () => {
    try {
      const { data } = await fetchState();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `interior-app-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Could not export backup: ${err.message}`);
    }
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      let parsed;
      try {
        parsed = JSON.parse(ev.target.result);
      } catch {
        alert("Invalid backup file. Please select a valid export file.");
        return;
      }
      try {
        await saveState(parsed);
        window.location.reload();
      } catch (err) {
        alert(`Could not import backup: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="page-card">
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={handleResetAllData}>Reset All App Data</button>
        <button onClick={handleRestoreSampleData}>Restore Sample Data</button>
        <span style={{ width: 1, height: 28, background: "#d1d5db", display: "inline-block", margin: "0 4px" }} />
        <button
          onClick={handleExport}
          style={{ background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
        >
          Export Backup
        </button>
        <label style={{ background: "#059669", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
          Import Backup
          <input type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
        </label>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "15px",
          marginBottom: "24px",
        }}
      >
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Open Leads</h3>
          <p style={{ fontSize: "24px", marginBottom: 0 }}>{openLeadCount}</p>
        </div>

        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Projects</h3>
          <p style={{ fontSize: "24px", marginBottom: 0 }}>{projects.length}</p>
        </div>

        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Rooms</h3>
          <p style={{ fontSize: "24px", marginBottom: 0 }}>{subProjects.length}</p>
        </div>

        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Templates</h3>
          <p style={{ fontSize: "24px", marginBottom: 0 }}>{templates.length}</p>
        </div>

        <div style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Pricing Items</h3>
          <p style={{ fontSize: "24px", marginBottom: 0 }}>{prices.length}</p>
        </div>

        <div style={cardStyle} title="Sum of every box's own Quotation Details area (H×W), across every project — the same figure each project's own Quotation totals divide by">
          <h3 style={{ marginTop: 0 }}>Total Quoted Area</h3>
          <p style={{ fontSize: "24px", marginBottom: 0 }}>{totalAreaSft} sqft</p>
        </div>
      </div>

      <h3>Quick Actions</h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "15px",
          marginBottom: "24px",
        }}
      >
        <Link to="/interior/leads" style={{ ...quickLinkStyle, color: "#1d4ed8" }}>Go to Leads</Link>
        <Link to="/interior/projects" style={quickLinkStyle}>Go to Projects</Link>
        <Link to="/interior/template-master" style={quickLinkStyle}>Go to Templates</Link>
        <Link to="/interior/design-gallery" style={quickLinkStyle}>Go to Design Gallery</Link>
        <Link to="/interior/material-models" style={quickLinkStyle}>Go to Material Models</Link>
        <Link to="/interior/items-pricing" style={quickLinkStyle}>Go to Items Pricing</Link>
      </div>

      {sourceCounts.length > 0 && (
        <>
          <h3>Leads by Source</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "24px" }}>
            {sourceCounts.map((s) => (
              <span
                key={s.value}
                style={{ fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 20, color: "#374151", background: "#f3f4f6", border: "1px solid #e5e7eb" }}
              >
                {s.label}: {s.count}
              </span>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Projects</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {statusCounts.filter((s) => s.count > 0).map((s) => (
            <span
              key={s.value}
              style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: s.color, background: s.bg }}
            >
              {s.label}: {s.count}
            </span>
          ))}
        </div>
      </div>

      <table border="1" cellPadding="10" cellSpacing="0" width="100%">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Project</th>
            <th style={{ textAlign: "left" }}>Status</th>
            <th style={{ textAlign: "left" }}>Source</th>
            <th style={{ textAlign: "left" }}>Client</th>
            <th style={{ textAlign: "left" }}>Location</th>
            <th>Rooms</th>
            <th>Quoted Area (sqft)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {recentProjects.length > 0 ? (
            recentProjects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap",
                      color: projectStatusInfo(p.status).color, background: projectStatusInfo(p.status).bg,
                    }}
                  >
                    {projectStatusInfo(p.status).label}
                  </span>
                </td>
                <td>{leadSourceLabel(p.leadSource) || "—"}</td>
                <td>{p.client || "—"}</td>
                <td>{p.location || "—"}</td>
                <td style={{ textAlign: "center" }}>{p.roomCount}</td>
                <td style={{ textAlign: "center" }}>{p.areaSft}</td>
                <td style={{ textAlign: "center" }}>
                  <Link to={`/interior/projects?id=${p.id}`}>Open →</Link>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="8">No projects yet — start with "+ New Project" under Projects &amp; Rooms.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Dashboard;
