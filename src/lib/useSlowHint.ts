// ============================================================
//  "This is taking a while" hint.
//
//  The API is hosted on a tier that spins down when idle, so the first request
//  after a quiet period can take tens of seconds to wake the server. A bare
//  spinner for that long reads as "broken" and makes people reload or re-click.
//  Flipping to an explanatory message costs nothing and makes the wait legible.
// ============================================================
import { useEffect, useState } from 'react';

// Returns false, then true once `active` has stayed true for `afterMs`.
// Resets whenever `active` goes false.
export function useSlowHint(active: boolean, afterMs = 4000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(t);
  }, [active, afterMs]);
  return slow;
}
