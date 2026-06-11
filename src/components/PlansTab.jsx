// ============================================================
//  Weekly plans tab. Shows today's checklist (tickable) plus a
//  collapsible full-week grid.
// ============================================================
import { useNavigate } from 'react-router-dom';
import { repo } from '../lib/repo.js';
import { notify } from '../lib/notify.js';
import { timeAgo } from '../lib/timeAgo.js';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const DAY_LABEL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const JS_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const todayName = () => JS_DAY[new Date().getDay()];

function WeekGrid({ days, today }) {
  return (
    <div className="week-grid">
      {DAY_ORDER.map((day) => {
        const items = days[day] || [];
        const isToday = day === today;
        return (
          <div key={day} className={`week-day${isToday ? ' is-today' : ''}`}>
            <div className="week-day-name">{DAY_SHORT[day]}{isToday ? ' · TODAY' : ''}</div>
            {items.length ? (
              <ul>{items.map((it, i) => <li key={i} className={it.checked ? 'done' : ''}>{it.text}</li>)}</ul>
            ) : (
              <div className="week-rest">Rest</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlanCard({ plan, today, onEdit, onShare, onToggleHidden, onChanged, onToggleCheck }) {
  const navigate = useNavigate();
  const days = plan.days || {};
  const todayItems = days[today] || [];
  const total = todayItems.length;
  const done = todayItems.filter((i) => i.checked).length;
  const todayLabel = DAY_LABEL[today];

  return (
    <div className={`note-card${plan.hidden ? ' content-hidden' : ''}`}>
      <div className="note-card-top">
        <div className="note-card-title">
          {plan.title || 'Plan'}
          <span className="today-badge"><i className="fas fa-calendar-day" /> {todayLabel}{total ? ` · ${done}/${total}` : ''}</span>
        </div>
        <button className="icon-btn hide-toggle note-kebab" aria-label="Hide"
          onClick={(e) => { e.stopPropagation(); onToggleHidden(plan.id, !plan.hidden); }}>
          <i className={`fas ${plan.hidden ? 'fa-eye' : 'fa-eye-slash'}`} />
        </button>
      </div>

      <div className="plan-today">
        {total ? todayItems.map((it, i) => (
          <div key={i} className="doc-check-item" data-checked={it.checked ? 'true' : 'false'}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (e.clientX - rect.left > 32) return;
              onToggleCheck(plan.id, today, i, !it.checked);
            }}>
            {it.text}
          </div>
        )) : (
          <div className="plan-empty-today"><i className="fas fa-mug-hot" /> Nothing scheduled for {todayLabel} — rest day!</div>
        )}
      </div>

      <details className="plan-week"><summary>Full week</summary><WeekGrid days={days} today={today} /></details>

      {plan.updatedAt && (
        <div className="card-updated"><i className="fas fa-clock" /> Updated {timeAgo(plan.updatedAt)}</div>
      )}
      <div className="card-actions">
        <button className="act-btn edit" onClick={() => onEdit(plan)}><i className="fas fa-pen-to-square" /> Edit</button>
        {/* View reads local (works offline); Share needs an account + sync. */}
        <button className="act-btn view" onClick={() => navigate(`/view?type=plan&id=${encodeURIComponent(plan.id)}`)}><i className="fas fa-eye" /> View</button>
        <button className="act-btn share" onClick={() => onShare(plan.id)}><i className="fas fa-share-alt" /> Share</button>
        <button className="act-btn danger del" onClick={async () => {
          if (!confirm('Delete this plan? This cannot be undone.')) return;
          try { await repo.deletePlan(plan.id); notify('Plan deleted', 'success'); onChanged(); }
          catch (err) { notify(err.message, 'error'); }
        }}><i className="fas fa-trash" /> Delete</button>
      </div>
    </div>
  );
}

export default function PlansTab({ plans, onEdit, onShare, onToggleHidden, onChanged, setPlans }) {
  const today = todayName();

  async function onToggleCheck(planId, day, index, checked) {
    setPlans((arr) => arr.map((p) => {
      if (p.id !== planId) return p;
      const days = { ...p.days };
      const items = (days[day] || []).map((it, i) => (i === index ? { ...it, checked } : it));
      days[day] = items;
      return { ...p, days };
    }));
    try { await repo.checkPlan(planId, { day, index, checked }); }
    catch (err) { notify(err.message, 'error'); onChanged(); }
  }

  return (
    <section className="screen">
      <div className="list">
        {plans.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-dumbbell" />
            <p>No plans yet. Tap <b>+</b> to build a day-by-day routine (like a workout split). Each day shows its own checklist and resets daily.</p>
          </div>
        ) : (
          plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} today={today} onEdit={onEdit} onShare={onShare}
              onToggleHidden={onToggleHidden} onChanged={onChanged} onToggleCheck={onToggleCheck} />
          ))
        )}
      </div>
    </section>
  );
}
