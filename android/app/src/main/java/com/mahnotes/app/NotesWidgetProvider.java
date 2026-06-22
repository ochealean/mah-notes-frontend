package com.mahnotes.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Home-screen widget. Renders the note / plan(today) / schedule(today) the user
 * picked (stored as "sel_<id>" = "type:id"). Rows are built directly into a
 * LinearLayout with addView() — no RemoteViewsService/ListView collection, which
 * is the fragile part that caused "Can't load widget". "Today" is computed here
 * so plan/schedule widgets stay correct across midnight.
 */
public class NotesWidgetProvider extends AppWidgetProvider {

    private static final String[] DAY_KEYS =
            { "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday" };
    private static final int MAX_ROWS = 14;

    private static class Row {
        String text;
        int checked; // -1 = no checkbox, 0 = unchecked, 1 = checked
    }

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
        List<Row> rows = new ArrayList<>();
        try {
            JSONObject data = new JSONObject(sp.getString(WidgetPlugin.KEY_DATA, "{}"));
            try { primary = Color.parseColor(data.optString("primary", "#7C83FD")); } catch (Exception ignored) {}
            title = resolveTitle(data, openType, openId, title);
            rows = buildRows(data, openType, openId);
        } catch (Exception ignored) {}

        views.setTextViewText(R.id.widget_title, title);
        views.setTextColor(R.id.widget_title, primary);
        views.setTextColor(R.id.widget_add, primary);
        views.setInt(R.id.widget_divider, "setBackgroundColor", primary);

        views.removeAllViews(R.id.widget_container);
        if (rows.isEmpty()) {
            RemoteViews er = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
            er.setViewVisibility(R.id.row_check, View.GONE);
            er.setTextViewText(R.id.row_text, sel == null || sel.isEmpty()
                    ? "Tap to open Mah Notes" : "Nothing for today");
            views.addView(R.id.widget_container, er);
        } else {
            int shown = Math.min(rows.size(), MAX_ROWS);
            for (int i = 0; i < shown; i++) {
                Row r = rows.get(i);
                RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
                rv.setTextViewText(R.id.row_text, r.text);
                if (r.checked < 0) {
                    rv.setViewVisibility(R.id.row_check, View.GONE);
                } else {
                    rv.setViewVisibility(R.id.row_check, View.VISIBLE);
                    rv.setImageViewResource(R.id.row_check,
                            r.checked == 1 ? R.drawable.ic_check_circle : R.drawable.ic_circle);
                }
                views.addView(R.id.widget_container, rv);
            }
            if (rows.size() > MAX_ROWS) {
                RemoteViews more = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
                more.setViewVisibility(R.id.row_check, View.GONE);
                more.setTextViewText(R.id.row_text, "+ " + (rows.size() - MAX_ROWS) + " more…");
                views.addView(R.id.widget_container, more);
            }
        }

        // Whole-widget tap → open the selected item in the app.
        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction("MAHNOTES_WIDGET_OPEN_" + appWidgetId);
        open.putExtra("open_type", openType);
        open.putExtra("open_id", openId);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, appWidgetId, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pi);

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

    private static List<Row> buildRows(JSONObject data, String type, String id) {
        List<Row> rows = new ArrayList<>();
        try {
            if ("note".equals(type)) {
                JSONArray notes = data.optJSONArray("notes");
                JSONObject n = findById(notes, id);
                JSONArray lines = n == null ? null : n.optJSONArray("lines");
                if (lines != null) {
                    for (int j = 0; j < lines.length(); j++) {
                        JSONObject l = lines.getJSONObject(j);
                        Row r = new Row();
                        r.text = l.optString("text", "");
                        r.checked = l.isNull("checked") ? -1 : (l.optBoolean("checked") ? 1 : 0);
                        rows.add(r);
                    }
                }
            } else if ("plan".equals(type)) {
                JSONArray plans = data.optJSONArray("plans");
                JSONObject p = findById(plans, id);
                JSONObject days = p == null ? null : p.optJSONObject("days");
                JSONArray items = days == null ? null : days.optJSONArray(todayKey());
                if (items != null) {
                    for (int j = 0; j < items.length(); j++) {
                        JSONObject it = items.getJSONObject(j);
                        Row r = new Row();
                        r.text = it.optString("text", "");
                        r.checked = it.optBoolean("checked") ? 1 : 0;
                        rows.add(r);
                    }
                }
            } else if ("schedule".equals(type)) {
                JSONArray blocks = data.optJSONArray("schedule");
                String today = todayKey();
                if (blocks != null) {
                    for (int i = 0; i < blocks.length(); i++) {
                        JSONObject b = blocks.getJSONObject(i);
                        if (!today.equals(b.optString("day"))) continue;
                        String start = b.optString("start", "");
                        String end = b.optString("end", "");
                        String head = start + (end.isEmpty() ? "" : "–" + end) + "   " + b.optString("title", "");
                        String sub = b.optString("sub", "");
                        Row r = new Row();
                        r.text = sub.isEmpty() ? head : head + "\n" + sub;
                        r.checked = -1;
                        rows.add(r);
                    }
                }
            }
        } catch (Exception ignored) {}
        return rows;
    }

    private static JSONObject findById(JSONArray arr, String id) throws Exception {
        if (arr == null) return null;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.getJSONObject(i);
            if (o.optString("id").equals(id)) return o;
        }
        return null;
    }

    private static String todayKey() {
        int dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK); // 1=Sun … 7=Sat
        return DAY_KEYS[(dow - 1) % 7];
    }
}
