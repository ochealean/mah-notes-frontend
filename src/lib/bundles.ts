// ============================================================
//  Cosmetic bundles — the catalogue, and the machinery that equips one.
//
//  A bundle is THREE cosmetic layers plus a set of interaction flourishes:
//    · avatar decoration   — the ring around a profile picture
//    · background          — ambient motion behind identity surfaces
//    · share card (v-card) — the page a recipient of a link sees
//
//  The trick that keeps this cheap: a bundle sets CSS custom properties and
//  NOTHING else. No component ever names a bundle, and no bundle ever
//  overrides a component's rule — so adding the twentieth bundle is one
//  entry here plus one [data-bundle="…"] block in styles/bundles.css.
//
//  Bundles are an ACCENT LAYER on top of the colour theme, never a
//  replacement for it. The app's own ink/paper/accent tokens still own every
//  surface and all text colour (see lib/palette.ts); the chrome stays
//  whatever theme the user built. That is why the attribute is scoped to the
//  handful of cosmetic surfaces rather than to <html>: a shared page can
//  render the SENDER's bundle while the reader keeps their own app.
//
//  Everything here is free. No scarcity, no tiers, no locked previews.
// ============================================================

export type BundleTier = 'ring' | 'simple' | 'full';

export type Bundle = {
  /** Stable, stored, written into share links — never renamed. */
  id: string;
  name: string;
  /** One line of description, under 60 chars. Not a pitch. */
  tagline: string;
  /** Internal note on where the idea comes from. */
  concept: string;
  /** Custom properties the surface sets. Components read these. */
  tokens: Record<string, string>;
  avatar: { variant: string; poster: string };
  background: { variant: string; poster: string; intensity: 'low' | 'medium' };
  card: { entrance: string; idle?: string; poster: string };
  platforms: {
    web: 'full' | 'reduced' | 'static';
    mobile: 'full' | 'reduced' | 'static';
    desktop: 'full' | 'reduced' | 'static';
  };
  unlock: { type: 'default' } | { type: 'milestone'; id: string };
};

// ── The catalogue ───────────────────────────────────────
//
// Nocturne is the app with no cosmetic layer on it: its tokens point straight
// at the theme's own accent, so equipping it is genuinely "off" rather than a
// second look to maintain. It is the fallback for an unknown id, which is what
// keeps a share link working after a bundle is ever withdrawn.
const NOCTURNE: Bundle = {
  id: 'nocturne',
  name: 'Nocturne',
  tagline: 'The app in your own colours, undecorated.',
  concept: 'The absence of a bundle, named so it can be chosen on purpose.',
  tokens: {
    '--bundle-accent': 'var(--accent)',
    '--bundle-accent-soft': 'var(--accent-600)',
    '--bundle-glow': 'transparent',
    '--bundle-surface-tint': 'transparent',
    '--bundle-ring-width': '0px',
    '--bundle-motion-scale': '1',
  },
  avatar: { variant: 'none', poster: 'none' },
  background: { variant: 'none', poster: 'none', intensity: 'low' },
  card: { entrance: 'fade', poster: 'flat' },
  platforms: { web: 'full', mobile: 'full', desktop: 'full' },
  unlock: { type: 'default' },
};

