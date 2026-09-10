// ============================================================
//  Sync engine (native only).
//
//  Keeps the device's IndexedDB and the backend in agreement when an
//  account is connected AND sync is turned on. It MERGES (never wipes):
//  pushes local items + local deletions, the server merges newest-wins,
//  and returns the union, which we store locally. Both sides match.
//
//  Exposed as a tiny external store so components can `useSync()` without
//  a context provider.
// ============================================================
import { useSyncExternalStore } from 'react';
import { localdb } from './localdb';
import { api, getToken } from './api';
import { newUid } from './uid';
import { onRealtime } from './realtime';

const PENDING_KEY = 'pendingDeletes';
const ENABLED_KEY = 'syncEnabled';
const LASTSYNC_KEY = 'lastSync';
// uids of items CREATED on this device (the user's own data). Everything else
// in the local store arrived from a synced account. Used at logout to remove
// only the account's data and never the device's own offline notes.
const ORIGIN_KEY = 'localOriginUids';
// Which account's data currently lives on this device (its email/identifier).
// Lets us isolate a PREVIOUS account's pulled data the moment a DIFFERENT
// account signs in — so account A's cloud notes never merge into account B.
const ACCOUNT_KEY = 'syncAccountKey';
// Clips sync as a DELTA, so they carry their own cursor rather than riding the
// full-dump push. Holds the server timestamp from the last successful sync.
const CLIPSYNC_KEY = 'lastClipSync';
// Clips are opt-in on top of sync being on at all, and default to OFF. The
// master `syncEnabled` switch is not enough on its own: agreeing to sync your
// notes is not agreeing to upload everything you copy.
const CLIPSYNC_ON_KEY = 'clipSyncEnabled';
// "Start fresh" when opting in: only clips created at or after this moment are
// ever pushed. One timestamp beats per-row bookkeeping, and it survives a
// restart for free. null means "upload everything".
const CLIPSYNC_FROM_KEY = 'clipSyncFrom';
// This device's identity, minted once. Sent with every sync so the server can
// tell the OTHER devices about the change and this one can ignore its own echo.
const DEVICE_KEY = 'deviceId';
// One-shot guard for the clips origin backfill. See initSync.
const ORIGIN_CLIPS_KEY = 'originClipsMigrated';

// Every collection the engine knows about. Derived from rather than repeated,
// because the four maps below used to spell these out separately and adding a
// fourth entity meant remembering all of them.
const SYNC_KINDS = ['notes', 'plans', 'schedules', 'clips'];
const emptyByKind = () => SYNC_KINDS.reduce((acc, k) => { acc[k] = []; return acc; }, {});

