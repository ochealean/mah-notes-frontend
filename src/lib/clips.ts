// ============================================================
//  Clipboard store.
//
//  Android: highlighting text in ANY app and tapping "Mah Notes" in the
//  selection toolbar runs a tiny native activity (SaveClipActivity) —
//  usually while this app is closed entirely, so it can't reach
//  IndexedDB. It queues the capture in SharedPreferences instead; we
//  drain that queue into the `clips` store on every open/resume. Same
//  shape as the home-screen widget bridge (see widget.ts).
//
//  Desktop will capture via Alt+N into the same store.
//
//  Web: no capture and no local store, so it reads and manages clips
//  over REST. The tab only appears there once there is something in it.
//
//  Clips are device-local until the user opts in to syncing them
//  (Settings → Privacy). The fields below exist so that opting in is
//  possible at all: a synced entity needs a stable `uid`, an `updatedAt`
//  to resolve conflicts, and a `pinned` flag to survive retention.
// ============================================================
import { isNative } from './nativeAuth';
import { isDesktop, isWeb } from './platform';
import { api } from './api';
import { takePendingDesktopClips, desktopCopy } from './clipsDesktop';
import { localdb } from './localdb';
import { newUid } from './uid';
import { requestSync, markDeleted, markLocalOrigin } from './sync';
import Clips from './clipsPlugin';
import {
  computeExpiresAt, isExpired, CLIP_MAX, CLIP_MAX_TEXT,
} from './clipRetention';

const STORE = 'clips';
const SNAPSHOT_MAX = 50; // how many the native paste picker offers
const BACKFILL_FLAG = 'clipsBackfilled';

export type Clip = {
  id: string;            // IndexedDB key. Equals `uid` on the device.
  uid: string;           // stable across devices once synced
  text: string;
  source: string;        // the app it came from, e.g. "Chrome"
  pinned: boolean;
  unpinnedAt: string | null;
  expiresAt: string | null;  // materialised from clipRetention; null = never
  createdAt: string;
  updatedAt: string;
};

