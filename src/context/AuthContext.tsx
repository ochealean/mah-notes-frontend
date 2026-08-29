// ============================================================
//  Auth state: holds the current user, restores the session from
//  a stored JWT on load, and exposes login/register/google/logout.
//
//  The user object is cached in localStorage so a signed-in device
//  stays signed in while OFFLINE — we only drop the session when the
//  server explicitly rejects the token (401), not on a network error.
// ============================================================
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from '../lib/api';
import { isNative } from '../lib/nativeAuth';
import { consumeGoogleRedirect, pendingGoogleRedirect } from '../lib/googleRedirect';
import { notify } from '../lib/notify';
import { rateGate } from '../lib/rateLimit';
import { clearCache } from '../lib/webCache';
import { connectRealtime, disconnectRealtime, onRealtime } from '../lib/realtime';

// Throttle sign-in attempts (login / register / Google) so a stuck button or
// retry loop can't spam the auth endpoint. The server enforces a hard limit too.
const authGate = () => rateGate('auth', {
  limit: 8, windowMs: 60_000,
  message: 'Too many sign-in attempts — wait a moment and try again.',
});

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const USER_KEY = 'mahnotes_user';
const cacheUser = (u) => { try { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); } catch {} };
const readCachedUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; } };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false); // false until we've checked the stored token
  // 'login' | 'link' | null — set synchronously on the FIRST render when we've just
  // come back from Google, so the UI can show "signing you in" for the whole code
  // exchange instead of silently re-rendering the login form (which made users
  // click Google again and cancel the in-flight attempt).
  const [googlePending, setGooglePending] = useState(() => (isNative ? null : pendingGoogleRedirect()));

  // On first load, restore the cached user (instant, works offline) then
  // validate the token in the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) { setReady(true); return; }
      const cached = readCachedUser();
      // A cached user means we can render the app RIGHT NOW and validate the
      // token in the background. Previously `ready` waited on /api/auth/me, so
      // every visit sat on a spinner for a full round trip before the data
      // fetches could even start — three sequential waves before first paint,
      // and on a cold backend that first wave is the expensive one.
      // A 401 below still signs us out, so this only ever costs a brief render
      // of stale data in the rare case the token has been revoked.
      if (cached && !cancelled) { setUser(cached); setReady(true); }
      try {
        const { user } = await api.get('/api/auth/me');
        if (!cancelled) { setUser(user); cacheUser(user); }
      } catch (err) {
        // Only sign out on an explicit auth rejection; keep the session on
        // network failures (offline) so the device stays logged in.
        if (err?.status === 401) { setToken(null); cacheUser(null); clearCache(); if (!cancelled) setUser(null); }
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

  // `identifier` is an email OR a username — the server tries both.
  const login = useCallback(async (identifier, password) => {
    authGate();
    return adopt(await api.post('/api/auth/login', { login: identifier, password }));
  }, [adopt]);

  const register = useCallback(async (email, password, name, username) => {
    authGate();
    return adopt(await api.post('/api/auth/register', { email, password, name, username }));
  }, [adopt]);

  // Ask for a reset link. The server always reports success (it won't reveal
  // whether an account exists), so there's nothing to branch on here.
  const forgotPassword = useCallback(async (email) => {
    authGate();
    return api.post('/api/auth/forgot-password', { email });
  }, []);

  // Swap a reset token for a new password. On success the server signs us in,
  // so adopt() puts us straight into the app.
  const resetPassword = useCallback(async (token, password) => {
    authGate();
    return adopt(await api.post('/api/auth/reset-password', { token, password }));
  }, [adopt]);

  // Accepts either an id token (native picker → { credential }) or a web
  // auth-code (our own button → { code }). The backend handles both.
  const loginWithGoogle = useCallback(async (payload) => {
    authGate();
    const body = typeof payload === 'string' ? { credential: payload } : payload;
    return adopt(await api.post('/api/auth/google', body));
  }, [adopt]);

  // Connect a Google account to the CURRENT signed-in account (keeps the same
  // session/token — only the user record gains a googleId). Accepts an id token
  // (native) or a web auth-code, same as loginWithGoogle.
  const linkGoogle = useCallback(async (payload) => {
    const body = typeof payload === 'string' ? { credential: payload } : payload;
    const { user: u } = await api.post('/api/auth/link-google', body);
    cacheUser(u);
    setUser(u);
    return u;
  }, []);

  // Handle the return leg of the web Google *redirect* flow: if we came back from
  // Google with a code, finish login or linking. Runs once on mount.
  useEffect(() => {
    if (isNative) return;
    const r = consumeGoogleRedirect();
    if (!r) { setGooglePending(null); return; }
    (async () => {
      try {
        if (r.error) {
          if (r.error !== 'state_mismatch') notify('Google sign-in was cancelled or failed.', 'error');
        } else if (r.intent === 'link') {
          await linkGoogle({ code: r.code, redirectUri: r.redirectUri });
          notify('Google connected', 'success');
        } else {
          await loginWithGoogle({ code: r.code, redirectUri: r.redirectUri });
        }
      } catch (err) {
        notify(err?.message || 'Could not complete Google sign-in.', 'error');
      } finally {
        // Always drop the spinner — success, cancel, or failure — so the user
        // lands back on a usable screen instead of a stuck loader.
        setGooglePending(null);
      }
    })();
  }, [loginWithGoogle, linkGoogle]);

  // Edit the profile (display name). A blank name clears it server-side and the
  // returned user falls back to the email prefix.
  const updateProfile = useCallback(async (displayName) => {
    const { user: u } = await api.patch('/api/auth/me', { displayName });
    cacheUser(u);
    setUser(u);
    return u;
  }, []);

  // Add a password to a Google-only account, or change an existing one
  // (currentPassword required only when one is already set — the server
  // enforces this). Keeps the session; only the user record changes.
  const setPassword = useCallback(async (password, currentPassword) => {
    authGate();
    const { user: u } = await api.post('/api/auth/set-password', { password, currentPassword });
    cacheUser(u);
    setUser(u);
    return u;
  }, []);

  // Add or change the account's login username (a separate handle from email).
  const setUsername = useCallback(async (username) => {
    const { user: u } = await api.post('/api/auth/set-username', { username });
    cacheUser(u);
    setUser(u);
    return u;
  }, []);

  // Permanently delete the account (notes, plans, schedules, share links,
  // friends — everything server-side, cascaded on the backend). `password` is
  // required only when the account has one; a Google-only account has nothing
  // to check there, so the caller's typed-email confirmation is the safeguard.
  // On success we're signed out locally — there's no account left to hold a
  // session for.
  const deleteAccount = useCallback(async (password) => {
    await api.del('/api/auth/me', password ? { password } : undefined);
    setToken(null);
    cacheUser(null);
    clearCache();
    setUser(null);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    cacheUser(null);
    clearCache();
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
    <AuthContext.Provider value={{ user, ready, googlePending, login, register, loginWithGoogle, linkGoogle, forgotPassword, resetPassword, setPassword, setUsername, updateProfile, deleteAccount, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
