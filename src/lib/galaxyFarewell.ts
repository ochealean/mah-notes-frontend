// ============================================================
//  Galaxy farewells — the two ways something leaves.
//
//    dissolveAway  — a document (or a list row) sweeps away left to right
//                    and breaks into stardust that drifts off, before it is
//                    actually deleted
//    playSignOut   — signing out warps the app away: streaks rush inward,
//                    everything collapses to a point, and the sign-in screen
//                    is waiting underneath when the dark lifts
//
//  Both are only for a bundle that has them (Galaxy) and only when motion is
//  wanted; otherwise they resolve at once and nothing is drawn. Both are
//  imperative DOM on <body>, so they outlive whatever React unmounts next —
//  the deleted note, or the whole app on sign-out.
// ============================================================
import { bundleState } from './bundles';
import { G, rgba, rnd, logoMarkHtml } from './galaxy';
import { dustFor, signOutFor } from './bundleArt';

const active = () => {
  const s = bundleState();
  return s.bundle.farewells && s.effectiveMotion !== 'off';
};
const wait = (ms: number) => new Promise<void>((r) => { window.setTimeout(r, ms); });
const f2 = (n: number) => (+n).toFixed(2);
const I = (css: string, inner = '') => `<i style="${css.replace(/"/g, '&quot;')}">${inner}</i>`;

const SWEEP_MS = 640;

/**
 * Turn elements to stardust. Resolves once they have faded, so the caller
 * can delete them then. Returns a `restore` for when the delete fails and
 * the element has to come back.
 */
export async function dissolveAway(targets: Array<Element | null | undefined>): Promise<() => void> {
  const els = targets.filter(Boolean) as HTMLElement[];
  const restore = () => els.forEach((el) => el.classList.remove('bx-dissolving'));
  if (!active() || !els.length) return restore;

  const vw = window.innerWidth; const vh = window.innerHeight;
  // Galaxy breaks into round stardust; a bundle may bring its own (Cyberpunk: square pixels).
  const own = dustFor(bundleState().id);
  const colours = own ? own.colours : [G.dust, G.soft, G.spark, G.core, G.ha];
  const petal = own?.shape === 'petal';
  const shape = own?.shape === 'square' ? '' : petal ? 'border-radius:62% 38% 58% 42% / 48% 62% 38% 52%;' : 'border-radius:50%;';
  const grow = petal ? 2.6 : 1;
  els.forEach((el, n) => {
    const b = el.getBoundingClientRect();
    const left = Math.max(0, b.left); const top = Math.max(0, b.top);
    const w = Math.min(vw, b.right) - left; const h = Math.min(vh, b.bottom) - top;
    if (w <= 0 || h <= 0) return;

    // Denser on big areas, but capped: a whole pane is a few dozen motes,
    // never hundreds.
    const count = Math.round(Math.min(90, Math.max(16, (w * h) / 5200)));
    const r = rnd(Math.round(left * 7 + top * 13 + n * 101));
    let html = '';
    for (let i = 0; i < count; i++) {
      const x = r() * w; const y = r() * h; const s = (1 + r() * 2.4) * grow;
      const col = colours[(r() * colours.length) | 0];
      // Released in the same left-to-right sweep that erases the element.
      const delay = (x / w) * (SWEEP_MS * 0.7) + r() * 90;
      const dur = 520 + r() * 460;
      html += I(`left:${f2(x)}px;top:${f2(y)}px;width:${f2(s)}px;height:${f2(s * (petal ? 0.82 : 1))}px;${shape}background:${col};box-shadow:${petal ? '0 1px 2px rgba(156,67,97,.25)' : `0 0 ${f2(s * 3)}px ${rgba(col, 0.8)}`};--dx:${f2(18 + r() * 70)}px;--dy:${f2(-(8 + r() * 64))}px;animation:bx-dustOut ${Math.round(dur)}ms cubic-bezier(.3,.6,.4,1) ${Math.round(delay)}ms both;`);
    }
    const layer = document.createElement('div');
    layer.className = 'bdust';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.left = `${left}px`;
    layer.style.top = `${top}px`;
    layer.style.width = `${w}px`;
    layer.style.height = `${h}px`;
    layer.innerHTML = html;
    document.body.appendChild(layer);
    window.setTimeout(() => layer.remove(), SWEEP_MS + 1100);
    el.classList.add('bx-dissolving');
  });

  await wait(SWEEP_MS);
  return restore;
}

