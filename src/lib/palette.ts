// ============================================================
//  Colour theme, v2 "Modernist".
//
//  A theme is THREE colours: ink (the text), paper (the ground) and
//  accent. Everything else in the stylesheet is derived from them —
//  the ink ramp, every translucent surface, the accent washes, the
//  background blobs, and the text drawn on top of the accent.
//
//  That is the whole trick. v1 exposed seven independent colours and
//  let you build something unreadable; here you set three and the
//  other forty values are computed so they stay in proportion.
//
//  applyTheme() writes the computed variables onto <html>. The same
//  computed map is cached under THEME_VARS_KEY so index.html can
//  replay it before first paint without duplicating this maths.
// ============================================================

export interface Theme {
  ink?: string;
  paper?: string;
  accent?: string;
  ambient?: boolean;      // the two drifting background blobs
}

export const DEFAULT_THEME: Required<Omit<Theme, 'ambient'>> & { ambient: boolean } = {
  ink: '#201e1d',
  paper: '#f3f2f2',
  accent: '#ec3013',
  ambient: true,
};

export interface Preset { id: string; name: string; ink: string; paper: string; accent: string; }

// Curated triples. Each one is contrast-checked; "Midnight" is deliberately a
// dark ground so the veil logic is exercised by a preset and not only by a
// hand-rolled theme.
export const PRESETS: Preset[] = [
  { id: 'signal',   name: 'Signal',   ink: '#201e1d', paper: '#f3f2f2', accent: '#ec3013' },
  { id: 'oxblood',  name: 'Oxblood',  ink: '#241d1b', paper: '#f4f1ee', accent: '#7c1405' },
  { id: 'clay',     name: 'Clay',     ink: '#2a221e', paper: '#f6f1ed', accent: '#c94b39' },
  { id: 'cobalt',   name: 'Cobalt',   ink: '#1b1f2a', paper: '#f0f2f6', accent: '#1f4fd8' },
  { id: 'pine',     name: 'Pine',     ink: '#1a231d', paper: '#eef2ef', accent: '#1f7a4d' },
  { id: 'plum',     name: 'Plum',     ink: '#241d29', paper: '#f3eff4', accent: '#7a2f8f' },
  { id: 'sand',     name: 'Sand',     ink: '#2b2618', paper: '#f5f1e6', accent: '#a56a1e' },
  { id: 'midnight', name: 'Midnight', ink: '#e8eaf0', paper: '#21232a', accent: '#6ea8ff' },
];

const KEY = 'mahnotes_theme_v2';
export const THEME_VARS_KEY = 'mahnotes_theme_vars';

// ── colour maths ────────────────────────────────────────
type RGB = { r: number; g: number; b: number };

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const hex2 = (c: number) => clamp(c).toString(16).padStart(2, '0');

