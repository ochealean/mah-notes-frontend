// ============================================================
//  "Build a plan with AI" — Plans counterpart of ScanSchedule.
//  Describe a routine in text and/or attach a photo of one → the
//  backend (Gemini) returns a day-by-day list → review → create a Plan.
//  Needs an account + internet.
// ============================================================
import { useRef, useState } from 'react';
import { getToken } from '../lib/api';
import { scanPlanInput } from '../lib/aiImport';
import { repo } from '../lib/repo';
import { notify } from '../lib/notify';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

export default function ScanPlan({ onAdded }) {
  const fileRef = useRef(null);
  const fileObj = useRef(null);
  const [open, setOpen] = useState(false);     // input composer
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(null);       // [{ day, text, include }] | null
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  function start() {
    if (!getToken()) { notify('Sign in first (Settings → Account & Sync) — AI needs an account.', 'info'); return; }
    setText(''); setFileName(''); fileObj.current = null; setOpen(true);
  }
  function pickFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (f) { fileObj.current = f; setFileName(f.name); }
  }

  async function build() {
    if (!navigator.onLine) { notify('AI needs an internet connection.', 'error'); return; }
    if (!fileObj.current && !text.trim()) { notify('Add a photo or some text first.', 'info'); return; }
    setBusy(true);
    try {
      const days = await scanPlanInput({ file: fileObj.current, text });
      const flat = [];
      for (const d of DAY_ORDER) (days[d] || []).forEach((t) => flat.push({ day: d, text: t, include: true }));
      if (!flat.length) {
        notify('Couldn’t build a plan from that — add more detail or a clearer photo.', 'error');
      } else {
        setRows(flat); setTitle('My Plan'); setOpen(false);
      }
    } catch (err) { notify(err.message || 'AI failed', 'error'); }
    finally { setBusy(false); }
  }

  const toggle = (i) => setRows((r) => r.map((b, j) => (j === i ? { ...b, include: !b.include } : b)));
  const kept = rows ? rows.filter((b) => b.include) : [];

  async function create() {
    if (saving || !kept.length) return;
    setSaving(true);
    try {
      const days = {};
      for (const r of kept) (days[r.day] || (days[r.day] = [])).push({ text: r.text, checked: false });
      await repo.createPlan({ title: title.trim() || 'My Plan', days });
      notify('Plan created', 'success');
      setRows(null);
      if (onAdded) onAdded();
    } catch (err) { notify(err.message || 'Could not create the plan', 'error'); }
    finally { setSaving(false); }
  }

  return (
    <>
      <button className="scan-btn" onClick={start} disabled={busy}>
        <i className={`fas ${busy ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}`} />
        <span>{busy ? 'Building your plan…' : <>Build a weekly plan <b>· AI</b></>}</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickFile} />

      {open && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="popup">
            <div className="popup-head">
              <h3><i className="fas fa-wand-magic-sparkles" /> Build a plan with AI</h3>
              <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}><i className="fas fa-times" /></button>
            </div>
            <p className="settings-hint-text" style={{ padding: '0 2px 8px' }}>
              Describe your routine (e.g. “Push / Pull / Legs, rest Sunday”) and/or attach a photo of one.
            </p>
            <textarea className="day-textarea" rows={4} placeholder="Describe your weekly routine…"
              value={text} onChange={(e) => setText(e.target.value)} />
            <button className="chip-btn" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>
              <i className="fas fa-image" /> {fileName || 'Attach a photo (optional)'}
            </button>
            <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={build} disabled={busy}>
              {busy ? 'Building…' : 'Build with AI'}
            </button>
          </div>
        </div>
      )}

      {rows && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRows(null); }}>
          <div className="popup">
            <div className="popup-head">
              <h3><i className="fas fa-wand-magic-sparkles" /> Review plan</h3>
              <button className="icon-btn" aria-label="Close" onClick={() => setRows(null)}><i className="fas fa-times" /></button>
            </div>
            <p className="settings-hint-text" style={{ padding: '0 2px 8px' }}>Untick anything wrong; you can edit the plan afterwards.</p>
            <div className="field" style={{ marginBottom: 10 }}>
              <i className="fas fa-pen field-icon" />
              <input className="field-input" placeholder="Plan name" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="scan-rows">
              {rows.map((b, i) => (
                <button key={i} className={`scan-row${b.include ? '' : ' off'}`} onClick={() => toggle(i)}>
                  <i className={`${b.include ? 'fas fa-square-check' : 'far fa-square'} scan-check`} />
                  <span className="scan-day">{DAY_SHORT[b.day]}</span>
                  <span className="scan-main"><span className="scan-title">{b.text}</span></span>
                </button>
              ))}
            </div>
            <button className="btn btn-primary btn-block" onClick={create} disabled={saving || !kept.length}>
              {saving ? 'Creating…' : `Create plan (${kept.length} item${kept.length === 1 ? '' : 's'})`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
