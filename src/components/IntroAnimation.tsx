// ============================================================
//  Intro — "warp arrival".
//
//  A seed of light, warp streaks, the galactic band wiping in across the
//  whole screen, the feather, "Mah Notes" letter by letter, a glint that
//  crosses the feather and then the word, then the tagline.
//  About 3.6 seconds, skippable on any tap or key.
//
//  Two things make it safe to put in front of a notes app:
//   1. It is an OVERLAY over an already-mounted app, never a gate in front
//      of one. The app renders underneath from the first frame.
//   2. It never plays on the capture path (/toast, /clip-panel) — see
//      lib/introGate, which refuses those routes structurally.
//
//  A bundle without an intro (Default) plays nothing at all. A shared link
//  plays the SENDER's bundle, from the link's ?b=.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { armIntroForSignIn, introFinished, onIntroReplay, shouldPlayIntro } from '../lib/introGate';
import { getBundle, useBundle, isLowPerf } from '../lib/bundles';
import { G, rgba, rnd, nmask, logoMarkHtml } from '../lib/galaxy';
import { introFor } from '../lib/bundleArt';

const RUN_MS = 3600;
const POSTER_MS = 1400;
const SKIP_MS = 300;

const f2 = (n: number) => (+n).toFixed(2);
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const I = (css: string, inner = '') => `<i style="${escAttr(css)}">${inner}</i>`;

