import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { FolderKanban, Users, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useAppData } from "../context/AppDataContext";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";
import { useAuth } from "@/context/AuthContext";
import { can, isOwner, isScoped } from "../utils/access";

function GroupLabel({ label }) {
  return <div className="sidebar-group-label">{label}</div>;
}

function Sidebar() {
  const { projects } = useAppData();
  const navigate = useNavigate();
  const location = useLocation();
  const { guardedNavigate } = useUnsavedChanges();
  const [projectsOpen, setProjectsOpen] = useState(true);
  // The menu panel can be collapsed to just the icon rail (remembered).
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("interior.sidebarCollapsed") === "1"; } catch { return false; }
  });
  const toggleSidebar = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem("interior.sidebarCollapsed", next ? "1" : "0"); } catch { /* ignore */ }
    return next;
  });

  // An employee only sees the screens their group can view.
  const { user } = useAuth();
  const access = user?.access;
  const owner = isOwner(access);
  const show = (screen) => can(access, screen, "view");
  const canAddProject = can(access, "projects", "edit") && !isScoped(access);

  const onProjectsPage = location.pathname === "/interior/projects";
  const params = new URLSearchParams(location.search);
  const activeProjectId = onProjectsPage ? Number(params.get("id")) : null;

  // Every Sidebar link goes through this instead of navigating directly —
  // if the page you're leaving has unsaved edits (Templates, Material
  // Models), it prompts to save/discard/cancel first instead of silently
  // discarding them.
  const goTo = (e, to) => {
    e.preventDefault();
    guardedNavigate(() => navigate(to));
  };

  // Left icon rail: "Project" holds everything the app had before (Dashboard,
  // Leads, Projects, Configure, Output, Account); "Teams" is the people side.
  const onTeams = location.pathname.startsWith("/interior/teams");
  const teamTab = params.get("tab") === "groups" ? "groups" : "team";
  const railItems = [
    { key: "project", label: "Project", icon: FolderKanban, to: "/interior", active: !onTeams },
    ...(owner ? [{ key: "teams", label: "Teams", icon: Users, to: "/interior/teams", active: onTeams }] : []),
  ];

  return (
    <>
    <div className="icon-rail no-print">
      {collapsed && (
        <button className="icon-rail-toggle" onClick={toggleSidebar} title="Open menu" aria-label="Open menu">
          <ChevronsRight size={18} />
        </button>
      )}
      {railItems.map(({ key, label, icon: Icon, to, active }) => (
        <button
          key={key}
          className={`icon-rail-item${active ? " active" : ""}`}
          onClick={() => { if (!active) guardedNavigate(() => navigate(to)); }}
          title={label}
        >
          <Icon size={18} />
          <span>{label}</span>
        </button>
      ))}
    </div>
    <div className="sidebar" style={collapsed ? { display: "none" } : undefined}>
      {/* Brand */}
      <div className="sidebar-brand" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div className="sidebar-brand-name">Interior App</div>
          <div className="sidebar-brand-sub">Quotation & Cut Sheet</div>
        </div>
        <button className="sidebar-collapse" onClick={toggleSidebar} title="Collapse menu" aria-label="Collapse menu">
          <ChevronsLeft size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input placeholder="Search…" />
      </div>

      {onTeams ? (
        <nav>
          <ul>
            <GroupLabel label="Teams" />
            {owner && (
              <>
                <li><NavLink to="/interior/teams" className={() => (teamTab === "team" ? "active" : "")} onClick={(e) => goTo(e, "/interior/teams")}>Team</NavLink></li>
                <li><NavLink to="/interior/teams?tab=groups" className={() => (teamTab === "groups" ? "active" : "")} onClick={(e) => goTo(e, "/interior/teams?tab=groups")}>Groups &amp; Access</NavLink></li>
              </>
            )}
          </ul>
        </nav>
      ) : (
      <nav>
        <ul>
          <li><NavLink to="/interior" onClick={(e) => goTo(e, "/interior")}>Dashboard</NavLink></li>

          <GroupLabel label="Setup" />

          {show("leads") && <li><NavLink to="/interior/leads" onClick={(e) => goTo(e, "/interior/leads")}>Leads</NavLink></li>}

          {/* Projects collapsible */}
          {show("projects") && <li>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 8px 6px 12px",
                margin: "0 4px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                color: onProjectsPage ? "var(--brand)" : "var(--stone-700)",
                background: onProjectsPage ? "var(--brand-light)" : "transparent",
                fontWeight: onProjectsPage ? 600 : 400,
                userSelect: "none",
              }}
              onClick={() => {
                if (!onProjectsPage) guardedNavigate(() => navigate("/interior/projects"));
                else setProjectsOpen((o) => !o);
              }}
            >
              <span style={{ flex: 1 }}>Projects &amp; Rooms</span>
              <span
                style={{ fontSize: 10, color: "var(--stone-400)" }}
                onClick={(e) => { e.stopPropagation(); setProjectsOpen((o) => !o); }}
              >
                {projectsOpen ? "▲" : "▼"}
              </span>
            </div>

            {projectsOpen && (
              <ul style={{ paddingLeft: 16 }}>
                {projects.map((p) => {
                  const isActive = activeProjectId === p.id;
                  return (
                    <li key={p.id}>
                      <div
                        onClick={() => guardedNavigate(() => navigate(`/interior/projects?id=${p.id}`))}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "5px 8px 5px 12px",
                          margin: "1px 4px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 11,
                          color: isActive ? "var(--brand)" : "var(--stone-700)",
                          background: isActive ? "var(--brand-light)" : "transparent",
                          fontWeight: isActive ? 600 : 400,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          borderLeft: isActive ? "2px solid var(--brand)" : "2px solid transparent",
                        }}
                        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--stone-100)"; }}
                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                        title={p.name}
                      >
                        {p.name}{p.requirementsSubmittedAt ? <span title="The customer submitted their requirements" style={{ color: "#059669" }}> ✓</span> : null}
                      </div>
                    </li>
                  );
                })}

                {canAddProject && <li>
                  <div
                    onClick={() => guardedNavigate(() => navigate("/interior/projects?new=1"))}
                    style={{
                      display: "block",
                      padding: "5px 8px 5px 12px",
                      margin: "1px 4px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 11,
                      color: "var(--brand)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--stone-100)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    + New Project
                  </div>
                </li>}
              </ul>
            )}
          </li>}

          {(show("itemsPricing") || show("materialModels") || show("templates") || show("designGallery")) && <GroupLabel label="Configure" />}
          {show("itemsPricing") && <li><NavLink to="/interior/items-pricing" onClick={(e) => goTo(e, "/interior/items-pricing")}>Items Pricing</NavLink></li>}
          {show("materialModels") && <li><NavLink to="/interior/material-models" onClick={(e) => goTo(e, "/interior/material-models")}>Material Models</NavLink></li>}
          {show("templates") && <li><NavLink to="/interior/template-master" onClick={(e) => goTo(e, "/interior/template-master")}>Templates</NavLink></li>}
          {show("designGallery") && <li><NavLink to="/interior/design-gallery" onClick={(e) => goTo(e, "/interior/design-gallery")}>Design Gallery</NavLink></li>}
          {owner && <li><NavLink to="/interior/requirements" onClick={(e) => goTo(e, "/interior/requirements")}>Req Form</NavLink></li>}
          {owner && <li><NavLink to="/interior/app-settings" onClick={(e) => goTo(e, "/interior/app-settings")}>App Settings</NavLink></li>}

          {show("projects") && <GroupLabel label="Output" />}
          {show("projects") && <li><NavLink to="/interior/project-boq" onClick={(e) => goTo(e, "/interior/project-boq")}>Project BOQ</NavLink></li>}
          {show("projects") && <li><NavLink to="/interior/project-quotation" onClick={(e) => goTo(e, "/interior/project-quotation")}>Project Quotation</NavLink></li>}

          {owner && <GroupLabel label="Account" />}
          {owner && <li><NavLink to="/interior/profile" onClick={(e) => goTo(e, "/interior/profile")}>Your Profile</NavLink></li>}
        </ul>
      </nav>
      )}
    </div>
    </>
  );
}

export default Sidebar;
