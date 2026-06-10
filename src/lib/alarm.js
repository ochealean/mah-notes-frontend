// ============================================================
//  Native ringing alarm (Android). Talks to the custom "Alarm"
//  plugin (com.mahnotes.app.AlarmPlugin) which uses AlarmManager's
//  alarm-clock API + a foreground service that plays a real ringtone
//  on the ALARM stream and shows a full-screen alarm over the lock
//  screen. No-ops on the web.
// ============================================================
import { Capacitor, registerPlugin } from '@capacitor/core';
import { notifId } from './notifications.js';

const Alarm = registerPlugin('Alarm');
export const alarmSupported = Capacitor.isNativePlatform();

// Calendar weekday: Sunday = 1 … Saturday = 7.
const WEEKDAY = { sunday: 1, monday: 2, tuesday: 3, wednesday: 4, thursday: 5, friday: 6, saturday: 7 };
const hhmm = (t) => {
  const [h, m] = String(t || '0:0').split(':').map((n) => parseInt(n, 10));
  return { hour: h || 0, minute: m || 0 };
};

export async function scheduleAlarm(block) {
  if (!alarmSupported || !block?.alarm) return;
  const { hour, minute } = hhmm(block.start);
  try {
    await Alarm.schedule({
      id: notifId(block.id),
      weekday: WEEKDAY[block.day] || 2,
      hour,
      minute,
      title: block.title || 'Class alarm',
      ringtone: block.ringtone || '',
    });
  } catch { /* best-effort */ }
}

export async function cancelAlarm(blockOrUid) {
  if (!alarmSupported) return;
  const uid = typeof blockOrUid === 'string' ? blockOrUid : blockOrUid?.id;
  if (!uid) return;
  try { await Alarm.cancel({ id: notifId(uid) }); } catch {}
}

// Device alarm ringtones for the picker. First entry is the default.
export async function getRingtones() {
  if (!alarmSupported) return [{ title: 'Default alarm', uri: '' }];
  try { const r = await Alarm.getRingtones(); return r?.ringtones || [{ title: 'Default alarm', uri: '' }]; }
  catch { return [{ title: 'Default alarm', uri: '' }]; }
}

export async function stopAlarm() {
  if (!alarmSupported) return;
  try { await Alarm.stop(); } catch {}
}

// Re-arm every alarm (safety net on app start; native alarms also persist
// on their own and self-reschedule weekly).
export async function rearmAlarms(blocks = []) {
  if (!alarmSupported) return;
  for (const b of blocks) {
    if (b.alarm) await scheduleAlarm(b); // eslint-disable-line no-await-in-loop
    else await cancelAlarm(b.id); // eslint-disable-line no-await-in-loop
  }
}
