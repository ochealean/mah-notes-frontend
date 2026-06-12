package com.mahnotes.app;

import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
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
        boolean oneShot = Boolean.TRUE.equals(call.getBoolean("oneShot", false));
        try {
            AlarmScheduler.schedule(getContext(),
                    new AlarmScheduler.AlarmItem(id, weekday, hour, minute, title, ringtone, notifyOnly, oneShot));
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

    /** Keep-alive foreground service (keeps the process alive so alarms fire on time). */
    @PluginMethod
    public void isKeepAlive(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", AlarmGuardService.isEnabled(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void setKeepAlive(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("value", false));
        try {
            AlarmGuardService.setEnabled(getContext(), on);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not change keep-alive: " + e.getMessage());
        }
    }

    /** Start the keep-alive service only if the user already enabled it (app start). */
    @PluginMethod
    public void ensureKeepAlive(PluginCall call) {
        try { AlarmGuardService.startIfEnabled(getContext()); } catch (Exception ignored) {}
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

    /** Android 14+: whether we're allowed to show the full-screen alarm over the lock screen. */
    @PluginMethod
    public void canUseFullScreenIntent(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", canUseFullScreen());
        call.resolve(ret);
    }

    private boolean canUseFullScreen() {
        if (Build.VERSION.SDK_INT < 34) return true; // granted by default below Android 14
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        try { return nm != null && nm.canUseFullScreenIntent(); } catch (Throwable t) { return true; }
    }

    /** Android 14+: open the system page to allow our full-screen alarm screen. */
    @PluginMethod
    public void requestFullScreenIntent(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 34 && !canUseFullScreen()) {
                // Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT (string used for back-compat compile)
                Intent i = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT",
                        Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) {
            // Fall back to the app's notification settings.
            openAppNotificationSettings();
            call.resolve();
        }
    }

    /** Bundle every reliability flag the UI needs in one call. */
    @PluginMethod
    public void reliabilityStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("battery", isIgnoringBatteryOptimizations());
        ret.put("fullScreen", canUseFullScreen());
        ret.put("brand", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
        call.resolve(ret);
    }

    /** Try to open the OEM's auto-start / background-launch manager; fall back to App Info. */
    @PluginMethod
    public void openAutoStartSettings(PluginCall call) {
        // Known auto-start managers across OEMs (incl. Transsion/HiOS: cyin/phonemaster).
        String[][] comps = {
                { "com.cyin.himgr", "com.cyin.himgr.autostart.AutostartActivity" },
                { "com.transsion.phonemaster", "com.itel.autostart.AutoStartActivity" },
                { "com.transsion.phonemaster", "com.cyin.himgr.autostart.AutostartActivity" },
                { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
                { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
                { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
                { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" },
                { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
                { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity" },
                { "com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity" },
                { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
        };
        PackageManager pm = getContext().getPackageManager();
        for (String[] c : comps) {
            try {
                Intent i = new Intent();
                i.setComponent(new ComponentName(c[0], c[1]));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (i.resolveActivity(pm) != null) {
                    getContext().startActivity(i);
                    call.resolve();
                    return;
                }
            } catch (Exception ignored) { /* try the next one */ }
        }
        openAppDetails();   // fallback so the user can find Auto-start / Battery there
        call.resolve();
    }

    /** Open this app's system "App info" page (universal). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openAppDetails();
        call.resolve();
    }

    private void openAppDetails() {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) {}
    }

    private void openAppNotificationSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) {}
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
