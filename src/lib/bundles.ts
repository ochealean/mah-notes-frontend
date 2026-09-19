// ============================================================
//  Cosmetic bundles — the catalogue, and the state of the equipped one.
//
//  A bundle is a whole look: its own appearance (ink, paper, accent) AND its
//  decoration, because the two only work together — Galaxy's stars vanish
//  on a light paper. While a bundle with an appearance is equipped, the app
//  wears it and the theme editor is locked; your own theme is kept and comes
//  back the moment you equip Default. A bundle adds —
//
//    · its appearance (the app's colours)
//    · the sky behind the rail
//    · the decoration around an avatar
//    · the card a recipient sees when they open a shared link
//    · the intro, the click effect, the caret, and the farewells
//
//  Everything here is free for a limited time — bundles are planned to cost
//  Ads Amount Coins later, so nothing may promise "free forever".
//
//  The equipped id lives on the device AND on the account: the account copy
//  follows you between devices and is what your friends see in their friends
//  list. A share link still carries it in the URL (bundleLinkParams), so a
//  stranger's page never needs to look the sender up.
// ============================================================
import { useSyncExternalStore } from 'react';
import { api, getToken } from './api';
import type { ThemeMotion } from './palette';

export type BundleMotion = 'full' | 'subtle' | 'off';
type Support = 'full' | 'reduced' | 'static';

export type Bundle = {
  /** Stable, stored, written into share links — never renamed. */
  id: string;
  name: string;
  /** One line of description, under 60 chars. Not a pitch. */
  tagline: string;
  /** Internal note on where the idea comes from. */
  concept: string;
  /** The bundle's partner theme, worn by the whole app while it is
      equipped. Every bundle but Default has one — colours made for the
      bundle, and a `motion` of their own — and while it is equipped the
      Appearance editor is locked. null (Default only) means "your own
      colours". */
  theme: { ink: string; paper: string; accent: string; ambient: boolean; motion: ThemeMotion } | null;
  /** Which cosmetic layers the bundle actually has. */
  sky: boolean;
  decoration: boolean;
  intro: boolean;
  clickEffect: boolean;
  /** A custom caret and typing/deleting effects in the editor. */
  typing: boolean;
  /** Dust on deleting a document, a warp on signing out. */
  farewells: boolean;
  /** Honest, not aspirational: what each platform really gets. */
  platforms: { web: Support; android: Support; desktop: Support };
  /** The platform line under the tile, in plain words. */
  caveat: string;
  /** How the avatar decoration degrades with size, for Settings → Bundles. */
  decorationHint: string;
};

// The app with no cosmetic layer on it, named so it can be chosen on purpose.
// It is also the fallback for an unknown id, which is what keeps a share link
// working after a bundle is ever withdrawn — links outlive catalogues.
const DEFAULT_BUNDLE: Bundle = {
  id: 'default',
  name: 'Default',
  tagline: 'The app in your own colours, undecorated.',
  concept: 'The absence of a bundle.',
  theme: null,
  sky: false,
  decoration: false,
  intro: false,
  clickEffect: false,
  typing: false,
  farewells: false,
  platforms: { web: 'static', android: 'static', desktop: 'static' },
  caveat: 'No motion anywhere',
  decorationHint: '',
};

// Galaxy. Mah Notes exists to catch fragments before they are lost, so the
// galaxy is capture drawn as gravity: every fragment you catch enters orbit
// and stays caught, the dust ring is the mass of everything you have ever
// saved, and the small solar system behind the rim is your devices sharing
// one centre — the clipboard sync with the wires taken out.
const GALAXY: Bundle = {
  id: 'galaxy',
  name: 'Galaxy',
  tagline: 'Everything you catch stays in orbit.',
  concept: 'Capture as gravity; your devices as one solar system.',
  // Deep space, starlight ink and the galaxy's violet. A dark paper is not a
  // preference here, it is the premise: the sky is drawn in light, and light
  // only reads against the dark. The violet clears 4.5:1 on this paper.
  // Its motion: the galaxy's violet, its cyan and its H-alpha red drifting
  // across the ground behind the app, one slow orbit every ~40 seconds.
  theme: {
    ink: '#e9e6f4', paper: '#161421', accent: '#9a82ff', ambient: true,
    motion: { kind: 'drift', colors: ['#7b5cff', '#46d8ff', '#ff2748'], period: 38 },
  },
  sky: true,
  decoration: true,
  intro: true,
  clickEffect: true,
  typing: true,
  farewells: true,
  // Android's WebView composites transforms well and paints large blurred
  // layers badly, so the big nebula layers freeze to their poster frame there.
  platforms: { web: 'full', android: 'reduced', desktop: 'full' },
  caveat: 'Full on web and Windows · reduced on Android',
  decorationHint: 'It degrades by size on its own: a plain ring on small chips, one orbiting body in lists, the whole system on your profile and your share card. The middle of your face always stays clear.',
};

