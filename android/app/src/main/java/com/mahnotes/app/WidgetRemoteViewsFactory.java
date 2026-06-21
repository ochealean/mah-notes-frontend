package com.mahnotes.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Builds the rows for one widget: a note's checklist/lines, a plan's TODAY items,
 * or TODAY's schedule blocks. "Today" is computed here so plan/schedule widgets
 * stay correct across midnight without the app being open.
 */
public class WidgetRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory {

    private static final String[] DAY_KEYS =
            { "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday" };

    private final Context ctx;
    private final int appWidgetId;
    private final List<Row> rows = new ArrayList<>();

    private static class Row {
        String text;
        int checked;   // -1 = no checkbox, 0 = unchecked, 1 = checked
        String type;
        String id;
    }

    WidgetRemoteViewsFactory(Context ctx, Intent intent) {
        this.ctx = ctx;
        this.appWidgetId = intent.getIntExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
    }

    @Override public void onCreate() {}
    @Override public void onDestroy() { rows.clear(); }
    @Override public int getCount() { return rows.size(); }
    @Override public long getItemId(int position) { return position; }
    @Override public boolean hasStableIds() { return false; }
    @Override public int getViewTypeCount() { return 1; }
    @Override public RemoteViews getLoadingView() { return null; }

    @Override
    public void onDataSetChanged() {
        rows.clear();
        SharedPreferences sp = ctx.getSharedPreferences(WidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String sel = sp.getString("sel_" + appWidgetId, "");
        String type = "", id = "";
        if (sel != null && sel.contains(":")) {
            String[] p = sel.split(":", 2);
            type = p[0];
            id = p[1];
        }
        try {
            JSONObject data = new JSONObject(sp.getString(WidgetPlugin.KEY_DATA, "{}"));
            if ("note".equals(type)) buildNote(data, id);
            else if ("plan".equals(type)) buildPlan(data, id);
            else if ("schedule".equals(type)) buildSchedule(data);
        } catch (Exception ignored) {}
    }

    private void buildNote(JSONObject data, String id) throws Exception {
        JSONArray notes = data.optJSONArray("notes");
        if (notes == null) return;
        for (int i = 0; i < notes.length(); i++) {
            JSONObject n = notes.getJSONObject(i);
            if (!n.optString("id").equals(id)) continue;
            JSONArray lines = n.optJSONArray("lines");
            if (lines != null) {
                for (int j = 0; j < lines.length(); j++) {
                    JSONObject l = lines.getJSONObject(j);
                    Row r = new Row();
                    r.text = l.optString("text", "");
                    r.checked = l.isNull("checked") ? -1 : (l.optBoolean("checked") ? 1 : 0);
                    r.type = "note";
                    r.id = id;
                    rows.add(r);
                }
            }
            return;
        }
    }

    private void buildPlan(JSONObject data, String id) throws Exception {
        JSONArray plans = data.optJSONArray("plans");
        if (plans == null) return;
        String today = todayKey();
        for (int i = 0; i < plans.length(); i++) {
            JSONObject p = plans.getJSONObject(i);
            if (!p.optString("id").equals(id)) continue;
            JSONObject days = p.optJSONObject("days");
            JSONArray items = days == null ? null : days.optJSONArray(today);
            if (items != null) {
                for (int j = 0; j < items.length(); j++) {
                    JSONObject it = items.getJSONObject(j);
                    Row r = new Row();
                    r.text = it.optString("text", "");
                    r.checked = it.optBoolean("checked") ? 1 : 0;
                    r.type = "plan";
                    r.id = id;
                    rows.add(r);
                }
            }
            return;
        }
    }

    private void buildSchedule(JSONObject data) throws Exception {
        JSONArray blocks = data.optJSONArray("schedule");
        if (blocks == null) return;
        String today = todayKey();
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
            r.type = "schedule";
            r.id = "today";
            rows.add(r);
        }
    }

    private String todayKey() {
        int dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK); // 1=Sun … 7=Sat
        return DAY_KEYS[(dow - 1) % 7];
    }

    @Override
    public RemoteViews getViewAt(int position) {
        Row r = rows.get(position);
        RemoteViews row = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
        row.setTextViewText(R.id.row_text, r.text);
        if (r.checked < 0) {
            row.setViewVisibility(R.id.row_check, View.GONE);
        } else {
            row.setViewVisibility(R.id.row_check, View.VISIBLE);
            row.setImageViewResource(R.id.row_check,
                    r.checked == 1 ? R.drawable.ic_check_circle : R.drawable.ic_circle);
        }
        Intent fill = new Intent();
        fill.putExtra("open_type", r.type);
        fill.putExtra("open_id", r.id);
        row.setOnClickFillInIntent(R.id.row_root, fill);
        return row;
    }
}
