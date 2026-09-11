// ============================================================
//  Mah Notes desktop shell.
//
//  The window hosts exactly the same React build the website and the
//  Android app use; nothing here duplicates app logic. What this layer
//  owns is the things a browser tab cannot do:
//
//    • staying alive in the tray when the window is closed, which is
//      what keeps the global hotkeys working;
//    • one instance only, because two processes cannot both own Alt+N;
//    • Alt+N — read the selection in any app without disturbing the
//      user's clipboard (see capture.rs);
//    • a toast that reports the result without stealing focus.
// ============================================================

use tauri::{Emitter, Manager, WindowEvent};

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

#[cfg(target_os = "windows")]
pub mod capture;
#[cfg(target_os = "windows")]
pub mod paste;

/// Alt+N. Defined once so the handler's match and the registration cannot
/// drift apart — if they did, the hotkey would register but never fire.
#[cfg(target_os = "windows")]
const CAPTURE_MODS: tauri_plugin_global_shortcut::Modifiers =
    tauri_plugin_global_shortcut::Modifiers::ALT;
#[cfg(target_os = "windows")]
const CAPTURE_KEY: tauri_plugin_global_shortcut::Code =
    tauri_plugin_global_shortcut::Code::KeyN;

/// Alt+M opens the paste panel.
#[cfg(target_os = "windows")]
const PANEL_MODS: tauri_plugin_global_shortcut::Modifiers =
    tauri_plugin_global_shortcut::Modifiers::ALT;
#[cfg(target_os = "windows")]
const PANEL_KEY: tauri_plugin_global_shortcut::Code =
    tauri_plugin_global_shortcut::Code::KeyM;
#[cfg(desktop)]
mod pending;
#[cfg(desktop)]
mod prefs;
#[cfg(desktop)]
mod oauth;

/// Bring the main window back into view.
#[cfg(desktop)]
fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Flash a short message near the tray WITHOUT taking focus.
///
/// This matters more than it looks: if the toast activates, the app the user
/// was working in loses its selection, and the NEXT Alt+N fails. That presents
/// as a maddening intermittent bug. The window is created once, hidden, and
/// only ever shown — building a WebView per toast would also be far too slow.
#[cfg(desktop)]
fn toast(app: &tauri::AppHandle, message: &str) {
    if let Some(win) = app.get_webview_window("toast") {
        let _ = win.emit("toast:show", message);
        let _ = win.show();
    }
}

/// Which hotkeys actually registered. A shortcut can be refused because
/// another app already owns it, and until now that failure only reached
/// stderr — which nobody reads. Settings asks for this and says so.
#[cfg(desktop)]
static HOTKEY_STATUS: std::sync::Mutex<Option<(bool, bool)>> = std::sync::Mutex::new(None);

#[cfg(desktop)]
#[tauri::command]
fn hotkey_status() -> serde_json::Value {
    let (capture, panel) = HOTKEY_STATUS
        .lock()
        .ok()
        .and_then(|g| *g)
        .unwrap_or((false, false));
    serde_json::json!({
        "captureOk": capture,
        "panelOk": panel,
        "capture": "Alt+N",
        "panel": "Alt+M",
    })
}

/// Should closing the window keep the app alive in the tray?
#[cfg(desktop)]
#[tauri::command]
fn get_keep_running(app: tauri::AppHandle) -> bool {
    prefs::load(&app).keep_running
}

#[cfg(desktop)]
#[tauri::command]
fn set_keep_running(app: tauri::AppHandle, on: bool) {
    prefs::save(&app, prefs::Prefs { keep_running: on });
}

/// Sign in with Google through a loopback redirect (see oauth.rs).
///
/// Returns what the backend's existing /api/auth/google already accepts, so
/// there is no backend change — only a new Authorized redirect URI in the
/// Google Cloud console.
#[cfg(desktop)]
#[tauri::command]
async fn google_sign_in(
    app: tauri::AppHandle,
    client_id: String,
) -> Result<serde_json::Value, String> {
    // Blocking listener, so it must not run on the async runtime's thread.
    tauri::async_runtime::spawn_blocking(move || {
        oauth::google_login(&app, &client_id).map(|cb| {
            serde_json::json!({ "code": cb.code, "redirectUri": cb.redirect_uri })
        })
    })
    .await
    .map_err(|e| format!("Sign-in task failed: {e}"))?
}

/// Drain the captures queued while the UI was not running.
#[cfg(desktop)]
#[tauri::command]
fn take_pending_clips(app: tauri::AppHandle) -> Vec<pending::PendingClip> {
    pending::take(&app)
}

/// Alt+N: grab the selection, queue it, and say what happened.
#[cfg(target_os = "windows")]
fn on_capture_hotkey(app: &tauri::AppHandle) {
    // Run off the hotkey thread: the capture polls for up to 1.5s and must not
    // block the event loop that the toast needs to render.
    let app = app.clone();
    std::thread::spawn(move || match capture::capture_selection() {
        capture::Capture::Got { text, source } => {
            if pending::add(&app, &text, &source) {
                // The front end drains on this event when it is running; when
                // it is not, the queue is waiting on disk for next launch.
                let _ = app.emit("clip:captured", ());
                toast(&app, "Saved to Mah Notes");
            }
        }
        capture::Capture::NothingSelected => toast(&app, "Nothing selected"),
        capture::Capture::Blocked => {
            toast(&app, "Can't read from apps running as administrator")
        }
    });
}

