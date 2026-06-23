// ============================================================
//  Home-screen widget data bridge (Android only).
//  We mirror a compact, pre-shaped snapshot of the user's notes / plans /
//  schedule into the native side (SharedPreferences) so the widget — which
//  runs in a separate process and can't read the WebView's IndexedDB — can
//  render it. The widget computes "today" itself for plans/schedule, so it
//  stays correct across day boundaries without the app being open.
// ============================================================
import { isNative } from './nativeAuth';
import { repo } from './repo';
import { listSchedules } from './scheduleStore';
import { contentToHtml } from './richtext';
import Widget from './widgetPlugin';

// Turn a note's stored content (HTML or plain text) into widget rows:
// checklist items carry checked:true/false; plain lines carry checked:null.
// `ck` is the checklist item's index among the note's check items (-1 for plain
// lines) — the widget sends it back so a toggle hits the right item on save.
function noteLines(content: string) {
  const holder = document.createElement('div');
  holder.innerHTML = contentToHtml(content || '');
  const out: Array<{ text: string; checked: boolean | null; ck: number }> = [];
  let checkIdx = 0;
  holder.childNodes.forEach((node: any) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList && el.classList.contains('doc-check-item')) {
        const idx = checkIdx++;
        const text = (el.textContent || '').trim();
        if (text) out.push({ text, checked: el.getAttribute('data-checked') === 'true', ck: idx });
        return;
      }
      if (el.tagName === 'UL' || el.tagName === 'OL') {
        el.querySelectorAll('li').forEach((li) => {
          const t = (li.textContent || '').trim();
          if (t) out.push({ text: t, checked: null, ck: -1 });
        });
        return;
      }
      const t = (el.textContent || '').trim();
      if (t) out.push({ text: t, checked: null, ck: -1 });
    } else if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.nodeValue || '').trim();
      if (t) out.push({ text: t, checked: null, ck: -1 });
    }
  });
  return out.slice(0, 60);
}

// Gather everything the widget needs and hand it to the native plugin.
// `pre` lets callers pass already-loaded lists (avoids a re-read); otherwise
// we fetch fresh (used on app resume).
export async function pushWidgetData(pre?: { notes?: any[]; plans?: any[]; schedules?: any[] }) {
  if (!isNative) return;
  try {
    const notes = pre?.notes || await repo.listNotes();
    const plans = pre?.plans || await repo.listPlans();
    const schedules = pre?.schedules || await listSchedules();
    const primary = (getComputedStyle(document.documentElement).getPropertyValue('--primary') || '#7C83FD').trim();

    const noteItems = notes
      .filter((n) => !n.hidden)
      .map((n) => ({ type: 'note', id: n.id, title: n.title || 'Untitled', lines: noteLines(n.content) }));
    const planItems = plans
      .filter((p) => !p.hidden)
      .map((p) => ({ type: 'plan', id: p.id, title: p.title || 'Plan', days: p.days || {} }));
    // Schedule: only the fields a widget shows — drop notify/alarm/ringtone.
    const blocks = (schedules || []).map((s) => ({
      day: s.day, start: s.start, end: s.end, title: s.title, sub: s.sub || '',
    }));

    // Flat index for the widget's configuration picker.
    const items = [
      ...noteItems.map((n) => ({ type: 'note', id: n.id, title: n.title })),
      ...planItems.map((p) => ({ type: 'plan', id: p.id, title: p.title })),
      { type: 'schedule', id: 'today', title: "Today's schedule" },
    ];

    const data = { primary, items, notes: noteItems, plans: planItems, schedule: blocks };
    await Widget.setData({ json: JSON.stringify(data) });
    return { notes: noteItems.length, plans: planItems.length, schedule: blocks.length };
  } catch { /* best-effort — never break the app over the widget */ }
  return { notes: 0, plans: 0, schedule: 0 };
}

// Apply any checkbox toggles the user made directly on a widget to the real
// note/plan, so they persist (and sync). Returns true if anything changed, so
// the caller can re-push a fresh snapshot. Best-effort: never throws.
export async function consumeWidgetToggles(): Promise<boolean> {
  if (!isNative) return false;
  let toggles: any[] = [];
  try {
    const r = await Widget.consumeToggles();
    toggles = Array.isArray(r?.toggles) ? r.toggles : [];
  } catch { return false; }
  if (!toggles.length) return false;

  let changed = false;
  let notesCache: any[] | null = null;
  for (const t of toggles) {
    try {
      if (t.type === 'plan') {
        await repo.checkPlan(t.id, { day: t.day, index: t.ck, checked: !!t.checked });
        changed = true;
      } else if (t.type === 'note') {
        if (!notesCache) notesCache = await repo.listNotes();
        const n = notesCache.find((x) => x.id === t.id);
        if (!n) continue;
        const div = document.createElement('div');
        div.innerHTML = n.content || '';
        // Match noteLines: only top-level checklist items, in order.
        const items = Array.from(div.children).filter(
          (c) => (c as HTMLElement).classList?.contains('doc-check-item'),
        );
        const el = items[t.ck] as HTMLElement | undefined;
        if (!el) continue;
        el.setAttribute('data-checked', t.checked ? 'true' : 'false');
        n.content = div.innerHTML; // keep cache in step if the same note is toggled twice
        await repo.updateNote(t.id, { content: div.innerHTML });
        changed = true;
      }
    } catch { /* skip a bad toggle, keep going */ }
  }
  return changed;
}

// What a tapped widget asked to open, consumed once. { type, id } | null.
export async function consumeWidgetOpen(): Promise<{ type: string; id: string } | null> {
  if (!isNative) return null;
  try {
    const r = await Widget.consumeOpenTarget();
    return r && r.type ? { type: r.type, id: r.id || '' } : null;
  } catch { return null; }
}
