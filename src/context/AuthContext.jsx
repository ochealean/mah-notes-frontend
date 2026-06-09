// ============================================================
//  Auth state: holds the current user, restores the session from
//  a stored JWT on load, and exposes login/register/google/logout.
// ============================================================
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from '../lib/api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false); // false until we've checked the stored token

  // On first load, validate any stored token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) { setReady(true); return; }
      try {
        const { user } = await api.get('/api/auth/me');
        if (!cancelled) setUser(user);
      } catch {
        setToken(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const adopt = useCallback((data) => {
    setToken(data.token);
    setUser(data.user);
  }, []);

  const login = useCallback(async (email, password) => {
    adopt(await api.post('/api/auth/login', { email, password }));
  }, [adopt]);

  const register = useCallback(async (email, password) => {
    adopt(await api.post('/api/auth/register', { email, password }));
  }, [adopt]);

  const loginWithGoogle = useCallback(async (credential) => {
    adopt(await api.post('/api/auth/google', { credential }));
  }, [adopt]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, register, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
