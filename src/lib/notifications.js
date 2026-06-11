// ============================================================
//  Notification permission for the Schedule tab (native only).
//
//  The actual weekly REMINDERS and ALARMS are scheduled natively via the
//  custom "Alarm" plugin (see alarm.js) on Android's exact, Doze-exempt
//  setAlarmClock path — so they fire ON TIME even when the app is closed.
//  Capacitor's LocalNotifications is used ONLY to request the POST_NOTIFICATIONS
//  runtime permission (its repeating schedule was inexact, hence the delays).
// ============================================================
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const notificationsSupported = Capacitor.isNativePlatform();

// A stable positive 31-bit integer id from a uid string (Android needs an int).
export function notifId(uid = '') {
  let h = 0;
  for (let i = 0; i < uid.length; i += 1) h = (h * 31 + uid.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

// Ask for notification permission. Returns true if granted.
export async function ensurePermission() {
  if (!notificationsSupported) return false;
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
    return perm.display === 'granted';
  } catch { return false; }
}
