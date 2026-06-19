// ============================================================
//  Client-side recurring reset for OFFLINE (native) items.
//  Mirrors the backend src/utils/schedule.js so a synced item lands
//  on the same lastResetPeriod/lastResetDate on both sides.
// ============================================================

export function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function currentPeriod(freq) {
  const d = new Date();
  if (freq === 'daily') return dateStr(d);
  if (freq === 'monthly') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return 'W' + dateStr(monday);
}

// Uncheck every checklist box in a note's HTML content.
function uncheckNoteHtml(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html || '';
  holder.querySelectorAll('.doc-check-item[data-checked="true"]')
    .forEach((it) => it.setAttribute('data-checked', 'false'));
  return holder.innerHTML;
}

// Returns a NEW note object if a reset was due, else the same reference.
export function applyNoteResetLocal(note) {
  if (!note.schedule) return note;
  const period = currentPeriod(note.schedule);
  if (note.lastResetPeriod === period) return note;
  return {
    ...note,
    content: uncheckNoteHtml(note.content || ''),
    lastResetPeriod: period,
    // local reset is a passive normalization — don't bump updatedAt, or it would
    // look like a fresh edit and overwrite a newer server copy on sync.
  };
}

// Returns a NEW plan object if today's reset was due, else the same reference.
export function applyPlanResetLocal(plan) {
  const today = dateStr();
  if (plan.lastResetDate === today) return plan;
  const days = {};
  for (const [day, items] of Object.entries<any>(plan.days || {})) {
    days[day] = (items || []).map((it) => ({ text: it.text, checked: false }));
  }
  return { ...plan, days, lastResetDate: today };
}