let state = {
  initialized: false,
  enabled: false,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncing: false,
  lastSync: null,
  error: null,
  // Opt-in, and separate from `enabled`. Clips only ever leave the device when
  // BOTH are true.
  clipSync: false,
  // Items the WEB side deleted that this device still has — the user is asked
  // whether to keep (re-upload) or delete each. Filled after every sync pull.
  pendingReconcile: { notes: [], plans: [] },
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function set(patch) { state = { ...state, ...patch }; emit(); }

// ── external-store glue ──
function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function getSnapshot() { return state; }
export function useSync() { return useSyncExternalStore(subscribe, getSnapshot); }
export const getSyncState = () => state;

// ── pending deletions (so a delete propagates to the server) ──
async function getPending() {
  const p = (await localdb.metaGet(PENDING_KEY)) || {};
  return SYNC_KINDS.reduce((acc, k) => { acc[k] = p[k] || []; return acc; }, {} as any);
}
export async function markDeleted(kind, uid) {
  const p = await getPending();
  if (!p[kind].includes(uid)) p[kind].push(uid);
  await localdb.metaSet(PENDING_KEY, p);
}

// ── local origin (the device's own data, vs data pulled from an account) ──
async function getLocalOrigin() {
  const o = (await localdb.metaGet(ORIGIN_KEY)) || {};
  return SYNC_KINDS.reduce((acc, k) => { acc[k] = o[k] || []; return acc; }, {} as any);
}
export async function markLocalOrigin(kind, uid) {
  const o = await getLocalOrigin();
  if (!o[kind].includes(uid)) { o[kind].push(uid); await localdb.metaSet(ORIGIN_KEY, o); }
}

// Items on the device that came FROM the account (i.e. not device-created).
// These are the ones we offer to remove on logout.
export async function getAccountOnlyItems() {
  const o = await getLocalOrigin();
  const [notes, plans, schedules, clips] = await Promise.all([
    localdb.all('notes'), localdb.all('plans'), localdb.all('schedules'), localdb.all('clips'),
  ]);
  return {
    notes: notes.filter((n) => !o.notes.includes(n.uid)),
    plans: plans.filter((p) => !o.plans.includes(p.uid)),
    schedules: schedules.filter((s) => !o.schedules.includes(s.uid ?? s.id)),
    clips: clips.filter((c) => !o.clips.includes(c.uid ?? c.id)),
  };
}

// Remove only the account's data from the device; keep the user's own notes.
export async function removeAccountData() {
  const { notes, plans, schedules, clips } = await getAccountOnlyItems();
  await Promise.all([
    ...notes.map((n) => localdb.remove('notes', n.id ?? n.uid)),
    ...plans.map((p) => localdb.remove('plans', p.id ?? p.uid)),
    ...schedules.map((s) => localdb.remove('schedules', s.id ?? s.uid)),
    ...clips.map((c) => localdb.remove('clips', c.id ?? c.uid)),
  ]);
}

// Record the account now signing in. If a DIFFERENT account's pulled data is
// still on the device, isolate it first (remove account-origin items, keep the
// user's own offline notes) so the two accounts never merge. Call on every
// successful login BEFORE enabling sync.
//   → returns { switched: true } when it cleared a previous account's data.
export async function setSyncAccount(accountKey) {
  const key = (accountKey || '').trim();
  const prev = await localdb.metaGet(ACCOUNT_KEY);
  if (prev && key && prev !== key) {
    await removeAccountData();             // drop the previous account's cloud copies
    await localdb.metaSet(PENDING_KEY, emptyByKind());
    await localdb.metaSet(LASTSYNC_KEY, null);
    await localdb.metaSet(CLIPSYNC_KEY, null);   // the delta cursor is per account
    // Consent does not transfer between accounts.
    await localdb.metaSet(CLIPSYNC_ON_KEY, false);
    set({ clipSync: false });
    await localdb.metaSet(ACCOUNT_KEY, key);
    set({ lastSync: null });
    return { switched: true };
  }
  if (key) await localdb.metaSet(ACCOUNT_KEY, key);
  return { switched: false };
}

// Wipe sync bookkeeping so the next account starts clean (no carried-over
// deletions / last-sync time).
export async function resetSyncForLogout() {
  await localdb.metaSet(ENABLED_KEY, false);
  await localdb.metaSet(PENDING_KEY, emptyByKind());
  await localdb.metaSet(LASTSYNC_KEY, null);
  await localdb.metaSet(CLIPSYNC_KEY, null);
  await localdb.metaSet(CLIPSYNC_ON_KEY, false);
  set({ enabled: false, clipSync: false, lastSync: null, pendingReconcile: { notes: [], plans: [] } });
}

// Minted once per device and then stable. Also used as the human label on a
// captured clip ("From LEAN-PC") once desktop capture lands.
let deviceIdCache = null;
export async function getDeviceId() {
  if (deviceIdCache) return deviceIdCache;
  let id = await localdb.metaGet(DEVICE_KEY, null);
  if (!id) { id = newUid(); await localdb.metaSet(DEVICE_KEY, id); }
  deviceIdCache = id;
  return id;
}

// Map a server item to a local row (local id is the stable uid).
const toLocal = (it) => ({ ...it, id: it.uid });

let debounceTimer = null;

// Can we actually talk to the server right now?
export function canSync() {
  return state.enabled && state.online && !!getToken();
}

// Load persisted flags + wire connectivity listeners. Call once on native start.
export async function initSync() {
  if (state.initialized) return;
  const enabled = (await localdb.metaGet(ENABLED_KEY)) === true;
  const clipSync = (await localdb.metaGet(CLIPSYNC_ON_KEY)) === true;
  const lastSync = await localdb.metaGet(LASTSYNC_KEY);

  // One-time migration: anything already on the device (created before origin
  // tracking existed) is treated as the user's OWN data, so a future logout
  // never deletes it. Only items later pulled from an account are unmarked.
  if ((await localdb.metaGet(ORIGIN_KEY)) === null) {
    const [notes, plans, schedules] = await Promise.all([
      localdb.all('notes'), localdb.all('plans'), localdb.all('schedules'),
    ]);
    await localdb.metaSet(ORIGIN_KEY, {
      notes: notes.map((n) => n.uid),
      plans: plans.map((p) => p.uid),
      schedules: schedules.map((s) => s.uid ?? s.id),
    });
  }

  // SECOND one-time migration, and not optional. The migration above already
  // ran on every existing install, so their origin map has no `clips` key.
  // Without this, getLocalOrigin() returns an empty list for clips,
  // getAccountOnlyItems() classifies every local clip as account-origin, and
  // "sign out and clear this device" deletes every clip the user owns.
  if ((await localdb.metaGet(ORIGIN_CLIPS_KEY)) !== true) {
    const o = (await localdb.metaGet(ORIGIN_KEY)) || {};
    if (!Array.isArray(o.clips)) {
      const clips = await localdb.all('clips');
      o.clips = clips.map((c) => c.uid ?? c.id);
      await localdb.metaSet(ORIGIN_KEY, o);
    }
    await localdb.metaSet(ORIGIN_CLIPS_KEY, true);
  }

  set({ initialized: true, enabled, clipSync, lastSync });
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { set({ online: true }); requestSync(); });
    window.addEventListener('offline', () => set({ online: false }));
    // A laptop that slept for eight hours comes back holding a dead socket and
    // a stale store. Pull on the way back in rather than waiting for an edit.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestSync();
    });
  }

  // Another device changed something. Pull, rather than waiting for a local
  // edit or a restart — which, until now, was the only thing that triggered
  // one. The 1.2s debounce coalesces a burst into a single round trip.
  const myId = await getDeviceId();
  onRealtime('data:changed', (p) => {
    if (p?.origin && p.origin === myId) return;   // our own echo
    requestSync();
  });
  if (canSync()) syncNow();
}

