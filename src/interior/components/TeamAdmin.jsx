import { Fragment, useCallback, useEffect, useState } from "react";
import { authFetch } from "@/context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import { PROJECT_TABS, SCREENS } from "../utils/access";

// Owner-only admin for the Team list and its groups, backed by /api/interior_team.php.
// A person can optionally sign in with the username + password set here (the
// normal sign-in page accepts a username) and then works in this account's
// workspace under their group's View / Edit / Delete rules.

async function callTeam(body) {
  const res = await authFetch("/api/interior_team.php", body ? { method: "POST", body: JSON.stringify(body) } : {});
  let data = {};
  try { data = await res.json(); } catch { /* handled below */ }
  if (!res.ok || !data.success) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

/** Loads employees + groups once, and returns an `act` that runs an action and refreshes. */
export function useTeamAdmin() {
  const [team, setTeam] = useState({ employees: [], groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const data = await callTeam();
      setTeam({ employees: data.employees || [], groups: data.groups || [] });
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const act = useCallback(async (body) => {
    const data = await callTeam(body); // throws on a validation error, shown by the caller
    setTeam({ employees: data.employees || [], groups: data.groups || [] });
  }, []);

  return { team, loading, error, act };
}

const label = { fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 };

function Modal({ title, onClose, children, width = 440 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 24, width, maxWidth: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} title="Close" style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fmtDate = (v) => (v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Never");

// ── Team (everyone you work with; some of them can sign in) ─────────────────
const emptyPerson = { name: "", role: "", phone: "", email: "", canSignIn: false, username: "", password: "", groupId: "", active: true };

export function TeamPanel({ team, act }) {
  const [form, setForm] = useState(null); // null = closed
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const groupName = (id) => team.groups.find((g) => g.id === id)?.name;

  const openAdd = () => { setEditId(null); setForm({ ...emptyPerson }); setError(""); };
  const openEdit = (e) => {
    setEditId(e.id);
    setForm({ name: e.name, role: e.role, phone: e.phone, email: e.email, canSignIn: e.hasLogin, username: e.username, password: "", groupId: e.groupId || "", active: e.active });
    setError("");
  };
  const save = async () => {
    setBusy(true); setError("");
    try {
      await act({ action: "saveEmployee", id: editId || undefined, ...form, groupId: form.groupId || null });
      setForm(null);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = async (e) => {
    if (!window.confirm(`Delete ${e.name}?${e.hasLogin ? " They will no longer be able to sign in." : ""}`)) return;
    try { await act({ action: "deleteEmployee", id: e.id }); } catch (err) { window.alert(err.message); }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const hadLogin = editId && team.employees.find((x) => x.id === editId)?.hasLogin;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ color: "#6b7280", fontSize: 13, maxWidth: 680 }}>
          Everyone you work with — carpenters, designers, site supervisors. Keep their contact details here, and give anyone who needs it their own username and password so they can sign in; their group decides what they can see, edit and delete.
        </span>
        <button onClick={openAdd} style={{ background: "#2563eb", padding: "6px 14px", fontSize: 13 }}>+ Add Person</button>
      </div>

      <table border="1" cellPadding="10" cellSpacing="0" width="100%">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Name</th>
            <th style={{ textAlign: "left" }}>Role</th>
            <th style={{ textAlign: "left" }}>Phone</th>
            <th style={{ textAlign: "left" }}>Email</th>
            <th style={{ textAlign: "left" }}>Sign-in</th>
            <th style={{ textAlign: "left" }}>Group</th>
            <th style={{ textAlign: "left" }}>Last sign-in</th>
            <th style={{ textAlign: "left", width: 130 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {team.employees.length === 0 ? (
            <tr><td colSpan="8">No one yet — add a person with "+ Add Person".</td></tr>
          ) : team.employees.map((e) => (
            <tr key={e.id}>
              <td style={{ fontWeight: 700 }}>{e.name}</td>
              <td>{e.role || "—"}</td>
              <td>{e.phone ? `📞 ${e.phone}` : "—"}</td>
              <td>{e.email || "—"}</td>
              <td>
                {e.hasLogin ? (
                  <span><code>{e.username}</code> {e.active ? <span style={{ color: "#059669", fontSize: 11 }}>Active</span> : <span style={{ color: "#9ca3af", fontSize: 11 }}>Disabled</span>}</span>
                ) : <span style={{ color: "#9ca3af" }}>Contact only</span>}
              </td>
              <td>{e.hasLogin ? (groupName(e.groupId) || <span style={{ color: "#dc2626" }}>No group (no access)</span>) : "—"}</td>
              <td style={{ fontSize: 12, color: "#6b7280" }}>{e.hasLogin ? fmtDate(e.lastLoginAt) : "—"}</td>
              <td>
                <span style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => openEdit(e)} style={{ background: "#2563eb", fontSize: 11, padding: "3px 10px" }}>Edit</button>
                  <button onClick={() => remove(e)} style={{ background: "#dc2626", fontSize: 11, padding: "3px 10px" }}>Delete</button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <Modal title={editId ? "Edit Person" : "Add Person"} onClose={() => setForm(null)}>
          {error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 10 }}>{error}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            <div>
              <label style={label}>Name *</label>
              <input autoFocus value={form.name} onChange={set("name")} placeholder="e.g. Ravi Kumar" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={label}>Role</label>
                <input value={form.role} onChange={set("role")} placeholder="e.g. Carpenter, Designer" />
              </div>
              <div>
                <label style={label}>Phone</label>
                <input type="tel" inputMode="numeric" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) }))} placeholder="10-digit mobile" />
              </div>
            </div>
            <div>
              <label style={label}>Email</label>
              <input type="email" value={form.email} onChange={set("email")} placeholder="name@email.com" />
            </div>

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: form.canSignIn ? "#f8fafc" : "#fff" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <input type="checkbox" checked={form.canSignIn} onChange={(e) => setForm((f) => ({ ...f, canSignIn: e.target.checked }))} style={{ width: 15, height: 15 }} />
                Can sign in to this app
              </label>
              {!form.canSignIn && (
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                  {hadLogin ? "Saving will remove their username and password and sign them out." : "Leave off for someone who is only a contact."}
                </div>
              )}
              {form.canSignIn && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={label}>Username *</label>
                      <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, "") }))} placeholder="e.g. ravi.k" autoComplete="off" />
                    </div>
                    <div>
                      <label style={label}>{hadLogin ? "New password" : "Password *"}</label>
                      <input type="text" value={form.password} onChange={set("password")} placeholder={hadLogin ? "Leave blank to keep" : "At least 6 characters"} autoComplete="new-password" />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: -6 }}>
                    They sign in on the normal sign-in page with this username and password. Share them yourself — the password can't be viewed again, only replaced.
                  </div>
                  <div>
                    <label style={label}>Group (what they can access)</label>
                    <select value={form.groupId} onChange={set("groupId")}>
                      <option value="">— No group (no access) —</option>
                      {team.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    {team.groups.length === 0 && <div style={{ fontSize: 11, color: "#b45309", marginTop: 4 }}>Create a group first under "Groups &amp; Access".</div>}
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} style={{ width: 15, height: 15 }} />
                    Active (untick to stop them signing in without deleting them)
                  </label>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button onClick={() => setForm(null)} style={{ background: "#6b7280" }}>Cancel</button>
            <button onClick={save} disabled={busy} style={{ background: "#2563eb" }}>{busy ? "Saving…" : editId ? "Save" : "Add Person"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Groups & access ──────────────────────────────────────────────────────────
const noPerm = () => ({ view: false, edit: false, delete: false });
const emptyPerms = () => ({
  ...Object.fromEntries(SCREENS.filter((x) => x.key !== "projects").map((x) => [x.key, noPerm()])),
  tabs: Object.fromEntries(PROJECT_TABS.map((t) => [t.key, noPerm()])),
});

const letters = (p) => [p.view && "V", p.edit && "E", p.delete && "D"].filter(Boolean).join("");

const permSummary = (perms) => {
  const parts = SCREENS.filter((x) => x.key !== "projects" && perms[x.key]?.view)
    .map((x) => `${x.label} (${letters(perms[x.key])})`);
  const tabs = PROJECT_TABS.filter((t) => perms.tabs?.[t.key]?.view);
  if (tabs.length) parts.unshift(`Projects: ${tabs.map((t) => `${t.label} (${letters(perms.tabs[t.key])})`).join(", ")}`);
  return parts.length ? parts.join(" · ") : "No access";
};

export function GroupsPanel({ team, act }) {
  const { projects } = useAppData();
  const [form, setForm] = useState(null); // { name, perms, scopeAll, scopeIds }
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const openAdd = () => { setEditId(null); setForm({ name: "", perms: emptyPerms(), scopeAll: true, scopeIds: [] }); setError(""); };
  const openEdit = (g) => {
    setEditId(g.id);
    setForm({ name: g.name, perms: { ...emptyPerms(), ...g.perms, tabs: { ...emptyPerms().tabs, ...(g.perms.tabs || {}) } }, scopeAll: g.scope === null, scopeIds: (g.scope || []).map(String) });
    setError("");
  };

  // Edit / Delete imply View; removing View clears them (a group can't change what it can't see).
  const applyToggle = (cur, action) => {
    const next = { ...cur, [action]: !cur[action] };
    if (action !== "view" && next[action]) next.view = true;
    if (action === "view" && !next.view) { next.edit = false; next.delete = false; }
    return next;
  };
  const toggle = (screen, action) => setForm((f) => ({ ...f, perms: { ...f.perms, [screen]: applyToggle(f.perms[screen], action) } }));
  const toggleTab = (tab, action) => setForm((f) => ({
    ...f, perms: { ...f.perms, tabs: { ...f.perms.tabs, [tab]: applyToggle(f.perms.tabs[tab], action) } },
  }));
  // "All" box in a column header: every screen and every tab that offers the action.
  const setAll = (action, on) => setForm((f) => {
    const apply = (cur) => {
      const next = { ...cur, [action]: on };
      if (action !== "view" && on) next.view = true;
      if (action === "view" && !on) { next.edit = false; next.delete = false; }
      return next;
    };
    const perms = { ...f.perms, tabs: { ...f.perms.tabs } };
    SCREENS.filter((x) => x.key !== "projects").forEach((x) => { perms[x.key] = apply(f.perms[x.key]); });
    PROJECT_TABS.forEach((t) => { if (t.actions.includes(action)) perms.tabs[t.key] = apply(f.perms.tabs[t.key]); });
    return { ...f, perms };
  });
  const toggleProject = (id) => setForm((f) => ({
    ...f, scopeIds: f.scopeIds.includes(String(id)) ? f.scopeIds.filter((x) => x !== String(id)) : [...f.scopeIds, String(id)],
  }));

  const save = async () => {
    setBusy(true); setError("");
    try {
      await act({ action: "saveGroup", id: editId || undefined, name: form.name, perms: form.perms, scope: form.scopeAll ? null : form.scopeIds });
      setForm(null);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = async (g) => {
    const warn = g.employeeCount ? ` ${g.employeeCount} employee${g.employeeCount !== 1 ? "s" : ""} in it will have no access until moved to another group.` : "";
    if (!window.confirm(`Delete the group "${g.name}"?${warn}`)) return;
    try { await act({ action: "deleteGroup", id: g.id }); } catch (err) { window.alert(err.message); }
  };

  const scopeText = (g) => (g.scope === null ? "All projects" : `${g.scope.length} project${g.scope.length !== 1 ? "s" : ""}`);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ color: "#6b7280", fontSize: 13, maxWidth: 640 }}>
          A group is a set of access rules. For each screen choose what its members can <b>View</b>, <b>Edit</b> and <b>Delete</b>, and whether they see every project or only some. Then put employees in the group.
        </span>
        <button onClick={openAdd} style={{ background: "#2563eb", padding: "6px 14px", fontSize: 13 }}>+ Add Group</button>
      </div>

      <table border="1" cellPadding="10" cellSpacing="0" width="100%">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Group</th>
            <th style={{ textAlign: "left" }}>Employees</th>
            <th style={{ textAlign: "left" }}>Projects</th>
            <th style={{ textAlign: "left" }}>Access (V = view, E = edit, D = delete)</th>
            <th style={{ textAlign: "left", width: 130 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {team.groups.length === 0 ? (
            <tr><td colSpan="5">No groups yet — add one with "+ Add Group".</td></tr>
          ) : team.groups.map((g) => (
            <tr key={g.id}>
              <td style={{ fontWeight: 700 }}>{g.name}</td>
              <td>{g.employeeCount}</td>
              <td>{scopeText(g)}</td>
              <td style={{ fontSize: 12, color: "#374151" }}>{permSummary(g.perms)}</td>
              <td>
                <span style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => openEdit(g)} style={{ background: "#2563eb", fontSize: 11, padding: "3px 10px" }}>Edit</button>
                  <button onClick={() => remove(g)} style={{ background: "#dc2626", fontSize: 11, padding: "3px 10px" }}>Delete</button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <Modal title={editId ? "Edit Group" : "Add Group"} onClose={() => setForm(null)} width={560}>
          {error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 10 }}>{error}</div>}
          <div style={{ marginTop: 12 }}>
            <label style={label}>Group name *</label>
            <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Designers, Site Supervisors" />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={label}>Access by screen</label>
            <table border="1" cellPadding="7" cellSpacing="0" width="100%" style={{ fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  <th style={{ textAlign: "left" }}>Screen</th>
                  {["view", "edit", "delete"].map((a) => (
                    <th key={a} style={{ textAlign: "center", width: 70, textTransform: "capitalize" }}>
                      {a}
                      <div>
                        <input
                          type="checkbox" title={`All screens and tabs: ${a}`}
                          checked={SCREENS.filter((x) => x.key !== "projects").every((x) => form.perms[x.key]?.[a]) && PROJECT_TABS.filter((t) => t.actions.includes(a)).every((t) => form.perms.tabs[t.key]?.[a])}
                          onChange={(e) => setAll(a, e.target.checked)}
                          style={{ width: 14, height: 14, cursor: "pointer" }}
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCREENS.map((x) => x.key === "projects" ? (
                  <Fragment key="projects">
                    <tr style={{ background: "#eef2ff" }}>
                      <td colSpan={4} style={{ fontWeight: 700 }}>
                        Projects — choose what they can do on each tab
                      </td>
                    </tr>
                    {PROJECT_TABS.map((t) => (
                      <tr key={t.key}>
                        <td style={{ paddingLeft: 26 }}>{t.label}</td>
                        {["view", "edit", "delete"].map((a) => (
                          <td key={a} style={{ textAlign: "center" }}>
                            {t.actions.includes(a)
                              ? <input type="checkbox" checked={!!form.perms.tabs[t.key]?.[a]} onChange={() => toggleTab(t.key, a)} style={{ width: 15, height: 15, cursor: "pointer" }} />
                              : <span style={{ color: "#d1d5db" }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ) : (
                  <tr key={x.key}>
                    <td>{x.label}</td>
                    {["view", "edit", "delete"].map((a) => (
                      <td key={a} style={{ textAlign: "center" }}>
                        <input type="checkbox" checked={!!form.perms[x.key]?.[a]} onChange={() => toggle(x.key, a)} style={{ width: 15, height: 15, cursor: "pointer" }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
              Edit includes adding new rows. Edit and Delete need View. The three Material Analysis rows control one tab: "quantities only" shows what is needed without any rate or amount, "with rates" adds rates and amounts, and "change brands & rates" also lets them edit. On Quotation — Customer View, Edit means they may also create and manage the customer share link. A group that can see any Projects tab can also read the prices, templates and gallery a quotation is built from — they still can't change them without that screen's Edit.
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={label}>Projects this group can work on</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 4 }}>
              <input type="radio" checked={form.scopeAll} onChange={() => setForm((f) => ({ ...f, scopeAll: true }))} /> All projects
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="radio" checked={!form.scopeAll} onChange={() => setForm((f) => ({ ...f, scopeAll: false }))} /> Only the projects I tick
            </label>
            {!form.scopeAll && (
              <div style={{ marginTop: 8, border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, maxHeight: 160, overflowY: "auto" }}>
                {projects.length === 0 ? <span style={{ fontSize: 12, color: "#9ca3af" }}>No projects yet.</span> : projects.map((p) => (
                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0", cursor: "pointer" }}>
                    <input type="checkbox" checked={form.scopeIds.includes(String(p.id))} onChange={() => toggleProject(p.id)} style={{ width: 15, height: 15 }} />
                    {p.name}{p.client ? <span style={{ color: "#9ca3af" }}> — {p.client}</span> : null}
                  </label>
                ))}
              </div>
            )}
            {!form.scopeAll && (
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
                Limited groups only see these projects and their rooms, and can't create new projects. Leads, items, templates and the rest are not project-specific, so they follow the screen access above.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button onClick={() => setForm(null)} style={{ background: "#6b7280" }}>Cancel</button>
            <button onClick={save} disabled={busy} style={{ background: "#2563eb" }}>{busy ? "Saving…" : editId ? "Save" : "Add Group"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
