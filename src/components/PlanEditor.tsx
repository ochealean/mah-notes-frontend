// ============================================================
//  Plan editor sheet: pick a day, list its items one per line.
//  Days are sent as { monday: ["item", ...] }; the server preserves
//  existing ticks where the text is unchanged.
// ============================================================
import { useRef, useState } from 'react';
import { repo } from '../lib/repo';
import { notify } from '../lib/notify';
import UnsavedChangesModal from './UnsavedChangesModal';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const DAY_LABEL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const JS_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function initialDayData(plan) {
  const data = {};
  DAY_ORDER.forEach((day) => {
    const items = (plan?.days?.[day]) || [];
    data[day] = items.map((it) => it.text);
  });
  return data;
}

export default function PlanEditor({ initial, onClose, onSaved }) {
  const startDay = JS_DAY[new Date().getDay()];
  const [title, setTitle] = useState(initial?.title || '');
  const dayDataRef = useRef(initialDayData(initial));
  const [activeDay, setActiveDay] = useState(DAY_ORDER.includes(startDay) ? startDay : 'monday');
  const [text, setText] = useState((dayDataRef.current[activeDay] || []).join('\n'));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // bump to re-render tab dots after edits
  const [, force] = useState(0);

  // Leaving with unsaved edits → ask first (Save / Don't save / Cancel).
  function requestClose() { if (dirty) setConfirmLeave(true); else onClose(); }
  function confirmSave() { setConfirmLeave(false); save(); }

  function persistCurrent() {
    dayDataRef.current[activeDay] = text.split('\n').map((s) => s.trim()).filter(Boolean);
  }

  function switchDay(day) {
    persistCurrent();
    setActiveDay(day);
    setText((dayDataRef.current[day] || []).join('\n'));
    force((n) => n + 1);
  }

  async function save() {
    persistCurrent();
    const days = {};
    DAY_ORDER.forEach((day) => {
      const lines = (dayDataRef.current[day] || []).map((s) => s.trim()).filter(Boolean);
      if (lines.length) days[day] = lines;
    });
    if (Object.keys(days).length === 0) { notify('Add items to at least one day', 'error'); return; }

    setSaving(true);
    try {
      if (initial?.id) {
        await repo.updatePlan(initial.id, { title: (title || '').trim() || 'Workout Plan', days });
        notify('Plan updated', 'success');
      } else {
        await repo.createPlan({ title: (title || '').trim() || 'Workout Plan', days });
        notify('Plan saved', 'success');
      }
      onSaved();
    } catch (err) {
      notify(err.message, 'error');
      setSaving(false);
    }
  }

  const hasItems = (day) => (day === activeDay
    ? text.split('\n').some((s) => s.trim())
    : (dayDataRef.current[day] || []).some((s) => s.trim()));

  return (
    <>
    <div className="sheet">
      <div className="sheet-bar">
        <button className="icon-btn" aria-label="Close" onClick={requestClose}><i className="fas fa-arrow-left" /></button>
        <input type="text" className="sheet-title-input" placeholder="e.g. Workout Plan"
          value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
        <button className="icon-btn save-icon" aria-label="Save" disabled={saving} onClick={save}><i className="fas fa-check" /></button>
      </div>

      <div className="sheet-scroll">
        <p className="hint"><i className="fas fa-circle-info" /> Pick a day, list its items (one per line). Each day shows its own checklist and clears daily.</p>

        <div className="day-tabs">
          {DAY_ORDER.map((day) => (
            <button key={day} type="button"
              className={`day-tab${day === activeDay ? ' active' : ''}${hasItems(day) ? ' has-items' : ''}`}
              onClick={() => switchDay(day)}>
              {DAY_SHORT[day]}
            </button>
          ))}
        </div>

        <label className="day-label">{DAY_LABEL[activeDay]}</label>
        <textarea className="day-textarea" rows={8} value={text} onChange={(e) => { setText(e.target.value); setDirty(true); }}
          placeholder={'One item per line, e.g.\nBench press — 3×10\nSquats — 3×8\nPlank — 60s'} />
      </div>
    </div>
    {confirmLeave && (
      <UnsavedChangesModal
        saving={saving}
        onSave={confirmSave}
        onDiscard={onClose}
        onCancel={() => setConfirmLeave(false)}
      />
    )}
    </>
  );
}
