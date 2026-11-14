// Client side of employee access control (the server — server/access.js and
// public/api/interior_access.php — is the real enforcement; this keeps the UI
// honest: hides screens, and stops a view-only employee's edits from even
// changing what is on screen).
//
// `access` is user.access from /api/auth_me: { owner: true } for the account
// owner, else { owner: false, perms: { [screen]: { view, edit, delete } },
// scope: null | [projectId, ...] }.

// Screens a group can be granted. `key` is the permission name stored on the
// group; the server maps each saved data key to one of these.
export const SCREENS = [
  { key: "leads", label: "Leads" },
  { key: "projects", label: "Projects, Rooms, BOQ & Quotation" },
  { key: "itemsPricing", label: "Items Pricing" },
  { key: "materialModels", label: "Material Models" },
  { key: "templates", label: "Templates" },
  { key: "designGallery", label: "Design Gallery" },
];

export const KEY_MODULE = {
  projects: "projects", subProjects: "projects", dimensions: "projects",
  prices: "itemsPricing",
  materialModelRates: "materialModels", materialModelProfitPercent: "materialModels",
  templates: "templates", templateFolders: "templates", selectedTemplateId: "templates",
  designGallery: "designGallery",
  leads: "leads", leadViews: "leads", leadStatuses: "leads", leadTagColors: "leads",
};

// The tabs inside one project. A group grants View / Edit / Delete per tab
// (only the actions listed apply to a tab). The server treats the whole
// "projects" module as "any tab has it", and the app narrows it tab by tab.
export const PROJECT_TABS = [
  { key: "req-form", label: "Req Form", actions: ["view", "edit", "delete"] },
  { key: "req", label: "Measurement", actions: ["view", "edit", "delete"] },
  { key: "design", label: "Design", actions: ["view", "edit", "delete"] },
  { key: "rooms", label: "Room Estimation", actions: ["view", "edit", "delete"] },
  { key: "material-models", label: "Material Analysis — change brands & rates", actions: ["view", "edit"] },
  { key: "summary-rates", label: "Material Analysis — with rates (also Project BOQ)", actions: ["view"] },
  { key: "summary-norates", label: "Material Analysis — quantities only", actions: ["view"] },
  { key: "quotation", label: "Quotation", actions: ["view", "edit"] },
  { key: "customer-view", label: "Quotation — Customer View", actions: ["view", "edit"] },
];

// Standalone pages that are really one project tab.
export const ROUTE_TAB = {
  "project-boq": "summary-rates",
  "project-quotation": "quotation",
};

// Which screen each page of the Interior app belongs to (Dashboard and Profile
// are handled separately).
export const ROUTE_SCREEN = {
  leads: "leads",
  projects: "projects",
  "sub-projects": "projects",
  "dimensions-entry": "projects",
  "project-boq": "projects",
  "project-quotation": "projects",
  "template-master": "templates",
  "design-gallery": "designGallery",
  "items-pricing": "itemsPricing",
  "material-models": "materialModels",
};

// A missing `access` (older server) is treated as the owner; the server still
// enforces whatever it actually knows.
export const isOwner = (access) => !access || access.owner !== false;

const none = { view: false, edit: false, delete: false };
export const permOf = (access, screen) => (isOwner(access) ? { view: true, edit: true, delete: true } : (access.perms && access.perms[screen]) || none);
export const can = (access, screen, action = "view") => !!permOf(access, screen)[action];
// Permission on one project tab. A server that predates per-tab access sends no
// `tabs`, so fall back to its whole-"projects" rule.
export const canTab = (access, tab, action = "view") => {
  if (isOwner(access)) return true;
  const tabs = access.perms && access.perms.tabs;
  return tabs ? !!(tabs[tab] && tabs[tab][action]) : can(access, "projects", action);
};

// While a view-only (or no-delete) project tab or page is open, edits to project
// data are refused even though the group can edit projects on another tab. Set
// by the Projects page / Screen wrapper and cleared when they unmount.
let projectLock = null;
export const setProjectLock = (lock) => { projectLock = lock; };

export const anyEdit = (access) => isOwner(access) || SCREENS.some((s) => can(access, s.key, "edit"));

// What the owner sees when previewing as a group or a person (see Impersonate).
export const groupImpersonation = (g) => ({
  kind: "group", label: g.name, groupName: g.name,
  access: { owner: false, perms: g.perms || {}, scope: Array.isArray(g.scope) ? g.scope.map(String) : null, groupName: g.name },
});
export const personImpersonation = (e, groups) => {
  const g = (groups || []).find((x) => x.id === e.groupId);
  return g ? { ...groupImpersonation(g), kind: "person", label: e.name } : null;
};

// The workspace as the server would hand it to that group: screens they can't
// view come back empty, and a project-limited group only sees its own projects.
export function previewView(access, data, defaults) {
  if (isOwner(access)) return data;
  const out = { ...data };
  Object.keys(KEY_MODULE).forEach((k) => {
    if (k in data && !can(access, KEY_MODULE[k], "view")) out[k] = defaults[k];
  });
  if (Array.isArray(access.scope)) {
    const ids = new Set(access.scope.map(String));
    const names = new Set((Array.isArray(data.projects) ? data.projects : []).filter((p) => ids.has(String(p.id))).map((p) => p.name));
    if (Array.isArray(out.projects)) out.projects = out.projects.filter((p) => ids.has(String(p.id)));
    if (Array.isArray(out.subProjects)) out.subProjects = out.subProjects.filter((r) => names.has(r.project));
    if (Array.isArray(out.dimensions)) out.dimensions = out.dimensions.filter((r) => names.has(r.projectName));
  }
  return out;
}

// True when the employee is limited to some projects instead of all of them.
export const isScoped = (access) => !isOwner(access) && Array.isArray(access.scope);

const idsOf = (rows, acc = new Set()) => {
  (rows || []).forEach((r) => {
    if (r && r.id !== undefined) acc.add(String(r.id));
    if (r && Array.isArray(r.children)) idsOf(r.children, acc);
  });
  return acc;
};
const lostIds = (prev, next) => {
  const now = idsOf(next);
  for (const id of idsOf(prev)) if (!now.has(id)) return true;
  return false;
};

/**
 * Wraps a workspace state setter so an employee can't change data their group
 * doesn't allow: no Edit means the update is dropped, Edit without Delete
 * drops any update that removes a row.
 */
export function guardSetter(access, key, setter) {
  // A customer's page only ever touches answers; the server allows nothing else.
  if (isOwner(access) || access.customer) return setter;
  const screen = KEY_MODULE[key];
  const canEdit = screen ? can(access, screen, "edit") : anyEdit(access);
  const canDelete = screen ? can(access, screen, "delete") : false;
  const lockable = screen === "projects";
  if (canEdit && canDelete && !lockable) return setter;
  return (value) => setter((prev) => {
    if (!canEdit || (lockable && projectLock && projectLock.readOnly)) return prev;
    const next = typeof value === "function" ? value(prev) : value;
    const noDelete = !canDelete || (lockable && projectLock && projectLock.noDelete);
    if (noDelete && Array.isArray(prev) && Array.isArray(next) && lostIds(prev, next)) return prev;
    return next;
  });
}
