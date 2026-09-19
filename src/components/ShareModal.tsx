// ============================================================
//  Share sheet. Two ways to share an item:
//    1. Send to a friend  → a frozen snapshot lands in their inbox;
//       they can "Save to my notes". (needs an account on both sides)
//    2. Share link        → ONE public link for people who don't use the
//       app. On a checklist the reader chooses, on the page itself, whether
//       to follow your ticks live or tick their own copy (see Viewer), so
//       the separate live and reference links are no longer needed.
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import { copyText } from '../lib/copyText';
import { notify } from '../lib/notify';
import { bundleLinkParams } from '../lib/bundles';

// Share links must point at the public website, not the in-app origin.
// Inside the APK window.location.origin is "https://localhost", so links
// built from it are useless to recipients. Use the configured public web
// base when set (required for native); fall back to the current origin on web.
const WEB_BASE = (import.meta.env.VITE_PUBLIC_WEB_BASE || window.location.origin).replace(/\/$/, '');
// A recipient renders the SENDER's bundle, and the public share endpoint
// does not look it up, so the link carries it (see bundleLinkParams).
const shareUrl = (token, extra = '') => `${WEB_BASE}/view?token=${token}${extra}`;

// The link card. A revoked link is not a dead end: the card offers a fresh
// link in its place, because revoking deletes the old token outright and
// there is nothing left to regenerate from.
function LinkCard({ card, busy, onRevoke, onRegen, onCreate, linkExtra }) {
  const [copied, setCopied] = useState(false);
  if (card.revoked) {
    return (
      <div className="share-card">
        <div className="share-revoked"><i className="fas fa-ban" /> Link revoked</div>
        <div className="share-card-desc">
          Nobody can open the old link any more. You can make a new one — it will be a
          different address, so people with the old one still won’t get in.
        </div>
        <div className="share-actions">
          <button className="share-mini regen" disabled={busy} onClick={onCreate}>
            <i className={`fas ${busy ? 'fa-circle-notch fa-spin' : 'fa-link'}`} /> Create a new link
          </button>
        </div>
      </div>
    );
  }
  const url = shareUrl(card.token, linkExtra);
  return (
    <div className="share-card">
      <div className="share-card-title">
        <i className="fas fa-link" /> Share link
      </div>
      <div className="share-card-desc">
        Anyone with this link can read it — no account needed. On a checklist they can follow
        your checks live, or check off their own copy; their checks stay on their device and
        never change yours.
      </div>
      <div className="share-copy-row">
        <input type="text" className="share-link-input" value={url} readOnly aria-label="Share link" />
        <button className="share-copy-btn" aria-label="Copy link" onClick={async () => {
          await copyText(url);
          setCopied(true); setTimeout(() => setCopied(false), 1600);
        }}><i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`} /></button>
      </div>
      <div className="share-actions">
        <button className="share-mini revoke" disabled={busy} onClick={onRevoke}><i className="fas fa-ban" /> Revoke</button>
        <button className="share-mini regen" disabled={busy} onClick={onRegen}><i className="fas fa-rotate" /> New link</button>
      </div>
    </div>
  );
}

// ── Send a snapshot to a friend ──
function FriendSend({ itemType, itemId }) {
  const [friends, setFriends] = useState(null); // null=loading
  const [sel, setSel] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/friends');
        if (cancelled) return;
        const f = res.friends || [];
        setFriends(f);
        if (f[0]) setSel(f[0].user.id);
      } catch { if (!cancelled) setFriends([]); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function send() {
    if (!sel || busy) return;
    setBusy(true);
    try {
      await api.post('/api/friend-shares', { friendId: sel, itemType, itemId });
      const name = friends.find((f) => f.user.id === sel)?.user.displayName || 'your friend';
      setSentTo((s) => (s.includes(name) ? s : [...s, name]));
      notify(`Shared with ${name}`, 'success');
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  }

  if (friends === null) return <div className="friend-hint"><i className="fas fa-circle-notch fa-spin" /> Loading friends…</div>;
  if (friends.length === 0) {
    return <div className="friend-hint">Add friends in <b>Settings → Friends</b> to share directly with them.</div>;
  }
  return (
    <div className="fs-send">
      <div className="fs-send-row">
        <select className="mini-select fs-select" value={sel} onChange={(e) => setSel(e.target.value)}>
          {friends.map((f) => <option key={f.user.id} value={f.user.id}>{f.user.displayName}</option>)}
        </select>
        <button className="btn btn-primary fs-send-btn" onClick={send} disabled={busy}>
          {busy ? <i className="fas fa-circle-notch fa-spin" /> : <><i className="fas fa-paper-plane" /> Send</>}
        </button>
      </div>
      {sentTo.length > 0 && (
        <div className="fs-sent">
          <i className="fas fa-check" /> Sent to {sentTo.join(', ')}. It’s a snapshot — your later edits won’t change their copy.
        </div>
      )}
    </div>
  );
}

export default function ShareModal({ itemType, itemId, onClose }) {
  const [card, setCard] = useState(null); // { token, revoked } | null while loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signedIn = !!getToken();
  const linkExtra = bundleLinkParams();

  // Get this item's link, or create it. The server returns the existing token
  // when there is one, so opening the sheet twice never makes a second link.
  const fetchLink = useCallback(async () => {
    const res = await api.post('/api/share', { itemId, itemType, viewMode: 'current-live' });
    return { token: res.token, revoked: false };
  }, [itemId, itemType]);

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const c = await fetchLink();
        if (!cancelled) setCard(c);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not create the link. Try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [fetchLink, signedIn]);

  async function onRevoke() {
    if (!card || !confirm('Revoke this link? Anyone using it will lose access.')) return;
    setBusy(true);
    try {
      await api.del(`/api/share/${card.token}`);
      setCard((c) => ({ ...c, revoked: true }));
      notify('Link revoked', 'success');
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  }

  async function onRegen() {
    if (!card) return;
    setBusy(true);
    try {
      const { token } = await api.post(`/api/share/${card.token}/regen`);
      setCard({ token, revoked: false });
      notify('New link made — the old one no longer works', 'success');
    } catch (err) { notify(err.message, 'error'); } finally { setBusy(false); }
  }

  // After a revoke the old token is gone, so "new link" means create, not rotate.
  async function onCreate() {
    setBusy(true);
    try {
      setCard(await fetchLink());
      notify('New link ready', 'success');
    } catch (err) { notify(err.message || 'Could not create the link', 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-share-alt" /> Share</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        {!signedIn ? (
          <div className="friend-hint" style={{ padding: '6px 4px' }}>
            Sign in (<b>Settings → Account &amp; Sync</b>) to share this item.
          </div>
        ) : (
          <>
            <div className="view-section-label"><i className="fas fa-user-group" /> Send to a friend</div>
            <FriendSend itemType={itemType} itemId={itemId} />

            <div className="view-section-label" style={{ marginTop: 18 }}><i className="fas fa-link" /> Share link · for people without the app</div>
            {error && <div className="share-revoked">{error}</div>}
            {!card && !error && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>
                <i className="fas fa-circle-notch fa-spin" /> Making your link…
              </div>
            )}
            {card && (
              <LinkCard card={card} busy={busy} onRevoke={onRevoke} onRegen={onRegen} onCreate={onCreate} linkExtra={linkExtra} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
