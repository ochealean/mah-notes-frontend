package com.mahnotes.app;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Reads the widget's selection + the cached snapshot and turns them into
 * scrollable rows. Each row gets a fill-in intent: checkbox rows toggle (merged
 * into the provider's broadcast template), other rows open the app.
 */
public class WidgetRemoteViewsFactory implements RemoteViewsService.RemoteViewsFactory {

    private final Context ctx;
    private final int appWidgetId;
    private final List<NotesWidgetProvider.Row> rows = new ArrayList<>();

    WidgetRemoteViewsFactory(Context ctx, Intent intent) {
        this.ctx = ctx;
        this.appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID);
    }

    @Override public void onCreate() {}
    @Override public void onDestroy() { rows.clear(); }
    @Override public int getCount() { return rows.size(); }
    @Override public int getViewTypeCount() { return 1; }
    @Override public long getItemId(int position) { return position; }
    @Override public boolean hasStableIds() { return false; }
    @Override public RemoteViews getLoadingView() { return null; }

    @Override
    public void onDataSetChanged() {
        rows.clear();
        SharedPreferences sp = ctx.getSharedPreferences(WidgetPlugin.PREFS, Context.MODE_PRIVATE);
        String sel = sp.getString("sel_" + appWidgetId, "");
        String type = "", id = "";
        if (sel != null && sel.contains(":")) {
            String[] parts = sel.split(":", 2);
            type = parts[0];
            id = parts[1];
        }
        try {
            JSONObject data = new JSONObject(sp.getString(WidgetPlugin.KEY_DATA, "{}"));
            rows.addAll(NotesWidgetProvider.buildRows(data, type, id));
        } catch (Exception ignored) {}
    }

    @Override
    public RemoteViews getViewAt(int position) {
        RemoteViews rv = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
        NotesWidgetProvider.Row r = rows.get(position);
        rv.setTextViewText(R.id.row_text, r.text);
        if (r.checked < 0) {
            rv.setViewVisibility(R.id.row_check, View.GONE);
        } else {
            rv.setViewVisibility(R.id.row_check, View.VISIBLE);
            rv.setImageViewResource(R.id.row_check,
                    r.checked == 1 ? R.drawable.ic_check_circle : R.drawable.ic_circle);
        }

        Intent fill = new Intent();
        if (r.toggleable) {
            fill.putExtra("op", "toggle");
            fill.putExtra("ck", r.ck);
            fill.putExtra("newChecked", r.checked != 1);
        } else {
            fill.putExtra("op", "open");
        }
        rv.setOnClickFillInIntent(R.id.row_root, fill);
        return rv;
    }
}
