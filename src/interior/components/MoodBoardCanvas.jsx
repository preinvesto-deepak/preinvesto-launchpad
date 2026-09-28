import { useState } from "react";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);

// A4 landscape @ 96dpi — fixed so the board is export/print-ready as-is,
// without needing to resize anything later for a PDF/print output.
const CANVAS_W = 1123;
const CANVAS_H = 794;

const DEFAULT_ITEM_W = 200;
const DEFAULT_ITEM_H = 150;

function emptyBoard() {
  return { items: [], nextZIndex: 1 };
}

function coverOf(node) {
  return (node.images || []).find((i) => i.isDisplay) || (node.images || [])[0] || null;
}
function countImages(node) {
  return (node.images || []).length + (node.children || []).reduce((s, c) => s + countImages(c), 0);
}

// Same folder-tile look as DesignGallery.jsx's FolderCard (tab + body,
// favorite image as the cover) so browsing here feels like the same place —
// just selection-only, no rename/delete.
function PickerFolderCard({ node, onOpen }) {
  const cover = coverOf(node);
  const imgCount = countImages(node);
  const subCount = (node.children || []).length;
  return (
    <div onClick={() => onOpen(node.id)} style={{ width: 300, cursor: "pointer", userSelect: "none" }}>
      <div style={{ width: 104, height: 26, background: "#ddd6fe", borderRadius: "16px 16px 0 0", marginLeft: 16 }} />
      <div style={{ width: "100%", height: 216, background: "#ddd6fe", borderRadius: "0 20px 20px 20px", overflow: "hidden", position: "relative", marginTop: -1, boxShadow: "0 3px 8px rgba(0,0,0,0.1)" }}>
        {cover ? (
          <img src={cover.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60, opacity: 0.7 }}>📁</div>
        )}
        {imgCount > 0 && (
          <span style={{ position: "absolute", bottom: 10, right: 10, fontSize: 14, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 14, padding: "3px 10px" }}>🖼 {imgCount}</span>
        )}
        {subCount > 0 && (
          <span style={{ position: "absolute", bottom: 10, left: 10, fontSize: 14, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 14, padding: "3px 10px" }}>📁 {subCount}</span>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: 16, fontWeight: 600, color: "#374151", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</div>
    </div>
  );
}

// Same drill-down browsing model as DesignGallery.jsx (breadcrumb + folder
// grid), but selection-only: clicking an image adds it to the board and
// closes the picker. Thumbnails are shown large — this is the step users
// pick from, so small/cramped tiles defeat the point.
function ImagePickerModal({ designGallery, onPick, onClose }) {
  const [pathIds, setPathIds] = useState([]);
  const resolvePath = () => {
    const path = [];
    let level = designGallery || [];
    for (const id of pathIds) {
      const node = level.find((n) => n.id === id);
      if (!node) break;
      path.push(node);
      level = node.children || [];
    }
    return path;
  };
  const path = resolvePath();
  const currentNode = path.length ? path[path.length - 1] : null;
  const currentChildren = currentNode ? currentNode.children : (designGallery || []);
  const currentImages = currentNode ? (currentNode.images || []) : [];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: 1200, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#1e3a5f" }}>Add image from gallery</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#6b7280" }}>✕</button>
        </div>

        <div style={{ padding: "12px 20px 0", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, fontSize: 13 }}>
          <span
            onClick={() => setPathIds([])}
            style={{ cursor: "pointer", fontWeight: path.length === 0 ? 700 : 500, color: path.length === 0 ? "#1e3a5f" : "#7c3aed" }}
          >🏠 All Groups</span>
          {path.map((n, i) => (
            <span key={n.id}>
              <span style={{ color: "#cbd5e1", margin: "0 4px" }}>/</span>
              <span
                onClick={() => setPathIds((prev) => prev.slice(0, i + 1))}
                style={{ cursor: "pointer", fontWeight: i === path.length - 1 ? 700 : 500, color: i === path.length - 1 ? "#1e3a5f" : "#7c3aed" }}
              >{n.name}</span>
            </span>
          ))}
        </div>

        <div style={{ padding: 20, overflow: "auto" }}>
          {(!designGallery || designGallery.length === 0) ? (
            <div style={{ color: "#9ca3af", fontSize: 13, padding: 16, textAlign: "center" }}>
              No images yet — add some under Configure &gt; Design Gallery first.
            </div>
          ) : (
            <>
              {currentChildren.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginBottom: currentImages.length ? 24 : 0 }}>
                  {currentChildren.map((n) => (
                    <PickerFolderCard key={n.id} node={n} onOpen={(id) => setPathIds((prev) => [...prev, id])} />
                  ))}
                </div>
              )}
              {currentImages.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
                  {currentImages.map((img) => (
                    <div
                      key={img.id}
                      onClick={() => onPick(img)}
                      title={`Add "${img.name}"`}
                      style={{ aspectRatio: "4 / 3", borderRadius: 14, overflow: "hidden", border: "1px solid #e5e7eb", cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.08)", transition: "transform 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.03)")}
                      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                    >
                      <img src={img.url} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  ))}
                </div>
              )}
              {currentChildren.length === 0 && currentImages.length === 0 && (
                <div style={{ color: "#9ca3af", fontSize: 13, padding: 16, textAlign: "center" }}>
                  This group has no images yet — add some under Configure &gt; Design Gallery.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Freeform per-room Mood Board — drag, resize, and layer images picked from
 * the Design Gallery onto a fixed A4-landscape canvas. No drag/resize
 * library is used (none exists in this repo); item geometry is tracked as
 * plain { x, y, w, h, zIndex } and updated via raw pointer events.
 *
 * Every mutation calls onChange(newBoard) immediately — there's no
 * local-only state that could drift from what's persisted, mirroring how
 * every other room field already updates via Projects.jsx's updateRoomField.
 */
function MoodBoardCanvas({ room, designGallery, onChange }) {
  const board = room?.moodBoard || emptyBoard();
  const items = board.items || [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const bringToFront = (id) => {
    const z = board.nextZIndex;
    onChange({ items: items.map((i) => (i.id === id ? { ...i, zIndex: z } : i)), nextZIndex: z + 1 });
  };
  const updateItem = (id, patch) => {
    onChange({ items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)), nextZIndex: board.nextZIndex });
  };
  const deleteItem = (id) => {
    onChange({ items: items.filter((i) => i.id !== id), nextZIndex: board.nextZIndex });
    setSelectedId(null);
  };

  const addImage = (img) => {
    const offset = (items.length % 6) * 14;
    const newItem = {
      id: uid(),
      imageUrl: img.url,
      sourceImageId: img.id,
      x: 40 + offset,
      y: 40 + offset,
      w: DEFAULT_ITEM_W,
      h: DEFAULT_ITEM_H,
      zIndex: board.nextZIndex,
    };
    onChange({ items: [...items, newItem], nextZIndex: board.nextZIndex + 1 });
    setPickerOpen(false);
  };

  const onItemPointerDown = (e, item) => {
    e.stopPropagation();
    setSelectedId(item.id);
    bringToFront(item.id);
    const startX = e.clientX, startY = e.clientY;
    const origX = item.x, origY = item.y;
    const onMove = (ev) => updateItem(item.id, { x: origX + (ev.clientX - startX), y: origY + (ev.clientY - startY) });
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onResizePointerDown = (e, item) => {
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const origW = item.w, origH = item.h;
    const onMove = (ev) => updateItem(item.id, {
      w: Math.max(40, origW + (ev.clientX - startX)),
      h: Math.max(40, origH + (ev.clientY - startY)),
    });
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!room) return null;

  return (
    <div>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
        }
      `}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f" }}>Mood Board — {room.subProject || room.name}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPickerOpen(true)} style={{ background: "#2563eb", padding: "6px 14px", fontSize: 13 }}>+ Add Image</button>
          <button onClick={() => window.print()} style={{ background: "#0369a1", padding: "6px 14px", fontSize: 13 }}>🖨 Print / Export</button>
        </div>
      </div>

      <div
        id="mood-board-canvas"
        onClick={() => setSelectedId(null)}
        style={{
          position: "relative", width: CANVAS_W, height: CANVAS_H, maxWidth: "100%",
          background: "#fdfcfb", border: "1px solid #e5e7eb", borderRadius: 6,
          overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        {items.length === 0 && (
          <div className="no-print" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
            Click "+ Add Image" to start building this room's mood board.
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            onPointerDown={(e) => onItemPointerDown(e, item)}
            style={{
              position: "absolute", left: item.x, top: item.y, width: item.w, height: item.h, zIndex: item.zIndex,
              border: selectedId === item.id ? "2px solid #2563eb" : "1px solid rgba(0,0,0,0.1)",
              boxShadow: "0 2px 6px rgba(0,0,0,0.15)", cursor: "move",
            }}
          >
            <img src={item.imageUrl} draggable={false} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
            <div
              className="no-print"
              onPointerDown={(e) => onResizePointerDown(e, item)}
              title="Drag to resize"
              style={{ position: "absolute", right: -4, bottom: -4, width: 12, height: 12, background: "#2563eb", borderRadius: 3, cursor: "nwse-resize" }}
            />
            <button
              className="no-print"
              onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
              title="Remove"
              style={{ position: "absolute", top: -9, right: -9, width: 18, height: 18, borderRadius: "50%", background: "#dc2626", color: "#fff", border: "none", fontSize: 11, cursor: "pointer", lineHeight: "18px", padding: 0 }}
            >✕</button>
          </div>
        ))}
      </div>

      {pickerOpen && (
        <ImagePickerModal designGallery={designGallery} onPick={addImage} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

export default MoodBoardCanvas;
