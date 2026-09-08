package com.mahnotes.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/**
 * Bridges the text-selection clipboard to JS.
 *   consumePending()      → clips captured from the selection toolbar (cleared on read).
 *   setSnapshot({ json }) → mirror the app's clip list for the paste picker.
 *   copyToSystem({ text })→ put a clip on the SYSTEM clipboard.
 *
 * That last one is how clips reach the keyboard: Gboard's clipboard panel is its
 * own private storage with no third-party API, but it automatically ingests
 * whatever is copied to the system clipboard. So this is a one-way bridge —
 * Mah Notes → keyboard works, keyboard → Mah Notes is not possible.
 */
@CapacitorPlugin(name = "Clips")
public class ClipboardPlugin extends Plugin {

    @PluginMethod
    public void consumePending(PluginCall call) {
        JSONArray clips = ClipStore.takePending(getContext());
        JSObject ret = new JSObject();
        ret.put("clips", clips);
        call.resolve(ret);
    }

    @PluginMethod
    public void setSnapshot(PluginCall call) {
        ClipStore.writeSnapshot(getContext(), call.getString("json", "[]"));
        call.resolve();
    }

    @PluginMethod
    public void copyToSystem(PluginCall call) {
        String text = call.getString("text", "");
        Context ctx = getContext();
        ClipboardManager cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm == null) {
            call.reject("Clipboard unavailable");
            return;
        }
        cm.setPrimaryClip(ClipData.newPlainText("Mah Notes", text));
        call.resolve();
    }
}