// Cyberpunk. Nothing you catch ever goes dark: a city that never sleeps is
// a clipboard that never loses anything — every lit window is something kept.
const CYBERPUNK: Bundle = {
  id: 'cyberpunk',
  name: 'Cyberpunk',
  tagline: 'Nothing you catch ever goes dark.',
  concept: 'A city that never sleeps; every lit window is something you kept.',
  // Night City: pale cyan ink on night-city navy, with the neon cyan as the
  // accent. Its motion: cyan, magenta and violet drifting across the ground,
  // a little quicker than Galaxy's — a city breathes faster than a galaxy.
  theme: {
    ink: '#e6f4ff', paper: '#0b0c1a', accent: '#00e5ff', ambient: true,
    motion: { kind: 'drift', colors: ['#00e5ff', '#ff2d95', '#7b2fff'], period: 34 },
  },
  sky: true,
  decoration: true,
  intro: true,
  clickEffect: true,
  typing: true,
  farewells: true,
  platforms: { web: 'full', android: 'reduced', desktop: 'full' },
  caveat: 'Full on web and Windows · reduced on Android',
  decorationHint: 'It degrades by size on its own: a plain cyan ring on small chips, the equalizer and lock-on brackets in lists, and the full HUD — pings, arcs and a scan across your face — on your profile and your share card. Nothing on it rotates, and the middle of your face always stays clear.',
};

export const BUNDLES: Bundle[] = [DEFAULT_BUNDLE, GALAXY, CYBERPUNK];
export const DEFAULT_BUNDLE_ID = DEFAULT_BUNDLE.id;

// The house rule, checked where a new bundle is added: every bundle but
// Default brings a partner theme, and that theme moves. A bundle without
// one would leave the user's own colours under its decoration (Galaxy's
// stars vanish on a light paper) and the Appearance lock with nothing to
// lock to, so it fails loudly here rather than quietly in the app.
BUNDLES.forEach((b) => {
  if (b.id !== DEFAULT_BUNDLE.id && !b.theme?.motion) {
    console.error(`Bundle "${b.id}" has no partner theme with motion — every bundle but Default needs one.`);
  }
});

/** Unknown or missing ids fall back to the default. */
export function getBundle(id: string | null | undefined): Bundle {
  return BUNDLES.find((b) => b.id === id) || DEFAULT_BUNDLE;
}

// ── State ───────────────────────────────────────────────
const KEY = 'mahnotes_bundle';
const MOTION_KEY = 'mahnotes_bundle_motion';

function readId(): string {
  try { return getBundle(localStorage.getItem(KEY)).id; } catch { return DEFAULT_BUNDLE_ID; }
}
function readMotion(): BundleMotion {
  // Subtle by default: people pick a bundle for how it looks in the
  // collection, then want it calmer all day.
  try {
    const v = localStorage.getItem(MOTION_KEY);
    return v === 'full' || v === 'off' ? v : 'subtle';
  } catch { return 'subtle'; }
}
function readReduced(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export type BundleState = {
  id: string;
  bundle: Bundle;
  /** What the user picked. */
  motion: BundleMotion;
  /** What actually runs: the system's reduced-motion setting forces 'off'. */
  effectiveMotion: BundleMotion;
  reduced: boolean;
};

function build(id: string, motion: BundleMotion, reduced: boolean): BundleState {
  return { id, bundle: getBundle(id), motion, effectiveMotion: reduced ? 'off' : motion, reduced };
}

let state: BundleState = build(DEFAULT_BUNDLE_ID, 'subtle', false);
try { state = build(readId(), readMotion(), readReduced()); } catch { /* non-browser */ }

const listeners = new Set<() => void>();
function commit(next: BundleState) {
  state = next;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.bundle = next.id;
    document.documentElement.dataset.bundleMotion = next.effectiveMotion;
  }
  listeners.forEach((fn) => fn());
}

