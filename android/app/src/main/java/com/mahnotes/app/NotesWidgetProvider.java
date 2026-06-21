package com.mahnotes.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget. Renders the note / plan(today) / schedule(today) the user
 * picked (stored as "sel_<id>" = "type:id" in SharedPreferences); the scrollable
 * rows come from WidgetRemoteViewsFactory.
 */
public class NotesWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(ctx, mgr, id);
    }

    static void updateWidget(Context ctx, AppWidgetManager mgr, int appWidgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_layout);

        SharedPreferences sp = ctx.getSharedPreferences(WidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String sel = sp.getString("sel_" + appWidgetId, "");
        String openType = "", openId = "";
        if (sel != null && sel.contains(":")) {
            String[] parts = sel.split(":", 2);
            openType = parts[0];
            openId = parts[1];
        }

        String title = "Mah Notes";
        int primary = Color.parseColor("#7C83FD");
        try {
            JSONObject data = new JSONObject(sp.getString(WidgetPlugin.KEY_DATA, "{}"));
            try { primary = Color.parseColor(data.optString("primary", "#7C83FD")); } catch (Exception ignored) {}
            title = resolveTitle(data, openType, openId, title);
        } catch (Exception ignored) {}

        views.setTextViewText(R.id.widget_title, title);
        views.setTextColor(R.id.widget_title, primary);
        views.setInt(R.id.widget_add, "setColorFilter", primary);
        views.setInt(R.id.widget_divider, "setBackgroundColor", primary);

        // Scrollable rows from the RemoteViewsService. A per-widget data URI keeps
        // each widget's factory independent.
        Intent svc = new Intent(ctx, WidgetRemoteViewsService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, svc);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);

        // Row taps: a template PendingIntent + per-row fill-in extras (set in the factory).
        Intent rowOpen = new Intent(ctx, MainActivity.class);
        rowOpen.setAction("MAHNOTES_WIDGET_ROW_" + appWidgetId);
        rowOpen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent rowTemplate = PendingIntent.getActivity(ctx, appWidgetId, rowOpen,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        views.setPendingIntentTemplate(R.id.widget_list, rowTemplate);

        // Header tap → open the selected item directly.
        Intent headerOpen = new Intent(ctx, MainActivity.class);
        headerOpen.setAction("MAHNOTES_WIDGET_HEADER_" + appWidgetId);
        headerOpen.putExtra("open_type", openType);
        headerOpen.putExtra("open_id", openId);
        headerOpen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent headerPi = PendingIntent.getActivity(ctx, 1_000_000 + appWidgetId, headerOpen,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_header, headerPi);

        mgr.updateAppWidget(appWidgetId, views);
    }

    private static String resolveTitle(JSONObject data, String type, String id, String fallback) {
        if ("schedule".equals(type)) return "Today's schedule";
        try {
            JSONArray items = data.optJSONArray("items");
            if (items != null) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject o = items.getJSONObject(i);
                    if (o.optString("type").equals(type) && o.optString("id").equals(id)) {
                        return o.optString("title", fallback);
                    }
                }
            }
        } catch (Exception ignored) {}
        return fallback;
    }
}
