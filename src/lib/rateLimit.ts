// ============================================================
//  Client-side rate limiting — a best-effort UX guard.
//
//  This stops accidental floods (double taps, a stuck finger, a runaway
//  loop) from hammering the backend, and gives instant feedback before a
//  request even leaves the device. It is NOT a security control: a determined
//  client can bypass it, so the server enforces the real limits too
//  (see backend src/middleware/rateLimit.js).
//
//  In-memory sliding window, keyed by a bucket name. Cleared on reload —
//  which is fine; the server is the source of truth for abuse prevention.
// ============================================================

const hits: Record<string, number[]> = {};

// Throw a friendly Error if `key` has fired `limit` times within `windowMs`.
// Otherwise record this hit and return. Callers should let the Error bubble to
// their existing try/catch (which surfaces err.message to the user).
export function rateGate(
  key: string,
  opts: { limit: number; windowMs: number; message?: string },
): void {
  const now = Date.now();
  const recent = (hits[key] || []).filter((t) => now - t < opts.windowMs);
  if (recent.length >= opts.limit) {
    const wait = Math.max(1, Math.ceil((opts.windowMs - (now - recent[0])) / 1000));
    throw new Error(opts.message || `Too many requests — wait ${wait}s and try again.`);
  }
  recent.push(now);
  hits[key] = recent;
}
