// ============================================================
//  View tab: a unified, read-only browser of every document and plan.
//  Tapping an item opens its permanent view (/view?type=&id=) — a link
//  that never expires and that you can jump straight to, instead of
//  digging through Docs or Plans first.
// ============================================================
import { useState } from 'react';
import { contentToHtml, escapeHtml } from '../lib/richtext';

const JS_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABEL = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' };
const todayName = () => JS_DAY[new Date().getDay()];

function NoteRow({ note, onOpen }) {
  const preview = contentToHtml(note.content) || '<span class="note-preview-empty">Empty document</span>';
  return (
    <div className={`note-card view-card${note.hidden ? ' content-hidden' : ''}`} onClick={() => onOpen('note', note)}>
      <div className="note-card-top">
        <div className="note-card-title">
          <span dangerouslySetInnerHTML={{ __html: escapeHtml(note.title || 'Untitled') }} />
        </div>
        <span className="view-go"><i className="fas fa-eye" /></span>
      </div>
      {note.hidden ? (
        <div className="note-hidden-hint"><i className="fas fa-eye-slash" /> Hidden — tap to view</div>
      ) : (
        <div className="note-preview doc-content" dangerouslySetInnerHTML={{ __html: preview }} />
      )}
    </div>
  );
}

function PlanRow({ plan, onOpen }) {
  const t = todayName();
  const items = (plan.days && plan.days[t]) || [];
  const done = items.filter((i) => i.checked).length;
  return (
    <div className={`note-card view-card${plan.hidden ? ' content-hidden' : ''}`} onClick={() => onOpen('plan', plan)}>
      <div className="note-card-top">
        <div className="note-card-title">
          {plan.title || 'Plan'}
          <span className="today-badge"><i className="fas fa-calendar-day" /> {DAY_LABEL[t]}{items.length ? ` · ${done}/${items.length}` : ''}</span>
        </div>
        <span className="view-go"><i className="fas fa-eye" /></span>
      </div>
    </div>
  );
}

export default function ViewTab({ notes, plans, onOpen }) {
  const [q, setQ] = useState('');
  const query = q.toLowerCase().trim();
  const fNotes = !query ? notes : notes.filter((n) => `${n.title} ${n.content}`.toLowerCase().includes(query));
  const fPlans = !query ? plans : plans.filter((p) => (p.title || '').toLowerCase().includes(query));
  const empty = notes.length === 0 && plans.length === 0;

  return (
    <section className="screen">
      <div className="search-bar">
        <i className="fas fa-search" />
        <input type="text" placeholder="Search anything to view…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {empty ? (
        <div className="empty-state">
          <i className="fas fa-eye" />
          <p>Nothing to view yet. Create a document or plan, then open it here read-only — its link never expires.</p>
        </div>
      ) : (
        <div className="list">
          {fNotes.length > 0 && <div className="view-section-label"><i className="fas fa-book-open" /> Documents</div>}
          {fNotes.map((n) => <NoteRow key={n.id} note={n} onOpen={onOpen} />)}
          {fPlans.length > 0 && <div className="view-section-label"><i className="fas fa-calendar-week" /> Plans</div>}
          {fPlans.map((p) => <PlanRow key={p.id} plan={p} onOpen={onOpen} />)}
          {!empty && fNotes.length === 0 && fPlans.length === 0 && (
            <div className="empty-state"><i className="fas fa-search" /><p>No matches for “{q}”.</p></div>
          )}
        </div>
      )}
    </section>
  );
}
