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
//
//  A BUNDLE can bring its own appearance (Galaxy is deep space). While one
//  is equipped — or being tried on in Settings → Bundles — the app wears the
//  bundle's colours; `palette` stays YOUR theme, untouched on disk and on the
//  account, and comes straight back when the bundle comes off.
// ============================================================
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { loadPalette, savePalette, applyPalette, previewTheme, applyThemeMotion, isDarkColor, DEFAULT_THEME } from '../lib/palette';
import { api, getToken } from '../lib/api';
import { useBundle, getBundle } from '../lib/bundles';

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

  // The bundle in force: the equipped one, or one being tried on.
  const b = useBundle();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const shownBundle = getBundle(previewId || b.id);
  // A shared page open right now wears its SENDER's look (see Viewer). It is
  // set here rather than painted by the page itself: this provider repaints
  // whenever what it holds changes — and its effects run after the page's —
  // so anything painted behind its back was painted straight over.
  const [pageTheme, setPageTheme] = useState<any>(null);
  // The colours actually on screen. `palette` is only ever YOURS.
  const applied = pageTheme || shownBundle.theme || palette;
  const effective = groundOf(applied);

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

  // Save YOUR theme. What is painted follows from `applied` below, so a
  // bundle with its own appearance keeps its colours on screen meanwhile.
  const setPalette = useCallback((next, { push = true } = {}) => {
    const value = next && Object.keys(next).length ? next : null;
    setPaletteState(value);
    savePalette(value);
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

  // Paint whatever is in force. The mode handed to applyPalette comes from
  // the same colours, so ink and paper are never swapped: they are used
  // exactly as the user (or the bundle) built them. applyPalette also caches
  // the result for the pre-paint script, so the next launch opens in it —
  // except a shared page's colours, which are someone else's and are painted
  // without being cached.
  useEffect(() => {
    apply(effective);
    if (pageTheme) previewTheme(pageTheme, effective);
    else applyPalette(applied, effective);
    // A bundle theme's own motion travels with it: equipped, tried on in
    // Settings → Bundles, or worn by a shared link. Your own theme has none.
    applyThemeMotion((applied as any)?.motion);
  }, [applied, effective, pageTheme]);

  return (
    <ThemeContext.Provider value={{
      effective,
      palette, setPalette, resetPalette, adoptAccountTheme,
      // The colours on screen right now, whoever chose them.
      applied: applied || null,
      // True while a bundle, not you, is deciding the colours.
      bundleTheme: !!shownBundle.theme,
      // Settings → Bundles: wear a bundle's appearance while trying it on.
      setBundlePreview: setPreviewId,
      // A shared page: wear the sender's look while it is open, null after.
      setPageTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
