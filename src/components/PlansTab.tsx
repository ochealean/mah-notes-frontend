// ============================================================
//  Weekly plans, v2.
//
//  Rail rows carry the title and a progress bar for today. The pane
//  gives today's checklist the whole screen, with the seven-day grid
//  underneath as one quiet strip.
//
//  "Hidden" is a LIST-only privacy state (see DocsTab): the pane always
//  shows the plan in full.
// ============================================================
import { repo } from '../lib/repo';
import { notify } from '../lib/notify';
import { timeAgo } from '../lib/timeAgo';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const DAY_LABEL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const JS_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const todayName = () => JS_DAY[new Date().getDay()];

function progressOf(plan, today) {
  const items = (plan.days && plan.days[today]) || [];
  const done = items.filter((i) => i.checked).length;
  return { items, done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}

// ── The list (rail) ──────────────────────────────────────
export default function PlansTab({ plans, selectedId, onSelect, searching, selecting, selected, onToggleSelect }) {
  const today = todayName();

  if (!plans.length) {
    return searching ? (
      <div className="empty-state">
        <i className="fas fa-search" />
        <p>No plans match your search.</p>
      </div>
    ) : (
      <div className="empty-state">
        <i className="fas fa-dumbbell" />
        <p>No plans yet. Tap <b>+</b> to build a day-by-day routine, like a workout split. Each day has its own checklist and resets daily.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rail-group kicker">Weekly plans</div>
      {plans.map((plan) => {
        const { done, total, pct } = progressOf(plan, today);
        const checked = !!selected?.has(plan.id);
        return (
          <button
            key={plan.id}
            className={`row${plan.id === selectedId && !selecting ? ' active' : ''}${checked ? ' checked' : ''}`}
            onClick={() => (selecting ? onToggleSelect(plan.id) : onSelect(plan))}
          >
            <div className="row-head">
              {selecting && (
                <span className={`row-check${checked ? ' on' : ''}`}><i className="fas fa-check" /></span>
              )}
              <span className="row-title">{plan.title || 'Plan'}</span>
            </div>
            <div className="row-meta">
              <span className="row-bar"><span style={{ width: `${pct}%` }} /></span>
              <span className="row-progress">{total ? `${done}/${total}` : 'Rest'}</span>
            </div>
            {plan.updatedAt && <div className="row-time">{timeAgo(plan.updatedAt)}</div>}
          </button>
        );
      })}
    </>
  );
}

// ── The pane ─────────────────────────────────────────────
export function PlanPane({ plan, onEdit, onToggleHidden, onShare, onDelete, onToggleCheck, onBack }) {
  const today = todayName();

  if (!plan) {
    return (
      <div className="pane-empty">
        <div className="kicker accent">Weekly plans</div>
        <h2>Nothing selected</h2>
        <p>Pick a plan on the left. Today&rsquo;s checklist gets the whole screen, with the rest of the week underneath.</p>
      </div>
    );
  }

  const days = plan.days || {};
  const { items, done, total, pct } = progressOf(plan, today);

  async function remove() {
    if (!confirm('Delete this plan? This cannot be undone.')) return;
    try { await repo.deletePlan(plan.id); notify('Plan deleted', 'success'); onDelete(); }
    catch (err) { notify(err.message, 'error'); }
  }

  return (
    <>
      <div className="detail-bar">
        <button className="icon-btn" aria-label="Back to plans" onClick={onBack}>
          <i className="fas fa-chevron-left" />
        </button>
        <span className="detail-status">
          <span className="pane-dot" />{total ? `${done}/${total} done` : 'Rest day'}
        </span>
        <button className="detail-action" onClick={() => onEdit(plan)}>Edit</button>
      </div>

      <div className="pane-scroll">
        <div className="pane-head">
          <span className="pane-tag">{DAY_LABEL[today]}</span>
          <span className="pane-status">
            <span className="pane-dot" />
            {total ? `${done}/${total} done` : 'Nothing scheduled'}
            {plan.updatedAt ? ` · updated ${timeAgo(plan.updatedAt)}` : ''} · resets daily
          </span>
          {plan.hidden && (
            <span className="pane-tag hidden-tag"><i className="fas fa-eye-slash" /> Hidden in list</span>
          )}
        </div>

        <h1 className="pane-title">{plan.title || 'Plan'}</h1>

        {/* Always readable here. Hiding only affects the list. */}
        {total > 0 && (
          <div className="plan-bar">
            <span className="plan-bar-track"><span className="plan-bar-fill" style={{ width: `${pct}%` }} /></span>
            <span className="plan-bar-label">{done}/{total}</span>
          </div>
        )}

        <div className="pane-prose">
          {total ? items.map((it, i) => (
            <div key={i} className="doc-check-item" data-checked={it.checked ? 'true' : 'false'}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                if (e.clientX - rect.left > 32) return;
                onToggleCheck(plan.id, today, i, !it.checked);
              }}>
              {it.text}
            </div>
          )) : (
            <div className="plan-empty-today">Nothing scheduled today — rest day.</div>
          )}
        </div>

        <div className="plan-week">
          <div className="kicker">Full week</div>
          <div className="week-grid">
            {DAY_ORDER.map((day) => {
              const list = days[day] || [];
              const isToday = day === today;
              return (
                <div key={day} className={`week-day${isToday ? ' is-today' : ''}`}>
                  <div className="week-day-name">{DAY_SHORT[day]}</div>
                  {list.length ? (
                    <ul>{list.map((it, i) => <li key={i} className={it.checked ? 'done' : ''}>{it.text}</li>)}</ul>
                  ) : (
                    <div className="week-rest">Rest</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="cluster">
          <button className="cluster-btn" aria-label="Edit" title="Edit" onClick={() => onEdit(plan)}>
            <i className="fas fa-pen" />
          </button>
          <button className={`cluster-btn${plan.hidden ? ' on' : ''}`} aria-label="Hide from list"
            title={plan.hidden ? 'Show in the list' : 'Hide from the list'}
            onClick={() => onToggleHidden(plan.id, !plan.hidden)}>
            <i className={`fas ${plan.hidden ? 'fa-eye' : 'fa-eye-slash'}`} />
          </button>
          <button className="cluster-btn" aria-label="Share" title="Share" onClick={() => onShare(plan.id)}>
            <i className="fas fa-share-nodes" />
          </button>
          <button className="cluster-btn danger" aria-label="Delete" title="Delete" onClick={remove}>
            <i className="fas fa-trash" />
          </button>
        </div>
      </div>
    </>
  );
}
