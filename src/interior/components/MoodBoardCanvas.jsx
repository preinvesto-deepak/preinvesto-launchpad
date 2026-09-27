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

// Read-only recursive browser over the Design Gallery tree, for picking an
// image to drop onto the canvas — same tree shape as DesignGallery.jsx's
// TreeNode, but selection-only (no add/rename/delete here).
function PickerNode({ node, depth, onPick }) {
  const [open, setOpen] = useState(true);
  const hasImages = (node.images || []).length > 0;
  return (
    <div>
      <div
        onClick={() => node.children.length && setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px", paddingLeft: 6 + depth * 16, cursor: node.children.length ? "pointer" : "default", fontSize: 13, color: "#374151" }}
      >
        <span style={{ width: 12, fontSize: 10, color: "#9ca3af", visibility: node.children.length ? "visible" : "hidden" }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 600 }}>{node.name}</span>
      </div>
      {hasImages && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 6 + depth * 16 + 16, marginBottom: 6 }}>
          {node.images.map((img) => (
            <img
              key={img.id}
              src={img.url}
              alt={img.name}
              onClick={() => onPick(img)}
              title={`Add "${img.name}"`}
              style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb", cursor: "pointer" }}
            />
          ))}
        </div>
      )}
      {open && node.children.map((c) => (
        <PickerNode key={c.id} node={c} depth={depth + 1} onPick={onPick} />
      ))}
    </div>
  );
}

function ImagePickerModal({ designGallery, onPick, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: 420, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f" }}>Add image from gallery</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#6b7280" }}>✕</button>
        </div>
        <div style={{ padding: 12, overflow: "auto" }}>
          {(!designGallery || designGallery.length === 0) ? (
            <div style={{ color: "#9ca3af", fontSize: 13, padding: 16, textAlign: "center" }}>
              No images yet — add some under Configure &gt; Design Gallery first.
            </div>
          ) : (
            designGallery.map((n) => <PickerNode key={n.id} node={n} depth={0} onPick={onPick} />)
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
