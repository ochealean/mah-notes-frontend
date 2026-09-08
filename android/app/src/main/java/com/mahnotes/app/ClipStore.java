package com.mahnotes.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.UUID;

/**
 * Storage for the text-selection clipboard, in SharedPreferences.
 *
 * Two separate lists, moving in opposite directions:
 *   pending_clips → written by SaveClipActivity, drained by JS into IndexedDB.
 *   clips         → written by JS (the real list), read by PasteClipActivity.
 *
 * Both live natively because the PROCESS_TEXT activities launch in a FRESH
 * process with no WebView — the app is normally closed when the user highlights
 * text in Chrome — so IndexedDB simply isn't reachable from there.
 */
class ClipStore {

    static final String PREFS = "mahnotes_clips";
    static final String KEY_PENDING = "pending_clips";   // captures waiting for the app
    static final String KEY_SNAPSHOT = "clips";          // mirror of the app's list

    private static final int MAX_PENDING = 200;
    private static final int MAX_TEXT = 20000; // a runaway "select all" shouldn't bloat prefs

    private ClipStore() { }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Queue a captured selection for the app to pick up on its next open. */
    static void add(Context ctx, String text, String source) {
        if (text == null) return;
        String trimmed = text.trim();
        if (trimmed.isEmpty()) return;
        if (trimmed.length() > MAX_TEXT) trimmed = trimmed.substring(0, MAX_TEXT);

        SharedPreferences sp = prefs(ctx);
        JSONArray list = parse(sp.getString(KEY_PENDING, "[]"));

        try {
            JSONObject clip = new JSONObject();
            clip.put("id", UUID.randomUUID().toString());
            clip.put("text", trimmed);
            clip.put("source", source == null ? "" : source);
            clip.put("createdAt", System.currentTimeMillis());

            // Newest first, capped.
            JSONArray next = new JSONArray();
            next.put(clip);
            for (int i = 0; i < list.length() && next.length() < MAX_PENDING; i++) {
                next.put(list.get(i));
            }
            // commit(), not apply(): this activity calls finish() immediately after,
            // and its process can be reaped before an async write reaches disk —
            // which would silently drop the capture. Same reasoning as
            // WidgetPlugin.setData.
            sp.edit().putString(KEY_PENDING, next.toString()).commit();
        } catch (Exception ignored) { }
    }

    /** Drain the queue: returns everything waiting and clears it. */
    static JSONArray takePending(Context ctx) {
        SharedPreferences sp = prefs(ctx);
        JSONArray list = parse(sp.getString(KEY_PENDING, "[]"));
        sp.edit().remove(KEY_PENDING).apply();
        return list;
    }

    /** The app's current clip list, as last mirrored by JS (for the paste picker). */
    static JSONArray readSnapshot(Context ctx) {
        return parse(prefs(ctx).getString(KEY_SNAPSHOT, "[]"));
    }

    static void writeSnapshot(Context ctx, String json) {
        // commit() for the same reason as above: the picker runs in a fresh
        // process that reads prefs off disk, and may launch right after the app
        // is swiped away.
        prefs(ctx).edit().putString(KEY_SNAPSHOT, json == null ? "[]" : json).commit();
    }

    private static JSONArray parse(String raw) {
        try {
            return new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }
}
