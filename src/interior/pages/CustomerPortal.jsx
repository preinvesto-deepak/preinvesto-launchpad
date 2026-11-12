import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import RoomRequirements from "../components/RoomRequirements";
import { answeredCount, getSets, matchingQuestions, missingRequired, withAnswer, withRemark } from "../utils/requirements";

// What a customer sees after signing in with the login made under Teams: their
// own project's room requirements, nothing else. They answer, then Submit, which
// locks the form until staff reopen it. The server only lets them change answers
// (see server/access.js) — this page is just the friendly face of that.
// `previewProjectId` renders the same page read-only for staff.
export default function CustomerPortal({ previewProjectId = null }) {
  const preview = previewProjectId != null;
  const { user, logout } = useAuth();
  const { projects, subProjects, companyProfile, setSubProjects, setProjects, flushPendingSave, isLoaded } = useAppData();
  const [confirming, setConfirming] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [query, setQuery] = useState("");

  const project = preview ? projects.find((p) => String(p.id) === String(previewProjectId)) : projects[0];
  const sets = getSets(companyProfile);
  const forms = project
    ? subProjects
        .filter((r) => r.project === project.name)
        .map((room) => ({ room, set: sets.find((s) => s.id === room.requirementSetId) }))
        .filter((f) => f.set && (f.set.questions || []).length > 0)
    : [];
  const total = forms.reduce((n, f) => n + f.set.questions.length, 0);
  const done = forms.reduce((n, f) => n + answeredCount(f.set, f.room), 0);
  // Required questions still unanswered, across all rooms.
  const missing = forms.flatMap(({ room, set }) => missingRequired(set, room.requirements).map((q) => ({ room, q })));
  const submittedAt = project?.requirementsSubmittedAt;
  const readOnly = preview || !!submittedAt;

  const answer = (roomId, qid, v) =>
    setSubProjects((prev) => prev.map((r) => (r.id === roomId ? { ...r, requirements: withAnswer(r, qid, v) } : r)));
  const answerRemark = (roomId, qid, text) =>
    setSubProjects((prev) => prev.map((r) => (r.id === roomId ? { ...r, remarks: withRemark(r, qid, text) } : r)));
  // A search shows only the rooms with a matching question.
  const searching = query.trim() !== "";
  const visibleForms = searching ? forms.filter((f) => matchingQuestions(f.set, f.room, query).length > 0) : forms;
  const trySubmit = () => {
    if (missing.length > 0) { setShowMissing(true); return; }
    setConfirming(true);
  };
  const submit = async () => {
    if (missing.length > 0) return;
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, requirementsSubmittedAt: new Date().toISOString() } : p)));
    setConfirming(false);
    await flushPendingSave();
  };

  return (
    <div style={{ minHeight: preview ? undefined : "100vh", background: "var(--stone-100)" }}>
      {preview ? (
        <div style={{ margin: "0 0 14px", padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, color: "#1e40af", fontSize: 12 }}>
          👁 Preview — this is what your customer sees after signing in. It is read-only here.
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 20px", background: "#fff", borderBottom: "1px solid var(--stone-200)", fontSize: 13 }}>
          <strong style={{ color: "var(--stone-800)" }}>{project?.name || "Your project"}</strong>
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "var(--stone-700)" }}>{user?.name}</span>
            <button
              onClick={async () => { await flushPendingSave(); await logout(); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "var(--stone-700)", border: "1px solid var(--stone-300)", padding: "5px 10px", fontSize: 12 }}
            ><LogOut size={13} /> Sign out</button>
          </span>
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: preview ? 0 : "24px 16px 60px" }}>
        {!isLoaded ? (
          <p style={{ color: "#6b7280" }}>Loading…</p>
        ) : !project ? (
          <p style={{ color: "#6b7280" }}>No project is linked to this login yet. Please contact your designer.</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
              <h2 style={{ margin: 0 }}>Your requirements{preview ? ` — ${project.name}` : ""}</h2>
              {forms.length > 0 && (
                <input
                  type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the form…" aria-label="Search the form"
                  style={{ width: 220, fontSize: 13, padding: "6px 12px", border: "1px solid #cbd5e1", borderRadius: 8 }}
                />
              )}
            </div>
            <p style={{ margin: "0 0 18px", color: "#6b7280", fontSize: 13 }}>
              Please answer the questions for each room. Your answers are saved as you go; press <b>Submit</b> when you are done.
            </p>

            {submittedAt && !preview && (
              <div style={{ margin: "0 0 16px", padding: "10px 14px", background: "#d1fae5", color: "#065f46", borderRadius: 8, fontSize: 13 }}>
                ✓ Submitted on {new Date(submittedAt).toLocaleDateString()}. Thank you! Your designer will take it from here — contact them if you need to change an answer.
              </div>
            )}

            {forms.length === 0 ? (
              <p style={{ color: "#6b7280" }}>Your designer hasn't added any questions yet. Please check back soon.</p>
            ) : searching && visibleForms.length === 0 ? (
              <p style={{ color: "#6b7280" }}>No question matches “{query}”.</p>
            ) : visibleForms.map(({ room, set }) => (
              <div key={room.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{room.subProject || "Room"}</h3>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{answeredCount(set, room)} of {set.questions.length} answered</span>
                </div>
                <RoomRequirements
                  set={set} answers={room.requirements || {}} readOnly={readOnly} query={query}
                  onChange={(qid, v) => answer(room.id, qid, v)}
                  remarks={room.remarks || {}} onRemark={preview ? undefined : (qid, text) => answerRemark(room.id, qid, text)}
                />
              </div>
            ))}

            {showMissing && missing.length > 0 && !readOnly && (
              <div style={{ margin: "0 0 12px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, fontSize: 13 }}>
                Please answer the required questions (marked <b>*</b>) before submitting:
                <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                  {missing.map(({ room, q }) => <li key={`${room.id}-${q.id}`}>{room.subProject || "Room"} — {q.text}</li>)}
                </ul>
              </div>
            )}

            {forms.length > 0 && !readOnly && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                {confirming ? (
                  <>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {done < total ? `${total - done} question${total - done !== 1 ? "s are" : " is"} still unanswered. ` : ""}Submit now? You won't be able to change your answers.
                    </span>
                    <button onClick={submit} style={{ background: "#059669", padding: "7px 18px", fontSize: 14 }}>Yes, submit</button>
                    <button onClick={() => setConfirming(false)} style={{ background: "#6b7280", padding: "7px 18px", fontSize: 14 }}>No</button>
                  </>
                ) : (
                  <>
                    <button onClick={trySubmit} style={{ background: "#185fa5", padding: "8px 24px", fontSize: 14 }}>Submit</button>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{done} of {total} answered</span>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Route wrapper for the staff preview: /interior/customer-preview?id=<project id>. */
export function CustomerPreview() {
  const [params] = useSearchParams();
  return <CustomerPortal previewProjectId={params.get("id")} />;
}
