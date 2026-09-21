// ============================================================
//  Galaxy caret — the bundle's typing effects in the document editor.
//
//    · a custom caret: a thin line of starlight with a spark at its head,
//      standing in for the browser's own (which is hidden while it runs)
//    · a short glowing wake as the caret advances along a line
//    · each typed character arrives lit, then cools to ordinary ink
//    · each deleted character dissolves into dust that drifts away
//
//  Sakura wears a petal variant of the same mechanics (caretStyleFor):
//    · a rose stem with a small blossom swaying at its head, breathing
//      rather than blinking, with no glow and no wake
//    · each typed character blooms in rose and settles to ink, with a
//      ripple spreading under it like a touch on the lake
//    · finishing a word lets one petal go from its last letter
//    · each deleted character is blown off by the wind, shedding petals
//
//  Cyberpunk wears a neon terminal variant:
//    · a hard neon bar with a magenta edge and a terminal underscore at its
//      foot, blinking on and off like a terminal
//    · each typed character locks in from an RGB split, a scanline under it
//    · each deleted character tears in half and drops square pixels
//
//  THE RULE THIS MODULE IS BUILT AROUND: it never touches the editor's DOM.
//  The editor saves its innerHTML, so a wrapper span per character would be
//  saved into the note and synced everywhere. Every measurement comes from
//  Ranges the editor already has, and every pixel is drawn in a fixed layer
//  on <body>, so the note stays exactly what was typed.
//
//  Attaches only when the equipped bundle has typing effects and motion is
//  wanted; otherwise it does nothing and the normal caret stays.
// ============================================================
import { bundleState } from './bundles';
import { caretStyleFor } from './bundleArt';

type Geom = { x: number; y: number; h: number };

/** Past this many live effect nodes, new ones are skipped rather than queued.
    Ordinary typing never reaches it; a held key or a pasted block would.
    Petals spend more, smaller nodes (a ripple per letter, three per delete). */
const MAX_LIVE = 18;
const MAX_LIVE_PETAL = 32;
const TRAIL_MAX = 30;   // px — a short wake, not a laser
const GLYPH_LIFE = 440;
const DUST_LIFE = 760;
const TYPING_HOLD = 520; // the caret stops blinking while you type
const RIPPLE_LIFE = 560;
const PETAL_LIFE = 1100;
// Petal fills: pinks with enough body to show on a cream page (no white).
const PETAL_FILLS = ['#ffc2d8', '#ff8fb8', '#ff6fa5', '#f7a8c4'];
const NEON_LIFE = 320;
const NEON_TEAR_LIFE = 520;
const PIXEL_FILLS = ['#00e5ff', '#ff2d95', '#7de9ff', '#eaf9ff'];

let layer: HTMLDivElement | null = null;
let refs = 0;

function ensureLayer() {
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'gcaret-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
  }
  return layer;
}

function releaseLayer() {
  refs -= 1;
  if (refs <= 0 && layer) { layer.remove(); layer = null; refs = 0; }
}

// ── Measurement, all read-only ──────────────────────────

/** The single character before a collapsed caret. */
function prevCharRange(r: Range): Range | null {
  const node = r.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || r.startOffset === 0) return null;
  const rr = document.createRange();
  try { rr.setStart(node, r.startOffset - 1); rr.setEnd(node, r.startOffset); } catch { return null; }
  return rr;
}

function lineHeightOf(el: Element) {
  const cs = getComputedStyle(el);
  return parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.6;
}

