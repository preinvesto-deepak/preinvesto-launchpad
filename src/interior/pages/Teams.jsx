import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { GroupsPanel, TeamPanel, useTeamAdmin } from "../components/TeamAdmin";

// The Team list (people you work with — some can sign in) and the groups that
// decide what signed-in people may do. Owner-only; the route is guarded.
function Teams() {
  const { team, loading, error, act } = useTeamAdmin();
  const { teamMembers, setTeamMembers, isLoaded } = useAppData();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "groups" ? "groups" : "team";

  // One-time move of the old contact-only Team Members list into the Team list,
  // then clear it so it isn't imported again. Skipped for people already there.
  const importing = useRef(false);
  useEffect(() => {
    if (!isLoaded || importing.current || !teamMembers || teamMembers.length === 0) return;
    importing.current = true;
    act({ action: "importContacts", contacts: teamMembers })
      .then(() => setTeamMembers([]))
      .catch(() => { importing.current = false; });
  }, [isLoaded, teamMembers, act, setTeamMembers]);

  const tabs = [["team", "Team"], ["groups", "Groups & Access"]];

  return (
    <div>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e5e7eb", marginBottom: 14 }}>
        {tabs.map(([key, text]) => (
          <button
            key={key}
            onClick={() => setParams(key === "team" ? {} : { tab: key })}
            style={{
              background: "none", border: "none", borderBottom: tab === key ? "2px solid #2563eb" : "2px solid transparent",
              color: tab === key ? "#2563eb" : "#6b7280", fontWeight: tab === key ? 700 : 500, padding: "8px 14px", fontSize: 13, cursor: "pointer", borderRadius: 0,
            }}
          >{text}</button>
        ))}
      </div>
      <div className="page-card" style={{ minHeight: "calc(100vh - 150px)" }}>
        {loading ? <p style={{ color: "#6b7280" }}>Loading…</p>
          : error ? <p style={{ color: "#dc2626" }}>{error}</p>
          : tab === "groups" ? <GroupsPanel team={team} act={act} /> : <TeamPanel team={team} act={act} />}
      </div>
    </div>
  );
}

export default Teams;
