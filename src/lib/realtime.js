// ============================================================
//  Realtime client (socket.io). A single shared connection that
//  authenticates with the same JWT the REST API uses. Components
//  subscribe to server events via onRealtime(); right now those are
//  display-name updates (me:updated for self, friend:updated for friends).
//
//  Transport: on the Android WebView we force the WebSocket transport so the
//  handshake isn't routed through the CapacitorHttp plugin (which only patches
//  fetch/XHR, not raw WebSockets). On the WEB we keep socket.io's default
//  polling→websocket upgrade — the polling fallback is more resilient (a raw
//  websocket-only connection has nothing to fall back to if the upgrade is
//  interrupted, e.g. while the server is redeploying).
// ============================================================
import { io } from 'socket.io-client';
import { API_BASE, getToken } from './api.js';
import { isNative } from './nativeAuth.js';

let socket = null;
const listeners = new Map(); // event -> Set<fn>

function fanOut(event, payload) {
  const set = listeners.get(event);
  if (set) set.forEach((fn) => { try { fn(payload); } catch { /* listener error — ignore */ } });
}

// Open the connection (idempotent). No-op when signed out.
export function connectRealtime() {
  const token = getToken();
  if (!token) return;
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return;
  }
  socket = io(API_BASE, {
    auth: { token },
    // Native: websocket only (WebView/CapacitorHttp). Web: default upgrade path.
    ...(isNative ? { transports: ['websocket'] } : {}),
  });
  // Re-broadcast every known event to local subscribers.
  ['me:updated', 'friend:updated'].forEach((ev) => socket.on(ev, (p) => fanOut(ev, p)));
}

export function disconnectRealtime() {
  if (socket) { socket.disconnect(); socket = null; }
}

// Subscribe to a realtime event. Returns an unsubscribe function.
export function onRealtime(event, fn) {
  let set = listeners.get(event);
  if (!set) { set = new Set(); listeners.set(event, set); }
  set.add(fn);
  return () => { set.delete(fn); };
}
