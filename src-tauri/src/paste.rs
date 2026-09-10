// ============================================================
//  Alt+M — the paste panel's other half.
//
//  Showing a window is easy; putting text back into the app the user
//  was in a moment ago is not. Two things make it work:
//
//    • The target window is recorded when the HOTKEY fires, before the
//      panel appears. By the time the user presses Enter, the panel is
//      the foreground window and the original target is long gone.
//
//    • SetForegroundWindow is normally refused. It is allowed here
//      because our process received the last input event — the Enter
//      keypress — which grants the privilege. AttachThreadInput is the
//      fallback for when it is refused anyway.
//
//  The clipboard is borrowed and given back, exactly as Alt+N does.
// ============================================================
#![cfg(target_os = "windows")]

use std::sync::Mutex;
use std::thread::sleep;
use std::time::Duration;

use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
// AttachThreadInput lives under Threading in windows-sys, not under the
// keyboard module its name suggests.
use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{SetFocus, VK_CONTROL, VK_V};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
};

use crate::capture::{key, open_clipboard, release_held_modifiers, restore, send, snapshot};

const CF_UNICODETEXT: u32 = 13;

/// The window that was in front when Alt+M was pressed. Stored as isize
/// because a raw HWND pointer is not Send, and this crosses threads.
static TARGET: Mutex<isize> = Mutex::new(0);

/// Called from the hotkey handler, BEFORE the panel is shown.
pub fn remember_foreground() {
    let hwnd = unsafe { GetForegroundWindow() };
    if let Ok(mut slot) = TARGET.lock() {
        *slot = hwnd as isize;
    }
}

fn take_target() -> HWND {
    TARGET
        .lock()
        .map(|mut slot| {
            let v = *slot;
            *slot = 0;
            v as HWND
        })
        .unwrap_or(std::ptr::null_mut())
}

/// Hand focus back to the window that had it before the panel opened.
///
/// The plain call usually succeeds because we hold the last input event.
/// When Windows refuses, attaching our input queue to the target's thread
/// lifts the restriction for the duration of the call.
fn refocus(target: HWND) -> bool {
    unsafe {
        if SetForegroundWindow(target) != 0 {
            return true;
        }
        let mut target_pid = 0u32;
        let target_thread = GetWindowThreadProcessId(target, &mut target_pid);
        let ours = GetCurrentThreadId();
        if target_thread == 0 || target_thread == ours {
            return false;
        }
        AttachThreadInput(ours, target_thread, 1);
        let ok = SetForegroundWindow(target) != 0;
        SetFocus(target);
        AttachThreadInput(ours, target_thread, 0);
        ok
    }
}

fn set_clipboard_text(text: &str) -> bool {
    // UTF-16, NUL terminated, as CF_UNICODETEXT requires.
    let mut utf16: Vec<u16> = text.encode_utf16().collect();
    utf16.push(0);
    let bytes = utf16.len() * std::mem::size_of::<u16>();

    if !open_clipboard() {
        return false;
    }
    unsafe {
        EmptyClipboard();
        let mem = GlobalAlloc(GMEM_MOVEABLE, bytes);
        if mem.is_null() {
            CloseClipboard();
            return false;
        }
        let ptr = GlobalLock(mem) as *mut u16;
        if ptr.is_null() {
            CloseClipboard();
            return false;
        }
        std::ptr::copy_nonoverlapping(utf16.as_ptr(), ptr, utf16.len());
        GlobalUnlock(mem);
        let ok = !SetClipboardData(CF_UNICODETEXT, mem as _).is_null();
        CloseClipboard();
        ok
    }
}

fn send_paste() {
    send(&[key(VK_CONTROL, false), key(VK_V, false)]);
    sleep(Duration::from_millis(10));
    send(&[key(VK_V, true), key(VK_CONTROL, true)]);
}

pub enum Paste {
    Done,
    /// Focus could not be returned, so pasting would have gone nowhere — or
    /// worse, into the wrong window. The text is left on the clipboard so the
    /// user can paste it themselves.
    NoTarget,
}

/// Put `text` into whatever had focus before the panel opened.
///
/// The caller must hide the panel FIRST: while it is visible it owns the
/// foreground, and Windows will not hand it to anyone else.
pub fn paste_into_previous(text: &str) -> Paste {
    let target = take_target();
    if target.is_null() {
        // No recorded target: leave the text on the clipboard rather than
        // firing Ctrl+V blindly at whatever happens to be in front.
        set_clipboard_text(text);
        return Paste::NoTarget;
    }

    let saved = snapshot();

    if !refocus(target) {
        set_clipboard_text(text);
        return Paste::NoTarget;
    }

    // Let the target actually take focus and put a caret somewhere before
    // the keystroke lands.
    sleep(Duration::from_millis(80));

    if !set_clipboard_text(text) {
        restore(&saved);
        return Paste::NoTarget;
    }

    // Same reasoning as Alt+N: the user may still be holding Alt from the
    // hotkey, which would turn Ctrl+V into Ctrl+Alt+V.
    release_held_modifiers();
    send_paste();

    // Give the target time to read the clipboard before we take it back.
    sleep(Duration::from_millis(300));
    restore(&saved);

    Paste::Done
}
