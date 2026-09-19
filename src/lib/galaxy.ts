// ============================================================
//  Galaxy — the paint for the bundle's three layers.
//
//  Everything here returns an HTML STRING of absolutely-positioned <i>
//  elements, animated purely by CSS keyframes (styles/bundles.css). Nothing
//  is interactive and nothing is user content, so the components mount it
//  with dangerouslySetInnerHTML once and React never touches it again —
//  which is the difference between ~600 decorative nodes costing nothing
//  per render and costing a reconciliation pass every keystroke.
//
//  Generation is deterministic (a seeded LCG), so the sky is laid out the
//  same way on every reload and every device.
//
//  Motion rules, all enforced here:
//    · only transform / opacity / filter animate
//    · 'subtle' slows every cycle ×1.4 and dims decoration ×0.78
//    · 'off' emits NO animation at all and parks moving bodies at a
//      composed poster position — never an empty frame
//    · low-perf (Android) freezes the large blurred layers to their poster
//      frame and roughly halves the counts
// ============================================================
import type { BundleMotion } from './bundles';
import logoUrl from '../images/mn_logo.png';

// ── Palette (independent of the app theme) ──────────────
export const G = {
  accent: '#7b5cff', soft: '#b9a6ff', spark: '#46d8ff', ember: '#ffb347', core: '#eaf2ff',
  void: '#0b0a16', dust: '#dfe4ff', haze: '#8a63e8', rose: '#c766ff', deep: '#0a0618',
  ha: '#ff2748', ruby: '#c2001f', neon: '#d264ff', natal: '#dff0ff',
  glow: 'rgba(123,92,255,.45)',
};

// ── Helpers ─────────────────────────────────────────────
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const rgba = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${+clamp01(a).toFixed(3)})`;
};
export const rnd = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};
const f2 = (n: number) => (+n).toFixed(2);
const escAttr = (s: string) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
/** One decorative paint element. */
const I = (css: string, inner = '', cls = '') => `<i${cls ? ` class="${cls}"` : ''} style="${escAttr(css)}">${inner}</i>`;

type Painter = {
  motion: BundleMotion;
  /** Decorative alpha multiplier. */
  A: number;
  /** An infinite animation, or nothing when motion is off. */
  an: (name: string, dur: number, delay?: number, ease?: string) => string;
  /** A rotation that starts at `start` degrees without a jump when it loops. */
  rot: (name: 'orbit' | 'orbitRev' | 'aurora', dur: number, start: number) => string;
};

export function painter(motion: BundleMotion): Painter {
  const k = motion === 'subtle' ? 1.4 : 1;
  const A = motion === 'subtle' ? 0.78 : motion === 'off' ? 0.9 : 1;
  const an = (name: string, dur: number, delay = 0, ease = 'linear') => (motion === 'off' ? ''
    : `animation:bx-${name} ${f2(dur * k)}s ${ease} ${f2(delay * k)}s infinite both;`);
  const rot = (name: 'orbit' | 'orbitRev' | 'aurora', dur: number, start: number) => {
    const s = ((start % 360) + 360) % 360;
    if (motion === 'off') return `transform:rotate(${f2(start)}deg);`;
    // A static start angle would jump when the loop restarts, so the start
    // angle becomes a negative delay into the cycle instead.
    const p = name === 'orbitRev' ? ((360 - s) % 360) / 360 : s / 360;
    return an(name, dur, -p * dur);
  };
  return { motion, A, an, rot };
}

// ── Fractal masks: what turns ellipses into vapour ──────
const fractalCache = new Map<string, string>();
function fractal(seed: number, bf: string, oct = 4) {
  const key = `${seed}|${bf}|${oct}`;
  const hit = fractalCache.get(key);
  if (hit) return hit;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='340'><filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${bf}' numOctaves='${oct}' seed='${seed}'/><feColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1.1 0 0 0 -0.12'/></filter><rect width='340' height='340' filter='url(#n)'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  fractalCache.set(key, url);
  return url;
}
const GRAIN = (() => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='180' height='180' filter='url(#g)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

// Turbulence ∩ soft radial falloff. The falloff layer always spans the
// element (100% at 0 0) so its soft edge is never cut off by the box.
export function nmask(seed: number, bf: string, oct: number, fx: number, fy: number, ms: string, mp: string) {
  const m = `${fractal(seed, bf, oct)}, radial-gradient(closest-side at ${f2(fx)}% ${f2(fy)}%, #000 0%, rgba(0,0,0,.92) 34%, rgba(0,0,0,.45) 62%, transparent 82%)`;
  return `-webkit-mask-image:${m};mask-image:${m};-webkit-mask-composite:source-in;mask-composite:intersect;`
    + `-webkit-mask-size:${ms},100% 100%;mask-size:${ms},100% 100%;-webkit-mask-position:${mp},0 0;mask-position:${mp},0 0;`
    + '-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;';
}
const maskCss = (m: string) => `-webkit-mask-image:${m};mask-image:${m};`;

// ── The mark ────────────────────────────────────────────
// The app's feather, for the intro and the sign-out warp. `anim` is the
// mark's own entrance or exit. `glint` is the animation of a sheen that
// crosses the feather — clipped to the feather's own shape by using the logo
// as its mask, so the light lands on the quill and never on the dark around
// it. Empty for no sheen.
export function logoMarkHtml(anim: string, glint = '') {
  const m = `url("${logoUrl}")`;
  const mask = `-webkit-mask-image:${m};mask-image:${m};-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;`;
  return `<div class="bintro-mark" style="${escAttr(anim)}">`
    + I(`inset:-70%;border-radius:50%;background:radial-gradient(closest-side, ${rgba(G.soft, 0.3)} 0%, ${rgba(G.accent, 0.13)} 46%, transparent 76%);`)
    + `<img class="bintro-logo" src="${escAttr(logoUrl)}" alt="" draggable="false">`
    + (glint
      ? I(`inset:0;${mask}`, I(`left:0;top:-15%;width:46%;height:130%;background:linear-gradient(90deg, transparent, rgba(255,255,255,.1) 30%, rgba(255,255,255,.82) 50%, rgba(255,255,255,.1) 70%, transparent);opacity:0;${glint}`))
      : '')
    + '</div>';
}

