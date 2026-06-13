// ============================================================
//  "Shared with me" inbox. Items friends sent you (frozen snapshots).
//  Save → clones it into your own notes/plans. Dismiss → drops it.
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { onRealtime } from '../lib/realtime.js';
import { notify } from '../lib/notify.js';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

function Avatar({ person }) {
  const initial = ((person?.displayName || person?.email || 'U')[0] || 'U').toUpperCase();
  return person?.avatar
    ? <img className="friend-avatar sm" src={person.avatar} alt="" />
    : <div className="friend-avatar sm">{initial}</div>;
}

function PlanPreview({ days }) {
  const chips = DAY_ORDER.filter((d) => days?.[d]?.length);
  if (chips.length === 0) return <div className="inbox-preview muted">Empty plan</div>;
  return (
    <div className="inbox-plan-chips">
      {chips.map((d) => <span key={d} className="inbox-chip">{DAY_SHORT[d]} · {days[d].length}</span>)}
    </div>
  );
}

export default function InboxModal({ onClose, onSaved }) {
  const [shares, setShares] = useState(null);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    try { const res = await api.get('/api/friend-shares'); setShares(res.shares || []); }
    catch (err) { notify(err.message, 'error'); setShares([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Realtime: a sender renaming themselves should update their name here too.
  useEffect(() => onRealtime('friend:updated', () => load()), [load]);

  async function save(s) {
    setBusyId(s.id);
    try {
      await api.post(`/api/friend-shares/${s.id}/save`);
      setShares((arr) => arr.filter((x) => x.id !== s.id));
      notify('Saved to your notes', 'success');
      if (onSaved) onSaved();
    } catch (err) { notify(err.message, 'error'); } finally { setBusyId(''); }
  }

  async function dismiss(s) {
    setBusyId(s.id);
    try {
      await api.del(`/api/friend-shares/${s.id}`);
      setShares((arr) => arr.filter((x) => x.id !== s.id));
    } catch (err) { notify(err.message, 'error'); } finally { setBusyId(''); }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-inbox" /> Shared with me</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        {shares === null ? (
          <div className="friend-hint"><i className="fas fa-spinner fa-spin" /> Loading…</div>
        ) : shares.length === 0 ? (
          <div className="friend-hint">Nothing shared with you yet. When a friend shares a doc or plan, it lands here.</div>
        ) : shares.map((s) => (
          <div key={s.id} className="inbox-card">
            <div className="inbox-from">
              <Avatar person={s.from} />
              <span><b>{s.from.displayName}</b> shared a {s.itemType}</span>
            </div>
            <div className="inbox-title">
              <i className={`fas ${s.itemType === 'plan' ? 'fa-calendar-week' : 'fa-file-lines'}`} /> {s.title || 'Untitled'}
            </div>
            {s.itemType === 'note'
              ? <div className="inbox-preview doc-content" dangerouslySetInnerHTML={{ __html: s.preview || '<span class="muted">Empty document</span>' }} />
              : <PlanPreview days={s.days} />}
            <div className="inbox-actions">
              <button className="friend-btn add" disabled={busyId === s.id} onClick={() => save(s)}>
                <i className="fas fa-download" /> Save to my notes
              </button>
              <button className="friend-btn decline" disabled={busyId === s.id} onClick={() => dismiss(s)}>
                <i className="fas fa-times" /> Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
