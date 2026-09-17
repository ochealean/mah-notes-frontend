// ============================================================
//  Comet caret — the bundle's typing animation.
//
//  Three effects:
//    · the cursor leaves a short glowing trail as it advances
//    · new characters arrive lit, then cool to normal ink over ~400ms
//    · deleting dissolves the character into drifting dust that falls away
//
//  THE RULE THIS MODULE IS BUILT AROUND: it never mutates the editor.
//
//  That is not fussiness. DocEditor saves sanitizeHtml(editor.innerHTML),
//  so a per-character <span> wrapper would end up inside saved notes, sync
//  to every other device, and fight the caret and the undo stack on the
//  way. Even the usual trick for finding a caret position — inserting a
//  probe node and measuring it — is off the table here. So every
//  measurement is taken from Ranges the editor already has, every pixel
//  is drawn in a fixed overlay parented to <body>, and the note content
//  stays bit-for-bit what the user typed.
//
//  The editor also gets no background layer and no ambient motion. A lit
//  character and a wake behind the cursor are feedback for the thing the
//  user is doing; motion beside a paragraph someone is reading is not,
//  and it pulls attention involuntarily.
// ============================================================

type Geom = { x: number; y: number; h: number };

/** Past this many live nodes, new effects are skipped rather than queued.
    Human typing never reaches it; a held key or a paste would. */
const MAX_LIVE = 16;

const TRAIL_MAX = 30; // px — a short wake, not a laser
const GLYPH_LIFE = 420;
const DUST_LIFE = 700;

let layer: HTMLDivElement | null = null;
let refs = 0;

function ensureLayer(): HTMLDivElement {
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'comet-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

function releaseLayer() {
  refs -= 1;
  if (refs <= 0 && layer) {
    layer.remove();
    layer = null;
    refs = 0;
  }
}

// ── Measurement, all of it read-only ────────────────────

/** A range covering the single character before a collapsed caret. */
function prevCharRange(r: Range): Range | null {
  const node = r.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || r.startOffset === 0) return null;
  const rr = document.createRange();
  try {
    rr.setStart(node, r.startOffset - 1);
    rr.setEnd(node, r.startOffset);
  } catch { return null; }
  return rr;
}

function caretGeom(el: HTMLElement): Geom | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return null;

  // A collapsed range in text reports a zero-width box, which is exactly
  // the caret. Where it reports nothing (an empty line, a fresh block),
  // fall back to the right edge of the previous character, then to the
  // editor's own content box.
  const own = r.getClientRects();
  if (own.length) {
    const b = own[own.length - 1];
    if (b.height) return { x: b.right, y: b.top, h: b.height };
  }

  const box = r.getBoundingClientRect();
  if (box && box.height) return { x: box.right, y: box.top, h: box.height };

  const prev = prevCharRange(r);
  if (prev) {
    const rects = prev.getClientRects();
    if (rects.length) {
      const b = rects[rects.length - 1];
      if (b.height) return { x: b.right, y: b.top, h: b.height };
    }
  }

  const eb = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6 || 20;
  return { x: eb.left + (parseFloat(cs.paddingLeft) || 0), y: eb.top, h: lh };
}

/** The character about to be deleted, and where it currently sits. */
function charBeforeCaret(el: HTMLElement) {
  const sel = window.getSelection();
  // Deleting a selection is a different gesture — no single character to
  // dissolve, so it gets no effect rather than a wrong one.
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return null;

  const rr = prevCharRange(r);
  if (!rr) return null;
  const text = rr.toString();
  if (!text.trim()) return null; // whitespace has nothing to dissolve

  const rects = rr.getClientRects();
  if (!rects.length) return null;
  const b = rects[rects.length - 1];
  const parent = (r.startContainer.parentElement || el) as HTMLElement;
  return { char: text, left: b.left, top: b.top, h: b.height, font: getComputedStyle(parent).font };
}

// ── Attach ──────────────────────────────────────────────

/**
 * Wires the effects to one contentEditable element.
 * Returns a detach function; safe to call when the bundle has no typing
 * animation, in which case it wires nothing.
 */
