// ============================================================
//  Auth state: holds the current user, restores the session from
//  a stored JWT on load, and exposes login/register/google/logout.
//
//  The user object is cached in localStorage so a signed-in device
//  stays signed in while OFFLINE — we only drop the session when the
//  server explicitly rejects the token (401), not on a network error.
// ============================================================
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from '../lib/api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const USER_KEY = 'mahnotes_user';
const cacheUser = (u) => { try { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); } catch {} };
const readCachedUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false); // false until we've checked the stored token

  // On first load, restore the cached user (instant, works offline) then
  // validate the token in the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) { setReady(true); return; }
      const cached = readCachedUser();
      if (cached && !cancelled) setUser(cached);
      try {
        const { user } = await api.get('/api/auth/me');
        if (!cancelled) { setUser(user); cacheUser(user); }
      } catch (err) {
        // Only sign out on an explicit auth rejection; keep the session on
        // network failures (offline) so the device stays logged in.
        if (err?.status === 401) { setToken(null); cacheUser(null); if (!cancelled) setUser(null); }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const adopt = useCallback((data) => {
    setToken(data.token);
    cacheUser(data.user);
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
    cacheUser(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, register, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
