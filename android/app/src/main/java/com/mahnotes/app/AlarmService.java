package com.mahnotes.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.text.TextUtils;

/**
 * Foreground service that actually RINGS: it plays the chosen alarm ringtone on
 * the ALARM audio stream (looping) + vibrates, and posts a full-screen-intent
 * notification that launches {@link AlarmActivity} over the lock screen.
 * Stops when the user dismisses the alarm.
 */
public class AlarmService extends Service {

    static final String ACTION_STOP = "com.mahnotes.app.ALARM_STOP";
    private static final String CHANNEL = "mahnotes-alarm-fire";
    private static final int FG_ID = 99123;

    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopEverything();
            return START_NOT_STICKY;
        }

        String title = intent != null ? intent.getStringExtra("title") : null;
        String ringtone = intent != null ? intent.getStringExtra("ringtone") : null;
        if (TextUtils.isEmpty(title)) title = "Class alarm";

        startForegroundNotification(title);
        acquireWake();
        startSound(ringtone);
        startVibrate();
        launchAlarmScreen(title);
        return START_STICKY;
    }

    private void startForegroundNotification(String title) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null
                && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Class alarm",
                    NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("A ringing alarm is going off");
            ch.setSound(null, null); // the service plays the sound itself
            ch.enableVibration(false);
            nm.createNotificationChannel(ch);
        }

        Intent full = new Intent(this, AlarmActivity.class);
        full.putExtra("title", title);
        full.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pflags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pflags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent fullPi = PendingIntent.getActivity(this, 0, full, pflags);

        Intent stop = new Intent(this, AlarmService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 1, stop, pflags);

        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setContentTitle("⏰ " + title)
                .setContentText("Tap to open · alarm is ringing")
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setCategory(Notification.CATEGORY_ALARM)
                .setOngoing(true)
                .setAutoCancel(false)
                .setFullScreenIntent(fullPi, true)
                .setContentIntent(fullPi)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Dismiss", stopPi);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            b.setVisibility(Notification.VISIBILITY_PUBLIC);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(FG_ID, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(FG_ID, b.build());
        }
    }

    private void startSound(String ringtone) {
        try {
            Uri uri = !TextUtils.isEmpty(ringtone) ? Uri.parse(ringtone) : null;
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            player.setDataSource(this, uri);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) { /* if the chosen sound fails, the notification still shows */ }
    }

    private void startVibrate() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm != null ? vm.getDefaultVibrator() : null;
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator()) return;
            long[] pattern = { 0, 700, 600 };
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        } catch (Exception ignored) {}
    }

    private void acquireWake() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mahnotes:alarm");
            wakeLock.acquire(5 * 60 * 1000L); // up to 5 min
        } catch (Exception ignored) {}
    }

    private void launchAlarmScreen(String title) {
        try {
            Intent i = new Intent(this, AlarmActivity.class);
            i.putExtra("title", title);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(i);
        } catch (Exception ignored) { /* full-screen intent is the fallback */ }
    }

    private void stopEverything() {
        try { if (player != null) { player.stop(); player.release(); player = null; } } catch (Exception ignored) {}
        try { if (vibrator != null) vibrator.cancel(); } catch (Exception ignored) {}
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        stopSelf();
    }

    /** Called by AlarmActivity's Dismiss button. */
    static void stop(Context ctx) {
        ctx.startService(new Intent(ctx, AlarmService.class).setAction(ACTION_STOP));
    }

    @Override public void onDestroy() { stopEverything(); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
