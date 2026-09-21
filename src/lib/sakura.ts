// ============================================================
//  Sakura Lake — the paint for the bundle's layers.
//
//  Late afternoon at a still lake. Half a cherry tree leans in from the
//  left, its canopy heavy with blossom; the far shore is a low violet
//  ridge; the water runs blue at the horizon and warms to peach toward you.
//  Petals fall the whole time. Warm, quiet, unhurried — and the opposite of
//  Galaxy and Cyberpunk in one respect: light here is REFLECTED, never
//  emitted. No glow, no neon, no flash.
//
//  Same contract as galaxy.ts: HTML strings of absolutely-positioned <i>s
//  (plus two small SVGs for wood), animated only by `bx-` keyframes in
//  styles/bundles.css, from a seeded LCG. Motion "off" keeps a composed
//  poster frame; low-perf (Android) halves the counts, stills the blurred
//  layers and the blossoms' bob. No image, texture or sprite anywhere.
//
//  The water moves without lines: soft swells drifting, ripples swaying,
//  sun glitter along the light's path and rings spreading where petals
//  land. (Repeating stripe bands sliding sideways read as parallel lines
//  moving across the rail, so there are none.)
// ============================================================
import type { BundleMotion } from './bundles';
import { painter, rgba, rnd, logoMarkHtml, type Decoration, type SkyInput, type Tier } from './galaxy';

export const SK = {
  accent: '#ff8fb8', soft: '#ffc2d8', berry: '#ff6fa5', ruby: '#d94f86', dust: '#ffe4f0', cream: '#fff4e6',
  butter: '#ffe08a', sky: '#bfe4ff', haze: '#c9a4ff', core: '#fff6fa', void: '#2a1430', deep: '#1c0d22',
};
const HZ = 56; // the lake fills the bottom 56% of a panel
const PETAL = 'border-radius:62% 38% 58% 42% / 48% 62% 38% 52%;';
const STAR4 = 'clip-path:polygon(50% 0,60% 40%,100% 50%,60% 60%,50% 100%,40% 60%,0 50%,40% 40%);';

const f2 = (n: number) => (+n).toFixed(2);
const escAttr = (s: string) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const I = (css: string, inner = '') => `<i style="${escAttr(css)}">${inner}</i>`;
type Paint = ReturnType<typeof painter>;
let svgSeq = 0;

function mixHex(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const petalFill = (q: number) => (q < 0.28 ? `linear-gradient(140deg, #fff, ${SK.soft})`
  : q < 0.62 ? `linear-gradient(140deg, #fff, ${SK.accent})` : `linear-gradient(140deg, ${SK.soft}, ${SK.berry})`);

// ── A blossom: five petals round a butter centre ─────────
// (cx, cy) in `unit`; s = the cluster's diameter in px. `bob` false keeps it still.
function blossom(cx: string | number, cy: string | number, s: number, r: () => number, p: Paint, bob: boolean, unit = '%') {
  const R = (a: number, b: number) => a + r() * (b - a);
  const pr = s * 0.34; const pw = s * 0.52; const ph = s * 0.56; const rot0 = R(0, 72);
  let petals = '';
  for (let i = 0; i < 5; i++) {
    const ang = rot0 + i * 72; const a = (ang * Math.PI) / 180;
    const fill = r() < 0.6
      ? `radial-gradient(circle at 38% 34%, #fff4f8, ${SK.soft} 48%, ${SK.accent} 100%)`
      : `radial-gradient(circle at 38% 34%, #ffe4ee, ${SK.accent} 54%, ${SK.berry} 100%)`;
    petals += I(`left:${f2(s / 2 + Math.cos(a) * pr - pw / 2)}px;top:${f2(s / 2 + Math.sin(a) * pr - ph / 2)}px;width:${f2(pw)}px;height:${f2(ph)}px;${PETAL}transform:rotate(${f2(ang + 90)}deg);background:${fill};box-shadow:0 1px 2px rgba(156,67,97,.22);`);
  }
  petals += I(`left:${f2(s * 0.4)}px;top:${f2(s * 0.4)}px;width:${f2(s * 0.2)}px;height:${f2(s * 0.2)}px;border-radius:50%;background:rgba(255,217,138,.95);`);
  const rr = R(-5, 5);
  const move = bob && p.motion !== 'off'
    ? `--dy:${f2(-R(2, 5))}px;--r:${f2(rr)}deg;--r2:${f2(-rr)}deg;${p.an('bob', R(3.4, 6.8), -R(0, 6.8), 'ease-in-out')}`
    : `transform:rotate(${f2(rr)}deg);`;
  return I(`left:${cx}${unit};top:${cy}${unit};width:${f2(s)}px;height:${f2(s)}px;margin:${f2(-s / 2)}px 0 0 ${f2(-s / 2)}px;${move}`, petals);
}

// ── The tree ─────────────────────────────────────────────
type Pt = { x: number; y: number };
// A ribbon round a spine, tapering w0 → w1: the left edge forward, the right edge back.
function trunkPath(pts: Pt[], w0: number, w1: number) {
  const n = pts.length; const L: string[] = []; const Rt: string[] = [];
  for (let i = 0; i < n; i++) {
    const q = pts[i]; const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(n - 1, i + 1)];
    const tx = b.x - a.x; const ty = b.y - a.y; const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len; const ny = tx / len; const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    L.push(`${f2(q.x + nx * w)} ${f2(q.y + ny * w)}`);
    Rt.push(`${f2(q.x - nx * w)} ${f2(q.y - ny * w)}`);
  }
  return `M${L.join(' L')} L${Rt.reverse().join(' L')} Z`;
}
type Grow = { segs: { x1: number; y1: number; x2: number; y2: number; w: number }[]; tips: Pt[] };
// A limb, recursing: two children (three near the tips, sometimes), shorter and thinner each time.
function limb(x: number, y: number, len: number, ang: number, w: number, depth: number, r: () => number, out: Grow) {
  const a = (ang * Math.PI) / 180; const x2 = x + Math.cos(a) * len; const y2 = y + Math.sin(a) * len;
  out.segs.push({ x1: x, y1: y, x2, y2, w });
  if (depth <= 0 || len < 3.2) { out.tips.push({ x: x2, y: y2 }); return; }
  const kids = depth <= 2 && r() < 0.38 ? 3 : 2;
  for (let k = 0; k < kids; k++) {
    const side = kids === 2 ? (k ? 1 : -1) : k - 1;
    const spread = side === 0 ? (r() * 2 - 1) * 12 : side * (20 + r() * 18);
    limb(x2, y2, len * (0.6 + r() * 0.2), ang + spread + (r() * 2 - 1) * 10, w * 0.6, depth - 1, r, out);
  }
}
const BARK = (w: number) => (w > 2.2 ? '#33191f' : w > 1.2 ? '#472730' : '#5e3840');

