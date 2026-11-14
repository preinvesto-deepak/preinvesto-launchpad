import { useEffect, useRef, useState, type ReactNode } from "react";
import { Routes, Route, useLocation, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, LogOut, UserCog, TriangleAlert, Lock, Eye } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AppDataProvider, useAppData } from "./context/AppDataContext";
import { UnsavedChangesProvider, useUnsavedChanges } from "./context/UnsavedChangesContext";
import Sidebar from "./components/Sidebar";
import ProfileMenu from "./components/ProfileMenu";

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
import AppSettings from "./pages/AppSettings";
import Requirements from "./pages/Requirements";
import CustomerPortal, { CustomerPreview } from "./pages/CustomerPortal";
import { can, canTab, isOwner, ROUTE_SCREEN, ROUTE_TAB, SCREENS, setProjectLock } from "./utils/access";

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
  "/interior/requirements": "Req Form",
  "/interior/app-settings": "App Settings",
  "/interior/customer-preview": "Customer form preview",
  "/interior/profile": "Your Profile",
};

// These pages render their own heading (or none), so the shared bar is suppressed.
const NO_HEADER = ["/interior/app-settings", "/interior/items-pricing", "/interior/material-models", "/interior/projects", "/interior/sub-projects"];

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
  // The real signed-in account, even while previewing someone else's view.
  const { realUser: user, logout } = useAuth();
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
        {user?.isEmployee ? (
          <>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--stone-700)" }} title={user.access?.groupName ? `Group: ${user.access.groupName}` : "Employee"}>
              <UserCog size={14} />
              {user.name}
              <span style={{ fontSize: 10, background: "var(--stone-100)", border: "1px solid var(--stone-300)", borderRadius: 999, padding: "1px 7px" }}>
                {user.access?.groupName || "No group"}
              </span>
            </span>
            <button
              onClick={() => guardedNavigate(async () => { await flushPendingSave(); await logout(); })}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "var(--stone-700)", border: "1px solid var(--stone-300)", padding: "5px 10px", fontSize: 12 }}
            >
              <LogOut size={13} /> Sign out
            </button>
          </>
        ) : (
          <ProfileMenu />
        )}
      </div>
    </div>
  );
}

