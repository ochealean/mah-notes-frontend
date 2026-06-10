// ============================================================
//  Schedule tab (native): weekly time blocks grouped by day.
//  Tapping a block opens the editor. Blocks with the bell on fire
//  a weekly notification + sound at their start time.
// ============================================================
import { useMemo } from 'react';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABEL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const JS_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const todayName = () => JS_DAY[new Date().getDay()];

function fmt(t) {
  const [h, m] = String(t || '').split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return t;
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m || 0).padStart(2, '0')} ${ap}`;
}

export default function ScheduleTab({ schedules, onEdit }) {
  const today = todayName();
  const byDay = useMemo(() => {
    const m = {};
    DAY_ORDER.forEach((d) => { m[d] = []; });
    schedules.forEach((s) => { (m[s.day] || (m[s.day] = [])).push(s); });
    return m;
  }, [schedules]);

  if (!schedules.length) {
    return (
      <section className="screen">
        <div className="empty-state">
          <i className="fas fa-clock" />
          <p>No time blocks yet. Tap <b>+</b> to add one — e.g. <b>Mon 9–11am · Algebra</b>. Turn the reminder on to get a weekly notification with sound.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen">
      <div className="list">
        {DAY_ORDER.filter((d) => byDay[d].length).map((d) => (
          <div key={d} className="sched-day">
            <div className="view-section-label">{DAY_LABEL[d]}{d === today ? ' · TODAY' : ''}</div>
            {byDay[d].map((b) => (
              <button key={b.id} className="sched-block" onClick={() => onEdit(b)}>
                <div className="sched-time">{fmt(b.start)}<span>{fmt(b.end)}</span></div>
                <div className="sched-title">{b.title}</div>
                <i className={`fas fa-bell sched-bell${b.notify ? ' on' : ' off'}`} title={b.notify ? 'Reminder on' : 'Reminder off'} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
