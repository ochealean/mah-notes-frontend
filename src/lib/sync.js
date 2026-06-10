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
import { localdb } from './localdb.js';
import { api, getToken } from './api.js';

const PENDING_KEY = 'pendingDeletes';
const ENABLED_KEY = 'syncEnabled';
const LASTSYNC_KEY = 'lastSync';

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

const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
function set(patch) { state = { ...state, ...patch }; emit(); }

// ── external-store glue ──
function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function getSnapshot() { return state; }
export function useSync() { return useSyncExternalStore(subscribe, getSnapshot); }
export const getSyncState = () => state;

// ── pending deletions (so a delete propagates to the server) ──
async function getPending() {
  return (await localdb.metaGet(PENDING_KEY)) || { notes: [], plans: [] };
}
export async function markDeleted(kind, uid) {
  const p = await getPending();
  if (!p[kind].includes(uid)) p[kind].push(uid);
  await localdb.metaSet(PENDING_KEY, p);
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
    const [notes, plans, pending] = await Promise.all([
      localdb.all('notes'), localdb.all('plans'), getPending(),
    ]);
    const body = {
      notes,
      plans,
      deletedNoteUids: pending.notes,
      deletedPlanUids: pending.plans,
    };
    const res = await api.post('/api/sync', body);
    // The returned set already excludes anything the web side deleted, so
    // replaceAll drops those locally. We keep their full content in
    // pendingReconcile so the user can restore (re-upload) any they want.
    await Promise.all([
      localdb.replaceAll('notes', (res.notes || []).map(toLocal)),
      localdb.replaceAll('plans', (res.plans || []).map(toLocal)),
      localdb.metaSet(PENDING_KEY, { notes: [], plans: [] }),
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
