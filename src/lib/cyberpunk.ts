// ============================================================
//  Cyberpunk — the paint for the bundle's layers.
//
//  A rain-wet rooftop at night over a dense neon megacity: cyan and magenta
//  signage against a deep indigo-violet sky. Blade Runner, not "neon
//  gradient". Busy and layered, but it is background — the reading pane
//  never animates, and all of it sits under a stepped scrim so text holds
//  4.5:1.
//
//  Same contract as galaxy.ts: every function returns an HTML STRING of
//  absolutely-positioned <i> elements, animated only by `bx-` keyframes in
//  styles/bundles.css, generated from a seeded LCG so a scene is laid out
//  the same way everywhere. Motion "off" emits no animation at all and
//  keeps a composed poster frame; low-perf (Android) halves the counts and
//  leaves the large blurred layers still.
//
//  No image, texture or video anywhere — the city is 100% CSS.
// ============================================================
import type { BundleMotion } from './bundles';
import { painter, rgba, rnd, logoMarkHtml, type Decoration, type SkyInput, type Tier } from './galaxy';

export const CY = {
  cyan: '#00e5ff', magenta: '#ff2d95', violet: '#7b2fff', amber: '#ffb347', core: '#eaf9ff',
  dust: '#bfe9ff', void: '#04050d', deep: '#010207', soft: '#7de9ff',
};

const f2 = (n: number) => (+n).toFixed(2);
const escAttr = (s: string) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const I = (css: string, inner = '') => `<i style="${escAttr(css)}">${inner}</i>`;

