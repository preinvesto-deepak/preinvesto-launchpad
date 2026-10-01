// A lead's own pipeline status — distinct from a converted project's status
// (projectStatus.js). Customizable per account (see AppDataContext's
// `leadStatuses`, editable via the ⚙ button next to Filter on the Leads
// page) — this is only the starter set a brand-new account begins with.
// Grouped into "active" (still being worked) and "done" (a lead's journey
// through the pipeline has ended, one way or another) — ClickUp-style status
// categories, minus the "Closed" category, which isn't used here.
export const DEFAULT_LEAD_STATUSES = [
  { value: "new", label: "New", color: "#6b7280", bg: "#f3f4f6", category: "active" },
  { value: "contacted", label: "Contacted", color: "#1d4ed8", bg: "#dbeafe", category: "active" },
  { value: "followUp", label: "Follow-up", color: "#b45309", bg: "#fef3c7", category: "active" },
  { value: "notInterested", label: "Not Interested", color: "#b91c1c", bg: "#fee2e2", category: "done" },
  // "converted" is structural, not just a label — Leads.jsx uses this exact
  // *value* to know a lead has already become a project (hides it from the
  // ordinary status dropdown, shows "Open Project" instead of "Convert",
  // etc.). Its label/color/category are fully editable in Settings like any
  // other status, but it can't be deleted — that would silently break
  // "Convert to Project" for every lead already converted under it.
  { value: "converted", label: "Converted", color: "#047857", bg: "#d1fae5", category: "done" },
];

export const DEFAULT_LEAD_STATUS = "new";

// A small fixed palette for the "+ Add Status"/recolor picker — plain named
// swatches rather than a full color picker, since a handful of clearly
// distinct options is all a status pipeline like this really needs.
export const STATUS_COLOR_PRESETS = [
  { color: "#6b7280", bg: "#f3f4f6" },
  { color: "#1d4ed8", bg: "#dbeafe" },
  { color: "#7c3aed", bg: "#ede9fe" },
  { color: "#b45309", bg: "#fef3c7" },
  { color: "#b91c1c", bg: "#fee2e2" },
  { color: "#047857", bg: "#d1fae5" },
  { color: "#be185d", bg: "#fce7f3" },
  { color: "#0369a1", bg: "#e0f2fe" },
];

export function statusInfo(statuses, value) {
  return statuses.find((s) => s.value === value) || statuses.find((s) => s.value === DEFAULT_LEAD_STATUS) || statuses[0];
}
