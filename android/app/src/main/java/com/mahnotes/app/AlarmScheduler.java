package com.mahnotes.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;

/**
 * Schedules weekly "alarm clock" alarms via AlarmManager.setAlarmClock — exact,
 * Doze-exempt, and shown with the system alarm icon. Each alarm is persisted so
 * it can be restored after a reboot. Firing triggers {@link AlarmReceiver}.
 */
public class AlarmScheduler {

    private static final String PREFS = "mahnotes_alarms";

    /** Persisted shape of one alarm. */
    static class AlarmItem {
        int id;
        int weekday;   // Calendar.DAY_OF_WEEK: Sunday=1 … Saturday=7
        int hour;
        int minute;
        String title;
        String ringtone; // content URI string, or "" for the default alarm

        AlarmItem(int id, int weekday, int hour, int minute, String title, String ringtone) {
            this.id = id; this.weekday = weekday; this.hour = hour; this.minute = minute;
            this.title = title == null ? "" : title;
            this.ringtone = ringtone == null ? "" : ringtone;
        }

        String serialize() {
            // weekday|hour|minute|ringtone|title  (title last, may contain nothing risky)
            return weekday + "|" + hour + "|" + minute + "|" + ringtone + "|" + title;
        }

        static AlarmItem parse(int id, String s) {
            String[] p = s.split("\\|", 5);
            if (p.length < 5) return null;
            try {
                return new AlarmItem(id, Integer.parseInt(p[0]), Integer.parseInt(p[1]),
                        Integer.parseInt(p[2]), p[4], p[3]);
            } catch (NumberFormatException e) { return null; }
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Next future time matching weekday/hour/minute. */
    static long nextTrigger(int weekday, int hour, int minute) {
        Calendar now = Calendar.getInstance();
        Calendar next = Calendar.getInstance();
        next.set(Calendar.DAY_OF_WEEK, weekday);
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        // Roll forward to a strictly-future occurrence.
        while (next.getTimeInMillis() <= now.getTimeInMillis()) {
            next.add(Calendar.DAY_OF_YEAR, 7);
        }
        return next.getTimeInMillis();
    }

    private static PendingIntent operation(Context ctx, AlarmItem a) {
        Intent i = new Intent(ctx, AlarmReceiver.class);
        i.setAction("com.mahnotes.app.ALARM_FIRE_" + a.id); // unique per id
        i.putExtra("id", a.id);
        i.putExtra("weekday", a.weekday);
        i.putExtra("hour", a.hour);
        i.putExtra("minute", a.minute);
        i.putExtra("title", a.title);
        i.putExtra("ringtone", a.ringtone);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, a.id, i, flags);
    }

    /** Schedule (or replace) the alarm and persist it. */
    static void schedule(Context ctx, AlarmItem a) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long trigger = nextTrigger(a.weekday, a.hour, a.minute);

        // Show-intent: tapping the status-bar alarm icon opens the app.
        Intent show = new Intent(ctx, MainActivity.class);
        int sflags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) sflags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent showPi = PendingIntent.getActivity(ctx, a.id, show, sflags);

        AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(trigger, showPi);
        am.setAlarmClock(info, operation(ctx, a));

        prefs(ctx).edit().putString(String.valueOf(a.id), a.serialize()).apply();
    }

    /** Cancel an alarm and forget it. */
    static void cancel(Context ctx, int id) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences p = prefs(ctx);
        String s = p.getString(String.valueOf(id), null);
        if (am != null) {
            AlarmItem a = s != null ? AlarmItem.parse(id, s) : new AlarmItem(id, 1, 0, 0, "", "");
            am.cancel(operation(ctx, a));
        }
        p.edit().remove(String.valueOf(id)).apply();
    }

    /** After an alarm fires, set up next week's occurrence. */
    static void rescheduleNext(Context ctx, AlarmItem a) {
        schedule(ctx, a);
    }

    /** Re-arm every persisted alarm (used after a reboot). */
    static void restoreAll(Context ctx) {
        SharedPreferences p = prefs(ctx);
        for (String key : p.getAll().keySet()) {
            int id;
            try { id = Integer.parseInt(key); } catch (NumberFormatException e) { continue; }
            AlarmItem a = AlarmItem.parse(id, p.getString(key, ""));
            if (a != null) schedule(ctx, a);
        }
    }
}
