// ============================================================
//  Captured clips waiting for the WebView.
//
//  A port of ClipStore.java. The reasoning is identical on both
//  platforms: capture happens while the UI is not running — the Android
//  activity has no WebView at all, and on desktop the window is usually
//  closed to the tray — so the capture is queued to disk and drained by
//  the front end when it next runs.
//
//  Caps match the Android side exactly (200 entries, 20,000 characters)
//  so neither platform truncates what the other would have kept.
// ============================================================
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const MAX_PENDING: usize = 200;
const MAX_TEXT: usize = 20_000;
const FILE: &str = "pending_clips.json";

#[derive(Serialize, Deserialize, Clone)]
pub struct PendingClip {
    pub id: String,
    pub text: String,
    pub source: String,
    /// Epoch millis, matching what the Android bridge sends, so the front end
    /// normalises both the same way.
    pub created_at: i64,
}

fn path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join(FILE))
}

fn read(app: &AppHandle) -> Vec<PendingClip> {
    path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write(app: &AppHandle, list: &[PendingClip]) {
    if let Some(p) = path(app) {
        if let Ok(json) = serde_json::to_string(list) {
            let _ = fs::write(p, json);
        }
    }
}

/// Queue a capture. Newest first, capped, empty text rejected.
pub fn add(app: &AppHandle, text: &str, source: &str) -> bool {
    let text = text.trim();
    if text.is_empty() {
        return false;
    }
    let text: String = text.chars().take(MAX_TEXT).collect();

    let mut list = read(app);
    list.insert(
        0,
        PendingClip {
            id: uuid_v4(),
            text,
            source: source.to_string(),
            created_at: now_millis(),
        },
    );
    list.truncate(MAX_PENDING);
    write(app, &list);
    true
}

/// Hand the queue to the front end and clear it.
///
/// NOTE this is a destructive read, the same as ClipStore.takePending: if the
/// front end fails to store what it receives, those clips are gone. Kept
/// deliberately symmetrical with Android rather than quietly diverging.
pub fn take(app: &AppHandle) -> Vec<PendingClip> {
    let list = read(app);
    if !list.is_empty() {
        write(app, &[]);
    }
    list
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// A v4 uuid without pulling in a crate for it. Only needs to be unique
/// enough that two captures never collide as IndexedDB keys.
fn uuid_v4() -> String {
    let mut b = [0u8; 16];
    // Seeded from the clock plus the address of a stack local: enough entropy
    // for an id that is only ever compared for equality.
    let seed = now_millis() as u64 ^ (&b as *const _ as u64);
    let mut x = seed | 1;
    for chunk in b.iter_mut() {
        // xorshift64
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        *chunk = (x & 0xff) as u8;
    }
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
        b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]
    )
}
