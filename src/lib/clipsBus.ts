// ============================================================
//  "The clips changed" — across windows, not just across components.
//
//  The desktop build runs three separate WebViews: the main window, the
//  Alt+N capture toast, and the Alt+M paste panel. They share an origin
//  and therefore share IndexedDB, but they do NOT share React state, and
//  only the main window runs the sync engine (initSync is called from
//  MainApp). So when the main window pulls a clip captured on the phone,
//  the paste panel is sitting on a list it read when it opened.
//
//  BroadcastChannel is the cheapest fix that actually works here: same
//  origin, no polling, no server. The localStorage fallback covers the
//  WebView versions that lack it — a storage event fires in every OTHER
//  document of the origin, which is exactly the audience we want.
//
//  The payload is deliberately nothing. Every listener's job is to re-read
//  the local store, and sending the clips themselves would create a second
//  code path that can disagree with the store.
// ============================================================

const NAME = 'mahnotes_clips';
const LS_KEY = 'mahnotes_clips_ping';

let channel: BroadcastChannel | null = null;
const local = new Set<() => void>();

function ensureChannel(): BroadcastChannel | null {
  if (channel) return channel;
  try {
    if (typeof BroadcastChannel === 'undefined') return null;
    channel = new BroadcastChannel(NAME);
    channel.onmessage = () => local.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    return channel;
  } catch { return null; }
}

/** Tell every window (and every listener in this one) that clips changed. */
export function publishClipsChanged() {
  // Same-window listeners first and synchronously: BroadcastChannel does not
  // deliver to the document that posted, and the panel that captured a clip
  // still has to redraw.
  local.forEach((fn) => { try { fn(); } catch { /* ignore */ } });

  const ch = ensureChannel();
  if (ch) { try { ch.postMessage(1); } catch { /* ignore */ } return; }

  // Fallback: writing a changing value fires `storage` in the other documents.
  try { localStorage.setItem(LS_KEY, String(Date.now())); } catch { /* ignore */ }
}

/** Subscribe. Returns an unsubscribe function. */
export function onClipsChanged(fn: () => void): () => void {
  local.add(fn);
  ensureChannel();

  const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY) fn(); };
  try { window.addEventListener('storage', onStorage); } catch { /* ignore */ }

  return () => {
    local.delete(fn);
    try { window.removeEventListener('storage', onStorage); } catch { /* ignore */ }
  };
}
