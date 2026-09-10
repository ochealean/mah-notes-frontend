// ============================================================
//  When does a clip expire?
//
//  Deliberately a PURE FUNCTION of fields the clip already carries,
//  never a deadline someone has to remember to enforce. Because it is
//  deterministic, every device and the server reach the same answer
//  without talking to each other, which buys three things:
//
//    • a device offline for six months still expires its own clips;
//    • an expired clip re-uploaded by a stale device is simply refused,
//      so expiry needs no tombstone (user deletes still do);
//    • the server can index the materialised value and let MongoDB's
//      TTL do the deleting, with no cron on a backend that sleeps.
//
//  The backend keeps a mirror of this file at
//  mah-notes-backend/src/utils/clipRetention.js. Change one, change both.
// ============================================================

export const RETENTION_DAYS = 30;
export const UNPIN_GRACE_HOURS = 24;

// Backstops against an unbounded history. The text cap matches
// ClipStore.MAX_TEXT on the Android side so neither truncates the other.
export const CLIP_MAX = 500;
export const CLIP_MAX_TEXT = 20000;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const ms = (v: any): number => {
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : NaN;
};

export interface RetentionFields {
  createdAt?: string | number | null;
  pinned?: boolean;
  unpinnedAt?: string | number | null;
}

// The moment this clip should disappear, or null if it never should.
//
// The rule is exact and worth reading twice: unpinning at day 29 leaves the
// expiry at day 30, with NO grace. Only a clip unpinned AFTER its 30 days have
// already elapsed gets the extra 24 hours. Taking max(created+30d, unpinned+24h)
// would wrongly hand out grace at day 29, so the branch is explicit.
export function computeExpiresAt(clip: RetentionFields): string | null {
  if (clip?.pinned) return null;

  const created = ms(clip?.createdAt);
  // No usable createdAt means we cannot reason about age; keep it rather than
  // delete something we don't understand.
  if (!Number.isFinite(created)) return null;

  const normalDeadline = created + RETENTION_DAYS * DAY_MS;
  const unpinned = ms(clip?.unpinnedAt);

  if (Number.isFinite(unpinned) && unpinned >= normalDeadline) {
    return new Date(unpinned + UNPIN_GRACE_HOURS * HOUR_MS).toISOString();
  }
  return new Date(normalDeadline).toISOString();
}

export function isExpired(clip: RetentionFields & { expiresAt?: string | null }, now = Date.now()) {
  // Recompute rather than trusting a stored value: the stored one is an index,
  // the derived one is the truth.
  const at = computeExpiresAt(clip);
  if (!at) return false;
  return Date.parse(at) <= now;
}

// Human-readable countdown for the Clips pane.
export function expiryLabel(clip: RetentionFields): string {
  if (clip?.pinned) return 'Kept while pinned';
  const at = computeExpiresAt(clip);
  if (!at) return '';
  const left = Date.parse(at) - Date.now();
  if (left <= 0) return 'Expired';
  const hours = Math.round(left / HOUR_MS);
  if (hours < 24) return `Expires in ${hours}h`;
  const days = Math.round(left / DAY_MS);
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}
