import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { projectList } from "../data/projectData";
import { subProjectList } from "../data/subProjectData";
import { dimensionEntries } from "../data/dimensionData";
import { priceList } from "../data/priceData";
import { templateList } from "../data/templateData";
import { fetchState, saveState } from "../utils/api";
import { syncCustomServices } from "../utils/services";
import { setKerfSettings } from "../utils/kerf";
import { setMaterialCalcSettings } from "../utils/materialCalc";
import { guardSetter, previewView } from "../utils/access";

const AppDataContext = createContext();

// Sample/seed data used only the very first time the MySQL app_state table
// has no rows yet (see server/schema.sql, which seeds empty defaults —
// these are the richer "demo project" fallbacks for a truly empty backend).
const defaultData = {
  projects: projectList,
  subProjects: subProjectList,
  dimensions: dimensionEntries,
  prices: priceList,
  materialModelRates: {},
  // Global Profit % dial per Economy/Standard/Premium tier — applied on top
  // of each material's base rate in Material Models, so it flows into every
  // rate saved to the template (and from there into every project's Quotation).
  materialModelProfitPercent: { economy: 0, standard: 0, premium: 0 },
  // "Master Bedroom" ships with every account so it's visible to all logins —
  // see templateData.js. Structural only (box dims, formulas, material names),
  // no pricing, so sharing it can't leak anyone's rates.
  templates: templateList,
  selectedTemplateId: "",
  materialStockSettings: {},
  kerfWidth: 0,
  // Account-wide business identity (name, logo, contact) — shown on printed
  // quotations. Separate from the per-project Company fields in Project
  // Quotation Settings, which can still override it for one quotation.
  companyProfile: {},
  // Configure > Design Gallery — an unlimited-depth tree of groups/sub-groups
  // (a group and a sub-group are the same shape: { id, name, images, children })
  // used to organize reference photos, which rooms then pick from to build a
  // Mood Board (see subProjects[i].moodBoard, which rides along inside the
  // existing subProjects field rather than needing its own default here).
  designGallery: [],
  // Enquiries received (Facebook, Instagram, Google Ads, Reference, Walk-in,
  // ...) before they're confirmed as real work — deliberately separate from
  // `projects`, which only gains an entry once a lead is explicitly converted
  // via "Convert to Project" on the Leads page. See leadStatus.js for the
  // shape of a lead entry and its status values.
  leads: [],
  // Saved Leads views (List/Board tabs with their own filters) — see
  // Leads.jsx's DEFAULT_LEAD_VIEWS for the one built-in "All Leads" view
  // every account starts with.
  leadViews: null,
  // Customizable lead pipeline statuses — see Leads.jsx's DEFAULT_LEAD_STATUSES
  // (leadStatus.js) for the built-in starter set every account begins with.
  leadStatuses: null,
  // { [tagName]: "#hex" } — a tag not in here falls back to leadPriority.js's
  // hash-based tagColor(), so existing tags keep working unchanged until the
  // user explicitly recolors one via the Tags popover's gear icon.
  leadTagColors: null,
  // Teams page — people the business works with (carpenters, designers,
  // site supervisors...). Plain contact records: { id, name, role, phone,
  // email, createdAt } — not login accounts.
  teamMembers: [],
  // Templates page folders — a tree via parentId (null = top level):
  // { id, name, parentId }. A template sits in a folder via its own
  // `folderId` (missing/null = top level), so existing templates need no migration.
  templateFolders: [],
};

// Debounce writes to the API so fast typing (a text input, a number field)
// doesn't fire a POST per keystroke — same effect localStorage's synchronous
// write gave us for free, reimplemented for a network call.
const SAVE_DEBOUNCE_MS = 800;

