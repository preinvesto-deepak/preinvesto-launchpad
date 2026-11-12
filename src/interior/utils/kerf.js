// Saw-blade kerf (mm) — the gap the blade eats between cuts, which the sheet
// nesting reserves. Set in App Settings: one value for the account, and a
// switch for whether every project uses it or each project keeps its own
// (project.kerfWidth). Pushed in by AppDataProvider on every render, like the
// services registry, so the plain calculation helpers can read it.
let globalKerf = 0;
let universal = true;

export const setKerfSettings = (kerfWidth, universalFlag) => {
  const n = Number(kerfWidth);
  globalKerf = Number.isFinite(n) && n >= 0 ? n : 0;
  universal = universalFlag !== false;
};

export const globalKerfMm = () => globalKerf;
export const isKerfUniversal = () => universal;

// Kerf in force for a project: the App Settings value when it is shared by all
// projects (or the project has none of its own yet), else the project's own.
export const kerfFor = (project) => {
  if (universal || project?.kerfWidth == null || project.kerfWidth === "") return globalKerf;
  const n = Number(project.kerfWidth);
  return Number.isFinite(n) && n >= 0 ? n : globalKerf;
};
