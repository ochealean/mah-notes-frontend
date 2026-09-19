// ============================================================
//  Intro — "warp arrival".
//
//  A seed of light, warp streaks, the galactic band wiping in, the mark,
//  "Mah Notes" letter by letter, a specular flare, then the tagline.
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
import { getBundle, useBundle } from '../lib/bundles';
import { G, rgba, rnd } from '../lib/galaxy';

const RUN_MS = 3600;
const POSTER_MS = 1400;
const SKIP_MS = 300;

const f2 = (n: number) => (+n).toFixed(2);
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const I = (css: string, inner = '') => `<i style="${escAttr(css)}">${inner}</i>`;

// Built as one static string: ~100 one-shot elements that React never needs
// to reconcile. `still` renders the composed end frame with no motion.
function introHtml(still: boolean, tagline: string) {
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
  return `<div class="bintro-stage">
    ${still ? '' : I(`left:50%;top:46%;width:340px;height:340px;margin:-170px 0 0 -170px;border-radius:50%;background:radial-gradient(circle, ${rgba(G.natal, 0.34)} 0%, ${rgba(G.ha, 0.2)} 26%, ${rgba(G.accent, 0.16)} 48%, transparent 70%);opacity:0;${an('haloBloom', 1.8, 0.1)}`)}
    ${I(`left:-30%;top:40.5%;width:160%;height:11%;background:linear-gradient(90deg, transparent, ${rgba(G.dust, 0.3)} 28%, ${rgba(G.core, 0.55)} 50%, ${rgba(G.soft, 0.32)} 72%, transparent);filter:blur(9px);transform:rotate(-33deg);opacity:.85;${an('bandWipe', 1.6, 0.22)}`)}
    ${streaks}${stars}
    ${still ? '' : I(`left:50%;top:46%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#fff;box-shadow:0 0 16px #fff, 0 0 46px ${rgba(G.ha, 0.8)}, 0 0 90px ${rgba(G.accent, 0.6)};opacity:0;${an('flareCore', 1.5, 0)}`)}
    <div class="bintro-mark" style="${escAttr(an('markPop', 0.82, 0.34))}">M</div>
    <div class="bintro-word"><span class="bintro-w">${letters}${still ? '' : I(`left:0;top:0;bottom:0;width:34%;background:linear-gradient(100deg, transparent, rgba(255,255,255,.5) 46%, rgba(70,216,255,.35) 62%, transparent);mix-blend-mode:screen;opacity:0;${an('flareSweep', 1.1, 1.15, 'cubic-bezier(.3,.7,.3,1)')}`)}</span></div>
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
  const html = useMemo(() => introHtml(still, bundle.tagline), [still, bundle.tagline]);

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
      role="presentation"
      onClick={finish}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
