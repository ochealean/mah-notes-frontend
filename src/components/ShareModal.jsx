// ============================================================
//  Share sheet: creates/loads a live link and a reference link for
//  the item, with copy / revoke / new-link actions.
// ============================================================
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
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

export default function ShareModal({ itemType, itemId, onClose }) {
  const [cards, setCards] = useState(null); // [{viewMode, token, revoked}]
  const [error, setError] = useState('');

  useEffect(() => {
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
        if (!cancelled) setError('Failed to create links. Try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [itemId, itemType]);

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
        <div>
          {error && <div className="share-revoked">{error}</div>}
          {!cards && !error && (
            <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>
              <i className="fas fa-spinner fa-spin" /> Creating links…
            </div>
          )}
          {cards && cards.map((card) => (
            <ShareCard key={card.viewMode} card={card} onRevoke={onRevoke} onRegen={onRegen} />
          ))}
        </div>
      </div>
    </div>
  );
}
