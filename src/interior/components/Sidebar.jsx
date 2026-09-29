import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { useAppData } from "../context/AppDataContext";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";

function GroupLabel({ label }) {
  return <div className="sidebar-group-label">{label}</div>;
}

function Sidebar() {
  const { projects } = useAppData();
  const navigate = useNavigate();
  const location = useLocation();
  const { guardedNavigate } = useUnsavedChanges();
  const [projectsOpen, setProjectsOpen] = useState(true);

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

  return (
    <div className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-name">Interior App</div>
        <div className="sidebar-brand-sub">Quotation & Cut Sheet</div>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input placeholder="Search…" />
      </div>

      <nav>
        <ul>
          <li><NavLink to="/interior" onClick={(e) => goTo(e, "/interior")}>Dashboard</NavLink></li>

          <GroupLabel label="Setup" />

          <li><NavLink to="/interior/leads" onClick={(e) => goTo(e, "/interior/leads")}>Leads</NavLink></li>

          {/* Projects collapsible */}
          <li>
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
                        {p.name}
                      </div>
                    </li>
                  );
                })}

                <li>
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
                </li>
              </ul>
            )}
          </li>

          <GroupLabel label="Configure" />
          <li><NavLink to="/interior/items-pricing" onClick={(e) => goTo(e, "/interior/items-pricing")}>Items Pricing</NavLink></li>
          <li><NavLink to="/interior/material-models" onClick={(e) => goTo(e, "/interior/material-models")}>Material Models</NavLink></li>
          <li><NavLink to="/interior/template-master" onClick={(e) => goTo(e, "/interior/template-master")}>Templates</NavLink></li>
          <li><NavLink to="/interior/design-gallery" onClick={(e) => goTo(e, "/interior/design-gallery")}>Design Gallery</NavLink></li>

          <GroupLabel label="Output" />
          <li><NavLink to="/interior/project-boq" onClick={(e) => goTo(e, "/interior/project-boq")}>Project BOQ</NavLink></li>
          <li><NavLink to="/interior/project-quotation" onClick={(e) => goTo(e, "/interior/project-quotation")}>Project Quotation</NavLink></li>

          <GroupLabel label="Account" />
          <li><NavLink to="/interior/profile" onClick={(e) => goTo(e, "/interior/profile")}>Your Profile</NavLink></li>
        </ul>
      </nav>
    </div>
  );
}

export default Sidebar;
