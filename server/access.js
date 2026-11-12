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
  'req-form': ['view', 'edit', 'delete'],
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
  // A customer's group (made by Teams > Add customer) opens no screen: the
  // customer only sees the Requirements form of their own project.
  if (raw && raw.customer === true) {
    const none = { view: false, edit: false, delete: false };
    for (const m of MODULES) out[m] = { ...none };
    out.tabs = Object.fromEntries(Object.keys(PROJECT_TABS).map((k) => [k, { ...none }]));
    out.customer = true;
    return out;
  }
  const given = raw && raw.tabs && typeof raw.tabs === 'object' ? raw.tabs : null;
  const fallback = (raw && raw.projects) || {};
  const tabs = {};
  for (const [key, actions] of Object.entries(PROJECT_TABS)) {
    // "Req Form" came after the other tabs: a group saved before it follows its Req rule.
    const src = given ? (given[key] || (key === 'req-form' ? given.req : null) || {}) : fallback;
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

// ── Customers ───────────────────────────────────────────────────────────────
// A customer signs in to fill the room requirements of ONE project. They see only
// that project's name and rooms (no boxes, rates or prices), the question sets
// those rooms use, and may change only the answers — and "submit", once.
const isAnswered = (v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== '');

const requirementSets = (stored) => {
  const p = stored.companyProfile;
  return p && Array.isArray(p.requirementSets) ? p.requirementSets : [];
};

function customerScope(access, stored) {
  const ids = new Set((access.scope || []).map(String));
  const projects = (Array.isArray(stored.projects) ? stored.projects : []).filter((p) => ids.has(String(p.id)));
  return { ids, projects, names: new Set(projects.map((p) => p.name)) };
}

function viewCustomer(access, stored, defaults) {
  const out = { ...defaults };
  const { projects, names } = customerScope(access, stored);
  const rooms = (Array.isArray(stored.subProjects) ? stored.subProjects : []).filter((r) => names.has(r.project));
  const used = new Set(rooms.map((r) => r.requirementSetId).filter(Boolean));
  out.projects = projects.map((p) => ({
    id: p.id, name: p.name,
    requirementsSubmittedAt: p.requirementsSubmittedAt || null,
    requirementsSubmittedBy: p.requirementsSubmittedBy || null,
  }));
  out.subProjects = rooms.map((r) => ({
    id: r.id, project: r.project, subProject: r.subProject,
    requirementSetId: r.requirementSetId || null,
    requirements: r.requirements || {},
    remarks: r.remarks || {},
  }));
  out.companyProfile = { requirementSets: requirementSets(stored).filter((s) => used.has(s.id)) };
  return out;
}

// Keeps only answers to real questions of the set, in the shape the question expects.
export function cleanAnswers(set, raw) {
  const out = {};
  if (!set || !raw || typeof raw !== 'object') return out;
  for (const q of Array.isArray(set.questions) ? set.questions : []) {
    const v = raw[q.id];
    if (v === undefined || v === null || v === '') continue;
    if (q.type === 'yesno') { if (v === 'yes' || v === 'no') out[q.id] = v; }
    else if (q.type === 'choice') { if ((q.options || []).some((o) => (typeof o === 'string' ? o : o && o.label) === v)) out[q.id] = v; }
    else if (q.type === 'multi') {
      const labels = (q.options || []).map((o) => (typeof o === 'string' ? o : o && o.label));
      const picked = Array.isArray(v) ? [...new Set(v)].filter((x) => typeof x === 'string' && labels.includes(x)) : [];
      if (picked.length) out[q.id] = picked;
    }
    else if (q.type === 'number') { const n = Number(v); if (Number.isFinite(n) && n >= 0 && n < 1e6) out[q.id] = n; }
    else if (q.type === 'text') out[q.id] = String(v).slice(0, 500);
  }
  return out;
}

// Remarks: free text per question of the set, trimmed to a sensible length.
export function cleanRemarks(set, raw) {
  const out = {};
  if (!set || !raw || typeof raw !== 'object') return out;
  for (const q of Array.isArray(set.questions) ? set.questions : []) {
    const v = raw[q.id];
    if (typeof v === 'string' && v.trim() !== '') out[q.id] = v.slice(0, 500);
  }
  return out;
}

function mergeCustomer(access, stored, incoming) {
  const writes = {};
  const denied = [];
  const { ids, projects, names } = customerScope(access, stored);
  if (!projects.length) return { writes, denied: [] };
  const sets = requirementSets(stored);
  const submitted = (name) => projects.some((p) => p.name === name && p.requirementsSubmittedAt);

  if (Array.isArray(incoming.subProjects) && Array.isArray(stored.subProjects)) {
    const inById = new Map(incoming.subProjects.filter((r) => r && r.id !== undefined).map((r) => [String(r.id), r]));
    let changed = false;
    const next = stored.subProjects.map((room) => {
      if (!names.has(room.project) || submitted(room.project)) return room;
      const inc = inById.get(String(room.id));
      const set = sets.find((s) => s.id === room.requirementSetId);
      if (!inc || !set) return room;
      const answers = cleanAnswers(set, inc.requirements);
      const remarks = inc.remarks === undefined ? (room.remarks || {}) : cleanRemarks(set, inc.remarks);
      if (same(answers, room.requirements || {}) && same(remarks, room.remarks || {})) return room;
      changed = true;
      return { ...room, requirements: answers, remarks };
    });
    if (changed) writes.subProjects = next;
  }

  if (Array.isArray(incoming.projects)) {
    const inById = new Map(incoming.projects.filter((p) => p && p.id !== undefined).map((p) => [String(p.id), p]));
    let changed = false;
    const next = stored.projects.map((p) => {
      if (!ids.has(String(p.id)) || p.requirementsSubmittedAt) return p;
      const inc = inById.get(String(p.id));
      if (!inc || !inc.requirementsSubmittedAt) return p;
      // Every required question of the project's rooms must be answered first.
      const rooms = (writes.subProjects || stored.subProjects || []).filter((r) => r.project === p.name);
      const incomplete = rooms.some((r) => {
        const set = sets.find((s) => s.id === r.requirementSetId);
        return set && (set.questions || []).some((q) => q.required && !isAnswered((r.requirements || {})[q.id]));
      });
      if (incomplete) { denied.push('requirements'); return p; }
      changed = true;
      return { ...p, requirementsSubmittedAt: new Date().toISOString(), requirementsSubmittedBy: 'customer' };
    });
    if (changed) writes.projects = next;
  }
  return { writes, denied };
}

/** What an employee sees of the stored workspace (owners see all of it). */
export function viewWorkspace(access, stored, defaults) {
  if (access.customer) return viewCustomer(access, stored, defaults);
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
  if (access.customer) return mergeCustomer(access, stored, incoming);
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
