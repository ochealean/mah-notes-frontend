// ============================================================
//  The collection screen.
//
//  The one place in Mah Notes meant to be browsed for pleasure rather
//  than used, so it gets the most design attention per pixel.
//
//  Free changes what this screen is for. Discord's shop exists to create
//  desire, because desire converts to money; this exists to make the app
//  feel like the user's own. So: everything is visible, everything is
//  equippable, nothing is timed, and nothing is locked behind a blurred
//  preview. There is no rarity, no "Pro", and no countdown.
//
//  Three things the skill insists on, all here:
//   · tiles preview LIVE, on the viewer's OWN avatar — the motion is the
//     product and a screenshot of it is not, and people want to see
//     themselves rather than a stock face
//   · tapping previews across the whole screen before committing, because
//     trying bundles on is the enjoyable part
//   · only tiles in view animate, so a grid that grows to twenty does not
//     drop frames on the mid-range Android most people actually hold
// ============================================================
import { useEffect, useRef, useState } from 'react';
import BundleAvatar from './BundleAvatar';
import BundleBackground from './BundleBackground';
import {
  BUNDLES, equippedId, equippedIntensity, getBundle,
  loadIntensity, saveBundleId, saveIntensity, subscribeBundle,
  type Intensity,
} from '../lib/bundles';
import { replayIntro } from '../lib/introGate';

const INTENSITIES: { key: Intensity; label: string }[] = [
  { key: 'full', label: 'Full' },
  { key: 'subtle', label: 'Subtle' },
  { key: 'off', label: 'Off' },
];

/** One tile. Animates only while it is on screen. */
function Tile({
  bundle, equipped, previewing, avatar, initial, onPick,
}: any) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const [idle, setIdle] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setIdle(false); return undefined; }
    const io = new IntersectionObserver(
      ([entry]) => setIdle(!entry.isIntersecting),
      { rootMargin: '80px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className={`bcol-tile${previewing ? ' active' : ''}`}
      data-bundle={bundle.id}
      data-idle={idle ? '1' : '0'}
      aria-pressed={previewing}
      onClick={() => onPick(bundle.id)}
    >
      {/* Tiles preview at full intensity whatever the daily setting is:
          this is the shop window, not the living room. */}
      <BundleBackground bundleId={bundle.id} intensity="full" />
      {equipped && <span className="bcol-equipped">Equipped</span>}
      <span className="bcol-stage">
        <BundleAvatar size={64} bundleId={bundle.id}>
          {avatar
            ? <img className="bcol-face" src={avatar} alt="" />
            : <span className="bcol-face">{initial}</span>}
        </BundleAvatar>
      </span>
      <span className="bcol-name">{bundle.name}</span>
      <span className="bcol-tag">{bundle.tagline}</span>
    </button>
  );
}

export default function BundleCollection({ user }: any) {
  const name = user?.displayName || (user?.email || 'You').split('@')[0];
  const initial = (name[0] || 'U').toUpperCase();

  const [equipped, setEquipped] = useState(() => equippedId());
  const [intensity, setIntensity] = useState<Intensity>(() => loadIntensity());
  // What the whole screen is currently wearing. Null means "showing what
  // is equipped"; anything else is a try-on that has not been committed.
  const [preview, setPreview] = useState<string | null>(null);

  // Equipping elsewhere (or on another surface) keeps this in step.
  useEffect(() => subscribeBundle(() => {
    setEquipped(equippedId());
    setIntensity(equippedIntensity());
  }), []);

  const shown = preview || equipped;
  const shownBundle = getBundle(shown);
  const dirty = preview !== null && preview !== equipped;

  function equip() {
    // Applies instantly and optimistically — no reload, no confirmation
    // dialog. A cosmetic choice that asks "are you sure" is a cosmetic
    // choice nobody tries twice.
    saveBundleId(shown);
    setEquipped(shown);
    setPreview(null);
    // And plays its intro, which is the best possible confirmation: you
    // see the thing you just chose, immediately, instead of a toast telling
    // you it happened.
    replayIntro();
  }

  return (
    <div className="bcol bnb-host" data-bundle={shown} data-intensity={intensity}>
      <BundleBackground bundleId={shown} intensity={intensity} />

      <p className="bcol-intro">
        Every bundle is free and always will be. Pick one to try it on — nothing
        is applied until you equip it.
      </p>

      <div className="bcol-grid">
        {BUNDLES.map((b) => (
          <Tile
            key={b.id}
            bundle={b}
            equipped={b.id === equipped}
            previewing={b.id === shown}
            avatar={user?.avatar}
            initial={initial}
            onPick={(id: string) => setPreview(id === equipped ? null : id)}
          />
        ))}
      </div>

      {dirty && (
        <div className="bcol-tryon">
          <span className="bcol-tryon-label">
            Trying on <b>{shownBundle.name}</b>
          </span>
          <button type="button" className="btn btn-ghost bcol-tryon-btn" onClick={() => setPreview(null)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary bcol-tryon-btn" onClick={equip}>
            Equip
          </button>
        </div>
      )}

      <div className="bcol-sub-label">Motion</div>
      <div className="bcol-intensity">
        {INTENSITIES.map((i) => (
          <button
            key={i.key}
            type="button"
            className={`bcol-int-btn${intensity === i.key ? ' on' : ''}`}
            onClick={() => { saveIntensity(i.key); setIntensity(i.key); }}
          >
            {i.label}
          </button>
        ))}
      </div>
      <p className="bcol-hint">
        Background motion only. Subtle is the default — people pick a bundle for
        how it looks here, then want it calmer all day. Off keeps every bundle&rsquo;s
        still composition, and your system&rsquo;s reduced-motion setting already
        does this on its own.
      </p>

      <div className="bcol-sub-label">Intro</div>
      <p className="bcol-hint">
        Plays once each time you open Mah Notes, and every time someone opens a
        link you shared.
      </p>
      <button type="button" className="bcol-replay" onClick={() => replayIntro()}>
        <i className="fas fa-play" /> Play it again
      </button>

      <div className="bcol-sub-label">Where it shows</div>
      <p className="bcol-hint">
        Your profile, the card people see when you share a link, your friends
        list, and the cursor while you type. Never behind a note you are reading
        or the quick-capture panel.
      </p>
    </div>
  );
}