// Turning clip sync OFF stops future pushes but leaves the local copies alone;
// removing what already reached the account is a separate, explicit action
// (Phase 3's Settings flow).
export async function setClipSyncEnabled(on, from = null) {
  await localdb.metaSet(CLIPSYNC_ON_KEY, !!on);
  if (on) {
    // Recorded on the way IN, so a later restart still honours the choice.
    await localdb.metaSet(CLIPSYNC_FROM_KEY, from || null);
    // Everything already here was created on this device, so mark it before the
    // first push — otherwise "sign out and clear this device" would treat these
    // clips as the account's and delete them.
    const existing = await localdb.all('clips');
    const o = await getLocalOrigin();
    for (const c of existing) {
      const uid = c.uid ?? c.id;
      if (uid && !o.clips.includes(uid)) o.clips.push(uid);
    }
    await localdb.metaSet(ORIGIN_KEY, o);
  } else {
    await localdb.metaSet(CLIPSYNC_FROM_KEY, null);
  }
  set({ clipSync: !!on });
  if (on && canSync()) await syncNow();
}

// Remove every clip this account holds on the server, leaving the local copies
// alone. Used by the "stop syncing AND delete them from my account" path.
// A hard delete rather than tombstones, so turning sync back on later can
// upload them again — the merge refuses to resurrect a tombstoned row.
export async function purgeAccountClips() {
  if (!getToken()) return { ok: false };
  await api.del('/api/clips');
  // Drop any queued clip deletions and the cursor: both refer to a server
  // state that no longer exists.
  const p = await getPending();
  p.clips = [];
  await localdb.metaSet(PENDING_KEY, p);
  await localdb.metaSet(CLIPSYNC_KEY, null);
  return { ok: true };
}

export async function setSyncEnabled(enabled) {
  await localdb.metaSet(ENABLED_KEY, enabled);
  set({ enabled });
  if (enabled && state.online && getToken()) await syncNow();
}

// Debounced trigger after a local mutation.
export function requestSync() {
  if (!canSync()) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { syncNow(); }, 1200);
}

// Full two-way merge. `onMerged` lets the UI refresh after local is replaced.
let onMergedCb = null;
export function setOnMerged(cb) { onMergedCb = cb; }

