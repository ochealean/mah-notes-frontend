// ============================================================
//  Local notifications for the Schedule tab (native only).
//  Each scheduled block becomes a weekly-repeating reminder that
//  fires on its day at its start time, with sound (high-importance
//  channel). No-ops on the web.
// ============================================================
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const notificationsSupported = Capacitor.isNativePlatform();

const REMINDER_CHANNEL = 'schedule-reminders'; // gentle bell (loud alarms are native, see alarm.js)
// Capacitor weekday: Sunday = 1 … Saturday = 7.
const WEEKDAY = { sunday: 1, monday: 2, tuesday: 3, wednesday: 4, thursday: 5, friday: 6, saturday: 7 };
const DAY_LABEL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

// A stable positive 31-bit integer id from the block's uid (Android needs an int).
export function notifId(uid = '') {
  let h = 0;
  for (let i = 0; i < uid.length; i += 1) h = (h * 31 + uid.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

const hhmm = (t) => {
  const [h, m] = String(t || '0:0').split(':').map((n) => parseInt(n, 10));
  return { hour: h || 0, minute: m || 0 };
};

let channelReady = false;
async function ensureChannel() {
  if (channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL, name: 'Schedule reminders',
      description: 'Weekly reminders for your scheduled time blocks',
      importance: 4, visibility: 1, vibration: true,
    });
    channelReady = true;
  } catch { /* createChannel is Android-only / best-effort */ }
}

// Ask for permission (and create the channel). Returns true if granted.
export async function ensurePermission() {
  if (!notificationsSupported) return false;
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
    await ensureChannel();
    return perm.display === 'granted';
  } catch { return false; }
}

// Schedule (or replace) the weekly gentle REMINDER for one block.
// (The loud ringing ALARM is handled natively — see alarm.js.)
export async function scheduleBlock(block) {
  if (!notificationsSupported || !block) return;
  if (!block.notify) { await cancelBlock(block); return; }
  if (!(await ensurePermission())) return;
  const { hour, minute } = hhmm(block.start);
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: notifId(block.id),
        channelId: REMINDER_CHANNEL,
        title: block.title || 'Scheduled block',
        body: `${block.start}–${block.end} · ${DAY_LABEL[block.day] || ''}`.trim(),
        // on + allowWhileIdle → exact RTC_WAKEUP alarm (given the exact-alarm
        // permission in the manifest), so it fires on time even when closed.
        schedule: { on: { weekday: WEEKDAY[block.day] || 2, hour, minute }, allowWhileIdle: true },
      }],
    });
  } catch { /* ignore — scheduling is best-effort */ }
}

// Cancel a block's reminder (accepts a block or its uid).
export async function cancelBlock(blockOrUid) {
  if (!notificationsSupported) return;
  const uid = typeof blockOrUid === 'string' ? blockOrUid : blockOrUid?.id;
  if (!uid) return;
  try { await LocalNotifications.cancel({ notifications: [{ id: notifId(uid) }] }); } catch {}
}

// Re-arm every reminder (call on app start so the OS holds them after a reboot).
export async function rescheduleAll(blocks = []) {
  if (!notificationsSupported) return;
  for (const b of blocks) {
    if (b.notify) await scheduleBlock(b); // eslint-disable-line no-await-in-loop
    else await cancelBlock(b); // eslint-disable-line no-await-in-loop
  }
}
