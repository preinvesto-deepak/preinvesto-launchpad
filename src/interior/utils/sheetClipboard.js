import { useSyncExternalStore } from "react";

// The one-slot clipboard behind the Copy / Paste buttons on each "Sheet
// Calculation and Cut List". It lives OUTSIDE any page's state and is kept in
// localStorage, so a sheet copied in one template can be pasted into another
// template, a project, or back — navigating between pages (or reloading)
// doesn't lose it. Shape: { fields, sourceLabel }.

const KEY = "interior_sheet_clipboard_v1";
const listeners = new Set();
let cache; // undefined = not read yet

const read = () => {
  if (cache === undefined) {
    try {
      const raw = localStorage.getItem(KEY);
      cache = raw ? JSON.parse(raw) : null;
    } catch {
      cache = null;
    }
  }
  return cache;
};

export const setSheetClipboard = (value) => {
  cache = value || null;
  try {
    if (cache) localStorage.setItem(KEY, JSON.stringify(cache));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked — still works for this page load via the cache */
  }
  listeners.forEach((l) => l());
};

const subscribe = (listener) => {
  listeners.add(listener);
  // A copy made in another browser tab shows up here too.
  const onStorage = (e) => {
    if (e.key === KEY) { cache = undefined; listener(); }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
};

/** [copiedSheet, setCopiedSheet] — drop-in for the old per-page useState. */
export const useSheetClipboard = () => [useSyncExternalStore(subscribe, read), setSheetClipboard];
