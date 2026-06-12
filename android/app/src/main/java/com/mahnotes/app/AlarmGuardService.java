package com.mahnotes.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;

/**
 * A lightweight, always-on foreground service that simply keeps the app's
 * process alive with a quiet ongoing notification. On aggressive skins
 * (HiOS/Transsion, MIUI…) a frozen background process makes even exact
 * setAlarmClock alarms get held until the app is reopened — keeping ONE live
 * foreground service prevents that freeze, so alarms fire on time while closed.
 *
 * Opt-in (toggled from the "Make alarms reliable" panel); persisted so it
 * restarts after a reboot.
 */
public class AlarmGuardService extends Service {

    private static final String PREFS = "mahnotes_guard";
    private static final String KEY_ON = "enabled";
    private static final String CHANNEL = "mahnotes-guard";
    private static final int FG_ID = 99124;
    // ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE (API 34) as a literal so it
    // compiles regardless of compileSdk.
    private static final int TYPE_SPECIAL_USE = 1073741824;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundNow();
        return START_STICKY;
    }

    private void startForegroundNow() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null
                && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Alarm keep-alive",
                    NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Keeps scheduled alarms reliable on this device");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pflags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pflags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent openPi = PendingIntent.getActivity(this, 0, open, pflags);

        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setContentTitle("Alarms armed")
                .setContentText("Mah Notes is keeping your scheduled alarms reliable.")
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setOngoing(true)
                .setContentIntent(openPi);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            b.setVisibility(Notification.VISIBILITY_PUBLIC);
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            b.setPriority(Notification.PRIORITY_MIN);
        }

        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(FG_ID, b.build(), TYPE_SPECIAL_USE);
            } else {
                startForeground(FG_ID, b.build());
            }
        } catch (Exception e) {
            try { startForeground(FG_ID, b.build()); } catch (Exception ignored) {}
        }
    }

    static boolean isEnabled(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ON, false);
    }

    /** Turn the keep-alive on/off and persist the choice. */
    static void setEnabled(Context ctx, boolean on) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ON, on).apply();
        if (on) start(ctx); else stop(ctx);
    }

    /** Start it only if the user previously enabled it (used on app start / boot). */
    static void startIfEnabled(Context ctx) {
        if (isEnabled(ctx)) start(ctx);
    }

    private static void start(Context ctx) {
        // May be called from BOOT_COMPLETED where some OEMs disallow FGS start;
        // best-effort so it never crashes the receiver (the app re-starts it on open).
        try {
            Intent i = new Intent(ctx, AlarmGuardService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Exception ignored) {}
    }

    private static void stop(Context ctx) {
        try { ctx.stopService(new Intent(ctx, AlarmGuardService.class)); } catch (Exception ignored) {}
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
