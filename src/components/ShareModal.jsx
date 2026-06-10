// ============================================================
//  Share sheet. Two ways to share an item:
//    1. Send to a friend  → a frozen snapshot lands in their inbox;
//       they can "Save to my notes". (needs an account on both sides)
//    2. Share link        → public live/reference links, for people
//       who don't use the app ("for non-users").
// ============================================================
import { useEffect, useState } from 'react';
import { api, getToken } from '../lib/api.js';
import { notify } from '../lib/notify.js';

const shareUrl = (token) => `${window.location.origin}/view?token=${token}`;

function ShareCard({ card, onRevoke, onRegen }) {
  const [copied, setCopied] = useState(false);
  if (card.revoked) {
    return <div className="share-card"><div className="share-revoked"><i className="fas fa-ban" /> Link revoked</div></div>;
  }
  const isRef = card.viewMode === 'reference';
  return (
    <div className="share-card">
      <div className="share-card-title">
        {isRef
          ? <><i className="fas fa-list-check" style={{ color: '#2FD3B6' }} /> Reference link (blank copy)</>
          : <><i className="fas fa-circle" style={{ color: '#2ecc71', fontSize: 9 }} /> Live link</>}
      </div>
      <div className="share-card-desc">
        {isRef
          ? "Gives anyone their own blank checklist to tick off — a personal scratch copy. Their ticks save only on their device and never change your list. No account needed."
          : "Anyone with this link sees this in real-time. Your edits and ticks appear on their screen (they can’t edit). No account needed."}
      </div>
      <div className="share-copy-row">
        <input type="text" className="share-link-input" value={shareUrl(card.token)} readOnly />
        <button className="share-copy-btn" onClick={async () => {
          try { await navigator.clipboard.writeText(shareUrl(card.token)); } catch {}
          setCopied(true); setTimeout(() => setCopied(false), 1600);
        }}><i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`} /></button>
      </div>
      <div className="share-actions">
        <button className="share-mini revoke" onClick={() => onRevoke(card)}><i className="fas fa-ban" /> Revoke</button>
        <button className="share-mini regen" onClick={() => onRegen(card)}><i className="fas fa-rotate" /> New link</button>
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

  if (friends === null) return <div className="friend-hint"><i className="fas fa-spinner fa-spin" /> Loading friends…</div>;
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
          {busy ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-paper-plane" /> Send</>}
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
  const [cards, setCards] = useState(null); // [{viewMode, token, revoked}]
  const [error, setError] = useState('');
  const signedIn = !!getToken();

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [live, ref] = await Promise.all([
          api.post('/api/share', { itemId, itemType, viewMode: 'current-live' }),
          api.post('/api/share', { itemId, itemType, viewMode: 'reference' }),
        ]);
        if (!cancelled) setCards([
          { viewMode: 'current-live', token: live.token },
          { viewMode: 'reference', token: ref.token },
        ]);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to create links. Try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [itemId, itemType, signedIn]);

  async function onRevoke(card) {
    if (!confirm('Revoke this link? Anyone using it will lose access.')) return;
    try {
      await api.del(`/api/share/${card.token}`);
      setCards((cs) => cs.map((c) => (c.viewMode === card.viewMode ? { ...c, revoked: true } : c)));
      notify('Link revoked', 'success');
    } catch (err) { notify(err.message, 'error'); }
  }

  async function onRegen(card) {
    try {
      const { token } = await api.post(`/api/share/${card.token}/regen`);
      setCards((cs) => cs.map((c) => (c.viewMode === card.viewMode ? { ...c, token, revoked: false } : c)));
      notify('New link generated', 'success');
    } catch (err) { notify(err.message, 'error'); }
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
            {!cards && !error && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>
                <i className="fas fa-spinner fa-spin" /> Creating links…
              </div>
            )}
            {cards && cards.map((card) => (
              <ShareCard key={card.viewMode} card={card} onRevoke={onRevoke} onRegen={onRegen} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
