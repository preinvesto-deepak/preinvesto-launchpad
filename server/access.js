// Access control for employees of an Interior workspace.
//
// The account owner (a row in `users`) has full access. Employees log in with
// a username + password the owner set, and see/edit the OWNER's workspace
// through the rules in their group: per-screen View / Edit / Delete, and
// optionally only a chosen set of projects.
//
// The workspace is stored as one JSON blob per key (see INTERIOR_DEFAULTS), and
// the app always saves every key. So enforcement here works on what actually
// changed: for each key we compare the incoming value with the stored one
// (as that employee is allowed to see it) and keep only the parts they may
// change. Anything else is left as stored and reported back in `denied`.
//
// public/api/interior_access.php is the PHP twin of this file — keep the two
// in step.

export const MODULES = ['leads', 'projects', 'itemsPricing', 'materialModels', 'templates', 'designGallery'];

// Which screen's permission governs each stored key.
export const KEY_MODULE = {
  projects: 'projects', subProjects: 'projects', dimensions: 'projects',
  prices: 'itemsPricing',
  materialModelRates: 'materialModels', materialModelProfitPercent: 'materialModels',
  templates: 'templates', templateFolders: 'templates', selectedTemplateId: 'templates',
  designGallery: 'designGallery',
  leads: 'leads', leadViews: 'leads', leadStatuses: 'leads', leadTagColors: 'leads',
};

// The old contact list; people now live in the Team list (owner-only), so this
// key is only ever kept empty and employees never see or change it.
const OWNER_ONLY_KEYS = ['teamMembers'];

// Settings every screen leans on (custom services, sheet sizes, kerf): readable
// by any employee, writable by anyone who can edit at least one screen.
const SHARED_KEYS = ['companyProfile', 'materialStockSettings', 'kerfWidth'];

// A quotation can't be computed without these, so seeing Projects also lets an
// employee read them (they still can't change them without that screen's Edit).
const PROJECT_READ_DEPS = [
  'prices', 'templates', 'templateFolders', 'selectedTemplateId',
  'materialModelRates', 'materialModelProfitPercent', 'designGallery',
];