type BillowOpts = {
  x: number; y: number; w: number; h: number; rot: number; bg: string;
  seed: number; bf: string; oct: number; fx: number; fy: number; ms: string; mp: string;
  bl: number; ct: number; blend: string; anim?: string;
};
// The billow primitive. The outer box places, rotates and blends; the inner
// box carries the paint and the animation, so neither transform clobbers
// the other.
function billow(o: BillowOpts) {
  const outer = `left:${f2(o.x)}%;top:${f2(o.y)}%;width:${f2(o.w)}%;height:${f2(o.h)}%;transform:translate(-50%,-50%) rotate(${f2(o.rot)}deg);mix-blend-mode:${o.blend};`;
  const inner = `inset:0;background:${o.bg};${nmask(o.seed, o.bf, o.oct, o.fx, o.fy, o.ms, o.mp)}filter:blur(${f2(o.bl)}px) contrast(${o.ct});${o.anim || ''}`;
  return I(outer, I(inner));
}

// Near-white disappears on a light paper, so light grounds get the same
// roles in deeper violet and cyan.
const starCols = (dark: boolean) => (dark
  ? { core: G.core, dust: G.dust, soft: G.soft, spark: G.spark }
  : { core: '#4a36b0', dust: '#6f55d9', soft: '#8a63e8', spark: '#1a86ad' });

// ============================================================
//  The sky
// ============================================================
export type SkyPreset = 'rail' | 'header' | 'card' | 'friend';
type SkyOpts = {
  seed: number; stars: number; big: number; comets: number; dust: number; scrim: number;
  drifters: number; band: 'full' | 'small' | false; clouds: number; ha: boolean; solar: boolean; asteroid: boolean;
};
const PRESETS: Record<SkyPreset, SkyOpts> = {
  rail: { seed: 5, stars: 52, big: 24, comets: 2, dust: 60, scrim: 0.58, drifters: 5, band: 'full', clouds: 2, ha: true, solar: true, asteroid: true },
  header: { seed: 11, stars: 30, big: 10, comets: 1, dust: 24, scrim: 0.7, drifters: 2, band: 'small', clouds: 1, ha: true, solar: false, asteroid: false },
  card: { seed: 23, stars: 40, big: 16, comets: 1, dust: 36, scrim: 0.62, drifters: 3, band: 'full', clouds: 1, ha: true, solar: true, asteroid: false },
  // A friend's card in your friends list: the same world, lighter, because a
  // list can hold many of them.
  friend: { seed: 37, stars: 20, big: 8, comets: 1, dust: 12, scrim: 0.7, drifters: 1, band: 'small', clouds: 1, ha: true, solar: false, asteroid: false },
};

const DRIFT = [
  { k: 'planet', s: 30, c: G.haze, ca: 0.95, ax: -12, ay: 18, x0: -60, y0: -30, x1: 520, y1: 300, dur: 78, dl: 4, spin: 0 },
  { k: 'ring', s: 17, c: G.rose, ca: 0.9, ax: 102, ay: 58, x0: 40, y0: 20, x1: -470, y1: -210, dur: 104, dl: 22, spin: 0 },
  { k: 'rock', s: 12, c: G.soft, ca: 1, ax: -8, ay: 86, x0: -30, y0: 40, x1: 560, y1: -330, dur: 64, dl: 11, spin: 31 },
  { k: 'rock', s: 7, c: G.dust, ca: 1, ax: 96, ay: 12, x0: 30, y0: -20, x1: -430, y1: 380, dur: 88, dl: 36, spin: 24 },
  { k: 'rock', s: 4, c: G.spark, ca: 1, ax: 46, ay: -6, x0: 0, y0: -30, x1: 190, y1: 620, dur: 57, dl: 49, spin: 17 },
];

function planetHtml(s: number, c: string, ca: number, ring: boolean) {
  const ringCss = `left:${f2(-1.05 * s)}px;top:${f2(-1.05 * s)}px;width:${f2(2.1 * s)}px;height:${f2(2.1 * s)}px;border-radius:50%;border:${f2(Math.max(1, s * 0.06))}px solid ${rgba(G.soft, 0.6)};border-bottom-color:${rgba(G.spark, 0.32)};transform:rotate(-22deg) scaleY(.24);`;
  let h = ring ? I(ringCss) : '';
  h += I(`left:${-s / 2}px;top:${-s / 2}px;width:${s}px;height:${s}px;border-radius:50%;background:radial-gradient(circle at 32% 28%, ${rgba(G.core, 0.5)} 0%, ${rgba(c, ca)} 26%, ${rgba(G.deep, 0.86)} 78%, ${rgba(G.deep, 0.96)} 100%);box-shadow:inset ${f2(-0.12 * s)}px ${f2(-0.1 * s)}px ${f2(0.3 * s)}px rgba(2,1,8,.8), 0 0 ${f2(0.7 * s)}px ${rgba(c, 0.45)};`,
    I('inset:0;border-radius:50%;mix-blend-mode:soft-light;background:radial-gradient(circle at 64% 36%, rgba(255,255,255,.34), transparent 32%), radial-gradient(circle at 36% 68%, rgba(0,0,0,.42), transparent 42%), repeating-linear-gradient(168deg, rgba(255,255,255,.14) 0 2px, transparent 2px 5px);'));
  // The ring's front half crosses over the planet; its back half sits behind.
  if (ring) h += I(`${ringCss}clip-path:inset(50% 0 0 0);`);
  return h;
}

function rockHtml(s: number, c: string, spin: number, r: () => number, p: Painter) {
  const br = Array.from({ length: 8 }, () => `${(38 + r() * 24) | 0}%`);
  const ang = (100 + r() * 60) | 0;
  return I(`left:${-s / 2}px;top:${f2(-s * 0.43)}px;width:${s}px;height:${f2(s * 0.86)}px;border-radius:${br.slice(0, 4).join(' ')} / ${br.slice(4).join(' ')};background:linear-gradient(${ang}deg, ${rgba(G.dust, 0.52)}, ${rgba(c, 0.34)} 46%, rgba(3,2,9,.88));box-shadow:inset -1px -1px 2px rgba(0,0,0,.7), 0 0 ${f2(s * 0.5)}px ${rgba(G.spark, 0.18)};${p.an('spin', spin, 0, 'linear')}`);
}

export type SkyInput = {
  preset: SkyPreset; dark: boolean; paper: string; ink: string; motion: BundleMotion; lowPerf: boolean;
  /** Overrides the preset's layout seed, so several skies on one screen differ. */
  seed?: number;
};

