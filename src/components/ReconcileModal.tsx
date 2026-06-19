// ============================================================
//  Deletion reconciliation sheet.
//
//  Appears when the OTHER device (web ⇄ app) deleted items this side still
//  has. The user ticks the ones to KEEP (restored everywhere); unticked ones
//  are deleted for good. Defaults to keep, so nothing is lost by accident.
// ============================================================
import { useMemo, useState } from 'react';
import { contentToHtml } from '../lib/richtext';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

// Small body preview shown under each item's title so the user can see WHAT
// they're keeping/deleting, not just the header. `kind` is passed explicitly
// because native (sync) items don't carry a discriminator field.
function ItemBody({ item, kind }) {
  if (kind === 'plan') {
    const days = item.days || {};
    const chips = DAY_ORDER.filter((d) => days[d]?.length);
    if (!chips.length) return <div className="reconcile-row-body muted">Empty plan</div>;
    return (
      <div className="reconcile-row-body plan-chips">
        {chips.map((d) => <span key={d} className="inbox-chip">{DAY_SHORT[d]} · {days[d].length}</span>)}
      </div>
    );
  }
  const html = contentToHtml(item.content);
  if (!html) return <div className="reconcile-row-body muted">Empty document</div>;
  return <div className="reconcile-row-body doc-content" dangerouslySetInnerHTML={{ __html: html }} />;
}

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

  const Row = ({ item, icon, kind }) => {
    const kept = keep.has(item.uid);
    return (
      <label className={`reconcile-row${kept ? '' : ' will-delete'}`}>
        <input type="checkbox" checked={kept} onChange={() => toggle(item.uid)} />
        <span className="reconcile-row-icon"><i className={`fas ${icon}`} /></span>
        <span className="reconcile-row-main">
          <span className="reconcile-row-head">
            <span className="reconcile-row-title">{item.title || 'Untitled'}</span>
            <span className="reconcile-row-tag">{kept ? 'Keep' : 'Delete'}</span>
          </span>
          <ItemBody item={item} kind={kind} />
        </span>
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
          {notes.map((n) => <Row key={n.uid} item={n} kind="note" icon="fa-file-lines" />)}
          {plans.map((p) => <Row key={p.uid} item={p} kind="plan" icon="fa-calendar-week" />)}
        </div>

        <button className="btn-primary reconcile-apply" onClick={apply} disabled={busy}>
          {busy ? <><i className="fas fa-spinner fa-spin" /> Applying…</>
            : <>Apply — keep {keptCount}, delete {delCount}</>}
        </button>
      </div>
    </div>
  );
}
