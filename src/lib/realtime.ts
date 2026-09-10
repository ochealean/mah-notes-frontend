// ============================================================
//  Realtime client (socket.io). A single shared connection that
//  authenticates with the same JWT the REST API uses. Components
//  subscribe to server events via onRealtime(). Profile changes
//  (me:updated, friend:updated) and data changes (data:changed) both
//  arrive this way.
//
//  Transport: on the Android WebView we force the WebSocket transport so the
//  handshake isn't routed through the CapacitorHttp plugin (which only patches
//  fetch/XHR, not raw WebSockets). On the WEB we keep socket.io's default
//  polling→websocket upgrade — the polling fallback is more resilient (a raw
//  websocket-only connection has nothing to fall back to if the upgrade is
//  interrupted, e.g. while the server is redeploying).
// ============================================================
import { io } from 'socket.io-client';
import { API_BASE, getToken } from './api';
import { isNative } from './nativeAuth';

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
  // Re-broadcast EVERY server event to local subscribers. This used to be a
  // hard-coded whitelist, which meant any new server event was received by the
  // socket and then silently dropped — a bug that costs an hour every time and
  // leaves no trace. onAny has no such failure mode; fanOut already no-ops when
  // nothing is listening.
  socket.onAny((ev, p) => fanOut(ev, p));
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