// A hard-edged turbulence field: patches that are fully on or fully off, so
// it kills whole window cells instead of dimming them all a little.
const hardCache = new Map<string, string>();
function fractalHard(seed: number, bf: string) {
  const key = `${seed}|${bf}`;
  const hit = hardCache.get(key);
  if (hit) return hit;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='340'><filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='${bf}' numOctaves='3' seed='${seed}'/><feColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 3.4 0 0 0 -1.35'/></filter><rect width='340' height='340' filter='url(#n)'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  hardCache.set(key, url);
  return url;
}

// ============================================================
//  The city
// ============================================================
type Layer = {
  w: [number, number]; h: [number, number]; base: number; top: string; bot: string;
  wa: number; ww: number; gw: number; wh: number; gh: number; op: number; nf: string;
  crown: number; signs: boolean; bands: boolean; blur: number; la: number;
};
// Back to front: bigger, sharper, denser-windowed and lower-based toward the
// front — that is the whole parallax.
const LAYERS: Record<'far' | 'mid' | 'near', Layer> = {
  far:  { w: [4, 9],  h: [24, 50], base: 15, top: '#0c1226', bot: '#070a18', wa: 0.50, ww: 1.4, gw: 2.6, wh: 1.4, gh: 3.0, op: 0.50, nf: '0.10 0.08',  crown: 0.22, signs: false, bands: false, blur: 1.1, la: 0.72 },
  mid:  { w: [6, 13], h: [32, 66], base: 9,  top: '#0a0e20', bot: '#04060f', wa: 0.62, ww: 1.8, gw: 3.2, wh: 1.8, gh: 3.6, op: 0.72, nf: '0.08 0.065', crown: 0.50, signs: true,  bands: true,  blur: 0.4, la: 1 },
  near: { w: [9, 20], h: [38, 80], base: 2,  top: '#070a16', bot: '#010208', wa: 0.72, ww: 2.2, gw: 4.0, wh: 2.2, gh: 4.6, op: 0.85, nf: '0.055 0.05', crown: 0.58, signs: true,  bands: true,  blur: 0,   la: 1 },
};

type City = { scrim: number; band?: number; seed: number; beams: number; rain: number; vehicles: number; figure: boolean; grain: boolean; dens: number };
const CITY: Record<SkyInput['preset'] | 'tile', City> = {
  rail:   { scrim: 0.50, seed: 9,  beams: 6, rain: 34, vehicles: 4, figure: true,  grain: true,  dens: 1 },
  header: { scrim: 0.66, seed: 41, beams: 4, rain: 20, vehicles: 3, figure: false, grain: true,  dens: 0.8 },
  card:   { scrim: 0.58, seed: 63, beams: 5, rain: 26, vehicles: 3, figure: true,  grain: true,  dens: 0.9 },
  friend: { scrim: 0.66, seed: 77, beams: 3, rain: 12, vehicles: 2, figure: false, grain: false, dens: 0.6 },
  // The shop tile: no band damping, full intensity — the shop window.
  tile:   { scrim: 0.24, band: 0, seed: 19, beams: 3, rain: 0, vehicles: 2, figure: false, grain: false, dens: 0.5 },
};

type Paint = ReturnType<typeof painter>;

// One building: body, the masked window grid, a rim light, and sometimes a
// crown, a vertical sign and a neon band.
function tower(L: Layer, x: number, w: number, hh: number, seed: number, r: () => number, R: (a: number, b: number) => number, p: Paint) {
  const A = p.A;
  const q = r(); const wc = q < 0.12 ? CY.amber : q < 0.56 ? CY.cyan : CY.dust;
  const rim = [CY.cyan, CY.magenta, CY.violet][(r() * 3) | 0];
  const side = r() < 0.5 ? 'left' : 'right';
  let h = I(`inset:0;background:linear-gradient(180deg, ${L.top}, ${L.bot});`);
  // The window grid: stripes, cut into rows by one mask and thinned out
  // irregularly by a turbulence field. Without that second mask every tower
  // reads as graph paper — the single most important trick in the scene.
  const stripes = `repeating-linear-gradient(90deg, ${rgba(wc, L.wa)} 0 ${L.ww}px, transparent ${L.ww}px ${f2(L.ww + L.gw)}px)`;
  const rows = `repeating-linear-gradient(180deg, #000 0 ${L.wh}px, transparent ${L.wh}px ${f2(L.wh + L.gh)}px)`;
  const noise = fractalHard(seed, L.nf);
  const ns = R(150, 260) | 0; const np = `${R(0, 100) | 0}% ${R(0, 100) | 0}%`;
  h += I(`left:9%;right:9%;top:${f2(R(5, 16))}%;bottom:0;background:${stripes};opacity:${f2(L.op * A)};mix-blend-mode:screen;`
    + `-webkit-mask-image:${rows}, ${noise};mask-image:${rows}, ${noise};-webkit-mask-composite:source-in;mask-composite:intersect;`
    + `-webkit-mask-repeat:repeat,no-repeat;mask-repeat:repeat,no-repeat;-webkit-mask-size:auto,${ns}% ${ns}%;mask-size:auto,${ns}% ${ns}%;`
    + `-webkit-mask-position:0 0,${np};mask-position:0 0,${np};`);
  h += I(`${side}:0;top:0;bottom:0;width:1px;background:linear-gradient(180deg, ${rgba(rim, 0.75)}, ${rgba(rim, 0.18)} 46%, transparent 78%);`);
  // Crowns stay dim on purpose: at full strength they punch through the
  // scrim and break text contrast in the list band.
  if (r() < L.crown) {
    const ca = rim === CY.cyan ? 0.4 : 0.58;
    h += I(`left:0;right:0;top:0;height:2px;background:${rgba(rim, ca)};box-shadow:0 0 5px ${rgba(rim, R(0.38, 0.5))};${p.an('neonPulse', R(5, 12), -R(0, 8), 'ease-in-out')}`);
  }
  if (L.signs && r() < 0.3) {
    const sc = [CY.magenta, CY.cyan, CY.amber, CY.violet][(r() * 4) | 0];
    h += I(`${side === 'left' ? 'right' : 'left'}:${f2(R(10, 30))}%;top:${f2(R(6, 30))}%;width:${f2(R(2.5, 5))}px;height:${f2(R(16, 46))}%;background:repeating-linear-gradient(180deg, ${sc} 0 3px, transparent 3px 7px);box-shadow:0 0 9px ${rgba(sc, 0.5)}, 0 0 20px ${rgba(sc, 0.26)};opacity:${f2(0.85 * A)};${p.an('flicker', R(6, 15), -R(0, 10))}`);
  }
  if (L.bands && r() < 0.28) {
    const bc = [CY.cyan, CY.magenta, CY.violet][(r() * 3) | 0];
    h += I(`left:-2%;right:-2%;top:${f2(R(18, 70))}%;height:2px;background:${rgba(bc, 0.7)};box-shadow:0 0 6px ${rgba(bc, 0.5)};${p.an('neonPulse', R(6, 12), -R(0, 8), 'ease-in-out')}`);
  }
  return I(`left:${f2(x)}%;bottom:${L.base}%;width:${f2(w)}%;height:${f2(hh)}%;overflow:hidden;${L.blur ? `filter:blur(${L.blur}px);` : ''}`, h);
}

// A skyline layer: walk x across the frame, overlapping towers irregularly.
// A lower density makes fewer, wider towers rather than gaps.
function skyline(key: keyof typeof LAYERS, seed: number, D: number, p: Paint, low: boolean) {
  const L = low && key === 'far' ? { ...LAYERS.far, blur: 0 } : LAYERS[key];
  const r = rnd(seed); const R = (a: number, b: number) => a + r() * (b - a);
  const k = 1 / Math.max(0.5, D);
  let h = ''; let x = -8; let i = 0;
  while (x < 106 && i < 60) {
    const w = R(L.w[0], L.w[1]) * k;
    h += tower(L, x, w, R(L.h[0], L.h[1]), seed * 3 + (i % 5), r, R, p);
    x += w * (0.66 + r() * 0.52); i++;
  }
  return I(`inset:0;opacity:${L.la};`, h);
}

function city(o: City, paper: string, motion: BundleMotion, low: boolean) {
  const p = painter(motion); const A = p.A; const on = motion !== 'off';
  const heavy = (name: string, dur: number, delay = 0, ease = 'linear') => (low ? '' : p.an(name, dur, delay, ease));
  const D = o.dens;
  const beams = low ? Math.ceil(o.beams / 2) : o.beams;
  const rain = low ? Math.round(o.rain / 2) : o.rain;
  const vehicles = low ? Math.min(2, o.vehicles) : o.vehicles;
  const r = rnd(o.seed); const R = (a: number, b: number) => a + r() * (b - a);
  let h = '';

  // 1 · sky — indigo at the zenith warming to violet-plum at the horizon
  h += I('inset:0;background:linear-gradient(178deg, #04050e 0%, #070a1a 24%, #100728 46%, #1c0935 66%, #2a0b3e 84%, #360f44 100%);');
  // 2–3 · horizon glows
  h += I(`left:-12%;bottom:2%;width:124%;height:58%;background:radial-gradient(58% 100% at 50% 100%, ${rgba(CY.cyan, 0.32 * A)} 0%, ${rgba(CY.violet, 0.22 * A)} 36%, transparent 78%);filter:blur(16px);mix-blend-mode:screen;`);
  h += I(`left:8%;bottom:6%;width:78%;height:36%;background:radial-gradient(50% 100% at 50% 100%, ${rgba(CY.magenta, 0.28 * A)} 0%, transparent 76%);filter:blur(20px);mix-blend-mode:screen;`);
  // 4 · haze bands
  ([[14, 82, 22, CY.violet, 0.2, 74, 0], [34, 96, 18, CY.cyan, 0.15, 92, 4], [56, 88, 16, CY.magenta, 0.12, 63, 8]] as const).forEach(([top, w, hh, c, a, dur, dl]) => {
    h += I(`left:${(100 - w) / 2}%;top:${top}%;width:${w}%;height:${hh}%;background:radial-gradient(50% 50% at 50% 50%, ${rgba(c, a * A)}, transparent 72%);filter:blur(15px);mix-blend-mode:screen;${heavy('hazeDrift', dur, dl, 'ease-in-out')}`);
  });
  // 5–6 · far and mid skylines
  h += skyline('far', o.seed * 10 + 1, D, p, low);
  h += skyline('mid', o.seed * 10 + 2, D, p, low);
  // 7 · the central spire, tapering to its beacon
  h += I('left:46%;bottom:11%;width:5.5%;height:62%;overflow:hidden;clip-path:polygon(30% 0,70% 0,100% 100%,0 100%);',
    I('inset:0;background:linear-gradient(180deg,#0b1330,#050818);')
    + I(`left:50%;top:0;bottom:0;width:1.5px;margin-left:-.75px;background:linear-gradient(180deg, ${rgba(CY.cyan, 0.55)}, ${rgba(CY.cyan, 0.3)} 50%, transparent);box-shadow:0 0 6px ${rgba(CY.cyan, 0.6)};`)
    + I(`left:24%;top:11%;width:3px;height:40%;background:repeating-linear-gradient(180deg, ${rgba(CY.amber, 0.6)} 0 4px, transparent 4px 9px);box-shadow:0 0 6px ${rgba(CY.amber, 0.5)};opacity:.62;${p.an('flicker', 11, 1)}`)
    + I(`left:50%;top:1px;width:4px;height:4px;margin-left:-2px;background:${rgba(CY.core, 0.8)};box-shadow:0 0 6px ${rgba(CY.cyan, 0.7)};${p.an('neonPulse', 3.4, 0, 'ease-in-out')}`));
  // 8 · spire glow
  h += I(`left:40%;bottom:6%;width:18%;height:54%;background:radial-gradient(50% 50% at 50% 60%, ${rgba(CY.cyan, 0.34 * A)}, transparent 72%);filter:blur(12px);mix-blend-mode:screen;`);
  // 9 · searchlights, widening upward and sweeping
  for (let i = 0; i < beams; i++) {
    const col = [CY.cyan, CY.magenta, CY.violet, CY.cyan][i % 4];
    const b0 = R(-20, -8); const b1 = R(4, 20);
    const move = on ? p.an('beamSweep', R(15, 31), -R(0, 15), 'ease-in-out') : `transform:rotate(${f2((b0 + b1) / 2)}deg);opacity:.6;`;
    h += I(`left:${f2(R(6, 92))}%;bottom:${f2(R(16, 38))}%;width:${f2(R(5, 16))}px;height:${f2(R(42, 88))}%;transform-origin:50% 100%;clip-path:polygon(0 0,100% 0,64% 100%,36% 100%);background:linear-gradient(180deg, transparent, ${rgba(col, 0.16 * A)} 34%, ${rgba(col, 0.42 * A)} 74%, ${rgba(col, 0.72 * A)} 100%);filter:blur(${f2(R(2.4, 5.4))}px);mix-blend-mode:screen;--b0:${f2(b0)}deg;--b1:${f2(b1)}deg;${move}`);
  }
  // 10 · near skyline
  h += skyline('near', o.seed * 10 + 3, D, p, low);
  // 11 · holographic billboards — struts, light spill, a scrolling ad reel
  ([[13, 29, 10.5, 7, CY.magenta, 8.5, 5], [73, 21, 8.5, 5.5, CY.cyan, 11, 7.4], [39, 49, 7.5, 5, CY.violet, 13.5, 9.8]] as const).forEach(([x, y, w, hh, col, fl, sc]) => {
    const panel = I(`left:0;right:0;top:0;height:200%;background:repeating-linear-gradient(180deg, ${rgba(col, 0.9)} 0 2px, transparent 2px 5px, ${rgba(col, 0.4)} 5px 6px, transparent 6px 11px);opacity:.5;${p.an('signScroll', sc)}`)
      + I(`left:12%;right:12%;top:30%;height:16%;background:${rgba(col, 0.7)};box-shadow:0 0 5px ${rgba(col, 0.6)};`)
      + I(`left:12%;right:34%;top:58%;height:11%;background:${rgba(col, 0.45)};`);
    h += I(`left:${x}%;bottom:${y}%;width:${w}%;height:${hh}%;opacity:${f2(Math.min(1, A + 0.1))};`,
      I(`left:50%;top:100%;width:1px;height:${f2((46 / hh) * 100)}%;background:#05060d;`)
      + I(`left:-60%;right:-60%;top:90%;height:190%;clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);background:linear-gradient(180deg, ${rgba(col, 0.26)}, transparent 78%);filter:blur(5px);mix-blend-mode:screen;`)
      + I(`inset:0;border:1px solid ${rgba(col, 0.7)};box-shadow:0 0 10px ${rgba(col, 0.4)}, inset 0 0 8px ${rgba(col, 0.26)};background:rgba(4,6,15,.7);overflow:hidden;${p.an('flicker', fl, 0)}`, panel));
  });
  // 12 · traffic rivers, alternating direction
  ([[26, CY.amber, 0.30, 34, 'trafficRun'], [46, CY.cyan, 0.38, 46, 'trafficRunRev'], [62, CY.magenta, 0.46, 58, 'trafficRun']] as const).forEach(([b, col, op, dur, name], i) => {
    h += I(`left:0;right:0;bottom:${b}%;height:1.4px;overflow:hidden;opacity:${f2(op * A)};filter:blur(.5px) drop-shadow(0 0 2px ${col});mix-blend-mode:screen;`,
      I(`left:0;top:0;width:200%;height:100%;background:repeating-linear-gradient(90deg, ${col} 0 ${2 + i}px, transparent ${2 + i}px ${18 + i * 9}px);${p.an(name, dur)}`));
  });
  // 13 · flickering windows
  for (let i = 0; i < Math.round(16 * D); i++) {
    const s = R(1.6, 3.8); const col = r() < 0.22 ? CY.amber : r() < 0.5 ? CY.cyan : CY.dust;
    h += I(`left:${f2(R(3, 97))}%;bottom:${f2(R(14, 62))}%;width:${f2(s)}px;height:${f2(s)}px;background:${col};box-shadow:0 0 ${f2(2 * s)}px ${rgba(col, 0.7)};opacity:.55;${p.an('flicker', R(5, 16), -R(0, 12))}`);
  }
  if (on) {
    // 14 · elevators climbing their shafts
    ([[22, 34, 86, 7.5, 0], [68, 28, 72, 10, 3.4]] as const).forEach(([x, y, rise, dur, dl]) => {
      h += I(`left:${x}%;bottom:${y}%;width:1.6px;height:1.6px;background:${CY.core};box-shadow:0 0 4px ${CY.cyan};--ev:-${rise}px;opacity:0;${p.an('elevator', dur, dl)}`);
    });
    // 15 · an airship with a scrolling sign and a nav light
    if (vehicles) {
      h += I('left:0;bottom:74%;width:0;height:0;',
        I(`left:0;top:0;width:26px;height:7px;border-radius:50%;background:linear-gradient(90deg,#0a0d1c,#131a34 60%,#0a0d1c);box-shadow:0 0 10px ${rgba(CY.violet, 0.5)};--fx0:-60px;--fx1:900px;opacity:0;${p.an('flyBy', 96, 5)}`,
          I('left:5px;right:5px;top:2.5px;height:2px;overflow:hidden;', I(`left:0;top:0;width:200%;height:100%;background:repeating-linear-gradient(90deg, ${CY.magenta} 0 3px, transparent 3px 5px);${p.an('trafficRun', 3)}`))
          + I(`right:-1px;top:2.5px;width:2px;height:2px;background:#ff3b3b;${p.an('navBlink', 2.2, 0)}`)));
    }
    // 16 · aircraft, alternating direction, each with a blinking nose light
    for (let i = 0; i < vehicles; i++) {
      const dir = i % 2 ? -1 : 1; const len = R(9, 22); const col = [CY.cyan, CY.magenta, CY.amber][i % 3];
      const trail = `linear-gradient(${dir > 0 ? 90 : 270}deg, transparent, ${rgba(col, 0.5)} 62%, ${col})`;
      h += I(`left:${dir > 0 ? 0 : 100}%;bottom:${f2(R(22, 68))}%;width:0;height:0;`,
        I(`left:${dir > 0 ? f2(-len) : 0}px;top:0;width:${f2(len)}px;height:1px;background:${trail};box-shadow:0 0 6px ${rgba(col, 0.6)};--fx0:${dir * -40}px;--fx1:${dir * 760}px;opacity:0;${p.an('flyBy', R(26, 52), R(0, 20))}`,
          I(`${dir > 0 ? 'right' : 'left'}:-2px;top:-.5px;width:2px;height:2px;background:${CY.core};${p.an('navBlink', R(1.4, 2.4), 0)}`)));
    }
    // 17 · rain
    for (let i = 0; i < rain; i++) {
      h += I(`left:${f2(R(-4, 100))}%;top:${f2(R(-10, 88))}%;width:1px;height:${f2(R(9, 21))}px;transform:rotate(9deg);`,
        I(`inset:0;background:linear-gradient(180deg, transparent, ${rgba(CY.dust, 0.5)});opacity:0;${p.an('rainFall', R(1.5, 2.9), -R(0, 3))}`));
    }
  }
  // 18 · the rooftop — the near silhouette that sells the vantage point
  if (o.figure) {
    let rf = I(`left:0;right:0;bottom:0;height:15%;background:linear-gradient(180deg,#05060d,#010104);box-shadow:0 -1px 0 ${rgba(CY.cyan, 0.32)}, 0 -12px 26px rgba(0,0,0,.6);`);
    rf += I(`left:0;right:0;bottom:15%;height:1px;background:linear-gradient(90deg, transparent, ${rgba(CY.cyan, 0.5)} 34%, ${rgba(CY.magenta, 0.4)} 70%, transparent);`);
    rf += I(`left:0;right:0;bottom:11.5%;height:4.5%;background:linear-gradient(90deg, ${rgba(CY.cyan, 0.4 * A)}, ${rgba(CY.magenta, 0.22 * A)} 46%, transparent);filter:blur(4px);mix-blend-mode:screen;${p.an('shimmer', 9, 0, 'ease-in-out')}`);
    // The roof arc: the one curve in the whole design — structure, not a rounded corner.
    rf += I(`left:56%;right:6%;bottom:15.5%;height:7%;border-top:1.5px solid ${rgba(CY.cyan, 0.75)};border-left:1.5px solid ${rgba(CY.cyan, 0.75)};border-top-right-radius:40% 90%;box-shadow:0 0 12px ${rgba(CY.cyan, 0.28)};`);
    [10, 18, 26, 34].forEach((x) => { rf += I(`left:${x}%;bottom:15%;width:1px;height:5%;background:#0b0e1c;box-shadow:0 0 2px ${rgba(CY.cyan, 0.25)};`); });
    rf += I(`left:10%;bottom:20%;width:24%;height:1px;background:${rgba(CY.cyan, 0.18)};`);
    rf += I('left:9%;bottom:15%;width:1.5px;height:16%;background:#06070f;');
    rf += I(`left:7.4%;bottom:31%;width:6px;height:6px;border-radius:50%;background:radial-gradient(circle, ${rgba(CY.core, 0.85)}, ${rgba(CY.amber, 0.7)} 46%, transparent 74%);box-shadow:0 0 8px ${rgba(CY.amber, 0.55)};${p.an('flicker', 13, 2)}`);
    rf += I('left:46%;bottom:15.4%;width:4px;height:11px;',
      I('left:.7px;top:0;width:2.6px;height:2.6px;border-radius:50%;background:#010104;')
      + I('left:0;top:2.4px;width:4px;height:5.4px;background:#010104;')
      + I('left:.3px;top:7.4px;width:1.1px;height:3.6px;background:#010104;')
      + I('left:2.6px;top:7.4px;width:1.1px;height:3.6px;background:#010104;')
      + I(`right:-.4px;top:.6px;width:.8px;height:8px;background:linear-gradient(180deg, ${rgba(CY.cyan, 0.9)}, transparent);`));
    if (on) {
      for (let i = 0; i < 10; i++) {
        rf += I(`left:${f2(R(4, 96))}%;bottom:${f2(R(4, 14.4))}%;width:1.6px;height:1px;background:${CY.cyan};opacity:0;${p.an('navBlink', R(0.9, 2.3), -R(0, 2))}`);
      }
    }
    h += I('inset:0;', rf);
  }
  // 19 · street fog
  ([[8, CY.violet, 0.30, 58, 0], [17, CY.cyan, 0.22, 79, 6]] as const).forEach(([b, c, a, dur, dl]) => {
    h += I(`left:-10%;right:-10%;bottom:${b}%;height:14%;background:radial-gradient(50% 50% at 50% 50%, ${rgba(c, a * A)}, transparent 72%);filter:blur(11px);mix-blend-mode:screen;opacity:.65;${heavy('fogBreathe', dur, dl, 'ease-in-out')}`);
  });
  // 20 · steam plumes
  if (on && !low) {
    ([[30, 15, 5.5, 9, 0], [58, 19, 4.5, 12, 3.2], [82, 13, 6, 14.5, 6.4]] as const).forEach(([x, b, w, dur, dl]) => {
      h += I(`left:${x}%;bottom:${b}%;width:${w}%;height:18%;background:radial-gradient(closest-side at 50% 90%, ${rgba(CY.dust, 0.26)}, ${rgba(CY.violet, 0.14)} 46%, transparent 78%);filter:blur(6px);opacity:0;${p.an('steamRise', dur, dl, 'ease-out')}`);
    });
  }
  // 21 · ambient washes — the scene's dominant hue drifts between them
  h += I(`inset:0;background:radial-gradient(60% 50% at 26% 62%, ${rgba(CY.cyan, 0.16 * A)}, transparent 70%);mix-blend-mode:screen;`);
  h += I(`inset:0;background:radial-gradient(56% 46% at 74% 48%, ${rgba(CY.magenta, 0.2 * A)}, transparent 70%);mix-blend-mode:screen;opacity:.6;${p.an('ambientCycle', 23, 0, 'ease-in-out')}`);
  h += I(`inset:0;background:radial-gradient(54% 44% at 34% 30%, ${rgba(CY.violet, 0.18 * A)}, transparent 70%);mix-blend-mode:screen;opacity:.6;${p.an('ambientCycle', 31, 9, 'ease-in-out')}`);
  // 22 · CRT scanlines · 23 · vignette
  h += I('inset:0;background:repeating-linear-gradient(180deg, rgba(0,0,0,.26) 0 1px, transparent 1px 3px);opacity:.42;');
  h += I('inset:0;background:radial-gradient(118% 92% at 50% 44%, transparent 0 48%, rgba(1,2,10,.72) 100%);');
  // 24 · the shaped scrim: stepped, not linear — the skyline stays vivid up
  //      top while the list band behind text is heavily damped
  const s0 = o.scrim; const s1 = Math.min(0.84, s0 + (o.band ?? 0.22));
  h += I(`inset:0;background:linear-gradient(180deg, ${rgba(paper, s0 * 0.78)} 0%, ${rgba(paper, s0 * 0.92)} 15%, ${rgba(paper, s1)} 29%, ${rgba(paper, s1)} 88%, ${rgba(paper, Math.min(0.9, s1 + 0.04))} 100%);`);
  // 25 · film grain · 26 · top hairline
  if (o.grain) {
    const grain = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='180' height='180' filter='url(#g)'/></svg>")}")`;
    h += I(`inset:0;background-image:${grain};background-size:180px 180px;opacity:.06;mix-blend-mode:screen;`);
  }
  h += I(`left:0;right:0;top:0;height:2px;background:linear-gradient(90deg, transparent, ${CY.cyan} 22%, ${CY.magenta} 54%, ${rgba(CY.violet, 0.85)} 78%, transparent);`);
  return h;
}

/** The city behind a rail, account header, share card or friend card. */
export function citySkyHtml(input: SkyInput): string {
  const base = CITY[input.preset];
  const o = input.seed === undefined ? base : { ...base, seed: input.seed };
  return city(o, input.paper, input.motion, input.lowPerf);
}

/** The Settings → Bundles tile: the city at full intensity. */
export function cityTileHtml(paper: string, motion: BundleMotion): string {
  return city(CITY.tile, paper, motion, false);
}

// ============================================================
//  The avatar HUD — and nothing rotates
// ============================================================
const tierOf = (size: number): Tier => (size <= 28 ? 'ring' : size <= 56 ? 'simple' : 'full');

// Life comes from a radial equalizer, sonar pings, stutter-flashing arcs and
// lock-on brackets: it reads as live signal, not a spinning gear. The HUD is
// drawn 1.46× the avatar but inside the same 1.25× canvas every bundle
// reserves, so switching bundles never moves the layout — the outer ring and
// the brackets are ink overflow (BundleAvatar's `contain: layout`).
export function hudDecorationHtml(size: number, motion: BundleMotion, lowPerf: boolean, seed = size): Decoration {
  const tier = tierOf(size); const D = size * 1.25; const off = (D - size) / 2;
  const H = size * 1.46; const ho = (D - H) / 2; const hoff = (H - size) / 2; const cx = H / 2;
  const p = painter(motion); const on = motion !== 'off';
  const r = rnd(seed * 7 + 3); const R = (a: number, b: number) => a + r() * (b - a);
  const wrap = (inner: string) => I(`left:${f2(ho)}px;top:${f2(ho)}px;width:${f2(H)}px;height:${f2(H)}px;`, inner);
  let back = ''; let front = '';
  const rim = I(`left:${f2(hoff)}px;top:${f2(hoff)}px;width:${size}px;height:${size}px;border-radius:50%;box-shadow:0 0 0 ${f2(Math.max(1.4, size * 0.024))}px ${CY.cyan}, 0 0 ${f2(size * 0.3)}px ${rgba(CY.cyan, 0.65)}, inset 0 0 ${f2(size * 0.22)}px ${rgba(CY.magenta, 0.34)};`);

  if (tier === 'ring') return { D, off, tier, back, front: wrap(rim) };

  // Underglow, behind the photo.
  back += I(`left:${f2(cx - size * 0.55)}px;top:${f2(hoff + size * 0.9)}px;width:${f2(size * 1.1)}px;height:${f2(size * 0.2)}px;border-radius:50%;background:radial-gradient(closest-side, ${rgba(CY.cyan, 0.55)}, transparent);filter:blur(3px);`);
  front += rim;
  // Chromatic split: a magenta ring offset a pixel, jittering.
  front += I(`left:${f2(hoff + 1)}px;top:${f2(hoff - 1)}px;width:${size}px;height:${size}px;border-radius:50%;box-shadow:0 0 0 1px ${CY.magenta};opacity:.75;${p.an('glitchShift', 7, -R(0, 7))}`);
  // The radial equalizer — the signature.
  const n = Math.max(12, Math.min(lowPerf ? 18 : 30, Math.round(size / 3.8)));
  const rad = size / 2 + Math.max(2, size * 0.055);
  const bw = Math.max(1, size * 0.019); const bh = Math.max(2.6, size * 0.062);
  for (let i = 0; i < n; i++) {
    const q = r(); const col = q < 0.22 ? CY.magenta : q < 0.7 ? CY.cyan : CY.soft;
    front += I(`left:${f2(cx)}px;top:${f2(cx)}px;width:0;height:0;transform:rotate(${f2((360 / n) * i)}deg);`,
      I(`left:${f2(-bw / 2)}px;top:${f2(-(rad + bh))}px;width:${f2(bw)}px;height:${f2(bh)}px;transform-origin:50% 100%;background:${col};box-shadow:0 0 ${f2(2.6 * bw)}px ${col};${on ? p.an('eqBar', R(0.9, 2.4), -R(0, 1.8), 'ease-in-out') : `transform:scaleY(${f2(R(0.5, 1.2))});`}`));
  }
  // Two sonar pings.
  [CY.cyan, CY.magenta].forEach((col, i) => {
    const s = size * 1.12;
    front += I(`left:${f2(cx - s / 2)}px;top:${f2(cx - s / 2)}px;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;border:1px solid ${rgba(col, 0.75)};opacity:${on ? 0 : 0.35};${p.an('ping', 5.2, -i * 2.6, 'ease-out')}`);
  });
  // Three electric arcs at fixed angles, stutter-flashing.
  ([[18, CY.cyan, 6.5, 0], [142, CY.magenta, 8.9, 1.7], [254, CY.cyan, 11.3, 3.4]] as const).forEach(([ang, col, dur, dl]) => {
    const s = size * 1.18;
    front += I(`left:${f2(cx - s / 2)}px;top:${f2(cx - s / 2)}px;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;border:1.5px solid transparent;border-top-color:${col};border-bottom:0;transform:rotate(${ang}deg);filter:drop-shadow(0 0 5px ${col});opacity:${on ? 0 : 0.6};${p.an('arcBlink', dur, dl)}`);
  });
  // Four lock-on corner brackets.
  const bs = Math.max(5, size * 0.17);
  ([['left', 'top', CY.cyan], ['right', 'top', CY.magenta], ['left', 'bottom', CY.magenta], ['right', 'bottom', CY.cyan]] as const).forEach(([hx, vy, col], i) => {
    front += I(`${hx}:0;${vy}:0;width:${f2(bs)}px;height:${f2(bs)}px;border-${hx}:1.5px solid ${col};border-${vy}:1.5px solid ${col};filter:drop-shadow(0 0 4px ${col});${p.an('lockOn', R(4.2, 6.3), -i * 1.1, 'ease-in-out')}`);
  });

  if (tier === 'full') {
    // Clipped to the face: a scanline sweep and a glitch bar. Both only move,
    // so with motion off there is nothing to draw.
    if (on) {
      const face = I(`left:0;right:0;top:0;height:${f2(size * 0.2)}px;${p.an('scanDown', 4.4, -R(0, 4.4))}`,
        I(`left:0;right:0;top:50%;height:2px;margin-top:-1px;background:linear-gradient(90deg, transparent, ${CY.cyan} 32%, #fff 50%, ${CY.cyan} 68%, transparent);box-shadow:0 0 10px ${CY.cyan};`))
        + I(`left:0;right:0;top:${f2(R(30, 60))}%;height:${f2(Math.max(2, size * 0.05))}px;background:${rgba(CY.magenta, 0.55)};opacity:0;${p.an('glitchBar', 6.5, 1.4)}`);
      front += I(`left:${f2(hoff)}px;top:${f2(hoff)}px;width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;`, face);
    }
    // Four corner sparks, out between the rim and the brackets.
    for (let i = 0; i < 4; i++) {
      const a = ((i * 90 + R(30, 60)) * Math.PI) / 180; const rr = R(0.56, 0.64) * H * 0.72; const s = R(1.4, 3);
      const col = i % 2 ? CY.magenta : CY.cyan;
      front += I(`left:${f2(cx + Math.cos(a) * rr - s / 2)}px;top:${f2(cx + Math.sin(a) * rr - s / 2)}px;width:${f2(s)}px;height:${f2(s)}px;background:${col};box-shadow:0 0 ${f2(3 * s)}px ${col};${p.an('twinkle', R(3.4, 6.7), -R(0, 5), 'ease-in-out')}`);
    }
  }
  return { D, off, tier, back: wrap(back), front: wrap(front) };
}