export function skyHtml(input: SkyInput): string {
  const base = input.seed === undefined ? PRESETS[input.preset] : { ...PRESETS[input.preset], seed: input.seed };
  const low = input.lowPerf;
  const o: SkyOpts = low ? {
    ...base,
    stars: Math.round(base.stars / 2), big: Math.round(base.big / 2), dust: Math.round(base.dust / 2),
    clouds: Math.min(1, base.clouds), drifters: Math.min(2, base.drifters), asteroid: false,
  } : base;
  const p = painter(input.motion);
  // The large blurred layers are the expensive half: frozen on low-perf.
  const heavy = (name: string, dur: number, delay = 0, ease = 'linear') => (low ? '' : p.an(name, dur, delay, ease));
  const { dark: d, paper: P } = input;
  const A = p.A;
  const r = rnd(o.seed);
  const R = (a: number, b: number) => a + r() * (b - a);
  const SC = starCols(d);
  const blend = d ? 'screen' : 'multiply';
  const lightK = d ? 1 : 0.5;
  let h = '';

  // 1 · base gradient
  h += I(`inset:0;background:${d
    ? `linear-gradient(168deg, ${rgba(G.void, 0.94)} 0%, ${rgba(G.haze, 0.2)} 34%, ${P} 66%, ${rgba(G.void, 0.72)} 100%)`
    : `linear-gradient(168deg, ${rgba(G.soft, 0.2)} 0%, ${P} 58%, ${rgba(G.accent, 0.12)} 100%)`};`);

  // 2 · three nebula discs
  ([['neb1', 34, 'top:-18%;right:-12%', 128, G.accent, 0.54, 0.24, 0],
    ['neb2', 47, 'bottom:-22%;left:-16%', 112, G.haze, 0.46, 0.2, 2],
    ['neb3', 61, 'top:24%;right:-30%', 96, G.spark, 0.26, 0.12, 4]] as const).forEach(([n, dur, pos, sz, c, ad, al, dl]) => {
    const a = (d ? ad : al) * A;
    h += I(`${pos};width:${sz}%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle, ${rgba(c, a)} 0%, ${rgba(c, a * 0.45)} 38%, transparent 70%);${heavy(n, dur, dl, 'ease-in-out')}`);
  });

  // 3 · cloud masses — billowing vapour, never ellipses
  const masses = [
    { pos: 'left:-8%;top:3%', w: 58, h: 38, rot: -14, c: G.haze, a: 0.5, dur: 64, dl: 0 },
    { pos: 'right:-10%;bottom:13%', w: 50, h: 32, rot: 19, c: G.accent, a: 0.44, dur: 82, dl: 7 },
  ].slice(0, o.clouds);
  masses.forEach((m, mi) => {
    const al = m.a * A * lightK;
    const sb = o.seed * 100 + mi * 50;
    const mp = () => `${R(0, 100) | 0}% ${R(0, 100) | 0}%`;
    const ms = () => { const v = R(140, 230) | 0; return `${v}% ${v}%`; };
    const billowAnim = (lo: number, hi: number, back: number) => `--bxd:${R(-2.5, 2.5).toFixed(2)}%;--byd:${R(-2, 2).toFixed(2)}%;--bsc:${R(1.04, 1.18).toFixed(3)};${heavy('billow', R(lo, hi), -R(0, back), 'ease-in-out')}`;
    let L = '';
    for (let i = 0; i < 4; i++) { // occlusion
      L += billow({ x: R(28, 72), y: R(30, 70), w: R(48, 84), h: R(34, 62), rot: R(-30, 30),
        bg: rgba(G.deep, R(0.8, 1) * A * (d ? 1 : 0.3)), seed: sb + i,
        bf: `${R(0.009, 0.017).toFixed(3)} ${R(0.014, 0.024).toFixed(3)}`, oct: 4,
        fx: R(40, 60), fy: R(40, 60), ms: ms(), mp: mp(), bl: R(2, 5), ct: 1.2, blend: 'multiply' });
    }
    const lit = low ? 6 : 11;
    for (let i = 0; i < lit; i++) { // lit billows: the first four are big
      const big = i < 4; const c = r() < 0.3 ? G.rose : m.c; const mm = R(0.62, 1.32);
      L += billow({ x: R(18, 82), y: R(20, 80), w: big ? R(34, 64) : R(16, 38), h: big ? R(26, 50) : R(12, 30), rot: R(-40, 40),
        bg: `radial-gradient(closest-side at ${R(34, 58) | 0}% ${R(32, 58) | 0}%, ${rgba(c, al * mm)} 0%, ${rgba(c, al * 0.42)} 40%, ${rgba(c, al * 0.14)} 66%, transparent 86%)`,
        seed: sb + 10 + i, bf: `${R(0.011, 0.024).toFixed(3)} ${R(0.017, 0.033).toFixed(3)}`, oct: r() < 0.5 ? 4 : 5,
        fx: R(38, 62), fy: R(38, 62), ms: ms(), mp: mp(), bl: R(1, 4.4), ct: 1.45, blend, anim: billowAnim(17, 39, 20) });
    }
    for (let i = 0; i < 3; i++) { // rim lights, upper-left — the lit side
      L += billow({ x: R(18, 40), y: R(16, 36), w: R(12, 28), h: R(9, 21), rot: R(-30, 30),
        bg: `radial-gradient(closest-side, ${rgba(G.rose, al * 1.7)} 0%, ${rgba(G.haze, al * 0.85)} 45%, transparent 85%)`,
        seed: sb + 30 + i, bf: `${R(0.02, 0.04).toFixed(3)} ${R(0.02, 0.04).toFixed(3)}`, oct: 5,
        fx: 50, fy: 50, ms: ms(), mp: mp(), bl: R(0.6, 2.2), ct: 1.6, blend, anim: billowAnim(13, 27, 12) });
    }
    for (let i = 0; i < 11; i++) { // dust motes
      const s = R(0.8, 2.3); const c = r() < 0.5 ? SC.dust : G.rose;
      L += I(`left:${f2(R(8, 92))}%;top:${f2(R(8, 92))}%;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;background:${rgba(c, R(0.2, 0.65) * A)};box-shadow:0 0 ${f2(2.5 * s)}px ${rgba(SC.soft, 0.6)};`);
    }
    h += I(`${m.pos};width:${m.w}%;height:${m.h}%;transform:rotate(${m.rot}deg);`, I(`inset:0;${heavy('cloud', m.dur, m.dl, 'ease-in-out')}`, L));
  });

  // 4 · star field A
  let sa = '';
  for (let i = 0; i < o.stars; i++) {
    const s = R(0.8, 1.9); const tw = r() < 0.88;
    sa += I(`left:${f2(R(0, 100))}%;top:${f2(R(0, 100))}%;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;background:${rgba(SC.core, R(0.25, 0.95) * A)};${tw ? p.an('twinkle', R(2.6, 7.6), R(0, 5), 'ease-in-out') : ''}`);
  }
  h += I(`inset:0;${p.an('fieldA', 54, 0, 'ease-in-out')}`, sa);

  // 5 · star field B — bigger, glowing
  let sb2 = '';
  for (let i = 0; i < o.big; i++) {
    const s = R(1.6, 3.1); const tw = r() < 0.88;
    sb2 += I(`left:${f2(R(0, 100))}%;top:${f2(R(0, 100))}%;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;background:${rgba(SC.core, R(0.25, 0.95) * A)};box-shadow:0 0 ${f2(3 * s)}px ${rgba(SC.core, 0.8)};${tw ? p.an('twinkle', R(2.6, 7.6), R(0, 5), 'ease-in-out') : ''}`);
  }
  h += I(`inset:0;${p.an('fieldB', 78, 0, 'ease-in-out')}`, sb2);

  // 6 · dust veil along a diagonal
  let dv = '';
  for (let i = 0; i < o.dust; i++) {
    const t = r(); const s = R(0.6, 1.5); const c = r() < 0.5 ? SC.dust : SC.soft;
    dv += I(`left:${f2(t * 136 - 18)}%;top:${f2(8 + t * 70 + R(-17, 17))}%;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;background:${rgba(c, R(0.12, 0.46) * A)};`);
  }
  h += I(`inset:0;${p.an('fieldA', 94, 0, 'ease-in-out')}`, dv);

  // 7 · the Milky Way — a band seen from inside the galaxy, never a disc
  if (o.band) {
    const small = o.band === 'small';
    let b = '';
    b += I(`left:0;right:0;top:18%;height:64%;background:linear-gradient(90deg, transparent, ${rgba(SC.dust, 0.1 * A)} 12%, ${rgba(SC.dust, 0.2 * A)} 34%, ${rgba(SC.soft, 0.26 * A)} 52%, ${rgba(SC.dust, 0.17 * A)} 74%, transparent);filter:blur(13px);mix-blend-mode:${blend};${heavy('shine', 17, 0, 'ease-in-out')}`);
    ([[18, 26, 46, SC.dust, 0.3, 21, 0], [44, 22, 56, SC.soft, 0.34, 26, 1.7], [66, 24, 40, SC.dust, 0.24, 31, 3.4], [86, 18, 32, G.haze, 0.18, 24, 5.1]] as const)
      .forEach(([x, w, hh, c, a, dur, dl], i) => {
        b += I(`left:${x - w / 2}%;top:${50 - hh / 2}%;width:${w}%;height:${hh}%;background:radial-gradient(closest-side, ${rgba(c, a * A)} 0%, ${rgba(c, a * A * 0.55)} 50%, transparent 100%);${nmask(o.seed + i * 9, '0.013 0.026', 4, 50, 50, '180% 180%', `${(i * 23 + 11) % 100}% ${(i * 37 + 7) % 100}%`)}filter:blur(${R(3, 4.2).toFixed(1)}px) contrast(1.3);mix-blend-mode:${blend};${heavy('gasRipple', dur, dl, 'ease-in-out')}`);
      });
    b += I(`left:46%;top:12%;width:20%;height:76%;border-radius:50%;background:radial-gradient(closest-side, ${d ? 'rgba(255,255,255,.46)' : rgba(G.haze, 0.3)} 0%, ${rgba(G.ember, 0.34 * A)} 26%, ${rgba(SC.dust, 0.22 * A)} 52%, transparent 100%);filter:blur(8px);mix-blend-mode:${blend};${heavy('shine', 12, 1, 'ease-in-out')}`);
    b += I(`left:52%;top:34%;width:9%;height:32%;border-radius:50%;background:radial-gradient(closest-side, ${d ? 'rgba(255,255,255,.5)' : rgba(G.haze, 0.3)} 0%, ${rgba(G.ha, 0.3 * A)} 50%, transparent 100%);filter:blur(4px);mix-blend-mode:${blend};${heavy('radiate', 7.5, 0, 'ease-in-out')}`);
    if (!small) { // the Great Rift
      ([[6, 64, 44, 13, 2, 0.62, 58], [40, 52, 52, 10, -3, 0.5, 73], [28, 18, 34, 16, 9, 0.42, 64]] as const).forEach(([x, w, tp, hh, rot, a, dur], i) => {
        const aa = a * A * (d ? 1 : 0.35);
        const bg = `radial-gradient(ellipse 34% 50% at 20% 50%, ${rgba(G.deep, aa)} 0%, transparent 100%), radial-gradient(ellipse 34% 50% at 50% 46%, ${rgba(G.deep, aa * 0.9)} 0%, transparent 100%), radial-gradient(ellipse 34% 50% at 80% 54%, ${rgba(G.deep, aa * 0.8)} 0%, transparent 100%)`;
        b += I(`left:${x}%;top:${tp}%;width:${w}%;height:${hh}%;transform:rotate(${rot}deg);mix-blend-mode:multiply;`,
          I(`inset:0;background:${bg};${nmask(o.seed + 60 + i, '0.016 0.03', 4, 50, 50, '170% 200%', `${(i * 31 + 13) % 100}% ${(i * 19 + 41) % 100}%`)}filter:blur(${R(2.5, 3.5).toFixed(1)}px) contrast(1.25);--bxd:${R(-2.5, 2.5).toFixed(2)}%;--byd:${R(-2, 2).toFixed(2)}%;--bsc:${R(1.04, 1.12).toFixed(3)};${heavy('billow', dur, -R(0, 20), 'ease-in-out')}`));
      });
    }
    b += I(`left:0;top:26%;width:34%;height:48%;background:linear-gradient(90deg, transparent, ${rgba(SC.core, 0.16 * A)} 38%, ${rgba(SC.dust, 0.22 * A)} 56%, transparent);filter:blur(12px);mix-blend-mode:${blend};${p.motion === 'off' || low ? 'opacity:.5;transform:translateX(90%);' : p.an('bandSweep', 34, 2, 'ease-in-out')}`);

    const nCl = small ? 7 : 13; // star clusters, each with a small H-alpha or cyan halo
    for (let c = 0; c < nCl; c++) {
      const cx = R(4, 96); const cy = 50 + (r() + r() - 1) * 17;
      const col = r() < 0.5 ? G.ha : G.spark;
      let dots = I(`left:-7px;top:-7px;width:14px;height:14px;border-radius:50%;background:radial-gradient(circle, ${rgba(col, 0.3 * A * lightK)} 0%, transparent 70%);`);
      const k = 4 + ((r() * 5) | 0);
      for (let j = 0; j < k; j++) {
        const s = R(0.5, 1.6);
        dots += I(`left:${f2(R(-3.5, 3.5) - s / 2)}px;top:${f2(R(-3.5, 3.5) - s / 2)}px;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;background:${rgba(SC.core, R(0.6, 1) * A)};${r() < 0.6 ? p.an('twinkle', R(2.4, 6.4), R(0, 4), 'ease-in-out') : ''}`);
      }
      b += I(`left:${f2(cx)}%;top:${f2(cy)}%;width:0;height:0;`, dots);
    }
    const nBr = small ? 3 : 5; // bright foreground stars with diffraction spikes
    for (let i = 0; i < nBr; i++) {
      const s = R(1.6, 3); const tint = r() < 0.5 ? G.spark : G.ember; const L2 = 14 * s; const dd = R(4.6, 7.6);
      const coreCol = d ? '#fff' : SC.core;
      const spkCol = d ? 'rgba(255,255,255,.9)' : rgba(SC.core, 0.8);
      b += I(`left:${f2(R(8, 92))}%;top:${f2(50 + (r() + r() - 1) * 26)}%;width:0;height:0;opacity:${f2(A)};`,
        I(`left:${f2(-L2 / 2)}px;top:-.35px;width:${f2(L2)}px;height:.7px;background:linear-gradient(90deg, transparent, ${spkCol} 50%, transparent);${p.an('spike', dd, 0, 'ease-in-out')}`)
        + I(`left:-.35px;top:${f2(-L2 / 2)}px;width:.7px;height:${f2(L2)}px;background:linear-gradient(180deg, transparent, ${spkCol} 50%, transparent);${p.an('spikeV', dd, 0.3, 'ease-in-out')}`)
        + I(`left:${f2(-s / 2)}px;top:${f2(-s / 2)}px;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;background:${coreCol};box-shadow:0 0 ${f2(2.2 * s)}px ${coreCol}, 0 0 ${f2(6 * s)}px ${rgba(tint, 0.8)};`));
    }
    // band stars — a bell curve about the spine, denser near the core
    let bs = '';
    const nStars = small || low ? 110 : 210;
    for (let i = 0; i < nStars; i++) {
      const x = R(0, 100); const spread = (r() + r() + r() - 1.5) * 22;
      const near = 1 - Math.min(1, Math.abs(x - 50) / 54) * 0.45;
      const s = 0.5 + r() * 1.5 * near;
      const q = r(); const c = q < 0.1 ? G.ha : q < 0.2 ? SC.spark : SC.core;
      const glow = r() < 0.14; const tw = r() < 0.84;
      bs += I(`left:${f2(x)}%;top:${f2(50 + spread)}%;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;background:${rgba(c, R(0.45, 1) * A)};${glow ? `box-shadow:0 0 ${f2(s * 3)}px ${rgba(c, 0.7)};` : ''}${tw ? p.an('twinkle', R(2.2, 7.2), R(0, 5), 'ease-in-out') : ''}`);
    }
    b += I(`inset:0;${p.an('fieldB', 72, 0, 'ease-in-out')}`, bs);

    const pos = small ? 'left:-10%;top:10%;width:120%;height:24%;' : 'left:-24%;top:4%;width:148%;height:30%;';
    h += I(`${pos}transform:rotate(-33deg);opacity:.9;`, I(`inset:0;${p.an('sysdrift', 140, 0, 'ease-in-out')}`, b));
  }

  // 8 · H-alpha star-forming region
  if (o.ha) {
    let hr = '';
    ([[18, 26, 96, 74, G.ha, 0.5, 26, 0], [62, 58, 84, 66, G.ruby, 0.56, 34, 3], [34, 78, 74, 54, G.ha, 0.36, 41, 7],
      [82, 16, 62, 50, G.rose, 0.3, 29, 5], [8, 62, 58, 46, G.neon, 0.26, 37, 11]] as const).forEach(([x, y, w, hh, c, a, dur, dl]) => {
      const aa = a * A * lightK;
      hr += I(`left:${x - w / 2}%;top:${y - hh / 2}%;width:${w}%;height:${hh}%;background:radial-gradient(closest-side at ${(42 + r() * 18) | 0}% ${(40 + r() * 20) | 0}%, ${rgba(c, aa)} 0%, ${rgba(c, aa * 0.52)} 34%, ${rgba(c, aa * 0.2)} 62%, transparent 84%);filter:blur(${(10 + r() * 16) | 0}px);mix-blend-mode:${blend};${heavy('gasRipple', dur, dl, 'ease-in-out')}`);
    });
    ([[-14, 30, 128, 9, -26, G.neon, 0.5, 7, 31], [-6, 52, 112, 6, -19, G.rose, 0.44, 5, 39],
      [-20, 68, 134, 11, -33, G.ha, 0.34, 9, 47], [2, 14, 96, 5, -12, G.accent, 0.4, 4, 36]] as const).forEach(([x, y, w, hh, rot, c, a, bl, dur]) => {
      const aa = a * A * lightK;
      hr += I(`left:${x}%;top:${y}%;width:${w}%;height:${hh}%;border-radius:50%;transform-origin:40% 50%;--wr:${rot}deg;transform:rotate(${rot}deg);background:linear-gradient(90deg, transparent, ${rgba(c, aa * 0.4)} 18%, ${rgba(c, aa)} 44%, ${rgba(c, aa * 0.55)} 68%, transparent);filter:blur(${bl}px);mix-blend-mode:${blend};${heavy('wisp', dur, 0, 'ease-in-out')}`);
    });
    ([[24, 30, 3.4, 5.4], [63, 41, 2.6, 6.8], [44, 19, 2.1, 4.6], [77, 66, 1.8, 7.6]] as const).forEach(([x, y, s, dd]) => {
      const L2 = 9 * s; const t = Math.max(0.6, s * 0.32); const hs = 26 * s;
      const coreCol = d ? '#fff' : G.ruby;
      hr += I(`left:${x}%;top:${y}%;width:0;height:0;opacity:${f2(A)};`,
        I(`left:${f2(-hs / 2)}px;top:${f2(-hs / 2)}px;width:${f2(hs)}px;height:${f2(hs)}px;border-radius:50%;background:radial-gradient(circle, ${rgba(G.natal, 0.5 * lightK)} 0%, ${rgba(G.ha, 0.34)} 22%, ${rgba(G.neon, 0.16)} 48%, transparent 70%);${p.an('radiate', dd * 2.4, 0, 'ease-in-out')}`)
        + I(`left:${f2(-L2 / 2)}px;top:${f2(-t / 2)}px;width:${f2(L2)}px;height:${f2(t)}px;background:linear-gradient(90deg, transparent, ${coreCol} 50%, transparent);${p.an('spike', dd, 0, 'ease-in-out')}`)
        + I(`left:${f2(-t / 2)}px;top:${f2(-L2 / 2)}px;width:${f2(t)}px;height:${f2(L2)}px;background:linear-gradient(180deg, transparent, ${coreCol} 50%, transparent);${p.an('spikeV', dd, 0.3, 'ease-in-out')}`)
        + I(`left:${f2(-s / 2)}px;top:${f2(-s / 2)}px;width:${s}px;height:${s}px;border-radius:50%;background:${coreCol};box-shadow:0 0 ${f2(2 * s)}px ${coreCol}, 0 0 ${f2(5 * s)}px ${rgba(G.natal, 0.9)}, 0 0 ${f2(11 * s)}px ${rgba(G.ha, 0.7)};`));
    });
    h += I('inset:0;overflow:hidden;', hr);
  }

  // 9 · a distant solar system, orbital plane tilted
  if (o.solar) {
    let ss = I(`left:116px;top:116px;width:18px;height:18px;border-radius:50%;transform:scaleY(1.74);background:radial-gradient(circle, ${G.core} 0 34%, ${rgba(G.ember, 0.8)} 58%, transparent 74%);box-shadow:0 0 30px ${rgba(G.ember, 0.7 * A)}, 0 0 70px ${rgba(G.accent, 0.5 * A)};${p.an('mote', 9, 0, 'ease-in-out')}`);
    ([[34, 26, false, G.soft, 4.6], [56, 39, false, G.spark, 3.4], [82, 57, true, G.ember, 5.6], [112, 77, false, G.dust, 3]] as const).forEach(([rr, per, retro, col, ps]) => {
      ss += I(`left:${125 - rr}px;top:${125 - rr}px;width:${2 * rr}px;height:${2 * rr}px;border-radius:50%;border:1px solid ${rgba(SC.dust, 0.2)};${p.rot(retro ? 'orbitRev' : 'orbit', per, R(0, 360))}`,
        I(`left:${f2(rr - 1 - ps / 2)}px;top:${f2(-0.5 - ps / 2)}px;width:${ps}px;height:${ps}px;border-radius:50%;transform:scaleY(1.74);background:${col};box-shadow:0 0 ${f2(ps * 1.6)}px ${rgba(col, 0.7)};`));
    });
    h += I(`left:6%;bottom:10%;width:250px;height:250px;opacity:${f2(Math.min(1, A + 0.1))};transform:rotate(-17deg) scaleY(.58);`, I(`inset:0;${p.an('sysdrift', 40, 0, 'ease-in-out')}`, ss));
  }

  // 10 · comets — the streak's rotation IS its travel vector, and both
  // tails widen away from the nucleus
  ([
    { ang: 33, left: '-4%', top: '-12%', ox: -140, oy: -110, dist: 1600, dur: 23, dl: 2, tail: 150, head: 3.4, at: 0.3 },
    { ang: 147, left: '104%', top: '-6%', ox: 150, oy: -90, dist: 1500, dur: 31, dl: 12, tail: 104, head: 2.5, at: 0.3 },
  ]).slice(0, o.comets).forEach((c) => {
    const th = (c.ang * Math.PI) / 180;
    const x1 = c.ox + Math.cos(th) * c.dist; const y1 = c.oy + Math.sin(th) * c.dist;
    const t = Math.max(1.1, c.head * 0.8);
    const move = p.motion === 'off'
      ? `transform:translate3d(${f2(c.ox + (x1 - c.ox) * c.at)}px,${f2(c.oy + (y1 - c.oy) * c.at)}px,0) rotate(${c.ang}deg);`
      : `opacity:0;${p.an('cometRun', c.dur, c.dl, 'linear')}`;
    const inner = I(`left:${f2(-0.62 * c.tail)}px;top:${f2(-2.2 * t)}px;width:${f2(0.62 * c.tail)}px;height:${f2(4.4 * t)}px;background:linear-gradient(90deg, transparent, ${rgba(SC.soft, 0.1)} 34%, ${rgba(SC.dust, 0.3)} 78%, ${rgba(SC.dust, 0.46)});clip-path:polygon(0 0,100% 40%,100% 60%,0 100%);filter:blur(2.4px);`)
      + I(`left:${-c.tail}px;top:${f2(-1.1 * t)}px;width:${c.tail}px;height:${f2(2.2 * t)}px;background:linear-gradient(90deg, ${rgba(G.spark, 0)}, ${rgba(G.spark, 0.2)} 38%, ${rgba(G.spark, 0.62)} 76%, ${rgba(SC.core, 0.95)});clip-path:polygon(0 0,100% 38%,100% 62%,0 100%);filter:blur(.6px);`)
      + I(`left:${f2(-3.2 * c.head)}px;top:${f2(-3.2 * c.head)}px;width:${f2(6.4 * c.head)}px;height:${f2(6.4 * c.head)}px;border-radius:50%;background:radial-gradient(circle, ${rgba(SC.core, 0.6)} 0%, ${rgba(G.spark, 0.34)} 34%, transparent 70%);`)
      + I(`left:${f2(-c.head / 2)}px;top:${f2(-c.head / 2)}px;width:${c.head}px;height:${c.head}px;border-radius:50%;background:${d ? '#fff' : SC.core};box-shadow:0 0 ${f2(2.4 * c.head)}px ${SC.core}, 0 0 ${f2(6 * c.head)}px ${rgba(G.spark, 0.75)};`);
    h += I(`left:${c.left};top:${c.top};width:0;height:0;opacity:${f2(A)};`,
      I(`left:0;top:0;width:0;height:0;--cx0:${c.ox}px;--cy0:${c.oy}px;--cx1:${f2(x1)}px;--cy1:${f2(y1)}px;--crot:${c.ang}deg;${move}`, inner));
  });

  // A one-way crossing. With motion off the body holds a poster position
  // partway along its path instead of waiting off-screen forever.
  const cross = (x0: number, y0: number, x1: number, y1: number, dur: number, dl: number, at: number) => {
    const v = `--cx0:${x0}px;--cy0:${y0}px;--cx1:${x1}px;--cy1:${y1}px;`;
    if (p.motion === 'off') return `${v}transform:translate3d(${f2(x0 + (x1 - x0) * at)}px,${f2(y0 + (y1 - y0) * at)}px,0);opacity:.9;`;
    return `${v}opacity:0;${p.an('cross', dur, dl, 'linear')}`;
  };

  // 11 · a tumbling asteroid with two pebbles
  if (o.asteroid) {
    const peb = (dist: number, sz: number, dur: number) => I(`left:-${dist}px;top:-${dist}px;width:${2 * dist}px;height:${2 * dist}px;${p.rot('orbitRev', dur, R(0, 360))}`,
      I(`left:${f2(dist - sz / 2)}px;top:${f2(-sz / 2)}px;width:${sz}px;height:${sz}px;border-radius:50%;background:${rgba(G.dust, 0.55)};box-shadow:inset -.5px -.5px 1px rgba(0,0,0,.7);`));
    h += I(`left:0;top:62%;width:0;height:0;opacity:${f2(A)};`,
      I(`left:0;top:0;width:0;height:0;${cross(-40, 60, 820, -470, 96, 6, 0.28)}`,
        I(`left:-4.5px;top:-4.5px;width:9px;height:9px;border-radius:46% 54% 38% 62%/58% 44% 56% 42%;background:linear-gradient(128deg, ${rgba(G.dust, 0.6)}, ${rgba(G.haze, 0.34)} 46%, rgba(4,3,10,.82));box-shadow:inset -1px -1px 2px rgba(0,0,0,.72), 0 0 6px ${rgba(G.spark, 0.28)};${p.an('orbit', 34, 0, 'linear')}`)
        + peb(10, 2.4, 21) + peb(14, 1.8, 27)));
  }

  // 12 · drifting bodies — bigger is nearer, so bigger is faster
  DRIFT.slice(0, o.drifters).forEach((b) => {
    const body = b.k === 'rock' ? rockHtml(b.s, b.c, b.spin, r, p) : planetHtml(b.s, b.c, b.ca, b.k === 'ring');
    h += I(`left:${b.ax}%;top:${b.ay}%;width:0;height:0;opacity:${f2(A)};`,
      I(`left:0;top:0;width:0;height:0;${cross(b.x0, b.y0, b.x1, b.y1, b.dur, b.dl, 0.3)}`, body));
  });

  // 13 · vignette
  h += I(`inset:0;background:radial-gradient(120% 96% at 46% 42%, transparent 0 52%, ${d ? rgba(G.deep, 0.5) : rgba(input.ink, 0.06)} 100%);`);
  // 14 · scrim — the readability layer. Never omit it.
  const s = o.scrim;
  h += I(`inset:0;background:linear-gradient(180deg, ${rgba(P, s * 0.66)} 0%, ${rgba(P, s)} 46%, ${rgba(P, Math.min(0.96, s + 0.16))} 100%);`);
  // 15 · film grain
  h += I(`inset:0;background-image:${GRAIN};background-size:180px 180px;opacity:${d ? 0.05 : 0.035};mix-blend-mode:${d ? 'screen' : 'multiply'};`);
  // 16 · top hairline
  h += I(`left:0;right:0;top:0;height:2px;opacity:.9;background:linear-gradient(90deg, transparent, ${G.accent} 24%, ${G.spark} 52%, ${rgba(G.soft, 0.85)} 76%, transparent);`);
  return h;
}

