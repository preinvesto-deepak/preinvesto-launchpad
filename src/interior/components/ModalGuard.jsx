import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// One place that decides how a popup closes. Drop <ModalGuard .../> as the FIRST
// child of the popup's dark full-screen overlay <div> (it renders nothing there)
// and the popup closes on:
//   1. its own ✕ / Cancel button (those still call your onClose directly),
//   2. a click on the dark background outside the box (press AND release must
//      both land on the background, so dragging a text selection out of an input
//      never closes it),
//   3. the Escape key — only the TOP popup reacts when popups are stacked.
//
// Props
//   onClose    closes the popup (discarding anything typed)
//   value      optional: the form's data. If it differs from what it was when the
//              popup opened, closing by Esc / outside click asks first.
//   dirty      optional: tell it directly that there are unsaved changes.
//   onSave     optional: saves (your existing Save handler). When given, the
//              question is Save / Discard / Keep editing; otherwise Discard /
//              Keep editing. Save is expected to close the popup itself.
//   label      optional: noun for the question, e.g. "this lead".
//
// A popup with no value/dirty (a picker, viewer or an Are-you-sure box) just
// closes straight away — for a confirmation that means "No".

const stack = [];
let listening = false;
const onKey = (e) => {
  if (e.key !== "Escape" || !stack.length) return;
  e.preventDefault();
  stack[stack.length - 1].esc();
};
const ensureListener = () => {
  if (listening) return;
  listening = true;
  window.addEventListener("keydown", onKey);
};

const same = (a, b) => {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return true; }
};

export default function ModalGuard({ onClose, value, dirty, onSave, label }) {
  const anchor = useRef(null);
  const [asking, setAsking] = useState(false);
  const initial = useRef(undefined);
  if (initial.current === undefined && value !== undefined) initial.current = { v: value };

  const isDirty = dirty === true || (value !== undefined && initial.current && !same(initial.current.v, value));

  // Latest props for the long-lived listeners below.
  const live = useRef({});
  live.current = { onClose, isDirty, onSave, asking };

  const request = () => {
    const l = live.current;
    if (l.asking) { setAsking(false); return; }
    if (l.isDirty) setAsking(true); else l.onClose?.();
  };

  useEffect(() => {
    const entry = { esc: () => request() };
    ensureListener();
    stack.push(entry);
    return () => { const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const overlay = anchor.current?.parentElement;
    if (!overlay) return undefined;
    let downOnBackdrop = false;
    const down = (e) => { downOnBackdrop = e.target === overlay; };
    const click = (e) => { if (downOnBackdrop && e.target === overlay) request(); downOnBackdrop = false; };
    overlay.addEventListener("mousedown", down);
    overlay.addEventListener("click", click);
    return () => { overlay.removeEventListener("mousedown", down); overlay.removeEventListener("click", click); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const btn = { padding: "7px 14px", fontSize: 13, borderRadius: 8, border: "1px solid #d1d5db", cursor: "pointer" };
  return (
    <>
      <span ref={anchor} style={{ display: "none" }} />
      {asking && createPortal(
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setAsking(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div style={{ background: "#fff", borderRadius: 12, padding: 22, width: 400, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{onSave ? "Save your changes?" : "Discard your changes?"}</h3>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6b7280" }}>
              You have changes{label ? ` to ${label}` : ""} that haven't been saved.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button autoFocus onClick={() => setAsking(false)} style={{ ...btn, background: "#f3f4f6", color: "#374151" }}>Keep editing</button>
              <button onClick={() => { setAsking(false); live.current.onClose?.(); }} style={{ ...btn, background: "#dc2626", color: "#fff", border: "1px solid #dc2626" }}>Discard</button>
              {onSave && (
                <button onClick={() => { setAsking(false); live.current.onSave?.(); }} style={{ ...btn, background: "#2563eb", color: "#fff", border: "1px solid #2563eb" }}>Save</button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
