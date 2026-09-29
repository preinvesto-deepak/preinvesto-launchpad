import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { LEAD_STATUSES, leadStatusInfo } from "../data/leadStatus";
import { LEAD_SOURCES, leadSourceLabel } from "../data/leadSource";

// Same field set as the "+ New Project" form in Projects.jsx (Name/Contact/
// Email/Location/Address), plus the lead-only fields (Source, Referred By,
// Landing Date) — kept identical so nothing has to be re-typed on Convert.
// Unlike "+ New Project", Location/Address stay optional here: a fresh
// enquiry often starts with just a name and phone number.
const emptyForm = { name: "", contact: "", email: "", source: "", referredBy: "", location: "", address: "", landingDate: "" };

const todayStr = () => new Date().toISOString().slice(0, 10);

// Leads live in their own `leads` list — separate from `projects` — so
// jotting down a raw enquiry never creates real project/room scaffolding.
// A lead only becomes a project via the explicit "Convert to Project" action
// below, once the customer has actually responded with enough to go on.
function Leads() {
  const { leads, setLeads, projects, setProjects } = useAppData();
  const navigate = useNavigate();

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const sorted = [...leads].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const openAdd = () => {
    setEditId(null);
    setForm({ ...emptyForm, landingDate: todayStr() });
    setError("");
    setModalOpen(true);
  };

  const openEdit = (lead) => {
    setEditId(lead.id);
    setForm({
      name: lead.name || "", contact: lead.contact || "", email: lead.email || "",
      source: lead.source || "", referredBy: lead.referredBy || "",
      location: lead.location || "", address: lead.address || "",
      landingDate: lead.landingDate || todayStr(),
    });
    setError("");
    setModalOpen(true);
  };

  const saveLead = () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.contact.trim()) { setError("Contact Number is required."); return; }
    if (!/^[0-9]{10}$/.test(form.contact)) { setError("Contact Number must be exactly 10 digits."); return; }
    setError("");
    if (editId) {
      setLeads((prev) => prev.map((l) => l.id === editId ? { ...l, ...form } : l));
    } else {
      const id = leads.length ? Math.max(...leads.map((l) => l.id)) + 1 : 1;
      setLeads((prev) => [...prev, { id, ...form, status: "new", nextFollowUpDate: "", createdAt: Date.now() }]);
    }
    setModalOpen(false);
  };

  const deleteLead = (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setConfirmDeleteId(null);
  };

  const updateLeadField = (id, field, value) => {
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
  };

  // The only path from a lead to a real project. Copies over everything
  // already known (name/contact/email/source/location/address — same field
  // set as "+ New Project"), creates the project in "In Progress" status, and
  // marks the lead "Converted" with a link to it. If Location/Address weren't
  // filled in on the lead, Edit Info on the new project still requires them
  // before the project can be saved again.
  const convertToProject = (lead) => {
    const id = projects.length ? Math.max(...projects.map((p) => p.id)) + 1 : 1;
    const newProject = {
      id,
      name: lead.name,
      client: lead.name,
      contact: lead.contact || "",
      email: lead.email || "",
      location: lead.location || "",
      address: lead.address || "",
      leadSource: lead.source || "",
      referredBy: lead.referredBy || "",
      createdAt: Date.now(),
    };
    setProjects((prev) => [...prev, newProject]);
    setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, status: "converted", convertedProjectId: id } : l));
    navigate(`/interior/projects?id=${id}`);
  };

  const sourceCounts = LEAD_SOURCES.map((s) => ({
    ...s,
    count: leads.filter((l) => l.source === s.value).length,
  })).filter((s) => s.count > 0);

  const inputStyle = { width: "100%" };

  return (
    <div className="page-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: "0 0 4px" }}>Leads</h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
            Every enquiry received — Facebook, Instagram, Google Ads, Reference, Walk-in or elsewhere. A lead only becomes a Project once you Convert it.
          </p>
        </div>
        <button onClick={openAdd} style={{ background: "#2563eb", padding: "8px 16px", fontSize: 13 }}>
          + New Lead
        </button>
      </div>

      {sourceCounts.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {sourceCounts.map((s) => (
            <span
              key={s.value}
              style={{ fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 20, color: "#374151", background: "#f3f4f6", border: "1px solid #e5e7eb" }}
            >
              {s.label}: {s.count}
            </span>
          ))}
        </div>
      )}

      <table border="1" cellPadding="10" cellSpacing="0" width="100%">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Name</th>
            <th style={{ textAlign: "left" }}>Contact</th>
            <th style={{ textAlign: "left" }}>Source</th>
            <th style={{ textAlign: "left" }}>Status</th>
            <th style={{ textAlign: "left" }}>Landing Date</th>
            <th style={{ textAlign: "left" }}>Next Update</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.length > 0 ? (
            sorted.map((l) => {
              const converted = l.status === "converted";
              return (
                <tr key={l.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{l.name}</div>
                  </td>
                  <td>
                    {l.contact && <div>📞 {l.contact}</div>}
                    {l.email && <div style={{ fontSize: 11, color: "#6b7280" }}>{l.email}</div>}
                    {!l.contact && !l.email && "—"}
                  </td>
                  <td>
                    {leadSourceLabel(l.source) || "—"}
                    {l.source === "reference" && l.referredBy && (
                      <div style={{ fontSize: 11, color: "#6b7280" }}>via {l.referredBy}</div>
                    )}
                  </td>
                  <td>
                    <select
                      value={l.status || "new"}
                      onChange={(e) => updateLeadField(l.id, "status", e.target.value)}
                      disabled={converted}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: "none",
                        cursor: converted ? "default" : "pointer",
                        color: leadStatusInfo(l.status).color, background: leadStatusInfo(l.status).bg,
                      }}
                    >
                      {LEAD_STATUSES.filter((s) => s.value !== "converted" || converted).map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={l.landingDate || ""}
                      onChange={(e) => updateLeadField(l.id, "landingDate", e.target.value)}
                      style={{ fontSize: 12, padding: "3px 6px" }}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={l.nextFollowUpDate || ""}
                      onChange={(e) => updateLeadField(l.id, "nextFollowUpDate", e.target.value)}
                      disabled={converted}
                      style={{ fontSize: 12, padding: "3px 6px" }}
                    />
                  </td>
                  <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                    {confirmDeleteId === l.id ? (
                      <>
                        <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600, marginRight: 6 }}>Delete lead?</span>
                        <button onClick={() => deleteLead(l.id)} style={{ background: "#dc2626", padding: "4px 10px", fontSize: 12, marginRight: 6 }}>Yes</button>
                        <button onClick={() => setConfirmDeleteId(null)} style={{ background: "#6b7280", padding: "4px 10px", fontSize: 12 }}>No</button>
                      </>
                    ) : converted ? (
                      <>
                        <Link to={`/interior/projects?id=${l.convertedProjectId}`} style={{ marginRight: 10 }}>Open Project →</Link>
                        <button onClick={() => setConfirmDeleteId(l.id)} style={{ background: "#dc2626", padding: "4px 10px", fontSize: 12 }}>
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => convertToProject(l)}
                          style={{ background: "#059669", padding: "4px 10px", fontSize: 12, marginRight: 6 }}
                        >
                          Convert to Project
                        </button>
                        <button onClick={() => openEdit(l)} style={{ background: "#6b7280", padding: "4px 10px", fontSize: 12, marginRight: 6 }}>
                          Edit
                        </button>
                        <button onClick={() => setConfirmDeleteId(l.id)} style={{ background: "#dc2626", padding: "4px 10px", fontSize: 12 }}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan="7">No leads yet — add one with "+ New Lead" above.</td>
            </tr>
          )}
        </tbody>
      </table>

      {modalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 420, maxWidth: "92vw" }}>
            <h3 style={{ marginTop: 0 }}>{editId ? "Edit Lead" : "New Lead"}</h3>
            {error && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 10 }}>{error}</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Name *</label>
                <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ramesh Kumar" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Contact Number *</label>
                <input
                  type="tel" inputMode="numeric" value={form.contact}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) }))}
                  placeholder="10-digit mobile number" style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Email ID</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="client@email.com" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Lead Source</label>
                <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} style={inputStyle}>
                  <option value="">— Select —</option>
                  {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {form.source === "reference" && (
                <div>
                  <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Referred By</label>
                  <input value={form.referredBy} onChange={(e) => setForm((f) => ({ ...f, referredBy: e.target.value }))} placeholder="e.g. Suresh (past client)" style={inputStyle} />
                </div>
              )}
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>City / Location</label>
                <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Hyderabad" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Full Address</label>
                <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="e.g. Plot 12, Jubilee Hills, Hyderabad 500033" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Landing Date</label>
                <input type="date" value={form.landingDate} onChange={(e) => setForm((f) => ({ ...f, landingDate: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setModalOpen(false)} style={{ background: "#6b7280" }}>Cancel</button>
              <button onClick={saveLead} style={{ background: "#2563eb" }}>{editId ? "Save" : "Add Lead"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Leads;
