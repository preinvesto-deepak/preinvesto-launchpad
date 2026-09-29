// A lead's own pipeline status — distinct from a converted project's status
// (projectStatus.js). Shared between Leads.jsx (where it's set) and
// Dashboard.jsx (where it's reported).
export const LEAD_STATUSES = [
  { value: "new", label: "New", color: "#6b7280", bg: "#f3f4f6" },
  { value: "contacted", label: "Contacted", color: "#1d4ed8", bg: "#dbeafe" },
  { value: "followUp", label: "Follow-up", color: "#b45309", bg: "#fef3c7" },
  { value: "notInterested", label: "Not Interested", color: "#b91c1c", bg: "#fee2e2" },
  { value: "converted", label: "Converted", color: "#047857", bg: "#d1fae5" },
];

export const DEFAULT_LEAD_STATUS = "new";

export function leadStatusInfo(status) {
  return LEAD_STATUSES.find((s) => s.value === status) || LEAD_STATUSES.find((s) => s.value === DEFAULT_LEAD_STATUS);
}
