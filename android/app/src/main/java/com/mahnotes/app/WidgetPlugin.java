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

    @PluginMethod
    public void setData(PluginCall call) {
        String json = call.getString("json", "{}");
        Context ctx = getContext();
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_DATA, json).apply();

        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, NotesWidgetProvider.class));
        if (ids != null && ids.length > 0) {
            // Refresh the scrollable lists, then push a full provider update.
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_list);
            Intent intent = new Intent(ctx, NotesWidgetProvider.class);
            intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(intent);
        }
        call.resolve();
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
