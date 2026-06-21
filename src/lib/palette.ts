// ============================================================
//  Color-theme customization. Lets the user recolor the app by
//  overriding the CSS palette variables (primary/accent + their
//  gradient ends, and optionally the surface/text colors).
//
//  We store only the keys the user actually overrode (a sparse
//  object) and apply them as inline CSS variables on <html>, which
//  win over both the light defaults and the dark-mode overrides.
//  Brand colors (primary/accent) read well on either background;
//  surface colors (light/dark/muted) are "advanced" and only set
//  when the user explicitly customizes them.
// ============================================================

export type PaletteKey =
  | 'primary' | 'primaryEnd' | 'accent' | 'accentEnd'
  | 'light' | 'dark' | 'muted';

export type Palette = Partial<Record<PaletteKey, string>>;

// Map each palette key to the CSS custom property it drives.
export const CSS_VAR: Record<PaletteKey, string> = {
  primary: '--primary',
  primaryEnd: '--primary-end',
  accent: '--accent',
  accentEnd: '--accent-end',
  light: '--light',
  dark: '--dark',
  muted: '--muted',
};

// The built-in light defaults (mirrors :root in app.css) — used as the base the
// color pickers start from and as the "Default" preset target.
export const DEFAULT_PALETTE: Record<PaletteKey, string> = {
  primary: '#7C83FD',
  primaryEnd: '#9A8CFF',
  accent: '#2FD3B6',
  accentEnd: '#5DE0C8',
  light: '#EEEDFF',
  dark: '#2E2A47',
  muted: '#6B6790',
};

// Curated presets. Each only sets the brand colors (primary/accent + ends) so it
// looks good in both light and dark mode. "Default" clears all overrides.
export interface Preset {
  id: string;
  name: string;
  icon: string; // font-awesome class
  colors: Palette | null; // null = reset to built-in defaults
}

export const PRESETS: Preset[] = [
  { id: 'default', name: 'Lavender', icon: 'fa-feather-pointed', colors: null },
  { id: 'coffee', name: 'Coffee', icon: 'fa-mug-hot',
    colors: { primary: '#6F4E37', primaryEnd: '#9C6B4F', accent: '#C68B59', accentEnd: '#E0A96D' } },
  { id: 'ocean', name: 'Ocean', icon: 'fa-water',
    colors: { primary: '#2E7DD1', primaryEnd: '#4AA0E8', accent: '#14B8C4', accentEnd: '#4FD8E0' } },
  { id: 'forest', name: 'Forest', icon: 'fa-tree',
    colors: { primary: '#2E8B57', primaryEnd: '#43A86B', accent: '#88B04B', accentEnd: '#A7C957' } },
  { id: 'rose', name: 'Rose', icon: 'fa-heart',
    colors: { primary: '#E14B7B', primaryEnd: '#F06A98', accent: '#FF8FA3', accentEnd: '#FFB3C1' } },
  { id: 'sunset', name: 'Sunset', icon: 'fa-sun',
    colors: { primary: '#F4683C', primaryEnd: '#FF8A5B', accent: '#FF5E7E', accentEnd: '#FF9BAE' } },
  { id: 'grape', name: 'Grape', icon: 'fa-wine-glass',
    colors: { primary: '#9B4DCA', primaryEnd: '#B36AE0', accent: '#E15FA0', accentEnd: '#F58BC0' } },
  { id: 'slate', name: 'Slate', icon: 'fa-mountain',
    colors: { primary: '#4B5563', primaryEnd: '#6B7280', accent: '#8B95A5', accentEnd: '#AEB6C2' } },
];

const KEY = 'mahnotes_palette';

export function loadPalette(): Palette | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function savePalette(p: Palette | null) {
  try {
    if (p && Object.keys(p).length) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch { /* storage may be unavailable */ }
}

// Apply a palette by setting (or clearing) the inline CSS variables on <html>.
// Keys not present are removed so they fall back to the stylesheet (and dark mode).
export function applyPalette(p: Palette | null) {
  const el = document.documentElement;
  (Object.keys(CSS_VAR) as PaletteKey[]).forEach((k) => {
    const val = p && p[k];
    if (val) el.style.setProperty(CSS_VAR[k], val);
    else el.style.removeProperty(CSS_VAR[k]);
  });
}

// The current value for a key: the override if set, else the built-in default.
export function colorOf(p: Palette | null, key: PaletteKey) {
  return (p && p[key]) || DEFAULT_PALETTE[key];
}

// Which preset (if any) matches the current palette — for highlighting.
export function activePresetId(p: Palette | null) {
  if (!p || !Object.keys(p).length) return 'default';
  const match = PRESETS.find((preset) => {
    if (!preset.colors) return false;
    return (Object.keys(preset.colors) as PaletteKey[]).every((k) => p[k] === preset.colors![k])
      && Object.keys(p).length === Object.keys(preset.colors).length;
  });
  return match ? match.id : 'custom';
}

// Mix a hex color toward white by `amt` (0..1) — used to derive a pleasant
// gradient end when the user turns a solid color into a gradient.
export function lighten(hex: string, amt = 0.18) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  const h = (c: number) => c.toString(16).padStart(2, '0');
  return `#${h(mix(r))}${h(mix(g))}${h(mix(b))}`;
}
