// ============================================================
//  Client side for the two AI features:
//    scanPlanInput()  → photo and/or text → weekly plan { days }
//    tidyNoteText()   → messy pasted text → clean note { title, html }
//  Plus plainTextToHtml() for the non-AI "import as-is" path.
//  All need an account + internet; the API key lives on the server.
// ============================================================
import { api } from './api';
import { toPayload } from './scanSchedule';
import { escapeHtml } from './richtext';

// Build a weekly plan from a photo and/or text. Returns { monday: [strings], … }.
export async function scanPlanInput({ file, text }: { file?: File | null; text?: string }) {
  if (!navigator.onLine) throw new Error('AI needs an internet connection.');
  const body: any = {};
  if (file) { const { data, mediaType } = await toPayload(file); body.image = data; body.mediaType = mediaType; }
  if (text && text.trim()) body.text = text.trim();
  if (!body.image && !body.text) throw new Error('Add a photo or some text first.');
  const res = await api.post('/api/scan-plan', body);
  return res.days || {};
}

// Clean pasted text into a structured note. Returns { title, html }.
export async function tidyNoteText(text: string) {
  if (!navigator.onLine) throw new Error('AI needs an internet connection.');
  const res = await api.post('/api/tidy-note', { text: String(text || '') });
  return { title: res.title || '', html: res.html || '' };
}

// Non-AI "import as-is": plain text → simple HTML. Lines that look like a
// to-do ("- [ ] task", "[x] task", "* task") become checklist items.
export function plainTextToHtml(text: string) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  return lines.map((line) => {
    const m = line.match(/^\s*(?:[-*•]\s*)?\[(\s|x|X)\]\s*(.*)$/);
    if (m) {
      const checked = m[1].toLowerCase() === 'x';
      return `<div class="doc-check-item" data-checked="${checked ? 'true' : 'false'}">${escapeHtml(m[2]) || '<br>'}</div>`;
    }
    return `<div>${escapeHtml(line) || '<br>'}</div>`;
  }).join('');
}

// First non-empty line, trimmed, as a fallback note title.
export function firstLineTitle(text: string, fallback = 'Imported note') {
  const line = String(text || '').split('\n').map((l) => l.trim()).find(Boolean);
  return (line || fallback).slice(0, 80);
}