// ============================================================
//  Intro — "system boot"
// ============================================================
// Same overlay and timing as Galaxy's (IntroAnimation). `still` renders the
// composed end frame; `low` drops the data columns.
export function bootIntroHtml(still: boolean, tagline: string, low: boolean): string {
  const r = rnd(77); const R = (a: number, b: number) => a + r() * (b - a);
  const E = 'cubic-bezier(.16,1,.3,1)';
  const A1 = (n: string, dur: number, dl: number, ease = E) => (still ? '' : `animation:bx-${n} ${f2(dur)}s ${ease} ${f2(dl)}s both;`);
  const L1 = (n: string, dur: number, dl: number) => (still ? '' : `animation:bx-${n} ${f2(dur)}s linear ${f2(dl)}s infinite both;`);
  let h = '';
  if (!still) {
    // 0.10s — a perspective grid rushing toward the horizon
    h += I('left:-30%;right:-30%;top:46%;height:60%;overflow:hidden;-webkit-mask-image:linear-gradient(180deg,transparent,#000 46%);mask-image:linear-gradient(180deg,transparent,#000 46%);',
      I('left:0;right:0;top:0;height:240px;overflow:hidden;transform-origin:50% 0;transform:perspective(260px) rotateX(74deg);',
        I(`left:0;right:0;top:0;height:340px;background:repeating-linear-gradient(90deg, ${rgba(CY.cyan, 0.5)} 0 1px, transparent 1px 34px), repeating-linear-gradient(180deg, ${rgba(CY.cyan, 0.45)} 0 1px, transparent 1px 26px);opacity:0;${A1('gridRush', 2.4, 0.1, 'ease-out')}`)));
    // 0.12s — bloom
    h += I(`left:50%;top:46%;width:320px;height:320px;margin:-160px 0 0 -160px;border-radius:50%;background:radial-gradient(circle, ${rgba(CY.cyan, 0.3)} 0%, ${rgba(CY.magenta, 0.18)} 32%, transparent 70%);opacity:0;${A1('haloBloom', 1.7, 0.12)}`);
    // 0.2–1.7s — data columns down both gutters
    for (let i = 0; i < (low ? 8 : 16); i++) {
      const x = i % 2 ? R(2, 24) : R(76, 98); const col = r() < 0.5 ? CY.cyan : CY.magenta;
      h += I(`left:${f2(x)}%;top:${f2(R(0, 30))}%;width:1px;height:${f2(R(22, 66))}%;overflow:hidden;`,
        I(`inset:0;background:repeating-linear-gradient(180deg, ${rgba(col, 0.75)} 0 3px, transparent 3px 8px);opacity:0;${L1('dataFall', R(1.5, 3.1), R(0.2, 1.7))}`));
    }
    // 0 / 0.16 / 0.34s — three boot scans
    ([[CY.cyan, 0, 1.5], [CY.magenta, 0.16, 1.7], [CY.cyan, 0.34, 1.9]] as const).forEach(([col, dl, dur]) => {
      h += I(`left:0;right:0;top:0;height:2px;background:linear-gradient(90deg, transparent, ${col} 28%, #fff 50%, ${col} 72%, transparent);box-shadow:0 0 12px ${col};opacity:0;${A1('bootScan', dur, dl, 'cubic-bezier(.4,0,.2,1)')}`);
    });
  }
  // 0.50–0.74s — HUD brackets lock on
  ([['left', 'top', -14, -14], ['right', 'top', 14, -14], ['left', 'bottom', -14, 14], ['right', 'bottom', 14, 14]] as const).forEach(([hx, vy, kx, ky], i) => {
    h += I(`${hx}:9%;${vy}:6%;width:30px;height:30px;border-${hx}:2px solid ${CY.cyan};border-${vy}:2px solid ${CY.cyan};filter:drop-shadow(0 0 6px ${CY.cyan});--kx:${kx}px;--ky:${ky}px;${still ? '' : 'opacity:0;'}${A1('bracketIn', 0.7, 0.5 + i * 0.08)}`);
  });
  // 0.60s + i×0.055s — the wordmark glitches in, character by character
  const letters = 'Mah Notes'.split('').map((ch, i) => `<span class="bintro-l" style="${escAttr(A1('glitchIn', 0.72, 0.6 + i * 0.055, 'cubic-bezier(.2,.8,.2,1)'))}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  const glint = still ? '' : `<span class="bintro-glint" aria-hidden="true" style="${escAttr(A1('glint', 0.95, 1.8, 'cubic-bezier(.45,.05,.3,1)'))}">Mah&nbsp;Notes</span>`;
  return `<div class="bintro-stage">
    ${h}
    ${logoMarkHtml(A1('markPop', 0.82, 0.34), A1('logoGlint', 0.8, 1.2, 'cubic-bezier(.45,.05,.3,1)'), [CY.soft, CY.cyan])}
    <div class="bintro-word"><span class="bintro-w">${letters}${glint}</span></div>
    <div class="bintro-tag"><span style="${escAttr(A1('tagWipe', 0.9, 1.3))}">${tagline.replace(/\.$/, '')}</span></div>
    <div class="bintro-skip"><span style="${escAttr(A1('tagWipe', 0.6, 2, 'ease'))}">Tap to skip</span></div>
  </div>${I('inset:0;pointer-events:none;background:repeating-linear-gradient(180deg, rgba(0,0,0,.26) 0 1px, transparent 1px 3px);opacity:.4;')}`;
}

// ============================================================
//  Click effect — "data shatter"
// ============================================================
/** The markup of one data shatter at the origin of its container. */
export function dataShatterHtml(seed: number): string {
  const r = rnd(seed); const R = (a: number, b: number) => a + r() * (b - a);
  const E = 'cubic-bezier(.16,1,.3,1)';
  let h = I(`left:-30px;top:-30px;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle, ${rgba(CY.cyan, 0.45)} 0%, ${rgba(CY.magenta, 0.24)} 38%, transparent 70%);animation:bx-haloBloom .7s ${E} both;`);
  // Nine shards, each pointed along its own line of flight.
  for (let i = 0; i < 9; i++) {
    const col = i % 3 === 2 ? CY.magenta : i % 2 ? CY.soft : CY.cyan;
    const deg = i * 40 + R(-26, 26); const len = R(6, 20);
    h += I(`left:0;top:0;width:0;height:0;transform:rotate(${f2(deg)}deg);`,
      I(`left:0;top:-.7px;width:${f2(len)}px;height:1.4px;transform-origin:0 50%;background:linear-gradient(90deg, ${col}, transparent);box-shadow:0 0 6px ${rgba(col, 0.8)};--sx:${f2(R(26, 74))}px;--sy:0px;animation:bx-shardOut ${f2(R(0.42, 0.62))}s cubic-bezier(.12,.8,.24,1) both;`));
  }
  h += I(`left:-17px;top:-17px;width:34px;height:34px;clip-path:polygon(50% 0,93% 25%,93% 75%,50% 100%,7% 75%,7% 25%);background:linear-gradient(140deg, ${rgba(CY.cyan, 0.85)}, ${rgba(CY.magenta, 0.7)});animation:bx-hexPop .62s ${E} both;`);
  h += I(`left:-22px;top:-22px;width:44px;height:44px;border-radius:50%;border:1.5px solid ${rgba(CY.cyan, 0.9)};animation:bx-shockRing .58s ${E} .12s both;`);
  h += I(`left:-28px;top:-.55px;width:56px;height:1.1px;background:linear-gradient(90deg, transparent, ${CY.cyan} 50%, transparent);animation:bx-flareSpikeX .56s ${E} .16s both;`);
  h += I(`left:-.55px;top:-28px;width:1.1px;height:56px;background:linear-gradient(180deg, transparent, ${CY.magenta} 50%, transparent);animation:bx-flareSpikeY .56s ${E} .16s both;`);
  // A square core flash — the system's zero-radius rule holds even here.
  h += I(`left:-4px;top:-4px;width:8px;height:8px;background:#fff;box-shadow:0 0 12px #fff, 0 0 30px ${CY.cyan};animation:bx-flareCore .6s ${E} .14s both;`);
  return h;
}

