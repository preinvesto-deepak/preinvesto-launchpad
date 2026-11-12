import { useState } from "react";
import { useAppData } from "../context/AppDataContext";
import { uploadDesignFile } from "../utils/api";
import OptionThumb from "./OptionThumb";
import { QUESTION_TYPES, folderOf, folderPath, getFolders, getSets, newId, optionOf, safeUrl } from "../utils/requirements";

const small = { fontSize: 12, color: "#6b7280" };
const box = { fontSize: 13, padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: 6 };
const iconBtn = { background: "none", border: "1px solid #e5e7eb", color: "#374151", padding: "2px 7px", fontSize: 12, borderRadius: 5, cursor: "pointer" };

// The choices of a "Choose one" question: each has the answer text, and may have
// a picture (uploaded here) and/or a link, so the person answering can pick by
// looking. The answer that is saved is the text.
function OptionsEditor({ options, onChange }) {
  const opts = (options || []).map(optionOf);
  const [busy, setBusy] = useState(null); // index being uploaded
  const [error, setError] = useState("");
  const patch = (i, p) => onChange(opts.map((o, j) => (j === i ? { ...o, ...p } : o)));

  const upload = async (i, file) => {
    if (!file) return;
    setError(""); setBusy(i);
    try {
      const { url } = await uploadDesignFile(file);
      patch(i, { image: url });
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  return (
    <div style={{ marginLeft: 24, padding: "8px 10px", border: "1px dashed #d1d5db", borderRadius: 8, background: "#fff" }}>
      <div style={{ ...small, marginBottom: 6 }}>Choices — add a picture and/or a link to any of them (optional).</div>
      {opts.map((o, i) => {
        const thumbStyle = { width: 38, height: 38, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" };
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <input type="text" value={o.label} placeholder="Choice (e.g. Glass)" onChange={(e) => patch(i, { label: e.target.value })} style={{ ...box, width: 150 }} />
            {o.image ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <OptionThumb src={safeUrl(o.image)} style={thumbStyle} />
                <button type="button" title="Remove picture" onClick={() => patch(i, { image: "" })} style={{ ...iconBtn, color: "#dc2626", borderColor: "#fecaca" }}>✕</button>
              </span>
            ) : (
              <>
                <label style={{ ...iconBtn, padding: "4px 10px", cursor: busy === i ? "wait" : "pointer", display: "inline-block" }}>
                  {busy === i ? "Uploading…" : "＋ Picture"}
                  <input type="file" accept="image/*" disabled={busy === i} style={{ display: "none" }} onChange={(e) => { upload(i, e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                <OptionThumb src={safeUrl(o.url)} style={thumbStyle} />
              </>
            )}
            <input type="url" value={o.url} placeholder="Link (https://…)" onChange={(e) => patch(i, { url: e.target.value.trim() })} style={{ ...box, flex: "1 1 200px", minWidth: 160 }} />
            <button type="button" title="Remove choice" onClick={() => onChange(opts.filter((_, j) => j !== i))} style={{ ...iconBtn, color: "#dc2626", borderColor: "#fecaca" }}>✕</button>
          </div>
        );
      })}
      {error && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 6 }}>{error}</div>}
      <button type="button" onClick={() => onChange([...opts, { label: "", image: "", url: "" }])} style={{ ...iconBtn, padding: "3px 12px", color: "#0369a1", borderColor: "#bae6fd", background: "#e0f2fe" }}>+ Add choice</button>
    </div>
  );
}

// One requirement set (e.g. Kitchen): its name and its questions. The Requirements
// page lists the sets like Templates and opens one here.
export default function RequirementSetEditor({ setId, onDeleted }) {
  const { companyProfile, setCompanyProfile } = useAppData();
  const s = getSets(companyProfile).find((x) => x.id === setId);
  const folders = getFolders(companyProfile);
  const [confirming, setConfirming] = useState(false);
  if (!s) return <p style={small}>This requirement no longer exists.</p>;

  const update = (fn) => setCompanyProfile((p) => ({ ...(p || {}), requirementSets: fn(getSets(p)) }));
  const patchSet = (patch) => update((all) => all.map((x) => (x.id === setId ? { ...x, ...patch } : x)));
  const patchQuestion = (qid, patch) => patchSet({ questions: (s.questions || []).map((q) => (q.id === qid ? { ...q, ...patch } : q)) });
  const moveQuestion = (index, by) => {
    const qs = [...(s.questions || [])];
    const to = index + by;
    if (to < 0 || to >= qs.length) return;
    [qs[index], qs[to]] = [qs[to], qs[index]];
    patchSet({ questions: qs });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input type="text" value={s.name} onChange={(e) => patchSet({ name: e.target.value })} style={{ ...box, fontWeight: 700, fontSize: 15, width: 260 }} />
        <span style={small}>{(s.questions || []).length} question{(s.questions || []).length !== 1 ? "s" : ""}</span>
        <label style={{ ...small, display: "inline-flex", alignItems: "center", gap: 6 }}>
          Folder
          <select value={folderOf(s, folders) || ""} onChange={(e) => patchSet({ folderId: e.target.value || null })} style={{ ...box, width: 190 }}>
            <option value="">Top level</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{folderPath(folders, f.id).map((x) => x.name).join(" / ")}</option>)}
          </select>
        </label>
        <span style={{ flex: 1 }} />
        {confirming ? (
          <>
            <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>Delete this requirement?</span>
            <button onClick={() => { update((all) => all.filter((x) => x.id !== setId)); if (onDeleted) onDeleted(); }} style={{ background: "#dc2626", padding: "3px 10px", fontSize: 12 }}>Yes</button>
            <button onClick={() => setConfirming(false)} style={{ background: "#6b7280", padding: "3px 10px", fontSize: 12 }}>No</button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)} style={{ background: "#dc2626", padding: "3px 10px", fontSize: 12 }}>Delete</button>
        )}
      </div>

      {(s.questions || []).length === 0 && <p style={{ ...small, margin: "0 0 12px" }}>No questions yet — add the first one below.</p>}

      {(s.questions || []).map((q, i) => (
        <div key={q.id} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: q.type === "choice" || q.type === "multi" ? 6 : 0 }}>
            <span style={{ ...small, width: 18, textAlign: "right" }}>{i + 1}.</span>
            <input type="text" value={q.text} placeholder="Question" onChange={(e) => patchQuestion(q.id, { text: e.target.value })} style={{ ...box, flex: "1 1 220px" }} />
            <select value={q.type} onChange={(e) => patchQuestion(q.id, { type: e.target.value })} style={{ ...box, width: 190 }}>
              {QUESTION_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <label title="The customer must answer this before submitting" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: q.required ? "#dc2626" : "#6b7280", cursor: "pointer", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={!!q.required} onChange={(e) => patchQuestion(q.id, { required: e.target.checked })} style={{ width: 14, height: 14 }} />
              Required
            </label>
            <button type="button" title="Move up" disabled={i === 0} onClick={() => moveQuestion(i, -1)} style={iconBtn}>↑</button>
            <button type="button" title="Move down" disabled={i === (s.questions || []).length - 1} onClick={() => moveQuestion(i, 1)} style={iconBtn}>↓</button>
            <button
              type="button" title="Remove question" style={{ ...iconBtn, color: "#dc2626", borderColor: "#fecaca" }}
              onClick={() => patchSet({ questions: (s.questions || []).filter((x) => x.id !== q.id) })}
            >✕</button>
          </div>
          {(q.type === "choice" || q.type === "multi") && <OptionsEditor options={q.options} onChange={(options) => patchQuestion(q.id, { options })} />}
        </div>
      ))}

      <button
        onClick={() => patchSet({ questions: [...(s.questions || []), { id: newId("q"), text: "", type: "yesno", options: [] }] })}
        style={{ background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd", fontSize: 13, padding: "5px 16px", borderRadius: 6, cursor: "pointer", marginTop: 4 }}
      >+ Add question</button>
    </div>
  );
}