export const bundleState = () => state;
export const equippedId = () => state.id;

export function subscribeBundle(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The equipped bundle and its motion, re-rendering when either changes. */
export function useBundle(): BundleState {
  return useSyncExternalStore(subscribeBundle, bundleState, bundleState);
}

/** Equip instantly and optimistically — no reload, no confirmation. The
    account copy is updated in the background; if that fails, this device
    keeps what you chose and the next equip tries again. */
export function equipBundle(id: string, { push = true }: { push?: boolean } = {}) {
  const next = getBundle(id).id;
  try {
    if (next === DEFAULT_BUNDLE_ID) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch { /* storage unavailable — the session still applies it */ }
  commit(build(next, state.motion, state.reduced));
  if (push) pushBundle(next);
}

function pushBundle(id: string) {
  if (!getToken()) return;
  api.patch('/api/auth/me', { bundle: id }).catch(() => { /* the local choice stands */ });
}

// The account's bundle, as last seen, so a change made on another device
// (arriving through me:updated) can be told apart from one we already have.
let seen: { id: string | null; value: string | null | undefined } = { id: null, value: undefined };

/**
 * Called whenever the signed-in account changes or refreshes.
 *  · The account has a bundle → wear it (the first time we see this account,
 *    and again whenever it changes, e.g. equipped on your phone).
 *  · The account has never chosen one → push this device's choice up, once,
 *    so friends and your other devices see what you are actually wearing.
 */
export function adoptAccountBundle(user: any) {
  if (!user?.id) { seen = { id: null, value: undefined }; return; }
  const id = String(user.id);
  const value: string | null = user.bundle ?? null;
  const first = seen.id !== id;
  const changed = !first && value !== seen.value;
  seen = { id, value };
  if (value && BUNDLES.some((b) => b.id === value)) {
    if ((first || changed) && value !== state.id) equipBundle(value, { push: false });
    return;
  }
  if (first && state.id !== DEFAULT_BUNDLE_ID) pushBundle(state.id);
}

export function setBundleMotion(m: BundleMotion) {
  try { localStorage.setItem(MOTION_KEY, m); } catch { /* ignore */ }
  commit(build(state.id, m, state.reduced));
}

/** Android's WebView (and Android Chrome) get the reduced sky. */
export function isLowPerf(): boolean {
  try { return /Android/i.test(navigator.userAgent || ''); } catch { return false; }
}

// ── Runtime ─────────────────────────────────────────────
//
// Motion stops when unwatched. A notes app sits open behind other windows all
// day — on the desktop build especially — and an idle animation burning
// battery in a background window is how a fun feature becomes the reason
// someone uninstalls. Only bundle layers are paused; the app's own spinners
// keep running.
let installed = false;
export function installBundleRuntime() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const root = document.documentElement;
  const setPaused = (p: boolean) => root.classList.toggle('bundle-paused', p);
  document.addEventListener('visibilitychange', () => setPaused(document.hidden));
  window.addEventListener('blur', () => setPaused(true));
  window.addEventListener('focus', () => setPaused(false));
  if (document.hidden) setPaused(true);
  if (isLowPerf()) root.dataset.bundlePerf = 'low';

  try {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', (e) => commit(build(state.id, state.motion, e.matches)));
  } catch { /* old engine */ }

  commit(state);
}

// ── Share links ─────────────────────────────────────────
//
// A recipient renders the SENDER's bundle, and the public share endpoint
// does not look the sender's bundle up, so the link carries it as `b`.
//
// The sender's @handle is NOT put in the link. It used to be, which meant a
// link made while "Show my name on shared links" was on kept showing the
// handle after the sender switched it off. The server now sends the handle
// with the author byline, and only while that switch is on.
export function bundleLinkParams(): string {
  return state.id !== DEFAULT_BUNDLE_ID ? `&b=${encodeURIComponent(state.id)}` : '';
}