export function attachCometCaret(el: HTMLElement): () => void {
  const noop = () => {};
  if (!el || typeof window === 'undefined') return noop;

  // Two gates, both of which have to pass.
  //
  //  · the bundle must HAVE a typing animation. Nocturne is the app
  //    undecorated, not the app motionless, so its motion-scale is a
  //    perfectly normal 1 — the scale check alone would attach a caret
  //    whose colour token resolves to the paper and draw nothing visible.
  //  · motion must be wanted. Reduced motion and the "off" intensity both
  //    arrive as a scale of 0, so neither needs a check of its own.
  const scope = el.closest<HTMLElement>('[data-bundle]');
  const bundle = scope?.dataset.bundle;
  if (!bundle || bundle === 'nocturne') return noop;

  const scale = parseFloat(getComputedStyle(el).getPropertyValue('--bundle-motion-scale') || '0');
  if (scale === 0) return noop;

  refs += 1;
  const host = ensureLayer();
  // The overlay inherits the bundle's colours from the editor's scope, so
  // the glow matches whatever is equipped without naming a bundle here.
  host.dataset.bundle = bundle;

  const caret = document.createElement('div');
  caret.className = 'comet-caret';
  caret.style.opacity = '0';
  host.appendChild(caret);

  let lastX: number | null = null;
  let lastY: number | null = null;
  let trailTimer = 0;
  let pendingDelete: ReturnType<typeof charBeforeCaret> = null;

  const live = () => host.childElementCount - 1; // the caret is not transient

  function spawn(node: HTMLElement, life: number) {
    if (live() >= MAX_LIVE) return;
    host.appendChild(node);
    window.setTimeout(() => node.remove(), life);
  }

  // ── The trail ──
  // The streak IS the CSS transition between two caret positions: easing
  // out of the old one and into the new one is what makes it read as
  // motion rather than as a jump.
  function moveCaret() {
    const g = caretGeom(el);
    if (!g) { caret.style.opacity = '0'; return; }

    const travelled = lastX === null ? 0 : Math.abs(g.x - lastX);
    const sameLine = lastY !== null && Math.abs(g.y - lastY) < 2;

    caret.style.height = `${g.h}px`;
    caret.style.transform = `translate3d(${g.x}px, ${g.y}px, 0)`;
    caret.style.opacity = '0.9';

    // A wake only where there was travel along a line. Jumping to another
    // line, or a click across the document, is not a comet.
    const trail = sameLine ? Math.min(travelled * 1.4, TRAIL_MAX) : 0;
    caret.style.setProperty('--comet-trail', `${trail}px`);
    window.clearTimeout(trailTimer);
    if (trail > 0) {
      trailTimer = window.setTimeout(() => caret.style.setProperty('--comet-trail', '0px'), 90);
    }

    lastX = g.x;
    lastY = g.y;
  }

  // ── Arriving characters ──
  // A lit ghost of the character, laid exactly over the real one. The ink
  // underneath is already normal; this is the heat leaving it. Drawn as an
  // overlay so the document is never touched.
  function litChar(text: string) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const rr = prevCharRange(sel.getRangeAt(0));
    if (!rr) return;
    const rects = rr.getClientRects();
    if (!rects.length) return;
    const b = rects[rects.length - 1];
    const parent = (sel.getRangeAt(0).startContainer.parentElement || el) as HTMLElement;

    const g = document.createElement('span');
    g.className = 'comet-glyph';
    g.textContent = text;
    g.style.font = getComputedStyle(parent).font;
    g.style.left = `${b.left}px`;
    g.style.top = `${b.top}px`;
    g.style.height = `${b.height}px`;
    g.style.lineHeight = `${b.height}px`;
    spawn(g, GLYPH_LIFE);
  }

  // ── Deleted characters ──
  // The glyph blurs and shrinks while a few specks drift down and fade.
  function dissolve(info: NonNullable<ReturnType<typeof charBeforeCaret>>) {
    const ghost = document.createElement('span');
    ghost.className = 'comet-ghost';
    ghost.textContent = info.char;
    ghost.style.font = info.font;
    ghost.style.left = `${info.left}px`;
    ghost.style.top = `${info.top}px`;
    ghost.style.height = `${info.h}px`;
    ghost.style.lineHeight = `${info.h}px`;
    spawn(ghost, DUST_LIFE);

    // Authored, not random: five specks with uneven drift so the dust
    // falls with a direction instead of scattering symmetrically.
    const SPECKS = [
      { x: -2, y: 14, sz: 2, dur: 560 },
      { x: 3, y: 18, sz: 1.5, dur: 680 },
      { x: 6, y: 11, sz: 2.5, dur: 500 },
      { x: -5, y: 20, sz: 1.5, dur: 640 },
      { x: 1, y: 24, sz: 2, dur: 700 },
    ];
    SPECKS.forEach((s, i) => {
      const el2 = document.createElement('i');
      el2.className = 'comet-speck';
      el2.style.left = `${info.left + info.h * 0.18 * (i % 3)}px`;
      el2.style.top = `${info.top + info.h * 0.55}px`;
      el2.style.setProperty('--cs-x', `${s.x}px`);
      el2.style.setProperty('--cs-y', `${s.y}px`);
      el2.style.setProperty('--cs-sz', `${s.sz}px`);
      el2.style.setProperty('--cs-dur', `${s.dur}ms`);
      spawn(el2, DUST_LIFE);
    });
  }

  // ── Events ──

  // A delete has to be measured BEFORE the character is gone, so the
  // capture happens here and the animation one frame later.
  const onBeforeInput = (e: Event) => {
    const ie = e as InputEvent;
    if (ie.inputType === 'deleteContentBackward') pendingDelete = charBeforeCaret(el);
    else pendingDelete = null;
  };

  const onInput = (e: Event) => {
    const ie = e as InputEvent;
    if (pendingDelete) {
      const info = pendingDelete;
      pendingDelete = null;
      dissolve(info);
    } else if (ie.inputType === 'insertText' && ie.data) {
      // Only real typing. A paste or an IME commit arrives as a block and
      // would flood the layer with glyphs for no benefit.
      if (ie.data.length <= 2) litChar(ie.data);
    }
    moveCaret();
  };

  // The caret also moves without any input: arrows, clicks, Home/End.
  const onNudge = () => moveCaret();

  const onBlur = () => {
    caret.style.opacity = '0';
    lastX = null;
    lastY = null;
  };

  // The layer is fixed, so the text slides out from under anything still
  // animating. Clearing is cheaper and more honest than tracking it.
  const onScroll = () => {
    [...host.children].forEach((c) => { if (c !== caret) c.remove(); });
    moveCaret();
  };

  el.addEventListener('beforeinput', onBeforeInput);
  el.addEventListener('input', onInput);
  el.addEventListener('keyup', onNudge);
  el.addEventListener('pointerup', onNudge);
  el.addEventListener('focus', onNudge);
  el.addEventListener('blur', onBlur);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);

  return () => {
    el.removeEventListener('beforeinput', onBeforeInput);
    el.removeEventListener('input', onInput);
    el.removeEventListener('keyup', onNudge);
    el.removeEventListener('pointerup', onNudge);
    el.removeEventListener('focus', onNudge);
    el.removeEventListener('blur', onBlur);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    window.clearTimeout(trailTimer);
    caret.remove();
    releaseLayer();
  };
}
