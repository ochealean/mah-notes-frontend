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

let state = {
  initialized: false,
  enabled: false,
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  syncing: false,
  lastSync: null,
  error: null,
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
  return { notes: p.notes || [], plans: p.plans || [], schedules: p.schedules || [] };
}
export async function markDeleted(kind, uid) {
  const p = await getPending();
  if (!p[kind].includes(uid)) p[kind].push(uid);
  await localdb.metaSet(PENDING_KEY, p);
}

// ── local origin (the device's own data, vs data pulled from an account) ──
async function getLocalOrigin() {
  const o = (await localdb.metaGet(ORIGIN_KEY)) || {};
  return { notes: o.notes || [], plans: o.plans || [], schedules: o.schedules || [] };
}
export async function markLocalOrigin(kind, uid) {
  const o = await getLocalOrigin();
  if (!o[kind].includes(uid)) { o[kind].push(uid); await localdb.metaSet(ORIGIN_KEY, o); }
}

// Items on the device that came FROM the account (i.e. not device-created).
// These are the ones we offer to remove on logout.
export async function getAccountOnlyItems() {
  const o = await getLocalOrigin();
  const [notes, plans, schedules] = await Promise.all([
    localdb.all('notes'), localdb.all('plans'), localdb.all('schedules'),
  ]);
  return {
    notes: notes.filter((n) => !o.notes.includes(n.uid)),
    plans: plans.filter((p) => !o.plans.includes(p.uid)),
    schedules: schedules.filter((s) => !o.schedules.includes(s.uid ?? s.id)),
  };
}

// Remove only the account's data from the device; keep the user's own notes.
export async function removeAccountData() {
  const { notes, plans, schedules } = await getAccountOnlyItems();
  await Promise.all([
    ...notes.map((n) => localdb.remove('notes', n.id ?? n.uid)),
    ...plans.map((p) => localdb.remove('plans', p.id ?? p.uid)),
    ...schedules.map((s) => localdb.remove('schedules', s.id ?? s.uid)),
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
    await localdb.metaSet(PENDING_KEY, { notes: [], plans: [], schedules: [] });
    await localdb.metaSet(LASTSYNC_KEY, null);
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
  await localdb.metaSet(PENDING_KEY, { notes: [], plans: [], schedules: [] });
  await localdb.metaSet(LASTSYNC_KEY, null);
  set({ enabled: false, lastSync: null, pendingReconcile: { notes: [], plans: [] } });
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

  set({ initialized: true, enabled, lastSync });
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { set({ online: true }); requestSync(); });
    window.addEventListener('offline', () => set({ online: false }));
  }
  if (canSync()) syncNow();
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
    const [notes, plans, schedules, pending] = await Promise.all([
      localdb.all('notes'), localdb.all('plans'), localdb.all('schedules'), getPending(),
    ]);
    const body = {
      notes,
      plans,
      schedules,
      deletedNoteUids: pending.notes,
      deletedPlanUids: pending.plans,
      deletedScheduleUids: pending.schedules,
    };
    const res = await api.post('/api/sync', body);
    // The returned set already excludes anything the web side deleted, so
    // replaceAll drops those locally. We keep their full content in
    // pendingReconcile so the user can restore (re-upload) any they want.
    await Promise.all([
      localdb.replaceAll('notes', (res.notes || []).map(toLocal)),
      localdb.replaceAll('plans', (res.plans || []).map(toLocal)),
      localdb.replaceAll('schedules', (res.schedules || []).map(toLocal)),
      localdb.metaSet(PENDING_KEY, { notes: [], plans: [], schedules: [] }),
    ]);
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
