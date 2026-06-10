package com.mahnotes.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Fired by AlarmManager when an alarm goes off. Starts the foreground
 * {@link AlarmService} (which rings + shows the alarm screen) and immediately
 * schedules the same block for next week.
 */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra("id", 0);
        String title = intent.getStringExtra("title");
        String ringtone = intent.getStringExtra("ringtone");
        int weekday = intent.getIntExtra("weekday", 1);
        int hour = intent.getIntExtra("hour", 0);
        int minute = intent.getIntExtra("minute", 0);

        // Ring now.
        Intent svc = new Intent(context, AlarmService.class);
        svc.putExtra("id", id);
        svc.putExtra("title", title);
        svc.putExtra("ringtone", ringtone);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(svc);
        } else {
            context.startService(svc);
        }

        // Re-arm for next week.
        AlarmScheduler.rescheduleNext(context,
                new AlarmScheduler.AlarmItem(id, weekday, hour, minute, title, ringtone));
    }
}