function caretGeom(el: HTMLElement): Geom | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return null;

  // A collapsed range inside text reports a zero-width box: exactly the caret.
  const rects = r.getClientRects();
  if (rects.length) {
    const b = rects[rects.length - 1];
    if (b.height) return { x: b.right, y: b.top, h: b.height };
  }
  const prev = prevCharRange(r);
  if (prev) {
    const pr = prev.getClientRects();
    if (pr.length) {
      const b = pr[pr.length - 1];
      if (b.height) return { x: b.right, y: b.top, h: b.height };
    }
  }

  // An empty line or a fresh block reports nothing for the range itself.
  // Measure the element the caret sits in (or the <br> holding the line
  // open) instead, so the caret lands on that line — not at the top of the
  // editor.
  const node = r.startContainer as any;
  const host: Element = node.nodeType === Node.ELEMENT_NODE ? node : (node.parentElement || el);
  const child = node.nodeType === Node.ELEMENT_NODE ? node.childNodes[r.startOffset] : null;
  const target: Element = child && child.nodeType === Node.ELEMENT_NODE ? child : host;
  const tb = target.getBoundingClientRect();
  const hb = host.getBoundingClientRect();
  const cs = getComputedStyle(host);
  const lh = lineHeightOf(host);
  const x = target === host ? hb.left + (parseFloat(cs.paddingLeft) || 0) : tb.left;
  const y = target === host ? hb.top + (parseFloat(cs.paddingTop) || 0) : tb.top;
  const h = tb.height && tb.height < lh * 1.6 ? tb.height : lh;
  return { x, y, h };
}

/** The character about to be deleted, and where it sits right now. */
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

