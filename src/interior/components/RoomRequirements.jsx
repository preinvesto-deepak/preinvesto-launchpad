import { useState } from "react";
import OptionThumb from "./OptionThumb";
import { isAnswered, matchingQuestions, optionOf, optionPictureSrc, safeUrl } from "../utils/requirements";

const pill = (on, disabled) => ({
  padding: "5px 14px", fontSize: 13, borderRadius: 999, cursor: disabled ? "default" : "pointer",
  border: `1px solid ${on ? "#185fa5" : "#cbd5e1"}`, background: on ? "#185fa5" : "#fff", color: on ? "#fff" : "#374151",
  opacity: disabled && !on ? 0.55 : 1,
});

const linkStyle = { fontSize: 11, color: "#2563eb", textDecoration: "underline", whiteSpace: "nowrap" };

// One choice shown as a card: its picture (an uploaded image, or its link when that
// loads as a picture) is displayed straight away; a link that is a web page rather
// than a picture shows as a small "view" link instead.
function OptionCard({ o, on, readOnly, onPick }) {
  const src = optionPictureSrc(o);
  const [pictureOk, setPictureOk] = useState(!!src);
  const link = safeUrl(o.url);
  const linkIsThePicture = !o.image && !!src && pictureOk;
  const showLink = !!link && !linkIsThePicture;
  return (
    <div
      role="button" tabIndex={readOnly ? -1 : 0}
      onClick={() => onPick(o.label)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(o.label); } }}
      style={{
        width: 150, border: `2px solid ${on ? "#185fa5" : "#e5e7eb"}`, borderRadius: 10, overflow: "hidden",
        background: on ? "#eff6ff" : "#fff", cursor: readOnly ? "default" : "pointer", opacity: readOnly && !on ? 0.55 : 1,
      }}
    >
      <OptionThumb src={src} onStatus={setPictureOk} style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
      {!pictureOk && (
        <div style={{ height: 100, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#d1d5db", fontSize: 26 }}>🖼</div>
      )}
      <div style={{ padding: "6px 8px", fontSize: 13, fontWeight: on ? 700 : 500, color: on ? "#185fa5" : "#374151", textAlign: "center" }}>
        {on ? "✓ " : ""}{o.label}
        {showLink && <div><a href={link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={linkStyle}>view ↗</a></div>}
      </div>
    </div>
  );
}

// The options of a "Choose one" question. With a picture or link on any of them they
// become cards, so the customer can pick by looking; otherwise plain buttons.
function ChoiceOptions({ q, value, readOnly, onPick, multiple = false }) {
  // One answer is a label, several are a list of labels.
  const selected = Array.isArray(value) ? value : (value ? [value] : []);
  const isOn = (label) => selected.includes(label);
  const opts = (q.options || []).map(optionOf).filter((o) => o.label);
  if (opts.length === 0) return <span style={{ fontSize: 12, color: "#9ca3af" }}>No options set for this question.</span>;

  if (!opts.some((o) => optionPictureSrc(o))) {
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {opts.map((o) => (
          <button key={o.label} type="button" style={pill(isOn(o.label), readOnly)} onClick={() => onPick(o.label)}>{multiple ? (isOn(o.label) ? "☑ " : "☐ ") : ""}{o.label}</button>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {opts.map((o) => <OptionCard key={o.label} o={o} on={isOn(o.label)} readOnly={readOnly} onPick={onPick} />)}
    </div>
  );
}

// The questions of one set, answered by tapping buttons or typing. Used by the
// Req Form tab (staff) and by the customer's own page. `answers` is { [questionId]: value };
// onChange(questionId, value) gets undefined to clear an answer.
export default function RoomRequirements({ set, answers = {}, onChange, readOnly = false, remarks = {}, onRemark, query = "" }) {
  const [openRemark, setOpenRemark] = useState({});
  if (!set) return null;
  // With a search, only the questions it matches (by question, answer or remark).
  const shown = matchingQuestions(set, { requirements: answers, remarks }, query);
  if (shown.length === 0) return <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>No question matches “{query}”.</p>;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {shown.map((q) => {
        const v = answers[q.id];
        const remark = remarks[q.id] || "";
        const toggle = (next) => { if (!readOnly) onChange(q.id, v === next ? undefined : next); };
        const toggleMany = (label) => {
          if (readOnly) return;
          const cur = Array.isArray(v) ? v : (v ? [v] : []);
          const next = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label];
          onChange(q.id, next.length ? next : undefined);
        };
        return (
          <div key={q.id}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              {q.text}{q.required && <span style={{ color: "#dc2626", marginLeft: 3 }} title="Required">*</span>}
              {q.type === "multi" && <span style={{ color: "#6b7280", marginLeft: 6, fontWeight: 400, fontSize: 11 }}>(select all that apply)</span>}
              {!isAnswered(v) && <span style={{ color: q.required ? "#dc2626" : "#f59e0b", marginLeft: 6, fontWeight: 400, fontSize: 11 }}>{q.required ? "required" : "not answered"}</span>}
            </div>
            {q.type === "yesno" && (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={pill(v === "yes", readOnly)} onClick={() => toggle("yes")}>Yes</button>
                <button type="button" style={pill(v === "no", readOnly)} onClick={() => toggle("no")}>No</button>
              </div>
            )}
            {q.type === "choice" && <ChoiceOptions q={q} value={v} readOnly={readOnly} onPick={toggle} />}
            {q.type === "multi" && <ChoiceOptions q={q} value={v} readOnly={readOnly} onPick={toggleMany} multiple />}
            {q.type === "number" && (
              <input
                type="number" min={0} value={v ?? ""} disabled={readOnly}
                onChange={(e) => onChange(q.id, e.target.value === "" ? undefined : Number(e.target.value))}
                style={{ width: 110, fontSize: 14, padding: "5px 8px" }}
              />
            )}
            {q.type === "text" && (
              <input
                type="text" maxLength={500} value={v ?? ""} disabled={readOnly}
                onChange={(e) => onChange(q.id, e.target.value)}
                style={{ width: "100%", maxWidth: 420, fontSize: 14, padding: "5px 8px" }}
              />
            )}
            {onRemark && (remark || openRemark[q.id]) ? (
              <textarea
                rows={2} maxLength={500} value={remark} disabled={readOnly} placeholder="Remarks (optional)"
                onChange={(e) => onRemark(q.id, e.target.value)}
                style={{ display: "block", marginTop: 8, width: "100%", maxWidth: 420, fontSize: 13, padding: "5px 8px", resize: "vertical" }}
              />
            ) : onRemark && !readOnly ? (
              <button type="button" onClick={() => setOpenRemark((o) => ({ ...o, [q.id]: true }))} style={{ marginTop: 6, background: "none", border: "none", padding: 0, fontSize: 12, color: "#2563eb", cursor: "pointer" }}>＋ Add remarks</button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
