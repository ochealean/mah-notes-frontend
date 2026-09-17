// ============================================================
//  BundleAvatar — wraps an avatar in the equipped bundle's decoration.
//
//  Used everywhere an avatar appears, at every size, so it has to be
//  impossible to get wrong:
//
//   · It never sizes or restyles the avatar it wraps. The wrapper takes
//     its size FROM the child, and the whole decoration canvas comes from
//     percentage insets, so it cannot disagree with whatever CSS the
//     component already has for .settings-avatar / .friend-avatar / etc.
//     A bundle that needs its own rule for an avatar is a bundle that
//     breaks at the next component change.
//   · It degrades by size on its own. Pass the size, get the right tier:
//     a static ring at 24px, a ring plus one body in lists, the whole
//     system on a profile or a share card.
//   · pointer-events: none, so the decoration can never swallow the click
//     that opens the file picker underneath it.
//
//  Galaxy's decoration, bottom to top: a small solar system drifting
//  behind the rim (devices around one centre), the dust ring (everything
//  ever caught), the rim, then the captured bodies in orbit.
// ============================================================
import type { ReactNode } from 'react';
import { equippedId, getBundle, tierFor } from '../lib/bundles';

type Props = {
  /** The avatar's rendered diameter in px. Decides the tier. */
  size: number;
  /** Whose bundle to draw. Defaults to the equipped one; the share page
      passes the SENDER's so a reader sees their decoration, not their own. */
  bundleId?: string;
  children: ReactNode;
  className?: string;
};

// Authored irregularity. Identical bodies at even spacing read as a
// progress ring, which is the opposite of the idea — so the sizes
// (as a fraction of the avatar), the orbit radii, the periods and even
// the number of trailing motes are all deliberately uneven, and one body
// runs retrograde.
// `start` is the body's angle at rest. It is what makes the still version
// a composition rather than four dots stacked at twelve o'clock, and the
// keyframes turn a full circle from it so the poster frame and the motion
// are the same arrangement. The angles are as uneven as the sizes.
const BODIES = [
  { szF: 0.088, inset: '1%', dur: '18s', start: '18deg', dir: 'normal', col: 'var(--bundle-spark)', motes: 3 },
  { szF: 0.050, inset: '-3%', dur: '26s', start: '142deg', dir: 'normal', col: 'var(--bundle-core)', motes: 1 },
  { szF: 0.125, inset: '5%', dur: '34s', start: '255deg', dir: 'reverse', col: 'var(--bundle-accent-soft)', motes: 4 },
  { szF: 0.038, inset: '-5%', dur: '21s', start: '331deg', dir: 'normal', col: 'var(--bundle-dust)', motes: 2 },
];

// The devices. Three bodies, one sun, one shared centre — kept small and
// tucked into the canvas's lower-left corner so the system reads as
// something distant behind the rim rather than as a second ring around it.
const PLANETS = [
  { pr: '20%', dur: '26s', szF: 0.036, col: 'var(--bundle-accent-soft)', start: '210deg' },
  { pr: '29%', dur: '40s', szF: 0.05, col: 'var(--bundle-spark)', start: '95deg' },
  { pr: '13%', dur: '17s', szF: 0.028, col: 'var(--bundle-core)', start: '308deg' },
];

// Never smaller than a pixel, or a body vanishes into a rounding error.
const px = (n: number) => `${Math.max(1, Math.round(n * 10) / 10)}px`;

export default function BundleAvatar({ size, bundleId, children, className }: Props) {
  const bundle = getBundle(bundleId ?? equippedId());
  const tier = tierFor(size);

  // Nocturne is the app undecorated — render the avatar and nothing else,
  // rather than an invisible stack of empty layers on every list row.
  if (bundle.avatar.variant === 'none') {
    return <span className={`bav${className ? ` ${className}` : ''}`}>{children}</span>;
  }

  const bodies = tier === 'full' ? BODIES : tier === 'simple' ? BODIES.slice(0, 1) : [];
  const full = tier === 'full';

  return (
    <span
      className={`bav${className ? ` ${className}` : ''}`}
      data-bundle={bundle.id}
      data-tier={tier}
      // Geometry comes from percentage insets, not from this — the canvas
      // has to be able to disagree with nothing. It is here only so glows
      // and haloes can scale with the avatar: a flat blur radius is
      // atmosphere at 112px and a smudge at 24px.
      style={{ '--avatar-size': `${size}px` } as any}
    >
      {children}
      {/* aria-hidden throughout: a decoration must never convey
          information. Not every user has one equipped, so it can't be the
          only signal of anything — presence and sync state stay in the
          functional indicators that sit above it. */}
      <span className="bd" aria-hidden="true">
        {full && (
          <span className="bd-system">
            <i className="bd-sun" style={{ '--bd-sun-sz': px(size * 0.075) } as any} />
            {PLANETS.map((p, i) => (
              <span
                key={i}
                className="bd-sys-orbit"
                style={{ '--bd-pr': p.pr, '--bd-pdur': p.dur, '--bd-start': p.start } as any}
              >
                <i className="bd-planet" style={{ '--bd-psz': px(size * p.szF), '--bd-col': p.col } as any} />
              </span>
            ))}
          </span>
        )}

        {/* The edge, built from five layers rather than one stroke. A
            single flat ring is what made this read as plain: one hue, one
            weight, nothing moving at a different rate from anything else.
            Now there is atmosphere behind it, colour turning slowly through
            it, debris over that, one fast bright sweep, and only then the
            crisp line. */}
        <span className="bd-corona" />
        <span className="bd-aurora" />
        <span className="bd-ring" />
        <span className="bd-arc" />
        <span className="bd-rim" />
        {full && (
          <>
            <span className="bd-twinkle a" />
            <span className="bd-twinkle b" />
          </>
        )}

        {bodies.map((b, i) => {
          const sz = size * b.szF;
          return (
            <span
              key={i}
              className="bd-orbit"
              style={{
                '--bd-in': b.inset,
                '--bd-dur': b.dur,
                '--bd-start': b.start,
                '--bd-dir': b.dir,
              } as any}
            >
              <i className="bd-body" style={{ '--bd-sz': px(sz), '--bd-col': b.col } as any} />
              {/* The wake. Each mote sits a little further back along the
                  same orbit and a little fainter, so the body reads as
                  dragging dust rather than as a dot with a halo. */}
              {Array.from({ length: b.motes }, (_, m) => (
                <i
                  key={m}
                  className="bd-mote"
                  style={{
                    '--bd-msz': px(sz * (0.42 - m * 0.06)),
                    '--bd-md': px(size * (0.06 + m * 0.045)),
                    '--bd-mo': String(0.5 - m * 0.11),
                    '--bd-col': b.col,
                  } as any}
                />
              ))}
            </span>
          );
        })}
      </span>
    </span>
  );
}