export async function syncNow() {
  if (!state.enabled || !state.online || !getToken() || state.syncing) return;
  set({ syncing: true, error: null });
  try {
    const [notes, plans, schedules, pending, clipsSince] = await Promise.all([
      localdb.all('notes'), localdb.all('plans'), localdb.all('schedules'),
      getPending(), localdb.metaGet(CLIPSYNC_KEY, null),
    ]);
    // Clips are the one entity that pushes a DELTA rather than the whole store:
    // a clipboard is unbounded, and a full dump of it on every sync would be
    // megabytes each way. Only what changed since the cursor goes up.
    // The gate. With clip sync off the server is never told about this
    // account's clips at all — not even their uids.
    let clips = [];
    if (state.clipSync) {
      const from = await localdb.metaGet(CLIPSYNC_FROM_KEY, null);
      const allClips = await localdb.all('clips');
      clips = allClips
        // "Start fresh": clips that predate the opt-in are never uploaded.
        .filter((c) => !from || (c.createdAt || '') >= from)
        // The delta: only what changed since the cursor.
        .filter((c) => !clipsSince || (c.updatedAt || c.createdAt || '') > clipsSince);
    }
    const body = {
      notes,
      plans,
      schedules,
      clips,
      clipsSince: state.clipSync ? clipsSince : null,
      deviceId: await getDeviceId(),
      deletedNoteUids: pending.notes,
      deletedPlanUids: pending.plans,
      deletedScheduleUids: pending.schedules,
      deletedClipUids: state.clipSync ? pending.clips : [],
    };
    const res = await api.post('/api/sync', body);
    // The returned set already excludes anything the web side deleted, so
    // replaceAll drops those locally. We keep their full content in
    // pendingReconcile so the user can restore (re-upload) any they want.
    await Promise.all([
      localdb.replaceAll('notes', (res.notes || []).map(toLocal)),
      localdb.replaceAll('plans', (res.plans || []).map(toLocal)),
      localdb.replaceAll('schedules', (res.schedules || []).map(toLocal)),
      localdb.metaSet(PENDING_KEY, emptyByKind()),
    ]);

    // Clips are applied as a DELTA, deliberately NOT replaceAll: the response
    // holds only what changed, so replacing the store would wipe everything the
    // server didn't happen to mention. Do not "fix" this to match the three
    // lines above.
    if (state.clipSync && Array.isArray(res.clips) && res.clips.length) {
      await localdb.bulkPut('clips', res.clips.map(toLocal));
    }
    for (const uid of (state.clipSync ? res.clipsRemovedUids : []) || []) {
      await localdb.remove('clips', uid); // eslint-disable-line no-await-in-loop
    }
    if (state.clipSync && res.clipsServerTime) await localdb.metaSet(CLIPSYNC_KEY, res.clipsServerTime);

    const lastSync = new Date().toISOString();
    await localdb.metaSet(LASTSYNC_KEY, lastSync);
    const pr = res.pendingReconcile || { notes: [], plans: [] };
    set({ syncing: false, lastSync, pendingReconcile: { notes: pr.notes || [], plans: pr.plans || [] } });
    if (onMergedCb) onMergedCb();
  } catch (err) {
    set({ syncing: false, error: err?.message || 'Sync failed' });
  }
}

// Resolve a batch of web-deleted items.
//   keepNotes/keepPlans → full objects to restore (re-uploaded + re-stored locally)
//   deleteNoteUids/deletePlanUids → confirmed deletions (purged from the DB)
export async function applyReconcile({
  keepNotes = [], keepPlans = [], deleteNoteUids = [], deletePlanUids = [],
} = {}) {
  await api.post('/api/reconcile', {
    keepNoteUids: keepNotes.map((n) => n.uid),
    keepPlanUids: keepPlans.map((p) => p.uid),
    deleteNoteUids,
    deletePlanUids,
  });
  // Put kept items back into the local store (the last pull had dropped them).
  if (keepNotes.length) await localdb.bulkPut('notes', keepNotes.map(toLocal));
  if (keepPlans.length) await localdb.bulkPut('plans', keepPlans.map(toLocal));
  set({ pendingReconcile: { notes: [], plans: [] } });
  if (onMergedCb) onMergedCb();
}

// Defer the prompt without acting — it reappears on the next sync if the
// tombstones are still there.
export function dismissReconcile() {
  set({ pendingReconcile: { notes: [], plans: [] } });
}