type TreeOpt = { spine?: Pt[]; limbs?: number[][]; w0?: number; w1?: number; mount?: string; scatter?: number };
// All geometry in the 0–100 viewBox; the blossoms are px-sized DOM on top.
// No drop-shadow on this container: at this size it stalls rasterisation.
function treeHtml(seed: number, D: number, p: Paint, low: boolean, opt: TreeOpt = {}) {
  const r = rnd(seed); const R = (a: number, b: number) => a + r() * (b - a);
  const spine = opt.spine || [{ x: 6, y: 112 }, { x: 10, y: 96 }, { x: 15, y: 82 }, { x: 19, y: 70 }, { x: 23, y: 60 }, { x: 26, y: 52 }];
  const limbs = opt.limbs || [[13, 86, 19, -142, 2.6, 4], [17, 75, 24, -36, 3.0, 5], [21, 65, 21, -96, 2.6, 4], [24, 57, 27, -22, 2.8, 5], [26, 52, 25, -64, 3.0, 5], [26, 52, 20, -8, 2.2, 4]];
  const out: Grow = { segs: [], tips: [] };
  limbs.forEach(([x, y, len, ang, w, dep]) => limb(x, y, len, ang, w, dep, r, out));
  const gid = `sk-bark-${++svgSeq}`;
  let svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2b151b"/><stop offset=".52" stop-color="#44242c"/><stop offset="1" stop-color="#60383f"/></linearGradient></defs>`;
  out.segs.sort((a, b) => b.w - a.w).forEach((g) => {
    svg += `<line x1="${f2(g.x1)}" y1="${f2(g.y1)}" x2="${f2(g.x2)}" y2="${f2(g.y2)}" stroke="${BARK(g.w)}" stroke-width="${f2(Math.max(1.2, g.w * 3.4))}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  });
  svg += `<path d="${trunkPath(spine, opt.w0 || 7.5, opt.w1 || 2.2)}" fill="url(#${gid})"/></svg>`;
  // The canopy, weighted to the upper tips so the blossom mass sits above the list.
  const groups = ['', '', '']; let k = 0;
  const upper = out.tips.filter((t) => t.y < 58);
  out.tips.forEach((t) => { groups[k++ % 3] += blossom(f2(t.x), f2(t.y), t.y < 58 ? R(14, 29) : R(9, 16), r, p, !low); });
  const extra = Math.round((opt.scatter ?? 64) * D * (low ? 0.5 : 1));
  for (let i = 0; i < extra; i++) {
    const list = upper.length && r() < 0.8 ? upper : out.tips; const t = list[(r() * list.length) | 0];
    groups[k++ % 3] += blossom(f2(t.x + R(-16, 16)), f2(t.y + R(-16, 16) * 0.8), R(8, 21), r, p, !low);
  }
  // Wind: the whole tree sways, and three interleaved canopy groups move against it.
  let canopy = '';
  ([[17, 0], [23, -4], [29, -8]] as const).forEach(([dur, dl], i) => {
    const l0 = (r() < 0.5 ? -1 : 1) * R(0.22, 0.97);
    canopy += I(`inset:0;transform-origin:22% 94%;--l0:${f2(l0)}deg;--l1:${f2(-l0 * R(0.6, 1))}deg;--ly:${f2(-R(0.4, 0.9))}%;${p.an('limbSway', dur, dl, 'ease-in-out')}`, groups[i]);
  });
  return I(`${opt.mount || 'left:-26%;top:-6%;width:122%;height:106%;'}transform-origin:22% 94%;${p.an('treeSway', 22, 0, 'ease-in-out')}`, svg + canopy);
}

// ── Water ────────────────────────────────────────────────
// Everything that makes the lake move, inside a box that is already the lake.
// `sunX` is where the sun's light falls on it (% across).
function waterHtml(r: () => number, p: Paint, dark: boolean, low: boolean, D: number, sunX: number, rich = false) {
  const R = (a: number, b: number) => a + r() * (b - a);
  const A = p.A; const on = p.motion !== 'off';
  const hl = dark ? 'screen' : 'normal'; // a multiply would erase white on a light ground
  const heavy = (name: string, dur: number, delay = 0, ease = 'linear') => (low ? '' : p.an(name, dur, delay, ease));
  let h = '';
  // the sky, mirrored just below the far shore
  h += I(`left:0;right:0;top:0;height:30%;background:linear-gradient(180deg, ${dark ? 'rgba(224,145,154,.32)' : 'rgba(255,236,240,.62)'}, transparent);`);
  // swells: broad soft bands of light and shadow drifting and breathing
  const swells = rich ? 6 : 4;
  for (let i = 0; i < swells; i++) {
    const light = i % 2 === 0; const y = 8 + (i / swells) * 80 + R(-4, 4);
    const col = light ? (dark ? 'rgba(255,214,222,.22)' : 'rgba(255,250,244,.5)') : (dark ? 'rgba(20,10,30,.28)' : 'rgba(150,110,140,.14)');
    h += I(`left:-20%;width:140%;top:${f2(y)}%;height:${f2(R(10, 18))}%;border-radius:50%;background:radial-gradient(closest-side, ${col}, transparent);filter:blur(${f2(R(8, 13))}px);mix-blend-mode:${light ? hl : 'normal'};${heavy('causticSlide', R(9, 17), -R(0, 12), 'ease-in-out')}`);
  }
  // ripples — thin at the horizon, wide and warm at your feet. They swell in
  // place and never travel: thin strokes sliding sideways read as lines
  // scrolling across the screen.
  let rp = '';
  for (let i = 0; i < Math.round((rich ? 26 : 18) * D * (low ? 0.6 : 1)); i++) {
    const t = r(); const w = 12 + t * 56;
    const c = t < 0.5 ? '255,255,255' : '255,214,168';
    rp += I(`left:${f2(R(-10, 100 - w * 0.6))}%;top:${f2(4 + t * 92)}%;width:${f2(w)}%;height:${f2(1 + t * 2.2)}px;border-radius:50%;background:rgba(${c},${f2((0.35 + R(0, 0.3)) * A)});${p.an('swell', R(3.4, 8), -R(0, 8), 'ease-in-out')}`);
  }
  h += rp;
  // the sun's path: widening toward you, breathing
  for (let i = 0; i < 12; i++) {
    const w = 3 + i * 1.9;
    h += I(`left:${f2(sunX - w / 2)}%;top:${f2(3 + i * 7.6)}%;width:${f2(w)}%;height:${f2(1.5 + i * 0.25)}px;border-radius:50%;background:rgba(255,240,207,${f2((0.82 - i * (0.46 / 11)) * A)});filter:blur(1.1px);${p.an('swell', 2.8 + i * 0.55, -i * 0.62, 'ease-in-out')}`);
  }
  if (on) {
    // sun glitter: points of light winking on and off along the path
    for (let i = 0; i < (rich ? 40 : low ? 12 : 24); i++) {
      const t = r(); const spread = 4 + t * 26; const s = R(1.4, 3.2) * (0.6 + t * 0.6);
      h += I(`left:${f2(sunX + (r() + r() - 1) * spread)}%;top:${f2(2 + t * 94)}%;width:${f2(s)}px;height:${f2(s)}px;${STAR4}background:rgba(255,250,236,.95);opacity:0;${p.an('glitter', R(1.2, 3.2), -R(0, 3.2), 'ease-in-out')}`);
    }
    // rings spreading where a petal landed, flattened by perspective
    for (let i = 0; i < (rich ? 6 : low ? 2 : 4); i++) {
      const t = R(0.2, 1); const s = 18 + t * 46;
      h += I(`left:${f2(R(6, 90))}%;top:${f2(6 + t * 86)}%;width:0;height:0;transform:scaleY(.32);`,
        I(`left:${f2(-s / 2)}px;top:${f2(-s / 2)}px;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;border:1.2px solid rgba(255,255,255,.75);opacity:0;${p.an('lakeRing', R(3.8, 6.4), -R(0, 6.4), 'ease-out')}`));
    }
  }
  return h;
}

// ── The scene ────────────────────────────────────────────
type Lake = { scrim: number; band?: number; seed: number; dens: number; grain: boolean };
const LAKE: Record<SkyInput['preset'] | 'tile', Lake> = {
  rail:   { scrim: 0.5,  seed: 7,  dens: 1,    grain: true },
  header: { scrim: 0.62, seed: 33, dens: 0.7,  grain: true },
  card:   { scrim: 0.54, seed: 71, dens: 0.85, grain: true },
  friend: { scrim: 0.66, seed: 55, dens: 0.5,  grain: false },
  // The shop tile: no band damping — full intensity, the shop window.
  tile:   { scrim: 0.2, band: 0, seed: 15, dens: 0.45, grain: false },
};

function lake(o: Lake, dark: boolean, paper: string, motion: BundleMotion, low: boolean) {
  const p = painter(motion); const A = p.A; const on = motion !== 'off';
  const D = o.dens * (low ? 0.6 : 1);
  const r = rnd(o.seed); const R = (a: number, b: number) => a + r() * (b - a);
  const lit = dark ? 'screen' : 'multiply';
  const hl = dark ? 'screen' : 'normal';
  const heavy = (name: string, dur: number, delay = 0, ease = 'linear') => (low ? '' : p.an(name, dur, delay, ease));
  const wl = 100 - HZ;
  let h = '';

  // 1 · sky
  h += I(`inset:0;background:linear-gradient(179deg, ${dark ? '#2f1830 0%, #4a2340 26%, #7a3a52 54%, #b05f72 78%, #e0919a 100%' : '#a8cbe8 0%, #c9d4ee 24%, #e6cfe4 46%, #ffd4dd 66%, #ffdcc4 100%'});`);
  // 2 · sun — a soft disc, no rays
  h += I('left:62%;top:9%;width:74px;height:74px;margin-left:-37px;border-radius:50%;background:radial-gradient(circle, rgba(255,248,239,.92) 0%, rgba(255,228,201,.6) 40%, transparent 70%);filter:blur(3px);');
  // 3 · cloud banks
  ([['left:-14%;top:4%;width:72%;height:15%', SK.soft, 0.34, 58, 0], ['right:-16%;top:24%;width:66%;height:12%', '#e8c9f0', 0.3, 74, 6], ['left:-8%;top:31%;width:58%;height:9%', '#ffd9c9', 0.26, 91, 12]] as const).forEach(([pos, c, a, dur, dl]) => {
    h += I(`${pos};border-radius:50%;background:radial-gradient(closest-side, ${rgba(c, Math.min(1, a * A * 1.6))}, transparent);filter:blur(12px);mix-blend-mode:${hl};${heavy('drift', dur, dl, 'ease-in-out')}`);
  });
  // 4 · ridges on the far shore
  ([['left:-8%;width:74%;height:15%', '#a98fb8', 0.5], ['left:34%;width:78%;height:11%', '#c09fbd', 0.44], ['left:-4%;width:110%;height:7%', '#8f7aa8', 0.34]] as const).forEach(([pos, c, a]) => {
    h += I(`${pos};bottom:${HZ}%;background:${rgba(c, a)};clip-path:polygon(0 100%,18% 42%,32% 58%,52% 8%,68% 46%,84% 26%,100% 100%);filter:blur(.6px);`);
  });
  // 5 · the lake — cool at the far shore, warm at your feet — and its water
  h += I(`left:0;right:0;bottom:0;height:${HZ}%;overflow:hidden;background:${dark ? `linear-gradient(180deg, ${rgba('#6b6a9e', 0.72)}, ${rgba('#8f6a86', 0.66)} 50%, ${rgba('#43536e', 0.75)})` : 'linear-gradient(180deg, #b9c8e0 0%, #d6c4d8 22%, #f0c9c4 48%, #f6c2a8 72%, #d9a89c 100%)'};`,
    I(`inset:0;background:radial-gradient(74% 100% at 62% 100%, rgba(255,207,154,.66), rgba(255,182,160,.36) 42%, transparent 82%);mix-blend-mode:${lit};opacity:${f2(A)};`)
    + waterHtml(r, p, dark, low, D, 62));
  // 7 · shoreline
  h += I(`left:0;right:0;top:${wl}%;height:2px;margin-top:-1px;background:linear-gradient(90deg, transparent, rgba(255,244,226,.85) 28%, rgba(255,224,196,.7) 68%, transparent);`);
  // 13 · warm glow
  h += I(`right:-6%;bottom:-4%;width:64%;height:34%;border-radius:50%;background:radial-gradient(closest-side, rgba(255,192,137,.5), transparent);filter:blur(14px);${heavy('warmBreathe', 13, 0, 'ease-in-out')}`);
  // 15 · its reflection — no blend mode: it would force a composite layer for nothing
  h += I(`left:0;top:${wl}%;width:62%;height:${f2(HZ * 0.82)}%;overflow:hidden;`,
    I(`left:-4%;top:-10%;width:78%;height:46%;border-radius:50%;background:radial-gradient(closest-side, ${rgba(SK.accent, 0.52)}, ${rgba(SK.soft, 0.32)} 55%, transparent);filter:blur(7px);opacity:${f2(A)};${heavy('waterShimmer', 11, 0, 'ease-in-out')}`)
    + I('left:16%;top:0;width:4px;height:70%;background:linear-gradient(180deg, rgba(68,36,44,.45), transparent);filter:blur(2.5px);')
    + I('inset:0;background:repeating-linear-gradient(180deg, transparent 0 7px, rgba(255,255,255,.2) 7px 8px);-webkit-mask-image:linear-gradient(180deg,#000,transparent);mask-image:linear-gradient(180deg,#000,transparent);'));
  // 14 · THE TREE
  h += treeHtml(o.seed * 7 + 3, D, p, low);
  // …standing on the near shore: a low bank in the corner in front of its
  // foot. (The reflection is drawn BEHIND the tree, so the trunk reads as
  // foreground over the water, not as something standing in it.)
  h += I(`left:-12%;bottom:-1%;width:40%;height:16%;border-radius:0 100% 0 0 / 0 100% 0 0;background:${dark ? 'linear-gradient(180deg, #4a2b3a, #2f1a26)' : 'linear-gradient(180deg, #9b7684 0%, #7a5664 40%, #634450 100%)'};`
    + '-webkit-mask-image:linear-gradient(0deg, #000 70%, rgba(0,0,0,.92));mask-image:linear-gradient(0deg, #000 70%, rgba(0,0,0,.92));',
    I(`inset:0;border-radius:inherit;background:radial-gradient(70% 22% at 34% 4%, ${rgba(SK.soft, dark ? 0.3 : 0.55)}, transparent 72%);`));
  if (on) {
    // 16 · PETAL STORM — independent timelines, every one with a NEGATIVE
    //      delay, so the storm is already underway instead of one clump
    //      launching together.
    for (let i = 0; i < Math.round(64 * D * (low ? 0.5 : 1)); i++) {
      const depth = r();
      const s = 3.5 + depth * 10 + r() * 3.5;
      const blur = depth < 0.28 ? 1.3 : depth < 0.58 ? 0.5 : 0;
      const rad = `${f2(58 + r() * 14)}% ${f2(30 + r() * 14)}% ${f2(52 + r() * 14)}% ${f2(36 + r() * 12)}% / ${f2(42 + r() * 12)}% ${f2(58 + r() * 14)}% ${f2(32 + r() * 12)}% ${f2(50 + r() * 12)}%`;
      const dur = 6 + (1 - depth) * 9 + r() * 7;
      const W = R(24, 136) * (r() < 0.5 ? -1 : 1);
      h += I(`left:${f2(R(-6, 100))}%;top:${f2(R(-12, 88))}%;width:${f2(s)}px;height:${f2(s * 0.82)}px;border-radius:${rad};background:${petalFill(r())};box-shadow:0 1px 2px rgba(156,67,97,${f2(0.1 + depth * 0.16)});${blur && !low ? `filter:blur(${blur}px);` : ''}--s1x:${f2(W * 0.35)}px;--s2x:${f2(-W * 0.1)}px;--s3x:${f2(W * 0.62)}px;--s4x:${f2(W * 0.3)}px;opacity:0;${p.an('petalSwirl', dur, -r() * dur)}`);
    }
    // 17 · petals afloat on the water
    for (let i = 0; i < Math.round(13 * D); i++) {
      const s = R(4, 9);
      h += I(`left:${f2(R(2, 96))}%;bottom:${f2(R(2, HZ - 6))}%;width:${f2(s)}px;height:${f2(s * 0.5)}px;border-radius:60% 40% 55% 45% / 50% 60% 40% 50%;background:linear-gradient(140deg, #fff, ${SK.accent});${p.an('waterShimmer', R(5, 12), -R(0, 12), 'ease-in-out')}`);
    }
  }
  // 18 · sparkles
  for (let i = 0; i < (low ? 6 : 14); i++) {
    const s = R(4, 8);
    h += I(`left:${f2(R(4, 96))}%;top:${f2(R(wl * 0.3, 96))}%;width:${f2(s)}px;height:${f2(s)}px;${STAR4}background:rgba(255,246,228,.95);${p.an('twinkle', R(2.6, 6.2), -R(0, 6), 'ease-in-out')}`);
  }
  // 19 · vignette
  h += I('inset:0;background:radial-gradient(116% 92% at 44% 40%, transparent 0 54%, rgba(107,58,72,.16) 100%);');
  // 20 · the stepped scrim: vivid at the top, damped over the list. On a
  // light page the list's small muted text sits on this, and blossom and
  // branch detail through more than a quarter of it breaks the words up.
  const s0 = dark ? o.scrim : o.scrim * 0.28;
  const s1 = Math.min(0.9, s0 + (o.band === 0 ? 0 : dark ? 0.3 : 0.6));
  // Where the vivid zone ends is the layout's call (--sky-v1/--sky-v2): the
  // list has to start on the damped part, and a phone's list starts higher.
  h += I(`inset:0;background:linear-gradient(180deg, ${rgba(paper, s0 * 0.5)} 0%, ${rgba(paper, s0 * 0.8)} var(--sky-v1, 11%), ${rgba(paper, s1)} var(--sky-v2, 21%), ${rgba(paper, s1)} 90%, ${rgba(paper, Math.min(0.92, s1 + 0.04))} 100%);`);
  // 21 · grain · 22 · top hairline
  if (o.grain) {
    const grain = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='180' height='180' filter='url(#g)'/></svg>")}")`;
    h += I(`inset:0;background-image:${grain};background-size:180px 180px;opacity:.04;mix-blend-mode:${lit};`);
  }
  h += I(`left:0;right:0;top:0;height:2px;background:linear-gradient(90deg, transparent, ${SK.accent} 22%, rgba(255,217,138,.9) 48%, ${SK.soft} 70%, transparent);`);
  return h;
}

/** The lake behind a rail, account header, share card or friend card. */
export function lakeSkyHtml(input: SkyInput): string {
  const base = LAKE[input.preset];
  const o = input.seed === undefined ? base : { ...base, seed: input.seed };
  return lake(o, input.dark, input.paper, input.motion, input.lowPerf);
}

/** The Settings → Bundles tile: the lake at full intensity. */
export function lakeTileHtml(dark: boolean, paper: string, motion: BundleMotion): string {
  return lake(LAKE.tile, dark, paper, motion, false);
}

// ============================================================
//  The avatar decoration — a branch wrapping the ring
// ============================================================
const tierOf = (size: number): Tier => (size <= 28 ? 'ring' : size <= 56 ? 'simple' : 'full');

// A real branch grown round 90% of a pink ring; blossoms fill the open arc
// and perch on the wood. Drawn 1.52× the avatar inside the same 1.25× canvas
// every bundle reserves, so switching bundles never moves the layout — the
// outer wood and blossoms are ink overflow (BundleAvatar's contain: layout).
export function branchDecorationHtml(size: number, motion: BundleMotion, lowPerf: boolean, seed = size): Decoration {
  const tier = tierOf(size); const D = size * 1.25; const off = (D - size) / 2;
  const H = size * 1.52; const ho = (D - H) / 2; const hoff = (H - size) / 2; const cx = H / 2;
  const p = painter(motion); const on = motion !== 'off';
  const r = rnd(seed * 7 + 3); const R = (a: number, b: number) => a + r() * (b - a);
  const rw = Math.max(1.4, size * 0.024);
  const wrap = (inner: string) => I(`left:${f2(ho)}px;top:${f2(ho)}px;width:${f2(H)}px;height:${f2(H)}px;`, inner);
  const back = I(`left:${f2(hoff - size * 0.12)}px;top:${f2(hoff - size * 0.12)}px;width:${f2(size * 1.24)}px;height:${f2(size * 1.24)}px;border-radius:50%;background:radial-gradient(circle, transparent 0 44%, ${rgba(SK.soft, 0.4)} 62%, transparent 80%);filter:blur(${f2(size * 0.04)}px);`);
  const rim = I(`left:${f2(hoff)}px;top:${f2(hoff)}px;width:${size}px;height:${size}px;border-radius:50%;box-shadow:0 0 0 ${f2(rw)}px rgba(255,246,249,.95), 0 0 0 ${f2(2 * rw)}px ${SK.accent}, 0 ${f2(size * 0.035)}px ${f2(size * 0.12)}px ${rgba(SK.ruby, 0.28)};`);
  if (tier === 'ring') return { D, off, tier, back: wrap(back), front: wrap(rim) };

  let front = rim;
  // THE RING BRANCH: 324° of wood, the open arc on the right, the radius
  // wobbling so it is never a perfect circle.
  const N = 26; const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N; const ang = ((18 + t * 324) * Math.PI) / 180;
    const rr = 34 + Math.sin(t * 9.2) * 1.5 + R(-0.7, 0.7);
    pts.push({ x: 50 + Math.cos(ang) * rr, y: 50 + Math.sin(ang) * rr });
  }
  const w0 = Math.max(1.6, size * 0.032); const w1 = Math.max(1, size * 0.018);
  let svg = '<svg viewBox="0 0 100 100" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" aria-hidden="true">';
  for (let i = 0; i < N; i++) {
    const a = pts[i]; const b = pts[i + 1]; const t = i / (N - 1);
    svg += `<line x1="${f2(a.x)}" y1="${f2(a.y)}" x2="${f2(b.x)}" y2="${f2(b.y)}" stroke="${mixHex('#4a2830', '#5e3840', t)}" stroke-width="${f2(w0 + (w1 - w0) * t)}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  }
  for (let k = 0; k < 7; k++) { // seven twigs off the wood
    const i = 1 + ((r() * (N - 2)) | 0); const a = pts[i]; const b = pts[i + 1];
    const dir = Math.atan2(b.y - a.y, b.x - a.x) + (r() < 0.5 ? -1 : 1) * 0.85 + R(-0.5, 0.5);
    const L = (R(4, 11) * 100) / H;
    svg += `<line x1="${f2(a.x)}" y1="${f2(a.y)}" x2="${f2(a.x + Math.cos(dir) * L)}" y2="${f2(a.y + Math.sin(dir) * L)}" stroke="#5e3840" stroke-width="${f2(Math.max(0.8, w1 * 0.62))}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  }
  svg += '</svg>';
  // Small, so a drop-shadow is cheap here.
  front += I('inset:0;filter:drop-shadow(0 1px 1.5px rgba(125,59,82,.3));', svg);
  // blossoms across the open arc
  const nb = Math.max(4, Math.min(9, Math.round(size / 14)));
  for (let i = 0; i < nb; i++) {
    const a = ((-60 + (108 / (nb - 1)) * i + R(-6, 6)) * Math.PI) / 180;
    front += blossom(f2(cx + Math.cos(a) * H * 0.34), f2(cx + Math.sin(a) * H * 0.34), size * R(0.15, 0.21), r, p, !lowPerf, 'px');
  }
  // three perched on the wood, sampled from the walk itself
  for (let i = 0; i < 3; i++) {
    const q = pts[3 + ((r() * (N - 6)) | 0)];
    front += blossom(f2((q.x * H) / 100), f2((q.y * H) / 100), size * 0.11, r, p, !lowPerf, 'px');
  }
  // four sparkles
  for (let i = 0; i < 4; i++) {
    const a = R(0, Math.PI * 2); const rr = R(0.46, 0.54) * H; const s = R(3, 6) * Math.max(0.7, size / 64);
    front += I(`left:${f2(cx + Math.cos(a) * rr - s / 2)}px;top:${f2(cx + Math.sin(a) * rr - s / 2)}px;width:${f2(s)}px;height:${f2(s)}px;${STAR4}background:#ffc94d;${p.an('twinkle', R(2.4, 5.2), -R(0, 5), 'ease-in-out')}`);
  }
  if (tier === 'full') {
    // six petals drifting across the avatar, clipped to the wrapper
    let pf = '';
    if (on) {
      for (let i = 0; i < 6; i++) {
        const s = R(4, 7) * Math.max(0.8, size / 64);
        pf += I(`left:${f2(R(10, 86))}%;top:${f2(R(-6, 34))}%;width:${f2(s)}px;height:${f2(s * 0.8)}px;${PETAL}background:linear-gradient(140deg, #fff, ${SK.accent});box-shadow:0 1px 2px rgba(156,67,97,.2);--px:${f2(R(-30, 30))}px;--pr:${f2(R(180, 480))}deg;opacity:0;${p.an('petalFall', R(4, 7.4), -R(0, 7.4))}`);
      }
    }
    front += I('inset:0;overflow:hidden;', pf);
    // two ring swells, soft pink and butter
    ([[SK.soft, 0], [SK.butter, -2.6]] as const).forEach(([c, dl]) => {
      const s = size * 1.1;
      front += I(`left:${f2(cx - s / 2)}px;top:${f2(cx - s / 2)}px;width:${f2(s)}px;height:${f2(s)}px;border-radius:50%;border:1.5px solid ${rgba(c, 0.85)};opacity:${on ? 0 : 0.4};${p.an('ringSwell', 6, dl, 'ease-out')}`);
    });
  }
  return { D, off, tier, back: wrap(back), front: wrap(front) };
}

// ============================================================
//  Intro — "the tree grows in"
// ============================================================
// The tree stands on a shore bank at the left, the bank IN FRONT of the lake
// and of the trunk's foot, so the trunk never stands in the water; the lake
// lies below and moves — swells, ripples, glitter and rings.
export function sakuraIntroHtml(still: boolean, tagline: string, low: boolean): string {
  const r = rnd(77); const R = (a: number, b: number) => a + r() * (b - a);
  const p = painter(still ? 'off' : 'full');
  const E = 'cubic-bezier(.16,1,.3,1)';
  const A1 = (n: string, dur: number, dl: number, ease = E) => (still ? '' : `animation:bx-${n} ${f2(dur)}s ${ease} ${f2(dl)}s both;`);
  const hidden = still ? '' : 'opacity:0;';
  let h = '';
  // 0.10s — a warm bloom
  if (!still) h += I(`left:50%;top:46%;width:340px;height:340px;margin:-170px 0 0 -170px;border-radius:50%;background:radial-gradient(circle, rgba(255,244,234,.42) 0%, ${rgba(SK.soft, 0.3)} 28%, ${rgba(SK.accent, 0.16)} 52%, transparent 70%);opacity:0;${A1('ringSwell', 2, 0.1)}`);
  // 0.30s — the lake, fading out at its ends into the overlay, and moving
  h += I(`left:-40%;right:-40%;top:76%;height:58%;overflow:hidden;${hidden}${A1('bounceIn', 1, 0.3)}`
    + '-webkit-mask-image:linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent), linear-gradient(180deg, #000 55%, transparent 96%);-webkit-mask-composite:source-in;'
    + 'mask-image:linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent), linear-gradient(180deg, #000 55%, transparent 96%);mask-composite:intersect;',
    I('inset:0;background:linear-gradient(180deg, #b9c8e0 0%, #d6c4d8 26%, #f0c9c4 56%, #f6c2a8 100%);')
    + I('left:0;right:0;top:0;height:2px;background:linear-gradient(90deg, transparent, rgba(255,244,226,.9) 30%, rgba(255,224,196,.75) 70%, transparent);')
    // the blossom, mirrored and trembling in the water beside the bank
    + I(`left:31%;top:0;width:18%;height:74%;border-radius:50%;background:radial-gradient(closest-side, ${rgba(SK.accent, 0.46)}, ${rgba(SK.soft, 0.26)} 55%, transparent);filter:blur(8px);${still ? '' : p.an('waterShimmer', 6, 0, 'ease-in-out')}`)
    + waterHtml(r, p, false, low, 1, 58, true));
  // 0.14s — the tree grows in
  h += I(`left:-14%;top:-18%;width:56%;height:112%;${hidden}${A1('bounceIn', 1.1, 0.14)}`,
    treeHtml(19, 0.4, p, low, {
      spine: [{ x: 9, y: 94 }, { x: 12, y: 86 }, { x: 16, y: 78 }, { x: 20, y: 70 }, { x: 25, y: 60 }],
      limbs: [[14, 84, 20, -128, 2.4, 4], [18, 74, 22, -40, 2.6, 4], [22, 64, 20, -92, 2.2, 4], [25, 60, 24, -18, 2.4, 4]],
      w0: 6.5, w1: 2, mount: 'inset:0;', scatter: 40,
    }));
  // …on a soft shore bank that hides its foot. It fades out at its far
  // edges into the overlay instead of stopping at a hard line.
  let fallen = '';
  for (let i = 0; i < 12; i++) {
    const s = R(4, 8);
    fallen += I(`left:${f2(R(24, 82))}%;top:${f2(R(4, 20))}%;width:${f2(s)}px;height:${f2(s * 0.55)}px;${PETAL}background:${petalFill(r())};transform:rotate(${f2(R(-30, 30))}deg);`);
  }
  h += I(`left:-36%;width:66%;top:67%;height:66%;${hidden}${A1('bounceIn', 1.1, 0.14)}`
    + 'border-radius:58% 42% 0 0 / 64% 100% 0 0;background:linear-gradient(180deg, #a07f8c 0%, #86616f 36%, #6d4d5b 100%);'
    + '-webkit-mask-image:linear-gradient(90deg, transparent 0%, #000 28%), linear-gradient(180deg, #000 50%, transparent 96%);-webkit-mask-composite:source-in;'
    + 'mask-image:linear-gradient(90deg, transparent 0%, #000 28%), linear-gradient(180deg, #000 50%, transparent 96%);mask-composite:intersect;',
    I(`inset:0;border-radius:inherit;background:radial-gradient(60% 26% at 58% 6%, ${rgba(SK.soft, 0.6)}, transparent 72%);`) + fallen);
  // 0.2s → — petals showering
  if (!still) {
    for (let i = 0; i < 30; i++) {
      const s = R(5, 11); const W = R(20, 90) * (r() < 0.5 ? -1 : 1);
      h += I(`left:${f2(R(0, 100))}%;top:${f2(R(-12, 40))}%;width:${f2(s)}px;height:${f2(s * 0.82)}px;${PETAL}background:${petalFill(r())};box-shadow:0 1px 2px rgba(156,67,97,.2);--s1x:${f2(W * 0.35)}px;--s2x:${f2(-W * 0.1)}px;--s3x:${f2(W * 0.6)}px;--s4x:${f2(W * 0.3)}px;opacity:0;${A1('petalSwirl', R(2.6, 4.8), 0.2 + i * 0.05, 'linear')}`);
    }
  }
  // 0.50–1.05s — sparkles popping in a ring
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2; const s = R(5, 9);
    h += I(`left:calc(50% + ${f2(Math.cos(a) * 84 - s / 2)}px);top:calc(46% + ${f2(Math.sin(a) * 60 - s / 2)}px);width:${f2(s)}px;height:${f2(s)}px;${STAR4}background:#ffc94d;${hidden}${A1('bounceIn', 0.8, 0.5 + i * 0.05)}`);
  }
  const letters = 'Mah Notes'.split('').map((ch, i) => `<span class="bintro-l" style="${escAttr(A1('bounceIn', 0.72, 0.6 + i * 0.055))}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  const glint = still ? '' : `<span class="bintro-glint" aria-hidden="true" style="${escAttr(A1('glint', 0.95, 1.8, 'cubic-bezier(.45,.05,.3,1)'))}">Mah&nbsp;Notes</span>`;
  return `<div class="bintro-stage">
    ${h}
    ${logoMarkHtml(A1('markPop', 0.82, 0.34), A1('logoGlint', 0.8, 1.2, 'cubic-bezier(.45,.05,.3,1)'), [SK.soft, SK.accent])}
    <div class="bintro-word"><span class="bintro-w">${letters}${glint}</span></div>
    <div class="bintro-tag"><span style="${escAttr(A1('tagWipe', 0.9, 1.3))}">${tagline.replace(/\.$/, '')}</span></div>
    <div class="bintro-skip"><span style="${escAttr(A1('tagWipe', 0.6, 2, 'ease'))}">Tap to skip</span></div>
  </div>`;
}

// ============================================================
//  Click effect — "petal scatter"
// ============================================================
// No spikes, no shockwave, no white flash: this bundle has no emissive light.
export function petalScatterHtml(seed: number): string {
  const r = rnd(seed); const R = (a: number, b: number) => a + r() * (b - a);
  const E = 'cubic-bezier(.16,1,.3,1)';
  let h = I(`left:-32px;top:-32px;width:64px;height:64px;border-radius:50%;background:radial-gradient(circle, rgba(255,246,234,.55) 0%, ${rgba(SK.soft, 0.34)} 34%, ${rgba(SK.accent, 0.18)} 60%, transparent 72%);animation:bx-ringSwell .78s ${E} both;`);
  for (let i = 0; i < 14; i++) {
    const s = R(5, 12); const a = ((i * 25.7 + R(-16, 16)) * Math.PI) / 180; const dist = R(28, 82);
    const fill = i % 3 === 0 ? '#fff' : i % 3 === 1 ? `linear-gradient(140deg, #fff, ${SK.accent})` : `linear-gradient(140deg, ${SK.soft}, ${SK.berry})`;
    h += I(`left:${f2(-s / 2)}px;top:${f2(-s * 0.41)}px;width:${f2(s)}px;height:${f2(s * 0.82)}px;${PETAL}background:${fill};box-shadow:0 1px 2px rgba(156,67,97,.25);--cx:${f2(Math.cos(a) * dist)}px;--cy:${f2(Math.sin(a) * dist)}px;--cr:${f2(R(160, 500))}deg;animation:bx-confettiOut ${f2(R(0.56, 0.82))}s ${E} both;`);
  }
  h += I(`left:-24px;top:-24px;width:48px;height:48px;border-radius:50%;border:2px solid ${rgba(SK.soft, 0.85)};animation:bx-ringSwell .62s ${E} .12s both;`);
  h += I(`left:0;top:0;width:0;height:0;animation:bx-popHeart .68s ${E} both;`, blossom(0, 0, 28, r, painter('off'), false, 'px'));
  return h;
}

// ============================================================
//  Farewells — petals on delete, a gust on sign-out
// ============================================================
export const PETAL_COLOURS = ['#ffffff', SK.soft, SK.accent, SK.berry, SK.dust];

/** Signing out: a gust takes every petal off to the right and the page goes
    quiet — a soft bloom, never a flash. */
export function petalGustHtml(): string {
  const r = rnd(97); const R = (a: number, b: number) => a + r() * (b - a);
  const E = 'cubic-bezier(.45,0,.6,1)';
  let petals = '';
  for (let i = 0; i < 46; i++) {
    const s = R(6, 14);
    petals += I(`left:${f2(R(-10, 90))}%;top:${f2(R(-10, 100))}%;width:${f2(s)}px;height:${f2(s * 0.82)}px;${PETAL}background:${petalFill(r())};box-shadow:0 1px 2px rgba(156,67,97,.22);--cx:${f2(R(420, 900))}px;--cy:${f2(R(-160, 120))}px;--cr:${f2(R(240, 720))}deg;animation:bx-confettiOut ${f2(R(0.7, 1.1))}s ${E} ${f2(R(0, 0.35))}s both;`);
  }
  return `<div class="bintro-stage">
    ${logoMarkHtml('animation:bx-markOut 1s cubic-bezier(.5,0,.75,0) both;', '', [SK.soft, SK.accent])}
    <div class="bintro-tag" style="top:calc(46% + 58px)"><span style="animation:bx-wordOut 1s ease both;">Signing you out</span></div>
    ${I(`left:50%;top:46%;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:radial-gradient(circle, rgba(255,246,234,.8), ${rgba(SK.soft, 0.35)} 45%, transparent 72%);opacity:0;animation:bx-ringSwell .8s ${E} .8s both;`)}
  </div>${I('inset:0;pointer-events:none;overflow:hidden;', petals)}`;
}
