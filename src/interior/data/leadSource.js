// Where a project/lead came from — set on the project itself (project.leadSource)
// alongside project.status (see projectStatus.js). Shared between Projects.jsx
// (where it's set) and Dashboard.jsx (where it's reported) so they can't drift.
export const LEAD_SOURCES = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "googleAds", label: "Google Ads" },
  { value: "reference", label: "Reference" },
  { value: "walkin", label: "Walk-in" },
  { value: "other", label: "Other" },
];

export function leadSourceLabel(value) {
  return LEAD_SOURCES.find((s) => s.value === value)?.label || null;
}
