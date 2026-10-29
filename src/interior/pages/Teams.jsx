import { useState } from "react";
import { useAppData } from "../context/AppDataContext";

const emptyForm = { name: "", role: "", phone: "", email: "" };

function Teams() {
  const { teamMembers, setTeamMembers } = useAppData();
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  };

  const openEdit = (m) => {
    setEditId(m.id);
    setForm({ name: m.name || "", role: m.role || "", phone: m.phone || "", email: m.email || "" });
    setError("");
    setFormOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (form.phone && !/^[0-9]{10}$/.test(form.phone)) { setError("Phone must be exactly 10 digits."); return; }
    const clean = { ...form, name: form.name.trim(), role: form.role.trim(), email: form.email.trim() };
    if (editId) {
      setTeamMembers((prev) => prev.map((m) => (m.id === editId ? { ...m, ...clean } : m)));
    } else {
      const id = teamMembers.length ? Math.max(...teamMembers.map((m) => m.id)) + 1 : 1;
      setTeamMembers((prev) => [...prev, { id, ...clean, createdAt: Date.now() }]);
    }
    setFormOpen(false);
  };

  const remove = (id) => {
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
    setConfirmDeleteId(null);
  };

  const label = { fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 };

  return (
    <div className="page-card" style={{ minHeight: "calc(100vh - 62px)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ color: "#6b7280", fontSize: 13 }}>
          The people you work with — carpenters, designers, site supervisors. Add them here to keep their contact details in one place.
        </span>
        <button onClick={openAdd} style={{ background: "#2563eb", padding: "6px 14px", fontSize: 13 }}>+ Add Member</button>
      </div>

      <table border="1" cellPadding="10" cellSpacing="0" width="100%">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Name</th>
            <th style={{ textAlign: "left" }}>Role</th>
            <th style={{ textAlign: "left" }}>Phone</th>
            <th style={{ textAlign: "left" }}>Email</th>
            <th style={{ textAlign: "left", width: 150 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {teamMembers.length === 0 ? (
            <tr>
              <td colSpan="5">No team members yet — add one with "+ Add Member" above.</td>
            </tr>
          ) : (
            teamMembers.map((m) => (
              <tr key={m.id}>
                <td style={{ fontWeight: 700 }}>{m.name}</td>
                <td>{m.role || "—"}</td>
                <td>{m.phone ? `📞 ${m.phone}` : "—"}</td>
                <td>{m.email || "—"}</td>
                <td>
                  {confirmDeleteId === m.id ? (
                    <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                      Delete?
                      <button onClick={() => remove(m.id)} style={{ background: "#dc2626", fontSize: 11, padding: "3px 10px" }}>Yes</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ background: "#6b7280", fontSize: 11, padding: "3px 10px" }}>No</button>
                    </span>
                  ) : (
                    <span style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openEdit(m)} style={{ background: "#2563eb", fontSize: 11, padding: "3px 10px" }}>Edit</button>
                      <button onClick={() => setConfirmDeleteId(m.id)} style={{ background: "#dc2626", fontSize: 11, padding: "3px 10px" }}>Delete</button>
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {formOpen && (
        <div
          onClick={() => setFormOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 24, width: 400, maxWidth: "94vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>{editId ? "Edit Member" : "Add Member"}</h3>
              <button onClick={() => setFormOpen(false)} title="Close" style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
            </div>
            {error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 10 }}>{error}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              <div>
                <label style={label}>Name *</label>
                <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ravi Kumar" />
              </div>
              <div>
                <label style={label}>Role</label>
                <input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="e.g. Carpenter, Site Supervisor" />
              </div>
              <div>
                <label style={label}>Phone</label>
                <input
                  type="tel" inputMode="numeric" value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) }))}
                  placeholder="10-digit mobile number"
                />
              </div>
              <div>
                <label style={label}>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@email.com" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setFormOpen(false)} style={{ background: "#6b7280" }}>Cancel</button>
              <button onClick={save} style={{ background: "#2563eb" }}>{editId ? "Save" : "Add Member"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Teams;