// Pinned first, then newest. Matches how notes float pinned items.
const order = (a: Clip, b: Clip) => (
  (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
  || (b.createdAt || '').localeCompare(a.createdAt || '')
);

const now = () => new Date().toISOString();
const cut = (t: string) => (t.length > CLIP_MAX_TEXT ? t.slice(0, CLIP_MAX_TEXT) : t);

// Stamp the fields a synced, expiring clip needs onto a partial row.
function complete(raw: any): Clip {
  const createdAt = raw.createdAt || now();
  const base = {
    id: String(raw.id || raw.uid || newUid()),
    uid: String(raw.uid || raw.id || newUid()),
    text: cut(String(raw.text || '')),
    source: typeof raw.source === 'string' ? raw.source : '',
    pinned: !!raw.pinned,
    unpinnedAt: raw.unpinnedAt || null,
    createdAt,
    updatedAt: raw.updatedAt || createdAt,
  };
  return { ...base, expiresAt: computeExpiresAt(base) };
}

// Native sends createdAt as epoch millis; the UI wants an ISO string.
function normalize(raw: any): Clip | null {
  const text = typeof raw?.text === 'string' ? raw.text.trim() : '';
  if (!text) return null;
  // Android sends `createdAt`; the Rust bridge sends `created_at`.
  const millis = Number(raw.createdAt ?? raw.created_at);
  return complete({
    ...raw,
    text,
    createdAt: Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : now(),
  });
}

// One-shot migration for clips captured before they carried these fields.
// Existing rows keep their original createdAt, which would expire anything
// older than 30 days the instant this ships — nobody should lose data to an
// update, so on THIS pass only, the deadline is floored to 30 days out.
async function backfill(all: any[]): Promise<Clip[]> {
  const done = await localdb.metaGet(BACKFILL_FLAG, false);
  const out: Clip[] = [];
  const writes: Clip[] = [];

  for (const raw of all) {
    if (raw?.uid && raw?.updatedAt && raw?.expiresAt !== undefined) { out.push(raw); continue; }
    const clip = complete({ ...raw, uid: raw.uid || raw.id });
    if (!done && clip.expiresAt && Date.parse(clip.expiresAt) < Date.now()) {
      clip.expiresAt = computeExpiresAt({ ...clip, createdAt: now() });
    }
    writes.push(clip);
    out.push(clip);
  }

  if (writes.length) await localdb.bulkPut(STORE, writes);
  if (!done) await localdb.metaSet(BACKFILL_FLAG, true);
  return out;
}

// Drop what has expired, then enforce the local cap. Runs on every read —
// the store is small, and this needs no timer and no background task.
async function sweep(all: Clip[]): Promise<Clip[]> {
  const live: Clip[] = [];
  const dead: string[] = [];
  for (const c of all) (isExpired(c) ? dead : live).push(c as any);

  const unpinned = live.filter((c) => !c.pinned).sort(order);
  if (unpinned.length > CLIP_MAX) {
    for (const c of unpinned.slice(CLIP_MAX)) dead.push(c.id);
  }
  if (!dead.length) return live;

  const gone = new Set(dead);
  for (const id of gone) await localdb.remove(STORE, id); // eslint-disable-line no-await-in-loop
  return live.filter((c) => !gone.has(c.id));
}

export async function listClips(): Promise<Clip[]> {
  // Web has no IndexedDB copy and no way to capture; the server is the only
  // source, and it has already applied expiry and ordering.
  if (isWeb) {
    try { return (await api.get('/api/clips')) || []; }
    catch { return []; }
  }
  try {
    const raw = (await localdb.all(STORE)) || [];
    const all = await backfill(raw);
    const live = await sweep(all);
    return live.sort(order);
  } catch { return []; }
}

export async function addClip(text: string, source = ''): Promise<Clip | null> {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const uid = newUid();
  const clip = complete({ id: uid, uid, text: trimmed, source, createdAt: now() });
  await localdb.put(STORE, clip);
  // Device-created, so a later "sign out and clear this device" keeps it.
  await markLocalOrigin('clips', uid);
  requestSync();
  return clip;
}

export async function deleteClip(id: string) {
  if (isWeb) { await api.del(`/api/clips/${id}`); return; }
  const cur = await localdb.get(STORE, id);
  await localdb.remove(STORE, id);
  // Queue the deletion so it reaches the account too. Harmless when clip sync
  // is off: syncNow() never puts these on the wire in that case.
  if (cur?.uid || cur?.id) await markDeleted('clips', cur.uid || cur.id);
  requestSync();
}

export async function clearClips() {
  await localdb.clear(STORE);
}

// Pinning is what exempts a clip from the 30-day sweep. Unpinning stamps
// `unpinnedAt`, which is how the 24-hour grace is granted to a clip that has
// already outlived its normal deadline.
export async function setClipPinned(id: string, pinned: boolean): Promise<Clip | null> {
  if (isWeb) return api.patch(`/api/clips/${id}`, { pinned });
  const cur = await localdb.get(STORE, id);
  if (!cur) return null;
  const next = complete({
    ...cur,
    pinned: !!pinned,
    unpinnedAt: pinned ? null : now(),
    updatedAt: now(),
  });
  await localdb.put(STORE, next);
  requestSync();
  return next;
}

// Pull anything the selection toolbar captured while we were closed/backgrounded
// into IndexedDB. Returns how many arrived, so the caller knows to refresh.
// Best-effort: a broken bridge must never block the app from starting.
export async function drainPendingClips(): Promise<number> {
  let pending: any[] = [];
  if (isNative) {
    try {
      const r = await Clips.consumePending();
      pending = Array.isArray(r?.clips) ? r.clips : [];
    } catch { return 0; }
  } else if (isDesktop) {
    // Alt+N queued these in Rust while the window was closed to the tray.
    // Same shape as the Android queue, so normalize() handles both.
    pending = await takePendingDesktopClips();
  } else {
    return 0;
  }
  if (!pending.length) return 0;

  // Captures bypass addClip entirely, so the fields are stamped here instead.
  const fresh = pending.map(normalize).filter(Boolean) as Clip[];
  if (!fresh.length) return 0;
  try {
    // Keyed by id, so a re-delivered capture overwrites rather than duplicates.
    await localdb.bulkPut(STORE, fresh);
  } catch { return 0; }
  // Captures are device-created too, and they bypass addClip, so they are
  // marked here instead.
  for (const c of fresh) await markLocalOrigin('clips', c.uid); // eslint-disable-line no-await-in-loop
  requestSync();
  return fresh.length;
}

// Mirror the newest clips to the native side so the "Mah Notes Clipboard" entry
// in the selection toolbar can list them from a fresh process. Pinned first, so
// the picker offers the clips worth keeping before the incidental ones.
export async function pushClipSnapshot(clips?: Clip[]) {
  if (!isNative) return;
  try {
    const list = (clips || await listClips()).slice(0, SNAPSHOT_MAX)
      .map((c) => ({ id: c.id, text: c.text, pinned: !!c.pinned }));
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
  if (isDesktop) {
    // Through Rust rather than the WebView: navigator.clipboard is
    // unreliable inside a webview, especially without focus.
    await desktopCopy(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}
