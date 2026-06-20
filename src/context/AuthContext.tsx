// ============================================================
//  Auth state: holds the current user, restores the session from
//  a stored JWT on load, and exposes login/register/google/logout.
//
//  The user object is cached in localStorage so a signed-in device
//  stays signed in while OFFLINE — we only drop the session when the
//  server explicitly rejects the token (401), not on a network error.
// ============================================================
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { googleLogout } from '@react-oauth/google';
import { api, setToken, getToken } from '../lib/api';
import { isNative } from '../lib/nativeAuth';
import { connectRealtime, disconnectRealtime, onRealtime } from '../lib/realtime';

// Tell Google Identity (web only) to drop its cached/auto-select session. This
// does NOT sign the user out of our app — it only stops GIS from re-rendering a
// lingering personalized "Sign in as you" button (the stray floating green G).
function clearGoogleIdentitySession() {
  if (isNative) return;
  try { googleLogout(); } catch {}
}

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
      // Already signed in from a previous session → make sure GIS isn't keeping a
      // lingering personalized button alive (the stray floating green G).
      clearGoogleIdentitySession();
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
    return data.user;
  }, []);

  const login = useCallback(async (email, password) => (
    adopt(await api.post('/api/auth/login', { email, password }))
  ), [adopt]);

  const register = useCallback(async (email, password, name) => (
    adopt(await api.post('/api/auth/register', { email, password, name }))
  ), [adopt]);

  const loginWithGoogle = useCallback(async (credential) => {
    const u = adopt(await api.post('/api/auth/google', { credential }));
    clearGoogleIdentitySession(); // stop GIS leaving a lingering personalized button
    return u;
  }, [adopt]);

  // Connect a Google account to the CURRENT signed-in account (keeps the same
  // session/token — only the user record gains a googleId).
  const linkGoogle = useCallback(async (credential) => {
    const { user: u } = await api.post('/api/auth/link-google', { credential });
    cacheUser(u);
    setUser(u);
    clearGoogleIdentitySession(); // stop GIS leaving a lingering personalized button
    return u;
  }, []);

  // Edit the profile (display name). A blank name clears it server-side and the
  // returned user falls back to the email prefix.
  const updateProfile = useCallback(async (displayName) => {
    const { user: u } = await api.patch('/api/auth/me', { displayName });
    cacheUser(u);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    cacheUser(null);
    setUser(null);
  }, []);

  // Realtime: keep one socket alive while signed in. me:updated covers this
  // account's other devices (and echoes back our own edits). Keyed on the user
  // id so re-renders from setUser don't churn the connection.
  useEffect(() => {
    if (!user) { disconnectRealtime(); return undefined; }
    connectRealtime();
    const off = onRealtime('me:updated', ({ user: u }) => { setUser(u); cacheUser(u); });
    return off;
  }, [user?.id]);

  return (
    <AuthContext.Provider value={{ user, ready, login, register, loginWithGoogle, linkGoogle, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