// Keys that can be limited to chosen projects, and how a row names its project.
const SCOPED = {
  projects:    (row, scope) => scope.ids.has(String(row.id)),
  subProjects: (row, scope) => scope.names.has(row.project),
  dimensions:  (row, scope) => scope.names.has(row.projectName),
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The tabs inside one project, each with the actions a group can grant on it.
// The server only enforces the "projects" module as a whole (every tab edits the
// same stored data), so that module's View/Edit/Delete is simply "any tab has
// it"; the tab-by-tab limits themselves are applied by the app.
export const PROJECT_TABS = {
  req: ['view', 'edit', 'delete'],
  design: ['view', 'edit', 'delete'],
  rooms: ['view', 'edit', 'delete'],
  'material-models': ['view', 'edit'],
  'summary-rates': ['view'],
  'summary-norates': ['view'],
  quotation: ['view', 'edit'],
  'customer-view': ['view', 'edit'],
};

/**
 * Cleans a permissions object into { [module]: { view, edit, delete }, tabs }.
 * Groups saved before per-tab access (no `tabs`) get their old "projects"
 * rule copied onto every tab.
 */
export function normalizePerms(raw) {
  const out = {};
  const given = raw && raw.tabs && typeof raw.tabs === 'object' ? raw.tabs : null;
  const fallback = (raw && raw.projects) || {};
  const tabs = {};
  for (const [key, actions] of Object.entries(PROJECT_TABS)) {
    const src = given ? (given[key] || {}) : fallback;
    const edit = actions.includes('edit') && !!src.edit;
    const del = actions.includes('delete') && !!src.delete;
    tabs[key] = { view: !!src.view || edit || del, edit, delete: del };
  }
  for (const m of MODULES) {
    if (m === 'projects') {
      const all = Object.values(tabs);
      out[m] = { view: all.some((t) => t.view), edit: all.some((t) => t.edit), delete: all.some((t) => t.delete) };
      continue;
    }
    const p = (raw && raw[m]) || {};
    const edit = !!p.edit, del = !!p.delete;
    out[m] = { view: !!p.view || edit || del, edit, delete: del };
  }
  out.tabs = tabs;
  return out;
}

/** null = every project, otherwise an array of project ids (as strings). */
export function normalizeScope(raw) {
  return Array.isArray(raw) ? [...new Set(raw.map(String))] : null;
}

const perm = (access, mod) => (access.perms && access.perms[mod]) || { view: false, edit: false, delete: false };

export function canViewScreen(access, mod) {
  return access.owner || perm(access, mod).view;
}

const canReadKey = (access, key) => {
  if (access.owner) return true;
  if (OWNER_ONLY_KEYS.includes(key)) return false;
  if (SHARED_KEYS.includes(key)) return true;
  const mod = KEY_MODULE[key];
  if (mod && perm(access, mod).view) return true;
  return perm(access, 'projects').view && PROJECT_READ_DEPS.includes(key);
};

export const anyEdit = (access) => access.owner || MODULES.some((m) => perm(access, m).edit);

// The project names a scoped employee may touch (ids → names, from `projects`).
function scopeOf(access, projects) {
  if (access.owner || !access.scope) return null;
  const ids = new Set(access.scope);
  const names = new Set((Array.isArray(projects) ? projects : []).filter((p) => ids.has(String(p.id))).map((p) => p.name));
  return { ids, names };
}

/** What an employee sees of the stored workspace (owners see all of it). */
export function viewWorkspace(access, stored, defaults) {
  const out = {};
  const scope = scopeOf(access, stored.projects);
  for (const [key, def] of Object.entries(defaults)) {
    let val = key in stored ? stored[key] : def;
    if (!canReadKey(access, key)) val = def;
    else if (scope && SCOPED[key] && Array.isArray(val)) val = val.filter((r) => SCOPED[key](r, scope));
    out[key] = val;
  }
  return out;
}

// Every id inside a row, including nested children (Design Gallery tree).
function nestedIds(row, acc = new Set()) {
  if (row && row.id !== undefined) acc.add(String(row.id));
  if (row && Array.isArray(row.children)) row.children.forEach((c) => nestedIds(c, acc));
  return acc;
}
const lostNested = (before, after) => {
  const now = nestedIds(after);
  for (const id of nestedIds(before)) if (!now.has(id)) return true;
  return false;
};

function mergeArray(stored, incoming, { visible, canEdit, canDelete, canAdd }) {
  const inById = new Map();
  incoming.forEach((r) => { if (r && r.id !== undefined) inById.set(String(r.id), r); });
  const storedIds = new Set(stored.map((r) => String(r.id)));
  let denied = false;
  const out = [];

  for (const row of stored) {
    if (!visible(row)) { out.push(row); continue; }
    const inc = inById.get(String(row.id));
    if (!inc) {
      if (!canDelete) { out.push(row); denied = true; }
      continue;
    }
    if (same(row, inc)) { out.push(row); continue; }
    if (!canEdit || !visible(inc) || (!canDelete && lostNested(row, inc))) { out.push(row); denied = true; continue; }
    out.push(inc);
  }
  for (const inc of incoming) {
    if (!inc || storedIds.has(String(inc.id))) continue;
    if (canAdd && visible(inc)) out.push(inc); else denied = true;
  }
  return { value: out, denied };
}

/**
 * Applies an employee's POSTed workspace to what is stored. Returns
 * { writes: { key: value } (only keys that really change), denied: [keys] }.
 */
export function mergeWorkspace(access, stored, incoming, defaults) {
  const writes = {};
  const denied = [];
  const editAny = anyEdit(access);
  // `projects` first: the rooms/dimensions rules depend on which projects an
  // employee may touch, including one they just renamed.
  const keys = Object.keys(incoming).sort((a, b) => (a === 'projects' ? -1 : b === 'projects' ? 1 : 0));
  const storedProjects = stored.projects;
  let mergedProjects = storedProjects;

  for (const key of keys) {
    const base = key in stored ? stored[key] : defaults[key];
    const inc = incoming[key];
    const mod = KEY_MODULE[key];
    const readable = canReadKey(access, key);
    // Unreadable keys came back to the app as empty defaults — nothing to merge.
    if (!readable) continue;

    const canEdit = mod ? perm(access, mod).edit : editAny;
    const canDelete = mod ? perm(access, mod).delete : false;

    let scope = null;
    if (SCOPED[key] && !access.owner && access.scope) {
      const a = scopeOf(access, storedProjects);
      const b = scopeOf(access, mergedProjects);
      scope = { ids: a.ids, names: new Set([...a.names, ...b.names]) };
    }

    if (Array.isArray(base) && Array.isArray(inc)) {
      const visible = scope ? (r) => SCOPED[key](r, scope) : () => true;
      const res = mergeArray(base, inc, { visible, canEdit, canDelete, canAdd: canEdit && !scope });
      if (res.denied) denied.push(key);
      if (!same(res.value, base)) writes[key] = res.value;
      if (key === 'projects') mergedProjects = res.value;
    } else if (!same(inc, base)) {
      if (canEdit) writes[key] = inc; else denied.push(key);
    }
  }
  return { writes, denied };
}