/** Wire the effects to one contentEditable element. Returns a detach. */
export function attachGalaxyCaret(el: HTMLElement): () => void {
  const noop = () => {};
  if (!el || typeof window === 'undefined') return noop;
  const s = bundleState();
  if (!s.bundle.typing || s.effectiveMotion === 'off') return noop;

  refs += 1;
  const host = ensureLayer();
  const style = caretStyleFor(s.bundle.id);
  const petal = style === 'petal';
  const neon = style === 'neon';
  host.dataset.style = style;

  const caret = document.createElement('div');
  caret.className = 'gcaret';
  caret.style.visibility = 'hidden';
  host.appendChild(caret);

  // The browser's own caret would sit on top of ours, a hair apart.
  const prevCaretColor = el.style.caretColor;
  el.style.caretColor = 'transparent';

  let lastX: number | null = null;
  let lastY: number | null = null;
  let trailTimer = 0;
  let typingTimer = 0;
  let pendingDelete: ReturnType<typeof charBeforeCaret> = null;

  const live = () => host.childElementCount - 1;
  function spawn(node: HTMLElement, life: number) {
    if (live() >= (style === 'star' ? MAX_LIVE : MAX_LIVE_PETAL)) return;
    host.appendChild(node);
    window.setTimeout(() => node.remove(), life);
  }

  function place() {
    const sel = window.getSelection();
    const focused = document.activeElement === el || el.contains(document.activeElement);
    // A range selection shows the browser's highlight; no caret on top of it.
    if (!focused || !sel || !sel.isCollapsed) { caret.style.visibility = 'hidden'; return; }
    const g = caretGeom(el);
    if (!g) { caret.style.visibility = 'hidden'; return; }

    const travelled = lastX === null ? 0 : Math.abs(g.x - lastX);
    const sameLine = lastY !== null && Math.abs(g.y - lastY) < 2;
    caret.style.height = `${g.h}px`;
    caret.style.transform = `translate3d(${g.x - 1}px, ${g.y}px, 0)`;
    caret.style.visibility = 'visible';

    // A wake only for travel along a line. Jumping lines, or a click across
    // the page, is not a comet.
    const trail = sameLine && style === 'star' ? Math.min(travelled * 1.4, TRAIL_MAX) : 0;
    caret.style.setProperty('--gc-trail', `${trail}px`);
    window.clearTimeout(trailTimer);
    if (trail > 0) trailTimer = window.setTimeout(() => caret.style.setProperty('--gc-trail', '0px'), 90);
    lastX = g.x;
    lastY = g.y;
  }

  function typing() {
    caret.classList.add('typing');
    window.clearTimeout(typingTimer);
    typingTimer = window.setTimeout(() => caret.classList.remove('typing'), TYPING_HOLD);
  }

  // A copy of one character laid exactly over where it is (or was).
  function ghostAt(cls: string, text: string, font: string, left: number, top: number, h: number) {
    const g = document.createElement('span');
    g.className = cls;
    g.textContent = text;
    g.style.font = font;
    g.style.left = `${left}px`;
    g.style.top = `${top}px`;
    g.style.height = `${h}px`;
    g.style.lineHeight = `${h}px`;
    return g;
  }

  // Arriving characters: a lit ghost laid exactly over the real one, cooling
  // away. The ink underneath is already normal; this is the heat leaving it.
  function litChar(text: string) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const rr = prevCharRange(sel.getRangeAt(0));
    if (!rr) return;
    const rects = rr.getClientRects();
    if (!rects.length) return;
    const b = rects[rects.length - 1];
    const parent = (sel.getRangeAt(0).startContainer.parentElement || el) as HTMLElement;
    const font = getComputedStyle(parent).font;
    if (neon) {
      if (!text.trim()) return;
      // locks in from an RGB split: a cyan and a magenta copy converge on
      // the letter, and a scanline under it runs out
      spawn(ghostAt('gcaret-rgb c', text, font, b.left, b.top, b.height), NEON_LIFE);
      spawn(ghostAt('gcaret-rgb m', text, font, b.left, b.top, b.height), NEON_LIFE);
      const sc = document.createElement('i');
      sc.className = 'gcaret-scan';
      sc.style.left = `${b.left}px`;
      sc.style.top = `${b.bottom - 1}px`;
      sc.style.width = `${Math.max(4, b.width)}px`;
      spawn(sc, NEON_LIFE);
      return;
    }
    spawn(ghostAt(petal ? 'gcaret-bloom' : 'gcaret-glyph', text, font, b.left, b.top, b.height), GLYPH_LIFE);
    if (petal) {
      // a touch on the water, just under the letter's baseline
      const w = document.createElement('i');
      w.className = 'gcaret-ripple';
      w.style.left = `${b.left + b.width / 2}px`;
      w.style.top = `${b.bottom - b.height * 0.14}px`;
      spawn(w, RIPPLE_LIFE);
    }
  }

  // Petals: a little deterministic wobble so no two take the same path, and
  // the same keystrokes always look the same.
  let seq = 7;
  const wob = (lo: number, hi: number) => {
    seq = (seq * 1103515245 + 12345) & 0x7fffffff;
    return lo + (seq / 0x7fffffff) * (hi - lo);
  };
  // One petal: lifts, then drifts downwind (to the right) as it falls.
  function petalAt(x: number, y: number, lift: number, dx: number, dy: number, big = 1) {
    const d = document.createElement('i');
    d.className = 'gcaret-petal';
    const sz = wob(5, 7.5) * big;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    d.style.width = `${sz}px`;
    d.style.height = `${sz * 0.82}px`;
    d.style.background = PETAL_FILLS[Math.floor(wob(0, PETAL_FILLS.length)) % PETAL_FILLS.length];
    d.style.setProperty('--cp-x1', `${dx * 0.4}px`);
    d.style.setProperty('--cp-y1', `${-lift}px`);
    d.style.setProperty('--cp-x2', `${dx}px`);
    d.style.setProperty('--cp-y2', `${dy}px`);
    d.style.setProperty('--cp-r', `${wob(180, 420)}deg`);
    spawn(d, PETAL_LIFE);
  }

  // Finishing a word (the space after it) lets one petal go from its end.
  function wordPetal() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    const node = r.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || r.startOffset < 2) return;
    // a run of spaces is not a word ending (trim() also strips the NBSP
    // contentEditable types for a trailing space)
    if (!(node.textContent || '').charAt(r.startOffset - 2).trim()) return;
    const rects = prevCharRange(r)?.getClientRects();
    if (!rects || !rects.length) return;
    const b = rects[rects.length - 1];
    petalAt(b.left, b.top + b.height * 0.3, wob(10, 16), wob(26, 40), wob(6, 16));
  }

  // Deleted characters: the glyph blurs and shrinks while a few specks
  // drift off and fade. Authored, not random, so the dust has a direction.
  const SPECKS = [
    { x: -3, y: -14, sz: 2, dur: 560, c: 'spark' },
    { x: 4, y: -19, sz: 1.5, dur: 700, c: 'dust' },
    { x: 7, y: -10, sz: 2.5, dur: 520, c: 'soft' },
    { x: -6, y: -22, sz: 1.5, dur: 660, c: 'dust' },
    { x: 2, y: -26, sz: 2, dur: 740, c: 'spark' },
  ];
  function dissolve(info: NonNullable<ReturnType<typeof charBeforeCaret>>) {
    if (neon) {
      // it tears in two — the top half slides off one way in cyan, the
      // bottom the other in magenta — and drops a few square pixels
      spawn(ghostAt('gcaret-tear top', info.char, info.font, info.left, info.top, info.h), NEON_TEAR_LIFE);
      spawn(ghostAt('gcaret-tear bot', info.char, info.font, info.left, info.top, info.h), NEON_TEAR_LIFE);
      for (let i = 0; i < 4; i++) {
        const d = document.createElement('i');
        d.className = 'gcaret-pixel';
        d.style.left = `${info.left + info.h * 0.18 * i}px`;
        d.style.top = `${info.top + info.h * 0.5}px`;
        d.style.background = PIXEL_FILLS[i];
        d.style.setProperty('--px', `${wob(-12, 16)}px`);
        d.style.setProperty('--py', `${wob(8, 22)}px`);
        spawn(d, NEON_TEAR_LIFE);
      }
      return;
    }
    spawn(ghostAt(petal ? 'gcaret-blown' : 'gcaret-ghost', info.char, info.font, info.left, info.top, info.h), DUST_LIFE);
    if (petal) {
      // the wind takes it: three petals leave from the letter, downwind
      for (let i = 0; i < 3; i++) {
        petalAt(info.left + info.h * 0.15 * i, info.top + info.h * (0.3 + 0.15 * i), wob(4, 12), wob(18, 36), wob(8, 22), 1.2);
      }
      return;
    }
    SPECKS.forEach((sp, i) => {
      const d = document.createElement('i');
      d.className = `gcaret-speck ${sp.c}`;
      d.style.left = `${info.left + info.h * 0.2 * (i % 3)}px`;
      d.style.top = `${info.top + info.h * 0.45}px`;
      d.style.setProperty('--gs-x', `${sp.x}px`);
      d.style.setProperty('--gs-y', `${sp.y}px`);
      d.style.setProperty('--gs-sz', `${sp.sz}px`);
      d.style.setProperty('--gs-dur', `${sp.dur}ms`);
      spawn(d, DUST_LIFE);
    });
  }

  // A delete has to be measured BEFORE the character is gone, so it is
  // captured here and animated on the input event that follows.
  const onBeforeInput = (e: Event) => {
    const ie = e as InputEvent;
    pendingDelete = ie.inputType === 'deleteContentBackward' ? charBeforeCaret(el) : null;
  };
  const onInput = (e: Event) => {
    const ie = e as InputEvent;
    if (pendingDelete) {
      const info = pendingDelete;
      pendingDelete = null;
      dissolve(info);
    } else if (ie.inputType === 'insertText' && ie.data && ie.data.length <= 2) {
      // Only real typing. A paste or an IME commit arrives as a block.
      if (petal && !ie.data.trim()) wordPetal();
      else litChar(ie.data);
    }
    typing();
    place();
  };
  // The caret also moves without input: arrows, clicks, Home/End, selection.
  const onNudge = () => place();
  const onSelection = () => { if (document.activeElement === el || el.contains(document.activeElement)) place(); };
  const onBlur = () => { caret.style.visibility = 'hidden'; lastX = null; lastY = null; };
  // The layer is fixed, so text scrolls out from under anything still
  // animating. Clearing it is cheaper and more honest than tracking it.
  const onScroll = () => {
    [...host.children].forEach((c) => { if (!c.classList.contains('gcaret')) c.remove(); });
    lastX = null;
    place();
  };

  el.addEventListener('beforeinput', onBeforeInput);
  el.addEventListener('input', onInput);
  el.addEventListener('keyup', onNudge);
  el.addEventListener('pointerup', onNudge);
  el.addEventListener('focus', onNudge);
  el.addEventListener('blur', onBlur);
  document.addEventListener('selectionchange', onSelection);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);

  return () => {
    el.removeEventListener('beforeinput', onBeforeInput);
    el.removeEventListener('input', onInput);
    el.removeEventListener('keyup', onNudge);
    el.removeEventListener('pointerup', onNudge);
    el.removeEventListener('focus', onNudge);
    el.removeEventListener('blur', onBlur);
    document.removeEventListener('selectionchange', onSelection);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    window.clearTimeout(trailTimer);
    window.clearTimeout(typingTimer);
    el.style.caretColor = prevCaretColor;
    caret.remove();
    releaseLayer();
  };
}