// ── The galactic band ───────────────────────────────────
// The diagonal light is the Milky Way seen edge-on, so it is built the way
// the sky's band is (lib/galaxy): a diffuse glow brightest along its spine,
// vapour torn by fractal noise, a warm bulge at the core — right behind the
// mark — a dark dust lane down the middle, and a grain of stars. It spans the
// whole screen, because a band of sky has no ends. And it is alive for the
// whole intro: it slides slowly along itself, the vapour breathes, the stars
// twinkle, and a glint of light runs its length once it has settled.
// Android keeps the glow, the core, the stars and the glint, and drops the
// masked, blurred vapour and dust, which are the expensive part.
function bandHtml(still: boolean, low: boolean) {
  const r = rnd(141); const R = (a: number, b: number) => a + r() * (b - a);
  const once = (n: string, dur: number, dl: number, ease = 'cubic-bezier(.16,1,.3,1)') => (still ? '' : `animation:bx-${n} ${f2(dur)}s ${ease} ${f2(dl)}s both;`);
  const loop = (n: string, dur: number, dl: number, ease = 'ease-in-out') => (still ? '' : `animation:bx-${n} ${f2(dur)}s ${ease} ${f2(dl)}s infinite both;`);
  const along = 'linear-gradient(90deg, transparent 2%, #000 30%, #000 70%, transparent 98%)';
  let b = '';

  // 1 · the glow: brightest down the spine, fading toward both ends
  b += I(`inset:0;background:linear-gradient(180deg, transparent 6%, ${rgba(G.soft, 0.07)} 26%, ${rgba(G.dust, 0.18)} 43%, ${rgba(G.core, 0.26)} 50%, ${rgba(G.dust, 0.18)} 57%, ${rgba(G.soft, 0.07)} 74%, transparent 94%);-webkit-mask-image:${along};mask-image:${along};${loop('shine', 3.4, 0)}`);

  // 2 · vapour — clouds of gas strung along the spine
  if (!low) {
    ([[18, 17, 70, G.dust, 0.3], [31, 15, 84, G.soft, 0.34], [44, 14, 96, G.core, 0.28], [57, 15, 90, G.soft, 0.32], [70, 17, 78, G.dust, 0.28], [82, 15, 62, G.haze, 0.26]] as const)
      .forEach(([x, w, h, c, a], i) => {
        b += I(`left:${x - w / 2}%;top:${50 - h / 2}%;width:${w}%;height:${h}%;background:radial-gradient(closest-side, ${rgba(c, a)} 0%, ${rgba(c, a * 0.5)} 50%, transparent 100%);${nmask(211 + i * 9, '0.012 0.03', 4, 50, 50, '170% 170%', `${(i * 23 + 11) % 100}% ${(i * 37 + 7) % 100}%`)}filter:blur(${f2(R(3, 5))}px) contrast(1.3);${loop('gasRipple', R(5, 8), -R(0, 4))}`);
      });
  }

  // 3 · the bulge: a warm core where the band crosses the middle
  b += I(`left:43%;top:-12%;width:14%;height:124%;border-radius:50%;background:radial-gradient(closest-side, rgba(255,255,255,.34) 0%, ${rgba(G.ember, 0.2)} 30%, ${rgba(G.dust, 0.1)} 58%, transparent 100%);filter:blur(10px);${loop('radiate', 4.2, 0.4)}`);

  // 4 · the dust lane: a dark rift down the spine, just off centre
  if (!low) {
    ([[12, 34, 45, 22, 1.5, 0.72], [38, 30, 49, 18, -2, 0.62], [61, 28, 43, 21, 2.5, 0.56]] as const).forEach(([x, w, tp, hh, rot, a], i) => {
      b += I(`left:${x}%;top:${tp}%;width:${w}%;height:${hh}%;transform:rotate(${rot}deg);mix-blend-mode:multiply;`,
        I(`inset:0;background:radial-gradient(ellipse 50% 50% at 50% 50%, ${rgba(G.deep, a)} 0%, ${rgba(G.deep, a * 0.5)} 55%, transparent 100%);${nmask(263 + i * 7, '0.018 0.05', 4, 50, 50, '160% 190%', `${(i * 31 + 13) % 100}% ${(i * 19 + 41) % 100}%`)}filter:blur(${f2(R(2.5, 3.5))}px);--bxd:${f2(R(-2, 2))}%;--byd:${f2(R(-6, 6))}%;--bsc:${f2(R(1.04, 1.1))};${loop('billow', R(5, 7), -R(0, 3))}`));
    });
  }

  // 5 · star grain — a bell curve about the spine, finer toward the ends
  const n = low ? 70 : 150;
  for (let i = 0; i < n; i++) {
    const x = R(6, 94); const y = 50 + (r() + r() + r() - 1.5) * 30;
    const near = 1 - (Math.abs(x - 50) / 50) * 0.5;
    const sz = 0.5 + r() * 1.4 * near;
    const q = r(); const c = q < 0.1 ? G.ha : q < 0.22 ? G.spark : G.core;
    const glow = r() < 0.12;
    b += I(`left:${f2(x)}%;top:${f2(y)}%;width:${f2(sz)}px;height:${f2(sz)}px;border-radius:50%;background:${rgba(c, R(0.5, 1))};${glow ? `box-shadow:0 0 ${f2(sz * 3)}px ${rgba(c, 0.75)};` : ''}${r() < 0.7 ? loop('twinkle', R(1.6, 4), -R(0, 3)) : ''}`);
  }

  // 6 · a few bright stars. Diffraction spikes belong to the camera, not
  //     the sky, so they are turned back upright against the band's tilt.
  for (let i = 0; i < 3; i++) {
    const sz = R(1.8, 2.8); const L = 16 * sz; const tint = i % 2 ? G.spark : G.ember; const dd = R(2.4, 3.6);
    b += I(`left:${f2(R(24, 76))}%;top:${f2(50 + (r() + r() - 1) * 18)}%;width:0;height:0;transform:rotate(33deg);`,
      I(`left:${f2(-L / 2)}px;top:-.35px;width:${f2(L)}px;height:.7px;background:linear-gradient(90deg, transparent, rgba(255,255,255,.9) 50%, transparent);${loop('spike', dd, 0)}`)
      + I(`left:-.35px;top:${f2(-L / 2)}px;width:.7px;height:${f2(L)}px;background:linear-gradient(180deg, transparent, rgba(255,255,255,.9) 50%, transparent);${loop('spikeV', dd, 0.3)}`)
      + I(`left:${f2(-sz / 2)}px;top:${f2(-sz / 2)}px;width:${f2(sz)}px;height:${f2(sz)}px;border-radius:50%;background:#fff;box-shadow:0 0 ${f2(2.2 * sz)}px #fff, 0 0 ${f2(6 * sz)}px ${rgba(tint, 0.8)};`));
  }

  // 7 · the glint: a soft swell of light running the band's length
  if (!still) {
    b += I(`left:0;top:14%;width:20%;height:72%;--gx:500%;background:radial-gradient(closest-side, rgba(255,255,255,.5) 0%, ${rgba(G.core, 0.26)} 36%, ${rgba(G.soft, 0.08)} 64%, transparent 100%);filter:blur(7px);opacity:0;animation:bx-bandGlint 2.3s cubic-bezier(.45,.05,.35,1) .95s both;`);
  }

  // The tilt and the wipe-in live on the outer box, the slow slide on the
  // inner one, so neither transform overwrites the other.
  return `<div class="bintro-band" aria-hidden="true">${I(`left:-85vmax;top:-15vmin;width:170vmax;height:30vmin;transform:rotate(-33deg);${once('bandWipe', 1.6, 0.22)}`,
    I(`inset:0;${once('bandDrift', 3.6, 0.2, 'linear')}`, b))}</div>`;
}

