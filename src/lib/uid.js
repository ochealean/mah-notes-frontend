// Stable client-generated id for offline items (used as the item's `id`).
export function newUid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Fallback for very old WebViews.
  return 'uid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
