import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, Eye, LogOut, UserCog, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";
import { fetchTeam } from "./TeamAdmin";
import { groupImpersonation, personImpersonation } from "../utils/access";

const initials = (name) => (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const item = { display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "#1f2937", cursor: "pointer" };
const heading = { fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9ca3af", padding: "6px 10px 2px" };

// The owner's profile at the top right: Your profile, Impersonate (see the app as
// a group or a person sees it, read-only) and Sign out.
export default function ProfileMenu() {
  const { realUser, impersonation, startImpersonation, stopImpersonation, logout } = useAuth();
  const { flushPendingSave } = useAppData();
  const { guardedNavigate } = useUnsavedChanges();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState(null); // { employees, groups } once loaded
  const [error, setError] = useState("");

  // The list of groups and people is fetched when the menu opens.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchTeam()
      .then((d) => { if (alive) { setTeam({ employees: d.employees || [], groups: d.groups || [] }); setError(""); } })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [open]);

  const start = (who) => {
    if (!who) return;
    setOpen(false);
    guardedNavigate(async () => {
      try { await flushPendingSave(); } catch { /* the preview doesn't depend on it */ }
      startImpersonation(who);
      navigate("/interior");
    });
  };

  const people = (team?.employees || []).filter((e) => !e.customer && e.hasLogin && e.groupId);
  const groups = team?.groups || [];

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu" aria-expanded={open} title="Your account"
        style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "1px solid var(--stone-300)", borderRadius: 999, padding: "3px 10px 3px 4px", color: "var(--stone-700)", fontSize: 12, cursor: "pointer" }}
      >
        <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#1e3a5f", color: "#fff", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{initials(realUser?.name)}</span>
        {realUser?.name || "Profile"}
        <ChevronDown size={13} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 2900 }} />
          <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 2901, width: 290, maxHeight: "75vh", overflowY: "auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.16)", padding: 6 }}>
            <div style={{ padding: "8px 10px 6px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{realUser?.name}</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{realUser?.email}</div>
            </div>
            <button style={item} onClick={() => { setOpen(false); guardedNavigate(() => navigate("/interior/profile")); }}><UserCog size={14} /> Your profile</button>

            <div style={{ height: 1, background: "#f3f4f6", margin: "6px 0" }} />
            <div style={heading}>Impersonate — see what they see</div>
            {impersonation && (
              <button style={{ ...item, background: "#f5f3ff", color: "#4c1d95" }} onClick={() => { stopImpersonation(); setOpen(false); }}>
                <Eye size={14} /> Viewing as {impersonation.label} — exit preview
              </button>
            )}
            {error && <div style={{ padding: "6px 10px", fontSize: 12, color: "#dc2626" }}>{error}</div>}
            {!team && !error && <div style={{ padding: "6px 10px", fontSize: 12, color: "#6b7280" }}>Loading…</div>}
            {team && groups.length === 0 && people.length === 0 && (
              <div style={{ padding: "6px 10px", fontSize: 12, color: "#6b7280" }}>No groups or people yet — add them under Teams.</div>
            )}
            {groups.length > 0 && <div style={heading}>Groups</div>}
            {groups.map((g) => (
              <button key={g.id} style={item} onClick={() => start(groupImpersonation(g))}>
                <Users size={14} /> <span style={{ flex: 1 }}>{g.name}</span>
                {impersonation?.kind === "group" && impersonation.label === g.name && <Check size={13} />}
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{g.employeeCount}</span>
              </button>
            ))}
            {people.length > 0 && <div style={heading}>Team members</div>}
            {people.map((e) => (
              <button key={e.id} style={item} onClick={() => start(personImpersonation(e, groups))}>
                <UserCog size={14} /> <span style={{ flex: 1 }}>{e.name}</span>
                {impersonation?.kind === "person" && impersonation.label === e.name && <Check size={13} />}
                <span style={{ fontSize: 11, color: "#9ca3af" }}>{groups.find((g) => g.id === e.groupId)?.name}</span>
              </button>
            ))}

            <div style={{ height: 1, background: "#f3f4f6", margin: "6px 0" }} />
            <button style={item} onClick={() => guardedNavigate(async () => { await flushPendingSave(); await logout(); })}><LogOut size={14} /> Sign out</button>
          </div>
        </>
      )}
    </div>
  );
}