// ============================================================
//  Farewells — pixels on delete, a CRT switching off on sign-out
// ============================================================
/** Delete dust is square: pixels, not stardust. */
export const PIXEL_COLOURS = [CY.cyan, CY.magenta, CY.soft, CY.core, CY.violet];

/** Signing out: the screen switches off like an old CRT — the picture
    squashes to a bright line, the line to a point, the point flashes out. */
export function shutdownHtml(): string {
  const E = 'cubic-bezier(.55,0,.75,.35)';
  return `<div class="bintro-stage">
    ${I(`left:-40%;right:-40%;top:-30%;bottom:-30%;background:linear-gradient(180deg, ${rgba(CY.void, 0)} 0%, ${rgba(CY.cyan, 0.16)} 38%, rgba(255,255,255,.9) 50%, ${rgba(CY.magenta, 0.16)} 62%, ${rgba(CY.void, 0)} 100%), repeating-linear-gradient(180deg, rgba(0,0,0,.3) 0 1px, transparent 1px 3px);box-shadow:0 0 40px ${rgba(CY.cyan, 0.5)};transform-origin:50% 46%;animation:bx-crtOff .9s ${E} both;`)}
    ${I(`left:0;right:0;top:calc(46% - 1px);height:2px;background:linear-gradient(90deg, transparent, ${CY.magenta} 30%, #fff 50%, ${CY.cyan} 70%, transparent);opacity:0;animation:bx-glitchBar .9s linear .1s both;`)}
    ${logoMarkHtml('animation:bx-markOut 1s cubic-bezier(.5,0,.75,0) both;', '', [CY.soft, CY.cyan])}
    <div class="bintro-tag" style="top:calc(46% + 58px)"><span style="animation:bx-wordOut 1s ease both;">Signing you out</span></div>
    ${I(`left:50%;top:46%;width:8px;height:8px;margin:-4px 0 0 -4px;background:#fff;box-shadow:0 0 18px #fff, 0 0 46px ${rgba(CY.cyan, 0.85)}, 0 0 90px ${rgba(CY.magenta, 0.6)};opacity:0;animation:bx-flareCore .6s cubic-bezier(.16,1,.3,1) .9s both;`)}
  </div>${I('inset:0;pointer-events:none;background:repeating-linear-gradient(180deg, rgba(0,0,0,.26) 0 1px, transparent 1px 3px);opacity:.4;')}`;
}
