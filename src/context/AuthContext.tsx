import { createContext, useContext, useEffect, useState, useCallback } from "react";

const TOKEN_KEY = "preinvesto_auth_token_v1";
const API_URL = import.meta.env.VITE_API_URL || "";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  mobile: string;
}

interface AuthContextType {
  user: AuthUser | null;
  /** True while the stored token is being checked on first load. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, mobile: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (token: string, password: string) => Promise<string>;
  updateProfile: (name: string, email: string, mobile: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<string>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function getAuthToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

/**
 * fetch() with the session token attached. The Interior tool uses this for
 * every call so its data stays scoped to the signed-in account.
 */
export async function authFetch(path: string, init: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

/** POST JSON and unwrap the API's { success, error, ... } envelope. */
async function postJson(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    throw new Error("The server returned an unexpected response. Please try again.");
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

/** postJson, but with the session token attached. */
async function postJsonAuth(path: string, body: unknown) {
  const res = await authFetch(path, { method: "POST", body: JSON.stringify(body) });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    throw new Error("The server returned an unexpected response. Please try again.");
  }
  if (!res.ok || !data.success) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on load: ask the server who this stored token belongs
  // to. An expired or revoked token simply clears itself.
  useEffect(() => {
    let cancelled = false;
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    authFetch("/api/auth_me.php")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      })
      .catch(() => {
        // Network/API down — stay logged out rather than guessing.
        if (!cancelled) localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await postJson("/api/auth_login.php", { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  }, []);

  const signup = useCallback(async (name: string, email: string, mobile: string, password: string) => {
    const data = await postJson("/api/auth_signup.php", { name, email, mobile, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authFetch("/api/auth_logout.php", { method: "POST" });
    } catch {
      // Revoking server-side is best-effort — the local session goes either way.
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    const data = await postJson("/api/auth_forgot_password.php", { email });
    return data.message as string;
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    const data = await postJson("/api/auth_reset_password.php", { token, password });
    return data.message as string;
  }, []);

  const updateProfile = useCallback(async (name: string, email: string, mobile: string) => {
    const data = await postJsonAuth("/api/auth_update_profile.php", { name, email, mobile });
    setUser(data.user);
  }, []);

  // The server keeps this session alive and drops the others, so there's no
  // token to swap here.
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const data = await postJsonAuth("/api/auth_change_password.php", { currentPassword, newPassword });
    return data.message as string;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, signup, logout, forgotPassword, resetPassword, updateProfile, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
