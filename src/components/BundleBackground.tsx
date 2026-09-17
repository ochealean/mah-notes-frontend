// ============================================================
//  BundleBackground — the ambient layer behind an identity surface.
//
//  Allowed on: the profile panel, the collection screen, the share page.
//  NEVER on the editor, the note list, the capture panel or settings
//  rows. Text and ambient motion do not share space, and the capture
//  path — the whole reason the app exists — stays animation-free beyond
//  its own entrance.
//
//  The host element needs the .bnb-host class (position + stacking); this
//  component only draws the layer.
// ============================================================
import { equippedId, equippedIntensity, getBundle, type Intensity } from '../lib/bundles';

type Props = {
  bundleId?: string;
  /** Overrides the user's setting — the collection tiles preview at full. */
  intensity?: Intensity;
};

export default function BundleBackground({ bundleId, intensity }: Props) {
  const bundle = getBundle(bundleId ?? equippedId());
  if (bundle.background.variant === 'none') return null;

  return (
    <span className="bnb" aria-hidden="true" data-intensity={intensity ?? equippedIntensity()}>
      {/* Three fields on long, offset cycles so they never resynchronise.
          Small elements blurred and scaled up, not large ones blurred —
          same look, a fraction of the paint. The third one is what stops
          the field reading as two blobs: with an odd number there is no
          symmetry for the eye to lock onto. */}
      <span className="bnb-field bnb-f1" />
      <span className="bnb-field bnb-f2" />
      <span className="bnb-field bnb-f3" />

      {/* Two starfields at different scales, drifting at different rates.
          The parallax between them is what gives the field depth; one
          layer alone reads as wallpaper. Both are BAKED tiled gradients —
          animating noise per frame is the most expensive thing a
          decoration can do, so these only ever translate. */}
      <span className="bnb-stars bnb-stars-far" />
      <span className="bnb-stars bnb-stars-near" />

      {/* Occasional, not constant: each streak crosses in about a sixth of
          its cycle and then waits out the rest, so they arrive as events
          you happen to catch rather than as a loop you start predicting. */}
      <span className="bnb-comet bnb-c1" />
      <span className="bnb-comet bnb-c2" />

      {/* Contrast protection is part of the background, not an
          afterthought: the scrim is the paper colour, so text holds its
          ratio at every frame of the drift and in any theme the user
          has built — not just at the poster frame. */}
      <span className="bnb-scrim" />
    </span>
  );
}
