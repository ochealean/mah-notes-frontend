// ============================================================
//  "Scan my timetable" (AI) — button + review flow.
//
//  Pick/take a photo of a class schedule → the backend reads it with
//  Claude vision → the parsed blocks come back for review. The user
//  unticks anything wrong, optionally names a group, and the kept
//  blocks are created as normal schedule blocks (weekly reminder on,
//  alarm off — they can edit any block afterwards).
//
//  Needs an account + internet; the API key lives on the server only.
// ============================================================
import { useRef, useState } from 'react';
import { getToken } from '../lib/api';
import { scanScheduleImage } from '../lib/scanSchedule';
import { createSchedule } from '../lib/scheduleStore';
import { notify } from '../lib/notify';

const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

function fmt(t) {
  const [h, m] = String(t || '').split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return t;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${ap}`;
}

export default function ScanSchedule({ onAdded }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState(null); // [{...block, include}] | null
  const [group, setGroup] = useState('');

  function start() {
    if (!getToken()) {
      notify('Sign in first (Settings → Account & Sync) — AI scanning needs an account.', 'info');
      return;
    }
    if (!navigator.onLine) { notify('Scanning needs an internet connection.', 'error'); return; }
    fileRef.current?.click();
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    try {
      const blocks = await scanScheduleImage(file);
      if (!blocks.length) {
        notify('Couldn’t find a timetable in that image — try a clearer, straight-on photo.', 'error');
      } else {
        setRows(blocks.map((b) => ({ ...b, include: true })));
        setGroup('');
      }
    } catch (err) {
      notify(err.message || 'Scan failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (i) => setRows((r) => r.map((b, j) => (j === i ? { ...b, include: !b.include } : b)));
  const kept = rows ? rows.filter((b) => b.include) : [];

  async function addAll() {
    if (saving || !kept.length) return;
    setSaving(true);
    try {
      for (const b of kept) {
        // eslint-disable-next-line no-await-in-loop
        await createSchedule({
          title: b.title, sub: b.sub, group: group.trim(),
          day: b.day, start: b.start, end: b.end,
          notify: true, alarm: false,
        });
      }
      notify(`Added ${kept.length} block${kept.length > 1 ? 's' : ''} to your schedule`, 'success');
      setRows(null);
      if (onAdded) onAdded();
    } catch (err) {
      notify(err.message || 'Could not save the blocks', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="scan-btn" onClick={start} disabled={busy}>
        <i className={`fas ${busy ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}`} />
        <span>{busy ? 'Reading your timetable…' : <>Scan a photo of your schedule <b>· AI</b></>}</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />

      {rows && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRows(null); }}>
          <div className="popup">
            <div className="popup-head">
              <h3><i className="fas fa-wand-magic-sparkles" /> Found {rows.length} block{rows.length > 1 ? 's' : ''}</h3>
              <button className="icon-btn" aria-label="Close" onClick={() => setRows(null)}><i className="fas fa-times" /></button>
            </div>
            <p className="settings-hint-text" style={{ padding: '0 2px 8px' }}>
              Untick anything that’s wrong — you can edit any block after adding (times, alarm, ringtone…).
            </p>

            <div className="scan-rows">
              {rows.map((b, i) => (
                <button key={i} className={`scan-row${b.include ? '' : ' off'}`} onClick={() => toggle(i)}>
                  <i className={`${b.include ? 'fas fa-square-check' : 'far fa-square'} scan-check`} />
                  <span className="scan-day">{DAY_SHORT[b.day]}</span>
                  <span className="scan-main">
                    <span className="scan-title">{b.title}</span>
                    <span className="scan-time">{fmt(b.start)} – {fmt(b.end)}{b.sub ? ` · ${b.sub}` : ''}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <i className="fas fa-layer-group field-icon" />
              <input className="field-input" placeholder="Add to group — e.g. My class (optional)"
                value={group} onChange={(e) => setGroup(e.target.value)} />
            </div>

            <button className="btn btn-primary btn-block" onClick={addAll} disabled={saving || !kept.length}>
              {saving ? 'Adding…' : `Add ${kept.length} block${kept.length === 1 ? '' : 's'} to Schedule`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