// Galaxy. The concept has to come from the app's own world or it is decoration
// without an idea — "space looks nice" would belong to any app on earth.
//
// This one is about CAPTURE. Mah Notes exists to catch fragments before they
// are lost: a highlighted line on a phone, a clipboard entry on a desktop. So
// the galaxy is not scenery — it is what the app does, drawn as gravity. Every
// fragment you catch enters orbit and stays caught. The dust ring is the
// accumulated mass of everything you have ever saved. The small solar system
// drifting behind the rim is your devices: several bodies, one sun, one shared
// centre — which is the clipboard sync feature with the wires taken out.
const GALAXY: Bundle = {
  id: 'galaxy',
  name: 'Galaxy',
  tagline: 'Everything you catch stays in orbit.',
  concept:
    'Capture as gravity: fragments become small bodies your account holds in '
    + 'orbit, and the solar system behind the rim is your devices sharing one centre.',
  tokens: {
    // Violet-indigo core accent, cyan secondary, amber sun. Deliberately NOT
    // the app's own red: a bundle is allowed its own palette, and Galaxy
    // reading as a separate object is the point of equipping one.
    '--bundle-accent': '#7b5cff',
    '--bundle-accent-soft': '#b9a6ff',
    '--bundle-glow': 'rgba(123, 92, 255, .42)',
    '--bundle-spark': '#46d8ff',
    '--bundle-ember': '#ffb347',
    '--bundle-core': '#eaf2ff',
    '--bundle-void': '#0b0a16',
    '--bundle-dust': 'rgba(207, 228, 255, .55)',
    '--bundle-surface-tint': 'rgba(123, 92, 255, .07)',
    '--bundle-ring-width': '2px',
    '--bundle-motion-scale': '1',
  },
  avatar: { variant: 'orbital-system', poster: 'orbits-parked' },
  // 'low' by default, per the rule that people pick a bundle for how it looks
  // in the collection and then want it calmer all day.
  background: { variant: 'nebula-drift', poster: 'nebula-rich', intensity: 'low' },
  card: { entrance: 'ignition-stagger', idle: 'nebula-drift', poster: 'settled' },
  // Honest, not aspirational. Android is a WebView so CSS animation works, but
  // large blurred layers are the one thing that reliably drops frames there —
  // so the nebula is frozen to its poster frame and the orbit count halves.
  // See PERF_LOW below, which is what actually applies that.
  platforms: { web: 'full', mobile: 'reduced', desktop: 'full' },
  unlock: { type: 'default' },
};

export const BUNDLES: Bundle[] = [NOCTURNE, GALAXY];

export const DEFAULT_BUNDLE_ID = NOCTURNE.id;

/** Unknown or missing ids fall back to the default — links outlive catalogues. */
export function getBundle(id: string | null | undefined): Bundle {
  return BUNDLES.find((b) => b.id === id) || NOCTURNE;
}

export const isDefaultBundle = (id: string | null | undefined) =>
  getBundle(id).id === DEFAULT_BUNDLE_ID;

// ── Avatar decoration tiers ─────────────────────────────
//
// Detail below ~40px is invisible and costs exactly the same to compute, so
// every decoration collapses to a plain accent ring down there. This is also
// the reason a 60-row friends list does not animate 300 elements: those rows
// resolve to 'ring' and 'simple', which run one animation or none.
//
//   ring    ≤28px  author chips, mentions          — static ring, no motion
//   simple  ≤56px  lists, collaborators, nav, the  — ring + one orbiting body
//                  settings identity row
//   full    >56px  profile hero, share card        — the whole system
export function tierFor(size: number): BundleTier {
  if (size <= 28) return 'ring';
  if (size <= 56) return 'simple';
  return 'full';
}

// ── Equip + persistence ─────────────────────────────────
//
// The equipped id is cosmetic metadata, not note content, so it needs no
// encryption — but it also has nowhere to live on the account: the server's
// user.theme is a closed sub-schema of {ink, paper, accent, ambient} and this
// is a frontend-only change. So the id lives on the device, and travels to a
// recipient in the share URL instead (see bundleLinkParams). If a bundleId
// field is ever added to the account, adopt it here and nothing else changes.
const KEY = 'mahnotes_bundle';
const INTENSITY_KEY = 'mahnotes_bundle_intensity';

export type Intensity = 'full' | 'subtle' | 'off';

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function loadBundleId(): string {
  try { return getBundle(localStorage.getItem(KEY)).id; } catch { return DEFAULT_BUNDLE_ID; }
}

