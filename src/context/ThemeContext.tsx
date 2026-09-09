// ============================================================
//  Theme: light / dark / system + a customizable colour theme.
//  Reflects the *effective* light/dark theme onto <html data-theme>
//  and applies any custom theme as inline CSS variables. Inline
//  scripts in index.html apply both before first paint (no flash);
//  this keeps them in sync afterwards.
//
//  The colour theme also lives on the ACCOUNT, for two reasons: it
//  follows the user between devices, and whoever opens one of their
//  share links sees the page in the author's colours (see Viewer).
//  ThemeProvider wraps AuthProvider, so auth pushes the account's
//  theme down here via adoptAccountTheme rather than the reverse.
// ============================================================
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { loadPalette, savePalette, applyPalette } from '../lib/palette';
import { api, getToken } from '../lib/api';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const KEY = 'mahnotes_theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

const resolve = (pref) => (pref === 'system' ? (media.matches ? 'dark' : 'light') : pref);
const apply = (effective) => { document.documentElement.dataset.theme = effective; };

export function ThemeProvider({ children }) {
  const [pref, setPref] = useState(() => localStorage.getItem(KEY) || 'system');
  const [palette, setPaletteState] = useState(() => loadPalette());
  const pushTimer = useRef(null);
  const adoptedFor = useRef(null);

  // The colour picker fires on every drag, so the account write is debounced.
  // Failures are ignored: the theme is already applied and saved locally, and
  // the next change will try again.
  const pushToAccount = useCallback((value) => {
    if (!getToken()) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      api.put('/api/auth/theme', value || {}).catch(() => { /* local copy stands */ });
    }, 700);
  }, []);
  useEffect(() => () => clearTimeout(pushTimer.current), []);

  useEffect(() => {
    apply(resolve(pref));
    localStorage.setItem(KEY, pref);
    if (pref !== 'system') return;
    const onChange = () => apply(resolve('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [pref]);

  // Persist + apply the custom theme whenever it changes. The effective
  // light/dark mode is passed in because a light theme is inverted for dark
  // mode (see computeVars) rather than being ignored by it.
  const effective = resolve(pref);
  const setPalette = useCallback((next, { push = true } = {}) => {
    const value = next && Object.keys(next).length ? next : null;
    setPaletteState(value);
    savePalette(value);
    applyPalette(value, resolve(pref));
    if (push) pushToAccount(value);
  }, [pref, pushToAccount]);

  const resetPalette = useCallback(() => setPalette(null), [setPalette]);

  // Called by AuthContext once the signed-in account is known. The account is
  // the source of truth at sign-in, but only once per account — re-adopting on
  // every /api/auth/me would fight an edit the user is making right now. Keyed
  // on the id so signing into a different account still picks up its theme.
  const adoptAccountTheme = useCallback((account) => {
    const id = account?.id ? String(account.id) : null;
    if (!id || adoptedFor.current === id) return;
    adoptedFor.current = id;

    const t = account.theme;
    const hasAccountTheme = !!(t && (t.ink || t.paper || t.accent));
    if (hasAccountTheme) {
      setPalette({ ink: t.ink, paper: t.paper, accent: t.accent, ambient: t.ambient !== false }, { push: false });
      return;
    }
    // No theme on the account but one on this device — push it up, so a theme
    // chosen before this synced (or on a device that was offline) still
    // reaches the share links.
    const local = loadPalette();
    if (local && (local.ink || local.paper || local.accent)) pushToAccount(local);
  }, [setPalette, pushToAccount]);

  // Apply on mount (covers an old cached shell whose pre-paint script didn't
  // run) and again whenever light/dark flips, so a custom theme follows the
  // mode instead of overriding it.
  useEffect(() => { applyPalette(palette, effective); }, [palette, effective]);

  return (
    <ThemeContext.Provider value={{
      pref, setTheme: setPref, effective,
      palette, setPalette, resetPalette, adoptAccountTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
