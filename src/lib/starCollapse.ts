// ============================================================
//  Star collapse — the Galaxy click effect on primary actions.
//
//  Motes implode toward the button's centre, a shockwave ring expands, and
//  a white core flashes behind crossed diffraction spikes — the same visual
//  language as the newborn stars in the sky, on purpose.
//
//  One delegated listener for the whole app, so buttons rendered later are
//  covered for free and there is exactly one place to check the two things
//  that must always be checked: that a bundle with the effect is in force,
//  and that motion is wanted. The group is position:fixed on <body>, so no
//  clipping container can cut it off.
//
//  Never on the capture path: the Alt+N toast and the Alt+M paste panel.
// ============================================================
import { bundleState } from './bundles';
import { G, rgba, rnd } from './galaxy';

// Primary actions only — not every button in the product. A flourish on
// every control is how a charming effect turns into a browser toolbar.
const TARGETS = [
  '.btn-primary', '.rail-btn.solid', '.add-fab', '.pane-btn.solid', '.cluster-btn',
  '.detail-action.solid', '.bfoot-share', '.bcol-tile', '.bmotion button', '.vc-btn', '.vcta-btn',
  '[data-nova]',
].join(', ');

const LIFETIME = 780;
const f2 = (n: number) => (+n).toFixed(2);
const I = (css: string) => `<i style="${css.replace(/"/g, '&quot;')}"></i>`;

/** A star collapse centred on (x, y) in viewport pixels. `scale` shrinks it
    for small targets — a checkbox gets a smaller one than a button. */
export function starBurst(x: number, y: number, scale = 1) {
  const r = rnd((Math.round(x) * 31 + Math.round(y) * 17) | 0); const R = (a: number, b: number) => a + r() * (b - a);
  const E = 'cubic-bezier(.16,1,.3,1)';
  let h = I(`left:-34px;top:-34px;width:68px;height:68px;border-radius:50%;background:radial-gradient(circle, ${rgba(G.natal, 0.5)} 0%, ${rgba(G.ha, 0.3)} 30%, ${rgba(G.accent, 0.18)} 56%, transparent 72%);animation:bx-haloBloom .78s ${E} both;`);
  for (let i = 0; i < 11; i++) {
    const s = [1.6, 2.2, 3][i % 3];
    const col = i % 4 === 3 ? G.ha : i % 3 === 2 ? G.spark : G.dust;
    const a = ((i * 32.7 + R(-20, 20)) * Math.PI) / 180; const dist = R(30, 74);
    h += I(`left:${-s / 2}px;top:${-s / 2}px;width:${s}px;height:${s}px;border-radius:50%;background:${col};box-shadow:0 0 ${f2(2.6 * s)}px ${rgba(G.natal, 0.8)};--ix:${f2(Math.cos(a) * dist)}px;--iy:${f2(Math.sin(a) * dist)}px;animation:bx-implode ${f2(R(0.44, 0.64))}s cubic-bezier(.4,0,.2,1) both;`);
  }
  h += I(`left:-20px;top:-20px;width:40px;height:40px;border-radius:50%;border:1.5px solid ${rgba(G.spark, 0.9)};animation:bx-shockRing .62s ${E} .16s both;`);
  const spk = `transparent, ${rgba(G.natal, 0.9)} 44%, #fff 50%, ${rgba(G.natal, 0.9)} 56%, transparent`;
  h += I(`left:-30px;top:-.55px;width:60px;height:1.1px;background:linear-gradient(90deg, ${spk});animation:bx-flareSpikeX .6s ${E} .2s both;`);
  h += I(`left:-.55px;top:-30px;width:1.1px;height:60px;background:linear-gradient(180deg, ${spk});animation:bx-flareSpikeY .6s ${E} .2s both;`);
  h += I(`left:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 14px #fff, 0 0 34px ${rgba(G.ha, 0.85)};animation:bx-flareCore .66s ${E} .18s both;`);
  const g = document.createElement('div');
  g.className = 'bfx';
  g.setAttribute('aria-hidden', 'true');
  g.style.left = `${x}px`;
  g.style.top = `${y}px`;
  if (scale !== 1) g.style.transform = `scale(${scale})`;
  g.innerHTML = h;
  document.body.appendChild(g);
  window.setTimeout(() => g.remove(), LIFETIME);
}

let installed = false;
export function installStarCollapse() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('click', (e) => {
    const loc = `${window.location.pathname}${window.location.hash}`;
    if (/\/(toast|clip-panel)\b/.test(loc)) return;
    const t = (e.target as Element | null)?.closest?.(TARGETS) as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled) return;
    const s = bundleState();
    if (s.reduced) return;
    // Your own bundle drives the effect across the app. A shared card wears
    // its sender's bundle, so its buttons follow the card, not the reader.
    const onCard = t.closest('[data-bundle-surface="galaxy"]');
    const mine = s.bundle.clickEffect && s.effectiveMotion !== 'off';
    if (!mine && !onCard) return;
    const rc = t.getBoundingClientRect();
    starBurst(rc.left + rc.width / 2, rc.top + rc.height / 2);
  }, true);
}
