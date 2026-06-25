package com.mahnotes.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.ArrayAdapter;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Shown when the user drops the widget on the home screen: pick which note,
 * plan, or "Today's schedule" this widget displays. The options come from the
 * snapshot the app wrote to SharedPreferences.
 */
public class WidgetConfigActivity extends Activity {

    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private final List<String> labels = new ArrayList<>();
    private final List<String> sels = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED); // pressing back leaves no widget added

        Bundle extras = getIntent().getExtras();
        if (extras != null) {
            appWidgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }

        final SharedPreferences sp = getSharedPreferences(WidgetPlugin.PREFS, Context.MODE_PRIVATE);
        try {
            JSONObject data = new JSONObject(sp.getString(WidgetPlugin.KEY_DATA, "{}"));
            JSONArray items = data.optJSONArray("items");
            if (items != null) {
                for (int i = 0; i < items.length(); i++) {
                    JSONObject o = items.getJSONObject(i);
                    String type = o.optString("type");
                    String id = o.optString("id");
                    String prefix = "note".equals(type) ? "📄  "        // 📄
                            : "plan".equals(type) ? "🗓  "               // 🗓
                            : "⏰  ";                                          // ⏰
                    labels.add(prefix + o.optString("title", "Untitled"));
                    sels.add(type + ":" + id);
                }
            }
        } catch (Exception ignored) {}

        boolean empty = labels.isEmpty();
        if (empty) { labels.add("Open Mah Notes once, then add the widget"); sels.add(""); }

        int density = (int) getResources().getDisplayMetrics().density;
        int pad = 18 * density;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        root.setPadding(pad, pad, pad, pad);

        TextView header = new TextView(this);
        header.setText("Show in this widget");
        header.setTextSize(19);
        header.setTextColor(Color.parseColor("#2E2A47"));
        header.setPadding(0, 0, 0, pad / 2);
        header.setGravity(Gravity.START);
        root.addView(header);

        ListView list = new ListView(this);
        list.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, labels));
        root.addView(list);
        setContentView(root);

        list.setOnItemClickListener((parent, view, position, idLong) -> {
            String sel = sels.get(position);
            if (sel.isEmpty()) { finish(); return; }
            sp.edit().putString("sel_" + appWidgetId, sel).apply();

            AppWidgetManager mgr = AppWidgetManager.getInstance(this);
            NotesWidgetProvider.updateWidget(this, mgr, appWidgetId);
            NotesWidgetProvider.scheduleMidnightRefresh(this); // roll over to the new day on its own

            Intent result = new Intent();
            result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            setResult(RESULT_OK, result);
            finish();
        });
    }
}
