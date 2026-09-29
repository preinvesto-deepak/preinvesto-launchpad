import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const UnsavedChangesContext = createContext(null);

/**
 * A handful of pages (Templates, Material Models) hold edits in local
 * component state and only write them into the autosaved AppDataContext on
 * an explicit "Save" click — unlike the rest of the app, where every edit is
 * already autosaved. Navigating away from one of those pages mid-edit (a
 * Sidebar link, "Back to Preinvesto", Sign out, or just closing the tab)
 * silently threw the draft away.
 *
 * This provider lets exactly one such page "register" its unsaved-changes
 * state; anything that wants to navigate away calls guardedNavigate(), which
 * runs the navigation immediately if there's nothing to lose, or shows a
 * Save/Discard/Cancel prompt first if there is.
 */
function UnsavedChangesProvider({ children }) {
  const guardRef = useRef(null); // { isDirty, label, onSaveAndLeave, onDiscardAndLeave } | null
  const [confirm, setConfirm] = useState(null); // { label, proceed, guard } | null

  // registerGuard(guard) — call with a new object whenever isDirty/label/the
  // save+discard callbacks change; returns an unregister function to call on
  // unmount (or when isDirty becomes false, harmless either way).
  const registerGuard = useCallback((guard) => {
    guardRef.current = guard;
    return () => {
      if (guardRef.current === guard) guardRef.current = null;
    };
  }, []);

  // Wrap any "leave this page" action in this. Runs `proceed` immediately if
  // nothing's unsaved; otherwise opens the Save/Discard/Cancel modal and only
  // runs `proceed` once the user picks Save or Discard.
  const guardedNavigate = useCallback((proceed) => {
    const guard = guardRef.current;
    if (!guard || !guard.isDirty) {
      proceed();
      return;
    }
    setConfirm({ proceed, guard });
  }, []);

  // Tab close/refresh — the one navigation path guardedNavigate can't cover,
  // since it happens outside React entirely.
  useEffect(() => {
    const handler = (e) => {
      if (guardRef.current?.isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const handleSave = async () => {
    const { proceed, guard } = confirm;
    await guard.onSaveAndLeave?.();
    setConfirm(null);
    proceed();
  };
  const handleDiscard = () => {
    const { proceed, guard } = confirm;
    guard.onDiscardAndLeave?.();
    setConfirm(null);
    proceed();
  };

  return (
    <UnsavedChangesContext.Provider value={{ registerGuard, guardedNavigate }}>
      {children}
      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 400 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Unsaved changes</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>
              {confirm.guard.label || "This page"} has changes that haven't been saved yet. Save them before leaving?
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirm(null)} style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #d1d5db", padding: "7px 14px", fontSize: 13 }}>Cancel</button>
              <button onClick={handleDiscard} style={{ background: "#dc2626", padding: "7px 14px", fontSize: 13 }}>Discard & Leave</button>
              <button onClick={handleSave} style={{ background: "#2563eb", padding: "7px 14px", fontSize: 13 }}>Save & Leave</button>
            </div>
          </div>
        </div>
      )}
    </UnsavedChangesContext.Provider>
  );
}

function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}

export { UnsavedChangesProvider, useUnsavedChanges };
