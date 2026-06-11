// ============================================================
//  Schedule block editor (native): pick a day + start/end time,
//  name it, and toggle the weekly reminder. Saving (re)schedules
//  the notification; deleting cancels it.
// ============================================================
import { useState, useEffect } from 'react';
import { createSchedule, updateSchedule, deleteSchedule, listGroups } from '../lib/scheduleStore.js';
import { getRingtones } from '../lib/alarm.js';
import { notify } from '../lib/notify.js';

const DAYS = [
  ['monday', 'Mon'], ['tuesday', 'Tue'], ['wednesday', 'Wed'], ['thursday', 'Thu'],
  ['friday', 'Fri'], ['saturday', 'Sat'], ['sunday', 'Sun'],
];

export default function ScheduleEditor({ initial, onClose, onSaved }) {
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title || '');
  const [sub, setSub] = useState(initial?.sub || '');
  const [group, setGroup] = useState(initial?.group || '');
  const [groups, setGroups] = useState([]);
  const [day, setDay] = useState(initial?.day || 'monday');
  const [start, setStart] = useState(initial?.start || '09:00');
  const [end, setEnd] = useState(initial?.end || '10:00');
  const [doNotify, setDoNotify] = useState(initial?.notify !== false);
  const [doAlarm, setDoAlarm] = useState(initial?.alarm === true);
  const [ringtone, setRingtone] = useState(initial?.ringtone || '');
  const [ringtones, setRingtones] = useState([{ title: 'Default alarm', uri: '' }]);
  const [busy, setBusy] = useState(false);

  // Load the phone's alarm ringtones for the picker.
  useEffect(() => {
    let cancelled = false;
    (async () => { try { const r = await getRingtones(); if (!cancelled && r.length) setRingtones(r); } catch {} })();
    (async () => { try { const g = await listGroups(); if (!cancelled) setGroups(g); } catch {} })();
    return () => { cancelled = true; };
  }, []);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const data = { title, sub, group, day, start, end, notify: doNotify, alarm: doAlarm, ringtone };
      if (editing) await updateSchedule(initial.id, data);
      else await createSchedule(data);
      notify(doAlarm ? 'Saved — weekly alarm set' : doNotify ? 'Saved — weekly reminder set' : 'Saved', 'success');
      onSaved();
    } catch (err) {
      notify(err.message || 'Could not save', 'error');
      setBusy(false);
    }
  }

  async function del() {
    if (!confirm('Delete this time block? Its reminder will be cancelled.')) return;
    try { await deleteSchedule(initial.id); notify('Block deleted', 'success'); onSaved(); }
    catch (err) { notify(err.message, 'error'); }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-clock" /> {editing ? 'Edit time block' : 'New time block'}</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <div className="field">
          <i className="fas fa-tag field-icon" />
          <input className="field-input" placeholder="What is it? (e.g. Algebra)" value={title}
            onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>

        <div className="field">
          <i className="fas fa-note-sticky field-icon" />
          <input className="field-input" placeholder="Note or meeting link (optional)" value={sub}
            onChange={(e) => setSub(e.target.value)} inputMode="text" />
        </div>

        <div className="field">
          <i className="fas fa-layer-group field-icon" />
          <input className="field-input" list="sched-groups" placeholder="Group — e.g. My class, Liza's sched (optional)"
            value={group} onChange={(e) => setGroup(e.target.value)} />
          <datalist id="sched-groups">
            {groups.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>

        <div className="sched-day-seg">
          {DAYS.map(([v, l]) => (
            <button key={v} type="button" className={day === v ? 'active' : ''} onClick={() => setDay(v)}>{l}</button>
          ))}
        </div>

        <div className="sched-time-row">
          <label>Start<input type="time" className="field-input" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label>End<input type="time" className="field-input" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>

        <div className="settings-row" style={{ cursor: 'default' }}>
          <span><i className="fas fa-bell" /> Weekly reminder + sound</span>
          <label className="switch">
            <input type="checkbox" checked={doNotify} onChange={(e) => setDoNotify(e.target.checked)} />
            <span className="slider" />
          </label>
        </div>
        <div className="settings-row" style={{ cursor: 'default' }}>
          <span><i className="fas fa-clock" style={{ color: 'var(--danger)' }} /> Alarm — wake me for class</span>
          <label className="switch">
            <input type="checkbox" checked={doAlarm} onChange={(e) => setDoAlarm(e.target.checked)} />
            <span className="slider" />
          </label>
        </div>
        {doAlarm && (
          <div className="sched-ringtone">
            <span><i className="fas fa-music" /> Alarm sound</span>
            <select className="mini-select" value={ringtone} onChange={(e) => setRingtone(e.target.value)}>
              {ringtones.map((r) => <option key={r.uri || 'default'} value={r.uri}>{r.title}</option>)}
            </select>
          </div>
        )}
        <p className="settings-hint-text" style={{ padding: '0 2px 6px' }}>
          Repeats every week on {DAYS.find(([v]) => v === day)?.[1]} at the start time, and fires even when the app is closed. <b>Alarm</b> is louder and stays until you dismiss it. You may be asked to allow notifications.
        </p>

        <button className="btn btn-primary btn-block" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add block'}
        </button>
        {editing && (
          <button className="settings-row danger" onClick={del}>
            <span><i className="fas fa-trash" /> Delete block</span>
            <i className="fas fa-chevron-right" />
          </button>
        )}
      </div>
    </div>
  );
}
