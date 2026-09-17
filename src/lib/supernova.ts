// ============================================================
//  Supernova — the bundle's button press.
//
//  A bright core flashes and a ring of light with heavier particles
//  expands past the button's border.
//
//  One delegated listener for the whole app rather than a wrapper
//  component, for three reasons: buttons rendered later are covered for
//  free, no component has to be touched to gain the effect, and there is
//  exactly one place to check the two things that must always be checked
//  — that the button is on a bundle surface, and that motion is wanted.
//
//  Scoped to [data-bundle] surfaces on purpose. The app's own chrome
//  keeps its plain buttons: the capture path is sacred, and a flourish on
//  every button in the product is how a charming effect turns into a
//  browser toolbar.
// ============================================================

// Buttons on surfaces where a ring is actually allowed to escape the
// border. Deliberately excludes .settings-row and .icon-btn: those live
// inside .settings-card, which clips overflow, so the effect there would
// be a rectangle of light rather than a shockwave.
const TARGETS = '.btn, .vc-btn, .vcta-btn, .friend-btn, .bcol-tile, .bcol-int-btn, .share-copy-btn';

// Particles, authored irregular so the burst does not read as a clock
// face: uneven angles, three sizes, three distances, three speeds.
const PARTICLES = [
  { a: 8, d: 52, sz: 3.5, dur: 620, col: 'var(--bundle-core)' },
  { a: 41, d: 38, sz: 2, dur: 520, col: 'var(--bundle-spark)' },
  { a: 74, d: 61, sz: 3, dur: 700, col: 'var(--bundle-accent-soft)' },
  { a: 108, d: 34, sz: 2.5, dur: 480, col: 'var(--bundle-core)' },
  { a: 137, d: 57, sz: 4, dur: 660, col: 'var(--bundle-spark)' },
  { a: 166, d: 41, sz: 2, dur: 540, col: 'var(--bundle-accent-soft)' },
  { a: 199, d: 66, sz: 3, dur: 720, col: 'var(--bundle-core)' },
  { a: 228, d: 36, sz: 2.5, dur: 500, col: 'var(--bundle-spark)' },
  { a: 254, d: 59, sz: 3.5, dur: 640, col: 'var(--bundle-core)' },
  { a: 287, d: 44, sz: 2, dur: 560, col: 'var(--bundle-accent-soft)' },
  { a: 313, d: 63, sz: 3, dur: 690, col: 'var(--bundle-spark)' },
  { a: 341, d: 39, sz: 2.5, dur: 510, col: 'var(--bundle-core)' },
];

const LIFETIME = 780; // comfortably past the longest particle

let installed = false;

export function installSupernova() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  // pointerdown, not click: the flash has to land on the press to feel
  // like a consequence of it. A press that never becomes a click still
  // deserves the feedback.
  document.addEventListener('pointerdown', onPress, { passive: true });
}

function onPress(e: PointerEvent) {
  const target = e.target as Element | null;
  if (!target || typeof target.closest !== 'function') return;

  const host = target.closest<HTMLElement>(TARGETS);
  if (!host || host.matches(':disabled') || host.getAttribute('aria-disabled') === 'true') return;

  // Only on a bundle surface, and only for a bundle that has the effect.
  const scope = host.closest<HTMLElement>('[data-bundle]');
  if (!scope || scope.dataset.bundle === 'nocturne') return;

  // The single motion switch, read from wherever it resolved: reduced
  // motion and the "off" intensity both land here as 0, so neither needs
  // its own check.
  const style = getComputedStyle(host);
  if (parseFloat(style.getPropertyValue('--bundle-motion-scale') || '1') === 0) return;

  fire(host, e.clientX, e.clientY, style.position === 'static');
}

function fire(host: HTMLElement, clientX: number, clientY: number, needsPosition: boolean) {
  // An absolutely positioned child needs a positioned parent. Set it
  // inline rather than adding a rule for .btn — a bundle must not restyle
  // a component, and this way the button's own CSS still wins if it ever
  // gains a position of its own.
  if (needsPosition) host.style.position = 'relative';

  // Rapid presses replace rather than stack: twelve particles per press
  // is dramatic, forty is a dropped frame.
  host.querySelector(':scope > .nova')?.remove();

  const rect = host.getBoundingClientRect();
  const nova = document.createElement('span');
  nova.className = 'nova';
  // Centred on the press, not on the button: the light comes from where
  // the finger landed.
  nova.style.left = `${clientX - rect.left}px`;
  nova.style.top = `${clientY - rect.top}px`;

  const core = document.createElement('span');
  core.className = 'nova-core';
  nova.appendChild(core);

  const ring = document.createElement('span');
  ring.className = 'nova-ring';
  nova.appendChild(ring);

  // One ring is a ripple; two are a shockwave.
  const late = document.createElement('span');
  late.className = 'nova-ring late';
  nova.appendChild(late);

  PARTICLES.forEach((p) => {
    const el = document.createElement('i');
    el.className = 'nova-p';
    el.style.setProperty('--np-a', `${p.a}deg`);
    el.style.setProperty('--np-d', `${p.d}px`);
    el.style.setProperty('--np-sz', `${p.sz}px`);
    el.style.setProperty('--np-dur', `${p.dur}ms`);
    el.style.setProperty('--np-col', p.col);
    nova.appendChild(el);
  });

  host.appendChild(nova);
  window.setTimeout(() => nova.remove(), LIFETIME);
}
