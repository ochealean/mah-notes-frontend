// ============================================================
//  Which bundle paints what.
//
//  Every surface that draws a bundle asks here by the bundle's id — the
//  equipped one, or someone else's on a friend card or a shared link — and
//  gets that bundle's own paint. Components never name a bundle, so a new
//  one is a new branch here and a new paint module, nothing more.
// ============================================================
import type { BundleMotion } from './bundles';
import { skyHtml as galaxySky, decorationHtml as galaxyDecoration, tileScapeHtml as galaxyTile, type Decoration, type SkyInput } from './galaxy';
import { citySkyHtml, hudDecorationHtml, cityTileHtml, bootIntroHtml, dataShatterHtml, shutdownHtml, PIXEL_COLOURS } from './cyberpunk';
import { lakeSkyHtml, branchDecorationHtml, lakeTileHtml, sakuraIntroHtml, petalScatterHtml, petalGustHtml, PETAL_COLOURS } from './sakura';

export const skyFor = (id: string, input: SkyInput): string =>
  (id === 'cyberpunk' ? citySkyHtml(input) : id === 'sakura' ? lakeSkyHtml(input) : galaxySky(input));

export const decorationFor = (id: string, size: number, motion: BundleMotion, lowPerf: boolean): Decoration =>
  (id === 'cyberpunk' ? hudDecorationHtml(size, motion, lowPerf)
    : id === 'sakura' ? branchDecorationHtml(size, motion, lowPerf) : galaxyDecoration(size, motion, lowPerf));

/** The preview behind a tile in Settings → Bundles. */
export const tileFor = (id: string, dark: boolean, paper: string, motion: BundleMotion): string =>
  (id === 'cyberpunk' ? cityTileHtml(paper, motion)
    : id === 'sakura' ? lakeTileHtml(dark, paper, motion) : galaxyTile(dark, paper, paper, motion));

/** A bundle's own intro, or null to use Galaxy's (IntroAnimation builds that one). */
export const introFor = (id: string, still: boolean, tagline: string, low: boolean): string | null =>
  (id === 'cyberpunk' ? bootIntroHtml(still, tagline, low) : id === 'sakura' ? sakuraIntroHtml(still, tagline, low) : null);

/** A bundle's own click burst, or null to use Galaxy's star collapse. */
export const burstFor = (id: string, seed: number): string | null =>
  (id === 'cyberpunk' ? dataShatterHtml(seed) : id === 'sakura' ? petalScatterHtml(seed) : null);

/** A bundle's own sign-out overlay, or null to use Galaxy's warp. */
export const signOutFor = (id: string): string | null =>
  (id === 'cyberpunk' ? shutdownHtml() : id === 'sakura' ? petalGustHtml() : null);

/** Colours and shape of the dust a deleted item breaks into. */
/** The editor caret and typing effects. Galaxy's starlight (Cyberpunk wears
    it too, in its own colours), or Sakura's petals — drawn for a light page,
    so nothing arrives white or glowing. */
export type CaretStyle = 'star' | 'petal';
export const caretStyleFor = (id: string): CaretStyle => (id === 'sakura' ? 'petal' : 'star');

export type Dust = { colours: string[]; shape: 'square' | 'petal' };
export const dustFor = (id: string): Dust | null =>
  (id === 'cyberpunk' ? { colours: PIXEL_COLOURS, shape: 'square' }
    : id === 'sakura' ? { colours: PETAL_COLOURS, shape: 'petal' } : null);
