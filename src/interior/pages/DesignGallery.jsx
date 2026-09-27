import { useState } from "react";
import { useAppData } from "../context/AppDataContext";
import { uploadGalleryImage } from "../utils/api";
import ImageCropModal from "../components/ImageCropModal";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`);

// ── Pure, immutable tree helpers — a group and a sub-group are the same
// shape ({ id, name, images, children }), which is what makes unlimited
// nesting simple: every operation just recurses into `children`. ──────────
function mapTree(nodes, id, fn) {
  return nodes.map((n) => (n.id === id ? fn(n) : { ...n, children: mapTree(n.children, id, fn) }));
}
function removeNode(nodes, id) {
  return nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: removeNode(n.children, id) }));
}
function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}
function findPath(nodes, id, path = []) {
  for (const n of nodes) {
    const next = [...path, n];
    if (n.id === id) return next;
    const found = findPath(n.children, id, next);
    if (found) return found;
  }
  return null;
}
// Counts every image in a node's subtree (itself + all descendants) — used
// to warn before a delete that would silently discard nested content.
function countImages(node) {
  return (node.images || []).length + (node.children || []).reduce((s, c) => s + countImages(c), 0);
}
function countGroups(node) {
  return (node.children || []).reduce((s, c) => s + 1 + countGroups(c), 0);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function TreeNode({ node, depth, selectedId, onSelect, onAddChild }) {
  const [open, setOpen] = useState(true);
  const isSelected = node.id === selectedId;
  return (
    <div>
      <div
        onClick={() => onSelect(node.id)}
        style={{
          display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
          padding: "5px 8px", paddingLeft: 8 + depth * 16, borderRadius: 6,
          background: isSelected ? "#ede9fe" : "transparent",
          color: isSelected ? "#4c1d95" : "#374151",
          fontWeight: isSelected ? 700 : 400,
          fontSize: 13,
        }}
      >
        <span
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          style={{ width: 14, fontSize: 10, color: "#9ca3af", flexShrink: 0, visibility: node.children.length ? "visible" : "hidden" }}
        >
          {open ? "▾" : "▸"}
        </span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
        {(node.images || []).length > 0 && (
          <span style={{ fontSize: 10, color: "#9ca3af" }}>{node.images.length}🖼</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onAddChild(node.id); }}
          title="Add sub-group here"
          style={{ fontSize: 12, background: "none", border: "none", color: "#7c3aed", cursor: "pointer", padding: "0 4px" }}
        >+</button>
      </div>
      {open && node.children.map((c) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} onAddChild={onAddChild} />
      ))}
    </div>
  );
}

function DesignGallery() {
  const { designGallery, setDesignGallery } = useAppData();
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [cropQueue, setCropQueue] = useState([]); // [{ dataUrl, name }]
  const [uploadError, setUploadError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busy, setBusy] = useState(false);
  // { parentId, draft } | null — an in-app modal instead of window.prompt(),
  // which several browsers/embedded webviews silently block or no-op,
  // making "+ New Group" appear to do nothing.
  const [addGroupModal, setAddGroupModal] = useState(null);

  const selectedNode = selectedNodeId ? findNode(designGallery, selectedNodeId) : null;
  const selectedPath = selectedNodeId ? findPath(designGallery, selectedNodeId) : null;

  const addGroup = (parentId) => setAddGroupModal({ parentId, draft: "" });

  const confirmAddGroup = () => {
    const name = addGroupModal.draft.trim();
    if (!name) return;
    const { parentId } = addGroupModal;
    const newNode = { id: uid(), name, images: [], children: [] };
    setDesignGallery((prev) => (parentId == null ? [...prev, newNode] : mapTree(prev, parentId, (n) => ({ ...n, children: [...n.children, newNode] }))));
    setSelectedNodeId(newNode.id);
    setAddGroupModal(null);
  };

  const renameSelected = (name) => {
    if (!selectedNodeId) return;
    setDesignGallery((prev) => mapTree(prev, selectedNodeId, (n) => ({ ...n, name })));
  };

  const requestDelete = (id) => setConfirmDeleteId(id);
  const confirmDelete = () => {
    if (!confirmDeleteId) return;
    setDesignGallery((prev) => removeNode(prev, confirmDeleteId));
    if (selectedNodeId === confirmDeleteId) setSelectedNodeId(null);
    setConfirmDeleteId(null);
  };

  const setSelectedImages = (images) => {
    if (!selectedNodeId) return;
    setDesignGallery((prev) => mapTree(prev, selectedNodeId, (n) => ({ ...n, images })));
  };

  const handleCropConfirm = async (blob, name) => {
    setBusy(true);
    setUploadError("");
    try {
      // The crop modal always outputs a JPEG blob regardless of the source
      // format — a derived name (e.g. from a URL's last path segment, which
      // may not end in a real image extension) can't be trusted for the
      // upload's filename, or the server saves a file with no extension.
      const url = await uploadGalleryImage(blob, "image.jpg");
      const images = selectedNode?.images || [];
      setSelectedImages([...images, { id: uid(), url, name, isDisplay: images.length === 0 }]);
    } catch (err) {
      setUploadError(err.message || "Failed to upload image.");
    } finally {
      setBusy(false);
      setCropQueue((prev) => prev.slice(1));
    }
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const entries = await Promise.all(files.map(async (f) => ({ dataUrl: await readAsDataUrl(f), name: f.name })));
    setCropQueue((prev) => [...prev, ...entries]);
  };

  const handleAddUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    try { new URL(url); } catch { setUrlError("Enter a valid URL (https://…)"); return; }
    setUrlError("");
    setUrlInput("");
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const dataUrl = await readAsDataUrl(blob);
      setCropQueue((prev) => [...prev, { dataUrl, name: url.split("/").pop() || "image" }]);
    } catch {
      // Cross-origin fetch blocked (or URL unreachable) — fall back to
      // storing the URL as-is, uncropped, rather than losing it entirely.
      const images = selectedNode?.images || [];
      setSelectedImages([...images, { id: uid(), url, name: url.split("/").pop() || "image", isDisplay: images.length === 0, uncropped: true }]);
    }
  };

  const setDisplay = (id) => setSelectedImages((selectedNode.images || []).map((img) => ({ ...img, isDisplay: img.id === id })));
  const removeImage = (id) => {
    const remaining = (selectedNode.images || []).filter((img) => img.id !== id);
    if (remaining.length && !remaining.some((i) => i.isDisplay)) remaining[0].isDisplay = true;
    setSelectedImages(remaining);
  };

  const deleteTargetNode = confirmDeleteId ? findNode(designGallery, confirmDeleteId) : null;

  return (
    <div style={{ display: "flex", gap: 20, padding: "16px 24px", alignItems: "flex-start" }}>
      {/* ── Left: tree nav ── */}
      <div style={{ width: 300, flexShrink: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1e3a5f" }}>Groups</div>
          <button onClick={() => addGroup(null)} style={{ background: "#2563eb", padding: "4px 10px", fontSize: 12 }}>+ New Group</button>
        </div>
        {designGallery.length === 0 ? (
          <div style={{ padding: "18px 8px", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>
            No groups yet — click "+ New Group" to start (e.g. "TV Unit", "Wardrobe").
          </div>
        ) : (
          designGallery.map((n) => (
            <TreeNode key={n.id} node={n} depth={0} selectedId={selectedNodeId} onSelect={setSelectedNodeId} onAddChild={addGroup} />
          ))
        )}
      </div>

      {/* ── Right: selected node detail ── */}
      <div style={{ flex: 1, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, minHeight: 300 }}>
        {!selectedNode ? (
          <div style={{ color: "#9ca3af", fontSize: 13, padding: 24, textAlign: "center" }}>
            Select a group on the left, or create one, to manage its images.
          </div>
        ) : (
          <>
            {selectedPath && (
              <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 10 }}>
                {selectedPath.map((n, i) => (
                  <span key={n.id}>
                    {i > 0 && " / "}
                    {i === selectedPath.length - 1 ? <strong style={{ color: "#374151" }}>{n.name}</strong> : n.name}
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <input
                type="text"
                value={selectedNode.name}
                onChange={(e) => renameSelected(e.target.value)}
                style={{ fontSize: 18, fontWeight: 700, color: "#1e3a5f", border: "1px solid transparent", borderRadius: 6, padding: "3px 6px", flex: 1 }}
                onFocus={(e) => (e.target.style.borderColor = "#ddd6fe")}
                onBlur={(e) => (e.target.style.borderColor = "transparent")}
              />
              <button onClick={() => addGroup(selectedNode.id)} style={{ background: "#ede9fe", color: "#7c3aed", border: "1px solid #ddd6fe", padding: "5px 12px", fontSize: 12 }}>+ Add Sub-group</button>
              <button onClick={() => requestDelete(selectedNode.id)} style={{ background: "#fee2e2", color: "#dc2626", border: "1px solid #fecaca", padding: "5px 12px", fontSize: 12 }}>🗑 Delete</button>
            </div>

            <div style={{ borderTop: "1px solid #f3f4f6", marginTop: 14, paddingTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Images</div>

              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input
                  type="text"
                  placeholder="Paste image URL (https://…)"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
                  style={{ flex: 1, padding: "6px 10px", fontSize: 13, borderRadius: 6, border: `1px solid ${urlError ? "#ef4444" : "#d1d5db"}` }}
                />
                <button type="button" onClick={handleAddUrl} style={{ background: "#2563eb", padding: "6px 14px", fontSize: 13, flexShrink: 0 }}>Add URL</button>
                <label style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "6px 12px", fontSize: 13, flexShrink: 0, cursor: "pointer", borderRadius: 6 }}>
                  Upload File
                  <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFiles} />
                </label>
              </div>
              {urlError && <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 6px" }}>{urlError}</p>}
              {uploadError && <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 6px" }}>{uploadError}</p>}
              {busy && <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 6px" }}>Uploading…</p>}
              <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 10px" }}>
                Every upload/URL goes through a crop step so images look consistent on a Mood Board. Click ★ to set a group's cover image.
              </p>

              {(selectedNode.images || []).length === 0 ? (
                <div style={{ border: "2px dashed #e5e7eb", borderRadius: 8, padding: "18px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                  No images yet — upload a file or paste a URL above.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selectedNode.images.map((img) => (
                    <div key={img.id} style={{ position: "relative", width: 96, height: 96, border: img.isDisplay ? "2px solid #2563eb" : "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                      <img src={img.url} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
                      {img.isDisplay && (
                        <div style={{ position: "absolute", top: 3, left: 3, background: "#2563eb", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>★</div>
                      )}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", background: "rgba(0,0,0,0.55)" }}>
                        <button onClick={() => setDisplay(img.id)} title="Set as cover" style={{ flex: 1, background: "none", color: img.isDisplay ? "#fbbf24" : "#d1d5db", border: "none", fontSize: 13, padding: "2px 0", cursor: "pointer" }}>★</button>
                        <button onClick={() => removeImage(img.id)} title="Remove" style={{ flex: 1, background: "none", color: "#f87171", border: "none", fontSize: 13, padding: "2px 0", cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {addGroupModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 360 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>{addGroupModal.parentId ? "New sub-group" : "New group"}</h3>
            <input
              type="text"
              autoFocus
              value={addGroupModal.draft}
              onChange={(e) => setAddGroupModal((m) => ({ ...m, draft: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") confirmAddGroup(); if (e.key === "Escape") setAddGroupModal(null); }}
              placeholder={addGroupModal.parentId ? "e.g. With Louvers" : "e.g. TV Unit"}
              style={{ width: "100%", padding: "8px 10px", fontSize: 14, borderRadius: 6, border: "1px solid #d1d5db" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
              <button onClick={() => setAddGroupModal(null)} style={{ background: "#6b7280", padding: "7px 16px", fontSize: 13 }}>Cancel</button>
              <button onClick={confirmAddGroup} disabled={!addGroupModal.draft.trim()} style={{ background: "#2563eb", padding: "7px 16px", fontSize: 13 }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {cropQueue.length > 0 && (
        <ImageCropModal
          src={cropQueue[0].dataUrl}
          onConfirm={(blob) => handleCropConfirm(blob, cropQueue[0].name)}
          onCancel={() => setCropQueue((prev) => prev.slice(1))}
        />
      )}

      {confirmDeleteId && deleteTargetNode && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 380 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Delete "{deleteTargetNode.name}"?</h3>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6b7280" }}>
              {countGroups(deleteTargetNode) > 0 || countImages(deleteTargetNode) > 0 ? (
                <>This also removes {countGroups(deleteTargetNode)} nested sub-group{countGroups(deleteTargetNode) !== 1 ? "s" : ""} and {countImages(deleteTargetNode)} image{countImages(deleteTargetNode) !== 1 ? "s" : ""}. This cannot be undone.</>
              ) : (
                "This cannot be undone."
              )}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDeleteId(null)} style={{ background: "#6b7280", padding: "7px 16px", fontSize: 13 }}>Cancel</button>
              <button onClick={confirmDelete} style={{ background: "#dc2626", padding: "7px 16px", fontSize: 13 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DesignGallery;
