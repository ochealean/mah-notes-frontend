// ============================================================
//  The moment a box gets checked.
//
//  Checking something off is the small win this app is built around, so it
//  gets a beat of its own, for everyone: the box pops, the check mark springs
//  in, a ring ripples out and the row glows once (the .ck-pop keyframes in
//  app.css). With Galaxy in force — your own bundle, or a shared page that
//  wears the sender's — a small star collapse lands on the box as well.
//
//  Only on checking. Unchecking stays quiet: an effect for undoing something
//  would read as a reward for it.
// ============================================================
import { bundleState } from './bundles';
import { starBurst } from './starCollapse';

const POP_MS = 720;

export function celebrateCheck(item: Element | null | undefined) {
  if (!item) return;
  const s = bundleState();
  if (s.reduced) return;
  const el = item as HTMLElement;

  // Restart cleanly when the same box is checked twice in quick succession.
  el.classList.remove('ck-pop');
  void el.offsetWidth; // eslint-disable-line no-void
  el.classList.add('ck-pop');
  window.setTimeout(() => el.classList.remove('ck-pop'), POP_MS);

  const galaxy = (s.bundle.clickEffect && s.effectiveMotion !== 'off')
    || !!el.closest('[data-bundle-surface="galaxy"], .galaxy-amb');
  if (!galaxy) return;

  // The box is the item's ::before: 20px square at its left edge.
  const r = el.getBoundingClientRect();
  let top = 4;
  try { top = parseFloat(getComputedStyle(el, '::before').top) || 4; } catch { /* old engine */ }
  starBurst(r.left + 10, r.top + top + 10, 0.55);
}

/** Pop every item in `root` that is checked now but was not before. Used when
    a live refresh brings in boxes the sender has just checked. */
export function celebrateNewChecks(root: Element | null, before: Set<number>) {
  if (!root) return new Set<number>();
  const now = new Set<number>();
  root.querySelectorAll('.doc-check-item').forEach((it, i) => {
    if (it.getAttribute('data-checked') === 'true') {
      now.add(i);
      if (!before.has(i)) celebrateCheck(it);
    }
  });
  return now;
}
