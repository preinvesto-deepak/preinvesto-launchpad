import { useState, useMemo, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { packSheets } from "../utils/binPack";
import { useAppData } from "../context/AppDataContext";

// Texture cell value: mirrors the Cut List's own fallback (unknown/missing → 1 = horizontal)
const textureValue = (rotation) => ([0, 1, 2].includes(+rotation) ? +rotation : 1);
const TEXTURE_LABEL = { 0: "Free", 1: "Horizontal", 2: "Vertical" };

const PIECE_COLORS = [
  "#dbeafe", "#fef3c7", "#dcfce7", "#fce7f3", "#ede9fe",
  "#fed7aa", "#d1fae5", "#fee2e2", "#e0f2fe", "#fef9c3",
  "#f0fdf4", "#fdf4ff", "#fff7ed", "#f0f9ff", "#fefce8",
  "#e8f5e9", "#fff3e0", "#f3e5f5", "#e1f5fe", "#fce4ec",
];

const DEFAULT_STOCK = { sheetW: 2440, sheetH: 1220, sheetTexture: 1, qtyInStock: 0 };

// ── Sheet SVG ─────────────────────────────────────────────────────────────────
function SheetSVG({ sheet, rowColors, maxWidth, id }) {
  const { sheetW, sheetH, placements, sheetTexture = 1 } = sheet;
  const scale = Math.min(maxWidth / sheetW, 360 / sheetH);
  const svgW = Math.round(sheetW * scale);
  const svgH = Math.round(sheetH * scale);
  const hatchId = `hatch_${id}`;

  // Sheet-level grain lines (full stock sheet texture direction)
  const sheetGrainLines = [];
  const SG = "rgba(90,130,180,0.22)";
  const sgStep = Math.max(6, Math.round(Math.min(svgW, svgH) / 10));
  if (sheetTexture === 1) {
    for (let gy = sgStep; gy < svgH; gy += sgStep)
      sheetGrainLines.push(<line key={gy} x1={0} y1={gy} x2={svgW} y2={gy} stroke={SG} strokeWidth={0.9} />);
  } else if (sheetTexture === 2) {
    for (let gx = sgStep; gx < svgW; gx += sgStep)
      sheetGrainLines.push(<line key={gx} x1={gx} y1={0} x2={gx} y2={svgH} stroke={SG} strokeWidth={0.9} />);
  }

  return (
    <svg
      width={svgW}
      height={svgH}
      style={{ border: "2px solid #1e3a5f", display: "block", borderRadius: 2, background: "#f8fafc" }}
    >
      <defs>
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#cbd5e1" strokeWidth="1.2" />
        </pattern>
      </defs>
      {/* Waste background */}
      <rect x={0} y={0} width={svgW} height={svgH} fill={`url(#${hatchId})`} />
      {/* Stock sheet texture direction */}
      {sheetGrainLines}
      {/* Pieces */}
      {placements.map((p, i) => {
        const color = rowColors[p.rowNum] || "#e2e8f0";
        const px = Math.floor(p.x * scale);
        const py = Math.floor(p.y * scale);
        const pw = Math.ceil(p.w * scale);
        const ph = Math.ceil(p.h * scale);
        const fs = Math.max(6, Math.min(11, pw / 9, ph / 2.5));
        const dimFs = Math.max(5, Math.min(8, pw / 14, ph / 4));
        return (
          <g key={i}>
            <rect x={px} y={py} width={pw} height={ph} fill={color} stroke="#475569" strokeWidth={0.8} />
            {/* Grain direction lines — only when sheet has a texture (sheetTexture !== 0).
                If the piece was physically rotated to fit, its grain rotates with it,
                so flip horizontal<->vertical to reflect the actual on-sheet orientation. */}
            {sheetTexture !== 0 && (() => {
              const effGrain = p.grainDir === 0 ? 0 : (p.rotated ? (p.grainDir === 1 ? 2 : 1) : p.grainDir);
              const lines = [];
              const C = "rgba(0,0,0,0.15)";
              const step = Math.max(4, Math.round(Math.min(pw, ph) / 7));
              if (effGrain === 1) {
                for (let gy = py + step; gy < py + ph - 1; gy += step)
                  lines.push(<line key={gy} x1={px + 1} y1={gy} x2={px + pw - 1} y2={gy} stroke={C} strokeWidth={0.7} />);
              } else if (effGrain === 2) {
                for (let gx = px + step; gx < px + pw - 1; gx += step)
                  lines.push(<line key={gx} x1={gx} y1={py + 1} x2={gx} y2={py + ph - 1} stroke={C} strokeWidth={0.7} />);
              }
              return lines;
            })()}
            {/* Stroke on top of grain lines */}
            <rect x={px} y={py} width={pw} height={ph} fill="none" stroke="#475569" strokeWidth={0.8} />
            {pw > 18 && ph > 10 && (
              <text
                x={px + pw / 2} y={py + ph / 2 - (pw > 40 && ph > 22 ? 5 : 0)}
                textAnchor="middle" dominantBaseline="central"
                fontSize={fs} fill="#1e3a5f" fontWeight="600"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {p.label}
              </text>
            )}
            {pw > 36 && ph > 20 && (
              <text
                x={px + pw / 2} y={py + ph / 2 + fs + 1}
                textAnchor="middle" dominantBaseline="central"
                fontSize={dimFs} fill="#64748b"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {p.w}×{p.h}{p.rotated ? "R" : ""}
              </text>
            )}
          </g>
        );
      })}
      {/* Sheet dimension labels */}
      <text x={svgW / 2} y={svgH - 3} textAnchor="middle" fontSize={8} fill="#94a3b8">{sheetW} mm</text>
      <text
        x={8} y={svgH / 2}
        textAnchor="middle" fontSize={8} fill="#94a3b8"
        transform={`rotate(-90,8,${svgH / 2})`}
      >{sheetH} mm</text>
    </svg>
  );
}

// Plain-string equivalent of <SheetSVG> — used by the PDF export, which builds
// a raw HTML document rather than rendering React components.
function sheetSvgMarkup(sheet, rowColors, id, maxWidth = 520) {
  const { sheetW, sheetH, placements, sheetTexture = 1 } = sheet;
  const scale = Math.min(maxWidth / sheetW, 300 / sheetH);
  const svgW = Math.round(sheetW * scale);
  const svgH = Math.round(sheetH * scale);
  const hatchId = `hatch_${id}`;
  const SG = "rgba(90,130,180,0.22)";
  const sgStep = Math.max(6, Math.round(Math.min(svgW, svgH) / 10));

  let grainLines = "";
  if (sheetTexture === 1) {
    for (let gy = sgStep; gy < svgH; gy += sgStep)
      grainLines += `<line x1="0" y1="${gy}" x2="${svgW}" y2="${gy}" stroke="${SG}" stroke-width="0.9"/>`;
  } else if (sheetTexture === 2) {
    for (let gx = sgStep; gx < svgW; gx += sgStep)
      grainLines += `<line x1="${gx}" y1="0" x2="${gx}" y2="${svgH}" stroke="${SG}" stroke-width="0.9"/>`;
  }

  const pieces = placements.map((p) => {
    const color = rowColors[p.rowNum] || "#e2e8f0";
    const px = Math.floor(p.x * scale);
    const py = Math.floor(p.y * scale);
    const pw = Math.ceil(p.w * scale);
    const ph = Math.ceil(p.h * scale);
    const fs = Math.max(6, Math.min(11, pw / 9, ph / 2.5));
    const dimFs = Math.max(5, Math.min(8, pw / 14, ph / 4));

    let pieceGrain = "";
    if (sheetTexture !== 0) {
      const effGrain = p.grainDir === 0 ? 0 : (p.rotated ? (p.grainDir === 1 ? 2 : 1) : p.grainDir);
      const C = "rgba(0,0,0,0.15)";
      const step = Math.max(4, Math.round(Math.min(pw, ph) / 7));
      if (effGrain === 1) {
        for (let gy = py + step; gy < py + ph - 1; gy += step)
          pieceGrain += `<line x1="${px + 1}" y1="${gy}" x2="${px + pw - 1}" y2="${gy}" stroke="${C}" stroke-width="0.7"/>`;
      } else if (effGrain === 2) {
        for (let gx = px + step; gx < px + pw - 1; gx += step)
          pieceGrain += `<line x1="${gx}" y1="${py + 1}" x2="${gx}" y2="${py + ph - 1}" stroke="${C}" stroke-width="0.7"/>`;
      }
    }

    const labelText = pw > 18 && ph > 10
      ? `<text x="${px + pw / 2}" y="${py + ph / 2 - (pw > 40 && ph > 22 ? 5 : 0)}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" fill="#1e3a5f" font-weight="600">${p.label}</text>`
      : "";
    const dimText = pw > 36 && ph > 20
      ? `<text x="${px + pw / 2}" y="${py + ph / 2 + fs + 1}" text-anchor="middle" dominant-baseline="central" font-size="${dimFs}" fill="#64748b">${p.w}×${p.h}${p.rotated ? "R" : ""}</text>`
      : "";

    return `<g>
      <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="${color}" stroke="#475569" stroke-width="0.8"/>
      ${pieceGrain}
      <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="none" stroke="#475569" stroke-width="0.8"/>
      ${labelText}${dimText}
    </g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" style="border:2px solid #1e3a5f;display:block;border-radius:2px;background:#f8fafc">
    <defs><pattern id="${hatchId}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#cbd5e1" stroke-width="1.2"/>
    </pattern></defs>
    <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="url(#${hatchId})"/>
    ${grainLines}
    ${pieces}
    <text x="${svgW / 2}" y="${svgH - 3}" text-anchor="middle" font-size="8" fill="#94a3b8">${sheetW} mm</text>
    <text x="8" y="${svgH / 2}" text-anchor="middle" font-size="8" fill="#94a3b8" transform="rotate(-90,8,${svgH / 2})">${sheetH} mm</text>
  </svg>`;
}

// Rasterizes an SVG markup string (from sheetSvgMarkup) to a JPEG data URL
// via an offscreen canvas — used by the PDF export to embed sheet diagrams
// as real images, since jsPDF can't draw SVG markup directly. Rendered at 2x
// the display size for a crisp-enough result; JPEG (not PNG) keeps file size
// sane — PNG was ballooning multi-page exports to 20MB+ because these
// diagrams are full of thin anti-aliased grain-line strokes, which compress
// terribly as lossless PNG but fine as JPEG at this visual scale.
function rasterizeSvg(svgString, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
  });
}

// ── Oversize Warning Banner ───────────────────────────────────────────────────
function OversizeWarning({ oversizeRows }) {
  const [open, setOpen] = useState(true);
  if (!oversizeRows.length || !open) return null;
  const byMat = {};
  oversizeRows.forEach((r) => {
    (byMat[r.material] = byMat[r.material] || []).push(r);
  });
  return (
    <div style={{ margin: "12px 16px", border: "1.5px solid #fca5a5", borderRadius: 8, background: "#fff1f2", overflow: "hidden" }}>
      {/* Banner header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", background: "#dc2626" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>
            {oversizeRows.length} piece{oversizeRows.length !== 1 ? "s" : ""} exceed sheet size — cannot be placed
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 5, width: 22, height: 22, fontSize: 13, cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
        >✕</button>
      </div>
      {/* Error rows detail */}
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        {Object.entries(byMat).map(([mat, items]) => (
          <div key={mat}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.04em" }}>{mat}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
              {items.map((r, i) => (
                <span key={i} style={{ fontSize: 11, background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 4, padding: "2px 8px", color: "#991b1b", fontWeight: 600 }}>
                  Row {r.rowNum} — {r.label || "—"} &nbsp;({r.w} × {r.h} mm)
                </span>
              ))}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 4 }}>
          These pieces will not appear in the Layout. Reduce their dimensions or increase the sheet size in Sheet Stock.
        </div>
      </div>
    </div>
  );
}

// ── Cut List Tab ──────────────────────────────────────────────────────────────
function CutListTab({ rows, rowColors, getStock, oversizeRows }) {
  if (!rows.length) return (
    <p style={{ padding: 32, textAlign: "center", color: "#6b7280" }}>
      No parts to cut. Check that parts have materials and are marked as required.
    </p>
  );
  const TH = (align = "left") => ({
    padding: "8px 10px", fontWeight: 700, fontSize: 11,
    background: "#1e3a5f", color: "#fff",
    textAlign: align, whiteSpace: "nowrap",
    textTransform: "uppercase", letterSpacing: "0.04em",
    borderRight: "1px solid #2d5a8e",
  });
  const td = (extra = {}) => ({ padding: "6px 10px", borderBottom: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb", fontSize: 12, ...extra });
  const RIGHT = ["W (mm)", "H (mm)", "Qty", "Top", "Btm", "Left", "Right"];
  const ROTATION_LABEL = { 0: { symbol: "↺", title: "Free rotation", color: "#6b7280" }, 1: { symbol: "≡", title: "Horizontal grain", color: "#1e3a5f" }, 2: { symbol: "∥", title: "Vertical grain", color: "#1e3a5f" } };
  const oversizeSet = useMemo(() => new Set(oversizeRows.map((r) => r.rowNum + "_" + r.w + "_" + r.h + "_" + r.material)), [oversizeRows]);
  const isOversize = (row) => oversizeSet.has(row.rowNum + "_" + row.w + "_" + row.h + "_" + row.material);

  return (
    <div>
      <OversizeWarning oversizeRows={oversizeRows} />
      <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            {["#", "W (mm)", "H (mm)", "Qty", "Material", "Texture", "Label", "Top", "Btm", "Left", "Right"].map((h) => (
              <th key={h} style={TH(RIGHT.includes(h) ? "right" : "left")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rot = ROTATION_LABEL[row.rotation] || ROTATION_LABEL[1];
            const oversize = isOversize(row);
            const rowBg = oversize ? "#fee2e2" : (rowColors[row.rowNum] || (i % 2 === 0 ? "#fff" : "#f9fafb"));
            return (
              <tr key={i} style={{ background: rowBg }} title={oversize ? `Piece exceeds sheet size for ${row.material}` : undefined}>
                <td style={td({ fontWeight: 600, color: oversize ? "#dc2626" : "#6b7280" })}>{row.rowNum}</td>
                <td style={td({ textAlign: "right", fontWeight: 600, color: oversize ? "#dc2626" : undefined })}>{row.w}</td>
                <td style={td({ textAlign: "right", color: oversize ? "#dc2626" : undefined })}>{row.h}</td>
                <td style={td({ textAlign: "right" })}>{row.qty}</td>
                <td style={td({ fontWeight: 600, color: oversize ? "#dc2626" : "#1e3a5f" })}>{row.material}</td>
                <td style={td({ textAlign: "center" })} title={rot.title}>
                  <span style={{ fontSize: 14, color: rot.color, fontWeight: 700 }}>{rot.symbol}</span>
                </td>
                <td style={td()}>{row.label}</td>
                <td style={td({ textAlign: "right" })}>{row.top || 0}</td>
                <td style={td({ textAlign: "right" })}>{row.bottom || 0}</td>
                <td style={td({ textAlign: "right" })}>{row.left || 0}</td>
                <td style={{ ...td(), borderRight: "none", textAlign: "right" }}>{row.right || 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// ── Layout Tab ────────────────────────────────────────────────────────────────
function LayoutTab({ packedSheets, rowColors, oversizeRows }) {
  const materials = useMemo(() => [...new Set(packedSheets.map((s) => s.material))], [packedSheets]);
  const [activeMat, setActiveMat] = useState(materials[0] || "");

  // Keep activeMat in sync when packedSheets changes (e.g. stock size edit)
  useEffect(() => {
    if (materials.length && !materials.includes(activeMat)) setActiveMat(materials[0]);
  }, [materials]);

  if (!packedSheets.length) return (
    <p style={{ padding: 32, textAlign: "center", color: "#6b7280" }}>
      No layout generated. Add parts with materials and valid dimensions.
    </p>
  );

  const byMat = {};
  packedSheets.forEach((s) => { (byMat[s.material] = byMat[s.material] || []).push(s); });
  const sheets = byMat[activeMat] || [];

  return (
    <div>
      <OversizeWarning oversizeRows={oversizeRows} />
      {/* Material tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "10px 16px 0", borderBottom: "2px solid #e5e7eb", background: "#f8fafc" }}>
        {materials.map((mat) => {
          const cnt = (byMat[mat] || []).length;
          const active = mat === activeMat;
          return (
            <button
              key={mat}
              onClick={() => setActiveMat(mat)}
              style={{
                padding: "7px 14px", fontSize: 12, fontWeight: active ? 700 : 500,
                color: active ? "#185fa5" : "#6b7280",
                background: active ? "#fff" : "transparent",
                border: "1px solid " + (active ? "#d1d5db" : "transparent"),
                borderBottom: active ? "2px solid #fff" : "2px solid transparent",
                borderRadius: "6px 6px 0 0",
                cursor: "pointer", marginBottom: -2,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {mat}
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                background: active ? "#dbeafe" : "#f3f4f6",
                color: active ? "#1e40af" : "#6b7280",
              }}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* Sheets for active material */}
      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          {sheets.map((sheet, si) => (
            <div key={si}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, display: "flex", gap: 8 }}>
                <span style={{ fontWeight: 700 }}>Sheet #{sheet.sheetIndex}</span>
                <span>{sheet.sheetW} × {sheet.sheetH} mm</span>
                <span style={{
                  fontWeight: 700,
                  color: sheet.utilization >= 80 ? "#059669" : sheet.utilization >= 60 ? "#d97706" : "#dc2626",
                }}>{sheet.utilization}%</span>
                <span style={{ color: "#9ca3af" }}>{sheet.placements.length} pcs</span>
              </div>
              <SheetSVG
                sheet={sheet}
                rowColors={rowColors}
                maxWidth={620}
                id={`${activeMat.replace(/\W/g, "_")}_${si}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Summary Tab ───────────────────────────────────────────────────────────────
function SummaryTab({ packedSheets, rows, oversizeRows }) {
  // Extra sheets buffer per material — editable wastage/spare allowance added
  // on top of the nested Sheets count, same "base + extra = final" pattern
  // used elsewhere in the app. Persisted globally per material name alongside
  // the other Sheet Stock settings (sheetW/sheetH/texture/qtyInStock), so it
  // survives closing and reopening this modal — same mechanism, not local state.
  const { materialStockSettings, setMaterialStockSettings } = useAppData();
  const getExtra = (mat) => Number(materialStockSettings?.[mat]?.extraQty) || 0;
  const setExtra = (mat, val) => {
    setMaterialStockSettings((prev) => ({
      ...prev,
      [mat]: { ...(prev?.[mat] || {}), extraQty: val },
    }));
  };
  // Per-material stats
  const matStats = useMemo(() => {
    const m = {};
    packedSheets.forEach((s) => {
      if (!m[s.material]) m[s.material] = { sheets: 0, totalUtil: 0, sheetW: s.sheetW, sheetH: s.sheetH, pieces: 0 };
      m[s.material].sheets++;
      m[s.material].totalUtil += s.utilization;
      m[s.material].pieces += s.placements.length;
    });
    return Object.entries(m).map(([mat, g]) => ({
      material: mat,
      sheets: g.sheets,
      avgUtil: Math.round(g.totalUtil / g.sheets),
      sheetW: g.sheetW,
      sheetH: g.sheetH,
      pieces: g.pieces,
      totalAreaM2: ((g.sheetW * g.sheetH * g.sheets) / 1e6).toFixed(2),
    }));
  }, [packedSheets]);

  if (!matStats.length) return (
    <p style={{ padding: 32, textAlign: "center", color: "#6b7280" }}>Run the layout first (click the Layout tab).</p>
  );

  const totalSheets = matStats.reduce((s, r) => s + r.sheets, 0);
  const totalExtra = matStats.reduce((s, r) => s + getExtra(r.material), 0);
  const totalFinal = totalSheets + totalExtra;
  // TH_STYLE: always set background + color directly on <th> — never rely on <tr> background
  // for headers, as browsers can override it. This pattern must be used for ALL table headers.
  const TH = (align = "center") => ({
    padding: "9px 14px",
    fontWeight: 700,
    fontSize: 11,
    background: "#1e3a5f",
    color: "#fff",
    textAlign: align,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ padding: "0 0 16px" }}>
      <OversizeWarning oversizeRows={oversizeRows} />
      {/* Utilized Sheets table */}
      <div style={{ padding: "16px 20px 8px", fontSize: 13, fontWeight: 700, color: "#1e3a5f" }}>Utilized Sheets</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {[["Material","left"],["Sheets","center"],["Extra Qty","center"],["Final Qty","center"],["Size (mm)","center"],["Pieces","center"],["Avg Utilization","center"],["Total Area","center"]].map(([h, align]) => (
                <th key={h} style={TH(align)}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matStats.map((row, i) => {
              const rawExtra = materialStockSettings?.[row.material]?.extraQty;
              const extra = Math.max(0, Number(rawExtra) || 0);
              const final = row.sheets + extra;
              return (
                <tr key={row.material} style={{ background: i % 2 === 0 ? "#f0f9ff" : "#fff" }}>
                  <td style={{ padding: "8px 14px", fontWeight: 600, color: "#1e3a5f", borderBottom: "1px solid #e5e7eb" }}>{row.material}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 15 }}>{row.sheets}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>
                    <input
                      type="number" min={0}
                      value={rawExtra ?? ""}
                      placeholder="0"
                      onChange={(e) => setExtra(row.material, e.target.value)}
                      onBlur={(e) => setExtra(row.material, Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: 56, fontSize: 13, padding: "3px 6px", textAlign: "center" }}
                    />
                  </td>
                  <td style={{ padding: "8px 14px", textAlign: "center", borderBottom: "1px solid #e5e7eb", fontWeight: 700, fontSize: 15, color: "#059669" }}>{final}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#374151" }}>{row.sheetW} × {row.sheetH}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>{row.pieces}</td>
                  <td style={{ padding: "8px 14px", textAlign: "center", borderBottom: "1px solid #e5e7eb" }}>
                    <span style={{
                      fontWeight: 700, fontSize: 14,
                      color: row.avgUtil >= 80 ? "#059669" : row.avgUtil >= 60 ? "#d97706" : "#dc2626",
                    }}>{row.avgUtil}%</span>
                    <div style={{ height: 4, background: "#e5e7eb", borderRadius: 4, marginTop: 4, width: 80, margin: "4px auto 0" }}>
                      <div style={{ height: 4, borderRadius: 4, width: `${row.avgUtil}%`, background: row.avgUtil >= 80 ? "#059669" : row.avgUtil >= 60 ? "#d97706" : "#dc2626" }} />
                    </div>
                  </td>
                  <td style={{ padding: "8px 14px", textAlign: "center", borderBottom: "1px solid #e5e7eb", color: "#374151" }}>{row.totalAreaM2} m²</td>
                </tr>
              );
            })}
            <tr style={{ background: "#1e3a5f", color: "#fff", fontWeight: 700 }}>
              <td style={{ padding: "8px 14px" }}>Total</td>
              <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 15 }}>{totalSheets}</td>
              <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 15 }}>{totalExtra}</td>
              <td style={{ padding: "8px 14px", textAlign: "center", fontSize: 15 }}>{totalFinal}</td>
              <td colSpan={4} style={{ padding: "8px 14px" }} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Utilized Parts count */}
      <div style={{ padding: "20px 20px 8px", fontSize: 13, fontWeight: 700, color: "#1e3a5f" }}>Pieces per Material</div>
      <div style={{ padding: "0 20px", display: "flex", flexWrap: "wrap", gap: 10 }}>
        {matStats.map((row) => (
          <div key={row.material} style={{ background: "#f0f9ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 14px", minWidth: 140 }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{row.material}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1e3a5f", marginTop: 2 }}>{row.pieces} <span style={{ fontSize: 12, fontWeight: 400, color: "#64748b" }}>pcs</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CutSheetOptimizer({ rows, title, subtitle, onClose }) {
  const [tab, setTab] = useState("list");
  const { materialStockSettings, setMaterialStockSettings, prices, kerfWidth, setKerfWidth } = useAppData();

  // Stock entries — array so rows can be added, deleted, renamed.
  // Seeded from globally-persisted settings (per material name) when available,
  // so texture/size/qty choices survive closing and reopening the optimizer.
  const rowMaterials = useMemo(() => [...new Set(rows.map((r) => r.material).filter(Boolean))], [rows]);

  // Material names come from Items Pricing only — never freely typed here.
  const priceMaterialNames = useMemo(
    () => [...new Set((prices || []).map((p) => p.materialName).filter(Boolean))],
    [prices]
  );
  const uid = useRef(0);
  const mkId = () => `s${uid.current++}`;
  const [stockEntries, setStockEntries] = useState(() =>
    rowMaterials.map((m) => ({ id: mkId(), name: m, ...DEFAULT_STOCK, ...(materialStockSettings?.[m] || {}) }))
  );

  const getStock = (mat) => stockEntries.find((e) => e.name === mat) || DEFAULT_STOCK;

  const updateEntry  = (id, field, val) =>
    setStockEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: val } : e));
  const addEntry     = () =>
    setStockEntries((prev) => [...prev, { id: mkId(), name: "", ...DEFAULT_STOCK }]);
  const deleteEntry  = (id) =>
    setStockEntries((prev) => prev.filter((e) => e.id !== id));

  // Persist stock settings globally (keyed by material name) so they survive
  // closing and reopening this modal, or switching rooms/projects.
  useEffect(() => {
    setMaterialStockSettings((prev) => {
      const next = { ...prev };
      stockEntries.forEach((e) => {
        if (!e.name) return;
        next[e.name] = { ...(prev[e.name] || {}), sheetW: e.sheetW, sheetH: e.sheetH, sheetTexture: e.sheetTexture, qtyInStock: e.qtyInStock };
      });
      return next;
    });
  }, [stockEntries, setMaterialStockSettings]);

  // Unique row numbers → colors
  const rowColors = useMemo(() => {
    const nums = [...new Set(rows.map((r) => r.rowNum))];
    return Object.fromEntries(nums.map((n, i) => [n, PIECE_COLORS[i % PIECE_COLORS.length]]));
  }, [rows]);

  // Saw blade / kerf width (mm) — reserved as a gap between adjacent cuts.
  // Persisted globally so it survives closing and reopening this modal.
  const kerf = kerfWidth ?? 0;
  const setKerf = setKerfWidth;

  // Bin-pack — stamp sheetTexture from stock entries onto each packed sheet
  const packedSheets = useMemo(() =>
    packSheets(rows, getStock, kerf).map((s) => ({
      ...s,
      sheetTexture: (stockEntries.find((e) => e.name === s.material) || DEFAULT_STOCK).sheetTexture,
    })),
  [rows, stockEntries, kerf]);

  // Rows whose dimensions exceed the stock sheet in all orientations
  const oversizeRows = useMemo(() =>
    rows.filter((row) => {
      const { sheetW, sheetH } = getStock(row.material);
      const w = +row.w, h = +row.h;
      return (w > sheetW || h > sheetH) && (h > sheetW || w > sheetH);
    }),
  [rows, stockEntries]);

  const [stockOpen, setStockOpen] = useState(false);
  const TABS = [["list", "Cut List"], ["layout", "Layout"], ["summary", "Summary"]];

  // Per-material sheet/utilization stats — shared by the Summary tab and exports
  const matStats = useMemo(() => {
    const m = {};
    packedSheets.forEach((s) => {
      if (!m[s.material]) m[s.material] = { sheets: 0, totalUtil: 0, sheetW: s.sheetW, sheetH: s.sheetH, pieces: 0 };
      m[s.material].sheets++;
      m[s.material].totalUtil += s.utilization;
      m[s.material].pieces += s.placements.length;
    });
    return Object.entries(m).map(([mat, g]) => ({
      material: mat, sheets: g.sheets, avgUtil: Math.round(g.totalUtil / g.sheets),
      sheetW: g.sheetW, sheetH: g.sheetH, pieces: g.pieces,
      totalAreaM2: ((g.sheetW * g.sheetH * g.sheets) / 1e6).toFixed(2),
    }));
  }, [packedSheets]);

  const exportFileBase = () => `CutSheet_${(title || "export").replace(/[^\w-]+/g, "_")}`;

  const exportExcel = () => {
    const header = ["#", "W (mm)", "H (mm)", "Qty", "Material", "Texture", "Label", "Top", "Btm", "Left", "Right"];
    const data = rows.map((row) => [
      row.rowNum, +row.w || 0, +row.h || 0, +row.qty || 0, row.material || "",
      textureValue(row.rotation), row.label || "",
      row.top || 0, row.bottom || 0, row.left || 0, row.right || 0,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    ws["!cols"] = [{ wch: 5 }, { wch: 9 }, { wch: 9 }, { wch: 6 }, { wch: 18 }, { wch: 9 }, { wch: 22 }, { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 6 }];

    const summaryHeader = ["Material", "Sheets", "Sheet W (mm)", "Sheet H (mm)", "Pieces", "Avg Utilization %", "Total Area (m2)"];
    const summaryData = matStats.map((r) => [r.material, r.sheets, r.sheetW, r.sheetH, r.pieces, r.avgUtil, r.totalAreaM2]);
    const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryData]);
    wsSummary["!cols"] = [{ wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 14 }];

    // Layout — piece-by-piece placement per sheet (the data behind the Layout tab's diagrams)
    const layoutHeader = ["Material", "Sheet #", "Label", "X (mm)", "Y (mm)", "W (mm)", "H (mm)", "Rotated", "Grain"];
    const layoutData = packedSheets.flatMap((sheet) =>
      sheet.placements.map((p) => [
        sheet.material, sheet.sheetIndex, p.label || "",
        p.x, p.y, p.w, p.h, p.rotated ? "Y" : "N", TEXTURE_LABEL[textureValue(p.grainDir)],
      ])
    );
    const wsLayout = XLSX.utils.aoa_to_sheet([layoutHeader, ...layoutData]);
    wsLayout["!cols"] = [{ wch: 18 }, { wch: 8 }, { wch: 22 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cut List");
    XLSX.utils.book_append_sheet(wb, wsLayout, "Layout");
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
    XLSX.writeFile(wb, `${exportFileBase()}.xlsx`);
  };

  // Generates an actual PDF file with jsPDF instead of relying on the
  // browser's "Print > Save as PDF" flow — the old approach opened a hidden
  // iframe and called window.print(), which depends on the OS/browser print
  // driver (e.g. Windows' "Microsoft Print to PDF") to actually produce a
  // valid file; that driver is known to silently emit corrupt/empty PDFs for
  // complex vector content (lots of thin grain-line strokes here), which is
  // why the downloaded file wouldn't open. jsPDF writes the PDF bytes
  // directly and triggers a normal file download — no external driver, no
  // print dialog, no popup blocker involved.
  const exportPDF = async () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;

    doc.setFontSize(14);
    doc.text(`Cut Sheet Optimizer — ${title}`, margin, 14);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`${subtitle || ""} · ${rows.length} cut entries`, margin, 20);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 25,
      margin: { left: margin, right: margin },
      head: [["#", "W (mm)", "H (mm)", "Qty", "Material", "Texture", "Label", "Top", "Btm", "Left", "Right"]],
      body: rows.map((row) => [
        row.rowNum, row.w, row.h, row.qty, row.material || "",
        TEXTURE_LABEL[textureValue(row.rotation)], row.label || "",
        row.top || 0, row.bottom || 0, row.left || 0, row.right || 0,
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 58, 95] },
      theme: "grid",
    });

    // Summary
    doc.addPage();
    doc.setFontSize(13);
    doc.setTextColor(30, 58, 95);
    doc.text("Summary", margin, 14);
    doc.setTextColor(0);
    autoTable(doc, {
      startY: 20,
      margin: { left: margin, right: margin },
      head: [["Material", "Sheets", "Size (mm)", "Pieces", "Avg Utilization", "Total Area (m²)"]],
      body: matStats.map((r) => [r.material, r.sheets, `${r.sheetW} × ${r.sheetH}`, r.pieces, `${r.avgUtil}%`, r.totalAreaM2]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 95] },
      theme: "grid",
    });

    // Layout — visual sheet diagrams grouped by material (mirrors the Layout
    // tab), rasterized to PNG so they can be embedded as real PDF images.
    if (packedSheets.length) {
      const byMat = {};
      packedSheets.forEach((s) => { (byMat[s.material] = byMat[s.material] || []).push(s); });

      doc.addPage();
      doc.setFontSize(13);
      doc.setTextColor(30, 58, 95);
      doc.text("Layout", margin, 14);
      doc.setTextColor(0);
      let y = 20;
      const imgW = 90;

      for (const [mat, sheets] of Object.entries(byMat)) {
        if (y > pageH - 20) { doc.addPage(); y = 20; }
        doc.setFontSize(10);
        doc.setTextColor(30, 58, 95);
        doc.text(mat, margin, y);
        doc.setTextColor(0);
        y += 5;

        for (let si = 0; si < sheets.length; si++) {
          const sheet = sheets[si];
          const scale = Math.min(320 / sheet.sheetW, 300 / sheet.sheetH);
          const svgW = Math.round(sheet.sheetW * scale);
          const svgH = Math.round(sheet.sheetH * scale);
          const svgStr = sheetSvgMarkup(sheet, rowColors, `${mat.replace(/\W/g, "_")}_${si}`, 320);
          const imgH = imgW * (svgH / svgW);

          if (y + 4 + imgH > pageH - 10) { doc.addPage(); y = 20; }

          doc.setFontSize(7);
          doc.setTextColor(100);
          doc.text(`Sheet #${sheet.sheetIndex} · ${sheet.sheetW}×${sheet.sheetH}mm · ${sheet.utilization}% · ${sheet.placements.length} pcs`, margin, y);
          doc.setTextColor(0);

          // eslint-disable-next-line no-await-in-loop
          const jpegDataUrl = await rasterizeSvg(svgStr, svgW, svgH);
          doc.addImage(jpegDataUrl, "JPEG", margin, y + 2, imgW, imgH);
          y += imgH + 10;
        }
        y += 4;
      }
    }

    doc.save(`${exportFileBase()}.pdf`);
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 3000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 1060, boxShadow: "0 24px 64px rgba(0,0,0,0.28)", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#1e3a5f,#185fa5)", color: "#fff", padding: "16px 22px", borderRadius: "14px 14px 0 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Cut Sheet Optimizer — {title}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>{subtitle} · {rows.length} cut entries</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={exportExcel}
              disabled={!rows.length}
              title="Export cut list + summary as Excel"
              style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "none", borderRadius: 8, padding: "0 12px", height: 34, fontSize: 12, fontWeight: 700, cursor: rows.length ? "pointer" : "not-allowed", opacity: rows.length ? 1 : 0.5, display: "flex", alignItems: "center", gap: 5 }}
            >⬇ Excel</button>
            <button
              onClick={exportPDF}
              disabled={!rows.length}
              title="Export cut list + summary as PDF"
              style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "none", borderRadius: 8, padding: "0 12px", height: 34, fontSize: 12, fontWeight: 700, cursor: rows.length ? "pointer" : "not-allowed", opacity: rows.length ? 1 : 0.5, display: "flex", alignItems: "center", gap: 5 }}
            >⬇ PDF</button>
            <button
              onClick={onClose}
              style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >✕</button>
          </div>
        </div>

        {/* Stock Sheet Inventory — collapsible */}
        <div style={{ borderBottom: "1px solid #e5e7eb", background: "#f8fafc", flexShrink: 0 }}>
          {/* Header row — clicking toggles collapse */}
          <div
            onClick={() => setStockOpen((o) => !o)}
            style={{ padding: "8px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Sheet Stock</span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>{stockEntries.length} material{stockEntries.length !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                onClick={(ev) => ev.stopPropagation()}
                title="Saw blade width reserved between cuts"
                style={{ display: "flex", alignItems: "center", gap: 5 }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>Kerf (mm)</span>
                <input
                  type="number" min={0} step={0.5} value={kerf}
                  onChange={(ev) => setKerf(+ev.target.value)}
                  onBlur={(ev) => setKerf(Math.max(0, +ev.target.value || 0))}
                  style={{ width: 46, fontSize: 11, padding: "2px 4px", textAlign: "center", border: "1px solid #d1d5db", borderRadius: 4 }}
                />
              </div>
              {stockOpen && (
                <button
                  onClick={(ev) => { ev.stopPropagation(); addEntry(); }}
                  style={{ fontSize: 11, fontWeight: 700, color: "#185fa5", background: "none", border: "1px solid #bfdbfe", borderRadius: 5, padding: "2px 10px", cursor: "pointer" }}
                >+ Add Material</button>
              )}
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, transition: "transform 0.2s", display: "inline-block", transform: stockOpen ? "rotate(90deg)" : "none" }}>▶</span>
            </div>
          </div>
          {stockOpen && <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {["Material", "L (mm)", "W (mm)", "Texture", "Qty in Stock", ""].map((h) => (
                    <th key={h} style={{ padding: "4px 10px", fontWeight: 700, color: "#64748b", textAlign: h === "Qty in Stock" ? "center" : "left", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockEntries.map((e) => {
                  const inUse = rowMaterials.includes(e.name);
                  // Options for a manually-added entry: materials from Items Pricing
                  // not already claimed by another stock row (plus its own current value).
                  const availableNames = priceMaterialNames.filter(
                    (n) => n === e.name || !stockEntries.some((o) => o.id !== e.id && o.name === n)
                  );
                  return (
                  <tr key={e.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "3px 10px" }}>
                      {inUse ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#1e3a5f", padding: "2px 6px", display: "inline-block" }}>
                          {e.name}
                        </span>
                      ) : (
                        <select
                          value={e.name}
                          onChange={(ev) => updateEntry(e.id, "name", ev.target.value)}
                          style={{ fontSize: 11, fontWeight: 600, color: "#1e3a5f", border: "1px solid #d1d5db", borderRadius: 4, padding: "2px 6px", width: 130, background: "#fff" }}
                        >
                          <option value="">— Select material —</option>
                          {availableNames.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{ padding: "3px 10px" }}>
                      <input type="number" value={e.sheetW}
                        onChange={(ev) => updateEntry(e.id, "sheetW", +ev.target.value)}
                        onBlur={(ev) => updateEntry(e.id, "sheetW", Math.max(100, +ev.target.value || DEFAULT_STOCK.sheetW))}
                        style={{ width: 60, fontSize: 11, padding: "2px 4px", textAlign: "center", border: "1px solid #d1d5db", borderRadius: 4 }} />
                    </td>
                    <td style={{ padding: "3px 10px" }}>
                      <input type="number" value={e.sheetH}
                        onChange={(ev) => updateEntry(e.id, "sheetH", +ev.target.value)}
                        onBlur={(ev) => updateEntry(e.id, "sheetH", Math.max(100, +ev.target.value || DEFAULT_STOCK.sheetH))}
                        style={{ width: 60, fontSize: 11, padding: "2px 4px", textAlign: "center", border: "1px solid #d1d5db", borderRadius: 4 }} />
                    </td>
                    <td style={{ padding: "3px 10px" }}>
                      <div style={{ display: "flex", gap: 3 }}>
                        {[{ v: 0, label: "○", title: "No Texture" }, { v: 1, label: "≡", title: "Horizontal" }, { v: 2, label: "∥", title: "Vertical" }].map(({ v, label, title }) => (
                          <button key={v} title={title} onClick={() => updateEntry(e.id, "sheetTexture", v)}
                            style={{ width: 24, height: 24, fontSize: 13, cursor: "pointer", borderRadius: 4, padding: 0, lineHeight: 1,
                              border: "1px solid " + (e.sheetTexture === v ? "#1e3a5f" : "#d1d5db"),
                              background: e.sheetTexture === v ? "#1e3a5f" : "#fff",
                              color: e.sheetTexture === v ? "#fff" : "#374151" }}
                          >{label}</button>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: "3px 10px", textAlign: "center" }}>
                      <input type="number" min={0} value={e.qtyInStock}
                        onChange={(ev) => updateEntry(e.id, "qtyInStock", Math.max(0, +ev.target.value || 0))}
                        style={{ width: 54, fontSize: 11, padding: "2px 4px", textAlign: "center", border: "1px solid #d1d5db", borderRadius: 4 }} />
                    </td>
                    <td style={{ padding: "3px 8px", textAlign: "center" }}>
                      <button onClick={() => deleteEntry(e.id)}
                        style={{ fontSize: 13, color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
                        title="Remove"
                      >✕</button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "2px solid #e5e7eb", padding: "0 20px", flexShrink: 0, background: "#fff" }}>
          {TABS.map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "10px 18px", fontSize: 13, fontWeight: tab === t ? 700 : 500,
                color: tab === t ? "#185fa5" : "#6b7280",
                background: "none", border: "none", cursor: "pointer",
                borderBottom: tab === t ? "2px solid #185fa5" : "2px solid transparent",
                marginBottom: -2, transition: "color 0.15s",
              }}
            >{label}</button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ overflowY: "auto", maxHeight: "68vh" }}>
          {tab === "list"    && <CutListTab rows={rows} rowColors={rowColors} getStock={getStock} oversizeRows={oversizeRows} />}
          {tab === "layout"  && <LayoutTab packedSheets={packedSheets} rowColors={rowColors} oversizeRows={oversizeRows} />}
          {tab === "summary" && <SummaryTab packedSheets={packedSheets} rows={rows} oversizeRows={oversizeRows} />}
        </div>
      </div>
    </div>
  );
}
