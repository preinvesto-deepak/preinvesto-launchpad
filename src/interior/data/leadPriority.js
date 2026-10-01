// A lead's priority — fixed levels (unlike statuses, not user-customizable),
// matching the standard Urgent/High/Normal/Low scheme. null means no priority set.
export const PRIORITY_LEVELS = [
  { value: "urgent", label: "Urgent", color: "#dc2626", bg: "#fee2e2" },
  { value: "high", label: "High", color: "#d97706", bg: "#fef3c7" },
  { value: "normal", label: "Normal", color: "#2563eb", bg: "#dbeafe" },
  { value: "low", label: "Low", color: "#6b7280", bg: "#f3f4f6" },
];

export function priorityInfo(value) {
  return PRIORITY_LEVELS.find((p) => p.value === value) || null;
}

// A small fixed palette tags cycle through by name, so an uncustomized tag
// still renders consistently without needing a color stored anywhere.
// Exported so the Tags popover's recolor swatches can reuse the same set.
export const TAG_COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2", "#db2777", "#65a30d"];
export function tagColor(tag) {
  const sum = [...tag].reduce((a, c) => a + c.charCodeAt(0), 0);
  return TAG_COLORS[sum % TAG_COLORS.length];
}