// Galaxy's goodbye: streaks rush inward and everything collapses to a point.
function warpHtml(): string {
  const r = rnd(97); const R = (a: number, b: number) => a + r() * (b - a);
  const E = 'cubic-bezier(.55,0,.75,.35)'; // accelerating inward
  const cols = [G.core, G.spark, G.ha];
  let streaks = ''; let stars = '';
  for (let i = 0; i < 40; i++) {
    const ang = i * 9 + R(-6, 6); const len = R(26, 70); const th = R(0.7, 1.8);
    const c = cols[(r() * 3) | 0];
    streaks += I(`left:50%;top:46%;width:0;height:0;transform:rotate(${f2(ang)}deg);`,
      I(`left:0;top:${f2(-th / 2)}px;width:${f2(len)}px;height:${f2(th)}px;transform-origin:0 50%;--s0:${f2(R(8, 20))}px;--s1:${f2(R(150, 280))}px;background:linear-gradient(270deg, transparent, ${rgba(c, 0.82)} 56%, ${rgba(G.core, 0.95)});opacity:0;animation:bx-streakIn ${f2(R(0.6, 0.85))}s ${E} ${f2(R(0.05, 0.3))}s both;`));
    const a = (ang * Math.PI) / 180; const rad = R(90, 220); const s = R(1, 2.4);
    stars += I(`left:50%;top:46%;width:${f2(s)}px;height:${f2(s)}px;margin:${f2(-s / 2)}px 0 0 ${f2(-s / 2)}px;border-radius:50%;background:${c === G.ha ? G.ha : G.core};box-shadow:0 0 ${f2(s * 2)}px ${rgba(c, 0.8)};--ix:${f2(Math.cos(a) * rad)}px;--iy:${f2(Math.sin(a) * rad * 0.52)}px;animation:bx-implode ${f2(R(0.6, 0.9))}s ${E} ${f2(R(0, 0.25))}s both;`);
  }
  return `<div class="bintro-stage">
    ${streaks}${stars}
    ${logoMarkHtml('animation:bx-markOut 1s cubic-bezier(.5,0,.75,0) both;')}
    <div class="bintro-tag" style="top:calc(46% + 58px)"><span style="animation:bx-wordOut 1s ease both;">Signing you out</span></div>
    ${I(`left:50%;top:46%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:#fff;box-shadow:0 0 18px #fff, 0 0 46px ${rgba(G.ha, 0.85)}, 0 0 90px ${rgba(G.accent, 0.6)};opacity:0;animation:bx-flareCore .6s cubic-bezier(.16,1,.3,1) .9s both;`)}
  </div>`;
}

/**
 * Warp out. Resolves at the moment of collapse — that is when the caller
 * signs out, so the sign-in screen is already underneath as the dark lifts.
 */
export function playSignOut(): Promise<void> {
  if (!active()) return Promise.resolve();

  // Each bundle says goodbye its own way: Galaxy warps out, Cyberpunk
  // switches off like an old CRT.
  const html = signOutFor(bundleState().id) || warpHtml();

  const el = document.createElement('div');
  el.className = 'boutro';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Signing you out');
  el.innerHTML = html;
  document.body.appendChild(el);

  window.setTimeout(() => el.classList.add('leaving'), 1250);
  window.setTimeout(() => el.remove(), 1800);
  return wait(1050);
}
