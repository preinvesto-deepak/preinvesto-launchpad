// Data layer for the Interior tool. Talks to /api/interior_state.php, which
// scopes every row to the signed-in account — so each user gets their own
// isolated workspace. The session token is attached by authFetch.

import { authFetch } from "@/context/AuthContext";

/**
 * The signed-in user's whole workspace.
 * Returns { data, isNew } — isNew is true when this account has never saved
 * anything, so the caller can seed a starter workspace instead of an empty app.
 */
export async function fetchState() {
  const res = await authFetch("/api/interior_state.php");
  if (res.status === 401) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!res.ok) {
    throw new Error(`Failed to load your workspace (${res.status})`);
  }
  const body = await res.json();
  return { data: body.data, isNew: body.isNew };
}

export async function saveState(state) {
  const res = await authFetch("/api/interior_state.php", {
    method: "POST",
    body: JSON.stringify(state),
  });
  if (res.status === 401) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to save (${res.status})`);
  }
  return res.json();
}
