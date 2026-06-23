import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  display_name: string;
  email: string;
  phone: string;
  role_id: string;
  department_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  permissions: string[];
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = '';

async function loadPermissions(token: string, roleId: string): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/api/roles/${roleId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const role = await res.json();
    return role.permissions || [];
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!token);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(async (userData) => {
        const perms = await loadPermissions(token, userData.role_id);
        setUser({ ...userData, permissions: perms });
      })
      .catch(() => {
        setToken(null);
        localStorage.removeItem('token');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: '登录失败' }));
      throw new Error(err.detail || '登录失败');
    }
    const data = await res.json();
    setToken(data.access_token);
    localStorage.setItem('token', data.access_token);
    // Load permissions after login
    const perms = await loadPermissions(data.access_token, data.user.role_id);
    setUser({ ...data.user, permissions: perms });
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useHasPermission() {
  const { user } = useAuth();
  const perms = user?.permissions || [];
  return (perm: string) => perms.includes('*') || perms.includes(perm);
}