// ============================================================
//  Avatar decoration — three tiers by size
//    ring   ≤28px  rim only, no motion
//    simple ≤56px  rim, corona, one orbiting body
//    full   >56px  the whole system
//  The canvas is 1.25× the avatar and the centre 70% of the face stays clear.
// ============================================================
export type Tier = 'ring' | 'simple' | 'full';
export const tierFor = (size: number): Tier => (size <= 28 ? 'ring' : size <= 56 ? 'simple' : 'full');

type Body = [r: number, sf: number, per: number, start: number, col: string, motes: number, retro: boolean];

function orbiter(D: number, size: number, [rr, sf, per, start, col, motes, retro]: Body, p: Painter) {
  const bs = Math.max(1.6, sf * size); const Rr = rr * D;
  let inner = I(`left:${f2(Rr - bs / 2)}px;top:${f2(-bs / 2)}px;width:${f2(bs)}px;height:${f2(bs)}px;border-radius:50%;background:${col};box-shadow:0 0 ${f2(bs * 1.4)}px ${rgba(col, 0.8)};`);
  for (let m = 0; m < motes; m++) {
    const ms = Math.max(0.8, (0.42 - m * 0.07) * bs);
    const ang = (retro ? 1 : -1) * (6 + m * 5.5); // motes trail behind the direction of travel
    inner += I(`inset:0;transform:rotate(${ang}deg);`,
      I(`left:${f2(Rr - ms / 2)}px;top:${f2(-ms / 2)}px;width:${f2(ms)}px;height:${f2(ms)}px;border-radius:50%;background:${rgba(col, 0.55 - m * 0.12)};${p.an('mote', 7 + m, -m, 'ease-in-out')}`));
  }
  return I(`left:${f2(D / 2 - Rr)}px;top:${f2(D / 2 - Rr)}px;width:${f2(2 * Rr)}px;height:${f2(2 * Rr)}px;${p.rot(retro ? 'orbitRev' : 'orbit', per, start)}`, inner);
}

