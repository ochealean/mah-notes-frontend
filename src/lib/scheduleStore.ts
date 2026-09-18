// ============================================================
//  Schedule store — weekly time blocks, now synced across the
//  user's web + app just like notes and plans.
//
//   • Web   → talks to the backend REST API (/api/schedules).
//   • Native → reads/writes the device's IndexedDB and mirrors changes
//              through the sync engine when an account is connected. The
//              app ALSO arms native reminders/alarms on top; the web is a
//              plain timetable (no alarms).
//
//  A block: { id, day, start "HH:MM", end "HH:MM", title, sub, group,
//             notify, alarm, ringtone }
//    sub   — free note or a meeting link (e.g. "bring your notebook" / a URL)
//    group — optional label to organise blocks (e.g. "My class", "Liza's sched")
// ============================================================
import { localdb } from './localdb';
import { api } from './api';
import { newUid } from './uid';
import { isNative } from './nativeAuth';
import { hasLocalStore } from './platform';
import { requestSync, markDeleted, markLocalOrigin } from './sync';
import { ensurePermission } from './notifications';
import {
  scheduleAlarm, cancelAlarm, scheduleReminder, cancelReminder, requestBatteryUnrestricted,
} from './alarm';

const now = () => new Date().toISOString();
const DAY_INDEX = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
const toMin = (t) => {
  const [h, m] = String(t || '0:0').split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};

// Day order, then start time.
const order = (a, b) => (DAY_INDEX[a.day] - DAY_INDEX[b.day]) || (toMin(a.start) - toMin(b.start));
const groupsOf = (rows) => [...new Set(rows.map((s) => (s.group || '').trim()).filter(Boolean))].sort();

function clean(data, base: any = {}) {
  const next = { ...base, ...data };
  return {
    id: base.id,
    day: next.day || 'monday',
    start: next.start || '09:00',
    end: next.end || '10:00',
    title: (next.title || '').trim() || 'Untitled block',
    sub: (next.sub || '').trim(),
    group: (next.group || '').trim(),
    notify: next.notify !== false,
    alarm: !!next.alarm,
    ringtone: next.ringtone || '',
  };
}

// Editable fields only (no id) — what we send to the REST API.
const payload = (data, base?: any) => { const { id, ...rest } = clean(data, base); return rest; };

// ── Native triggers (reminders + alarms). Native only. ──
async function applyTriggers(item) {
  if (!isNative) return;
  await cancelReminder(item);                     // clear old reminder
  await cancelAlarm(item.id);                     // clear old alarm
  if (item.notify || item.alarm) {
    await ensurePermission();                     // POST_NOTIFICATIONS (Android 13+)
    requestBatteryUnrestricted();                 // best-effort, fire-and-forget
  }
  if (item.notify) await scheduleReminder(item);  // re-arm exact reminder
  if (item.alarm) await scheduleAlarm(item);      // re-arm ringing alarm
}

// ── Native (device IndexedDB + sync mirror) ──
const local = {
  async listSchedules() {
    const all = await localdb.all('schedules');
    // Backfill a stable uid on blocks created before schedules were syncable,
    // so the sync engine can merge them.
    for (const s of all) { if (!s.uid) { s.uid = s.id; await localdb.put('schedules', s); } }
    return all.sort(order);
  },
  async listGroups() {
    return groupsOf(await localdb.all('schedules'));
  },
  async createSchedule(data) {
    const uid = newUid();
    const item = { ...clean(data, { id: uid }), uid, createdAt: now(), updatedAt: now() };
    await localdb.put('schedules', item);
    await applyTriggers(item);
    await markLocalOrigin('schedules', uid);
    requestSync();
    return item;
  },
  async updateSchedule(id, patch) {
    const cur = await localdb.get('schedules', id);
    if (!cur) return null;
    const item = { ...clean(patch, cur), uid: cur.uid || cur.id, createdAt: cur.createdAt, updatedAt: now() };
    await localdb.put('schedules', item);
    await applyTriggers(item);
    requestSync();
    return item;
  },
  async deleteSchedule(id) {
    const cur = await localdb.get('schedules', id);
    await localdb.remove('schedules', id);
    if (cur) { await cancelReminder(cur); await cancelAlarm(cur.id); }
    await markDeleted('schedules', id); // id === uid on the device
    requestSync();
    return { ok: true };
  },
  // Local writes cost nothing, and the sync engine already sends every change
  // in one debounced request — so a batch here is just a loop.
  async createSchedules(list) {
    const out = [];
    for (const data of list) out.push(await local.createSchedule(data)); // eslint-disable-line no-await-in-loop
    return out;
  },
  async deleteSchedules(ids) {
    for (const id of ids) await local.deleteSchedule(id); // eslint-disable-line no-await-in-loop
    return { ok: true, deleted: ids.length };
  },
};

// Matches the server's cap on one bulk request.
const BULK_MAX = 200;
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

// ── Web (REST; the server sorts by day then start) ──
const web = {
  listSchedules: () => api.get('/api/schedules'),
  listGroups: async () => groupsOf(await api.get('/api/schedules')),
  createSchedule: (data) => api.post('/api/schedules', payload(data)),
  updateSchedule: (id, patch) => api.put(`/api/schedules/${id}`, payload(patch)),
  deleteSchedule: (id) => api.del(`/api/schedules/${id}`),
  // A scanned timetable is dozens of blocks. One request per block spent the
  // whole write rate limit on a single scan (429 partway through), so the
  // batch goes up as ONE request. An older server without the bulk route
  // answers 404, and then it falls back to one at a time.
  async createSchedules(list) {
    const out = [];
    try {
      for (const part of chunks(list, BULK_MAX)) {
        // eslint-disable-next-line no-await-in-loop
        out.push(...await api.post('/api/schedules/bulk', { blocks: part.map((d) => payload(d)) }));
      }
      return out;
    } catch (err) {
      if (err?.status !== 404 || out.length) throw err;
    }
    for (const d of list) out.push(await web.createSchedule(d)); // eslint-disable-line no-await-in-loop
    return out;
  },
  async deleteSchedules(ids) {
    let deleted = 0;
    try {
      for (const part of chunks(ids, BULK_MAX)) {
        // eslint-disable-next-line no-await-in-loop
        const res = await api.post('/api/schedules/bulk-delete', { ids: part });
        deleted += res?.deleted || 0;
      }
      return { ok: true, deleted };
    } catch (err) {
      if (err?.status !== 404 || deleted) throw err;
    }
    for (const id of ids) await web.deleteSchedule(id); // eslint-disable-line no-await-in-loop
    return { ok: true, deleted: ids.length };
  },
};

// Offline store on Android and desktop; REST on the web. Reminders and
// alarms inside `local` are still gated on `isNative` (see applyTriggers) —
// desktop keeps the timetable without the Android alarm machinery.
const store: any = hasLocalStore ? local : web;

export const listSchedules = (...a) => store.listSchedules(...a);
export const listGroups = (...a) => store.listGroups(...a);
export const createSchedule = (...a) => store.createSchedule(...a);
export const updateSchedule = (...a) => store.updateSchedule(...a);
export const deleteSchedule = (...a) => store.deleteSchedule(...a);
/** Many blocks in one go — a scanned timetable. */
export const createSchedules = (list) => store.createSchedules(list);
/** Many blocks in one go — delete all, or delete a group. */
export const deleteSchedules = (ids) => store.deleteSchedules(ids);
