import { createContext, useContext, useEffect, useRef, useState } from "react";
import { projectList } from "../data/projectData";
import { subProjectList } from "../data/subProjectData";
import { dimensionEntries } from "../data/dimensionData";
import { priceList } from "../data/priceData";
import { fetchState, saveState } from "../utils/api";

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
  templates: [],
  selectedTemplateId: "",
  generatedParts: [],
  configuredWardrobe: null,
  wardrobeRecords: [],
  editingWardrobeRecordId: null,
  materialStockSettings: {},
  kerfWidth: 0,
};

// Debounce writes to the API so fast typing (a text input, a number field)
// doesn't fire a POST per keystroke — same effect localStorage's synchronous
// write gave us for free, reimplemented for a network call.
const SAVE_DEBOUNCE_MS = 800;

function AppDataProvider({ children }) {
  const [projects, setProjects] = useState(defaultData.projects);
  const [subProjects, setSubProjects] = useState(defaultData.subProjects);
  const [dimensions, setDimensions] = useState(defaultData.dimensions);
  const [prices, setPrices] = useState(defaultData.prices);
  const [materialModelRates, setMaterialModelRates] = useState(defaultData.materialModelRates);
  const [materialModelProfitPercent, setMaterialModelProfitPercent] = useState(defaultData.materialModelProfitPercent);
  const [templates, setTemplates] = useState(defaultData.templates);
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultData.selectedTemplateId);
  const [generatedParts, setGeneratedParts] = useState(defaultData.generatedParts);
  const [configuredWardrobe, setConfiguredWardrobe] = useState(defaultData.configuredWardrobe);
  const [wardrobeRecords, setWardrobeRecords] = useState(defaultData.wardrobeRecords);
  const [editingWardrobeRecordId, setEditingWardrobeRecordId] = useState(defaultData.editingWardrobeRecordId);
  const [materialStockSettings, setMaterialStockSettings] = useState(defaultData.materialStockSettings);
  const [kerfWidth, setKerfWidth] = useState(defaultData.kerfWidth);

  // Gates the very first render (before the API has responded) and stops
  // the save effect from firing on the initial default state — otherwise
  // every fresh page load would immediately overwrite the server's real
  // data with the seed/demo defaults above.
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const saveTimer = useRef(null);

  // ── Initial load from MySQL (per-user, via /api/interior_state.php) ─────
  useEffect(() => {
    let cancelled = false;
    fetchState()
      .then(({ data, isNew }) => {
        if (cancelled) return;

        // A brand-new account has nothing saved — keep the seed/sample data
        // already in state so the tool opens with something to explore. The
        // first edit persists it as that user's own workspace.
        if (isNew) return;

        // An existing account gets exactly what it saved, empty lists
        // included — otherwise deleting every project would silently bring
        // the sample data back on the next reload.
        setProjects(data.projects || []);
        setSubProjects(data.subProjects || []);
        setDimensions(data.dimensions || []);
        setPrices(data.prices || []);
        setMaterialModelRates(data.materialModelRates || {});
        setMaterialModelProfitPercent(data.materialModelProfitPercent || defaultData.materialModelProfitPercent);
        setTemplates(data.templates || []);
        setSelectedTemplateId(data.selectedTemplateId || "");
        setGeneratedParts(data.generatedParts || []);
        setConfiguredWardrobe(data.configuredWardrobe ?? null);
        setWardrobeRecords(data.wardrobeRecords || []);
        setEditingWardrobeRecordId(data.editingWardrobeRecordId ?? null);
        setMaterialStockSettings(data.materialStockSettings || {});
        setKerfWidth(data.kerfWidth ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load app state from server:", err);
        setLoadError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Debounced save to MySQL (via server/state.php) ──────────────────────
  useEffect(() => {
    if (!isLoaded) return; // don't save until the initial load has landed

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const dataToSave = {
        projects,
        subProjects,
        dimensions,
        prices,
        materialModelRates,
        materialModelProfitPercent,
        templates,
        selectedTemplateId,
        generatedParts,
        configuredWardrobe,
        wardrobeRecords,
        editingWardrobeRecordId,
        materialStockSettings,
        kerfWidth,
      };
      saveState(dataToSave)
        .then(() => setSaveError(null))
        .catch((err) => {
          console.error("Failed to save app state to server:", err);
          setSaveError(err.message);
        });
    }, SAVE_DEBOUNCE_MS);

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
    generatedParts,
    configuredWardrobe,
    wardrobeRecords,
    editingWardrobeRecordId,
    materialStockSettings,
    kerfWidth,
  ]);

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
    setGeneratedParts([]);
    setConfiguredWardrobe(null);
    setWardrobeRecords([]);
    setEditingWardrobeRecordId(null);
    setMaterialStockSettings({});
    setKerfWidth(0);
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
    setGeneratedParts([]);
    setConfiguredWardrobe(null);
    setWardrobeRecords([]);
    setEditingWardrobeRecordId(null);
    setMaterialStockSettings({});
    setKerfWidth(0);
    // Same as resetAllData — the debounced save effect persists this.
  };

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
        generatedParts,
        setGeneratedParts,
        configuredWardrobe,
        setConfiguredWardrobe,
        wardrobeRecords,
        setWardrobeRecords,
        editingWardrobeRecordId,
        setEditingWardrobeRecordId,
        materialStockSettings,
        setMaterialStockSettings,
        kerfWidth,
        setKerfWidth,
        renamePrice,
        resetAllData,
        restoreSampleData,
        // New: surfaced so pages can optionally show a loading/error banner.
        isLoaded,
        loadError,
        saveError,
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
