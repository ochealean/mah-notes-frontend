package com.mahnotes.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Home-screen widget. Renders the note / plan(today) / schedule(today) the user
 * picked (stored as "sel_<id>" = "type:id").
 *
 * Rows live in a scrollable {@link android.widget.ListView} backed by
 * {@link WidgetRemoteViewsService} — RemoteViews only scrolls via a collection
 * view. Each row carries a fill-in intent so a tap either toggles its checkbox
 * (notes/plans) or opens the app (schedule / plain lines); the click is handled
 * in {@link #onReceive} via a broadcast template. "Today" is computed here so
 * plan/schedule widgets stay correct across midnight.
 */
public class NotesWidgetProvider extends AppWidgetProvider {

    static final String[] DAY_KEYS =
            { "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday" };
    private static final String[] DAY_LABELS =
            { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" };

    static final String ACTION_CLICK = "com.mahnotes.app.WIDGET_CLICK";

    static class Row {
        String text;
        int checked;        // -1 = no checkbox, 0 = unchecked, 1 = checked
        boolean toggleable; // true → tapping flips the checkbox; false → opens the app
        int ck = -1;        // stable index used to write the toggle back to the item
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(ctx, mgr, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (!ACTION_CLICK.equals(intent.getAction())) return;

        int appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID);
        SharedPreferences sp = ctx.getSharedPreferences(WidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String sel = sp.getString("sel_" + appWidgetId, "");
        String type = "", id = "";
        if (sel != null && sel.contains(":")) {
            String[] parts = sel.split(":", 2);
            type = parts[0];
            id = parts[1];
        }

        if ("toggle".equals(intent.getStringExtra("op"))) {
            int ck = intent.getIntExtra("ck", -1);
            boolean checked = intent.getBooleanExtra("newChecked", true);
            applyToggle(sp, type, id, ck, checked);
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            int[] all = mgr.getAppWidgetIds(new ComponentName(ctx, NotesWidgetProvider.class));
            if (all != null && all.length > 0) {
                mgr.notifyAppWidgetViewDataChanged(all, R.id.widget_list);
            }
        } else {
            // Plain line / schedule row → open the item in the app.
            Intent open = new Intent(ctx, MainActivity.class);
            open.putExtra("open_type", type);
            open.putExtra("open_id", id);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            ctx.startActivity(open);
        }
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
        // A plan widget also shows today's weekday (e.g. "Leg Day · Monday").
        if ("plan".equals(openType)) {
            title = title + " · " + DAY_LABELS[todayIndex()];
        }

        views.setTextViewText(R.id.widget_title, title);
        views.setTextColor(R.id.widget_title, primary);
        views.setTextColor(R.id.widget_add, primary);
        views.setInt(R.id.widget_divider, "setBackgroundColor", primary);

        // Bind the scrolling list to the service that supplies the rows.
        Intent svc = new Intent(ctx, WidgetRemoteViewsService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        // Unique data per widget so each gets its own factory instance.
        svc.setData(Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, svc);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);

        // Row taps come back here as a broadcast; the fill-in intent says what to do.
        Intent click = new Intent(ctx, NotesWidgetProvider.class);
        click.setAction(ACTION_CLICK);
        click.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        click.setData(Uri.parse("mahnotes://widget/" + appWidgetId));
        PendingIntent template = PendingIntent.getBroadcast(ctx, appWidgetId, click,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        views.setPendingIntentTemplate(R.id.widget_list, template);

        // Tapping the header opens the selected item in the app.
        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction("MAHNOTES_WIDGET_OPEN_" + appWidgetId);
        open.putExtra("open_type", openType);
        open.putExtra("open_id", openId);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, appWidgetId, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_title, pi);
        views.setOnClickPendingIntent(R.id.widget_add, pi);

        mgr.updateAppWidget(appWidgetId, views);
        mgr.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_list);
    }

    // Flip a checkbox in the cached snapshot (so the widget shows it instantly)
    // and queue a pending toggle for the app to persist to the real note/plan.
    private static void applyToggle(SharedPreferences sp, String type, String id, int ck, boolean checked) {
        try {
            JSONObject data = new JSONObject(sp.getString(WidgetPlugin.KEY_DATA, "{}"));
            String day = todayKey();
            if ("note".equals(type)) {
                JSONObject n = findById(data.optJSONArray("notes"), id);
                JSONArray lines = n == null ? null : n.optJSONArray("lines");
                if (lines != null) {
                    for (int i = 0; i < lines.length(); i++) {
                        JSONObject l = lines.getJSONObject(i);
                        if (l.optInt("ck", -1) == ck) { l.put("checked", checked); break; }
                    }
                }
            } else if ("plan".equals(type)) {
                JSONObject p = findById(data.optJSONArray("plans"), id);
                JSONObject days = p == null ? null : p.optJSONObject("days");
                JSONArray items = days == null ? null : days.optJSONArray(day);
                if (items != null && ck >= 0 && ck < items.length()) {
                    items.getJSONObject(ck).put("checked", checked);
                }
            }
            sp.edit().putString(WidgetPlugin.KEY_DATA, data.toString()).apply();

            JSONArray pending;
            try { pending = new JSONArray(sp.getString(WidgetPlugin.KEY_PENDING, "[]")); }
            catch (Exception e) { pending = new JSONArray(); }
            JSONObject t = new JSONObject();
            t.put("type", type);
            t.put("id", id);
            t.put("day", day);
            t.put("ck", ck);
            t.put("checked", checked);
            pending.put(t);
            sp.edit().putString(WidgetPlugin.KEY_PENDING, pending.toString()).apply();
        } catch (Exception ignored) {}
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

    // Builds the rows for a widget — shared with the ListView factory.
    static List<Row> buildRows(JSONObject data, String type, String id) {
        List<Row> rows = new ArrayList<>();
        try {
            if ("note".equals(type)) {
                JSONObject n = findById(data.optJSONArray("notes"), id);
                JSONArray lines = n == null ? null : n.optJSONArray("lines");
                if (lines != null) {
                    for (int j = 0; j < lines.length(); j++) {
                        JSONObject l = lines.getJSONObject(j);
                        Row r = new Row();
                        r.text = l.optString("text", "");
                        r.checked = l.isNull("checked") ? -1 : (l.optBoolean("checked") ? 1 : 0);
                        r.toggleable = r.checked >= 0;
                        r.ck = l.optInt("ck", -1);
                        rows.add(r);
                    }
                }
            } else if ("plan".equals(type)) {
                JSONObject p = findById(data.optJSONArray("plans"), id);
                JSONObject days = p == null ? null : p.optJSONObject("days");
                JSONArray items = days == null ? null : days.optJSONArray(todayKey());
                if (items != null) {
                    for (int j = 0; j < items.length(); j++) {
                        JSONObject it = items.getJSONObject(j);
                        Row r = new Row();
                        r.text = it.optString("text", "");
                        r.checked = it.optBoolean("checked") ? 1 : 0;
                        r.toggleable = true;
                        r.ck = j;
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
                        r.toggleable = false;
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

    private static int todayIndex() {
        return (Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1) % 7; // 0=Sun … 6=Sat
    }

    private static String todayKey() {
        return DAY_KEYS[todayIndex()];
    }
}
