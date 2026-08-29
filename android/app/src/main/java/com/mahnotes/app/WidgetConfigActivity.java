package com.mahnotes.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Insets;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowInsets;
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
    private ArrayAdapter<String> adapter;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED); // pressing back leaves no widget added

        Bundle extras = getIntent().getExtras();
        if (extras != null) {
            appWidgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }

        loadItems();

        int density = (int) getResources().getDisplayMetrics().density;
        int pad = 18 * density;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        root.setPadding(pad, pad, pad, pad);
        // targetSdk 36 forces edge-to-edge: the window extends under the status
        // and navigation bars, so without this the first list row sits behind
        // the status bar (the newest note — the list is sorted newest-first —
        // looked like it was simply missing from the picker).
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int left, top, right, bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                left = bars.left; top = bars.top; right = bars.right; bottom = bars.bottom;
            } else {
                left = insets.getSystemWindowInsetLeft();
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(pad + left, pad + top, pad + right, pad + bottom);
            return insets;
        });

        TextView header = new TextView(this);
        header.setText("Show in this widget");
        header.setTextSize(19);
        header.setTextColor(Color.parseColor("#2E2A47"));
        header.setPadding(0, 0, 0, pad / 2);
        header.setGravity(Gravity.START);
        root.addView(header);

        ListView list = new ListView(this);
        adapter = new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, labels);
        list.setAdapter(adapter);
        root.addView(list);
        setContentView(root);

        list.setOnItemClickListener((parent, view, position, idLong) -> {
            String sel = sels.get(position);
            if (sel.isEmpty()) { finish(); return; }
            SharedPreferences sp = getSharedPreferences(WidgetPlugin.PREFS, Context.MODE_PRIVATE);
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

    // Re-read the snapshot whenever this screen becomes visible again — not just
    // on first creation. Without this, leaving the picker open (e.g. switching to
    // the app to add a note, then coming back via Recents instead of reopening
    // the picker) shows the stale list from whenever onCreate() first ran, even
    // after a fresh "Update home-screen widget" has written the real data.
    @Override
    protected void onResume() {
        super.onResume();
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        loadItems();
        if (adapter != null) adapter.notifyDataSetChanged();
    }

    private void loadItems() {
        labels.clear();
        sels.clear();

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

        if (labels.isEmpty()) { labels.add("Open Mah Notes once, then add the widget"); sels.add(""); }
    }
}
