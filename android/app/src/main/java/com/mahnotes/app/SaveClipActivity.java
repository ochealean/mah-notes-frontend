package com.mahnotes.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

/**
 * The "Mah Notes" entry in Android's text-selection toolbar (copy / paste /
 * select all / …). Declared via an ACTION_PROCESS_TEXT intent filter, so it
 * shows up on a selection in ANY app that uses a normal text view.
 *
 * It has no UI: save the selection, toast, finish. We deliberately do NOT
 * setResult(), which tells the host app to leave the user's selection alone.
 */
public class SaveClipActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = getIntent();
        CharSequence text = intent == null ? null : intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
        // Note: EXTRA_PROCESS_TEXT_READONLY is a *boolean* flag (is the selection
        // editable?), not a second text extra. Saving works either way, so this
        // activity ignores it — only the paste side cares.

        if (text != null && text.toString().trim().length() > 0) {
            ClipStore.add(this, text.toString(), sourceLabel());
            Toast.makeText(this, "Saved to Mah Notes", Toast.LENGTH_SHORT).show();
        } else {
            Toast.makeText(this, "Nothing to save", Toast.LENGTH_SHORT).show();
        }
        finish();
    }

    /** Friendly name of the app the text came from, or "" if we can't tell. */
    private String sourceLabel() {
        try {
            Uri referrer = getReferrer();
            String pkg = referrer == null ? null : referrer.getHost();
            if (pkg == null || pkg.isEmpty()) return "";
            PackageManager pm = getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) {
            return "";
        }
    }
}
