// ============================================================
//  Draft store for in-progress editors.
//  Persists to localStorage (available in both the browser and the
//  Capacitor WebView) so a half-written document survives the app
//  being closed or killed mid-typing. The draft is cleared the
//  moment the item is saved (or the user discards it).
//
//  Keys are namespaced, e.g. "note:new" (a brand-new doc) or
//  "note:<id>" (unsaved edits to an existing doc).
// ============================================================
const PREFIX = 'mahnotes:draft:';
const k = (key) => `${PREFIX}${key}`;

export function saveDraft(key, data) {
  try {
    localStorage.setItem(k(key), JSON.stringify({ ...data, updatedAt: Date.now() }));
  } catch { /* storage full / unavailable — drafts are best-effort */ }
}

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(k(key));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearDraft(key) {
  try { localStorage.removeItem(k(key)); } catch { /* ignore */ }
}
