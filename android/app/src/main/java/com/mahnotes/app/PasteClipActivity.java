package com.mahnotes.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The "Mah Notes Clipboard" entry in the text-selection toolbar: lists saved
 * clips and replaces the current selection with the one the user picks.
 *
 * Android has no way to expose a list inside the toolbar itself, and no way to
 * add items to a keyboard's clipboard panel, so this is the closest thing to
 * "paste from Mah Notes" the platform allows. It reads ClipStore's snapshot
 * because this activity runs in its own process with no WebView.
 */
public class PasteClipActivity extends Activity {

    private static final int PREVIEW_LEN = 60;

    private List<String> texts = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = getIntent();
        // The manifest can't filter on editability, so this is the only place we
        // can find out that replacing the selection is impossible.
        boolean readOnly = intent != null
                && intent.getBooleanExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, false);
        if (readOnly) {
            Toast.makeText(this, "This text can't be edited", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        JSONArray clips = ClipStore.readSnapshot(this);
        List<String> labels = new ArrayList<>();
        for (int i = 0; i < clips.length(); i++) {
            JSONObject c = clips.optJSONObject(i);
            if (c == null) continue;
            String text = c.optString("text", "");
            if (text.trim().isEmpty()) continue;
            texts.add(text);
            labels.add(preview(text));
        }

        if (labels.isEmpty()) {
            Toast.makeText(this, "No clips saved yet", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        new AlertDialog.Builder(this)
                .setTitle("Paste from Mah Notes")
                .setItems(labels.toArray(new CharSequence[0]), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialog, int which) {
                        Intent res = new Intent();
                        // The host app swaps the user's selection for this text.
                        res.putExtra(Intent.EXTRA_PROCESS_TEXT, texts.get(which));
                        setResult(RESULT_OK, res);
                        finish();
                    }
                })
                .setOnCancelListener(new DialogInterface.OnCancelListener() {
                    @Override
                    public void onCancel(DialogInterface dialog) {
                        finish(); // no result → selection left untouched
                    }
                })
                .show();
    }

    /** One-line, whitespace-collapsed preview of a clip. */
    private static String preview(String text) {
        String flat = text.replaceAll("\\s+", " ").trim();
        return flat.length() > PREVIEW_LEN ? flat.substring(0, PREVIEW_LEN) + "…" : flat;
    }
}
