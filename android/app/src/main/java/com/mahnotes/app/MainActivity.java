package com.mahnotes.app;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlarmPlugin.class);  // native ringing alarm
        registerPlugin(WidgetPlugin.class); // home-screen widget bridge
        super.onCreate(savedInstanceState);
        handleWidgetIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWidgetIntent(intent);
    }

    // A widget tap launches us with open_type/open_id extras; stash them so the
    // web layer (WidgetPlugin.consumeOpenTarget) can route to that item.
    private void handleWidgetIntent(Intent intent) {
        if (intent == null) return;
        String type = intent.getStringExtra("open_type");
        if (type == null || type.isEmpty()) return;
        String id = intent.getStringExtra("open_id");
        getSharedPreferences(WidgetPlugin.PREFS, Context.MODE_PRIVATE).edit()
                .putString(WidgetPlugin.KEY_OPEN_TYPE, type)
                .putString(WidgetPlugin.KEY_OPEN_ID, id == null ? "" : id)
                .apply();
    }
}
