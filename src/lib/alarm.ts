// ============================================================
//  Native ringing alarm (Android). Talks to the custom "Alarm"
//  plugin (com.mahnotes.app.AlarmPlugin) which uses AlarmManager's
//  alarm-clock API + a foreground service that plays a real ringtone
//  on the ALARM stream and shows a full-screen alarm over the lock
//  screen. No-ops on the web.
// ============================================================
import { Capacitor, registerPlugin } from '@capacitor/core';
import { notifId } from './notifications';

// Custom native plugin — typed loosely (its surface lives in Android/Java).
const Alarm: any = registerPlugin('Alarm');
export const alarmSupported = Capacitor.isNativePlatform();

// Calendar weekday: Sunday = 1 … Saturday = 7.
const WEEKDAY = { sunday: 1, monday: 2, tuesday: 3, wednesday: 4, thursday: 5, friday: 6, saturday: 7 };
const hhmm = (t) => {
  const [h, m] = String(t || '0:0').split(':').map((n) => parseInt(n, 10));
  return { hour: h || 0, minute: m || 0 };
};

// A block has TWO independent native alarms (so they never collide): the loud
// RING uses the block's own id; the gentle exact REMINDER uses a separate id.
const ringId = (uid) => notifId(uid);
const reminderId = (uid) => notifId(`rem-${uid}`);

export async function scheduleAlarm(block) {
  if (!alarmSupported || !block?.alarm) return;
  const { hour, minute } = hhmm(block.start);
  try {
    await Alarm.schedule({
      id: ringId(block.id),
      weekday: WEEKDAY[block.day] || 2,
      hour,
      minute,
      title: block.title || 'Class alarm',
      ringtone: block.ringtone || '',
      notifyOnly: false,
    });
  } catch { /* best-effort */ }
}

export async function cancelAlarm(blockOrUid) {
  if (!alarmSupported) return;
  const uid = typeof blockOrUid === 'string' ? blockOrUid : blockOrUid?.id;
  if (!uid) return;
  try { await Alarm.cancel({ id: ringId(uid) }); } catch {}
}

// Exact weekly REMINDER (a notification, not a ring) on the same Doze-exempt
// setAlarmClock path the loud alarm uses — so it fires on time even when the
// app is closed (Capacitor's repeating local-notification was inexact).
export async function scheduleReminder(block) {
  if (!alarmSupported || !block?.notify) return;
  const { hour, minute } = hhmm(block.start);
  try {
    await Alarm.schedule({
      id: reminderId(block.id),
      weekday: WEEKDAY[block.day] || 2,
      hour,
      minute,
      title: block.title || 'Scheduled block',
      ringtone: '',
      notifyOnly: true,
    });
  } catch { /* best-effort */ }
}

export async function cancelReminder(blockOrUid) {
  if (!alarmSupported) return;
  const uid = typeof blockOrUid === 'string' ? blockOrUid : blockOrUid?.id;
  if (!uid) return;
  try { await Alarm.cancel({ id: reminderId(uid) }); } catch {}
}

// ── Alarm reliability (OEM battery / autostart / full-screen permissions) ──
// Aggressive skins (HiOS, MIUI, ColorOS…) freeze background apps; these let the
// user grant the exemptions so alarms fire on time even when the app is closed.
export async function isBatteryUnrestricted() {
  if (!alarmSupported) return true;
  try { const r = await Alarm.isBatteryUnrestricted(); return !!r?.value; } catch { return true; }
}
export async function requestBatteryUnrestricted() {
  if (!alarmSupported) return;
  try { await Alarm.requestBatteryUnrestricted(); } catch {}
}

// One call → { battery, fullScreen, brand } for the reliability panel.
export async function reliabilityStatus() {
  if (!alarmSupported) return { battery: true, fullScreen: true, brand: '' };
  try {
    const r = await Alarm.reliabilityStatus();
    return { battery: !!r?.battery, fullScreen: !!r?.fullScreen, brand: r?.brand || '' };
  } catch { return { battery: true, fullScreen: true, brand: '' }; }
}

// Android 14+: allow the full-screen alarm screen over the lock screen.
export async function requestFullScreenIntent() {
  if (!alarmSupported) return;
  try { await Alarm.requestFullScreenIntent(); } catch {}
}

// Open the OEM auto-start / background-launch manager (or App Info as fallback).
export async function openAutoStartSettings() {
  if (!alarmSupported) return;
  try { await Alarm.openAutoStartSettings(); } catch {}
}

// Open this app's system "App info" page.
export async function openAppSettings() {
  if (!alarmSupported) return;
  try { await Alarm.openAppSettings(); } catch {}
}

// Fire-once TEST alarm ~2 minutes from now (next whole minute ≥ +2 min). Proves
// the entire native path on this device with no day/time entry involved.
// Returns the Date it should ring at, or null on failure.
export async function testAlarm() {
  if (!alarmSupported) return null;
  const t = new Date(Date.now() + 2 * 60 * 1000); // seconds are floored to :00
  try {
    await Alarm.schedule({
      id: notifId('mahnotes-test-alarm'),
      weekday: t.getDay() + 1, // JS 0=Sun → Calendar 1=Sun
      hour: t.getHours(),
      minute: t.getMinutes(),
      title: 'Test alarm — it works! 🎉',
      ringtone: '',
      notifyOnly: false,
      oneShot: true,
    });
    t.setSeconds(0, 0);
    return t;
  } catch { return null; }
}

// Keep-alive foreground service — keeps the process alive so alarms fire on time
// even on OEMs that freeze background apps. Opt-in; persists across reboots.
export async function isKeepAlive() {
  if (!alarmSupported) return false;
  try { const r = await Alarm.isKeepAlive(); return !!r?.value; } catch { return false; }
}
export async function setKeepAlive(on) {
  if (!alarmSupported) return;
  try { await Alarm.setKeepAlive({ value: !!on }); } catch {}
}
// Start it on app launch only if the user previously turned it on.
export async function ensureKeepAlive() {
  if (!alarmSupported) return;
  try { await Alarm.ensureKeepAlive(); } catch {}
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

// Re-arm every exact reminder (safety net on app start).
export async function rearmReminders(blocks = []) {
  if (!alarmSupported) return;
  for (const b of blocks) {
    if (b.notify) await scheduleReminder(b); // eslint-disable-line no-await-in-loop
    else await cancelReminder(b.id); // eslint-disable-line no-await-in-loop
  }
}
