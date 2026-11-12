import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import RoomRequirements from "./RoomRequirements";
import { answeredCount, getFolders, getSets, matchingQuestions, printRequirements, setLabel, withAnswer, withRemark } from "../utils/requirements";

const outlineBtn = { background: "#fff", color: "#4c1d95", border: "1px solid #c4b5fd", fontSize: 12, padding: "3px 12px" };
const NEW_ROOM = "__new__";

// Req Form tab: the rooms that are on this project's requirement form, each with
// the requirement (question set from Configure › Req Form) chosen for it. A room
// with no requirement chosen is not on the form. Answer here, or let the customer
// answer from their own login; print the sheet. Once a customer submits, the form
// is locked for them until "Reopen" is pressed here.
export default function RequirementsPanel({ project, rooms }) {
  const { companyProfile, setSubProjects, setProjects } = useAppData();
  const sets = getSets(companyProfile);
  const folders = getFolders(companyProfile);
  const navigate = useNavigate();
  const [open, setOpen] = useState({});
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState(null); // { roomId, name, setId }
  const [removing, setRemoving] = useState(null); // room showing "Remove? Yes / No"
  const searching = query.trim() !== "";
  const submittedAt = project?.requirementsSubmittedAt;

  const onForm = rooms.filter((r) => !!r.requirementSetId);
  const offForm = rooms.filter((r) => !r.requirementSetId);

  const patchRoom = (roomId, patch) => setSubProjects((prev) => prev.map((r) => (r.id === roomId ? { ...r, ...patch } : r)));
  const reopen = () => setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, requirementsSubmittedAt: null, requirementsSubmittedBy: null } : p)));

  const openDialog = () => setDialog({ roomId: offForm[0] ? offForm[0].id : NEW_ROOM, name: "", setId: sets[0]?.id || "" });
  const addToForm = () => {
    if (!dialog || !dialog.setId) return;
    if (dialog.roomId === NEW_ROOM) {
      const name = dialog.name.trim();
      if (!name) return;
      // A new room is made here the same way as in Measurement; it starts empty.
      setSubProjects((prev) => {
        const id = prev.length ? Math.max(...prev.map((s) => s.id)) + 1 : 1;
        return [...prev, { id, project: project.name, subProject: name, roomType: "", matPly: "", matLaminate: "", matEdgeBand: "", requirementSetId: dialog.setId }];
      });
    } else {
      patchRoom(Number(dialog.roomId) || dialog.roomId, { requirementSetId: dialog.setId });
    }
    setDialog(null);
  };
  const dialogReady = dialog && dialog.setId && (dialog.roomId !== NEW_ROOM || dialog.name.trim());

  return (
    <div style={{ border: "1px solid #ddd6fe", borderRadius: 10, background: "#faf5ff", padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <strong style={{ fontSize: 14, color: "#4c1d95" }}>Room requirements</strong>
        {submittedAt && (
          <span style={{ fontSize: 12, color: "#047857", background: "#d1fae5", borderRadius: 999, padding: "2px 10px" }}>
            ✓ Submitted by {project.requirementsSubmittedBy === "customer" ? "the customer" : "staff"} on {new Date(submittedAt).toLocaleDateString()}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={openDialog} disabled={sets.length === 0} title={sets.length === 0 ? "Create a requirement under Configure › Req Form first" : ""} style={{ fontSize: 12, padding: "4px 12px" }}>+ Add Room</button>
        {onForm.length > 0 && (
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions, answers, remarks…" aria-label="Search the form"
            style={{ width: 240, fontSize: 12, padding: "4px 10px", border: "1px solid #c4b5fd", borderRadius: 8 }}
          />
        )}
        {submittedAt && <button onClick={reopen} style={outlineBtn}>Reopen for customer</button>}
        {onForm.length > 0 && <button onClick={() => navigate(`/interior/customer-preview?id=${project.id}`)} style={outlineBtn}>👁 Customer's view</button>}
        {onForm.length > 0 && <button onClick={() => printRequirements(project.name, rooms, sets)} style={outlineBtn}>🖨 Print sheet</button>}
      </div>

      {sets.length === 0 ? (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>
          No requirements yet — create them under Configure › Req Form (for example a Kitchen requirement), then add rooms here.
        </p>
      ) : onForm.length === 0 ? (
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#9ca3af" }}>
          No rooms on the form yet — use + Add Room to pick a room (or make a new one) and the requirement to ask about it.
        </p>
      ) : onForm.map((room) => {
        const set = sets.find((s) => s.id === room.requirementSetId);
        const total = (set?.questions || []).length;
        const done = answeredCount(set, room);
        // A search shows only rooms with a matching question, opened.
        if (searching && (!set || matchingQuestions(set, room, query).length === 0)) return null;
        const isOpen = (searching || !!open[room.id]) && !!set;
        return (
          <div key={room.id} style={{ background: "#fff", border: "1px solid #ede9fe", borderRadius: 8, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", flexWrap: "wrap" }}>
              <button
                type="button" disabled={!set} onClick={() => setOpen((o) => ({ ...o, [room.id]: !o[room.id] }))}
                style={{ background: "none", border: "none", color: "#1e3a5f", fontWeight: 700, fontSize: 13, padding: 0, cursor: set ? "pointer" : "default" }}
              >{set ? (isOpen ? "▾" : "▸") : "•"} {room.subProject || "Room"}</button>
              <select
                value={room.requirementSetId}
                onChange={(e) => patchRoom(room.id, { requirementSetId: e.target.value })}
                style={{ fontSize: 12, padding: "3px 6px", width: 190 }}
              >
                {sets.map((s) => <option key={s.id} value={s.id}>{setLabel(s, folders)}</option>)}
                {!set && <option value={room.requirementSetId}>(deleted requirement)</option>}
              </select>
              {set && <span style={{ fontSize: 12, color: done === total ? "#047857" : "#6b7280" }}>{done} of {total} answered</span>}
              <span style={{ flex: 1 }} />
              {removing === room.id ? (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>Remove from form? (answers are kept)</span>
                  <button onClick={() => { patchRoom(room.id, { requirementSetId: null }); setRemoving(null); }} style={{ background: "#dc2626", fontSize: 11, padding: "2px 10px" }}>Yes</button>
                  <button onClick={() => setRemoving(null)} style={{ background: "#6b7280", fontSize: 11, padding: "2px 10px" }}>No</button>
                </span>
              ) : (
                <button title="Remove this room from the form" onClick={() => setRemoving(room.id)} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✕</button>
              )}
            </div>
            {isOpen && (
              <div style={{ padding: "4px 14px 14px", borderTop: "1px solid #f3f0ff" }}>
                <div style={{ height: 8 }} />
                <RoomRequirements
                  set={set} answers={room.requirements || {}} query={query}
                  onChange={(qid, v) => patchRoom(room.id, { requirements: withAnswer(room, qid, v) })}
                  remarks={room.remarks || {}}
                  onRemark={(qid, text) => patchRoom(room.id, { remarks: withRemark(room, qid, text) })}
                />
              </div>
            )}
          </div>
        );
      })}

      {dialog && (
        <div onClick={() => setDialog(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 28, width: 420, maxWidth: "94vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 14px" }}>Add a room to the form</h3>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Room</label>
            <select value={dialog.roomId} onChange={(e) => setDialog((d) => ({ ...d, roomId: e.target.value }))} style={{ width: "100%", marginBottom: 12 }}>
              {offForm.map((r) => <option key={r.id} value={r.id}>{r.subProject || "Room"}</option>)}
              <option value={NEW_ROOM}>＋ New room…</option>
            </select>
            {dialog.roomId === NEW_ROOM && (
              <input
                autoFocus type="text" value={dialog.name} placeholder="Room name (e.g. Kitchen)"
                onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter" && dialogReady) addToForm(); }}
                style={{ width: "100%", marginBottom: 12 }}
              />
            )}
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Requirement</label>
            <select value={dialog.setId} onChange={(e) => setDialog((d) => ({ ...d, setId: e.target.value }))} style={{ width: "100%", marginBottom: 18 }}>
              {sets.map((s) => <option key={s.id} value={s.id}>{setLabel(s, folders)}</option>)}
            </select>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setDialog(null)} style={{ background: "#6b7280", padding: "8px 18px" }}>Cancel</button>
              <button onClick={addToForm} disabled={!dialogReady} style={{ padding: "8px 18px", opacity: dialogReady ? 1 : 0.5 }}>Add to form</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
