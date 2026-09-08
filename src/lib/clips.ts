// ============================================================
//  Clipboard store (Android text-selection capture).
//
//  Highlighting text in ANY app and tapping "Mah Notes" in the selection
//  toolbar runs a tiny native activity (SaveClipActivity) — usually while this
//  app is closed entirely, so it can't reach IndexedDB. It queues the capture in
//  SharedPreferences instead; we drain that queue into the `clips` store on
//  every app open/resume. Same shape as the home-screen widget bridge
//  (see widget.ts), for the same reason.
//
//  Clips are device-local on purpose: they never go to the backend and the sync
//  engine doesn't know about them.
// ============================================================
import { isNative } from './nativeAuth';
import { localdb } from './localdb';
import Clips from './clipsPlugin';

const STORE = 'clips';
const SNAPSHOT_MAX = 50; // how many the native paste picker offers

export type Clip = { id: string; text: string; source: string; createdAt: string };

const newest = (a: Clip, b: Clip) => (b.createdAt || '').localeCompare(a.createdAt || '');

const uid = () => (globalThis.crypto?.randomUUID
  ? crypto.randomUUID()
  : `clip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

// Native sends createdAt as epoch millis; the UI wants an ISO string.
function normalize(raw: any): Clip | null {
  const text = typeof raw?.text === 'string' ? raw.text.trim() : '';
  if (!text) return null;
  const ms = Number(raw.createdAt);
  return {
    id: String(raw.id || uid()),
    text,
    source: typeof raw.source === 'string' ? raw.source : '',
    createdAt: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : new Date().toISOString(),
  };
}

export async function listClips(): Promise<Clip[]> {
  try {
    const all = (await localdb.all(STORE)) || [];
    return all.sort(newest);
  } catch { return []; }
}

export async function addClip(text: string, source = ''): Promise<Clip | null> {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const clip: Clip = { id: uid(), text: trimmed, source, createdAt: new Date().toISOString() };
  await localdb.put(STORE, clip);
  return clip;
}

export async function deleteClip(id: string) {
  await localdb.remove(STORE, id);
}

export async function clearClips() {
  await localdb.clear(STORE);
}

// Pull anything the selection toolbar captured while we were closed/backgrounded
// into IndexedDB. Returns how many arrived, so the caller knows to refresh.
// Best-effort: a broken bridge must never block the app from starting.
export async function drainPendingClips(): Promise<number> {
  if (!isNative) return 0;
  let pending: any[] = [];
  try {
    const r = await Clips.consumePending();
    pending = Array.isArray(r?.clips) ? r.clips : [];
  } catch { return 0; }
  if (!pending.length) return 0;

  const fresh = pending.map(normalize).filter(Boolean) as Clip[];
  if (!fresh.length) return 0;
  try {
    // Keyed by id, so a re-delivered capture overwrites rather than duplicates.
    await localdb.bulkPut(STORE, fresh);
  } catch { return 0; }
  return fresh.length;
}

// Mirror the newest clips to the native side so the "Mah Notes Clipboard" entry
// in the selection toolbar can list them from a fresh process.
export async function pushClipSnapshot(clips?: Clip[]) {
  if (!isNative) return;
  try {
    const list = (clips || await listClips()).slice(0, SNAPSHOT_MAX)
      .map((c) => ({ id: c.id, text: c.text }));
    await Clips.setSnapshot({ json: JSON.stringify(list) });
  } catch { /* best-effort — never break the app over the picker */ }
}

// Copy a clip to the SYSTEM clipboard. This is also how a clip reaches the
// keyboard: Gboard's clipboard panel is private storage with no third-party API,
// but it picks up whatever lands on the system clipboard.
export async function copyClip(text: string) {
  if (isNative) {
    await Clips.copyToSystem({ text });
    return;
  }
  await navigator.clipboard.writeText(text);
}
