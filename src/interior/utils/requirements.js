// Room requirements: question sets the account defines (App Settings > Room
// Requirements, stored in companyProfile.requirementSets), a set picked for each
// room (room.requirementSetId) and the answers (room.requirements, by question id).
// Staff fill them in a project's Req Form tab; a customer login fills the same form for its
// own project, and submitting locks it (project.requirementsSubmittedAt).
//
//   set      { id, name, folderId?, questions: [{ id, text, type, options?, required? }] }
//            A customer cannot submit while a required question is unanswered.
//   type     "yesno" (answer "yes" | "no"), "choice" (one of options),
//            "multi" (a list of options), "number", "text"
export const QUESTION_TYPES = [
  { key: "yesno", label: "Yes / No" },
  { key: "choice", label: "Choose one (pictures / links)" },
  { key: "multi", label: "Choose multiple (pictures / links)" },
  { key: "number", label: "Number" },
  { key: "text", label: "Text" },
];

export const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const getSets = (companyProfile) =>
  (Array.isArray(companyProfile?.requirementSets) ? companyProfile.requirementSets : []);

export const isAnswered = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "");

// Remarks: a free-text note per question (room.remarks, by question id), kept next
// to the answer — the customer or staff can explain a choice or add detail.
export const withRemark = (room, questionId, text) => {
  const next = { ...(room.remarks || {}) };
  if (typeof text === "string" && text.trim() !== "") next[questionId] = text; else delete next[questionId];
  return next;
};

// The questions of a room's set that a search matches — by question, answer or remark.
export const matchingQuestions = (set, room, query) => {
  const needle = (query || "").trim().toLowerCase();
  const all = set?.questions || [];
  if (!needle) return all;
  return all.filter((q) => {
    const a = room?.requirements?.[q.id];
    const hay = [q.text, isAnswered(a) ? answerText(q, a) : "", room?.remarks?.[q.id] || ""].join(" ").toLowerCase();
    return hay.includes(needle);
  });
};

// Questions marked Required (q.required) that have no answer yet.
export const missingRequired = (set, answers) =>
  (set?.questions || []).filter((q) => q.required && !isAnswered(answers?.[q.id]));

export const answeredCount = (set, room) =>
  (set?.questions || []).filter((q) => isAnswered(room?.requirements?.[q.id])).length;

// How an answer reads on screen and on the printed sheet.
export const answerText = (q, v) => {
  if (!isAnswered(v)) return "—";
  if (q.type === "yesno") return v === "yes" ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
};

// New answers for a room after one question changes (undefined clears it).
export const withAnswer = (room, questionId, value) => {
  const next = { ...(room.requirements || {}) };
  if (isAnswered(value)) next[questionId] = value; else delete next[questionId];
  return next;
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Opens a printable requirement sheet for a project's rooms.
export function printRequirements(projectName, rooms, sets) {
  const body = rooms.map((room) => {
    const set = sets.find((s) => s.id === room.requirementSetId);
    if (!set) return "";
    const rows = (set.questions || []).map((q) => {
      const remark = room.remarks?.[q.id];
      return `<tr><td>${esc(q.text)}</td><td><b>${esc(answerText(q, room.requirements?.[q.id]))}</b>${remark ? `<div class="r">${esc(remark)}</div>` : ""}</td></tr>`;
    }).join("");
    return `<h3>${esc(room.subProject || "Room")} <small>— ${esc(set.name)}</small></h3><table>${rows}</table>`;
  }).join("");
  const w = window.open("", "_blank");
  if (!w) { window.alert("Allow pop-ups for this site to print the requirement sheet."); return; }
  w.document.write(`<!doctype html><title>Requirements — ${esc(projectName)}</title>
<style>body{font:14px system-ui,sans-serif;margin:32px;color:#111}h2{margin:0 0 4px}h3{margin:22px 0 6px}small{font-weight:400;color:#6b7280}
table{border-collapse:collapse;width:100%}td{border:1px solid #d1d5db;padding:6px 10px}td:first-child{width:62%}.r{color:#6b7280;font-size:12px;margin-top:3px}</style>
<h2>Requirements — ${esc(projectName)}</h2><div style="color:#6b7280">${new Date().toLocaleDateString()}</div>${body || "<p>No requirements recorded yet.</p>"}`);
  w.document.close();
  w.focus();
  w.print();
}

// ── Options of a "Choose one" question ──────────────────────────────────────
// An option is { label, image?, url? }: the label is the answer that gets saved,
// the image (an uploaded picture) helps pick it, the url is a link to look at
// (a product page, a reference photo). Older sets stored options as plain strings.
export const optionOf = (o) => (typeof o === "string"
  ? { label: o, image: "", url: "" }
  : { label: String(o?.label ?? ""), image: o?.image || "", url: o?.url || "" });

export const optionLabels = (q) => (q?.options || []).map((o) => optionOf(o).label).filter(Boolean);

// Only web links and our own uploads may become a link or picture on a page.
export const safeUrl = (u) => (typeof u === "string" && (/^https?:\/\//i.test(u) || /^\/uploads\//.test(u)) ? u : "");
const looksLikeImage = (u) => /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(u || "");

// The picture to show for an option: its own image, or its link when that is
// itself a picture.
export const optionImage = (o) => safeUrl(o.image) || (looksLikeImage(o.url) ? safeUrl(o.url) : "");
// A link worth showing as a link (not just the picture again).
export const optionLink = (o) => (looksLikeImage(o.url) && !o.image ? "" : safeUrl(o.url));

// ── Folders ────────────────────────────────────────────────────────────────
// Requirement sets can be filed in (nested) folders, like Templates. Folders live
// in companyProfile.requirementFolders as { id, name, parentId }, and a set names
// its folder with `folderId` (missing or unknown = top level).
export const getFolders = (companyProfile) =>
  (Array.isArray(companyProfile?.requirementFolders) ? companyProfile.requirementFolders : []);

// Folders from the top down to `id` (empty for the top level).
export const folderPath = (folders, id) => {
  const path = [];
  let f = folders.find((x) => x.id === id);
  while (f && path.length < 20) { path.unshift(f); f = f.parentId != null ? folders.find((x) => x.id === f.parentId) : null; }
  return path;
};

// The folder a set sits in, or null for the top level.
export const folderOf = (set, folders) => (set.folderId && folders.some((f) => f.id === set.folderId) ? set.folderId : null);

// "Kitchens / Modular / Kitchen" — a set's name with its folders, for dropdowns.
export const setLabel = (set, folders) => [...folderPath(folders, folderOf(set, folders)).map((f) => f.name), set.name || "Untitled"].join(" / ");

// What to try showing as an option's picture: its uploaded image, else its link —
// a link may well be a picture even without a .jpg ending (many image hosts have
// none). The page falls back to a plain "view" link when it does not load as one.
export const optionPictureSrc = (o) => safeUrl(o.image) || safeUrl(o.url);
