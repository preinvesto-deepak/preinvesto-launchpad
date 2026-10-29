import { useEffect, useState } from "react";
import { authFetch } from "@/context/AuthContext";

// Owner-side control panel for one project's customer link: what the customer
// sees, the private link itself, and the PIN. The page is read-only for the
// customer — it only ever shows the snapshot published from here.

const randomPin = () => String(Math.floor(100000 + Math.random() * 900000));
const linkFor = (code) => `${window.location.origin}/view/${code}`;

async function callShare(method, body, projectId) {
  const url = method === "GET"
    ? `/api/interior_share.php?projectId=${encodeURIComponent(projectId)}`
    : "/api/interior_share.php";
  const res = await authFetch(url, method === "GET" ? {} : { method: "POST", body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch { throw new Error("The server returned an unexpected response."); }
  if (!res.ok || !data.success) throw new Error(data.error || "Something went wrong.");
  return data.share;
}

const btn = (bg, extra = {}) => ({ background: bg, color: "#fff", border: "none", padding: "7px 14px", fontSize: 13, borderRadius: 6, cursor: "pointer", fontWeight: 600, ...extra });
const ghost = { background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "7px 14px", fontSize: 13, borderRadius: 6, cursor: "pointer", fontWeight: 600 };
const card = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, marginBottom: 14 };
const h4 = { margin: "0 0 8px", fontSize: 13, color: "#1e3a5f" };
const checkRow = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0", cursor: "pointer" };
const checkbox = { width: 16, height: 16, margin: 0, flexShrink: 0 };

export const DEFAULT_SHARE_OPTIONS = {
  quotation: true,
  savings: true,
  hardware: true,
  cutList: false,
  moodBoards: true,
  gallery: false,
  galleryFolders: [],
};

function ShareWithCustomerModal({ projectId, projectName, moodBoardRooms, galleryFolders, savedOptions, onOptionsChange, buildSnapshot, onClose }) {
  const [opts, setOpts] = useState({ ...DEFAULT_SHARE_OPTIONS, ...(savedOptions || {}) });
  const [share, setShare] = useState(undefined); // undefined = loading, null = none yet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pinDraft, setPinDraft] = useState(randomPin());
  const [shownPin, setShownPin] = useState(""); // only known right after it is set
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    let cancelled = false;
    callShare("GET", null, projectId)
      .then((s) => { if (!cancelled) setShare(s); })
      .catch((e) => { if (!cancelled) { setShare(null); setError(e.message); } });
    return () => { cancelled = true; };
  }, [projectId]);

  const setOpt = (patch) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    onOptionsChange?.(next);
  };

  const run = async (fn, okMsg) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); if (okMsg) setNotice(okMsg); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const pinOk = pinDraft === "" || /^\d{4,8}$/.test(pinDraft);
  const nothingSelected = !opts.quotation && !(opts.moodBoards && moodBoardRooms.length) && !(opts.gallery && opts.galleryFolders.length);

  const publish = (withPin) => run(async () => {
    const body = { action: "publish", projectId, snapshot: buildSnapshot(opts) };
    if (withPin !== undefined) body.pin = withPin;
    const s = await callShare("POST", body, projectId);
    setShare(s);
    if (withPin) setShownPin(withPin);
  }, share ? "Shared view updated — the customer now sees your latest changes." : "Link created.");

  const act = (body, okMsg) => run(async () => setShare(await callShare("POST", { projectId, ...body }, projectId)), okMsg);

  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); setNotice(`${what} copied.`); setError(""); }
    catch { setError("Couldn't copy automatically — select the text and copy it."); }
  };

  const link = share ? linkFor(share.code) : "";

  return (
    <div className="no-print" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 4500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 640, maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ background: "#1e3a5f", color: "#fff", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>🔗 Share with customer — {projectName}</span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", padding: "5px 11px", fontSize: 13, borderRadius: 6, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: 18, overflowY: "auto" }}>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6b7280" }}>
            The customer gets a private, <strong>read-only</strong> page. They see only a copy of what you tick below — never your rates, profit, cut sheets or other projects. After you change the quotation or mood board, press <strong>Update shared view</strong> to refresh what they see.
          </p>

          <div style={card}>
            <h4 style={h4}>What the customer can see</h4>
            <label style={checkRow}>
              <input type="checkbox" style={checkbox} checked={opts.quotation} onChange={(e) => setOpt({ quotation: e.target.checked })} />
              <span><strong>Quotation</strong> (the same pages as your Print / PDF)</span>
            </label>
            {opts.quotation && (
              <div style={{ marginLeft: 24 }}>
                <label style={checkRow}><input type="checkbox" style={checkbox} checked={opts.savings} onChange={(e) => setOpt({ savings: e.target.checked })} /> Show "You save vs MRP" box</label>
                <label style={checkRow}><input type="checkbox" style={checkbox} checked={opts.hardware} onChange={(e) => setOpt({ hardware: e.target.checked })} /> Show Hardware &amp; Consumables page (MRP, discount, warranty)</label>
                <label style={checkRow}><input type="checkbox" style={checkbox} checked={opts.cutList} onChange={(e) => setOpt({ cutList: e.target.checked })} /> Show Cut List page</label>
                <p style={{ margin: "2px 0 4px", fontSize: 11, color: "#9ca3af" }}>Hardware and Cut List pages also follow your "Include in Quotation" switches below.</p>
              </div>
            )}
            <label style={checkRow}>
              <input type="checkbox" style={checkbox} checked={opts.moodBoards} onChange={(e) => setOpt({ moodBoards: e.target.checked })} />
              <span><strong>Mood Boards</strong> {moodBoardRooms.length === 0 ? <em style={{ color: "#9ca3af" }}>(no room has a mood board yet)</em> : <span style={{ color: "#6b7280" }}>— {moodBoardRooms.map((r) => `${r.name} (${r.count})`).join(", ")}</span>}</span>
            </label>
            <label style={checkRow}>
              <input type="checkbox" style={checkbox} checked={opts.gallery} onChange={(e) => setOpt({ gallery: e.target.checked })} />
              <span><strong>Design Gallery</strong> folders</span>
            </label>
            {opts.gallery && (
              <div style={{ marginLeft: 24 }}>
                {galleryFolders.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af", margin: "2px 0" }}>No gallery folders yet.</p>}
                {galleryFolders.map((f) => (
                  <label key={f.id} style={checkRow}>
                    <input
                      type="checkbox" style={checkbox}
                      checked={opts.galleryFolders.includes(f.id)}
                      onChange={(e) => setOpt({ galleryFolders: e.target.checked ? [...opts.galleryFolders, f.id] : opts.galleryFolders.filter((x) => x !== f.id) })}
                    />
                    {f.name} <span style={{ color: "#9ca3af" }}>({f.count} images)</span>
                  </label>
                ))}
              </div>
            )}
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "#9ca3af" }}>BOQ, Items Pricing, Material Models, Templates, Leads and Teams are never shared.</p>
          </div>

          {share === undefined && <p style={{ fontSize: 13, color: "#6b7280" }}>Loading…</p>}

          {share === null && (
            <div style={card}>
              <h4 style={h4}>Protect with a PIN (recommended)</h4>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="text" inputMode="numeric" maxLength={8} placeholder="4–8 digits, or empty for none" value={pinDraft} onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ""))} style={{ width: 220 }} />
                <button style={ghost} onClick={() => setPinDraft(randomPin())}>Random</button>
              </div>
              {!pinOk && <p style={{ color: "#b91c1c", fontSize: 12, margin: "6px 0 0" }}>PIN must be 4 to 8 digits.</p>}
              <div style={{ marginTop: 12 }}>
                <button style={btn("#2563eb", { opacity: busy || !pinOk || nothingSelected ? 0.5 : 1 })} disabled={busy || !pinOk || nothingSelected} onClick={() => publish(pinDraft)}>
                  {busy ? "Creating…" : "Create share link"}
                </button>
                {nothingSelected && <span style={{ marginLeft: 10, fontSize: 12, color: "#b91c1c" }}>Tick at least one thing to share.</span>}
              </div>
            </div>
          )}

          {share && (
            <>
              <div style={card}>
                <h4 style={h4}>Customer link {share.enabled ? <span style={{ color: "#059669" }}>● active</span> : <span style={{ color: "#b91c1c" }}>● turned off</span>}</h4>
                <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} style={{ width: "100%", fontSize: 12 }} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <button style={btn("#2563eb")} onClick={() => copy(link, "Link")}>Copy link</button>
                  <a href={link} target="_blank" rel="noreferrer" style={{ ...ghost, textDecoration: "none", display: "inline-block" }}>Open as customer ↗</a>
                  <button style={btn("#0f766e", { opacity: busy || nothingSelected ? 0.5 : 1 })} disabled={busy || nothingSelected} onClick={() => publish(undefined)}>{busy ? "Updating…" : "⟳ Update shared view"}</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <button style={ghost} disabled={busy} onClick={() => act({ action: "toggle", enabled: !share.enabled }, share.enabled ? "Link turned off — the customer can't open it." : "Link turned on.")}>
                    {share.enabled ? "Turn link off" : "Turn link on"}
                  </button>
                  <button style={ghost} disabled={busy} onClick={() => { if (window.confirm("Make a new link? The old link will stop working.")) act({ action: "regenerate" }, "New link made — the old one no longer works."); }}>New link</button>
                  {!confirmStop
                    ? <button style={{ ...ghost, color: "#b91c1c" }} onClick={() => setConfirmStop(true)}>Stop sharing…</button>
                    : <button style={btn("#dc2626")} disabled={busy} onClick={() => { setConfirmStop(false); act({ action: "delete" }, "Sharing stopped and the link removed."); setShownPin(""); }}>Yes, stop sharing &amp; delete link</button>}
                </div>
              </div>

              <div style={card}>
                <h4 style={h4}>PIN {share.hasPin ? <span style={{ color: "#059669" }}>● set</span> : <span style={{ color: "#b45309" }}>● none — anyone with the link can open it</span>}</h4>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="text" inputMode="numeric" maxLength={8} placeholder="New PIN (4–8 digits)" value={pinDraft} onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ""))} style={{ width: 200 }} />
                  <button style={ghost} onClick={() => setPinDraft(randomPin())}>Random</button>
                  <button style={btn("#2563eb", { opacity: busy || !/^\d{4,8}$/.test(pinDraft) ? 0.5 : 1 })} disabled={busy || !/^\d{4,8}$/.test(pinDraft)} onClick={() => run(async () => { setShare(await callShare("POST", { action: "setpin", projectId, pin: pinDraft }, projectId)); setShownPin(pinDraft); }, share.hasPin ? "PIN reset." : "PIN set.")}>
                    {share.hasPin ? "Reset PIN" : "Set PIN"}
                  </button>
                  {share.hasPin && <button style={ghost} disabled={busy} onClick={() => { act({ action: "setpin", pin: "" }, "PIN removed."); setShownPin(""); }}>Remove PIN</button>}
                </div>
                {shownPin ? (
                  <div style={{ marginTop: 10, padding: 10, background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 6, fontSize: 13 }}>
                    PIN: <strong style={{ letterSpacing: 2 }}>{shownPin}</strong> — note it down, it can't be shown again later (you can always reset it).
                    <div style={{ marginTop: 8 }}>
                      <button style={btn("#059669", { padding: "5px 12px", fontSize: 12 })} onClick={() => copy(`Your project details: ${link}\nPIN: ${shownPin}`, "Link and PIN message")}>Copy link + PIN message</button>
                    </div>
                  </div>
                ) : share.hasPin && (
                  <p style={{ margin: "8px 0 0", fontSize: 11, color: "#9ca3af" }}>For safety the PIN is stored scrambled, so it can't be displayed. If you forgot it, just reset it above. 5 wrong tries lock the link for 15 minutes; resetting the PIN unlocks it.</p>
                )}
              </div>
            </>
          )}

          {notice && <p style={{ color: "#047857", fontSize: 13, margin: "4px 0" }}>✓ {notice}</p>}
          {error && <p style={{ color: "#b91c1c", fontSize: 13, margin: "4px 0" }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}

export default ShareWithCustomerModal;
