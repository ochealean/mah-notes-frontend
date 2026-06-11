// ============================================================
//  Schedule store (native only) — weekly time blocks kept in the
//  device's IndexedDB. Each block can fire a gentle weekly REMINDER
//  (notification) and/or a loud ringing ALARM (native). This module
//  keeps the store, the reminders, and the alarms all in step.
//
//  A block: { id, day, start "HH:MM", end "HH:MM", title, sub, group,
//             notify, alarm, ringtone }
//    sub   — free note or a meeting link (e.g. "bring your notebook" / a URL)
//    group — optional label to organise blocks (e.g. "My class", "Liza's sched")
// ============================================================
import { localdb } from './localdb.js';
import { newUid } from './uid.js';
import { ensurePermission } from './notifications.js';
import {
  scheduleAlarm, cancelAlarm, scheduleReminder, cancelReminder, requestBatteryUnrestricted,
} from './alarm.js';

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

// Distinct, non-empty group names currently in use (for the editor's picker).
export async function listGroups() {
  const all = await localdb.all('schedules');
  return [...new Set(all.map((s) => (s.group || '').trim()).filter(Boolean))].sort();
}

function clean(data, base = {}) {
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

// Keep both the gentle reminder and the loud alarm in step with the block.
// Both run on the native exact-alarm path so they fire on time even when the
// app is closed.
async function applyTriggers(item) {
  await cancelReminder(item);                     // clear old reminder
  await cancelAlarm(item.id);                     // clear old alarm
  if (item.notify || item.alarm) {
    await ensurePermission();                     // POST_NOTIFICATIONS (Android 13+)
    requestBatteryUnrestricted();                 // best-effort, fire-and-forget
  }
  if (item.notify) await scheduleReminder(item);  // re-arm exact reminder
  if (item.alarm) await scheduleAlarm(item);      // re-arm ringing alarm
}

export async function createSchedule(data) {
  const uid = newUid();
  const item = { ...clean(data, { id: uid }), createdAt: now(), updatedAt: now() };
  await localdb.put('schedules', item);
  await applyTriggers(item);
  return item;
}

export async function updateSchedule(id, patch) {
  const cur = await localdb.get('schedules', id);
  if (!cur) return null;
  const item = { ...clean(patch, cur), createdAt: cur.createdAt, updatedAt: now() };
  await localdb.put('schedules', item);
  await applyTriggers(item);
  return item;
}

export async function deleteSchedule(id) {
  const cur = await localdb.get('schedules', id);
  await localdb.remove('schedules', id);
  if (cur) { await cancelReminder(cur); await cancelAlarm(cur.id); }
  return { ok: true };
}