/// Alt+M: remember what was in front, then show the panel.
///
/// The order matters and is the whole trick. Once the panel is visible it
/// owns the foreground, so the target has to be captured first — by the time
/// the user picks a clip, the original window is unrecoverable.
#[cfg(target_os = "windows")]
fn on_panel_hotkey(app: &tauri::AppHandle) {
    paste::remember_foreground();
    if let Some(win) = app.get_webview_window("panel") {
        let _ = win.emit("panel:opened", ());
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// Paste a clip into the app that had focus before the panel opened.
#[cfg(target_os = "windows")]
#[tauri::command]
fn paste_clip(app: tauri::AppHandle, text: String) -> Result<bool, String> {
    // Hide FIRST: while the panel is visible it holds the foreground, and
    // Windows will not hand that to anyone else.
    if let Some(win) = app.get_webview_window("panel") {
        let _ = win.hide();
    }
    // Off-thread: this sleeps several hundred milliseconds waiting for focus
    // and for the target to read the clipboard.
    std::thread::spawn(move || {
        match paste::paste_into_previous(&text) {
            paste::Paste::Done => {}
            paste::Paste::NoTarget => {
                // The text is on the clipboard, so say so rather than leaving
                // the user wondering whether anything happened.
                toast(&app, "Copied — paste it where you want it");
            }
        }
    });
    Ok(true)
}

/// Non-Windows desktop builds still need the command to exist so the shared
/// front end can call it.
#[cfg(all(desktop, not(target_os = "windows")))]
#[tauri::command]
fn paste_clip(_app: tauri::AppHandle, _text: String) -> Result<bool, String> {
    Err("Pasting is only implemented on Windows".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // A second launch must not start a second process: it would fail to
    // register the global hotkeys and look like a broken app. Focus the
    // window that already exists instead.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }));
        // Every window is denied, which is the same as not restoring geometry
        // at all — and that is deliberate.
        //
        // `main` is denied because the app is meant to open filling the screen.
        // This plugin restores the last saved size AFTER setup runs, so it
        // silently undid the maximize and the window came back at whatever size
        // it happened to be closed at.
        //
        // `toast` and `panel` are denied because the plugin also restores
        // whether a window was VISIBLE: a toast that happened to be on screen
        // at shutdown came back empty on the next launch and never left,
        // because nothing had sent it a message to time out.
        //
        // The plugin stays registered so a future window can opt in by being
        // left off this list.
        builder = builder.plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["main", "toast", "panel"])
                .build(),
        );
        // Run at login. Registered, but NOT enabled here — Settings owns that
        // choice, so nothing adds itself to startup without being asked.
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));
        #[cfg(target_os = "windows")]
        {
            use tauri_plugin_global_shortcut::ShortcutState;
            builder = builder.plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(|app, shortcut, event| {
                        // Press only. The release event would run the whole
                        // capture a second time.
                        if event.state() != ShortcutState::Pressed {
                            return;
                        }
                        if shortcut.matches(CAPTURE_MODS, CAPTURE_KEY) {
                            on_capture_hotkey(app);
                        } else if shortcut.matches(PANEL_MODS, PANEL_KEY) {
                            on_panel_hotkey(app);
                        }
                    })
                    .build(),
            );
        }
        #[cfg(not(target_os = "windows"))]
        {
            builder = builder.plugin(tauri_plugin_global_shortcut::Builder::new().build());
        }
    }

    builder
        .plugin(tauri_plugin_clipboard_manager::init())
        // Opens the downloaded installer in the system browser (see updates.ts).
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            take_pending_clips,
            paste_clip,
            hotkey_status,
            get_keep_running,
            set_keep_running,
            google_sign_in
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                let show = MenuItem::with_id(app, "show", "Open Mah Notes", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show, &quit])?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("Mah Notes")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => show_main(app),
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } = event
                        {
                            show_main(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }

            #[cfg(target_os = "windows")]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

                // Registration fails when another app already owns Alt+N.
                // Non-fatal: everything else still works, and the message says
                // what actually happened rather than failing silently.
                let capture = Shortcut::new(Some(CAPTURE_MODS), CAPTURE_KEY);
                let capture_ok = match app.global_shortcut().register(capture) {
                    Ok(()) => true,
                    Err(e) => {
                        eprintln!("Could not register Alt+N (another app may own it): {e}");
                        false
                    }
                };
                let panel = Shortcut::new(Some(PANEL_MODS), PANEL_KEY);
                let panel_ok = match app.global_shortcut().register(panel) {
                    Ok(()) => true,
                    Err(e) => {
                        eprintln!("Could not register Alt+M (another app may own it): {e}");
                        false
                    }
                };
                if let Ok(mut slot) = HOTKEY_STATUS.lock() {
                    *slot = Some((capture_ok, panel_ok));
                }
            }

            // Open filling the screen.
            //
            // `maximized` in tauri.conf.json only covers a first run: the
            // window-state plugin restores whatever size the window had when it
            // was last closed, and that restore happens as the window is
            // created. Doing it here runs afterwards, so it wins. Un-maximising
            // still gives back the remembered size.
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.maximize();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing HIDES rather than quits. A clipboard tool that exits when
            // you click the X stops answering its own hotkeys, which reads as
            // the feature being broken. Quit is on the tray menu.
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    if window.label() == "main" {
                        // Default is to keep running: an app that exits when you
                        // click the X stops answering its own hotkeys, which
                        // reads as the feature being broken. The user can turn
                        // that off in Settings, in which case the X really quits.
                        if prefs::load(window.app_handle()).keep_running {
                            api.prevent_close();
                            let _ = window.hide();
                        } else {
                            window.app_handle().exit(0);
                        }
                    }
                }
                // Clicking away from the panel dismisses it, the way every
                // other quick-launcher on the platform behaves.
                WindowEvent::Focused(false) if window.label() == "panel" => {
                    let _ = window.hide();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Mah Notes");
}
