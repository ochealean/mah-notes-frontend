// ============================================================
//  BundleAvatar — wraps an avatar in a bundle's decoration.
//
//  Used at every size, so it has to be impossible to get wrong:
//
//   · It reserves the full 1.25× canvas whatever bundle is equipped, so
//     switching bundles never shifts the layout around it.
//   · It degrades by size on its own (see tierFor): a static ring at 28px,
//     one orbiting body in lists, the whole system on a profile or card.
//   · Stacking, bottom to top: the distant system and dust ring, the photo,
//     then the rim, corona and orbiting bodies. The centre 70% of the face
//     stays clear at every size.
//   · The decoration is pointer-events: none, so it can never swallow the
//     click that opens the file picker underneath it.
// ============================================================
import { useMemo, type ReactNode } from 'react';
import { useBundle, getBundle, isLowPerf, type BundleMotion } from '../lib/bundles';
import { decorationFor } from '../lib/bundleArt';

type Props = {
  /** The avatar's rendered diameter in px. Decides the tier. */
  size: number;
  /** Whose bundle to draw. Defaults to the equipped one. */
  bundleId?: string;
  /** Overrides the daily motion setting (collection tiles preview at full). */
  motion?: BundleMotion;
  children: ReactNode;
  className?: string;
};

export default function BundleAvatar({ size, bundleId, motion, children, className = '' }: Props) {
  const b = useBundle();
  const bundle = getBundle(bundleId ?? b.id);
  const m: BundleMotion = b.reduced ? 'off' : (motion || b.effectiveMotion);
  const deco = useMemo(
    () => (bundle.decoration ? decorationFor(bundle.id, size, m, isLowPerf()) : null),
    [bundle.id, bundle.decoration, size, m],
  );
  const D = size * 1.25;
  const off = (D - size) / 2;

  return (
    <span className={`bav ${className}`} data-tier={deco?.tier || 'none'} style={{ width: D, height: D }}>
      {deco && <span className="bav-l" aria-hidden="true" dangerouslySetInnerHTML={{ __html: deco.back }} />}
      <span className="bav-face" style={{ left: off, top: off, width: size, height: size }}>{children}</span>
      {deco && <span className="bav-l bav-front" aria-hidden="true" dangerouslySetInnerHTML={{ __html: deco.front }} />}
    </span>
  );
}

/** The photo, or the initial on the accent when there is none. */
export function Face({ src, name }: { src?: string; name?: string }) {
  const initial = ((name || 'U').trim()[0] || 'U').toUpperCase();
  return src
    ? <img className="bav-img" src={src} alt="" />
    : <span className="bav-img bav-initial">{initial}</span>;
}