/** Shown the whole time the owner is previewing a group's or a person's view. */
function ImpersonationBanner() {
  const { impersonation, stopImpersonation } = useAuth();
  if (!impersonation) return null;
  const scope = impersonation.access.scope;
  return (
    <div
      className="no-print"
      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 20px", background: "#f5f3ff", borderBottom: "1px solid #c4b5fd", color: "#4c1d95", fontSize: 12 }}
    >
      <Eye size={14} style={{ flexShrink: 0 }} />
      <span>
        Viewing as <b>{impersonation.label}</b>
        {impersonation.kind === "person" ? ` (group: ${impersonation.groupName})` : " (group)"}
        {" · "}{Array.isArray(scope) ? `${scope.length} project${scope.length !== 1 ? "s" : ""} only` : "all projects"}
        {" · "}preview only — nothing you do here is saved.
      </span>
      <button
        onClick={stopImpersonation}
        style={{ marginLeft: "auto", background: "#6d28d9", color: "#fff", border: "none", borderRadius: 5, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}
      >Exit preview</button>
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
 * Tells an employee when the server refused part of what they changed — their
 * group doesn't allow it, so it was not saved.
 */
function PermissionBanner() {
  const { deniedKeys } = useAppData();
  if (!deniedKeys || deniedKeys.length === 0) return null;
  return (
    <div
      className="no-print"
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", background: "#fffbeb", borderBottom: "1px solid #fde68a", color: "#92400e", fontSize: 12 }}
    >
      <Lock size={14} style={{ flexShrink: 0 }} />
      <span>Some changes were not saved because your group doesn't have permission to make them ({deniedKeys.join(", ")}). Reload the page to see the saved data.</span>
      <button onClick={() => window.location.reload()} style={{ marginLeft: "auto", background: "#92400e", color: "#fff", border: "none", borderRadius: 5, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Reload</button>
    </div>
  );
}

// Buttons that delete something, by their label — turned off for employees whose
// group can edit a screen but not delete from it. (The server refuses the
// delete regardless; this just keeps the buttons from looking usable.)
const DELETE_LABEL = /^(del|delete|🗑)(\b|\s|$)/i;
function useDisableDeleteButtons(ref: React.RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return undefined;
    const apply = () => {
      root.querySelectorAll("button").forEach((b) => {
        const label = (b.textContent || "").trim();
        const title = b.getAttribute("title") || "";
        if (DELETE_LABEL.test(label) || /^delete\b/i.test(title)) {
          b.disabled = true;
          b.style.opacity = "0.4";
          b.style.cursor = "not-allowed";
          b.title = "Your group can't delete here";
        }
      });
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [ref, active]);
}

/** Wraps one page: blocks it without View, and marks it read-only without Edit. */
function Screen({ route, children }: { route: string; children: ReactNode }) {
  const { user } = useAuth();
  const access = user?.access;
  const screen = ROUTE_SCREEN[route];
  // Project BOQ / Quotation are single project tabs; the Projects page limits
  // itself tab by tab, so it only needs the "can see any tab" check here.
  const tab = ROUTE_TAB[route];
  const tabLevel = route === "projects";
  const canView = isOwner(access) || (tab ? canTab(access, tab, "view") : can(access, screen, "view"));
  const canEdit = tab ? canTab(access, tab, "edit") : can(access, screen, "edit");
  const canDelete = tab ? canTab(access, tab, "delete") : can(access, screen, "delete");
  const ref = useRef<HTMLDivElement>(null);
  useDisableDeleteButtons(ref, canView && canEdit && !canDelete && !tabLevel);
  useEffect(() => {
    if (!tab) return undefined;
    setProjectLock({ readOnly: !canEdit, noDelete: !canDelete });
    return () => setProjectLock(null);
  }, [tab, canEdit, canDelete]);

  if (!canView) return <NoAccess what={SCREENS.find((s) => s.key === screen)?.label || "this page"} />;
  return (
    <div ref={ref}>
      {!canEdit && !tabLevel && (
        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, color: "#1e40af", fontSize: 12 }}>
          <Lock size={13} /> View only — your group can look at this page but not change it.
        </div>
      )}
      {children}
    </div>
  );
}

function NoAccess({ what }: { what: string }) {
  return (
    <div className="page-card" style={{ textAlign: "center", padding: 48, color: "#6b7280" }}>
      <Lock size={28} style={{ marginBottom: 10 }} />
      <h3 style={{ margin: "0 0 6px", color: "#374151" }}>No access</h3>
      <p style={{ margin: 0, fontSize: 13 }}>Your group doesn't include {what}. Ask the account owner if you need it.</p>
    </div>
  );
}

/** Profile and Teams (people, groups, passwords) are the account owner's alone. */
function OwnerOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!isOwner(user?.access)) return <NoAccess what="this page" />;
  return <>{children}</>;
}

/**
 * The Interior quotation tool, mounted at /interior/*.
 *
 * Everything is wrapped in .interior-app because this tool ships its own
 * stylesheet with element-level rules (button, table, input); the class scopes
 * them so they can't leak into the rest of the Preinvesto site.
 */
const InteriorShell = () => {
  const { pathname } = useLocation();
  const noPadTop = ["/interior/items-pricing", "/interior/material-models"].includes(pathname);

  return (
    <AppDataProvider>
      <UnsavedChangesProvider>
        <div className="interior-app">
          <InteriorTopBar />
          <ImpersonationBanner />
          <WorkspaceLoadBanner />
          <PermissionBanner />
          <SaveStatus />
          <div className="app-layout">
            <Sidebar />
            <div className="main-content" style={noPadTop ? { paddingTop: 0 } : {}}>
              <PageHeader />
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="leads" element={<Screen route="leads"><Leads /></Screen>} />
                <Route path="teams" element={<OwnerOnly><Teams /></OwnerOnly>} />
                <Route path="projects" element={<Screen route="projects"><Projects /></Screen>} />
                <Route path="sub-projects" element={<Screen route="sub-projects"><SubProjects /></Screen>} />
                <Route path="template-master" element={<Screen route="template-master"><TemplateMaster /></Screen>} />
                <Route path="design-gallery" element={<Screen route="design-gallery"><DesignGallery /></Screen>} />
                <Route path="items-pricing" element={<Screen route="items-pricing"><ItemsPricing /></Screen>} />
                <Route path="material-models" element={<Screen route="material-models"><MaterialModels /></Screen>} />
                <Route path="dimensions-entry" element={<Screen route="dimensions-entry"><DimensionsEntry /></Screen>} />
                <Route path="project-boq" element={<Screen route="project-boq"><ProjectBOQ /></Screen>} />
                <Route path="project-quotation" element={<Screen route="project-quotation"><ProjectQuotation /></Screen>} />
                <Route path="requirements" element={<OwnerOnly><Requirements /></OwnerOnly>} />
                <Route path="app-settings" element={<OwnerOnly><AppSettings /></OwnerOnly>} />
                <Route path="customer-preview" element={<OwnerOnly><CustomerPreview /></OwnerOnly>} />
                <Route path="profile" element={<OwnerOnly><Profile /></OwnerOnly>} />
              </Routes>
            </div>
          </div>
        </div>
      </UnsavedChangesProvider>
    </AppDataProvider>
  );
};

// A customer login gets the one-page requirements form instead of the app.
const InteriorApp = () => {
  const { user } = useAuth();
  if (user?.access?.customer) {
    return (
      <AppDataProvider>
        <div className="interior-app"><CustomerPortal /></div>
      </AppDataProvider>
    );
  }
  return <InteriorShell />;
};

export default InteriorApp;
