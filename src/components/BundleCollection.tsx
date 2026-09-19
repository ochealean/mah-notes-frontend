// ============================================================
//  Settings → Bundles. The one screen in Mah Notes meant to be browsed
//  for pleasure rather than used.
//
//  Every bundle is free FOR NOW — for a limited time, not forever: bundles
//  are planned to cost Ads Amount Coins later (see the design note beside
//  the repos, notes/bundles-coins-and-catalogue.md). So the copy never
//  promises "free forever". While they are free, everything is visible,
//  everything is equippable, and nothing hides behind a blurred preview.
//
//   · Tiles preview LIVE, on your OWN avatar, at full motion — the shop
//     window, not the living room.
//   · Tapping a tile tries it on across this whole screen; Equip commits.
//     No confirmation dialog: a cosmetic choice that asks "are you sure" is
//     one nobody tries twice.
//   · Equipping plays the bundle's intro, which is a better confirmation
//     than any toast.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { resolveTheme } from '../lib/palette';
import BundleAvatar, { Face } from './BundleAvatar';
import { useGround } from './BundleSky';
import {
  BUNDLES, getBundle, equipBundle, setBundleMotion, useBundle, isLowPerf,
  type Bundle, type BundleMotion,
} from '../lib/bundles';
import { tierFor } from '../lib/galaxy';
import { tileFor } from '../lib/bundleArt';
import { replayIntro } from '../lib/introGate';

const MOTIONS: { key: BundleMotion; label: string }[] = [
  { key: 'full', label: 'Full' },
  { key: 'subtle', label: 'Subtle' },
  { key: 'off', label: 'Off' },
];

function Tile({ bundle, equipped, active, user, onPick }: { bundle: Bundle; equipped: boolean; active: boolean; user: any; onPick: (id: string) => void }) {
  const b = useBundle();
  // Each tile previews its bundle on the bundle's OWN ground — Galaxy's tile
  // is deep space even while you are wearing Default in a light theme.
  const g = useGround(bundle.theme ? resolveTheme(bundle.theme) : null);
  const m: BundleMotion = b.reduced ? 'off' : 'full';
  const scape = useMemo(() => (bundle.sky ? tileFor(bundle.id, g.dark, g.paper, m) : ''), [bundle.id, bundle.sky, g.dark, g.paper, m]);
  const name = user?.displayName || user?.username || 'You';

  return (
    <button type="button" className={`bcol-tile${active ? ' active' : ''}`} aria-pressed={active} onClick={() => onPick(bundle.id)}
      data-bscope={bundle.id}>
      <span className="bcol-pv">
        {scape && <span className="bcol-scape" aria-hidden="true" dangerouslySetInnerHTML={{ __html: scape }} />}
        <span className="bcol-av">
          <BundleAvatar size={64} bundleId={bundle.id} motion={m}><Face src={user?.avatar} name={name} /></BundleAvatar>
        </span>
      </span>
      <span className="bcol-body">
        <span className="bcol-name">
          {bundle.name}
          {equipped && <span className="bcol-chip">Equipped</span>}
          {!equipped && active && <span className="bcol-chip ghost">Trying on</span>}
        </span>
        <span className="bcol-tag">{bundle.tagline}</span>
        <span className="bcol-cv">{bundle.caveat}</span>
      </span>
    </button>
  );
}

type Props = { user: any; onShareCard: (bundleId: string) => void };

export default function BundleCollection({ user, onShareCard }: Props) {
  const b = useBundle();
  // What the screen is wearing. Null means "what is equipped"; anything else
  // is a try-on that has not been committed.
  const [preview, setPreview] = useState<string | null>(null);
  const shown = getBundle(preview || b.id);
  const dirty = preview !== null && preview !== b.id;
  const name = user?.displayName || user?.username || 'You';

  // Trying a bundle on wears its whole look — its colours as well as its
  // decoration — across the app until you equip it or cancel. Leaving this
  // screen always takes the try-on off.
  const { setBundlePreview } = useTheme();
  useEffect(() => { setBundlePreview(dirty ? preview : null); }, [dirty, preview, setBundlePreview]);
  useEffect(() => () => setBundlePreview(null), [setBundlePreview]);

  function pick(id: string) {
    if (id === b.id) {
      // The equipped tile replays its own intro.
      setPreview(null);
      if (getBundle(id).intro) replayIntro();
      return;
    }
    setPreview(id);
  }

  function equip() {
    equipBundle(shown.id);
    setPreview(null);
    if (shown.intro) replayIntro();
  }

  return (
    <div className="bcol" data-bscope={shown.id}>
      <p className="bcol-lead">
        Every bundle is free for a limited time. A bundle is a whole look — its own colours
        and its own decoration, made to go together. Pick one to try it on; nothing is saved
        until you equip it, and your own colours come back whenever you equip Default.
      </p>

      <div className="bcol-grid">
        {BUNDLES.map((bd) => (
          <Tile key={bd.id} bundle={bd} equipped={bd.id === b.id} active={bd.id === shown.id} user={user} onPick={pick} />
        ))}
      </div>

      {dirty && (
        <div className="bcol-tryon" role="status">
          <span>Trying on <b>{shown.name}</b></span>
          <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={equip}>Equip</button>
        </div>
      )}

      {shown.decoration && (
        <section className="bcol-block">
          <div className="kicker">Decoration</div>
          <p className="bcol-hint">{shown.decorationHint}</p>
          <div className="bcol-tiers">
            {[28, 44, 64, 112].map((s) => (
              <figure key={s} className="bcol-tier">
                <BundleAvatar size={s} bundleId={shown.id}><Face src={user?.avatar} name={name} /></BundleAvatar>
                <figcaption>{tierFor(s)} · {s}px</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="bcol-block">
        <div className="kicker">Motion</div>
        <div className="bmotion" role="group" aria-label="Bundle motion">
          {MOTIONS.map((m) => (
            <button key={m.key} type="button" aria-pressed={b.motion === m.key} onClick={() => setBundleMotion(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="bcol-hint">
          {b.reduced
            ? 'Your device asks for reduced motion, so every bundle holds its still composition whatever you pick here.'
            : 'Subtle is the default: it slows every cycle and dims the sky. Off keeps the still composition — nothing moves, nothing is lost.'}
          {isLowPerf() && shown.sky ? ' On Android the large nebula layers stay still to keep scrolling smooth.' : ''}
        </p>
      </section>

      <section className="bcol-cols">
        <div>
          <div className="kicker">Intro</div>
          <p>
            {shown.intro
              ? 'Plays once each time Mah Notes opens, again after a fresh sign-in, and every time someone opens a link you shared. Never on the Alt+N toast or the paste panel.'
              : `${shown.name} has no intro — the app opens straight onto your notes.`}
          </p>
          <button type="button" className="btn btn-ghost" disabled={!shown.intro || dirty} onClick={() => replayIntro()}>
            <i className="fas fa-play" /> Play it again
          </button>
        </div>
        <div>
          <div className="kicker">Where it shows</div>
          <p>
            {shown.sky
              ? 'Behind your list, on your profile, on the card people see when you share a link, and on the buttons you press. Never behind a note you are reading or the quick-capture panel.'
              : 'Nowhere. Shared links open straight on the note, and the app wears only your colour theme.'}
          </p>
          <button type="button" className="btn btn-ghost" disabled={!shown.sky} onClick={() => onShareCard(shown.id)}>
            <i className="fas fa-arrow-up-from-bracket" /> Preview your share card
          </button>
        </div>
      </section>
    </div>
  );
}