// Built as one static string: a few hundred one-shot elements that React
// never needs to reconcile. `still` renders the composed end frame with no
// motion.
function introHtml(still: boolean, tagline: string, low: boolean) {
  const r = rnd(77); const R = (a: number, b: number) => a + r() * (b - a);
  const E = 'cubic-bezier(.16,1,.3,1)';
  const an = (n: string, dur: number, dl: number, ease = E) => (still ? '' : `animation:bx-${n} ${dur}s ${ease} ${f2(dl)}s both;`);
  const cols = [G.core, G.spark, G.ha];
  let streaks = ''; let stars = '';
  for (let i = 0; i < 46; i++) {
    const ang = i * 7.83 + R(-6, 6); const len = R(26, 70); const th = R(0.7, 1.8);
    const c = cols[(r() * 3) | 0]; const s0 = R(14, 30); const s1 = R(118, 244);
    const dur = R(0.9, 1.4); const dl = R(0, 0.34);
    if (!still) {
      streaks += I(`left:50%;top:46%;width:0;height:0;transform:rotate(${f2(ang)}deg);`,
        I(`left:0;top:${f2(-th / 2)}px;width:${f2(len)}px;height:${f2(th)}px;transform-origin:0 50%;--s0:${f2(s0)}px;--s1:${f2(s1)}px;background:linear-gradient(90deg, transparent, ${rgba(c, 0.82)} 56%, ${rgba(G.core, 0.95)});opacity:0;${an('streakFly', dur, dl)}`));
    }
    // Stars land at 62% of each streak's end radius, the plane squashed ×0.52.
    const rad = 0.62 * s1; const a = (ang * Math.PI) / 180;
    const x = Math.cos(a) * rad; const y = Math.sin(a) * rad * 0.52; const ss = R(1, 2.4); const so = R(0.45, 1);
    stars += I(`left:calc(50% + ${f2(x - ss / 2)}px);top:calc(46% + ${f2(y - ss / 2)}px);width:${f2(ss)}px;height:${f2(ss)}px;border-radius:50%;background:${c === G.ha ? G.ha : G.core};box-shadow:0 0 ${f2(ss * 2)}px ${rgba(c, 0.8)};--so:${f2(so)};opacity:${f2(so)};${an('starLand', 0.8, 0.62 + (i / 46) * 0.5)}`);
  }
  const letters = 'Mah Notes'.split('').map((ch, i) => `<span class="bintro-l" style="${escAttr(an('letterUp', 0.72, 0.66 + i * 0.055))}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  // The glint on the word: the same text laid exactly over the letters, lit
  // only where a narrow diagonal band of light passes (background-clip:
  // text), so the shine lands on the glyphs and nowhere else. It follows the
  // sheen across the feather, as if one light swept past both.
  const glint = still ? '' : `<span class="bintro-glint" aria-hidden="true" style="${escAttr(an('glint', 0.95, 1.8, 'cubic-bezier(.45,.05,.3,1)'))}">Mah&nbsp;Notes</span>`;
  return `${bandHtml(still, low)}<div class="bintro-stage">
    ${still ? '' : I(`left:50%;top:46%;width:340px;height:340px;margin:-170px 0 0 -170px;border-radius:50%;background:radial-gradient(circle, ${rgba(G.natal, 0.34)} 0%, ${rgba(G.ha, 0.2)} 26%, ${rgba(G.accent, 0.16)} 48%, transparent 70%);opacity:0;${an('haloBloom', 1.8, 0.1)}`)}
    ${streaks}${stars}
    ${still ? '' : I(`left:50%;top:46%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#fff;box-shadow:0 0 16px #fff, 0 0 46px ${rgba(G.ha, 0.8)}, 0 0 90px ${rgba(G.accent, 0.6)};opacity:0;${an('flareCore', 1.5, 0)}`)}
    ${logoMarkHtml(an('markPop', 0.82, 0.34), an('logoGlint', 0.8, 1.2, 'cubic-bezier(.45,.05,.3,1)'))}
    <div class="bintro-word"><span class="bintro-w">${letters}${glint}</span></div>
    <div class="bintro-tag"><span style="${escAttr(an('tagWipe', 0.9, 1.3))}">${tagline.replace(/\.$/, '')}</span></div>
    <div class="bintro-skip"><span style="${escAttr(an('tagWipe', 0.6, 2, 'ease'))}">Tap to skip</span></div>
  </div>`;
}

export default function IntroAnimation() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { user, ready } = (useAuth() || {}) as any;
  const b = useBundle();

  // A shared link shows the SENDER's bundle, including their intro.
  const bundle = getBundle(pathname === '/view' ? params.get('b') : b.id);
  const [playing, setPlaying] = useState(() => bundle.intro && shouldPlayIntro(pathname));
  const [leaving, setLeaving] = useState(false);
  // Bumped to replay; used as a key so every CSS animation restarts.
  const [run, setRun] = useState(0);

  // The share page always performs; the app honours "Off" with a still frame.
  const still = b.reduced || (pathname !== '/view' && b.effectiveMotion === 'off');
  // A bundle's own intro (Cyberpunk boots up), else Galaxy's warp arrival.
  const html = useMemo(
    () => introFor(bundle.id, still, bundle.tagline, isLowPerf()) ?? introHtml(still, bundle.tagline, isLowPerf()),
    [bundle.id, still, bundle.tagline],
  );

  const finish = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => { setPlaying(false); setLeaving(false); introFinished(pathname); }, SKIP_MS);
  }, [pathname]);

  // Auto-dismiss, timed to the overlay's own fade-out.
  useEffect(() => {
    if (!playing) return undefined;
    const t = window.setTimeout(() => { setPlaying(false); introFinished(pathname); }, still ? POSTER_MS : RUN_MS);
    return () => window.clearTimeout(t);
  }, [playing, run, still, pathname]);

  // Skippable on anything. Attached a tick later so the tap that started a
  // replay cannot also end it.
  useEffect(() => {
    if (!playing) return undefined;
    const skip = () => finish();
    const id = window.setTimeout(() => {
      window.addEventListener('keydown', skip, true);
      window.addEventListener('pointerdown', skip, true);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', skip, true);
      window.removeEventListener('pointerdown', skip, true);
    };
  }, [playing, run, finish]);

  // Equipping a bundle, or "Play it again", plays it on the spot.
  useEffect(() => onIntroReplay(() => {
    setRun((n) => n + 1);
    setLeaving(false);
    setPlaying(true);
  }), []);

  // A fresh sign-in replays it. On a cold load a cached session makes `user`
  // go null → id within a frame, which is a session being RESTORED; `ready`
  // flips once the stored token has been checked, so only changes after that
  // count as a sign-in.
  const [baseline, setBaseline] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    const id = user?.id ? String(user.id) : null;
    if (baseline === undefined) { setBaseline(id); return; }
    if (baseline === null && id) {
      armIntroForSignIn();
      setBaseline(id);
      setRun((n) => n + 1);
      setLeaving(false);
      setPlaying(true);
    } else if (baseline !== id) {
      setBaseline(id);
    }
  }, [ready, user?.id, baseline]);

  if (!playing || !bundle.intro) return null;

  return (
    <div
      key={run}
      className={`bintro${leaving ? ' leaving' : ''}${still ? ' still' : ''}`}
      data-bscope={bundle.id}
      role="presentation"
      onClick={finish}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
