import { useState } from "react";

/**
 * Drag-to-reposition + zoom cropper — lets the user pick exactly which part
 * of an uploaded/pasted photo becomes the saved image, instead of the
 * browser silently cropping whatever doesn't fit via object-fit: cover.
 *
 * Generalized from TemplateMaster.jsx's TemplateImageCropModal (frame/output
 * size as props instead of hardcoded constants, and onConfirm(blob) via
 * canvas.toBlob instead of toDataURL, since the result here gets uploaded to
 * the server rather than stored inline). TemplateMaster.jsx's and
 * Profile.jsx's own copies are deliberately left untouched — this is a third,
 * independent copy of the same pattern rather than a shared refactor, to
 * avoid any regression risk to those already-working features.
 */
function ImageCropModal({ src, frameW = 420, frameH = 315, outputScale = 2, onConfirm, onCancel }) {
  const outputW = frameW * outputScale;
  const outputH = frameH * outputScale;

  const imgRef = useState(() => ({ current: null }))[0];
  const [natSize, setNatSize] = useState(null); // { w, h } in natural pixels
  const [zoom, setZoom] = useState(1); // multiplier over the "fills the frame" scale
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // top-left of the image, in frame px
  const [dragging, setDragging] = useState(false);
  const dragStart = useState(() => ({ current: null }))[0];

  const minScale = natSize ? Math.max(frameW / natSize.w, frameH / natSize.h) : 1;
  const scale = minScale * zoom;
  const scaledW = natSize ? natSize.w * scale : 0;
  const scaledH = natSize ? natSize.h * scale : 0;

  // Keeps the frame always fully covered by the image — offset can't drift
  // past an edge and leave blank space inside the crop area.
  const clamp = (value, scaledDim, frameDim) => Math.min(0, Math.max(frameDim - scaledDim, value));

  const handleImgLoad = () => {
    const el = imgRef.current;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setNatSize({ w, h });
    const ms = Math.max(frameW / w, frameH / h);
    setOffset({ x: (frameW - w * ms) / 2, y: (frameH - h * ms) / 2 });
  };

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, offset };
  };
  const handlePointerMove = (e) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({
      x: clamp(dragStart.current.offset.x + dx, scaledW, frameW),
      y: clamp(dragStart.current.offset.y + dy, scaledH, frameH),
    });
  };
  const handlePointerUp = () => {
    dragStart.current = null;
    setDragging(false);
  };

  const handleZoomChange = (newZoom) => {
    if (!natSize) return;
    const sw = natSize.w * minScale * newZoom;
    const sh = natSize.h * minScale * newZoom;
    setZoom(newZoom);
    setOffset((prev) => ({
      x: clamp(prev.x, sw, frameW),
      y: clamp(prev.y, sh, frameH),
    }));
  };

  const handleConfirm = () => {
    const canvas = document.createElement("canvas");
    canvas.width = outputW;
    canvas.height = outputH;
    const ctx = canvas.getContext("2d");
    // Map the visible frame back to natural-pixel coordinates in the source
    // image, so the exported crop matches what was shown, 1:1.
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sW = frameW / scale;
    const sH = frameH / scale;
    ctx.drawImage(imgRef.current, sx, sy, sW, sH, 0, 0, outputW, outputH);
    canvas.toBlob((blob) => onConfirm(blob), "image/jpeg", 0.85);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 24, width: frameW + 48 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Position photo</h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6b7280" }}>
          Drag to reposition, use the slider to zoom. This is exactly what will be saved.
        </p>
        <div
          style={{
            width: frameW, height: frameH, overflow: "hidden", position: "relative",
            borderRadius: 8, background: "#f3f4f6", cursor: dragging ? "grabbing" : "grab",
            touchAction: "none", userSelect: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <img
            ref={(el) => { imgRef.current = el; }}
            src={src}
            onLoad={handleImgLoad}
            draggable={false}
            alt=""
            style={{ position: "absolute", left: offset.x, top: offset.y, width: scaledW || "auto", height: scaledH || "auto", maxWidth: "none" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Zoom</span>
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            disabled={!natSize}
            style={{ flex: 1 }}
          />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "#6b7280", padding: "7px 16px", fontSize: 13 }}>Cancel</button>
          <button onClick={handleConfirm} disabled={!natSize} style={{ background: "#2563eb", padding: "7px 16px", fontSize: 13 }}>Use This Photo</button>
        </div>
      </div>
    </div>
  );
}

export default ImageCropModal;
