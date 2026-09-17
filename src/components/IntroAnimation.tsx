// ============================================================
//  Intro animation — ignition.
//
//  A core flashes, a shockwave passes, the dust ring and orbits assemble
//  around the app mark, and the wordmark resolves. Galaxy's poster frame,
//  built in front of you.
//
//  Two things make this safe to put in front of a notes app:
//
//  1. It is an OVERLAY over an already-mounted app, never a gate in front
//     of one. The app renders underneath from the first frame, so nothing
//     here delays reaching a note, and it is dismissible on any tap or
//     key for the people who will see it most.
//  2. It never appears on /toast or /clip-panel — the Alt+N capture toast
//     and the Alt+M paste panel. Those windows exist to open instantly;
//     they are the worst place in the product for a flourish, and
//     introGate refuses them structurally rather than by convention.
//
//  When it plays is in lib/introGate.ts: once per run of the software for
//  the owner, and every single load for someone opening a shared link.
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { armIntroForSignIn, introFinished, onIntroReplay, shouldPlayIntro } from '../lib/introGate';
import { equippedId, getBundle, prefersReducedMotion } from '../lib/bundles';
import logoUrl from '../images/mn_logo.png';

// Matches the CSS: the field's own animation fades it at 1480ms over
// 420ms. Reduced motion holds the composed still, then fades.
const RUN_MS = 1900;
const RUN_MS_REDUCED = 1200;
const SKIP_MS = 300;

// Assembled at staggered delays, each on its own period afterwards, so
// the ring never looks like a single spinning object.
const ORBITS = [
  { in: '3%', dur: '13s', delay: '400ms', start: '24deg', sz: 6, col: 'var(--bundle-spark)' },
  { in: '-4%', dur: '21s', delay: '480ms', start: '163deg', sz: 9, col: 'var(--bundle-accent-soft)' },
  { in: '11%', dur: '17s', delay: '560ms', start: '287deg', sz: 4, col: 'var(--bundle-core)' },
];

export default function IntroAnimation() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { user, ready } = useAuth() || ({} as any);

  const [playing, setPlaying] = useState(() => shouldPlayIntro(pathname));
  const [leaving, setLeaving] = useState(false);
  // Bumped to replay. A key on the overlay restarts every CSS animation
  // without any of them needing to be resettable.
  const [run, setRun] = useState(0);

  // A shared link shows the SENDER's bundle, including their intro — it is
  // the one moment the app performs for someone who has never used it, so
  // it performs as the person who sent the link.
  const bundle = getBundle(params.get('b') || equippedId());

  const finish = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => {
      setPlaying(false);
      setLeaving(false);
      introFinished(pathname);
    }, SKIP_MS);
  }, [pathname]);

  // Auto-dismiss. The timer is the same length as the CSS, so the fade the
  // viewer sees is the animation's own, not a second one on top.
  useEffect(() => {
    if (!playing) return undefined;
    const life = prefersReducedMotion() ? RUN_MS_REDUCED : RUN_MS;
    const t = window.setTimeout(() => {
      setPlaying(false);
      introFinished(pathname);
    }, life);
    return () => window.clearTimeout(t);
  }, [playing, run, pathname]);

  // Skippable on anything. Someone who opens this app twenty times a day
  // must be able to get past it without hunting for a control.
  useEffect(() => {
    if (!playing) return undefined;
    const skip = () => finish();
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [playing, finish]);

  // Equipping a bundle plays its intro on the spot. Without this the
  // once-per-run rule hides it at the exact moment someone most wants to
  // see it — they just chose the thing.
  useEffect(() => onIntroReplay(() => {
    setRun((n) => n + 1);
    setLeaving(false);
    setPlaying(true);
  }), []);

  // Signing in replays it.
  //
  // The guard matters: on a cold load a cached session makes `user` go
  // null → id within a frame, which is a session being RESTORED, not a
  // sign-in. AuthContext flips `ready` once the stored token has been
  // checked, so anything after that is a real one.
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

  if (!playing) return null;

  return (
    <div
      key={run}
      className={`intro${leaving ? ' leaving' : ''}`}
      data-bundle={bundle.id}
      role="presentation"
      onClick={finish}
    >
      <div className="intro-stage">
        {/* One luminance change, amplitude-limited — nowhere near the
            three-per-second seizure-safety floor, which is a hard floor
            and not a style preference. */}
        <span className="intro-flash" />
        <span className="intro-wave" />
        <span className="intro-dust" />
        <span className="intro-ring" />
        {ORBITS.map((o, i) => (
          <span
            key={i}
            className="intro-orbit"
            style={{ '--io-in': o.in, '--io-dur': o.dur, '--io-delay': o.delay, '--bd-start': o.start } as any}
          >
            <i className="bd-body" style={{ '--bd-sz': `${o.sz}px`, '--bd-col': o.col } as any} />
            <i className="bd-mote" style={{ '--bd-msz': '3px', '--bd-md': '10px', '--bd-mo': '.45', '--bd-col': o.col } as any} />
            <i className="bd-mote" style={{ '--bd-msz': '2px', '--bd-md': '18px', '--bd-mo': '.25', '--bd-col': o.col } as any} />
          </span>
        ))}
        <img className="intro-mark" src={logoUrl} alt="" />
      </div>

      <div className="intro-word">Mah Notes</div>
      <p className="intro-sub">{bundle.tagline}</p>
      <span className="intro-skip">Tap to skip</span>
    </div>
  );
}
