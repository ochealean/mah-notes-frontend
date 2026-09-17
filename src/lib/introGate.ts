// ============================================================
//  When does the intro animation play?
//
//  Two different answers, because the two audiences are different.
//
//  THE APP (/) — once per run of the software. Not once per day, not once
//  ever: if the process is still alive in the background, reopening the
//  window must not replay it, and if the process was killed the next open
//  must. sessionStorage is exactly that boundary and needs no bookkeeping:
//  the Android WebView and the Tauri window both get a fresh one on a cold
//  start, and a backgrounded-but-living app keeps the one it had. A signed-in
//  user also gets it again on a fresh sign-in, which is a deliberate second
//  trigger rather than a side effect.
//
//  A SHARED LINK (/view) — every single load, including a refresh. That page
//  is the one moment the app performs for someone who has never used it, so
//  it is the one place a repeat is wanted rather than tolerated.
//
//  THE CAPTURE PATH (/toast, /clip-panel) — never, under any circumstance.
//  Those two windows are the Alt+N capture toast and the Alt+M paste panel,
//  and their entire value is opening instantly. An intro there would be the
//  single worst place in the product to put one.
// ============================================================

const KEY = 'mahnotes_intro_seen';

/** Routes whose whole purpose is to open in under a frame. */
const NEVER = ['/toast', '/clip-panel'];

/** The shared-link page: a stranger's first impression, replayed every load. */
const ALWAYS = ['/view'];

const norm = (p: string) => (p || '/').replace(/\/+$/, '') || '/';

export type IntroDecision = 'never' | 'always' | 'once-per-run';

export function introPolicy(pathname: string): IntroDecision {
  const p = norm(pathname);
  if (NEVER.includes(p)) return 'never';
  if (ALWAYS.includes(p)) return 'always';
  return 'once-per-run';
}

function seenThisRun(): boolean {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}

function markSeenThisRun() {
  try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode — replays, harmless */ }
}

/** Should the intro run right now, for this route? */
export function shouldPlayIntro(pathname: string): boolean {
  const policy = introPolicy(pathname);
  if (policy === 'never') return false;
  if (policy === 'always') return true;
  return !seenThisRun();
}

/** Called when the intro finishes or is skipped. */
export function introFinished(pathname: string) {
  if (introPolicy(pathname) === 'once-per-run') markSeenThisRun();
}

/**
 * Signing in replays it. Clearing the flag rather than setting a separate one
 * keeps a single source of truth, so "seen this run" never disagrees with
 * itself after a sign-out and back in.
 */
export function armIntroForSignIn() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

// ── Playing it on demand ────────────────────────────────
//
// Equipping a bundle has to show you its intro, and the once-per-run rule
// is exactly what stopped it: you equip Galaxy, reload to see what changed,
// and the intro does not play — because this run already used its one turn,
// before Galaxy was equipped. The bundle looked like it simply had no intro.
//
// So the collection screen asks for it directly. A tiny listener set rather
// than a context: IntroAnimation is mounted once at the root, far above the
// settings tree, and threading a callback down through five components to
// reach it would be much more machinery than one Set.
const replayListeners = new Set<() => void>();

/** Play the intro now, wherever IntroAnimation happens to be mounted. */
export function replayIntro() {
  armIntroForSignIn();
  replayListeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

export function onIntroReplay(fn: () => void): () => void {
  replayListeners.add(fn);
  return () => { replayListeners.delete(fn); };
}
