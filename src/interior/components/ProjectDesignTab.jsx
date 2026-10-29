import { useLayoutEffect, useRef, useState } from "react";
import { uploadDesignFile } from "../utils/api";
import { stripExt, normEntry as norm, slimMoodItems } from "../utils/designFiles";
import MoodBoardCanvas from "./MoodBoardCanvas";

// Project > Design tab. One view per room showing, together:
//   • the room's Mood Board — built here, then FINALIZED (locked + saved as a
//     dated version; "Revise" reopens it, re-finalizing saves the next one),
//   • CAD drawings (PDF) shown inline — room.cadFiles,
//   • Final render images — room.renders.
// A "Whole project" view holds drawings that span every room (project.cadFiles).
//
// History is never lost: a drawing/render is an entry with a list of
// versions, and uploading a replacement APPENDS a version (the newest is the
// current one, older ones stay viewable). There is deliberately no delete —
// a wrong entry can be archived and restored. Only each file's URL is stored
// on the project/room; the file itself is on the server (uploadDesignFile),
// so the autosaved workspace stays small.

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);

const PDF = "application/pdf";
const IMG = "image/jpeg,image/png,image/webp";
const MOOD_W = 1123;
const MOOD_H = 794;

const fmtSize = (bytes) => {
  if (!bytes) return "";
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};
const fmtDate = (ms) =>
  ms ? new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Date not recorded";


const card = { border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff", marginBottom: 16, overflow: "hidden" };
const sectionTitle = { margin: "0 0 4px", fontSize: 16, color: "#1e3a5f" };
const hint = { margin: "0 0 12px", fontSize: 12, color: "#6b7280" };
const primaryBtn = { background: "#2563eb", color: "#fff", border: "none", padding: "7px 14px", fontSize: 13, borderRadius: 6, cursor: "pointer", fontWeight: 600 };
const smallBtn = { background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "4px 10px", fontSize: 12, borderRadius: 5, cursor: "pointer", textDecoration: "none", display: "inline-block" };
const bareInput = { width: "auto", border: "1px solid transparent", background: "transparent", padding: "4px 6px", borderRadius: 4 };

// Uploads each picked file in turn and reports each finished one through
// onDone, so several files chosen at once all land (onDone must be a
// functional update, never a stale-closure overwrite).
function useUploader(accept, onDone, multiple = true) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");

  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setError("");
    setBusy(files.length);
    for (const file of files) {
      try {
        const { url, size } = await uploadDesignFile(file);
        onDone({ id: uid(), name: file.name, url, size, addedAt: Date.now() });
      } catch (err) {
        setError(err.message);
      }
      setBusy((n) => n - 1);
    }
  };

  const input = <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display: "none" }} onChange={onPick} />;
  return { input, open: () => inputRef.current?.click(), busy, error };
}

function Lightbox({ url, onClose }) {
  if (!url) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 5000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, cursor: "zoom-out" }}>
      <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
    </div>
  );
}

