// ============================================================
//  Theme: light / dark / system + a customizable color palette.
//  Reflects the *effective* light/dark theme onto <html data-theme>
//  and applies any custom palette as inline CSS variables. Inline
//  scripts in index.html apply both before first paint (no flash);
//  this keeps them in sync afterwards.
// ============================================================
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { loadPalette, savePalette, applyPalette } from '../lib/palette';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const KEY = 'mahnotes_theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

const resolve = (pref) => (pref === 'system' ? (media.matches ? 'dark' : 'light') : pref);
const apply = (effective) => { document.documentElement.dataset.theme = effective; };

export function ThemeProvider({ children }) {
  const [pref, setPref] = useState(() => localStorage.getItem(KEY) || 'system');
  const [palette, setPaletteState] = useState(() => loadPalette());

  useEffect(() => {
    apply(resolve(pref));
    localStorage.setItem(KEY, pref);
    if (pref !== 'system') return;
    const onChange = () => apply(resolve('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [pref]);

  // Persist + apply the custom palette whenever it changes.
  const setPalette = useCallback((next) => {
    const value = next && Object.keys(next).length ? next : null;
    setPaletteState(value);
    savePalette(value);
    applyPalette(value);
  }, []);

  const resetPalette = useCallback(() => setPalette(null), [setPalette]);

  // Ensure the palette is applied on mount (covers the case where the index.html
  // pre-paint script didn't run, e.g. an old cached shell).
  useEffect(() => { applyPalette(palette); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ThemeContext.Provider value={{
      pref, setTheme: setPref, effective: resolve(pref),
      palette, setPalette, resetPalette,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
