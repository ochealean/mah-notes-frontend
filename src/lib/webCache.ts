// ============================================================
//  Instant-load cache for the WEB app.
//
//  The web build fetches notes/plans/schedules from the API on every visit,
//  showing a loading state each time. This mirrors the last-fetched lists into
//  localStorage so a revisit paints immediately from cache, then refreshes in
//  the background (stale-while-revalidate). The native app already does this via
//  its IndexedDB store, so this cache is web-only.
//
//  Why localStorage (not cookies / Cache API): cookies ride along on every
//  request and cap at ~4 KB; the Cache API is for network responses, not app
//  state. localStorage is the right home for a small per-user JSON snapshot.
//
//  Keyed by user id so one account never sees another's cached data, and it's
//  cleared on sign-out (see AuthContext).
// ============================================================
import { isNative } from './nativeAuth';

const KEY = 'mahnotes_cache';

// Read the cached snapshot for `uid`, or null if none / different account /
// unavailable. Never used on native (which reads its own IndexedDB).
export function readCache(uid) {
  if (isNative || !uid) return null;
  try {
    const snap = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!snap || snap.uid !== uid) return null; // no cache, or a different account
    return {
      notes: Array.isArray(snap.notes) ? snap.notes : [],
      plans: Array.isArray(snap.plans) ? snap.plans : [],
      schedules: Array.isArray(snap.schedules) ? snap.schedules : [],
    };
  } catch { return null; }
}

// Mirror the current lists to localStorage. Best-effort: a quota error (large
// notes) or disabled storage just means the next visit falls back to a fetch.
export function writeCache(uid, data) {
  if (isNative || !uid) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      uid,
      notes: data.notes || [],
      plans: data.plans || [],
      schedules: data.schedules || [],
    }));
  } catch { /* quota exceeded / storage disabled — ignore */ }
}

export function clearCache() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
