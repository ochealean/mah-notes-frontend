// ============================================================
//  Deletion reconciliation sheet.
//
//  Appears when the OTHER device (web ⇄ app) deleted items this side still
//  has. The user ticks the ones to KEEP (restored everywhere); unticked ones
//  are deleted for good. Defaults to keep, so nothing is lost by accident.
// ============================================================
import { useMemo, useState } from 'react';

export default function ReconcileModal({ data, onApply, onClose }) {
  const notes = data?.notes || [];
  const plans = data?.plans || [];
  const total = notes.length + plans.length;

  // Track which uids are kept. Start with everything checked (safe default).
  const [keep, setKeep] = useState(() => {
    const s = new Set();
    notes.forEach((n) => s.add(n.uid));
    plans.forEach((p) => s.add(p.uid));
    return s;
  });
  const [busy, setBusy] = useState(false);

  const toggle = (uid) => setKeep((prev) => {
    const next = new Set(prev);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    return next;
  });

  const allKept = useMemo(() => keep.size === total, [keep, total]);
  const setAll = (on) => setKeep(() => {
    if (!on) return new Set();
    const s = new Set();
    notes.forEach((n) => s.add(n.uid));
    plans.forEach((p) => s.add(p.uid));
    return s;
  });

  async function apply() {
    if (busy) return;
    setBusy(true);
    try {
      await onApply({
        keepNotes: notes.filter((n) => keep.has(n.uid)),
        keepPlans: plans.filter((p) => keep.has(p.uid)),
        deleteNoteUids: notes.filter((n) => !keep.has(n.uid)).map((n) => n.uid),
        deletePlanUids: plans.filter((p) => !keep.has(p.uid)).map((p) => p.uid),
      });
    } finally {
      setBusy(false);
    }
  }

  const keptCount = keep.size;
  const delCount = total - keptCount;

  const Row = ({ item, icon }) => {
    const kept = keep.has(item.uid);
    return (
      <label className={`reconcile-row${kept ? '' : ' will-delete'}`}>
        <input type="checkbox" checked={kept} onChange={() => toggle(item.uid)} />
        <span className="reconcile-row-icon"><i className={`fas ${icon}`} /></span>
        <span className="reconcile-row-title">{item.title || 'Untitled'}</span>
        <span className="reconcile-row-tag">{kept ? 'Keep' : 'Delete'}</span>
      </label>
    );
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-trash-can-arrow-up" /> Deleted on your other device</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <p className="reconcile-intro">
          These were removed elsewhere. <b>Keep</b> the ones you still want — they’ll be
          restored everywhere. Unchecked items are <b>deleted for good</b>.
        </p>

        <div className="reconcile-bulk">
          <button type="button" className="reconcile-bulk-btn" onClick={() => setAll(true)} disabled={allKept}>
            <i className="fas fa-check-double" /> Keep all
          </button>
          <button type="button" className="reconcile-bulk-btn danger" onClick={() => setAll(false)} disabled={keptCount === 0}>
            <i className="fas fa-trash" /> Delete all
          </button>
        </div>

        <div className="reconcile-list">
          {notes.map((n) => <Row key={n.uid} item={n} icon="fa-file-lines" />)}
          {plans.map((p) => <Row key={p.uid} item={p} icon="fa-calendar-week" />)}
        </div>

        <button className="btn-primary reconcile-apply" onClick={apply} disabled={busy}>
          {busy ? <><i className="fas fa-spinner fa-spin" /> Applying…</>
            : <>Apply — keep {keptCount}, delete {delCount}</>}
        </button>
      </div>
    </div>
  );
}