function AppDataProvider({ children }) {
  const [projects, setProjectsRaw] = useState(defaultData.projects);
  const [subProjects, setSubProjectsRaw] = useState(defaultData.subProjects);
  const [dimensions, setDimensionsRaw] = useState(defaultData.dimensions);
  const [prices, setPricesRaw] = useState(defaultData.prices);
  const [materialModelRates, setMaterialModelRatesRaw] = useState(defaultData.materialModelRates);
  const [materialModelProfitPercent, setMaterialModelProfitPercentRaw] = useState(defaultData.materialModelProfitPercent);
  const [templates, setTemplatesRaw] = useState(defaultData.templates);
  const [selectedTemplateId, setSelectedTemplateIdRaw] = useState(defaultData.selectedTemplateId);
  const [materialStockSettings, setMaterialStockSettingsRaw] = useState(defaultData.materialStockSettings);
  const [kerfWidth, setKerfWidthRaw] = useState(defaultData.kerfWidth);
  const [companyProfile, setCompanyProfileRaw] = useState(defaultData.companyProfile);
  // Services the account added (companyProfile.customServices) join the
  // built-in ones in the shared registry before any child renders. Kept inside
  // companyProfile so no new top-level key (and no backend change) is needed.
  syncCustomServices(companyProfile?.customServices, companyProfile?.wardrobeName, companyProfile?.wardrobeHidden);
  // Same for the saw-blade kerf: App Settings value + whether projects share it.
  setKerfSettings(kerfWidth, companyProfile?.kerfUniversal);
  setMaterialCalcSettings(companyProfile);
  const [designGallery, setDesignGalleryRaw] = useState(defaultData.designGallery);
  const [leads, setLeadsRaw] = useState(defaultData.leads);
  const [leadViews, setLeadViewsRaw] = useState(defaultData.leadViews);
  const [leadStatuses, setLeadStatusesRaw] = useState(defaultData.leadStatuses);
  const [leadTagColors, setLeadTagColorsRaw] = useState(defaultData.leadTagColors);
  const [teamMembers, setTeamMembersRaw] = useState(defaultData.teamMembers);
  const [templateFolders, setTemplateFoldersRaw] = useState(defaultData.templateFolders);

  // An employee gets setters that refuse changes their group doesn't allow (see
  // utils/access.js — the server enforces the same rules); the owner's are the
  // plain React setters.
  const { user, impersonation } = useAuth();
  const access = user?.access;
  const accessKey = JSON.stringify(access ?? null);
  // The owner previewing another person's view: nothing may change or be saved.
  const previewing = !!impersonation;
  const previewRef = useRef(false);
  previewRef.current = previewing;
  const guardedRaw = useMemo(() => ({
    setProjects: guardSetter(access, "projects", setProjectsRaw),
    setSubProjects: guardSetter(access, "subProjects", setSubProjectsRaw),
    setDimensions: guardSetter(access, "dimensions", setDimensionsRaw),
    setPrices: guardSetter(access, "prices", setPricesRaw),
    setMaterialModelRates: guardSetter(access, "materialModelRates", setMaterialModelRatesRaw),
    setMaterialModelProfitPercent: guardSetter(access, "materialModelProfitPercent", setMaterialModelProfitPercentRaw),
    setTemplates: guardSetter(access, "templates", setTemplatesRaw),
    setSelectedTemplateId: guardSetter(access, "selectedTemplateId", setSelectedTemplateIdRaw),
    setMaterialStockSettings: guardSetter(access, "materialStockSettings", setMaterialStockSettingsRaw),
    setKerfWidth: guardSetter(access, "kerfWidth", setKerfWidthRaw),
    setCompanyProfile: guardSetter(access, "companyProfile", setCompanyProfileRaw),
    setDesignGallery: guardSetter(access, "designGallery", setDesignGalleryRaw),
    setLeads: guardSetter(access, "leads", setLeadsRaw),
    setLeadViews: guardSetter(access, "leadViews", setLeadViewsRaw),
    setLeadStatuses: guardSetter(access, "leadStatuses", setLeadStatusesRaw),
    setLeadTagColors: guardSetter(access, "leadTagColors", setLeadTagColorsRaw),
    setTeamMembers: guardSetter(access, "teamMembers", setTeamMembersRaw),
    setTemplateFolders: guardSetter(access, "templateFolders", setTemplateFoldersRaw),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [accessKey]);
  const guarded = useMemo(() => {
    if (!previewing) return guardedRaw;
    const noop = () => {};
    return Object.fromEntries(Object.keys(guardedRaw).map((k) => [k, noop]));
  }, [guardedRaw, previewing]);
  const {
    setProjects, setSubProjects, setDimensions, setPrices, setMaterialModelRates, setMaterialModelProfitPercent, setTemplates, setSelectedTemplateId, setMaterialStockSettings, setKerfWidth, setCompanyProfile, setDesignGallery, setLeads, setLeadViews, setLeadStatuses, setLeadTagColors, setTeamMembers, setTemplateFolders,
  } = guarded;
  // Keys the server refused on the last save (employees only).
  const [deniedKeys, setDeniedKeys] = useState([]);

  // Gates the very first render (before the API has responded) and stops
  // the save effect from firing on the initial default state — otherwise
  // every fresh page load would immediately overwrite the server's real
  // data with the seed/demo defaults above.
  //
  // isLoaded must ONLY become true after a load that actually succeeded (or
  // legitimately found nothing, for isNew). If the GET fails, `projects` etc.
  // are still sitting at their useState() seed defaults — arming autosave at
  // that point would silently POST those seed defaults over the user's real
  // saved workspace ~800ms later. So a failed load leaves isLoaded false for
  // the rest of this session: autosave stays disabled and the user has to
  // refresh (and get a successful load) rather than risk losing real data.
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const saveTimer = useRef(null);
  // Save bookkeeping. `latestRef` is always the newest workspace snapshot;
  // `dirtyRef` means "there are changes the server doesn't have yet" (a
  // timer waiting, a request in flight, or a failed request); `inFlightRef`
  // holds the running save's promise so saves never overlap (two POSTs racing
  // could land out of order and overwrite newer data with older).
  const latestRef = useRef(null);
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(null);
  const queuedRef = useRef(false);
  const immediateRef = useRef(false);
  const firstRunRef = useRef(true);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | pending | saving | saved | error

  // ── Initial load from MySQL (per-user, via /api/interior_state.php) ─────
  useEffect(() => {
    let cancelled = false;
    fetchState()
      .then(({ data, isNew }) => {
        if (cancelled) return;

        // A brand-new account has nothing saved — keep the seed/sample data
        // already in state so the tool opens with something to explore. The
        // first edit persists it as that user's own workspace. Safe to arm
        // autosave here: there is nothing real on the server yet to lose.
        if (isNew) {
          setIsLoaded(true);
          return;
        }

        // An existing account gets exactly what it saved, empty lists
        // included — otherwise deleting every project would silently bring
        // the sample data back on the next reload.
        setProjectsRaw(data.projects || []);
        setSubProjectsRaw(data.subProjects || []);
        setDimensionsRaw(data.dimensions || []);
        setPricesRaw(data.prices || []);
        setMaterialModelRatesRaw(data.materialModelRates || {});
        setMaterialModelProfitPercentRaw(data.materialModelProfitPercent || defaultData.materialModelProfitPercent);
        setTemplatesRaw(data.templates || []);
        setSelectedTemplateIdRaw(data.selectedTemplateId || "");
        setMaterialStockSettingsRaw(data.materialStockSettings || {});
        setKerfWidthRaw(data.kerfWidth ?? 0);
        setCompanyProfileRaw(data.companyProfile || {});
        setDesignGalleryRaw(data.designGallery || []);
        setLeadsRaw(data.leads || []);
        setLeadViewsRaw(data.leadViews || null);
        setLeadStatusesRaw(data.leadStatuses || null);
        setLeadTagColorsRaw(data.leadTagColors || null);
        setTeamMembersRaw(data.teamMembers || []);
        setTemplateFoldersRaw(data.templateFolders || []);
        // Only now does state genuinely reflect the server — safe to arm autosave.
        setIsLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load app state from server:", err);
        setLoadError(err.message);
        // Deliberately do NOT setIsLoaded(true) here — see comment above.
        // Autosave stays disabled for the rest of this session on a failed load.
      });
    return () => { cancelled = true; };
  }, []);

  // ── Save to MySQL (via /api/interior_state.php) ──────────────────────────
  // Writes the newest snapshot, then again if more changes landed meanwhile.
  const runSave = useCallback(() => {
    if (previewRef.current) return Promise.resolve();
    if (inFlightRef.current) { queuedRef.current = true; return inFlightRef.current; }
    const job = (async () => {
      try {
        for (;;) {
          queuedRef.current = false;
          const snapshot = latestRef.current;
          setSaveStatus("saving");
          const result = await saveState(snapshot);
          setDeniedKeys(result && Array.isArray(result.denied) ? result.denied : []);
          setSaveError(null);
          if (latestRef.current === snapshot) dirtyRef.current = false;
          if (!queuedRef.current && latestRef.current === snapshot) break;
        }
        setSaveStatus("saved");
      } catch (err) {
        console.error("Failed to save app state to server:", err);
        setSaveError(err.message);
        setSaveStatus("error");
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = job;
    return job;
  }, []);

  // Debounced: every change re-arms a short timer, so typing doesn't POST the
  // whole workspace per keystroke. requestImmediateSave() (the template Save
  // button) makes the very next write skip the wait.
  useEffect(() => {
    if (!isLoaded) return undefined; // don't save until the initial load has landed

    const dataToSave = {
      projects,
      subProjects,
      dimensions,
      prices,
      materialModelRates,
      materialModelProfitPercent,
      templates,
      selectedTemplateId,
      materialStockSettings,
      kerfWidth,
      companyProfile,
      designGallery,
      leads,
      leadViews,
      leadStatuses,
      leadTagColors,
      teamMembers,
      templateFolders,
    };
    latestRef.current = dataToSave;

    // The first run after the initial load is just the loaded data arriving —
    // nothing the server doesn't already have, so nothing to write or warn about.
    if (firstRunRef.current) { firstRunRef.current = false; return undefined; }

    dirtyRef.current = true;
    setSaveStatus((s) => (s === "saving" ? s : "pending"));
    const delay = immediateRef.current ? 0 : SAVE_DEBOUNCE_MS;
    immediateRef.current = false;
    saveTimer.current = setTimeout(() => { if (dirtyRef.current) runSave(); }, delay);

    return () => clearTimeout(saveTimer.current);
  }, [
    isLoaded,
    projects,
    subProjects,
    dimensions,
    prices,
    materialModelRates,
    materialModelProfitPercent,
    templates,
    selectedTemplateId,
    materialStockSettings,
    kerfWidth,
    companyProfile,
    designGallery,
    leads,
    leadViews,
    leadStatuses,
    leadTagColors,
    teamMembers,
    templateFolders,
  ]);

  // Leaving the Interior area (e.g. "Back to Preinvesto") unmounts this
  // provider — write any waiting change then, instead of letting the debounce
  // timer die with it.
  useEffect(() => () => { if (dirtyRef.current) runSave(); }, [runSave]);

  // Closing/refreshing the tab with a change still waiting or being written
  // would lose it — the browser can't finish a request this size during
  // unload — so ask first.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirtyRef.current || inFlightRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const requestImmediateSave = useCallback(() => { immediateRef.current = true; }, []);
  const retrySave = useCallback(() => { dirtyRef.current = true; return runSave(); }, [runSave]);
  // Resolves once everything pending is on the server — callers about to end
  // the session (sign out) await this so the last edits aren't lost.
  const flushPendingSave = useCallback(async () => {
    clearTimeout(saveTimer.current);
    if (dirtyRef.current) await runSave();
    else if (inFlightRef.current) await inFlightRef.current;
  }, [runSave]);

  // Update a price entry and link any unlinked parts that reference it by name.
  // Stored part name strings are intentionally preserved as fallback — only materialId is written.
  // This means: if the entry is later renamed or deleted, parts fall back to their original stored name.
  const renamePrice = (id, updatedData) => {
    const oldEntry = prices.find((p) => p.id === id);
    const oldName = oldEntry?.materialName ?? null;

    setPrices((prev) => prev.map((p) => p.id === id ? { ...p, ...updatedData } : p));

    if (!oldName) return;

    // Link legacy parts (no materialId) that reference oldName → assign the ID so future lookups
    // resolve via ID, but leave the stored name string intact as a delete-safe fallback.
    const linkParts = (parts) => (parts || []).map((p) => {
      const linkMat   = p.materialId == null && p.material === oldName;
      const linkSideA = p.sideAId   == null && p.sideA    === oldName;
      const linkSideB = p.sideBId   == null && p.sideB    === oldName;
      if (!linkMat && !linkSideA && !linkSideB) return p;
      return {
        ...p,
        ...(linkMat   ? { materialId: id } : {}),
        ...(linkSideA ? { sideAId:    id } : {}),
        ...(linkSideB ? { sideBId:    id } : {}),
      };
    });

    setTemplates((prev) => prev.map((t) => ({
      ...t,
      boxes: (t.boxes || []).map((b) => ({ ...b, parts: linkParts(b.parts) })),
    })));

    setSubProjects((prev) => prev.map((room) => ({
      ...room,
      boxes: (room.boxes || []).map((b) => ({ ...b, parts: linkParts(b.parts) })),
    })));
  };

  const resetAllData = () => {
    setProjects([]);
    setSubProjects([]);
    setDimensions([]);
    setPrices([]);
    setMaterialModelRates({});
    setMaterialModelProfitPercent({ economy: 0, standard: 0, premium: 0 });
    setTemplates([]);
    setSelectedTemplateId("");
    setMaterialStockSettings({});
    setKerfWidth(0);
    setDesignGallery([]);
    setLeads([]);
    setLeadViews(null);
    setLeadStatuses(null);
    setLeadTagColors(null);
    setTeamMembers([]);
    setTemplateFolders([]);
    // The debounced save effect above picks this up and POSTs the cleared
    // state to MySQL — no direct API call needed here.
  };

  const restoreSampleData = () => {
    setProjects(projectList);
    setSubProjects(subProjectList);
    setDimensions(dimensionEntries);
    setPrices(priceList);
    setTemplates([]);
    setSelectedTemplateId("");
    setMaterialStockSettings({});
    setKerfWidth(0);
    setDesignGallery([]);
    setLeads([]);
    setLeadViews(null);
    setLeadStatuses(null);
    setLeadTagColors(null);
    setTeamMembers([]);
    setTemplateFolders([]);
    // Same as resetAllData — the debounced save effect persists this.
  };

  // While previewing, pages get the workspace as that group would see it.
  const shown = useMemo(() => (previewing ? previewView(access, {
    projects, subProjects, dimensions, prices, materialModelRates, materialModelProfitPercent, templates,
    selectedTemplateId, designGallery, leads, leadViews, leadStatuses, leadTagColors, templateFolders,
  }, defaultData) : null), [previewing, accessKey, projects, subProjects, dimensions, prices, materialModelRates, materialModelProfitPercent, templates, selectedTemplateId, designGallery, leads, leadViews, leadStatuses, leadTagColors, templateFolders]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppDataContext.Provider
      value={{
        projects,
        setProjects,
        subProjects,
        setSubProjects,
        dimensions,
        setDimensions,
        prices,
        setPrices,
        materialModelRates,
        setMaterialModelRates,
        materialModelProfitPercent,
        setMaterialModelProfitPercent,
        templates,
        setTemplates,
        selectedTemplateId,
        setSelectedTemplateId,
        materialStockSettings,
        setMaterialStockSettings,
        kerfWidth,
        setKerfWidth,
        companyProfile,
        setCompanyProfile,
        designGallery,
        setDesignGallery,
        leads,
        setLeads,
        leadViews,
        setLeadViews,
        leadStatuses,
        setLeadStatuses,
        leadTagColors,
        setLeadTagColors,
        teamMembers,
        setTeamMembers,
        templateFolders,
        setTemplateFolders,
        renamePrice,
        resetAllData,
        restoreSampleData,
        // New: surfaced so pages can optionally show a loading/error banner.
        isLoaded,
        loadError,
        saveError,
        deniedKeys,
        saveStatus,
        retrySave,
        requestImmediateSave,
        flushPendingSave,
        ...(shown || {}),
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

function useAppData() {
  return useContext(AppDataContext);
}

export { AppDataProvider, useAppData };
