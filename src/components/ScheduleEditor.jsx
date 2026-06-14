// ============================================================
//  Schedule block editor (native): pick a day + start/end time,
//  name it, and toggle the weekly reminder. Saving (re)schedules
//  the notification; deleting cancels it.
// ============================================================
import { useState, useEffect } from 'react';
import { createSchedule, updateSchedule, deleteSchedule, listGroups } from '../lib/scheduleStore.js';
import { getRingtones, reliabilityStatus, isKeepAlive } from '../lib/alarm.js';
import { isNative } from '../lib/nativeAuth.js';
import { notify } from '../lib/notify.js';
import UnsavedChangesModal from './UnsavedChangesModal.jsx';

const DAYS = [
  ['monday', 'Mon'], ['tuesday', 'Tue'], ['wednesday', 'Wed'], ['thursday', 'Thu'],
  ['friday', 'Fri'], ['saturday', 'Sat'], ['sunday', 'Sun'],
];
const JS_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const todayName = () => JS_DAY[new Date().getDay()];

// When the block will next fire (same roll-forward rule as the native side).
function nextFire(day, start) {
  const [h, m] = String(start || '0:0').split(':').map((n) => parseInt(n, 10) || 0);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  let diff = (JS_DAY.indexOf(day) - now.getDay() + 7) % 7;
  if (diff === 0 && target <= now) diff = 7;
  target.setDate(target.getDate() + diff);
  return target;
}

// "in 9 min" / "in 3 h" / "in 6 days" — makes a wrong day instantly obvious.
function inWords(target) {
  const min = Math.max(1, Math.round((target - Date.now()) / 60000));
  if (min < 60) return `in ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `in ${hr} h`;
  return `in ${Math.round(hr / 24)} day${hr >= 48 ? 's' : ''}`;
}

export default function ScheduleEditor({ initial, onClose, onSaved }) {
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title || '');
  const [sub, setSub] = useState(initial?.sub || '');
  const [group, setGroup] = useState(initial?.group || '');
  const [groups, setGroups] = useState([]);
  const [day, setDay] = useState(initial?.day || todayName()); // default TODAY (not Monday)
  const [start, setStart] = useState(initial?.start || '09:00');
  const [end, setEnd] = useState(initial?.end || '10:00');
  const [doNotify, setDoNotify] = useState(initial?.notify !== false);
  const [doAlarm, setDoAlarm] = useState(initial?.alarm === true);
  const [ringtone, setRingtone] = useState(initial?.ringtone || '');
  const [ringtones, setRingtones] = useState([{ title: 'Default alarm', uri: '' }]);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Dirty = any field differs from what we opened with.
  const initialSnap = JSON.stringify({
    title: initial?.title || '', sub: initial?.sub || '', group: initial?.group || '',
    day: initial?.day || todayName(), start: initial?.start || '09:00', end: initial?.end || '10:00',
    notify: initial?.notify !== false, alarm: initial?.alarm === true, ringtone: initial?.ringtone || '',
  });
  const dirty = JSON.stringify({ title, sub, group, day, start, end, notify: doNotify, alarm: doAlarm, ringtone }) !== initialSnap;
  function requestClose() { if (dirty) setConfirmLeave(true); else onClose(); }
  function confirmSave() { setConfirmLeave(false); save(); }

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
      if (doAlarm || doNotify) {
        const t = nextFire(day, start);
        notify(`${doAlarm ? 'Alarm' : 'Reminder'} set — rings ${t.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })} (${inWords(t)})`, 'success');
      } else {
        notify('Saved', 'success');
      }
      // If the phone can still freeze us in the background, warn right away —
      // an unprotected alarm is exactly the "didn't ring until I opened the
      // app" failure. (Best-effort: never blocks the save.)
      if (doAlarm) {
        try {
          const [s, k] = await Promise.all([reliabilityStatus(), isKeepAlive()]);
          if (!k && !s.battery) {
            notify('⚠ Your phone may freeze closed apps. Turn on “Keep alarms running” via the red banner in Schedule.', 'error');
          }
        } catch { /* non-critical */ }
      }
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
    <>
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-clock" /> {editing ? 'Edit time block' : 'New time block'}</h3>
          <button className="icon-btn" aria-label="Close" onClick={requestClose}><i className="fas fa-times" /></button>
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

        {/* Reminders & alarms are native-only (they fire when the app is closed).
            On the web the schedule is a pure timetable — no alarm, per request. */}
        {isNative ? (
          <>
            {(doNotify || doAlarm) && (() => {
              const t = nextFire(day, start);
              const soon = (t - Date.now()) < 24 * 3600 * 1000;
              return (
                <div className={`sched-next${soon ? '' : ' far'}`}>
                  <i className={`fas ${soon ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />
                  Next ring: <b>{t.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</b> · {inWords(t)}
                  {!soon && ' — check the day if you expected it sooner!'}
                </div>
              );
            })()}

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
          </>
        ) : (
          <p className="settings-hint-text" style={{ padding: '4px 2px 8px' }}>
            <i className="fas fa-circle-info" /> Saved to your weekly timetable and synced to your account. Alarms &amp; reminders are available in the mobile app.
          </p>
        )}

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
    {confirmLeave && (
      <UnsavedChangesModal
        saving={busy}
        onSave={confirmSave}
        onDiscard={onClose}
        onCancel={() => setConfirmLeave(false)}
      />
    )}
    </>
  );
}
