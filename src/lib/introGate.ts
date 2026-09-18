// ============================================================
//  When does the bundle intro play?
//
//  THE APP — once per run of the software. Not once per day, not once ever:
//  if the process is still alive in the background, reopening the window
//  must not replay it, and if the process was killed the next open must.
//  sessionStorage is exactly that boundary: the Android WebView and the
//  Tauri window both get a fresh one on a cold start. A fresh sign-in, and
//  equipping a bundle, replay it on purpose.
//
//  A SHARED LINK (/view) — every load. That page is a stranger's first
//  impression of the app, so a repeat is wanted rather than tolerated.
//
//  THE CAPTURE PATH (/toast, /clip-panel) — never. Those windows are the
//  Alt+N capture toast and the Alt+M paste panel, and their entire value is
//  opening instantly.
// ============================================================
const KEY = 'mahnotes_intro_seen';
const NEVER = ['/toast', '/clip-panel', '/reset-password', '/download'];
const ALWAYS = ['/view'];

const norm = (p: string) => (p || '/').replace(/\/+$/, '') || '/';

export type IntroPolicy = 'never' | 'always' | 'once-per-run';

export function introPolicy(pathname: string): IntroPolicy {
  const p = norm(pathname);
  if (NEVER.includes(p)) return 'never';
  if (ALWAYS.includes(p)) return 'always';
  return 'once-per-run';
}

function seenThisRun(): boolean {
  try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function shouldPlayIntro(pathname: string): boolean {
  const policy = introPolicy(pathname);
  if (policy === 'never') return false;
  if (policy === 'always') return true;
  return !seenThisRun();
}

export function introFinished(pathname: string) {
  if (introPolicy(pathname) !== 'once-per-run') return;
  try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode — replays, harmless */ }
}

/** A fresh sign-in earns the intro again. */
export function armIntroForSignIn() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Play it on demand — equipping a bundle, or "Play it again". IntroAnimation
// is mounted once at the root, far above Settings, so a tiny listener set is
// less machinery than threading a callback down to it.
const replayListeners = new Set<() => void>();

export function replayIntro() {
  armIntroForSignIn();
  replayListeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

export function onIntroReplay(fn: () => void): () => void {
  replayListeners.add(fn);
  return () => { replayListeners.delete(fn); };
}
