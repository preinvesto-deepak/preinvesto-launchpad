import { useEffect, useState } from "react";
import { Routes, Route, useLocation, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, LogOut, UserCog, TriangleAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AppDataProvider, useAppData } from "./context/AppDataContext";
import { UnsavedChangesProvider, useUnsavedChanges } from "./context/UnsavedChangesContext";
import Sidebar from "./components/Sidebar";

import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Projects from "./pages/Projects";
import SubProjects from "./pages/SubProjects";
import TemplateMaster from "./pages/TemplateMaster";
import ItemsPricing from "./pages/ItemsPricing";
import MaterialModels from "./pages/MaterialModels";
import DimensionsEntry from "./pages/DimensionsEntry";
import ProjectBOQ from "./pages/ProjectBOQ";
import ProjectQuotation from "./pages/ProjectQuotation";
import Profile from "./pages/Profile";
import DesignGallery from "./pages/DesignGallery";
import Teams from "./pages/Teams";

import "./interior.css";

const PAGE_TITLES: Record<string, string> = {
  "/interior": "Dashboard",
  "/interior/leads": "Leads",
  "/interior/teams": "Teams",
  "/interior/projects": "Projects & Rooms",
  "/interior/sub-projects": "Projects & Rooms",
  "/interior/template-master": "Templates",
  "/interior/design-gallery": "Design Gallery",
  "/interior/items-pricing": "Items Pricing",
  "/interior/material-models": "Material Models",
  "/interior/dimensions-entry": "Dimensions Entry",
  "/interior/project-boq": "Project BOQ",
  "/interior/project-quotation": "Project Quotation",
  "/interior/profile": "Your Profile",
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
  const navigate = useNavigate();
  const { guardedNavigate } = useUnsavedChanges();
  const { flushPendingSave } = useAppData();
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
        onClick={(e) => { e.preventDefault(); guardedNavigate(() => navigate("/")); }}
        style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--stone-700)", textDecoration: "none" }}
      >
        <ArrowLeft size={14} /> Back to Preinvesto
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link
          to="/interior/profile"
          onClick={(e) => { e.preventDefault(); guardedNavigate(() => navigate("/interior/profile")); }}
          style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--stone-700)", textDecoration: "none" }}
          title="Your profile"
        >
          <UserCog size={14} />
          {user ? user.name : "Profile"}
        </Link>
        <button
          onClick={() => guardedNavigate(async () => { await flushPendingSave(); await logout(); })}
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
 * Tells the user, in plain terms, when their workspace didn't load from the
 * server — and therefore that nothing they do right now is being saved.
 * AppDataContext deliberately leaves autosave permanently off for the rest
 * of the session when the initial load fails, rather than risk overwriting
 * real saved data with blank/seed state — this banner is what makes that
 * silent-but-safe failure visible instead of silent-and-confusing.
 */
function WorkspaceLoadBanner() {
  const { loadError } = useAppData();
  if (!loadError) return null;
  return (
    <div
      className="no-print"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 20px",
        background: "#fef2f2",
        borderBottom: "1px solid #fecaca",
        color: "#b91c1c",
        fontSize: 12,
      }}
    >
      <TriangleAlert size={14} style={{ flexShrink: 0 }} />
      <span>
        Couldn't load your saved workspace ({loadError}). Nothing you do on this page will be saved — please refresh to try again.
      </span>
    </div>
  );
}

/**
 * Shows whether the latest edits have reached the server: "Saving…" while a
 * write is waiting/running, a brief "Saved", and — importantly — a persistent
 * red warning with a Retry button when a write fails (previously a failed
 * save was completely silent, so a refresh quietly lost the changes).
 */
function SaveStatus() {
  const { saveStatus, saveError, retrySave } = useAppData();
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (saveStatus !== "saved") { setShowSaved(false); return undefined; }
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saveStatus]);

  const base = {
    position: "fixed" as const, right: 16, bottom: 16, zIndex: 6000, fontSize: 12,
    borderRadius: 8, padding: "7px 12px", boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
  };

  if (saveStatus === "error") {
    return (
      <div className="no-print" role="alert" style={{ ...base, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", display: "flex", gap: 10, alignItems: "center", maxWidth: 420 }}>
        <TriangleAlert size={14} style={{ flexShrink: 0 }} />
        <span>Couldn't save your latest changes{saveError ? ` (${saveError})` : ""}. Don't refresh yet.</span>
        <button onClick={() => retrySave()} style={{ background: "#b91c1c", color: "#fff", border: "none", borderRadius: 5, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Retry</button>
      </div>
    );
  }
  if (saveStatus === "pending" || saveStatus === "saving") {
    return <div className="no-print" style={{ ...base, background: "#fff", border: "1px solid #e5e7eb", color: "#6b7280" }}>Saving…</div>;
  }
  if (showSaved) {
    return <div className="no-print" style={{ ...base, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857" }}>✓ All changes saved</div>;
  }
  return null;
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
      <UnsavedChangesProvider>
        <div className="interior-app">
          <InteriorTopBar />
          <WorkspaceLoadBanner />
          <SaveStatus />
          <div className="app-layout">
            <Sidebar />
            <div className="main-content" style={noPadTop ? { paddingTop: 0 } : {}}>
              <PageHeader />
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="leads" element={<Leads />} />
                <Route path="teams" element={<Teams />} />
                <Route path="projects" element={<Projects />} />
                <Route path="sub-projects" element={<SubProjects />} />
                <Route path="template-master" element={<TemplateMaster />} />
                <Route path="design-gallery" element={<DesignGallery />} />
                <Route path="items-pricing" element={<ItemsPricing />} />
                <Route path="material-models" element={<MaterialModels />} />
                <Route path="dimensions-entry" element={<DimensionsEntry />} />
                <Route path="project-boq" element={<ProjectBOQ />} />
                <Route path="project-quotation" element={<ProjectQuotation />} />
                <Route path="profile" element={<Profile />} />
              </Routes>
            </div>
          </div>
        </div>
      </UnsavedChangesProvider>
    </AppDataProvider>
  );
};

export default InteriorApp;
