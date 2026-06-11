import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { getBootstrap, clearBootstrap } from './bootstrap.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Explicit refresh (impersonation changes etc.) — always hits the API.
  const refresh = useCallback(async () => {
    try {
      const me = await api.getMe();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Cold open rides the shared /api/bootstrap request.
  useEffect(() => {
    (async () => {
      const boot = await getBootstrap();
      if (boot && 'me' in boot) {
        setUser(boot.me);
        setLoading(false);
      } else {
        refresh();
      }
    })();
  }, [refresh]);

  const login = useCallback(async (username, password) => {
    const me = await api.login(username, password);
    clearBootstrap(); // session changed — never serve pre-login slices
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch {}
    clearBootstrap();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
