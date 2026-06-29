package com.mahnotes.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/**
 * Bridges the home-screen widget to JS.
 *   setData({ json })       → store the widget data snapshot + refresh every widget.
 *   consumeOpenTarget()     → { type, id } the user tapped on a widget (cleared on read).
 *
 * The widget runs in a separate process and can't read the WebView's IndexedDB,
 * so the app mirrors a compact snapshot here (SharedPreferences) for it to render.
 */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {

    static final String PREFS = "mahnotes_widget";
    static final String KEY_DATA = "data";
    static final String KEY_OPEN_TYPE = "open_type";
    static final String KEY_OPEN_ID = "open_id";
    static final String KEY_PENDING = "pending_toggles";

    @PluginMethod
    public void setData(PluginCall call) {
        String json = call.getString("json", "{}");
        Context ctx = getContext();
        // commit() (synchronous) — not apply() — so the snapshot is durably on
        // disk before this resolves. The widget-config picker can be launched in
        // a FRESH process (the WebView/app isn't running), which loads prefs from
        // disk; an async apply() can lose its write if the app process is killed
        // first, leaving the picker showing a stale list that's missing the
        // newest note/plan. commit() guarantees the picker always sees the latest.
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_DATA, json).commit();

        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, NotesWidgetProvider.class));
        if (ids != null && ids.length > 0) {
            // Rebuild every widget from the fresh data.
            Intent intent = new Intent(ctx, NotesWidgetProvider.class);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(intent);
        }
        call.resolve();
    }

    // Checkbox toggles the user made on a widget, queued for the app to persist
    // to the real note/plan. Returned (and cleared) on the next app resume.
    @PluginMethod
    public void consumeToggles(PluginCall call) {
        SharedPreferences sp = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = sp.getString(KEY_PENDING, "[]");
        sp.edit().remove(KEY_PENDING).apply();
        JSObject ret = new JSObject();
        try {
            ret.put("toggles", new JSONArray(raw));
        } catch (Exception e) {
            ret.put("toggles", new JSONArray());
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void consumeOpenTarget(PluginCall call) {
        SharedPreferences sp = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String type = sp.getString(KEY_OPEN_TYPE, "");
        String id = sp.getString(KEY_OPEN_ID, "");
        sp.edit().remove(KEY_OPEN_TYPE).remove(KEY_OPEN_ID).apply();
        JSObject ret = new JSObject();
        if (type != null && !type.isEmpty()) {
            ret.put("type", type);
            ret.put("id", id == null ? "" : id);
        }
        call.resolve(ret);
    }
}
