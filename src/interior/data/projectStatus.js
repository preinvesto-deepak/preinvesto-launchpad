// Shared between Projects.jsx (where status is set) and Dashboard.jsx (where
// it's shown alongside every project) so the two never drift out of sync.
// "Lead" is NOT a project status — a project only exists once a lead has been
// explicitly converted (see leadStatus.js / Leads.jsx's "Convert to Project").
export const PROJECT_STATUSES = [
  { value: "inProgress", label: "In Progress", color: "#1d4ed8", bg: "#dbeafe" },
  { value: "onHold", label: "On Hold", color: "#b45309", bg: "#fef3c7" },
  { value: "completed", label: "Completed", color: "#047857", bg: "#d1fae5" },
];

export const DEFAULT_PROJECT_STATUS = "inProgress";

export function projectStatusInfo(status) {
  return PROJECT_STATUSES.find((s) => s.value === status) || PROJECT_STATUSES.find((s) => s.value === DEFAULT_PROJECT_STATUS);
}
