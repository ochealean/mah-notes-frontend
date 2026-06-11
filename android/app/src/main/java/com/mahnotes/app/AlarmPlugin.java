package com.mahnotes.app;

import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridges the native ringing-alarm to JS.
 *   schedule({ id, weekday, hour, minute, title, ringtone })
 *   cancel({ id })
 *   getRingtones()  → { ringtones: [{ title, uri }] }  (device alarm sounds)
 *   stop()          → silence the alarm that's currently ringing
 */
@CapacitorPlugin(name = "Alarm")
public class AlarmPlugin extends Plugin {

    @PluginMethod
    public void schedule(PluginCall call) {
        int id = call.getInt("id", 0);
        int weekday = call.getInt("weekday", 1);
        int hour = call.getInt("hour", 0);
        int minute = call.getInt("minute", 0);
        String title = call.getString("title", "");
        String ringtone = call.getString("ringtone", "");
        boolean notifyOnly = Boolean.TRUE.equals(call.getBoolean("notifyOnly", false));
        try {
            AlarmScheduler.schedule(getContext(),
                    new AlarmScheduler.AlarmItem(id, weekday, hour, minute, title, ringtone, notifyOnly));
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not schedule alarm: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        int id = call.getInt("id", 0);
        AlarmScheduler.cancel(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        AlarmService.stop(getContext());
        call.resolve();
    }

    /** Whether the OS is currently exempting us from battery optimisation (Doze). */
    @PluginMethod
    public void isBatteryUnrestricted(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", isIgnoringBatteryOptimizations());
        call.resolve(ret);
    }

    /** Ask the OS to exempt the app from battery optimisation so alarms fire on time. */
    @PluginMethod
    public void requestBatteryUnrestricted(PluginCall call) {
        try {
            if (isIgnoringBatteryOptimizations()) { call.resolve(); return; }
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open battery settings: " + e.getMessage());
        }
    }

    private boolean isIgnoringBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }

    @PluginMethod
    public void getRingtones(PluginCall call) {
        JSArray list = new JSArray();
        JSObject def = new JSObject();
        def.put("title", "Default alarm");
        def.put("uri", "");
        list.put(def);
        try {
            RingtoneManager rm = new RingtoneManager(getContext());
            rm.setType(RingtoneManager.TYPE_ALARM);
            Cursor c = rm.getCursor();
            while (c.moveToNext()) {
                String title = c.getString(RingtoneManager.TITLE_COLUMN_INDEX);
                Uri uri = rm.getRingtoneUri(c.getPosition());
                if (uri == null) continue;
                JSObject o = new JSObject();
                o.put("title", title);
                o.put("uri", uri.toString());
                list.put(o);
            }
        } catch (Exception ignored) { /* return at least the default */ }
        JSObject ret = new JSObject();
        ret.put("ringtones", list);
        call.resolve(ret);
    }
}
