import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

// Public, read-only page a customer opens from the owner's share link
// (/view/<code>). No login, no workspace data — it only ever renders the
// snapshot the owner published, fetched through interior_share_view.
//
// Self-contained on purpose: it sits outside the Interior app shell (no
// sidebar, no AppDataProvider) and ships its own inline styles.

const API_URL = import.meta.env.VITE_API_URL || "";
const MOOD_W = 1123;
const MOOD_H = 794;

const pinKey = (code) => `interior_share_pin_${code}`;
const readPin = (code) => { try { return sessionStorage.getItem(pinKey(code)) || ""; } catch { return ""; } };
const savePin = (code, pin) => { try { sessionStorage.setItem(pinKey(code), pin); } catch { /* private mode */ } };
const clearPin = (code) => { try { sessionStorage.removeItem(pinKey(code)); } catch { /* ignore */ } };

async function fetchShare(code, pin) {
  const res = await fetch(`${API_URL}/api/interior_share_view.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, pin }),
  });
  let data = {};
  try { data = await res.json(); } catch { throw new Error("The server returned an unexpected response."); }
  if (!res.ok || !data.success) {
    const err = new Error(data.error || "Something went wrong.");
    err.status = res.status;
    throw err;
  }
  return data;
}

// Mood boards are authored on a fixed 1123×794 canvas; this scales the whole
// board down to whatever width the customer's screen has.
function MoodBoardView({ board }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(1, el.clientWidth / MOOD_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ margin: "0 0 10px", fontSize: 16, color: "#1e3a5f" }}>{board.room}</h3>
      <div ref={wrapRef} style={{ width: "100%", height: MOOD_H * scale, position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: MOOD_W, height: MOOD_H, transform: `scale(${scale})`, transformOrigin: "top left", background: "#fdfcfb", border: "1px solid #e5e7eb", overflow: "hidden", boxSizing: "border-box" }}>
          {board.items.map((it, i) => (
            <div key={i} style={{ position: "absolute", left: it.x, top: it.y, width: it.w, height: it.h, zIndex: it.zIndex, border: "1px solid rgba(0,0,0,0.1)", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
              <img src={it.imageUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// A shared CAD drawing: shown in place in an embedded viewer.
function CadView({ file }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>📐 {file.title}</span>
        <a href={file.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#1e3a5f" }}>Open in new tab ↗</a>
      </div>
      <iframe title={file.title} src={`${file.url}#toolbar=1&navpanes=0&view=FitH`} loading="lazy" style={{ width: "100%", height: 620, border: "none", display: "block" }} />
    </div>
  );
}

