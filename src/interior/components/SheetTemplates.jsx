import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";

// Sheet templates: a "Sheet Calculation and Cut List" (materials, fields, cut-list
// parts) kept under a name so it can be applied to any other sheet. They are stored
// as ordinary templates flagged `isSheetTemplate` (one box each, in the "Sheet
// Templates" folder), so they show up in Templates and are edited there like any
// other template.
export const SHEET_FOLDER = "Sheet Templates";
export const isSheetTemplate = (t) => !!t && t.isSheetTemplate === true;

const clone = (v) => JSON.parse(JSON.stringify(v));
const btn = { padding: "4px 12px", fontSize: 12 };

// Everything a box needs besides the sheet fields that are copied in.
const boxBase = (name) => ({
  id: 1, boxName: name, quotationBoxType: "", quotationDoorType: "",
  quotationWidthMm: "", quotationHeightMm: "", quotationDepthMm: "",
  subSheets: [], hardwareItems: [],
});

export default function SheetTemplates({ sheetName, getFields, fieldNames, onApply, onClose }) {
  const { templates, setTemplates, templateFolders, setTemplateFolders } = useAppData();
  const { guardedNavigate } = useUnsavedChanges();
  const navigate = useNavigate();
  const list = (templates || []).filter(isSheetTemplate);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(null); // { id, kind: "apply" | "delete" }

  const save = () => {
    const n = name.trim();
    if (!n) return;
    // The "Sheet Templates" folder is made the first time one is saved.
    let folder = (templateFolders || []).find((f) => f.name === SHEET_FOLDER && (f.parentId ?? null) === null);
    if (!folder) {
      const fid = (templateFolders || []).length ? Math.max(...templateFolders.map((f) => f.id)) + 1 : 1;
      folder = { id: fid, name: SHEET_FOLDER, parentId: null };
      setTemplateFolders((prev) => [...(prev || []), folder]);
    }
    const id = (templates || []).length ? Math.max(...templates.map((t) => t.id)) + 1 : 1;
    const t = {
      id, templateName: n, description: "", templateImage: "", isSheetTemplate: true,
      folderId: folder.id, serviceType: "",
      boxes: [{ ...boxBase(n), ...clone(getFields()) }],
    };
    setTemplates((prev) => [...(prev || []), t]);
    setName("");
  };
  const remove = (id) => { setTemplates((prev) => (prev || []).filter((t) => t.id !== id)); setConfirm(null); };
  const apply = (t) => {
    const box = (t.boxes || [])[0] || {};
    const fields = {};
    fieldNames.forEach((f) => { fields[f] = box[f] === undefined ? undefined : clone(box[f]); });
    onApply(fields);
    onClose();
  };
  const edit = (t) => { onClose(); guardedNavigate(() => navigate(`/interior/template-master?id=${t.id}`)); };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 24, width: 540, maxWidth: "94vw", maxHeight: "86vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", color: "#111827", textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Sheet templates</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6b7280" }}>
          Sheet templates are listed under Templates (in the “{SHEET_FOLDER}” folder), where you can edit them. Applying one replaces what is on “{sheetName}”.
        </p>

        {list.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9ca3af", margin: "0 0 14px" }}>No sheet templates yet — save this sheet below to make the first one.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {list.map((t) => {
              const box = (t.boxes || [])[0] || {};
              const parts = (box.parts || []).length;
              const asking = confirm && confirm.id === t.id;
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.templateName}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{parts} cut-list part{parts !== 1 ? "s" : ""}{box.boxType ? ` · ${box.boxType}` : ""}</div>
                  </div>
                  {asking ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#dc2626" }}>{confirm.kind === "apply" ? "Replace this sheet?" : "Delete?"}</span>
                      <button onClick={() => (confirm.kind === "apply" ? apply(t) : remove(t.id))} style={{ ...btn, background: "#dc2626" }}>Yes</button>
                      <button onClick={() => setConfirm(null)} style={{ ...btn, background: "#6b7280" }}>No</button>
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <button onClick={() => setConfirm({ id: t.id, kind: "apply" })} style={{ ...btn, background: "#059669" }}>Apply</button>
                      <button onClick={() => edit(t)} style={{ ...btn, background: "#2563eb" }}>Edit</button>
                      <button onClick={() => setConfirm({ id: t.id, kind: "delete" })} style={{ ...btn, background: "#dc2626" }}>Delete</button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Save “{sheetName}” as a template</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text" value={name} placeholder="Template name (e.g. Base unit — swing door)"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              style={{ flex: 1 }}
            />
            <button onClick={save} disabled={!name.trim()} style={{ ...btn, background: "#2563eb", opacity: name.trim() ? 1 : 0.5 }}>Save template</button>
          </div>
        </div>
      </div>
    </div>
  );
}
