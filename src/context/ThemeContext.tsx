// ============================================================
//  Theme: one customizable colour theme, and nothing else.
//
//  There is no light/dark/system switch any more. The colours ARE the
//  choice: pick a light paper and you have a light theme, pick a dark one
//  (the Midnight preset, or your own) and you have a dark theme. A separate
//  mode switch on top of that only created a second, conflicting answer —
//  a light theme had to be INVERTED to satisfy "dark mode", which is not
//  what someone who picked those colours asked for.
//
//  `data-theme` still gets set, because the stylesheet and the native
//  controls need to know which ground they are on. It is now derived from
//  the paper colour rather than chosen separately.
//
//  The colour theme also lives on the ACCOUNT, for two reasons: it
//  follows the user between devices, and whoever opens one of their
//  share links sees the page in the author's colours (see Viewer).
//  ThemeProvider wraps AuthProvider, so auth pushes the account's
//  theme down here via adoptAccountTheme rather than the reverse.
// ============================================================
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { loadPalette, savePalette, applyPalette, isDarkColor, DEFAULT_THEME } from '../lib/palette';
import { api, getToken } from '../lib/api';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const apply = (effective) => { document.documentElement.dataset.theme = effective; };

// Which ground are we on? Derived from the paper colour, falling back to the
// default theme when the user has never picked one.
const groundOf = (palette) =>
  (isDarkColor(palette?.paper || DEFAULT_THEME.paper) ? 'dark' : 'light');

export function ThemeProvider({ children }) {
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

  // Persist + apply the custom theme whenever it changes.
  //
  // The mode handed to applyPalette is derived from this very palette, so
  // computeVars never swaps ink and paper: the colours are used exactly as the
  // user built them.
  const effective = groundOf(palette);
  const setPalette = useCallback((next, { push = true } = {}) => {
    const value = next && Object.keys(next).length ? next : null;
    setPaletteState(value);
    savePalette(value);
    const ground = groundOf(value);
    apply(ground);
    applyPalette(value, ground);
    if (push) pushToAccount(value);
  }, [pushToAccount]);

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

  // Apply on mount, which covers an old cached shell whose pre-paint script
  // did not run.
  useEffect(() => { apply(effective); applyPalette(palette, effective); }, [palette, effective]);

  return (
    <ThemeContext.Provider value={{
      effective,
      palette, setPalette, resetPalette, adoptAccountTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
