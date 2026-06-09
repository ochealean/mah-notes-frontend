// ============================================================
//  Theme: light / dark / system. Persists the preference and
//  reflects the *effective* theme onto <html data-theme="…">.
//  An inline script in index.html applies it before first paint
//  to avoid a flash; this keeps it in sync afterwards.
// ============================================================
import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const KEY = 'mahnotes_theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

const resolve = (pref) => (pref === 'system' ? (media.matches ? 'dark' : 'light') : pref);
const apply = (effective) => { document.documentElement.dataset.theme = effective; };

export function ThemeProvider({ children }) {
  const [pref, setPref] = useState(() => localStorage.getItem(KEY) || 'system');

  useEffect(() => {
    apply(resolve(pref));
    localStorage.setItem(KEY, pref);
    if (pref !== 'system') return;
    const onChange = () => apply(resolve('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [pref]);

  return (
    <ThemeContext.Provider value={{ pref, setTheme: setPref, effective: resolve(pref) }}>
      {children}
    </ThemeContext.Provider>
  );
}
