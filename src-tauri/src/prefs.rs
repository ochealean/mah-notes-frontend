// ============================================================
//  Desktop preferences that Rust has to know about.
//
//  Only settings the SHELL acts on live here — right now, whether
//  closing the window keeps the app running in the tray. Everything
//  else the user configures lives in the web app's own storage; there
//  is no reason to have two places to look unless Rust needs the answer
//  before the WebView is up.
// ============================================================
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const FILE: &str = "desktop_prefs.json";

#[derive(Serialize, Deserialize, Clone)]
pub struct Prefs {
    /// Closing the window hides it to the tray instead of quitting.
    ///
    /// On by default, and it is the reason the hotkeys keep working: an app
    /// that exits when you click the X stops answering Alt+N, which reads as
    /// the feature being broken rather than as the app being closed.
    #[serde(default = "yes")]
    pub keep_running: bool,
}

fn yes() -> bool {
    true
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs { keep_running: true }
    }
}

// Cached so the window-close handler never touches the disk on the UI thread.
static CACHE: Mutex<Option<Prefs>> = Mutex::new(None);

fn path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join(FILE))
}

pub fn load(app: &AppHandle) -> Prefs {
    if let Ok(guard) = CACHE.lock() {
        if let Some(p) = guard.clone() {
            return p;
        }
    }
    let prefs = path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Prefs>(&s).ok())
        .unwrap_or_default();
    if let Ok(mut guard) = CACHE.lock() {
        *guard = Some(prefs.clone());
    }
    prefs
}

pub fn save(app: &AppHandle, prefs: Prefs) {
    if let Some(p) = path(app) {
        if let Ok(json) = serde_json::to_string(&prefs) {
            let _ = fs::write(p, json);
        }
    }
    if let Ok(mut guard) = CACHE.lock() {
        *guard = Some(prefs);
    }
}
