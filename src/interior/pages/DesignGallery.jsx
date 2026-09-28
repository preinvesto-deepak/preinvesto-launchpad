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
// Counts every image in a node's subtree (itself + all descendants) — used
// both for the folder-card badge and to warn before a delete that would
// silently discard nested content.
function countImages(node) {
  return (node.images || []).length + (node.children || []).reduce((s, c) => s + countImages(c), 0);
}
function countGroups(node) {
  return (node.children || []).reduce((s, c) => s + 1 + countGroups(c), 0);
}
function coverOf(node) {
  return (node.images || []).find((i) => i.isDisplay) || (node.images || [])[0] || null;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// A folder tile — drawn as an actual folder shape (tab + body) with the
// group's favorite (★) image filling the body like a photo-album cover,
// or a plain folder glyph when it has none yet. Click opens it.
function FolderCard({ node, onOpen, onDelete }) {
  const [hover, setHover] = useState(false);
  const cover = coverOf(node);
  const imgCount = countImages(node);
  const subCount = (node.children || []).length;
  return (
    <div
      onClick={() => onOpen(node.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ width: 160, cursor: "pointer", userSelect: "none", position: "relative" }}
    >
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
          title="Delete"
          style={{
            position: "absolute", top: -6, right: -6, zIndex: 2, width: 22, height: 22, borderRadius: "50%",
            background: "#fff", border: "1px solid #fecaca", color: "#dc2626", fontSize: 11, cursor: "pointer",
            display: hover ? "flex" : "none", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          }}
        >✕</button>
      )}
      {/* Folder tab */}
      <div style={{ width: 56, height: 14, background: hover ? "#c4b5fd" : "#ddd6fe", borderRadius: "8px 8px 0 0", marginLeft: 8 }} />
      {/* Folder body */}
      <div
        style={{
          width: "100%", height: 118, background: hover ? "#c4b5fd" : "#ddd6fe", borderRadius: "0 10px 10px 10px",
          overflow: "hidden", position: "relative", boxShadow: hover ? "0 6px 14px rgba(124,58,237,0.25)" : "0 2px 5px rgba(0,0,0,0.08)",
          transition: "box-shadow 0.15s, background 0.15s", marginTop: -1,
        }}
      >
        {cover ? (
          <img src={cover.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.opacity = 0; }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, opacity: 0.7 }}>📁</div>
        )}
        {imgCount > 0 && (
          <span style={{ position: "absolute", bottom: 6, right: 6, fontSize: 10, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 10, padding: "1px 7px" }}>
            🖼 {imgCount}
          </span>
        )}
        {subCount > 0 && (
          <span style={{ position: "absolute", bottom: 6, left: 6, fontSize: 10, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 10, padding: "1px 7px" }}>
            📁 {subCount}
          </span>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: "#374151", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {node.name}
      </div>
    </div>
  );
}

