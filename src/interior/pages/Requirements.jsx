import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import RequirementSetEditor from "../components/RequirementSetsEditor";
import { QUESTION_TYPES, folderOf, folderPath, getFolders, getSets, newId } from "../utils/requirements";

const typeLabel = Object.fromEntries(QUESTION_TYPES.map((t) => [t.key, t.label.replace(/ \(.*\)$/, "")]));
const ROOT = "Req Form";
const tiny = { background: "none", border: "none", padding: "2px 5px", fontSize: 13, cursor: "pointer" };

// Configure › Req Form. Like Templates: folders (nested) holding one entry per
// requirement (Kitchen, Bedroom…), each opened on its own to edit its questions. A
// project's Req Form tab picks one of these for each room, and a customer
// answers it from their own login. A question is Yes / No, Choose one (each choice
// may carry a picture and a link), a Number or short Text.
function Requirements() {
  const { companyProfile, setCompanyProfile } = useAppData();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState(null); // { kind: "folder" | "requirement", name }
  const [renaming, setRenaming] = useState(null); // { id, text }
  const [confirmId, setConfirmId] = useState(null); // folder showing "Delete? Yes / No"

  const sets = getSets(companyProfile);
  const folders = getFolders(companyProfile);
  const folderParam = params.get("folder");
  const currentId = folders.some((f) => f.id === folderParam) ? folderParam : null;
  const open = sets.find((s) => s.id === params.get("id")) || null;
  const view = (id, folder) => { const p = {}; if (folder) p.folder = folder; if (id) p.id = id; setParams(p); };

  const subfolders = folders.filter((f) => (f.parentId ?? null) === currentId);
  const setsHere = sets.filter((s) => folderOf(s, folders) === currentId);
  const deep = (id) => {
    let nSets = sets.filter((s) => folderOf(s, folders) === id).length;
    let nFolders = 0;
    folders.filter((f) => (f.parentId ?? null) === id).forEach((f) => { const d = deep(f.id); nSets += d.nSets; nFolders += 1 + d.nFolders; });
    return { nSets, nFolders };
  };

  const patchProfile = (fn) => setCompanyProfile((p) => ({ ...(p || {}), ...fn(getFolders(p), getSets(p)) }));
  const create = () => {
    const n = (dialog?.name || "").trim();
    if (!n) return;
    if (dialog.kind === "folder") {
      patchProfile((fs) => ({ requirementFolders: [...fs, { id: newId("fld"), name: n, parentId: currentId }] }));
      setDialog(null);
    } else {
      const id = newId("set");
      patchProfile((_fs, ss) => ({ requirementSets: [...ss, { id, name: n, folderId: currentId, questions: [] }] }));
      setDialog(null);
      view(id, currentId);
    }
  };
  const saveRename = () => {
    const text = (renaming?.text || "").trim();
    if (text) patchProfile((fs) => ({ requirementFolders: fs.map((f) => (f.id === renaming.id ? { ...f, name: text } : f)) }));
    setRenaming(null);
  };
  // Deleting a folder never deletes requirements: what is inside moves up one level.
  const deleteFolder = (id) => {
    patchProfile((fs, ss) => {
      const parent = fs.find((f) => f.id === id)?.parentId ?? null;
      return {
        requirementFolders: fs.filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId: parent } : f)),
        requirementSets: ss.map((s) => (s.folderId === id ? { ...s, folderId: parent } : s)),
      };
    });
    setConfirmId(null);
  };

  const summary = (s) => {
    const counts = {};
    (s.questions || []).forEach((q) => { counts[q.type] = (counts[q.type] || 0) + 1; });
    return Object.entries(counts).map(([t, n]) => `${typeLabel[t] || t} × ${n}`).join(" · ");
  };

  if (open) {
    const back = folderOf(open, folders);
    return (
      <div>
        <button onClick={() => view(null, back)} style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", fontSize: 13, padding: "5px 14px", marginBottom: 14 }}>
          ← {back ? folderPath(folders, back).map((f) => f.name).pop() : ROOT}
        </button>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px", maxWidth: 900 }}>
          <RequirementSetEditor setId={open.id} onDeleted={() => view(null, back)} />
        </div>
      </div>
    );
  }

  const empty = subfolders.length === 0 && setsHere.length === 0;
  return (
    <div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7280", maxWidth: 760 }}>
        Make one requirement for each kind of room (Kitchen, Bedroom…) with its questions, and file them in folders. In a project's
        Req Form tab you pick a requirement for each room and answer it, or let the customer answer it from their own login.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <button onClick={() => setDialog({ kind: "folder", name: "" })} style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", fontSize: 13, padding: "6px 14px" }}>+ New folder</button>
        <button onClick={() => setDialog({ kind: "requirement", name: "" })} style={{ fontSize: 13, padding: "6px 16px" }}>+ New requirement</button>
      </div>

      {dialog && (
        <div onClick={() => setDialog(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 28, width: 400, maxWidth: "94vw", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 6px" }}>{dialog.kind === "folder" ? "New folder" : "New requirement"}</h3>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6b7280" }}>
              {dialog.kind === "folder" ? "Folders group requirements, like Kitchens or Bedrooms." : "One for each kind of room, e.g. Kitchen. You add its questions next."}
              {currentId ? ` It will be created inside “${folderPath(folders, currentId).map((f) => f.name).pop()}”.` : ""}
            </p>
            <input
              autoFocus type="text" value={dialog.name}
              placeholder={dialog.kind === "folder" ? "Folder name" : "Requirement name (e.g. Kitchen)"}
              onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setDialog(null); }}
              style={{ width: "100%", fontSize: 14, padding: "8px 10px", marginBottom: 16 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setDialog(null)} style={{ background: "#6b7280", padding: "8px 18px" }}>Cancel</button>
              <button onClick={create} disabled={!dialog.name.trim()} style={{ padding: "8px 18px", opacity: dialog.name.trim() ? 1 : 0.5 }}>Create</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 13, marginBottom: 14 }}>
        {[{ id: null, name: ROOT }, ...folderPath(folders, currentId)].map((f, i, arr) => (
          <span key={f.id ?? "root"} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ color: "#d1d5db" }}>/</span>}
            {i === arr.length - 1
              ? <span style={{ fontWeight: 700, color: "#111827" }}>{f.name}</span>
              : <button onClick={() => view(null, f.id)} style={{ background: "none", border: "none", color: "#2563eb", padding: 0, fontSize: 13, cursor: "pointer" }}>{f.name}</button>}
          </span>
        ))}
      </div>

      {empty ? (
        <p style={{ color: "#9ca3af", fontSize: 13 }}>{currentId ? "This folder is empty." : "Nothing here yet — use + New requirement or + New folder above."}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gridAutoRows: "max-content", gap: 14, maxWidth: 900 }}>
          {subfolders.map((f) => {
            const d = deep(f.id);
            return (
              <div
                key={f.id} onClick={() => { if (renaming?.id !== f.id) view(null, f.id); }}
                style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fffbeb", padding: "14px 16px", cursor: "pointer", position: "relative" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#f59e0b")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
              >
                <div style={{ fontSize: 30, marginBottom: 6 }}>📁</div>
                {renaming?.id === f.id ? (
                  <input
                    autoFocus value={renaming.text} onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenaming({ id: f.id, text: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setRenaming(null); }}
                    onBlur={saveRename}
                    style={{ width: "100%", fontSize: 14, fontWeight: 700, padding: "3px 6px" }}
                  />
                ) : (
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                )}
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  {d.nSets} requirement{d.nSets !== 1 ? "s" : ""}{d.nFolders > 0 ? ` · ${d.nFolders} subfolder${d.nFolders !== 1 ? "s" : ""}` : ""}
                </div>
                <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 2, alignItems: "center", background: "rgba(255,255,255,0.85)", borderRadius: 6 }} onClick={(e) => e.stopPropagation()}>
                  {confirmId === f.id ? (
                    <>
                      <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>Delete?</span>
                      <button onClick={() => deleteFolder(f.id)} style={{ background: "#dc2626", fontSize: 11, padding: "1px 8px" }}>Yes</button>
                      <button onClick={() => setConfirmId(null)} style={{ background: "#6b7280", fontSize: 11, padding: "1px 8px" }}>No</button>
                    </>
                  ) : (
                    <>
                      <button title="Rename folder" onClick={() => setRenaming({ id: f.id, text: f.name })} style={{ ...tiny, color: "#6b7280" }}>✎</button>
                      <button title="Delete folder" onClick={() => setConfirmId(f.id)} style={{ ...tiny, color: "#dc2626" }}>🗑</button>
                    </>
                  )}
                </div>
                {confirmId === f.id && (d.nSets > 0 || d.nFolders > 0) && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }} onClick={(e) => e.stopPropagation()}>Its contents move up one level — nothing is deleted.</div>
                )}
              </div>
            );
          })}

          {setsHere.map((s) => (
            <div
              key={s.id} role="button" tabIndex={0}
              onClick={() => view(s.id, currentId)}
              onKeyDown={(e) => { if (e.key === "Enter") view(s.id, currentId); }}
              style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: "14px 16px", cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#7c3aed")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
            >
              <div style={{ fontSize: 30, marginBottom: 6 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{s.name || "Untitled"}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{(s.questions || []).length} question{(s.questions || []).length !== 1 ? "s" : ""}</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>{summary(s) || "No questions yet"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Requirements;