export function saveBundleId(id: string) {
  const next = getBundle(id).id;
  try {
    if (next === DEFAULT_BUNDLE_ID) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch { /* storage may be unavailable — the session still applies it */ }
  current = next;
  emit();
}

export function loadIntensity(): Intensity {
  try {
    const v = localStorage.getItem(INTENSITY_KEY);
    return v === 'full' || v === 'off' ? v : 'subtle';
  } catch { return 'subtle'; }
}

export function saveIntensity(v: Intensity) {
  try { localStorage.setItem(INTENSITY_KEY, v); } catch { /* ignore */ }
  currentIntensity = v;
  emit();
}

let current = DEFAULT_BUNDLE_ID;
let currentIntensity: Intensity = 'subtle';
try { current = loadBundleId(); currentIntensity = loadIntensity(); } catch { /* SSR-safe */ }

export const equippedId = () => current;
export const equippedIntensity = () => currentIntensity;

export function subscribeBundle(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ── Share links ─────────────────────────────────────────
//
// A recipient has to render the SENDER's bundle, and the public share endpoint
// knows nothing about bundles, so the link carries it.
//
//   b — the bundle id
//   h — the sender's handle, for the card's "@name" line
//
// The handle is only ever attached when the author has share-identity ON. That
// switch already governs whether their name appears on a shared page at all
// (Settings → Privacy), so a link built while it is off must not smuggle the
// handle out in a query string instead.
export function bundleLinkParams(opts: { username?: string; shareIdentity?: boolean }): string {
  const parts: string[] = [];
  if (current !== DEFAULT_BUNDLE_ID) parts.push(`b=${encodeURIComponent(current)}`);
  const handle = String(opts.username || '').trim();
  if (handle && opts.shareIdentity !== false) parts.push(`h=${encodeURIComponent(handle)}`);
  return parts.length ? `&${parts.join('&')}` : '';
}

/** A handle from a URL, reduced to the characters the server allows. */
export function safeHandle(v: string | null | undefined): string {
  const s = String(v || '').trim().toLowerCase();
  return /^[a-z0-9_.]{3,20}$/.test(s) ? s : '';
}

// ── Motion ──────────────────────────────────────────────
//
// One switch drives the whole catalogue: every duration and amplitude in
// bundles.css multiplies by --bundle-motion-scale, so reduced motion is a
// single declaration rather than a fallback written out per bundle.
//
// Pausing matters more than it looks. A notes app sits open behind other
// windows all day — on the desktop build especially — and an idle animation
// burning battery in a background window is how a fun feature becomes the
// reason someone uninstalls.
let motionInstalled = false;

export function installBundleMotion() {
  if (motionInstalled || typeof document === 'undefined') return;
  motionInstalled = true;
  const root = document.documentElement;

  const setPaused = (paused: boolean) => root.classList.toggle('motion-paused', paused);
  document.addEventListener('visibilitychange', () => setPaused(document.hidden));
  window.addEventListener('blur', () => setPaused(true));
  window.addEventListener('focus', () => setPaused(false));
  if (document.hidden) setPaused(true);

  // Android's WebView paints large blurred layers far more slowly than it
  // composites transforms, so the nebula freezes to its poster frame there and
  // the orbit count halves. Declared as an attribute rather than a media query
  // because it is a platform fact, not a screen size.
  // Read from the user agent rather than lib/platform on purpose: this has
  // to be true for the Android WEBVIEW and for Android Chrome alike — a
  // shared link opened on a phone gets the same treatment as the APK — and
  // lib/platform's `android` means the packaged app specifically.
  try {
    if (/Android/i.test(navigator.userAgent || '')) root.dataset.bundlePerf = 'low';
  } catch { /* ignore */ }
}

/**
 * Is the viewer asking for less motion? Bundles still render — they fall back
 * to their poster frame, which is designed first and on purpose, because a
 * bundle whose reduced-motion state is an empty circle has failed the people
 * who need reduced motion most.
 */
export function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}
