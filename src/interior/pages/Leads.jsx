import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { DEFAULT_LEAD_STATUSES, DEFAULT_LEAD_STATUS, STATUS_COLOR_PRESETS, statusInfo } from "../data/leadStatus";
import { LEAD_SOURCES, leadSourceLabel } from "../data/leadSource";
import { PRIORITY_LEVELS, priorityInfo, tagColor, TAG_COLORS } from "../data/leadPriority";

// Same field set as the "+ New Project" form in Projects.jsx (Name/Contact/
// Email/Location/Address), plus the lead-only fields (Source, Referred By,
// Landing Date, Notes) — kept identical so nothing has to be re-typed on
// Convert. Unlike "+ New Project", Location/Address stay optional here: a
// fresh enquiry often starts with just a name and phone number.
const emptyForm = { name: "", contact: "", email: "", source: "", referredBy: "", location: "", address: "", landingDate: "", nextFollowUpDate: "", notes: "" };

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDateTime = (ms) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

// Every account starts with these two tabs (List/Board, ClickUp-style) — both
// built in, neither deletable/renamable, but their filters are still fully
// editable, same as any view the user adds with "+ View".
const DEFAULT_LEAD_VIEWS = [
  { id: "list", name: "List", type: "list", filters: [], showClosed: false, builtin: true },
  { id: "board", name: "Board", type: "board", filters: [], showClosed: false, builtin: true },
];

// Every field a List-view table column can show, in their default display
// order — toggled/reordered per-view via the ⚙ → Manage Columns panel. Kept
// at module scope alongside DEFAULT_LEAD_VIEWS since it's the same kind of
// "starter config a view falls back to" as DEFAULT_LEAD_VIEWS itself.
const ALL_LEAD_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "contact", label: "Contact" },
  { key: "source", label: "Source" },
  { key: "status", label: "Status" },
  { key: "landingDate", label: "Landing Date" },
  { key: "nextFollowUpDate", label: "Next Update" },
  { key: "latestComment", label: "Latest Comment" },
  { key: "email", label: "Email" },
  { key: "referredBy", label: "Referred By" },
  { key: "priority", label: "Priority" },
  { key: "tags", label: "Tags" },
  { key: "location", label: "Location" },
  { key: "address", label: "Address" },
  { key: "notes", label: "Notes" },
  { key: "createdAt", label: "Created" },
];
// The columns a List view starts with before anyone customizes it — same set
// the table always showed before columns became configurable.
const DEFAULT_VISIBLE_COLUMNS = ["name", "contact", "source", "status", "landingDate", "nextFollowUpDate", "latestComment"];

// The Lead Detail field grid's building blocks — defined at module scope
// (NOT inside Leads()) deliberately: a component type declared inside a
// render function gets a fresh function identity every render, which makes
// React treat it as a brand-new component type and remount its whole
// subtree — kicking any input inside it out of focus after a single
// keystroke. Keeping these stable is what lets the Tags/Notes inputs here
// hold focus while typing.

// A labeled value cell for the Lead Detail screen's field grid — small
// uppercase overline label above the control, ClickUp's own field-row style.
// Used standalone for the full-width Notes field.
const FieldBlock = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
    {children}
  </div>
);

// Label-beside-value, ClickUp's own "Status ... Priority" row style — used
// two at a time inside FieldRowPair for the main field grid.
const FieldPair = ({ label, children }) => (
  <div style={{ flex: 1, display: "flex", gap: 14, alignItems: "flex-start", minWidth: 0 }}>
    <div style={{ width: 110, flexShrink: 0, fontSize: 13, color: "#6b7280", paddingTop: 6 }}>{label}</div>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
  </div>
);

