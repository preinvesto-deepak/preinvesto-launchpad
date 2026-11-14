import { useState } from "react";
import { useAppData } from "../context/AppDataContext";
import { materialCalcGlobals } from "../utils/materialCalc";

const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px", marginBottom: 16, maxWidth: 760 };
const numIn = { width: 80, fontSize: 14, padding: "5px 8px", textAlign: "center", border: "1px solid #cbd5e1", borderRadius: 6 };
const label = { fontSize: 13, fontWeight: 700, color: "#374151" };
const hint = { fontSize: 12, color: "#6b7280" };
const th = { textAlign: "left", fontSize: 12, padding: "6px 8px", borderBottom: "1px solid #e5e7eb" };
const td = { fontSize: 13, padding: "6px 8px", borderBottom: "1px solid #f3f4f6" };

function Switch({ on, onChange }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
      style={{ width: 44, height: 24, borderRadius: 12, border: "none", padding: 2, cursor: "pointer", background: on ? "#185fa5" : "#cbd5e1", display: "flex", justifyContent: on ? "flex-end" : "flex-start", flexShrink: 0 }}
    >
      <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", display: "block" }} />
    </button>
  );
}

// A number box that stores 0 for blank and never goes negative.
function Num({ value, onChange, step = 1, width }) {
  return (
    <input
      type="number" min={0} step={step} value={value}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      onBlur={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      style={{ ...numIn, ...(width ? { width } : {}) }}
    />
  );
}

// Which settings sections a search matches (title, field names and keywords).
const SECTIONS = {
  kerf: "cutsheet optimizer kerf dimension saw blade cut sheet nesting sheet count apply all projects",
  material: "material calculation material summary fevicol merino multiplier laminate glue masking tape edge band divisor gst percent apply all projects room",
};

// Account-wide settings: the Cutsheet Optimizer kerf and the Material Summary
// rules (Fevicol multiplier, Masking Tape divisor, GST %), each with a switch for
// "same for every project" vs "each project / room keeps its own".
function AppSettings() {
  const { kerfWidth, setKerfWidth, companyProfile, setCompanyProfile, projects, setProjects, subProjects, setSubProjects } = useAppData();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const show = (key) => !q || q.split(/\s+/).every((w) => SECTIONS[key].includes(w));

  const setProfile = (patch) => setCompanyProfile((p) => ({ ...(p || {}), ...patch }));

  // ── Kerf ──
  const kerf = Number(kerfWidth) || 0;
  const kerfUniversal = companyProfile?.kerfUniversal !== false;
  const setKerfUniversal = (on) => {
    if (!on) {
      // Per project: every project starts from the value set here, then can be changed.
      const own = (projects || []).some((p) => p.kerfWidth != null && Number(p.kerfWidth) !== kerf);
      if (own && !window.confirm(`Every project's kerf will be set to ${kerf} mm, replacing the values projects had of their own. Continue?`)) return;
      setProjects((prev) => prev.map((p) => ({ ...p, kerfWidth: kerf })));
    }
    setProfile({ kerfUniversal: on });
  };
  const setProjectKerf = (id, v) => setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, kerfWidth: v } : p)));

  // ── Material calculation ──
  const g = materialCalcGlobals();
  const calcUniversal = companyProfile?.materialCalcUniversal === true;
  const setCalcUniversal = (on) => {
    if (!on) {
      // Per room: every room starts from the values set here, then can be changed.
      const own = (subProjects || []).some((r) =>
        (r.fevicolMultiplier != null && Number(r.fevicolMultiplier) !== g.fevicolMultiplier)
        || (r.tapeDivisor != null && Number(r.tapeDivisor) !== g.tapeDivisor));
      if (own && !window.confirm("Every room will be set to the values above, replacing the values rooms had of their own. Continue?")) return;
      setSubProjects((prev) => prev.map((r) => ({ ...r, fevicolMultiplier: g.fevicolMultiplier, tapeDivisor: g.tapeDivisor })));
    }
    setProfile({ materialCalcUniversal: on });
  };
  const setRoomCalc = (id, field, v) => setSubProjects((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: v } : r)));
  const roomVal = (r, field) => (r[field] != null ? r[field] : g[field]);

  const nothing = !show("kerf") && !show("material");

  return (
    <div style={{ padding: "4px 0" }}>
      <div className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1>App Settings</h1>
        <input
          type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings…" aria-label="Search settings"
          style={{ width: 240, fontSize: 13, padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
      </div>

      {nothing && <p style={{ ...hint, margin: "8px 0" }}>No settings match “{query}”.</p>}

      {show("kerf") && (
        <div style={card}>
          <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Cutsheet Optimizer</h3>
          <p style={{ ...hint, margin: "0 0 14px" }}>
            The saw blade removes a little board at every cut. The optimizer leaves this gap between parts, and the sheet
            counts in Room Estimation, Material Analysis, BOQ and Quotation follow it.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ ...label, width: 150 }}>Kerf dimension (mm)</span>
            <Num value={kerfWidth ?? 0} onChange={setKerfWidth} step={0.5} />
            <span style={hint}>{kerfUniversal ? "used by every project and template" : "default for templates and new projects"}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Switch on={kerfUniversal} onChange={setKerfUniversal} />
            <div>
              <div style={label}>Apply this kerf to all projects</div>
              <div style={hint}>
                {kerfUniversal
                  ? "On — every project uses the value above; the kerf inside projects can't be edited."
                  : "Off — each project keeps its own kerf (starting from the value above) and can change it."}
              </div>
            </div>
          </div>

          {!kerfUniversal && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Kerf per project</h4>
              {(projects || []).length === 0 ? (
                <p style={{ ...hint, margin: 0 }}>No projects yet.</p>
              ) : (
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={th}>Project</th><th style={th}>Kerf (mm)</th></tr></thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr key={p.id}>
                        <td style={td}>{p.name}</td>
                        <td style={td}><Num value={p.kerfWidth ?? kerf} onChange={(v) => setProjectKerf(p.id, v)} step={0.5} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {show("material") && (
        <div style={card}>
          <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Material Calculation</h3>
          <p style={{ ...hint, margin: "0 0 14px" }}>
            Rules the Material Summary uses to work out glue and tape. Its rates include each item's own GST.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", alignItems: "center", gap: "10px 10px", marginBottom: 16 }}>
            <span style={label}>Fevicol Merino qty =</span>
            <Num value={g.fevicolMultiplier} onChange={(v) => setProfile({ fevicolMultiplier: v })} step={0.05} />
            <span style={hint}>× total Inside + Outside Laminate sheets required</span>

            <span style={label}>Masking Tape qty = edge band (m) ÷</span>
            <Num value={g.tapeDivisor} onChange={(v) => setProfile({ tapeDivisor: v })} />
            <span style={hint}>rounded up to a whole tape; 0 = type tapes on each box</span>

          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Switch on={calcUniversal} onChange={setCalcUniversal} />
            <div>
              <div style={label}>Apply these to all projects</div>
              <div style={hint}>
                {calcUniversal
                  ? "On — every room uses the values above; they can't be edited inside projects or templates."
                  : "Off — each room keeps its own values (starting from the ones above) and can change them in its Material Summary."}
              </div>
            </div>
          </div>

          {!calcUniversal && (
            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Values per room</h4>
              {(subProjects || []).length === 0 ? (
                <p style={{ ...hint, margin: 0 }}>No rooms yet.</p>
              ) : (
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={th}>Project</th><th style={th}>Room</th>
                      <th style={th}>Fevicol ×</th><th style={th}>Tape ÷</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subProjects.map((r) => (
                      <tr key={r.id}>
                        <td style={td}>{r.project}</td>
                        <td style={td}>{r.subProject}</td>
                        <td style={td}><Num width={64} step={0.05} value={roomVal(r, "fevicolMultiplier")} onChange={(v) => setRoomCalc(r.id, "fevicolMultiplier", v)} /></td>
                        <td style={td}><Num width={64} value={roomVal(r, "tapeDivisor")} onChange={(v) => setRoomCalc(r.id, "tapeDivisor", v)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p style={{ ...hint, margin: "8px 0 0" }}>A room without values of its own uses the ones above.</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default AppSettings;