export type Decoration = { D: number; off: number; tier: Tier; back: string; front: string };

export function decorationHtml(size: number, motion: BundleMotion, lowPerf: boolean, seed = size): Decoration {
  const tier = tierFor(size); const D = size * 1.25; const off = (D - size) / 2;
  const p = painter(motion);
  const r = rnd(seed * 7 + 3); const R = (a: number, b: number) => a + r() * (b - a);
  let back = ''; let front = '';
  const rim = I(`left:${f2(off)}px;top:${f2(off)}px;width:${size}px;height:${size}px;border-radius:50%;box-shadow:0 0 0 ${f2(Math.max(1.4, size * 0.022))}px ${G.accent}, 0 0 ${f2(size * 0.26)}px ${G.glow};`);

  if (tier === 'ring') return { D, off, tier, back, front: rim };

  front += I(`inset:0;border-radius:50%;background:radial-gradient(circle, transparent 0 44%, ${G.glow} 56%, transparent 76%);${p.an('corona', 9, -R(0, 9), 'ease-in-out')}`);
  if (tier === 'full') {
    front += I(`inset:-2%;border-radius:50%;background:conic-gradient(from 0deg, transparent 0 16%, ${rgba(G.spark, 0.75)} 27%, ${rgba(G.accent, 0.9)} 41%, transparent 56%);${maskCss('radial-gradient(circle, transparent 56%, #000 60%, #000 73%, transparent 77%)')}${lowPerf ? '' : `filter:blur(${f2(Math.max(1, size * 0.018))}px);`}${p.rot('aurora', 26, R(0, 360))}`);
  }
  front += rim;
  if (tier === 'simple') {
    front += orbiter(D, size, [0.5, 0.085, 21, 36, G.spark, 2, false], p);
    return { D, off, tier, back, front };
  }

  // rim runner: a spark circling the rim with a conic trail behind it
  const C = D * 1.14; const hd = Math.max(2.4, size * 0.052);
  front += I(`left:${f2((D - C) / 2)}px;top:${f2((D - C) / 2)}px;width:${f2(C)}px;height:${f2(C)}px;${p.rot('orbit', 17, R(0, 360))}`,
    I(`inset:0;border-radius:50%;background:conic-gradient(transparent 0 62%, ${rgba(G.accent, 0.28)} 76%, ${rgba(G.soft, 0.6)} 88%, ${rgba(G.spark, 0.92)} 97%, ${G.core} 100%);${maskCss('radial-gradient(circle, transparent 63%, #000 67.5%, #000 71.5%, transparent 76%)')}`)
    + I(`left:${f2(C / 2 - hd / 2)}px;top:${f2(C * 0.0086 - hd / 2)}px;width:${f2(hd)}px;height:${f2(hd)}px;border-radius:50%;background:${G.core};box-shadow:0 0 ${f2(2.2 * hd)}px ${G.core}, 0 0 ${f2(5 * hd)}px ${rgba(G.spark, 0.85)}, 0 0 ${f2(9 * hd)}px ${rgba(G.accent, 0.6)};`));
  const bodies: Body[] = [[0.495, 0.09, 16, 28, G.spark, 3, false], [0.575, 0.062, 27, 212, G.soft, 2, false], [0.445, 0.048, 34, 128, G.soft, 2, true]];
  (lowPerf ? bodies.slice(0, 2) : bodies).forEach((b) => { front += orbiter(D, size, b, p); });

  const sc = Math.max(0.6, size / 112);
  for (let i = 0; i < 5; i++) { // twinkling sparks around the rim
    const ang = R(0, Math.PI * 2); const rad = R(0.46, 0.6) * D; const s = R(1.6, 3.6) * sc;
    front += I(`left:${f2(D / 2 + rad * Math.cos(ang) - s / 2)}px;top:${f2(D / 2 + rad * Math.sin(ang) - s / 2)}px;width:${f2(s)}px;height:${f2(s)}px;transform:rotate(45deg);`,
      I(`inset:0;background:${G.core};box-shadow:0 0 ${f2(3 * s)}px ${G.core};${p.an('twinkle', R(4.5, 9.7), i * 0.7, 'ease-in-out')}`));
  }

  // The dust ring sits BEHIND the photo, so the stretch of it that would
  // cross the face is hidden — the centre of the avatar stays clear.
  let dr = '';
  for (let i = 0; i < 30; i++) {
    const rad = (0.455 + r() * 0.075) * D; const a = r() * Math.PI * 2; const s = R(1, 2) * Math.max(0.75, sc);
    dr += I(`left:${f2(D / 2 + rad * Math.cos(a) - s / 2)}px;top:${f2(D / 2 + rad * Math.sin(a) - s / 2)}px;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;background:${rgba(G.dust, R(0.25, 0.75))};`);
  }
  back += I('inset:0;transform:rotate(-14deg) scaleY(.42);', I(`inset:0;${lowPerf ? '' : p.rot('orbit', 62, 0)}`, dr));

  // A miniature solar system, tucked behind the rim at the lower right.
  const k2 = size / 112; const sys = 46 * k2;
  let sy = I(`left:${f2(sys / 2 - 2 * k2)}px;top:${f2(sys / 2 - 2 * k2)}px;width:${f2(4 * k2)}px;height:${f2(4 * k2)}px;border-radius:50%;background:${G.ember};box-shadow:0 0 ${f2(6 * k2)}px ${rgba(G.ember, 0.8)};`);
  ([[9, 13, false, G.soft], [15, 21, true, G.spark], [22, 31, false, G.soft]] as const).forEach(([rr, per, retro, col]) => {
    const R2 = rr * k2; const ps = Math.max(1.5, 3 * k2);
    sy += I(`left:${f2(sys / 2 - R2)}px;top:${f2(sys / 2 - R2)}px;width:${f2(2 * R2)}px;height:${f2(2 * R2)}px;border-radius:50%;border:1px solid ${rgba(G.dust, 0.16)};${p.rot(retro ? 'orbitRev' : 'orbit', per, R(0, 360))}`,
      I(`left:${f2(R2 - 1 - ps / 2)}px;top:${f2(-0.5 - ps / 2)}px;width:${f2(ps)}px;height:${f2(ps)}px;border-radius:50%;background:${col};`));
  });
  back += I(`right:-6%;bottom:2%;width:${f2(sys)}px;height:${f2(sys)}px;`, sy);
  return { D, off, tier, back, front };
}

// ============================================================
//  The collection tile's mini star-scape — cheap on purpose: two washes,
//  sixteen twinkling dots and a paper scrim.
// ============================================================
export function tileScapeHtml(dark: boolean, paper: string, paper2: string, motion: BundleMotion): string {
  const p = painter(motion);
  const SC = starCols(dark);
  const r = rnd(31);
  let dots = '';
  for (let i = 0; i < 16; i++) {
    const s = 1 + r() * 1.6;
    dots += I(`left:${f2(r() * 100)}%;top:${f2(r() * 100)}%;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;background:${rgba(SC.core, 0.5 + r() * 0.5)};${p.an('twinkle', 2.6 + r() * 4, r() * 3, 'ease-in-out')}`);
  }
  return I(`inset:0;background:radial-gradient(70% 90% at 22% 18%, ${rgba(G.accent, dark ? 0.55 : 0.3)} 0%, transparent 70%), radial-gradient(60% 80% at 84% 86%, ${rgba(G.ha, dark ? 0.35 : 0.18)} 0%, transparent 70%), ${dark ? G.void : paper2};`)
    + dots
    + I(`inset:0;background:linear-gradient(180deg, ${rgba(paper, 0.28)}, ${rgba(paper, 0.5)});`);
}
