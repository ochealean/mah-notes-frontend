// ============================================================
//  Data repository — the one place that knows WHERE data lives.
//
//   • Web   → talks to the backend REST API (unchanged behaviour).
//   • Native → reads/writes the local IndexedDB store and asks the sync
//              engine to mirror changes when an account is connected.
//
//  Components call repo.* and never branch on platform themselves.
// ============================================================
import { isNative } from './nativeAuth.js';
import { api } from './api.js';
import { localdb } from './localdb.js';
import { newUid } from './uid.js';
import { requestSync, markDeleted, markLocalOrigin } from './sync.js';
import { applyNoteResetLocal, applyPlanResetLocal, currentPeriod, dateStr } from './localReset.js';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const VALID_SCHEDULES = ['daily', 'weekly', 'monthly'];
const now = () => new Date().toISOString();
const bySortDesc = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt);

// Normalize editor day input → { day: [{text, checked}] }, preserving prior ticks.
function normalizeDays(incoming = {}, existing = {}) {
  const out = {};
  for (const day of DAY_ORDER) {
    const raw = incoming[day];
    if (!Array.isArray(raw)) continue;
    const prev = existing[day] || [];
    const items = raw
      .map((entry) => {
        if (typeof entry === 'string') {
          const text = entry.trim();
          if (!text) return null;
          return { text, checked: prev.some((o) => o.text === text && o.checked) };
        }
        const text = String(entry?.text || '').trim();
        return text ? { text, checked: !!entry.checked } : null;
      })
      .filter(Boolean);
    if (items.length) out[day] = items;
  }
  return out;
}

// ── Local (native) implementations ──
const local = {
  async listNotes() {
    const notes = await localdb.all('notes');
    const out = [];
    for (const n of notes) {
      const reset = applyNoteResetLocal(n);
      if (reset !== n) await localdb.put('notes', reset);
      out.push(reset);
    }
    return out.sort(bySortDesc);
  },

  async createNote(data) {
    const schedule = VALID_SCHEDULES.includes(data.schedule) ? data.schedule : null;
    const uid = newUid();
    const item = {
      id: uid, uid,
      title: (data.title || '').trim() || 'Untitled',
      content: data.content || '',
      schedule,
      lastResetPeriod: schedule ? currentPeriod(schedule) : null,
      hidden: false,
      pinned: false,
      createdAt: now(), updatedAt: now(),
    };
    await localdb.put('notes', item);
    await markLocalOrigin('notes', uid);
    requestSync();
    return item;
  },

  async updateNote(id, patch) {
    const note = await localdb.get('notes', id);
    if (!note) return null;
    const next = { ...note };
    if (patch.title !== undefined) next.title = (patch.title || '').trim() || 'Untitled';
    if (patch.content !== undefined) next.content = patch.content || '';
    if (patch.hidden !== undefined) next.hidden = !!patch.hidden;
    if (patch.pinned !== undefined) next.pinned = !!patch.pinned;
    if (patch.schedule !== undefined) {
      const schedule = VALID_SCHEDULES.includes(patch.schedule) ? patch.schedule : null;
      if (schedule) {
        next.lastResetPeriod = note.schedule === schedule && note.lastResetPeriod
          ? note.lastResetPeriod : currentPeriod(schedule);
        next.schedule = schedule;
      } else { next.schedule = null; next.lastResetPeriod = null; }
    }
    next.updatedAt = now();
    await localdb.put('notes', next);
    requestSync();
    return next;
  },

  async deleteNote(id) {
    const note = await localdb.get('notes', id);
    await localdb.remove('notes', id);
    if (note?.uid) await markDeleted('notes', note.uid);
    requestSync();
    return { ok: true };
  },

  async listPlans() {
    const plans = await localdb.all('plans');
    const out = [];
    for (const p of plans) {
      const reset = applyPlanResetLocal(p);
      if (reset !== p) await localdb.put('plans', reset);
      out.push(reset);
    }
    return out.sort(bySortDesc);
  },

  async createPlan(data) {
    const days = normalizeDays(data.days);
    const uid = newUid();
    const item = {
      id: uid, uid,
      title: (data.title || '').trim() || 'Workout Plan',
      days, lastResetDate: dateStr(), hidden: false,
      createdAt: now(), updatedAt: now(),
    };
    await localdb.put('plans', item);
    await markLocalOrigin('plans', uid);
    requestSync();
    return item;
  },

  async updatePlan(id, patch) {
    const plan = await localdb.get('plans', id);
    if (!plan) return null;
    const next = { ...plan };
    if (patch.title !== undefined) next.title = (patch.title || '').trim() || 'Workout Plan';
    if (patch.hidden !== undefined) next.hidden = !!patch.hidden;
    if (patch.days !== undefined) next.days = normalizeDays(patch.days, plan.days);
    next.updatedAt = now();
    await localdb.put('plans', next);
    requestSync();
    return next;
  },

  async checkPlan(id, { day, index, checked }) {
    const plan = await localdb.get('plans', id);
    if (!plan) return { ok: false };
    const days = { ...plan.days };
    const items = (days[day] || []).map((it, i) => (i === index ? { ...it, checked: !!checked } : it));
    days[day] = items;
    const next = { ...plan, days, updatedAt: now() };
    await localdb.put('plans', next);
    requestSync();
    return { ok: true };
  },

  async deletePlan(id) {
    const plan = await localdb.get('plans', id);
    await localdb.remove('plans', id);
    if (plan?.uid) await markDeleted('plans', plan.uid);
    requestSync();
    return { ok: true };
  },
};

// ── Web implementations (unchanged REST behaviour) ──
const web = {
  listNotes: () => api.get('/api/notes'),
  createNote: (data) => api.post('/api/notes', data),
  updateNote: (id, patch) => api.put(`/api/notes/${id}`, patch),
  deleteNote: (id) => api.del(`/api/notes/${id}`),
  listPlans: () => api.get('/api/plans'),
  createPlan: (data) => api.post('/api/plans', data),
  updatePlan: (id, patch) => api.put(`/api/plans/${id}`, patch),
  checkPlan: (id, body) => api.patch(`/api/plans/${id}/check`, body),
  deletePlan: (id) => api.del(`/api/plans/${id}`),
};

export const repo = isNative ? local : web;