// Two FieldPairs per row with a thin vertical divider between them —
// ClickUp's "2 fields side by side" field-grid pattern.
const FieldRowPair = ({ children }) => (
  <div style={{ display: "flex", gap: 24, alignItems: "flex-start", paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid #f8fafc" }}>
    {children[0]}
    <div style={{ width: 1, alignSelf: "stretch", background: "#f1f5f9" }} />
    {children[1]}
  </div>
);

// Priority's flag icon, drawn as SVG instead of the 🚩 emoji — emoji glyphs
// are fixed full-color pictures that ignore CSS `color`, so a differently
// colored Urgent/High/Normal/Low flag was impossible with the emoji; this
// renders in `currentColor`, picking up whatever color its wrapping element sets.
const FlagIcon = ({ size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 3v18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <path d="M5 4.5h13l-3 3.5 3 3.5H5" fill="currentColor" />
  </svg>
);

// Leads live in their own `leads` list — separate from `projects` — so
// jotting down a raw enquiry never creates real project/room scaffolding.
// A lead only becomes a project via the explicit "Convert to Project" action
// below, once the customer has actually responded with enough to go on.
function Leads() {
  const { leads, setLeads, projects, setProjects, leadViews, setLeadViews, leadStatuses, setLeadStatuses, leadTagColors, setLeadTagColors } = useAppData();
  const navigate = useNavigate();

  const statuses = leadStatuses && leadStatuses.length ? leadStatuses : DEFAULT_LEAD_STATUSES;
  const getStatus = (value) => statusInfo(statuses, value);

  const views = leadViews && leadViews.length ? leadViews : DEFAULT_LEAD_VIEWS;
  const [activeViewId, setActiveViewId] = useState(views[0].id);
  const activeView = views.find((v) => v.id === activeViewId) || views[0];

  // The 3 fields a filter row can key on, and where each one's value options
  // come from — mirrors the "Where [Field] [Is] [Value]" row from ClickUp's
  // filter panel. Status options come from the account's own customized list.
  const filterFields = [
    { value: "status", label: "Status", options: statuses },
    { value: "source", label: "Source", options: LEAD_SOURCES },
    { value: "followUp", label: "Follow-up", options: [{ value: "overdue", label: "Overdue" }, { value: "dueToday", label: "Due Today" }] },
  ];
  const fieldOptions = (field) => filterFields.find((f) => f.value === field)?.options || [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [hoveredCommentId, setHoveredCommentId] = useState(null);
  const [leadMenuOpen, setLeadMenuOpen] = useState(false);
  const [confirmDeleteInModal, setConfirmDeleteInModal] = useState(false);
  const [priorityMenuFor, setPriorityMenuFor] = useState(null);
  const [priorityMenuUp, setPriorityMenuUp] = useState(false);
  const [tagsMenuFor, setTagsMenuFor] = useState(null);
  const [tagsMenuUp, setTagsMenuUp] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");
  // Which tag (if any) the Tags popover is currently showing the rename/
  // recolor/delete panel for, in place of the ordinary chip list.
  const [tagColorEditFor, setTagColorEditFor] = useState(null);
  const [tagRenameDraft, setTagRenameDraft] = useState("");
  // Activity panel's own search — toggled open by a 🔍 button next to the
  // "Activity" header, filters the comments/system-log list by text.
  const [activitySearchOpen, setActivitySearchOpen] = useState(false);
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const [hoveredIconFor, setHoveredIconFor] = useState(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [addViewOpen, setAddViewOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewType, setNewViewType] = useState("list");
  const [renamingViewId, setRenamingViewId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteViewId, setConfirmDeleteViewId] = useState(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  // The ⚙ button next to Filter opens this small menu first, rather than
  // jumping straight to Manage Statuses — leaves room for other account-wide
  // Leads settings to join it later without needing a redesign.
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [columnsModalOpen, setColumnsModalOpen] = useState(false);
  // Which column the List table is sorted by, and which direction — not
  // persisted per-view (unlike filters/columns), same "session-only" scope
  // ClickUp's own column sort has.
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");
  // Edits inside Manage Statuses are staged here until Save is clicked —
  // unlike every other live-persisted toggle in this app, this one is
  // explicitly a "confirm before applying" flow per how it was asked for.
  const [statusDraft, setStatusDraft] = useState([]);
  const [newActiveLabel, setNewActiveLabel] = useState("");
  const [newDoneLabel, setNewDoneLabel] = useState("");
  const [newStatusColorIdx, setNewStatusColorIdx] = useState(0);
  const [confirmCloseStatusModal, setConfirmCloseStatusModal] = useState(false);

  const today = todayStr();
  // Overdue/Due Today only mean anything for a lead still being worked —
  // once it's Converted or marked Not Interested there's nothing left to follow up on.
  const needsFollowUp = (l) => l.status !== "converted" && l.status !== "notInterested";
  const isOverdue = (l) => needsFollowUp(l) && !!l.nextFollowUpDate && l.nextFollowUpDate < today;
  const isDueToday = (l) => needsFollowUp(l) && l.nextFollowUpDate === today;

  const overdueCount = leads.filter(isOverdue).length;
  const dueTodayCount = leads.filter(isDueToday).length;

  const matchesFilter = (lead, filter) => {
    let hit;
    if (filter.field === "status") hit = (lead.status || DEFAULT_LEAD_STATUS) === filter.value;
    else if (filter.field === "source") hit = lead.source === filter.value;
    else if (filter.field === "followUp") hit = filter.value === "overdue" ? isOverdue(lead) : isDueToday(lead);
    else return true;
    return filter.op === "isNot" ? !hit : hit;
  };
  // All filter rows combine with AND, same as the default/only mode shown in
  // ClickUp's own panel — no OR/nested-group support, which would be a lot of
  // extra UI for filters this small a field set doesn't really need yet.
  const applyView = (list, view) => list
    .filter((l) => view.showClosed || !l.closed)
    .filter((l) => (view.filters || []).every((f) => matchesFilter(l, f)));

  // One value-extractor per sortable field, used by both the sort below and
  // nowhere else — kept as a plain switch rather than a lookup table since
  // several fields need real logic (priority rank, latest-comment timestamp)
  // rather than a one-line property read.
  const columnSortValue = (l, key) => {
    switch (key) {
      case "name": return (l.name || "").toLowerCase();
      case "contact": return l.contact || "";
      case "source": return (leadSourceLabel(l.source) || "").toLowerCase();
      case "status": return getStatus(l.status).label.toLowerCase();
      case "landingDate": return l.landingDate || "";
      case "nextFollowUpDate": return l.nextFollowUpDate || "";
      case "email": return (l.email || "").toLowerCase();
      case "referredBy": return (l.referredBy || "").toLowerCase();
      case "priority": { const i = PRIORITY_LEVELS.findIndex((p) => p.value === l.priority); return i === -1 ? 99 : i; }
      case "tags": return (l.tags || []).join(",").toLowerCase();
      case "location": return (l.location || "").toLowerCase();
      case "address": return (l.address || "").toLowerCase();
      case "notes": return (l.notes || "").toLowerCase();
      case "latestComment": { const c = l.comments || []; return c.length ? c[c.length - 1].createdAt : 0; }
      case "createdAt": default: return l.createdAt || 0;
    }
  };
  const sorted = [...applyView(leads, activeView)].sort((a, b) => {
    const va = columnSortValue(a, sortField);
    const vb = columnSortValue(b, sortField);
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return sortDir === "asc" ? cmp : -cmp;
  });
  const toggleSort = (key) => {
    if (sortField === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(key); setSortDir("asc"); }
  };
  const closedCount = leads.filter((l) => l.closed).length;

  // Which columns the active List view shows, and in what order — falls
  // back to the starter set for any view that predates this feature (or a
  // brand-new one) so the table never renders with zero columns.
  const viewColumns = (activeView.columns && activeView.columns.length)
    ? activeView.columns
    : ALL_LEAD_COLUMNS.map((c) => ({ key: c.key, visible: DEFAULT_VISIBLE_COLUMNS.includes(c.key) }));
  const visibleColumns = viewColumns.filter((c) => c.visible);
  const updateViewColumns = (columns) => {
    setLeadViews(views.map((v) => v.id === activeViewId ? { ...v, columns } : v));
  };
  const toggleColumn = (key) => {
    updateViewColumns(viewColumns.map((c) => c.key === key ? { ...c, visible: !c.visible } : c));
  };
  const moveColumn = (key, dir) => {
    const i = viewColumns.findIndex((c) => c.key === key);
    const j = i + dir;
    if (j < 0 || j >= viewColumns.length) return;
    const next = [...viewColumns];
    [next[i], next[j]] = [next[j], next[i]];
    updateViewColumns(next);
  };
  // Drag-and-drop reordering (native HTML5 DnD, no extra library) — used by
  // both Manage Columns' rows and the table's own header cells, so a column
  // can be dragged into place directly instead of only via ↑/↓.
  const dragColumnKey = useRef(null);
  const reorderColumnTo = (key, targetKey) => {
    if (key === targetKey) return;
    const cols = [...viewColumns];
    const from = cols.findIndex((c) => c.key === key);
    const to = cols.findIndex((c) => c.key === targetKey);
    if (from === -1 || to === -1) return;
    const [moved] = cols.splice(from, 1);
    cols.splice(to, 0, moved);
    updateViewColumns(cols);
  };
  // Split into "what makes something draggable" vs "what makes something a
  // drop target" — the Manage Columns modal puts the drag source on a small
  // ⠿ handle (so it doesn't fight with the checkbox/↑/↓ clicks right next to
  // it) while the table puts it on the whole header cell; both share the
  // same drop-target props on their row/header.
  const columnDragSourceProps = (key) => ({
    draggable: key !== "name",
    onDragStart: (e) => { dragColumnKey.current = key; e.dataTransfer.effectAllowed = "move"; },
    onDragEnd: () => { dragColumnKey.current = null; },
  });
  const columnDropTargetProps = (key) => ({
    onDragOver: (e) => { if (dragColumnKey.current && dragColumnKey.current !== key) e.preventDefault(); },
    onDrop: (e) => {
      e.preventDefault();
      if (dragColumnKey.current) reorderColumnTo(dragColumnKey.current, key);
      dragColumnKey.current = null;
    },
  });

  // Every edit to views (filters, add/rename/delete) writes straight through —
  // same "no separate Save step" convention every other toggle in this app
  // already follows (Sft rows, Project Status, ...).
  const updateActiveViewFilters = (filters) => {
    setLeadViews(views.map((v) => v.id === activeViewId ? { ...v, filters } : v));
  };
  // Per-view — each tab (List/Board/custom) remembers its own show/hide-closed
  // choice, same as it remembers its own filters.
  const toggleShowClosed = () => {
    setLeadViews(views.map((v) => v.id === activeViewId ? { ...v, showClosed: !v.showClosed } : v));
  };
  const addFilterRow = () => {
    const id = Date.now();
    updateActiveViewFilters([...(activeView.filters || []), { id, field: "status", op: "is", value: statuses[0].value }]);
  };
  const updateFilterRow = (id, patch) => {
    updateActiveViewFilters((activeView.filters || []).map((f) => f.id === id ? { ...f, ...patch } : f));
  };
  const removeFilterRow = (id) => {
    updateActiveViewFilters((activeView.filters || []).filter((f) => f.id !== id));
  };
  const clearAllFilters = () => updateActiveViewFilters([]);

  const addView = () => {
    if (!newViewName.trim()) return;
    const id = `v${Date.now()}`;
    const next = [...views, { id, name: newViewName.trim(), type: newViewType, filters: [], showClosed: false }];
    setLeadViews(next);
    setActiveViewId(id);
    setAddViewOpen(false);
    setNewViewName("");
    setNewViewType("list");
  };
  const startRenameView = (v) => { setRenamingViewId(v.id); setRenameDraft(v.name); };
  const saveRenameView = () => {
    if (renameDraft.trim()) setLeadViews(views.map((v) => v.id === renamingViewId ? { ...v, name: renameDraft.trim() } : v));
    setRenamingViewId(null);
  };
  const deleteView = (id) => {
    const next = views.filter((v) => v.id !== id);
    setLeadViews(next);
    if (activeViewId === id) setActiveViewId(next[0]?.id || DEFAULT_LEAD_VIEWS[0].id);
    setConfirmDeleteViewId(null);
  };

  // ── Status Settings (⚙ next to Filter) ───────────────────────────────────
  // Unlike everything else in this app, edits here are staged in
  // `statusDraft` and only take effect on Save — closing with unsaved
  // changes prompts first. "converted" can be freely renamed/recolored, but
  // never deleted: app logic keys off that exact value (Convert to Project,
  // hiding the ordinary status dropdown for already-converted leads, ...).
  const statusDirty = JSON.stringify(statusDraft) !== JSON.stringify(statuses);

  const openStatusSettings = () => {
    setStatusDraft(statuses);
    setNewActiveLabel("");
    setNewDoneLabel("");
    setStatusModalOpen(true);
  };
  const renameStatus = (value, label) => setStatusDraft((prev) => prev.map((s) => s.value === value ? { ...s, label } : s));
  const moveStatusCategory = (value) => {
    setStatusDraft((prev) => prev.map((s) => s.value === value ? { ...s, category: (s.category || "active") === "active" ? "done" : "active" } : s));
  };
  const recolorStatus = (value) => {
    setStatusDraft((prev) => prev.map((s) => {
      if (s.value !== value) return s;
      const idx = STATUS_COLOR_PRESETS.findIndex((c) => c.color === s.color);
      return { ...s, ...STATUS_COLOR_PRESETS[(idx + 1) % STATUS_COLOR_PRESETS.length] };
    }));
  };
  // Reorders within the status's own category only — Active and Done are
  // separate lists in the UI, so ↑/↓ never jumps a status between them.
  const moveStatus = (value, dir) => {
    setStatusDraft((prev) => {
      const s = prev.find((x) => x.value === value);
      const cat = s?.category || "active";
      const groupPositions = prev.map((x, i) => ({ x, i })).filter(({ x }) => (x.category || "active") === cat).map(({ i }) => i);
      const posInGroup = groupPositions.indexOf(prev.indexOf(s));
      const newPos = posInGroup + dir;
      if (newPos < 0 || newPos >= groupPositions.length) return prev;
      const a = groupPositions[posInGroup], b = groupPositions[newPos];
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };
  const deleteStatus = (value) => {
    if (value === "converted") return;
    setStatusDraft((prev) => prev.filter((x) => x.value !== value));
  };
  const addDraftStatus = (category, label) => {
    if (!label.trim()) return;
    const value = `custom_${Date.now()}`;
    const preset = STATUS_COLOR_PRESETS[newStatusColorIdx % STATUS_COLOR_PRESETS.length];
    setStatusDraft((prev) => [...prev, { value, label: label.trim(), category, ...preset }]);
    setNewStatusColorIdx((i) => (i + 1) % STATUS_COLOR_PRESETS.length);
  };

  const saveStatusSettings = () => {
    // Any lead sitting on a status that got deleted falls back to the
    // default, rather than being left pointing at one that no longer exists.
    const draftValues = new Set(statusDraft.map((s) => s.value));
    const removedValues = statuses.filter((s) => !draftValues.has(s.value)).map((s) => s.value);
    if (removedValues.length) {
      setLeads((prev) => prev.map((l) => removedValues.includes(l.status || DEFAULT_LEAD_STATUS) ? { ...l, status: DEFAULT_LEAD_STATUS } : l));
    }
    setLeadStatuses(statusDraft);
    setStatusModalOpen(false);
    setConfirmCloseStatusModal(false);
  };
  const requestCloseStatusModal = () => {
    if (statusDirty) setConfirmCloseStatusModal(true);
    else setStatusModalOpen(false);
  };
  const discardStatusModal = () => {
    setConfirmCloseStatusModal(false);
    setStatusModalOpen(false);
  };

  const openAdd = () => {
    setEditId(null);
    setForm({ ...emptyForm, landingDate: todayStr() });
    setError("");
    setCommentDraft("");
    setLeadMenuOpen(false);
    setConfirmDeleteInModal(false);
    setModalOpen(true);
  };

  // The full-screen Lead Detail screen edits `lead` fields directly and
  // auto-saves — no staged `form` needed here (that's only for creating a
  // brand-new lead, which doesn't have an id to auto-save against yet).
  const openEdit = (lead) => {
    setEditId(lead.id);
    setError("");
    setCommentDraft("");
    setLeadMenuOpen(false);
    setConfirmDeleteInModal(false);
    setActivitySearchOpen(false);
    setActivitySearchQuery("");
    setModalOpen(true);
  };

  const closeLeadModal = () => setModalOpen(false);

  // Esc closes the Lead Detail modal, same as clicking Cancel — discards
  // any unsaved form edits without a confirm step (matching Cancel's own
  // behavior; edits here aren't persisted until Save anyway).
  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => { if (e.key === "Escape") closeLeadModal(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  // Only ever creates a new lead now — editing an existing one auto-saves
  // straight into `leads` from the Lead Detail screen instead.
  const saveLead = () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.contact.trim()) { setError("Contact Number is required."); return; }
    if (!/^[0-9]{10}$/.test(form.contact)) { setError("Contact Number must be exactly 10 digits."); return; }
    setError("");
    const id = leads.length ? Math.max(...leads.map((l) => l.id)) + 1 : 1;
    setLeads((prev) => [...prev, { id, ...form, status: DEFAULT_LEAD_STATUS, comments: [], closed: false, priority: null, tags: [], createdAt: Date.now() }]);
    setModalOpen(false);
  };

  const addComment = () => {
    if (!commentDraft.trim() || !editId) return;
    const comment = { id: Date.now(), text: commentDraft.trim(), createdAt: Date.now() };
    setLeads((prev) => prev.map((l) => l.id === editId ? { ...l, comments: [...(l.comments || []), comment] } : l));
    setCommentDraft("");
  };

  const deleteLead = (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
  };

  // Every field the Lead Detail screen or table/board editing can change,
  // with a label + a formatter for the value shown in the auto-generated
  // Activity line. Anything not listed here just silently updates the field
  // (typing in Name/Contact/etc. logs separately, on blur — see onBlurLog —
  // so every keystroke doesn't spam Activity with its own entry).
  const FIELD_META = {
    status: { label: "Status", format: (v) => getStatus(v).label },
    priority: { label: "Priority", format: (v) => (v ? priorityInfo(v).label : "None") },
    nextFollowUpDate: { label: "Next Update", format: (v) => v || "—" },
    landingDate: { label: "Landing Date", format: (v) => v || "—" },
    source: { label: "Lead Source", format: (v) => leadSourceLabel(v) || "—" },
    location: { label: "Location", format: (v) => v || "—" },
    address: { label: "Address", format: (v) => v || "—" },
    name: { label: "Name", format: (v) => v || "—" },
    contact: { label: "Contact Number", format: (v) => v || "—" },
    email: { label: "Email", format: (v) => v || "—" },
    referredBy: { label: "Referred By", format: (v) => v || "—" },
  };

  const appendActivityEntry = (comments, text) => [...(comments || []), { id: Date.now() + Math.random(), type: "system", text, createdAt: Date.now() }];

  // A plain comment-style entry a user typed vs. one of these auto-generated
  // "X changed to Y" lines both live in the same `comments` array — `type`
  // tells the Activity panel which style to render it in.
  const logActivity = (id, text) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, comments: appendActivityEntry(l.comments, text) } : l)));
  };

  // `log = true` records the change in Activity automatically (used for
  // discrete controls — dropdowns, dates, toggles — where every change is
  // meaningful). Free-typed fields pass no `log` and rely on onBlurLog below.
  const updateLeadField = (id, field, value, log = false) => {
    setLeads((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      if (!log || !FIELD_META[field] || l[field] === value) return { ...l, [field]: value };
      const text = field === "closed" ? (value ? "Marked as Closed" : "Reopened") : `${FIELD_META[field].label} changed to "${FIELD_META[field].format(value)}"`;
      return { ...l, [field]: value, comments: appendActivityEntry(l.comments, text) };
    }));
  };

  // Captures a text field's value on focus so onBlurLog can tell whether it
  // actually changed by the time the user leaves the field — logging once
  // per edit instead of once per keystroke.
  const fieldBaselineRef = useRef({});
  const onFieldFocus = (field, value) => { fieldBaselineRef.current[field] = value; };
  const onBlurLog = (id) => (field) => (e) => {
    const oldVal = fieldBaselineRef.current[field];
    const newVal = e.target.value;
    if (oldVal !== undefined && oldVal !== newVal) {
      logActivity(id, field === "notes" ? "Notes updated" : `${FIELD_META[field].label} changed to "${FIELD_META[field].format(newVal)}"`);
    }
  };

  const toggleTag = (id, tag) => {
    setLeads((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      const tags = l.tags || [];
      const adding = !tags.includes(tag);
      const newTags = adding ? [...tags, tag] : tags.filter((t) => t !== tag);
      return { ...l, tags: newTags, comments: appendActivityEntry(l.comments, `Tag "${tag}" ${adding ? "added" : "removed"}`) };
    }));
  };
  // Every tag used on any lead, account-wide — offered as quick-toggle chips
  // in the Tags popover so the same tag gets reused instead of re-typed.
  const allTags = [...new Set(leads.flatMap((l) => l.tags || []))];

  // A tag's color is account-wide (not per-lead) — `leadTagColors` only holds
  // entries the user explicitly picked via the ⚙ editor; anything else still
  // falls back to the old hash-based tagColor() so untouched tags keep working.
  const getTagColor = (tag) => (leadTagColors && leadTagColors[tag]) || tagColor(tag);
  const setTagColorChoice = (tag, color) => setLeadTagColors((prev) => ({ ...(prev || {}), [tag]: color }));
  const renameTagEverywhere = (oldTag, newTag) => {
    const clean = newTag.trim();
    if (!clean || clean === oldTag) return;
    setLeads((prev) => prev.map((l) => {
      if (!(l.tags || []).includes(oldTag)) return l;
      return { ...l, tags: [...new Set(l.tags.map((t) => (t === oldTag ? clean : t)))] };
    }));
    setLeadTagColors((prev) => {
      if (!prev || !prev[oldTag]) return prev;
      const next = { ...prev, [clean]: prev[oldTag] };
      delete next[oldTag];
      return next;
    });
  };
  const deleteTagEverywhere = (tag) => {
    setLeads((prev) => prev.map((l) => (l.tags || []).includes(tag) ? { ...l, tags: l.tags.filter((t) => t !== tag) } : l));
    setLeadTagColors((prev) => {
      if (!prev || !prev[tag]) return prev;
      const next = { ...prev };
      delete next[tag];
      return next;
    });
  };

  // The only path from a lead to a real project. Copies over everything
  // already known (name/contact/email/source/location/address — same field
  // set as "+ New Project"), creates the project in "In Progress" status, and
  // marks the lead "Converted" with a link to it. If Location/Address weren't
  // filled in on the lead, Edit Info on the new project still requires them
  // before the project can be saved again.
  const convertToProject = (lead) => {
    const id = projects.length ? Math.max(...projects.map((p) => p.id)) + 1 : 1;
    const newProject = {
      id,
      name: lead.name,
      client: lead.name,
      contact: lead.contact || "",
      email: lead.email || "",
      location: lead.location || "",
      address: lead.address || "",
      leadSource: lead.source || "",
      referredBy: lead.referredBy || "",
      createdAt: Date.now(),
    };
    setProjects((prev) => [...prev, newProject]);
    setLeads((prev) => prev.map((l) => l.id === lead.id ? { ...l, status: "converted", convertedProjectId: id, comments: appendActivityEntry(l.comments, "Converted to Project") } : l));
    navigate(`/interior/projects?id=${id}`);
  };

  const inputStyle = { width: "100%" };
  const filterCount = (activeView.filters || []).length;

  const dueBadge = (l) => {
    if (isOverdue(l)) return <div style={{ fontSize: 10, color: "#dc2626", fontWeight: 700, marginTop: 2 }}>Overdue</div>;
    if (isDueToday(l)) return <div style={{ fontSize: 10, color: "#b45309", fontWeight: 700, marginTop: 2 }}>Due today</div>;
    return null;
  };

  // Small flag-icon button + popover to set/clear a lead's priority — same
  // Urgent/High/Normal/Low scheme ClickUp uses, fixed (not customizable like
  // statuses). Used on Board cards and inside the Lead Detail modal.
  // A small dark tooltip above a button on hover — used instead of the native
  // `title` attribute for these icon buttons, since the browser's own
  // tooltip rendered below the cursor and got clipped/hard to read.
  const iconTooltip = (key, text) =>
    hoveredIconFor === key && (
      <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 5, zIndex: 60, background: "#111827", color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 8px", borderRadius: 5, whiteSpace: "nowrap", pointerEvents: "none" }}>
        {text}
      </div>
    );

  // `ctx` distinguishes the same lead's button in two places at once (a Board
  // card behind an open modal for that same lead) — without it they'd share
  // the same menuFor key and both popovers would pop open together.
  const priorityButton = (l, ctx = "board") => {
    const info = priorityInfo(l.priority);
    const menuKey = `${l.id}:${ctx}`;
    const hoverKey = `${menuKey}:priority`;
    return (
      <div style={{ position: "relative", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => {
            // Flip the popover to open upward when the button sits in the
            // bottom ~200px of the viewport, so opening it never gets
            // clipped/pushed off-screen for a card near the page's edge.
            const rect = e.currentTarget.getBoundingClientRect();
            setPriorityMenuUp(window.innerHeight - rect.bottom < 200);
            setPriorityMenuFor((id) => (id === menuKey ? null : menuKey));
            setTagsMenuFor(null);
          }}
          onMouseEnter={() => setHoveredIconFor(hoverKey)}
          onMouseLeave={() => setHoveredIconFor((k) => (k === hoverKey ? null : k))}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", background: info ? info.bg : "#f9fafb", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", color: info ? info.color : "#c1c7d0" }}
        ><FlagIcon /></button>
        {iconTooltip(hoverKey, info ? `Priority: ${info.label}` : "Set priority")}
        {priorityMenuFor === menuKey && (
          <>
            <div onClick={() => setPriorityMenuFor(null)} style={{ position: "fixed", inset: 0, zIndex: 1899 }} />
            <div style={{ position: "absolute", ...(priorityMenuUp ? { bottom: "100%", marginBottom: 4 } : { top: "100%", marginTop: 4 }), left: 0, width: 140, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 8px 20px rgba(0,0,0,0.18)", zIndex: 1900, overflow: "hidden" }}>
              {PRIORITY_LEVELS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => { updateLeadField(l.id, "priority", p.value, true); setPriorityMenuFor(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 12px", fontSize: 12, background: l.priority === p.value ? "#f3f4f6" : "none", border: "none", cursor: "pointer", color: "#111827" }}
                >
                  <span style={{ color: p.color, display: "inline-flex" }}><FlagIcon /></span> {p.label}
                </button>
              ))}
              <button
                onClick={() => { updateLeadField(l.id, "priority", null, true); setPriorityMenuFor(null); }}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", fontSize: 12, background: "none", border: "none", borderTop: "1px solid #f1f5f9", cursor: "pointer", color: "#9ca3af" }}
              >
                Clear
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // Small tag-icon button + popover — type-to-create a new tag, or toggle
  // any tag already used elsewhere so the same label gets reused.
  const tagsButton = (l, ctx = "board") => {
    const tags = l.tags || [];
    const menuKey = `${l.id}:${ctx}`;
    const hoverKey = `${menuKey}:tags`;
    return (
      <div style={{ position: "relative", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setTagsMenuUp(window.innerHeight - rect.bottom < 260);
            setTagsMenuFor((id) => (id === menuKey ? null : menuKey));
            setPriorityMenuFor(null);
            setNewTagInput("");
            setTagColorEditFor(null);
          }}
          onMouseEnter={() => setHoveredIconFor(hoverKey)}
          onMouseLeave={() => setHoveredIconFor((k) => (k === hoverKey ? null : k))}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, background: tags.length ? "#eef2ff" : "#f9fafb", border: "none", borderRadius: 13, height: 26, minWidth: 26, padding: "0 8px", cursor: "pointer", color: tags.length ? "#4338ca" : "#c1c7d0", fontSize: 12, fontWeight: 700 }}
        >
          🏷{tags.length > 0 ? tags.length : ""}
        </button>
        {iconTooltip(hoverKey, "Tags")}
        {tagsMenuFor === menuKey && (
          <>
            <div onClick={() => { setTagsMenuFor(null); setTagColorEditFor(null); }} style={{ position: "fixed", inset: 0, zIndex: 1899 }} />
            <div style={{ position: "absolute", ...(tagsMenuUp ? { bottom: "100%", marginBottom: 4 } : { top: "100%", marginTop: 4 }), left: 0, width: 220, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 8px 20px rgba(0,0,0,0.18)", zIndex: 1900, padding: 10 }}>
              {tagColorEditFor ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <button onClick={() => setTagColorEditFor(null)} title="Back" style={{ background: "none", border: "none", color: "#6b7280", fontSize: 14, cursor: "pointer", padding: 0 }}>←</button>
                    <input
                      autoFocus value={tagRenameDraft} onChange={(e) => setTagRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tagRenameDraft.trim()) { renameTagEverywhere(tagColorEditFor, tagRenameDraft.trim()); setTagColorEditFor(tagRenameDraft.trim()); }
                      }}
                      style={{ flex: 1, fontSize: 13, padding: "4px 8px" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {TAG_COLORS.map((c) => (
                      <button
                        key={c} onClick={() => setTagColorChoice(tagColorEditFor, c)} title={c}
                        style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", border: getTagColor(tagColorEditFor) === c ? "2px solid #111827" : "2px solid transparent", padding: 0 }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => { deleteTagEverywhere(tagColorEditFor); setTagColorEditFor(null); }}
                    style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid #f1f5f9", color: "#dc2626", fontSize: 12, padding: "8px 0 0", cursor: "pointer" }}
                  >
                    🗑 Delete tag
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} placeholder="New tag, then Enter"
                    onKeyDown={(e) => { if (e.key === "Enter" && newTagInput.trim()) { toggleTag(l.id, newTagInput.trim()); setNewTagInput(""); } }}
                    style={{ width: "100%", fontSize: 12, padding: "5px 8px", marginBottom: 8 }}
                  />
                  {allTags.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                      {allTags.map((t) => {
                        const on = tags.includes(t);
                        return (
                          <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              onClick={() => toggleTag(l.id, t)}
                              style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 20, border: `1px solid ${getTagColor(t)}`, background: on ? getTagColor(t) : "#fff", color: on ? "#fff" : getTagColor(t), cursor: "pointer" }}
                            >
                              {t}
                            </button>
                            <button
                              onClick={() => { setTagColorEditFor(t); setTagRenameDraft(t); }}
                              title="Edit tag color"
                              style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}
                            >⚙</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const tagPills = (l) => {
    const tags = l.tags || [];
    if (!tags.length) return null;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
        {tags.map((t) => (
          <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: getTagColor(t), color: "#fff" }}>
            {t}
          </span>
        ))}
      </div>
    );
  };

  const leadName = (l) => (
    <button
      onClick={() => openEdit(l)}
      style={{ background: "none", border: "none", padding: 0, color: "#111827", fontWeight: 700, fontSize: 13, cursor: "pointer", textDecoration: "underline", textDecorationColor: "transparent" }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecorationColor = "#9ca3af")}
      onMouseLeave={(e) => (e.currentTarget.style.textDecorationColor = "transparent")}
      title="Open lead"
    >
      {l.name}
    </button>
  );

  // Most recent comment. `full` widens it for the table's own dedicated
  // column (replacing the old Convert/Open/Delete buttons there); hovering
  // a truncated comment pops the full text up above the cursor.
  const latestCommentLine = (l, full) => {
    const list = l.comments || [];
    if (!list.length) return full ? <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span> : null;
    const last = list[list.length - 1];
    return (
      <div
        onMouseEnter={() => setHoveredCommentId(l.id)}
        onMouseLeave={() => setHoveredCommentId((id) => (id === l.id ? null : id))}
        style={{ position: "relative", maxWidth: full ? 260 : 220, cursor: "default" }}
      >
        {/* Truncation's overflow:hidden must live on this inner span, not the
            outer wrapper — an absolutely-positioned tooltip clips invisible
            if its own parent has overflow:hidden, even though it renders at
            valid coordinates. Keeping the wrapper overflow:visible is what
            lets the tooltip below actually show. */}
        <div style={{ fontSize: full ? 12 : 11, color: full ? "#374151" : "#6b7280", marginTop: full ? 0 : 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          💬 {last.text}
        </div>
        {hoveredCommentId === l.id && (
          <div
            style={{
              position: "absolute", bottom: "100%", left: 0, marginBottom: 6, zIndex: 50,
              background: "#111827", color: "#fff", fontSize: 12, lineHeight: 1.5, padding: "8px 10px", borderRadius: 6,
              whiteSpace: "pre-wrap", maxWidth: 280, boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
            }}
          >
            {last.text}
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>{fmtDateTime(last.createdAt)}</div>
          </div>
        )}
      </div>
    );
  };

  // The List table's one <td> per configurable column — keyed by the same
  // `key` used in ALL_LEAD_COLUMNS/view.columns, so the header row and body
  // row can both just map over `visibleColumns` instead of hardcoding cells.
  const renderLeadCell = (l, key) => {
    const converted = l.status === "converted";
    switch (key) {
      case "name": return leadName(l);
      case "contact": return l.contact ? <>📞 {l.contact}</> : "—";
      case "email": return l.email || "—";
      case "source": return (
        <>
          {leadSourceLabel(l.source) || "—"}
          {l.source === "reference" && l.referredBy && (
            <div style={{ fontSize: 11, color: "#6b7280" }}>via {l.referredBy}</div>
          )}
        </>
      );
      case "referredBy": return l.referredBy || "—";
      case "status": return (
        <select
          value={l.status || DEFAULT_LEAD_STATUS}
          onChange={(e) => updateLeadField(l.id, "status", e.target.value, true)}
          disabled={converted}
          style={{
            fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: "none",
            cursor: converted ? "default" : "pointer",
            color: getStatus(l.status).color, background: getStatus(l.status).bg,
          }}
        >
          {statuses.filter((s) => s.value !== "converted" || converted).map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      );
      case "priority": return priorityButton(l, "list");
      case "tags": return (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {tagsButton(l, "list")}
          {(l.tags || []).map((t) => (
            <span key={t} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: getTagColor(t), color: "#fff" }}>{t}</span>
          ))}
        </div>
      );
      case "landingDate": return (
        <input
          type="date" value={l.landingDate || ""}
          onChange={(e) => updateLeadField(l.id, "landingDate", e.target.value, true)}
          style={{ fontSize: 12, padding: "3px 6px" }}
        />
      );
      case "nextFollowUpDate": return (
        <>
          <input
            type="date" value={l.nextFollowUpDate || ""}
            onChange={(e) => updateLeadField(l.id, "nextFollowUpDate", e.target.value, true)}
            disabled={converted}
            style={{
              fontSize: 12, padding: "3px 6px", borderRadius: 4,
              ...(isOverdue(l) ? { border: "1px solid #dc2626", background: "#fee2e2" }
                : isDueToday(l) ? { border: "1px solid #d97706", background: "#fef3c7" } : {}),
            }}
          />
          {dueBadge(l)}
        </>
      );
      case "location": return l.location || "—";
      case "address": return l.address || "—";
      case "notes": return l.notes
        ? <span style={{ display: "inline-block", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.notes}>{l.notes}</span>
        : "—";
      case "createdAt": return fmtDateTime(l.createdAt);
      case "latestComment": return latestCommentLine(l, true);
      default: return null;
    }
  };

  // A column header with a ClickUp-style sort toggle (⇕ idle, ▲/▼ once this
  // column is the active sort) and a drag handle (⠿) to reorder columns
  // directly in the table, same drag source/target as Manage Columns' rows.
  const columnHeader = (c) => {
    const meta = ALL_LEAD_COLUMNS.find((m) => m.key === c.key);
    const active = sortField === c.key;
    return (
      <th key={c.key} {...columnDropTargetProps(c.key)} style={{ textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {c.key !== "name" && (
            <span {...columnDragSourceProps(c.key)} title="Drag to reorder" style={{ color: "#c1c7d0", cursor: "grab", fontSize: 13, userSelect: "none", flexShrink: 0 }}>⠿</span>
          )}
          <button
            onClick={() => toggleSort(c.key)}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, color: active ? "#111827" : "inherit", cursor: "pointer" }}
          >
            {meta?.label || c.key}
            <span style={{ fontSize: 11, color: active ? "#2563eb" : "#c1c7d0" }}>{active ? (sortDir === "asc" ? "▲" : "▼") : "⇕"}</span>
          </button>
        </div>
      </th>
    );
  };

  return (
    <div className="page-card" style={{ minHeight: "calc(100vh - 62px)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Leads</h2>
        <span style={{ color: "#6b7280", fontSize: 13 }}>
          Every enquiry received — Facebook, Instagram, Google Ads, Reference, Walk-in or elsewhere. A lead only becomes a Project once you Convert it.
        </span>
      </div>

      {/* ── View Tabs ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderBottom: "2px solid #e5e7eb", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap" }}>
          {views.map((v) => {
            const active = v.id === activeViewId;
            const vFilterCount = (v.filters || []).length;
            return (
              <div
                key={v.id}
                onClick={() => setActiveViewId(v.id)}
                onDoubleClick={() => !v.builtin && startRenameView(v)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", cursor: "pointer",
                  borderBottom: active ? "3px solid #2563eb" : "3px solid transparent",
                  color: active ? "#2563eb" : "#374151", fontWeight: active ? 700 : 500, fontSize: 13, marginBottom: -2,
                }}
                title={v.builtin ? v.name : "Double-click to rename"}
              >
                {v.type === "board" ? "▦" : "📋"}
                {renamingViewId === v.id ? (
                  <input
                    autoFocus value={renameDraft} onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={saveRenameView}
                    onKeyDown={(e) => { if (e.key === "Enter") saveRenameView(); if (e.key === "Escape") setRenamingViewId(null); }}
                    style={{ fontSize: 13, padding: "1px 4px", width: 100 }}
                  />
                ) : (
                  <span>{v.name}{vFilterCount > 0 ? ` (${vFilterCount})` : ""}</span>
                )}
                {!v.builtin && active && confirmDeleteViewId !== v.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteViewId(v.id); }}
                    style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 12, marginLeft: 2, padding: 0, cursor: "pointer" }}
                    title="Delete view"
                  >✕</button>
                )}
                {confirmDeleteViewId === v.id && (
                  <span style={{ display: "flex", gap: 4, marginLeft: 4 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => deleteView(v.id)} style={{ background: "#dc2626", padding: "2px 6px", fontSize: 10 }}>Delete</button>
                    <button onClick={() => setConfirmDeleteViewId(null)} style={{ background: "#6b7280", padding: "2px 6px", fontSize: 10 }}>Cancel</button>
                  </span>
                )}
              </div>
            );
          })}
          {addViewOpen ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", marginBottom: 2 }} onClick={(e) => e.stopPropagation()}>
              <input autoFocus value={newViewName} onChange={(e) => setNewViewName(e.target.value)} placeholder="View name" style={{ fontSize: 12, padding: "3px 6px", width: 110 }} />
              <select value={newViewType} onChange={(e) => setNewViewType(e.target.value)} style={{ fontSize: 12, padding: "3px 4px" }}>
                <option value="list">List</option>
                <option value="board">Board</option>
              </select>
              <button onClick={addView} style={{ background: "#2563eb", padding: "3px 8px", fontSize: 12 }}>Add</button>
              <button onClick={() => setAddViewOpen(false)} style={{ background: "#6b7280", padding: "3px 8px", fontSize: 12 }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAddViewOpen(true)} style={{ background: "none", color: "#2563eb", border: "none", cursor: "pointer", fontSize: 13, padding: "7px 10px", marginBottom: 2 }}>
              + View
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <button onClick={openAdd} style={{ background: "#2563eb", padding: "6px 14px", fontSize: 13 }}>
            + New Lead
          </button>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setFilterPanelOpen((o) => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 6,
                background: filterCount > 0 ? "#dbeafe" : "#f3f4f6", color: filterCount > 0 ? "#1d4ed8" : "#374151", border: "1px solid #e5e7eb",
              }}
            >
              ⏷ Filter{filterCount > 0 ? ` (${filterCount})` : ""}
            </button>

            {filterPanelOpen && (
              <>
                <div onClick={() => setFilterPanelOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 999 }} />
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, width: 520, maxWidth: "90vw", zIndex: 1000, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Filters — {activeView.name}</div>
                  {(activeView.filters || []).length === 0 && (
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>No filters — showing every lead in this view.</div>
                  )}
                  {(activeView.filters || []).map((f, i) => (
                    <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", width: 48, flexShrink: 0 }}>{i === 0 ? "Where" : "AND"}</span>
                      <select
                        value={f.field}
                        onChange={(e) => updateFilterRow(f.id, { field: e.target.value, value: fieldOptions(e.target.value)[0]?.value || "" })}
                        style={{ fontSize: 13, padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db", minWidth: 130, flex: "1 1 130px" }}
                      >
                        {filterFields.map((ff) => <option key={ff.value} value={ff.value}>{ff.label}</option>)}
                      </select>
                      <select
                        value={f.op}
                        onChange={(e) => updateFilterRow(f.id, { op: e.target.value })}
                        style={{ fontSize: 13, padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db", flex: "0 0 90px" }}
                      >
                        <option value="is">Is</option>
                        <option value="isNot">Is not</option>
                      </select>
                      <select
                        value={f.value}
                        onChange={(e) => updateFilterRow(f.id, { value: e.target.value })}
                        style={{ fontSize: 13, padding: "7px 10px", borderRadius: 6, border: "1px solid #d1d5db", minWidth: 150, flex: "1 1 150px" }}
                      >
                        {fieldOptions(f.field).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button
                        onClick={() => removeFilterRow(f.id)}
                        style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 15, padding: 4, flexShrink: 0 }}
                        title="Remove filter"
                      >🗑</button>
                    </div>
                  ))}
                  <button onClick={addFilterRow} style={{ background: "none", color: "#2563eb", border: "none", cursor: "pointer", fontSize: 13, padding: "6px 0", fontWeight: 600 }}>
                    + Add filter
                  </button>
                  {(activeView.filters || []).length > 0 && (
                    <div style={{ textAlign: "right", marginTop: 12, borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
                      <button onClick={clearAllFilters} style={{ background: "none", color: "#dc2626", border: "none", cursor: "pointer", fontSize: 13 }}>Clear all</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={toggleShowClosed}
            title="Quickly show closed leads"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              border: activeView.showClosed ? "1px solid #1d4ed8" : "1px solid #d1d5db",
              background: activeView.showClosed ? "#2563eb" : "#fff",
              color: activeView.showClosed ? "#fff" : "#6b7280",
              fontSize: 14, boxShadow: "0 1px 2px rgba(0,0,0,0.08)", cursor: "pointer", position: "relative",
            }}
          >
            ✓
            {closedCount > 0 && (
              <span style={{ position: "absolute", top: -5, right: -5, background: activeView.showClosed ? "#1e40af" : "#6b7280", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "1px 4px", lineHeight: 1.4 }}>
                {closedCount}
              </span>
            )}
          </button>

          <div style={{ position: "relative" }}>
            <button
              onClick={() => setSettingsMenuOpen((o) => !o)}
              title="Leads settings"
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 6, background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb" }}
            >
              ⚙
            </button>
            {settingsMenuOpen && (
              <>
                <div onClick={() => setSettingsMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 999 }} />
                <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, width: 180, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 8px 20px rgba(0,0,0,0.18)", zIndex: 1000, overflow: "hidden" }}>
                  <button
                    onClick={() => { setSettingsMenuOpen(false); openStatusSettings(); }}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "#111827" }}
                  >
                    Manage Status
                  </button>
                  {activeView.type === "list" && (
                    <button
                      onClick={() => { setSettingsMenuOpen(false); setColumnsModalOpen(true); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 13, background: "none", border: "none", borderTop: "1px solid #f1f5f9", cursor: "pointer", color: "#111827" }}
                    >
                      Manage Columns
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Overdue/Due Today quick shortcuts — jump straight to a one-off
          filtered look without touching the active view's saved filters. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: "#9ca3af", alignSelf: "center" }}>Quick add filter:</span>
        <button
          disabled={overdueCount === 0}
          onClick={() => updateActiveViewFilters([...(activeView.filters || []), { id: Date.now(), field: "followUp", op: "is", value: "overdue" }])}
          style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: "1px solid #fecaca", color: overdueCount === 0 ? "#d1d5db" : "#b91c1c", background: "#fee2e2", cursor: overdueCount === 0 ? "default" : "pointer" }}
        >
          Overdue{overdueCount > 0 ? ` (${overdueCount})` : ""}
        </button>
        <button
          disabled={dueTodayCount === 0}
          onClick={() => updateActiveViewFilters([...(activeView.filters || []), { id: Date.now(), field: "followUp", op: "is", value: "dueToday" }])}
          style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: "1px solid #fde68a", color: dueTodayCount === 0 ? "#d1d5db" : "#b45309", background: "#fef3c7", cursor: dueTodayCount === 0 ? "default" : "pointer" }}
        >
          Due Today{dueTodayCount > 0 ? ` (${dueTodayCount})` : ""}
        </button>
      </div>

      {activeView.type === "board" ? (
        <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
          {statuses.map((col) => {
            const colLeads = sorted.filter((l) => (l.status || DEFAULT_LEAD_STATUS) === col.value);
            return (
              <div key={col.value} style={{ minWidth: 260, flex: "0 0 260px", background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20, color: col.color, background: col.bg }}>{col.label}</span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{colLeads.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {colLeads.map((l) => (
                    <div key={l.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
                      <div>{leadName(l)}</div>
                      {l.contact && <div style={{ fontSize: 11, color: "#6b7280" }}>📞 {l.contact}</div>}
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{leadSourceLabel(l.source) || "—"}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }} onClick={(e) => e.stopPropagation()}>
                        <span style={{ fontSize: 12 }}>📅</span>
                        <input
                          type="date"
                          value={l.nextFollowUpDate || ""}
                          onChange={(e) => updateLeadField(l.id, "nextFollowUpDate", e.target.value, true)}
                          style={{
                            fontSize: 11, padding: "2px 4px", border: "1px solid #e5e7eb", borderRadius: 4,
                            color: isOverdue(l) ? "#dc2626" : isDueToday(l) ? "#b45309" : "#374151",
                            fontWeight: isOverdue(l) || isDueToday(l) ? 700 : 400,
                          }}
                        />
                      </div>
                      {latestCommentLine(l)}
                      {tagPills(l)}
                      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                        {priorityButton(l)}
                        {tagsButton(l)}
                      </div>
                    </div>
                  ))}
                  {colLeads.length === 0 && <div style={{ fontSize: 11, color: "#d1d5db", textAlign: "center", padding: "10px 0" }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <table border="1" cellPadding="10" cellSpacing="0" width="100%">
          <thead>
            <tr>
              {visibleColumns.map((c) => columnHeader(c))}
            </tr>
          </thead>
          <tbody>
            {sorted.length > 0 ? (
              sorted.map((l) => (
                <tr key={l.id}>
                  {visibleColumns.map((c) => <td key={c.key}>{renderLeadCell(l, c.key)}</td>)}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={visibleColumns.length}>
                  {leads.length === 0
                    ? 'No leads yet — add one with "+ New Lead" above.'
                    : "No leads match this view's filters."}
                  {filterCount > 0 && leads.length > 0 && (
                    <button onClick={clearAllFilters} style={{ marginLeft: 10, fontSize: 12, background: "none", color: "#2563eb", border: "none", cursor: "pointer" }}>
                      Clear filters
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* ── New Lead — a lightweight create form (Save/Cancel kept here since
          there's no lead id yet to auto-save against; validation runs before
          it's created). Editing an existing lead uses the full-screen Lead
          Detail screen below instead, which auto-saves every field. ── */}
      {modalOpen && !editId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 420, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <h3 style={{ margin: 0 }}>New Lead</h3>
              <button onClick={closeLeadModal} title="Close" style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 18, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>✕</button>
            </div>
            {error && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 10 }}>{error}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Name *</label>
                <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ramesh Kumar" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Contact Number *</label>
                <input
                  type="tel" inputMode="numeric" value={form.contact}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) }))}
                  placeholder="10-digit mobile number" style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Email ID</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="client@email.com" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Lead Source</label>
                <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} style={inputStyle}>
                  <option value="">— Select —</option>
                  {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {form.source === "reference" && (
                <div>
                  <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Referred By</label>
                  <input value={form.referredBy} onChange={(e) => setForm((f) => ({ ...f, referredBy: e.target.value }))} placeholder="e.g. Suresh (past client)" style={inputStyle} />
                </div>
              )}
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>City / Location</label>
                <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Hyderabad" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Full Address</label>
                <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="e.g. Plot 12, Jubilee Hills, Hyderabad 500033" style={inputStyle} />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Landing Date</label>
                  <input type="date" value={form.landingDate} onChange={(e) => setForm((f) => ({ ...f, landingDate: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Next Update</label>
                  <input type="date" value={form.nextFollowUpDate} onChange={(e) => setForm((f) => ({ ...f, nextFollowUpDate: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 4 }}>Notes</label>
                <textarea
                  value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Budget range, requirements, anything worth remembering..."
                  rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={closeLeadModal} style={{ background: "#6b7280" }}>Cancel</button>
              <button onClick={saveLead} style={{ background: "#2563eb" }}>Add Lead</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lead Detail — a large ClickUp-style task panel (not edge-to-edge:
          sits over a dimmed backdrop, same as the Status Settings/New Lead
          modals, just much bigger). Every field auto-saves the instant it
          changes (via updateLeadField/onBlurLog) — no Save/Cancel, since
          there's nothing left to discard. Fields live on the left in a
          ClickUp-style 2-pairs-per-row grid; Activity (auto-logged field
          changes interleaved with the user's own comments) on the right. ── */}
      {modalOpen && editId && (() => {
        const openLead = leads.find((l) => l.id === editId);
        if (!openLead) return null;
        const converted = openLead.status === "converted";
        const blurLog = onBlurLog(editId);
        return (
          <div onClick={closeLeadModal} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "min(1200px, 96vw)", height: "90vh", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
              <input
                value={openLead.name}
                onFocus={(e) => onFieldFocus("name", e.target.value)}
                onChange={(e) => updateLeadField(editId, "name", e.target.value)}
                onBlur={blurLog("name")}
                placeholder="Lead name"
                style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 700, border: "none", outline: "none", padding: "4px 0", fontFamily: "inherit", color: "#111827" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => updateLeadField(editId, "closed", !openLead.closed, true)}
                  title={openLead.closed ? "This lead is closed — click to reopen it" : "Hide this lead from the table by default (still visible via the ✓ show-closed toggle)"}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 20,
                    border: openLead.closed ? "1px solid #047857" : "1px solid #d1d5db",
                    background: openLead.closed ? "#d1fae5" : "#f9fafb",
                    color: openLead.closed ? "#047857" : "#6b7280",
                    cursor: "pointer",
                  }}
                >
                  {openLead.closed ? "✓ Closed — Reopen" : "Mark as Closed"}
                </button>
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => { setLeadMenuOpen((o) => !o); setConfirmDeleteInModal(false); }}
                    title="More options"
                    style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, width: 28, height: 28, fontSize: 16, color: "#6b7280", cursor: "pointer" }}
                  >
                    ⋯
                  </button>
                  {leadMenuOpen && (
                    <>
                      <div
                        onClick={() => { setLeadMenuOpen(false); setConfirmDeleteInModal(false); }}
                        style={{ position: "fixed", inset: 0, zIndex: 1799 }}
                      />
                      <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, width: 190, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 8px 20px rgba(0,0,0,0.18)", zIndex: 1800, overflow: "hidden" }}>
                        {!confirmDeleteInModal ? (
                          <>
                            {converted ? (
                              <Link
                                to={`/interior/projects?id=${openLead.convertedProjectId}`}
                                onClick={() => setLeadMenuOpen(false)}
                                style={{ display: "block", padding: "9px 14px", fontSize: 13, color: "#059669", textDecoration: "none" }}
                              >
                                Open Project →
                              </Link>
                            ) : (
                              <button
                                onClick={() => { setLeadMenuOpen(false); convertToProject(openLead); }}
                                style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "#059669" }}
                              >
                                Convert to Project
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmDeleteInModal(true)}
                              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", fontSize: 13, background: "none", border: "none", borderTop: "1px solid #f1f5f9", cursor: "pointer", color: "#dc2626" }}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <div style={{ padding: "10px 14px" }}>
                            <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>Delete this lead?</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                onClick={() => { deleteLead(editId); setLeadMenuOpen(false); setConfirmDeleteInModal(false); setModalOpen(false); }}
                                style={{ background: "#dc2626", fontSize: 11, padding: "3px 10px" }}
                              >Yes</button>
                              <button onClick={() => setConfirmDeleteInModal(false)} style={{ background: "#6b7280", fontSize: 11, padding: "3px 10px" }}>No</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button onClick={closeLeadModal} title="Close" style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 20, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>✕</button>
              </div>
            </div>

            <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
              <div style={{ flex: "1 1 60%", minWidth: 0, overflowY: "auto", padding: "22px 28px" }}>
                {error && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 14 }}>{error}</div>}

                <FieldRowPair>
                  <FieldPair label="Status">
                    <select
                      value={openLead.status || DEFAULT_LEAD_STATUS}
                      onChange={(e) => updateLeadField(editId, "status", e.target.value, true)}
                      disabled={converted}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 20, border: "none", width: "auto",
                        cursor: converted ? "default" : "pointer",
                        color: getStatus(openLead.status).color, background: getStatus(openLead.status).bg,
                      }}
                    >
                      {statuses.filter((s) => s.value !== "converted" || converted).map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </FieldPair>
                  <FieldPair label="Priority">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {priorityButton(openLead, "modal")}
                      <span style={{ fontSize: 13, color: priorityInfo(openLead.priority) ? priorityInfo(openLead.priority).color : "#9ca3af", fontWeight: 600 }}>
                        {priorityInfo(openLead.priority) ? priorityInfo(openLead.priority).label : "None"}
                      </span>
                    </div>
                  </FieldPair>
                </FieldRowPair>

                <FieldRowPair>
                  <FieldPair label="Lead Source">
                    <select value={openLead.source || ""} onChange={(e) => updateLeadField(editId, "source", e.target.value, true)} style={inputStyle}>
                      <option value="">— Select —</option>
                      {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </FieldPair>
                  <FieldPair label="Tags">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {tagsButton(openLead, "modal")}
                      {(openLead.tags || []).map((t) => (
                        <span key={t} style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: getTagColor(t), color: "#fff" }}>{t}</span>
                      ))}
                    </div>
                  </FieldPair>
                </FieldRowPair>

                {openLead.source === "reference" && (
                  <FieldRowPair>
                    <FieldPair label="Referred By">
                      <input
                        value={openLead.referredBy || ""}
                        onFocus={(e) => onFieldFocus("referredBy", e.target.value)}
                        onChange={(e) => updateLeadField(editId, "referredBy", e.target.value)}
                        onBlur={blurLog("referredBy")}
                        placeholder="e.g. Suresh (past client)" style={inputStyle}
                      />
                    </FieldPair>
                    <div style={{ flex: 1 }} />
                  </FieldRowPair>
                )}

                <FieldRowPair>
                  <FieldPair label="Landing Date">
                    <input type="date" value={openLead.landingDate || ""} onChange={(e) => updateLeadField(editId, "landingDate", e.target.value, true)} style={inputStyle} />
                  </FieldPair>
                  <FieldPair label="Next Update">
                    <input type="date" value={openLead.nextFollowUpDate || ""} onChange={(e) => updateLeadField(editId, "nextFollowUpDate", e.target.value, true)} disabled={converted} style={inputStyle} />
                  </FieldPair>
                </FieldRowPair>

                <FieldRowPair>
                  <FieldPair label="Contact Number">
                    <input
                      type="tel" inputMode="numeric" value={openLead.contact || ""}
                      onFocus={(e) => onFieldFocus("contact", e.target.value)}
                      onChange={(e) => updateLeadField(editId, "contact", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                      onBlur={blurLog("contact")}
                      placeholder="10-digit mobile number" style={inputStyle}
                    />
                  </FieldPair>
                  <FieldPair label="Email ID">
                    <input
                      type="email" value={openLead.email || ""}
                      onFocus={(e) => onFieldFocus("email", e.target.value)}
                      onChange={(e) => updateLeadField(editId, "email", e.target.value)}
                      onBlur={blurLog("email")}
                      placeholder="client@email.com" style={inputStyle}
                    />
                  </FieldPair>
                </FieldRowPair>

                <FieldRowPair>
                  <FieldPair label="City / Location">
                    <input
                      value={openLead.location || ""}
                      onFocus={(e) => onFieldFocus("location", e.target.value)}
                      onChange={(e) => updateLeadField(editId, "location", e.target.value)}
                      onBlur={blurLog("location")}
                      placeholder="e.g. Hyderabad" style={inputStyle}
                    />
                  </FieldPair>
                  <FieldPair label="Full Address">
                    <input
                      value={openLead.address || ""}
                      onFocus={(e) => onFieldFocus("address", e.target.value)}
                      onChange={(e) => updateLeadField(editId, "address", e.target.value)}
                      onBlur={blurLog("address")}
                      placeholder="e.g. Plot 12, Jubilee Hills, Hyderabad 500033" style={inputStyle}
                    />
                  </FieldPair>
                </FieldRowPair>

                <FieldBlock label="Notes">
                  <textarea
                    value={openLead.notes || ""}
                    onFocus={(e) => onFieldFocus("notes", e.target.value)}
                    onChange={(e) => updateLeadField(editId, "notes", e.target.value)}
                    onBlur={blurLog("notes")}
                    placeholder="Budget range, requirements, anything worth remembering..."
                    rows={5} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  />
                </FieldBlock>
              </div>

              <div style={{ flex: "0 0 360px", borderLeft: "1px solid #e5e7eb", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
                  {activitySearchOpen ? (
                    <>
                      <input
                        autoFocus value={activitySearchQuery} onChange={(e) => setActivitySearchQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") { setActivitySearchOpen(false); setActivitySearchQuery(""); } }}
                        placeholder="Search activity..."
                        style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "4px 8px" }}
                      />
                      <button
                        onClick={() => { setActivitySearchOpen(false); setActivitySearchQuery(""); }}
                        title="Close search"
                        style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 16, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                      >✕</button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>Activity</div>
                      <button
                        onClick={() => setActivitySearchOpen(true)}
                        title="Search activity"
                        style={{ background: "none", border: "none", color: "#6b7280", fontSize: 14, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}
                      >🔍</button>
                    </>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
                  {(() => {
                    const q = activitySearchQuery.trim().toLowerCase();
                    const entries = (openLead.comments || []).filter((c) => !q || c.text.toLowerCase().includes(q));
                    const showCreatedLine = !q || "lead created".includes(q);
                    return (
                      <>
                        {showCreatedLine && (
                          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>
                            Lead created {fmtDateTime(openLead.createdAt)}
                          </div>
                        )}
                        {q && !showCreatedLine && entries.length === 0 && (
                          <div style={{ fontSize: 12, color: "#d1d5db" }}>No activity matches "{activitySearchQuery}".</div>
                        )}
                        {entries.map((c) =>
                          c.type === "system" ? (
                            <div key={c.id} style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>
                              {c.text} <span style={{ color: "#d1d5db" }}>· {fmtDateTime(c.createdAt)}</span>
                            </div>
                          ) : (
                            <div key={c.id} style={{ marginBottom: 12, background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: 8, padding: "8px 10px" }}>
                              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 3 }}>{fmtDateTime(c.createdAt)}</div>
                              <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{c.text}</div>
                            </div>
                          )
                        )}
                      </>
                    );
                  })()}
                </div>
                <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", flexShrink: 0 }}>
                  <textarea
                    value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && commentDraft.trim()) addComment(); }}
                    placeholder="Write a comment... (Ctrl+Enter to send)" rows={2}
                    style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13, padding: 8 }}
                  />
                  <button onClick={addComment} disabled={!commentDraft.trim()} style={{ marginTop: 6, background: "#2563eb", padding: "5px 14px", fontSize: 12 }}>
                    Comment
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>
        );
      })()}

      {/* ── Manage Columns — toggle which List-table columns show, and
          reorder them with ↑/↓. Lives on the active view (`view.columns`),
          same as its filters, so different views can show different columns. ── */}
      {columnsModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1600, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setColumnsModalOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 380, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h3 style={{ margin: 0 }}>Manage Columns</h3>
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4, marginBottom: 0 }}>
                  Toggle a column on to add it to the table, or use ↑/↓ to reorder.
                </p>
              </div>
              <button onClick={() => setColumnsModalOpen(false)} title="Close" style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
              {viewColumns.map((c, i) => {
                const meta = ALL_LEAD_COLUMNS.find((m) => m.key === c.key);
                return (
                  <div
                    key={c.key}
                    {...columnDropTargetProps(c.key)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}
                  >
                    <span
                      {...columnDragSourceProps(c.key)}
                      title={c.key === "name" ? undefined : "Drag to reorder"}
                      style={{ width: 14, flexShrink: 0, color: c.key === "name" ? "#e5e7eb" : "#9ca3af", cursor: c.key === "name" ? "default" : "grab", fontSize: 14, userSelect: "none" }}
                    >⠿</span>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, fontSize: 13, cursor: c.key === "name" ? "default" : "pointer", color: c.key === "name" ? "#9ca3af" : "#111827" }}>
                      {/* The app's global `input { width: 100% }` rule would otherwise
                          stretch this checkbox to fill the label, shoving its text far
                          to the right — pin it back to its natural size. */}
                      <input type="checkbox" checked={c.visible} disabled={c.key === "name"} onChange={() => toggleColumn(c.key)} style={{ width: 16, height: 16, flexShrink: 0, padding: 0 }} />
                      <span>{meta?.label || c.key}{c.key === "name" && " (always shown)"}</span>
                    </label>
                    <button onClick={() => moveColumn(c.key, -1)} disabled={i === 0} style={{ background: "none", border: "1px solid #e5e7eb", padding: "3px 7px", fontSize: 11, color: "#6b7280", flexShrink: 0 }}>↑</button>
                    <button onClick={() => moveColumn(c.key, 1)} disabled={i === viewColumns.length - 1} style={{ background: "none", border: "1px solid #e5e7eb", padding: "3px 7px", fontSize: 11, color: "#6b7280", flexShrink: 0 }}>↓</button>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
              <button onClick={() => setColumnsModalOpen(false)} style={{ background: "#2563eb" }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Status Settings — ClickUp-style Active/Done groups, staged in
          statusDraft until Save. ── */}
      {statusModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1600, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 460, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <h3 style={{ margin: 0 }}>Manage Lead Statuses</h3>
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4, marginBottom: 0 }}>
                  "Converted" can be renamed and recolored, but not deleted — Convert to Project depends on it.
                </p>
              </div>
              <button onClick={requestCloseStatusModal} title="Close" style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
            </div>

            {[
              { key: "active", title: "Active", newLabel: newActiveLabel, setNewLabel: setNewActiveLabel },
              { key: "done", title: "Done", newLabel: newDoneLabel, setNewLabel: setNewDoneLabel },
            ].map((group) => {
              const rows = statusDraft.filter((s) => (s.category || "active") === group.key);
              return (
                <div key={group.key} style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    {group.title}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {rows.map((s, i) => (
                      <div key={s.value} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          onClick={() => recolorStatus(s.value)}
                          title="Click to change color"
                          style={{ width: 24, height: 24, borderRadius: 6, background: s.bg, border: `2px solid ${s.color}`, cursor: "pointer", flexShrink: 0 }}
                        />
                        <input
                          value={s.label}
                          onChange={(e) => renameStatus(s.value, e.target.value)}
                          style={{ flex: 1, fontSize: 13, padding: "5px 8px" }}
                        />
                        <button onClick={() => moveStatus(s.value, -1)} disabled={i === 0} style={{ background: "none", border: "1px solid #e5e7eb", padding: "3px 7px", fontSize: 11, color: "#6b7280" }}>↑</button>
                        <button onClick={() => moveStatus(s.value, 1)} disabled={i === rows.length - 1} style={{ background: "none", border: "1px solid #e5e7eb", padding: "3px 7px", fontSize: 11, color: "#6b7280" }}>↓</button>
                        <button
                          onClick={() => moveStatusCategory(s.value)}
                          title={group.key === "active" ? "Move to Done" : "Move to Active"}
                          style={{ background: "none", border: "1px solid #e5e7eb", padding: "3px 7px", fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}
                        >
                          {group.key === "active" ? "→ Done" : "→ Active"}
                        </button>
                        <button
                          onClick={() => deleteStatus(s.value)}
                          disabled={s.value === "converted"}
                          title={s.value === "converted" ? "Convert to Project depends on this status — it can't be deleted" : "Delete status"}
                          style={{ background: "none", border: "none", color: s.value === "converted" ? "#e5e7eb" : "#dc2626", cursor: s.value === "converted" ? "default" : "pointer", fontSize: 14 }}
                        >🗑</button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8 }}>
                      <span
                        style={{ width: 24, height: 24, borderRadius: 6, background: STATUS_COLOR_PRESETS[newStatusColorIdx % STATUS_COLOR_PRESETS.length].bg, border: `2px solid ${STATUS_COLOR_PRESETS[newStatusColorIdx % STATUS_COLOR_PRESETS.length].color}`, flexShrink: 0 }}
                      />
                      <input
                        value={group.newLabel} onChange={(e) => group.setNewLabel(e.target.value)}
                        placeholder="Add status" style={{ flex: 1, fontSize: 13, padding: "5px 8px" }}
                        onKeyDown={(e) => { if (e.key === "Enter") { addDraftStatus(group.key, group.newLabel); group.setNewLabel(""); } }}
                      />
                      <button
                        onClick={() => { addDraftStatus(group.key, group.newLabel); group.setNewLabel(""); }}
                        style={{ background: "#2563eb", padding: "5px 12px", fontSize: 12 }}
                      >+ Add</button>
                    </div>
                  </div>
                </div>
              );
            })}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22, borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
              <button onClick={requestCloseStatusModal} style={{ background: "#6b7280" }}>Cancel</button>
              <button onClick={saveStatusSettings} disabled={!statusDirty} style={{ background: statusDirty ? "#2563eb" : "#93c5fd" }}>Save</button>
            </div>
          </div>

          {confirmCloseStatusModal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ background: "#fff", borderRadius: 10, padding: 20, width: 320, maxWidth: "90vw" }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Unsaved changes</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 18 }}>You've changed the status list. Save before closing?</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button onClick={() => setConfirmCloseStatusModal(false)} style={{ background: "#6b7280" }}>Go Back</button>
                  <button onClick={discardStatusModal} style={{ background: "#dc2626" }}>Discard</button>
                  <button onClick={saveStatusSettings} style={{ background: "#2563eb" }}>Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Leads;
