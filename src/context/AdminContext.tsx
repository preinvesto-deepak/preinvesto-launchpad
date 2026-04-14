import { createContext, useContext, useState } from 'react';

const STORAGE_KEY = 'preinvesto_admin_v1';
const API_URL = import.meta.env.VITE_API_URL || '';

interface AdminContextType {
  isAdmin: boolean;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
}

const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  login: async () => false,
  logout: () => {},
});

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY) === '1';
  });

  async function login(pin: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_URL}/api/admin_login.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          localStorage.setItem(STORAGE_KEY, '1');
          setIsAdmin(true);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setIsAdmin(false);
  }

  return (
    <AdminContext.Provider value={{ isAdmin, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminContext);
}