function DesignGallery() {
  const { designGallery, setDesignGallery } = useAppData();
  // Array of node ids from root to the currently open folder — [] means
  // browsing the root level. Re-resolved to fresh node objects every render
  // (via resolvePath below) instead of caching node objects, which would go
  // stale the moment their contents change.
  const [pathIds, setPathIds] = useState([]);
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
  // id of an already-saved image whose crop/position is being re-adjusted,
  // or null. Re-opens ImageCropModal on the image's current (already
  // cropped) file and re-uploads in place — same id, new url — rather than
  // only being able to fit an image at the moment it's first added.
  const [adjustImageId, setAdjustImageId] = useState(null);

  const resolvePath = () => {
    const path = [];
    let level = designGallery;
    for (const id of pathIds) {
      const node = level.find((n) => n.id === id);
      if (!node) break; // deleted out from under us — stop at the last valid level
      path.push(node);
      level = node.children || [];
    }
    return path;
  };
  const path = resolvePath();
  const currentNode = path.length ? path[path.length - 1] : null;
  const currentChildren = currentNode ? currentNode.children : designGallery;

  const openFolder = (id) => setPathIds((prev) => [...prev, id]);
  const goToDepth = (depth) => setPathIds((prev) => prev.slice(0, depth));

  const addGroup = (parentId) => setAddGroupModal({ parentId, draft: "" });

  const confirmAddGroup = () => {
    const name = addGroupModal.draft.trim();
    if (!name) return;
    const { parentId } = addGroupModal;
    const newNode = { id: uid(), name, images: [], children: [] };
    setDesignGallery((prev) => (parentId == null ? [...prev, newNode] : mapTree(prev, parentId, (n) => ({ ...n, children: [...n.children, newNode] }))));
    setAddGroupModal(null);
  };

  const renameCurrent = (name) => {
    if (!currentNode) return;
    setDesignGallery((prev) => mapTree(prev, currentNode.id, (n) => ({ ...n, name })));
  };

  const requestDelete = (id) => setConfirmDeleteId(id);
  const confirmDelete = () => {
    if (!confirmDeleteId) return;
    setDesignGallery((prev) => removeNode(prev, confirmDeleteId));
    setPathIds((prev) => {
      const idx = prev.indexOf(confirmDeleteId);
      return idx === -1 ? prev : prev.slice(0, idx);
    });
    setConfirmDeleteId(null);
  };

  const setCurrentImages = (images) => {
    if (!currentNode) return;
    setDesignGallery((prev) => mapTree(prev, currentNode.id, (n) => ({ ...n, images })));
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
      const images = currentNode?.images || [];
      setCurrentImages([...images, { id: uid(), url, name, isDisplay: images.length === 0 }]);
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
      const images = currentNode?.images || [];
      setCurrentImages([...images, { id: uid(), url, name: url.split("/").pop() || "image", isDisplay: images.length === 0, uncropped: true }]);
    }
  };

  const setDisplay = (id) => setCurrentImages((currentNode.images || []).map((img) => ({ ...img, isDisplay: img.id === id })));
  const removeImage = (id) => {
    const remaining = (currentNode.images || []).filter((img) => img.id !== id);
    if (remaining.length && !remaining.some((i) => i.isDisplay)) remaining[0].isDisplay = true;
    setCurrentImages(remaining);
  };

  const adjustTargetImage = adjustImageId ? (currentNode?.images || []).find((i) => i.id === adjustImageId) : null;
  const handleAdjustConfirm = async (blob) => {
    setBusy(true);
    setUploadError("");
    try {
      const url = await uploadGalleryImage(blob, "image.jpg");
      setCurrentImages((currentNode.images || []).map((img) => (img.id === adjustImageId ? { ...img, url, uncropped: false } : img)));
    } catch (err) {
      setUploadError(err.message || "Failed to save the adjusted image.");
    } finally {
      setBusy(false);
      setAdjustImageId(null);
    }
  };

  const deleteTargetNode = confirmDeleteId ? findNode(designGallery, confirmDeleteId) : null;

  return (
    <div style={{ padding: "16px 24px" }}>
      {/* ── Breadcrumb ── */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 16, fontSize: 14 }}>
        <span
          onClick={() => goToDepth(0)}
          style={{ cursor: "pointer", fontWeight: path.length === 0 ? 700 : 500, color: path.length === 0 ? "#1e3a5f" : "#7c3aed" }}
        >🏠 All Groups</span>
        {path.map((n, i) => (
          <span key={n.id}>
            <span style={{ color: "#cbd5e1", margin: "0 4px" }}>/</span>
            <span
              onClick={() => goToDepth(i + 1)}
              style={{ cursor: "pointer", fontWeight: i === path.length - 1 ? 700 : 500, color: i === path.length - 1 ? "#1e3a5f" : "#7c3aed" }}
            >{n.name}</span>
          </span>
        ))}
      </div>

      {/* ── Current folder header (rename/delete/add-sub-group) — hidden at root ── */}
      {currentNode && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <input
            type="text"
            value={currentNode.name}
            onChange={(e) => renameCurrent(e.target.value)}
            style={{ fontSize: 20, fontWeight: 700, color: "#1e3a5f", border: "1px solid transparent", borderRadius: 6, padding: "4px 6px", flex: 1 }}
            onFocus={(e) => (e.target.style.borderColor = "#ddd6fe")}
            onBlur={(e) => (e.target.style.borderColor = "transparent")}
          />
          <button onClick={() => addGroup(currentNode.id)} style={{ background: "#ede9fe", color: "#7c3aed", border: "1px solid #ddd6fe", padding: "6px 14px", fontSize: 12, borderRadius: 6, fontWeight: 600 }}>+ Add Sub-group</button>
          <button onClick={() => requestDelete(currentNode.id)} style={{ background: "#fee2e2", color: "#dc2626", border: "1px solid #fecaca", padding: "6px 14px", fontSize: 12, borderRadius: 6, fontWeight: 600 }}>🗑 Delete</button>
        </div>
      )}

      {/* ── Sub-folders grid ── */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#1e3a5f" }}>{currentNode ? "Sub-groups" : "Groups"}</div>
          {!currentNode && (
            <button onClick={() => addGroup(null)} style={{ background: "#2563eb", padding: "6px 14px", fontSize: 12, borderRadius: 6, fontWeight: 600 }}>+ New Group</button>
          )}
        </div>
        {currentChildren.length === 0 ? (
          <div style={{ padding: "20px 8px", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>
            {currentNode
              ? 'No sub-groups yet — click "+ Add Sub-group" above (e.g. "With Louvers").'
              : 'No groups yet — click "+ New Group" to start (e.g. "TV Unit", "Wardrobe").'}
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
            {currentChildren.map((n) => (
              <FolderCard key={n.id} node={n} onOpen={openFolder} onDelete={requestDelete} />
            ))}
          </div>
        )}
      </div>

      {/* ── Current folder's own images — hidden at root, since only real
          groups (not the virtual root) hold images directly ── */}
      {currentNode && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e3a5f", marginBottom: 10 }}>Images</div>

          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input
              type="text"
              placeholder="Paste image URL (https://…)"
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
              style={{ flex: 1, padding: "8px 12px", fontSize: 13, borderRadius: 7, border: `1px solid ${urlError ? "#ef4444" : "#d1d5db"}` }}
            />
            <button type="button" onClick={handleAddUrl} style={{ background: "#2563eb", padding: "8px 16px", fontSize: 13, flexShrink: 0, borderRadius: 7, fontWeight: 600 }}>Add URL</button>
            <label style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "8px 14px", fontSize: 13, flexShrink: 0, cursor: "pointer", borderRadius: 7, fontWeight: 600 }}>
              Upload File
              <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFiles} />
            </label>
          </div>
          {urlError && <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 6px" }}>{urlError}</p>}
          {uploadError && <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 6px" }}>{uploadError}</p>}
          {busy && <p style={{ color: "#6b7280", fontSize: 12, margin: "0 0 6px" }}>Uploading…</p>}
          <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 14px" }}>
            Every upload/URL goes through a crop step so images look consistent on a Mood Board. Click ★ to set this folder's cover image.
          </p>

          {(currentNode.images || []).length === 0 ? (
            <div style={{ border: "2px dashed #e5e7eb", borderRadius: 10, padding: "36px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              No images yet — upload a file or paste a URL above.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
              {currentNode.images.map((img) => (
                <div key={img.id} style={{ position: "relative", aspectRatio: "4 / 3", border: img.isDisplay ? "2px solid #2563eb" : "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <img src={img.url} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />
                  {img.isDisplay && (
                    <div style={{ position: "absolute", top: 6, left: 6, background: "#2563eb", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>★</div>
                  )}
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", background: "linear-gradient(to top, rgba(0,0,0,0.65), transparent)", paddingTop: 14 }}>
                    <button onClick={() => setDisplay(img.id)} title="Set as cover" style={{ flex: 1, background: "none", color: img.isDisplay ? "#fbbf24" : "#e5e7eb", border: "none", fontSize: 16, padding: "5px 0", cursor: "pointer" }}>★</button>
                    <button
                      onClick={() => !img.uncropped && setAdjustImageId(img.id)}
                      disabled={img.uncropped}
                      title={img.uncropped ? "Hosted elsewhere — remove and re-add by uploading the file to adjust it" : "Adjust fit (reposition/zoom)"}
                      style={{ flex: 1, background: "none", color: img.uncropped ? "#6b7280" : "#e5e7eb", border: "none", fontSize: 15, padding: "5px 0", cursor: img.uncropped ? "not-allowed" : "pointer", opacity: img.uncropped ? 0.5 : 1 }}
                    >⛶</button>
                    <button onClick={() => removeImage(img.id)} title="Remove" style={{ flex: 1, background: "none", color: "#f87171", border: "none", fontSize: 15, padding: "5px 0", cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      {adjustTargetImage && (
        <ImageCropModal
          src={adjustTargetImage.url}
          onConfirm={handleAdjustConfirm}
          onCancel={() => setAdjustImageId(null)}
          onError={(msg) => { setUploadError(msg); setAdjustImageId(null); }}
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
