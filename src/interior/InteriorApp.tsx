import { Routes, Route, useLocation, Link } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AppDataProvider } from "./context/AppDataContext";
import Sidebar from "./components/Sidebar";

import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import SubProjects from "./pages/SubProjects";
import TemplateMaster from "./pages/TemplateMaster";
import WardrobeConfigurator from "./pages/WardrobeConfigurator";
import WardrobeRecords from "./pages/WardrobeRecords";
import ItemsPricing from "./pages/ItemsPricing";
import MaterialModels from "./pages/MaterialModels";
import DimensionsEntry from "./pages/DimensionsEntry";
import CutSheetOutput from "./pages/CutSheetOutput";
import BOQ from "./pages/BOQ";
import ProjectBOQ from "./pages/ProjectBOQ";
import Quotation from "./pages/Quotation";
import ProjectQuotation from "./pages/ProjectQuotation";

import "./interior.css";

const PAGE_TITLES: Record<string, string> = {
  "/interior": "Dashboard",
  "/interior/projects": "Projects & Rooms",
  "/interior/sub-projects": "Projects & Rooms",
  "/interior/template-master": "Templates",
  "/interior/wardrobe-configurator": "Configurator",
  "/interior/wardrobe-records": "Saved Records",
  "/interior/items-pricing": "Items Pricing",
  "/interior/material-models": "Material Models",
  "/interior/dimensions-entry": "Dimensions Entry",
  "/interior/cut-sheet-output": "Cut Sheet",
  "/interior/boq": "BOQ",
  "/interior/project-boq": "Project BOQ",
  "/interior/quotation": "Quotation",
  "/interior/project-quotation": "Project Quotation",
};

// These two pages render their own heading, so the shared bar is suppressed.
const NO_HEADER = ["/interior/items-pricing", "/interior/material-models"];

function PageHeader() {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/$/, "") || "/interior";
  if (NO_HEADER.includes(path)) return null;
  return (
    <div className="page-header">
      <h1>{PAGE_TITLES[path] || "Interior App"}</h1>
    </div>
  );
}

/** Thin bar giving a way back to the main site and out of the session. */
function InteriorTopBar() {
  const { user, logout } = useAuth();
  return (
    <div
      className="no-print"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 20px",
        background: "#fff",
        borderBottom: "1px solid var(--stone-200)",
        fontSize: 12,
      }}
    >
      <Link
        to="/"
        style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--stone-700)", textDecoration: "none" }}
      >
        <ArrowLeft size={14} /> Back to Preinvesto
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {user && <span style={{ color: "var(--stone-700)" }}>{user.name}</span>}
        <button
          onClick={logout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "transparent",
            color: "var(--stone-700)",
            border: "1px solid var(--stone-300)",
            padding: "5px 10px",
            fontSize: 12,
          }}
        >
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * The Interior quotation tool, mounted at /interior/*.
 *
 * Everything is wrapped in .interior-app because this tool ships its own
 * stylesheet with element-level rules (button, table, input); the class scopes
 * them so they can't leak into the rest of the Preinvesto site.
 */
const InteriorApp = () => {
  const { pathname } = useLocation();
  const noPadTop = ["/interior/items-pricing", "/interior/material-models"].includes(pathname);

  return (
    <AppDataProvider>
      <div className="interior-app">
        <InteriorTopBar />
        <div className="app-layout">
          <Sidebar />
          <div className="main-content" style={noPadTop ? { paddingTop: 0 } : {}}>
            <PageHeader />
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="projects" element={<Projects />} />
              <Route path="sub-projects" element={<SubProjects />} />
              <Route path="template-master" element={<TemplateMaster />} />
              <Route path="wardrobe-configurator" element={<WardrobeConfigurator />} />
              <Route path="wardrobe-records" element={<WardrobeRecords />} />
              <Route path="items-pricing" element={<ItemsPricing />} />
              <Route path="material-models" element={<MaterialModels />} />
              <Route path="dimensions-entry" element={<DimensionsEntry />} />
              <Route path="cut-sheet-output" element={<CutSheetOutput />} />
              <Route path="boq" element={<BOQ />} />
              <Route path="project-boq" element={<ProjectBOQ />} />
              <Route path="quotation" element={<Quotation />} />
              <Route path="project-quotation" element={<ProjectQuotation />} />
            </Routes>
          </div>
        </div>
      </div>
    </AppDataProvider>
  );
};

export default InteriorApp;