// The file itself, shown in place: a PDF in an embedded viewer, an image
// in full (never cropped).
function FileView({ version, kind, onZoom }) {
  if (kind === "pdf") {
    return (
      <iframe
        title={version.name}
        src={`${version.url}#toolbar=1&navpanes=0&view=FitH`}
        loading="lazy"
        style={{ width: "100%", height: 680, border: "none", display: "block", background: "#f3f4f6" }}
      />
    );
  }
  return (
    <div onClick={() => onZoom(version.url)} style={{ height: "72vh", minHeight: 360, background: "#f3f4f6", cursor: "zoom-in" }}>
      <img src={version.url} alt={version.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
  );
}

// One drawing / render with its whole revision history.
function RevisionEntry({ entry, kind, onChange, onZoom }) {
  const e = norm(entry);
  const { versions } = e;
  const current = versions[versions.length - 1];
  const older = versions.slice(0, -1).reverse(); // newest first
  const [showHistory, setShowHistory] = useState(false);
  const [viewId, setViewId] = useState("");
  const viewed = viewId ? versions.find((v) => v.id === viewId) : null;
  const shown = viewed || current;

  const up = useUploader(kind === "pdf" ? PDF : IMG, (item) =>
    onChange((x) => ({ ...x, versions: [...x.versions, { id: item.id, name: item.name, url: item.url, size: item.size, addedAt: item.addedAt, note: "" }] })),
    false
  );
  const setNote = (vid, note) =>
    onChange((x) => ({ ...x, versions: x.versions.map((v) => (v.id === vid ? { ...v, note } : v)) }));

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", flexWrap: "wrap" }}>
        <span style={{ fontSize: 18 }}>{kind === "pdf" ? "📐" : "🖼️"}</span>
        <input
          type="text" value={e.title} onChange={(ev) => onChange((x) => ({ ...x, title: ev.target.value }))}
          title="Title — rename freely"
          style={{ ...bareInput, flex: 1, minWidth: 160, fontWeight: 600, fontSize: 14 }}
          onFocus={(ev) => (ev.target.style.border = "1px solid #d1d5db")} onBlur={(ev) => (ev.target.style.border = "1px solid transparent")}
        />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#374151", cursor: "pointer" }} title="Show the current version on the customer share link (history is never shown)">
          <input type="checkbox" style={{ width: 15, height: 15, margin: 0, flexShrink: 0 }} checked={!!e.customerVisible} onChange={(ev) => onChange((x) => ({ ...x, customerVisible: ev.target.checked }))} />
          Show to customer
        </label>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#0f766e", background: "#ccfbf1", borderRadius: 10, padding: "2px 9px" }}>v{versions.length}</span>
        {up.input}
        <button style={smallBtn} onClick={up.open} disabled={up.busy > 0}>{up.busy > 0 ? "Uploading…" : "⬆ Upload new version"}</button>
        <button style={smallBtn} title="Hide this entry (it is kept, and can be restored)" onClick={() => onChange((x) => ({ ...x, archived: true }))}>Archive</button>
      </div>
      {up.error && <p style={{ color: "#b91c1c", fontSize: 12, margin: "8px 14px 0" }}>{up.error}</p>}

      <div style={{ padding: "8px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "#6b7280" }}>
        <span>
          {viewed ? <strong style={{ color: "#b45309" }}>Viewing older version v{versions.indexOf(viewed) + 1}</strong> : <strong style={{ color: "#059669" }}>Current — v{versions.length}</strong>}
          {" · "}{fmtDate(shown.addedAt)} {shown.size ? `· ${fmtSize(shown.size)}` : ""}
        </span>
        {viewed && <button style={smallBtn} onClick={() => setViewId("")}>← Back to current</button>}
        <a style={smallBtn} href={shown.url} target="_blank" rel="noreferrer">Open in new tab ↗</a>
        <a style={smallBtn} href={shown.url} download={shown.name}>Download</a>
      </div>
      <FileView version={shown} kind={kind} onZoom={onZoom} />

      <div style={{ padding: "8px 14px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#6b7280" }}>Note for this version:</span>
        <input type="text" placeholder="e.g. Revised as per client feedback" value={current.note || ""} onChange={(ev) => setNote(current.id, ev.target.value)} style={{ flex: 1, minWidth: 200, width: "auto", fontSize: 12, padding: "4px 6px" }} />
      </div>

      {older.length > 0 && (
        <div style={{ borderTop: "1px solid #e5e7eb", padding: "8px 14px", background: "#fafafa" }}>
          <button style={smallBtn} onClick={() => setShowHistory((s) => !s)}>{showHistory ? "▾" : "▸"} History ({older.length} earlier version{older.length > 1 ? "s" : ""})</button>
          {showHistory && (
            <div style={{ marginTop: 8 }}>
              {older.map((v) => {
                const n = versions.indexOf(v) + 1;
                return (
                  <div key={v.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", borderBottom: "1px dashed #e5e7eb", flexWrap: "wrap", fontSize: 12 }}>
                    <strong style={{ width: 28 }}>v{n}</strong>
                    <span style={{ color: "#6b7280", minWidth: 150 }}>{fmtDate(v.addedAt)}</span>
                    <input type="text" placeholder="Note" value={v.note || ""} onChange={(ev) => setNote(v.id, ev.target.value)} style={{ flex: 1, minWidth: 140, width: "auto", fontSize: 12, padding: "3px 6px" }} />
                    <button style={smallBtn} onClick={() => setViewId(v.id)}>View</button>
                    <a style={smallBtn} href={v.url} target="_blank" rel="noreferrer">Open ↗</a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A titled group of RevisionEntry cards plus "add new" and the archive.
// onEntries(fn) takes a function from the current list to the new list.
function RevisionSection({ title, hint: hintText, kind, entries, onEntries, addLabel, onZoom }) {
  const [showArchived, setShowArchived] = useState(false);
  const up = useUploader(kind === "pdf" ? PDF : IMG, (item) =>
    onEntries((list) => [...list, { id: item.id, title: stripExt(item.name), versions: [{ id: `${item.id}_v1`, name: item.name, url: item.url, size: item.size, addedAt: item.addedAt, note: "" }] }])
  );
  const active = entries.filter((x) => !x.archived);
  const archived = entries.filter((x) => x.archived);
  const change = (id) => (fn) => onEntries((list) => list.map((x) => (x.id === id ? fn(norm(x)) : x)));

  return (
    <div style={{ marginBottom: 26 }}>
      <h3 style={sectionTitle}>{title}</h3>
      <p style={hint}>{hintText}</p>
      <div style={{ marginBottom: 12 }}>
        {up.input}
        <button style={primaryBtn} onClick={up.open} disabled={up.busy > 0}>{up.busy > 0 ? `Uploading ${up.busy}…` : addLabel}</button>
        {up.error && <span style={{ color: "#b91c1c", fontSize: 12, marginLeft: 10 }}>{up.error}</span>}
      </div>
      {active.length === 0 && <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Nothing added yet.</p>}
      {active.map((x) => <RevisionEntry key={x.id} entry={x} kind={kind} onChange={change(x.id)} onZoom={onZoom} />)}
      {archived.length > 0 && (
        <div>
          <button style={smallBtn} onClick={() => setShowArchived((s) => !s)}>{showArchived ? "▾" : "▸"} Archived ({archived.length})</button>
          {showArchived && archived.map((x) => (
            <div key={x.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", fontSize: 13 }}>
              <span style={{ flex: 1 }}>{norm(x).title} <span style={{ color: "#9ca3af" }}>({norm(x).versions.length} version{norm(x).versions.length > 1 ? "s" : ""})</span></span>
              <button style={smallBtn} onClick={() => change(x.id)((e) => ({ ...e, archived: false }))}>Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Read-only mood board, scaled from its fixed 1123×794 canvas to fit.
function MoodBoardPreview({ items }) {
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
    <div ref={wrapRef} style={{ width: "100%", height: MOOD_H * scale, position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: MOOD_W, height: MOOD_H, transform: `scale(${scale})`, transformOrigin: "top left", background: "#fdfcfb", border: "1px solid #e5e7eb", overflow: "hidden", boxSizing: "border-box" }}>
        {items.map((it, i) => (
          <div key={i} style={{ position: "absolute", left: it.x, top: it.y, width: it.w, height: it.h, zIndex: it.zIndex || 1, border: "1px solid rgba(0,0,0,0.1)", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}>
            <img src={it.imageUrl} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MoodSection({ room, designGallery, updateRoom }) {
  const items = room.moodBoard?.items || [];
  const versions = room.moodBoardVersions || [];
  const locked = !!room.moodBoardLocked;
  const [viewId, setViewId] = useState("");
  const viewed = viewId ? versions.find((v) => v.id === viewId) : null;

  const finalize = () =>
    updateRoom((r) => ({
      ...r,
      moodBoardLocked: true,
      moodBoardVersions: [...(r.moodBoardVersions || []), { id: uid(), savedAt: Date.now(), note: "", items: slimMoodItems(r.moodBoard?.items) }],
    }));
  const setNote = (id, note) =>
    updateRoom((r) => ({ ...r, moodBoardVersions: (r.moodBoardVersions || []).map((v) => (v.id === id ? { ...v, note } : v)) }));

  let status;
  if (locked) status = <span style={{ color: "#059669", fontWeight: 700 }}>✔ Finalized — v{versions.length}{versions.length ? ` · ${fmtDate(versions[versions.length - 1].savedAt)}` : ""}</span>;
  else if (versions.length) status = <span style={{ color: "#b45309", fontWeight: 700 }}>✎ Revising — last finalized v{versions.length} is what the customer sees</span>;
  else status = <span style={{ color: "#b45309", fontWeight: 700 }}>Draft — not finalized yet (not shown to the customer)</span>;

  return (
    <div style={{ marginBottom: 26 }}>
      <h3 style={sectionTitle}>🎨 Mood Board</h3>
      <p style={hint}>Build the board here, then press Finalize to lock it and save it as a dated version. Use Revise to change a finalized board — earlier versions stay in History.</p>
      <div style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
        {status}
        {!locked && <button style={primaryBtn} onClick={finalize} disabled={items.length === 0}>✔ Finalize mood board</button>}
        {locked && <button style={smallBtn} onClick={() => updateRoom((r) => ({ ...r, moodBoardLocked: false }))}>✎ Revise</button>}
      </div>

      {viewed ? (
        <>
          <div style={{ marginBottom: 8, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 12, color: "#b45309" }}>Viewing finalized v{versions.indexOf(viewed) + 1} — {fmtDate(viewed.savedAt)}</strong>
            <button style={smallBtn} onClick={() => setViewId("")}>← Back to current board</button>
          </div>
          <MoodBoardPreview items={viewed.items} />
        </>
      ) : locked ? (
        items.length === 0 ? <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>This finalized board is empty.</p> : <MoodBoardPreview items={items} />
      ) : (
        <MoodBoardCanvas
          room={room}
          designGallery={designGallery}
          onChange={(moodBoard) => updateRoom((r) => ({ ...r, moodBoard }))}
        />
      )}

      {versions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 4 }}>Finalized versions ({versions.length})</div>
          {[...versions].reverse().map((v) => (
            <div key={v.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", borderBottom: "1px dashed #e5e7eb", flexWrap: "wrap", fontSize: 12 }}>
              <strong style={{ width: 28 }}>v{versions.indexOf(v) + 1}</strong>
              <span style={{ color: "#6b7280", minWidth: 150 }}>{fmtDate(v.savedAt)}</span>
              <span style={{ color: "#9ca3af" }}>{v.items.length} image{v.items.length === 1 ? "" : "s"}</span>
              <input type="text" placeholder="Note" value={v.note || ""} onChange={(ev) => setNote(v.id, ev.target.value)} style={{ flex: 1, minWidth: 140, width: "auto", fontSize: 12, padding: "3px 6px" }} />
              <button style={smallBtn} onClick={() => setViewId(v.id)}>View</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * updateProject(fn) / updateRoom(roomId, fn) take a function from the current
 * record to the new one — functional so that several files finishing
 * uploading around the same time all get kept.
 */
function ProjectDesignTab({ project, rooms, designGallery, onAddRoom, updateProject, updateRoom }) {
  const [activeKey, setActiveKey] = useState("");
  const [lightbox, setLightbox] = useState("");
  const key = activeKey === "project" || rooms.some((r) => r.id === activeKey) ? activeKey : rooms[0]?.id ?? "project";
  const room = rooms.find((r) => r.id === key);

  const tab = (id, label) => {
    const active = key === id;
    return (
      <button key={id} onClick={() => setActiveKey(id)} style={{ padding: "7px 16px", border: "none", borderBottom: active ? "3px solid #2563eb" : "3px solid transparent", background: "none", color: active ? "#2563eb" : "#374151", fontWeight: active ? 700 : 400, cursor: "pointer", fontSize: 14, marginBottom: -2, whiteSpace: "nowrap" }}>
        {label}
      </button>
    );
  };

  return (
    <>
      <div style={{ borderBottom: "2px solid #e5e7eb", padding: "0 24px", display: "flex", alignItems: "flex-end", gap: 2, flexWrap: "wrap", background: "#fff" }}>
        {rooms.map((r) => tab(r.id, r.subProject || r.name))}
        {tab("project", "📁 Whole project")}
        {onAddRoom && (
          <button onClick={onAddRoom} style={{ padding: "10px 14px", border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 13, marginLeft: 4, whiteSpace: "nowrap" }}>+ Room</button>
        )}
      </div>
      <div style={{ padding: "20px 24px" }}>
        {room ? (
          <>
            <MoodSection key={room.id} room={room} designGallery={designGallery} updateRoom={(fn) => updateRoom(room.id, fn)} />
            <RevisionSection
              title="📐 CAD Drawings" kind="pdf" addLabel="+ Add CAD drawing (PDF)" onZoom={setLightbox}
              hint="PDF drawings for this room open right here — no download needed. Upload a new version to replace the current one; earlier versions stay in History."
              entries={room.cadFiles || []}
              onEntries={(fn) => updateRoom(room.id, (r) => ({ ...r, cadFiles: fn(r.cadFiles || []) }))}
            />
            <RevisionSection
              title="🖼️ Final Render" kind="image" addLabel="+ Add final render" onZoom={setLightbox}
              hint="The approved final render image(s) for this room (JPG, PNG or WEBP, up to 25 MB). A new version keeps the earlier ones in History."
              entries={room.renders || []}
              onEntries={(fn) => updateRoom(room.id, (r) => ({ ...r, renders: fn(r.renders || []) }))}
            />
          </>
        ) : key === "project" ? (
          <RevisionSection
            title="📐 Whole-project CAD Drawings" kind="pdf" addLabel="+ Add CAD drawing (PDF)" onZoom={setLightbox}
            hint="Drawings that cover the whole project (floor plans, layouts). Versions are kept in History."
            entries={project.cadFiles || []}
            onEntries={(fn) => updateProject((p) => ({ ...p, cadFiles: fn(p.cadFiles || []) }))}
          />
        ) : (
          <p style={{ fontSize: 13, color: "#9ca3af" }}>Add a room to this project first (Rooms &amp; Boxes tab).</p>
        )}
      </div>
      <Lightbox url={lightbox} onClose={() => setLightbox("")} />
    </>
  );
}

export default ProjectDesignTab;
