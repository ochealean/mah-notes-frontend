// ============================================================
//  Schedule store (native only) — weekly time blocks kept in the
//  device's IndexedDB. Each block can fire a weekly notification;
//  this module keeps the store and the notifications in step.
//
//  A block: { id, day, start "HH:MM", end "HH:MM", title, notify, alarm }
// ============================================================
import { localdb } from './localdb.js';
import { newUid } from './uid.js';
import { scheduleBlock, cancelBlock } from './notifications.js';

const now = () => new Date().toISOString();
const DAY_INDEX = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };
const toMin = (t) => {
  const [h, m] = String(t || '0:0').split(':').map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};

// Day order, then start time.
const order = (a, b) => (DAY_INDEX[a.day] - DAY_INDEX[b.day]) || (toMin(a.start) - toMin(b.start));

export async function listSchedules() {
  const all = await localdb.all('schedules');
  return all.sort(order);
}

function clean(data, base = {}) {
  const next = { ...base, ...data };
  return {
    id: base.id,
    day: next.day || 'monday',
    start: next.start || '09:00',
    end: next.end || '10:00',
    title: (next.title || '').trim() || 'Untitled block',
    notify: next.notify !== false,
    alarm: !!next.alarm,
  };
}

export async function createSchedule(data) {
  const uid = newUid();
  const item = { ...clean(data, { id: uid }), createdAt: now(), updatedAt: now() };
  await localdb.put('schedules', item);
  await scheduleBlock(item);
  return item;
}

export async function updateSchedule(id, patch) {
  const cur = await localdb.get('schedules', id);
  if (!cur) return null;
  const item = { ...clean(patch, cur), createdAt: cur.createdAt, updatedAt: now() };
  await localdb.put('schedules', item);
  await cancelBlock(item);                 // clear any previous reminder
  if (item.notify) await scheduleBlock(item);
  return item;
}

export async function deleteSchedule(id) {
  const cur = await localdb.get('schedules', id);
  await localdb.remove('schedules', id);
  if (cur) await cancelBlock(cur);
  return { ok: true };
}
