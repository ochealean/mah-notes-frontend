// ============================================================
//  BundleSky — the ambient layer behind an identity surface.
//
//  Allowed behind: the rail, the account header, the bundle tiles and the
//  share card. NEVER behind the editor, the reading pane or the capture
//  panel — text you are reading and ambient motion do not share space.
//
//  The host element needs `position: relative` (or absolute) and its own
//  content above z-index 0; this component only draws the layer. It renders
//  nothing at all for a bundle without a sky, so the Default bundle costs
//  zero nodes.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { resolveTheme, isDarkColor } from '../lib/palette';
import { useBundle, getBundle, isLowPerf, type BundleMotion } from '../lib/bundles';
import { type SkyPreset } from '../lib/galaxy';
import { skyFor } from '../lib/bundleArt';

export type Ground = { ink: string; paper: string; paper2?: string };

/** The colours the sky is painted against: the reader's theme, unless a
    shared page is showing the author's. */
export function useGround(override?: Ground | null) {
  const { applied } = useTheme() || ({} as any);
  const t = override || resolveTheme(applied);
  return { ink: t.ink, paper: t.paper, dark: isDarkColor(t.paper) };
}

type Props = {
  preset: SkyPreset;
  /** Whose bundle to draw. Defaults to the equipped one; a share card passes the SENDER's. */
  bundleId?: string;
  /** Overrides the daily motion setting — a share card performs at full. */
  motion?: BundleMotion;
  ground?: Ground | null;
  className?: string;
  /** Vary the layout between several skies on one screen. */
  seed?: number;
  /** Draw only while on screen — for skies in a scrolling list. */
  lazy?: boolean;
};

export default function BundleSky({ preset, bundleId, motion, ground, className = '', seed, lazy = false }: Props) {
  const b = useBundle();
  const bundle = getBundle(bundleId ?? b.id);
  const g = useGround(ground);
  // Reduced motion always wins, even over a surface that asks for full.
  const m: BundleMotion = b.reduced ? 'off' : (motion || b.effectiveMotion);

  // A list of friends can hold many skies. Only the ones near the screen are
  // built at all; the rest are an empty layer until they scroll into view.
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(!lazy);
  useEffect(() => {
    if (!lazy || !hostRef.current || typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '160px' });
    io.observe(hostRef.current);
    return () => io.disconnect();
  }, [lazy]);

  const html = useMemo(() => (bundle.sky && inView
    ? skyFor(bundle.id, { preset, dark: g.dark, paper: g.paper, ink: g.ink, motion: m, lowPerf: isLowPerf(), seed })
    : ''), [bundle.id, bundle.sky, inView, preset, g.dark, g.paper, g.ink, m, seed]);
  if (!bundle.sky) return null;
  if (!html && !lazy) return null;
  return <div ref={hostRef} className={`bsky ${className}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}