// Design tab: a tab per room, and inside each room its Mood Board, CAD
// Drawings and Final Render (only the ones that were shared).
function DesignView({ design, onOpen }) {
  const rooms = [
    ...design.rooms.map((r, i) => ({ id: String(i), label: r.room, data: r })),
    ...(design.projectCad.length ? [{ id: "project", label: "Whole project", data: { mood: null, cad: design.projectCad, renders: [] } }] : []),
  ];
  const [roomId, setRoomId] = useState("");
  const [section, setSection] = useState("");
  const room = rooms.find((x) => x.id === roomId) || rooms[0];
  const d = room.data;
  const sections = [
    d.mood && { id: "mood", label: "Mood Board" },
    d.cad.length > 0 && { id: "cad", label: `CAD Drawings (${d.cad.length})` },
    d.renders.length > 0 && { id: "render", label: `Final Render (${d.renders.length})` },
  ].filter(Boolean);
  const active = sections.find((x) => x.id === section) ? section : sections[0]?.id;

  return (
    <div>
      {rooms.length > 1 && (
        <div className="cv-noprint" style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "2px solid #e5e7eb", marginBottom: 16 }}>
          {rooms.map((x) => (
            <button key={x.id} onClick={() => setRoomId(x.id)} style={{ background: "none", border: "none", borderBottom: room.id === x.id ? "3px solid #1e3a5f" : "3px solid transparent", marginBottom: -2, padding: "8px 14px", fontSize: 15, fontWeight: 700, color: room.id === x.id ? "#1e3a5f" : "#6b7280", cursor: "pointer" }}>{x.label}</button>
          ))}
        </div>
      )}
      <h2 style={{ margin: "0 0 12px", fontSize: 19, color: "#1e3a5f" }}>{room.label}</h2>
      <div className="cv-noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {sections.map((x) => (
          <button key={x.id} onClick={() => setSection(x.id)} style={{ border: "1px solid " + (active === x.id ? "#1e3a5f" : "#d1d5db"), background: active === x.id ? "#1e3a5f" : "#fff", color: active === x.id ? "#fff" : "#374151", borderRadius: 20, padding: "6px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{x.label}</button>
        ))}
      </div>

      {active === "mood" && <MoodBoardView board={{ room: "", items: d.mood.items }} />}
      {active === "cad" && d.cad.map((c, j) => <CadView key={j} file={c} />)}
      {active === "render" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {d.renders.map((img, j) => (
            <figure key={j} style={{ margin: 0 }}>
              {/* One render per row at full page width; capped to the window height so the whole image is visible without scrolling. */}
              <button onClick={() => onOpen(img.url)} style={{ display: "block", width: "100%", border: "1px solid #e5e7eb", background: "#fff", padding: 0, borderRadius: 8, overflow: "hidden", cursor: "zoom-in" }}>
                <img src={img.url} alt={img.title} style={{ display: "block", width: "100%", height: "auto", maxHeight: "calc(100vh - 220px)", minHeight: 240, objectFit: "contain" }} />
              </button>
              {img.title && <figcaption style={{ fontSize: 13, color: "#6b7280", marginTop: 6 }}>{img.title}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {sections.length === 0 && <p style={{ color: "#6b7280" }}>Nothing has been shared for this room yet.</p>}
    </div>
  );
}

function GalleryFolder({ node, depth, onOpen }) {
  return (
    <div style={{ marginBottom: 22, marginLeft: depth ? 14 : 0 }}>
      <h3 style={{ margin: "0 0 10px", fontSize: depth ? 14 : 16, color: "#1e3a5f" }}>📁 {node.name}</h3>
      {node.images.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
          {node.images.map((img, i) => (
            <button key={i} onClick={() => onOpen(img.url)} style={{ border: "1px solid #e5e7eb", background: "#fff", padding: 0, borderRadius: 8, overflow: "hidden", cursor: "zoom-in", aspectRatio: "4 / 3" }}>
              <img src={img.url} alt={img.name || ""} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </button>
          ))}
        </div>
      )}
      {node.children.map((c, i) => <GalleryFolder key={i} node={c} depth={depth + 1} onOpen={onOpen} />)}
    </div>
  );
}

function QuotationFrame({ html, frameRef }) {
  const fit = useCallback(() => {
    const f = frameRef.current;
    const doc = f && f.contentDocument;
    if (doc && doc.documentElement) f.style.height = `${doc.documentElement.scrollHeight + 4}px`;
  }, [frameRef]);
  return (
    // No allow-scripts: the page can never run code. allow-same-origin only lets
    // this page size and print the frame; allow-modals is for the print dialog.
    <iframe
      ref={frameRef}
      title="Quotation"
      sandbox="allow-same-origin allow-modals"
      srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>@media print{@page{size:A4;margin:0}body{margin:0}} body{margin:0;background:#fff}</style></head><body>${html}</body></html>`}
      onLoad={fit}
      style={{ width: "100%", border: "none", background: "#fff", minHeight: 400, display: "block" }}
    />
  );
}

function CustomerView() {
  const { code = "" } = useParams();
  const [state, setState] = useState("loading"); // loading | pin | ready | error
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("");
  const [lightbox, setLightbox] = useState("");
  const frameRef = useRef(null);

  // Keep the shared page out of search engines and referrer logs.
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots"; robots.content = "noindex, nofollow";
    const ref = document.createElement("meta");
    ref.name = "referrer"; ref.content = "no-referrer";
    document.head.append(robots, ref);
    const prevTitle = document.title;
    return () => { robots.remove(); ref.remove(); document.title = prevTitle; };
  }, []);

  const open = useCallback(async (pin) => {
    setBusy(true); setError("");
    try {
      const res = await fetchShare(code, pin);
      if (res.pinRequired) { setState("pin"); return; }
      if (pin) savePin(code, pin);
      setData(res.data);
      setState("ready");
    } catch (e) {
      if (pin && e.status === 401) { clearPin(code); setError(e.message); setState("pin"); }
      else if (e.status === 429) { setError(e.message); setState("pin"); }
      else { setError(e.message); setState("error"); }
    } finally {
      setBusy(false);
    }
  }, [code]);

  useEffect(() => { open(readPin(code)); }, [code, open]);

  useEffect(() => {
    if (!data) return;
    document.title = `${data.project?.name || "Project"} — ${data.company?.name || ""}`.trim();
    const first = data.quotation ? "quotation" : data.design ? "design" : data.moodBoards?.length ? "mood" : data.gallery?.length ? "gallery" : "";
    setTab((t) => t || first);
  }, [data]);

  const wrap = { minHeight: "100vh", background: "#f3f4f6", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#111827" };

  if (state === "loading") {
    return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}>Loading…</div>;
  }

  if (state === "error") {
    return (
      <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 12, padding: 28, maxWidth: 380, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: 34 }}>🔒</div>
          <h2 style={{ margin: "8px 0" }}>Link not available</h2>
          <p style={{ color: "#6b7280", margin: 0 }}>{error || "This link is no longer active."} Please ask the sender for a new link.</p>
        </div>
      </div>
    );
  }

  if (state === "pin") {
    return (
      <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (pinInput) open(pinInput); }}
          style={{ background: "#fff", borderRadius: 12, padding: 28, width: "100%", maxWidth: 340, textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
        >
          <div style={{ fontSize: 34 }}>🔐</div>
          <h2 style={{ margin: "8px 0 4px" }}>Enter PIN</h2>
          <p style={{ color: "#6b7280", margin: "0 0 16px", fontSize: 14 }}>This page is protected. Enter the PIN you were given.</p>
          <input
            type="password" inputMode="numeric" autoFocus autoComplete="off" maxLength={8} value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
            style={{ width: "100%", boxSizing: "border-box", padding: "12px", fontSize: 20, textAlign: "center", letterSpacing: 6, border: "1px solid #d1d5db", borderRadius: 8 }}
          />
          {error && <p style={{ color: "#b91c1c", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
          <button type="submit" disabled={busy || !pinInput} style={{ marginTop: 16, width: "100%", padding: "11px", background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: busy || !pinInput ? 0.6 : 1 }}>
            {busy ? "Checking…" : "View"}
          </button>
        </form>
      </div>
    );
  }

  const tabs = [
    data.quotation && { id: "quotation", label: "Quotation" },
    data.design && { id: "design", label: "Design" },
    // Older published links carried mood boards on their own tab.
    data.moodBoards?.length > 0 && { id: "mood", label: "Mood Board" },
    data.gallery?.length > 0 && { id: "gallery", label: "Design Gallery" },
  ].filter(Boolean);
  const active = tabs.find((t) => t.id === tab) ? tab : tabs[0]?.id;

  const print = () => {
    if (active === "quotation") frameRef.current?.contentWindow?.print();
    else window.print();
  };

  return (
    <div style={wrap}>
      <style>{`@media print { .cv-noprint { display: none !important; } body { background: #fff; } }`}</style>
      <header className="cv-noprint" style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {data.company?.logo && <img src={data.company.logo} alt="" style={{ width: 52, height: 52, objectFit: "contain" }} />}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{data.company?.name}</div>
            <div style={{ color: "#6b7280", fontSize: 13 }}>
              {data.project?.name}{data.project?.customer ? ` · Prepared for ${data.project.customer}` : ""}
            </div>
          </div>
          <button onClick={print} style={{ background: "#1e3a5f", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🖨 Print / Save PDF</button>
        </div>
        {tabs.length > 1 && (
          <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 16px", display: "flex", gap: 4 }}>
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "none", border: "none", borderBottom: active === t.id ? "3px solid #1e3a5f" : "3px solid transparent", padding: "10px 14px", fontSize: 14, fontWeight: 600, color: active === t.id ? "#1e3a5f" : "#6b7280", cursor: "pointer" }}>{t.label}</button>
            ))}
          </div>
        )}
      </header>

      <main style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
        {tabs.length === 0 && <p style={{ color: "#6b7280" }}>Nothing has been shared on this page yet.</p>}
        {active === "quotation" && (
          <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <QuotationFrame html={data.quotation.html} frameRef={frameRef} />
          </div>
        )}
        {active === "design" && <DesignView design={data.design} onOpen={setLightbox} />}
        {active === "mood" && data.moodBoards.map((b, i) => <MoodBoardView key={i} board={b} />)}
        {active === "gallery" && data.gallery.map((n, i) => <GalleryFolder key={i} node={n} depth={0} onOpen={setLightbox} />)}
      </main>

      {lightbox && (
        <div className="cv-noprint" onClick={() => setLightbox("")} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, cursor: "zoom-out" }}>
          <img src={lightbox} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
}

export default CustomerView;