export function parseHex(hex: string): RGB | null {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toHex = (c: RGB) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
const rgbList = (c: RGB) => `${c.r} ${c.g} ${c.b}`;
const rgba = (c: RGB, a: number) => `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;

// Mix two colours. amt = how much of `b`.
function mix(a: RGB, b: RGB, amt: number): RGB {
  return { r: a.r + (b.r - a.r) * amt, g: a.g + (b.g - a.g) * amt, b: a.b + (b.b - a.b) * amt } as RGB;
}

export function lighten(hex: string, amt = 0.18) {
  const c = parseHex(hex);
  return c ? toHex(mix(c, { r: 255, g: 255, b: 255 }, amt)) : hex;
}
export function darken(hex: string, amt = 0.18) {
  const c = parseHex(hex);
  return c ? toHex(mix(c, { r: 0, g: 0, b: 0 }, amt)) : hex;
}

// WCAG relative luminance, used for both the contrast guard and for deciding
// whether a ground is light or dark.
function luminance(c: RGB) {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

// WCAG contrast ratio, 1 (identical) to 21 (black on white).
export function contrast(a: string, b: string) {
  const ca = parseHex(a); const cb = parseHex(b);
  if (!ca || !cb) return 21;
  const la = luminance(ca); const lb = luminance(cb);
  const hi = Math.max(la, lb); const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

export const isDarkColor = (hex: string) => {
  const c = parseHex(hex);
  return c ? luminance(c) < 0.4 : false;
};

// Readable text to draw ON a solid colour.
export const onColor = (hex: string) => (isDarkColor(hex) ? '#f8f4f4' : '#171615');

// ── theme → CSS variables ───────────────────────────────
// `mode` is the effective light/dark setting. A theme whose ground already
// matches the mode is used as-is; a LIGHT theme viewed in dark mode swaps ink
// and paper, which is what people mean by "dark mode" for their own colours.
// A theme the user deliberately built dark (Midnight) is never flipped back to
// light just because the OS says light.
export function computeVars(theme: Theme, mode: 'light' | 'dark' = 'light'): Record<string, string> {
  let ink = theme.ink || DEFAULT_THEME.ink;
  let paper = theme.paper || DEFAULT_THEME.paper;
  let accent = theme.accent || DEFAULT_THEME.accent;
  const ambient = theme.ambient !== false;

  if (mode === 'dark' && !isDarkColor(paper)) {
    const t = ink; ink = paper; paper = t;
  }
  // On a dark ground a deep accent can disappear. Lift it until it separates.
  if (isDarkColor(paper)) {
    let guard = 0;
    while (contrast(accent, paper) < 4.5 && guard < 12) { accent = lighten(accent, 0.12); guard += 1; }
  }

  const inkRGB = parseHex(ink) || parseHex(DEFAULT_THEME.ink)!;
  const paperRGB = parseHex(paper) || parseHex(DEFAULT_THEME.paper)!;
  const accentRGB = parseHex(accent) || parseHex(DEFAULT_THEME.accent)!;
  const darkGround = isDarkColor(paper);

  const white = { r: 255, g: 255, b: 255 } as RGB;
  // Panels and sheets are the ground, nudged toward the ink's opposite so they
  // read as raised without becoming a different colour.
  const lift = (amt: number) => mix(paperRGB, white, amt);
  const panelRGB = lift(darkGround ? 0.05 : 0.55);
  const sheetRGB = lift(darkGround ? 0.06 : 0.75);

  const vars: Record<string, string> = {
    '--ink-rgb': rgbList(inkRGB),
    '--paper': paper,
    '--paper-2': darkGround ? lighten(paper, 0.05) : lighten(paper, 0.45),

    '--accent': accent,
    '--accent-100': darkGround ? darken(accent, 0.78) : lighten(accent, 0.92),
    '--accent-300': darkGround ? darken(accent, 0.5) : lighten(accent, 0.62),
    '--accent-600': darkGround ? lighten(accent, 0.12) : darken(accent, 0.1),
    '--accent-700': darkGround ? lighten(accent, 0.3) : darken(accent, 0.26),
    '--on-accent': onColor(accent),

    // A light ground takes strong white veils; a dark one takes faint ones,
    // otherwise every card turns into a grey slab.
    '--veil-1': rgba(white, darkGround ? 0.05 : 0.5),
    '--veil-2': rgba(white, darkGround ? 0.07 : 0.6),
    '--veil-3': rgba(white, darkGround ? 0.09 : 0.72),
    '--panel': rgba(panelRGB, 0.62),
    '--panel-2': rgba(panelRGB, darkGround ? 0.78 : 0.72),
    '--sheet': rgba(sheetRGB, 0.96),

    '--tint': darkGround ? rgba(accentRGB, 0.09) : rgba(parseHex(lighten(accent, 0.9))!, 0.7),
    '--tint-2': darkGround ? rgba(accentRGB, 0.13) : rgba(parseHex(lighten(accent, 0.9))!, 0.85),

    '--amb-1': ambient ? rgba(accentRGB, darkGround ? 0.13 : 0.2) : 'transparent',
    '--amb-2': ambient
      ? rgba(parseHex(darken(accent, 0.25))!, darkGround ? 0.1 : 0.16)
      : 'transparent',

    '--sheet-grad': `linear-gradient(168deg, ${lighten(paper, darkGround ? 0.05 : 0.5)}, ${paper} 46%, ${
      darkGround ? lighten(paper, 0.03) : mixHex(paper, accent, 0.06)
    })`,

    '--shadow': `0 3px 10px rgba(0, 0, 0, ${darkGround ? 0.5 : 0.16})`,
    '--shadow-lg': `0 12px 32px rgba(0, 0, 0, ${darkGround ? 0.6 : 0.22})`,
  };
  return vars;
}

function mixHex(a: string, b: string, amt: number) {
  const ca = parseHex(a); const cb = parseHex(b);
  return ca && cb ? toHex(mix(ca, cb, amt)) : a;
}

// Every variable this module ever sets — cleared before re-applying so a
// switch back to the built-in theme doesn't leave stale overrides behind.
const ALL_VARS = Object.keys(computeVars(DEFAULT_THEME));

export function applyTheme(theme: Theme | null, mode: 'light' | 'dark' = 'light') {
  const el = document.documentElement;
  ALL_VARS.forEach((v) => el.style.removeProperty(v));
  if (!theme) {
    // No custom theme: the stylesheet's own light and dark blocks take over.
    try { localStorage.removeItem(THEME_VARS_KEY); } catch { /* ignore */ }
    delete el.dataset.motion;
    return;
  }
  const vars = computeVars(theme, mode);
  Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
  if (theme.ambient === false) el.dataset.motion = 'off';
  else delete el.dataset.motion;
  // Both variants are cached so index.html can paint the right one before
  // React boots, whichever mode the device resolves to.
  try {
    localStorage.setItem(THEME_VARS_KEY, JSON.stringify({
      light: computeVars(theme, 'light'),
      dark: computeVars(theme, 'dark'),
    }));
  } catch { /* ignore */ }
}

// Apply a theme WITHOUT persisting anything — used to render a shared page in
// its author's colours. The reader's own theme is untouched on disk, so
// restoreOwnTheme() puts everything back when they navigate away.
export function previewTheme(theme: Theme, mode: 'light' | 'dark' = 'light') {
  const el = document.documentElement;
  ALL_VARS.forEach((v) => el.style.removeProperty(v));
  const vars = computeVars(theme, mode);
  Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
  if (theme.ambient === false) el.dataset.motion = 'off';
  else delete el.dataset.motion;
}

// Put the reader's own theme back after a preview.
export function restoreOwnTheme(mode: 'light' | 'dark' = 'light') {
  applyTheme(loadTheme(), mode);
}

// The light/dark mode currently in force, read off <html>.
export function currentMode(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function loadTheme(): Theme | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function saveTheme(t: Theme | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch { /* storage may be unavailable */ }
}

// The effective theme, with defaults filled in.
export function resolveTheme(t: Theme | null): Required<Theme> {
  return {
    ink: t?.ink || DEFAULT_THEME.ink,
    paper: t?.paper || DEFAULT_THEME.paper,
    accent: t?.accent || DEFAULT_THEME.accent,
    ambient: t?.ambient !== false,
  };
}

// Which preset (if any) the current theme matches — for highlighting.
export function activePresetId(t: Theme | null) {
  const r = resolveTheme(t);
  const hit = PRESETS.find((p) =>
    p.ink.toLowerCase() === r.ink.toLowerCase()
    && p.paper.toLowerCase() === r.paper.toLowerCase()
    && p.accent.toLowerCase() === r.accent.toLowerCase());
  return hit ? hit.id : 'custom';
}

// ── Back-compat aliases ─────────────────────────────────
// ThemeContext still speaks the v1 vocabulary; keeping these means the context
// did not have to be rewritten alongside the model.
export const loadPalette = loadTheme;
export const savePalette = saveTheme;
export const applyPalette = applyTheme;
