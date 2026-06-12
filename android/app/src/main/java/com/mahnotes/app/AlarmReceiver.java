package com.mahnotes.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.text.TextUtils;

/**
 * Fired by AlarmManager (an exact setAlarmClock alarm) when a block's time comes.
 *   • notifyOnly == false → start the foreground {@link AlarmService} (rings + full screen).
 *   • notifyOnly == true  → post a gentle reminder notification with sound.
 * Either way it immediately re-arms the same block for next week so it keeps
 * repeating even while the app is closed.
 */
public class AlarmReceiver extends BroadcastReceiver {

    private static final String REMINDER_CHANNEL = "mahnotes-reminder";

    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra("id", 0);
        String title = intent.getStringExtra("title");
        String ringtone = intent.getStringExtra("ringtone");
        boolean notifyOnly = intent.getBooleanExtra("notifyOnly", false);
        boolean oneShot = intent.getBooleanExtra("oneShot", false);
        int weekday = intent.getIntExtra("weekday", 1);
        int hour = intent.getIntExtra("hour", 0);
        int minute = intent.getIntExtra("minute", 0);

        if (notifyOnly) {
            postReminder(context, id, title);
        } else {
            Intent svc = new Intent(context, AlarmService.class);
            svc.putExtra("id", id);
            svc.putExtra("title", title);
            svc.putExtra("ringtone", ringtone);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svc);
            } else {
                context.startService(svc);
            }
        }

        // Re-arm for next week (same mode) — unless this was a fire-once test alarm.
        if (oneShot) {
            AlarmScheduler.cancel(context, id); // forget it (clears the persisted entry)
        } else {
            AlarmScheduler.rescheduleNext(context,
                    new AlarmScheduler.AlarmItem(id, weekday, hour, minute, title, ringtone, notifyOnly));
        }
    }

    /** A normal (dismissible) reminder notification with the default notification sound. */
    private void postReminder(Context context, int id, String title) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (TextUtils.isEmpty(title)) title = "Scheduled block";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && nm.getNotificationChannel(REMINDER_CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(REMINDER_CHANNEL, "Schedule reminders",
                    NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Weekly reminders for your scheduled time blocks");
            ch.enableVibration(true);
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), attrs);
            nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pflags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pflags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent openPi = PendingIntent.getActivity(context, id, open, pflags);

        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(context, REMINDER_CHANNEL) : new Notification.Builder(context);
        b.setContentTitle(title)
                .setContentText("It's time — tap to open Mah Notes")
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setAutoCancel(true)
                .setContentIntent(openPi);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE);
            b.setPriority(Notification.PRIORITY_HIGH);
        }
        nm.notify(id, b.build());
    }
}
