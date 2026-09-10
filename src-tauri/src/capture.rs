// ============================================================
//  Alt+N — grab the selected text without disturbing the clipboard.
//
//  Windows has no API to read another application's selection, so the
//  only route that works everywhere is to synthesise Ctrl+C and put the
//  clipboard back exactly as it was. That is how every clipboard manager
//  on Windows does this; it is inherently best-effort, and the failure
//  modes are handled explicitly rather than ignored.
//
//  The sequence:
//    1. snapshot every clipboard format we can read
//    2. record the clipboard sequence number
//    3. release the modifiers the user is PHYSICALLY holding
//    4. send Ctrl+C
//    5. poll the sequence number
//    6. unchanged  -> nothing was selected
//       changed    -> read the text, then restore the snapshot
//
//  Step 3 is not optional: the hotkey fires while Alt is still down, so
//  without it the synthetic Ctrl+C arrives as Ctrl+Alt+C and does
//  something else entirely.
//
//  Step 5 uses the sequence number rather than comparing text, because
//  copying the same text twice is indistinguishable from copying nothing.
// ============================================================
#![cfg(target_os = "windows")]

use std::ffi::c_void;
use std::thread::sleep;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, HWND};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, EnumClipboardFormats, GetClipboardData,
    GetClipboardSequenceNumber, OpenClipboard, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
    VK_C, VK_CONTROL, VK_LMENU, VK_LSHIFT, VK_LWIN, VK_RMENU, VK_RSHIFT, VK_RWIN,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

const CF_UNICODETEXT: u32 = 13;

/// How long to wait for the target app to answer Ctrl+C. Electron apps,
/// Office and remote sessions are routinely slower than the 300ms that feels
/// natural, and giving up early reports "nothing selected" for a selection
/// that really existed.
const POLL_TOTAL: Duration = Duration::from_millis(1500);
const POLL_STEP: Duration = Duration::from_millis(15);

pub enum Capture {
    /// Text was copied. The clipboard has been restored.
    Got { text: String, source: String },
    /// The clipboard never changed: nothing was selected, or the app does
    /// not implement Ctrl+C. Indistinguishable, and honestly reported as one.
    NothingSelected,
    /// The foreground window belongs to a process we cannot send input to,
    /// which in practice means it is running as administrator.
    Blocked,
}

// ── clipboard snapshot ───────────────────────────────────

pub(crate) struct Blob {
    pub(crate) format: u32,
    pub(crate) bytes: Vec<u8>,
}

/// Open the clipboard, retrying: another process can hold the lock, and a
/// clipboard manager reacting to the same keystroke very often does.
pub(crate) fn open_clipboard() -> bool {
    for _ in 0..12 {
        if unsafe { OpenClipboard(std::ptr::null_mut()) } != 0 {
            return true;
        }
        sleep(Duration::from_millis(20));
    }
    false
}

/// Copy every readable format out of the clipboard.
///
/// Formats backed by delayed rendering hand back a null handle and simply
/// cannot be snapshotted; they are skipped rather than faked.
pub(crate) fn snapshot() -> Vec<Blob> {
    let mut out = Vec::new();
    if !open_clipboard() {
        return out;
    }
    unsafe {
        let mut format = EnumClipboardFormats(0);
        while format != 0 {
            let handle = GetClipboardData(format);
            if !handle.is_null() {
                let size = GlobalSize(handle as *mut c_void);
                if size > 0 {
                    let ptr = GlobalLock(handle as *mut c_void) as *const u8;
                    if !ptr.is_null() {
                        out.push(Blob {
                            format,
                            bytes: std::slice::from_raw_parts(ptr, size).to_vec(),
                        });
                        GlobalUnlock(handle as *mut c_void);
                    }
                }
            }
            format = EnumClipboardFormats(format);
        }
        CloseClipboard();
    }
    out
}

/// Put a snapshot back. Called after the text has been read, with a short
/// delay beforehand so clipboard managers finish their own read of our
/// synthetic copy instead of racing us.
pub(crate) fn restore(blobs: &[Blob]) {
    if blobs.is_empty() || !open_clipboard() {
        return;
    }
    unsafe {
        EmptyClipboard();
        for blob in blobs {
            let mem = GlobalAlloc(GMEM_MOVEABLE, blob.bytes.len());
            if mem.is_null() {
                continue;
            }
            let ptr = GlobalLock(mem) as *mut u8;
            if ptr.is_null() {
                continue;
            }
            std::ptr::copy_nonoverlapping(blob.bytes.as_ptr(), ptr, blob.bytes.len());
            GlobalUnlock(mem);
            // Ownership passes to the clipboard on success, so this memory is
            // deliberately not freed here.
            if SetClipboardData(blob.format, mem as HANDLE).is_null() {
                // Failed: the clipboard did not take it, so it is ours to drop.
                // GlobalFree is omitted on purpose — leaking one small block on
                // a rare failure is safer than freeing something the clipboard
                // may already own.
            }
        }
        CloseClipboard();
    }
}

fn read_text() -> Option<String> {
    if !open_clipboard() {
        return None;
    }
    let mut text = None;
    unsafe {
        let handle = GetClipboardData(CF_UNICODETEXT);
        if !handle.is_null() {
            let ptr = GlobalLock(handle as *mut c_void) as *const u16;
            if !ptr.is_null() {
                let mut len = 0usize;
                while *ptr.add(len) != 0 {
                    len += 1;
                }
                text = String::from_utf16(std::slice::from_raw_parts(ptr, len)).ok();
                GlobalUnlock(handle as *mut c_void);
            }
        }
        CloseClipboard();
    }
    text
}

// ── synthetic keystrokes ─────────────────────────────────

pub(crate) fn key(vk: u16, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

pub(crate) fn send(inputs: &[INPUT]) {
    unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        );
    }
}

fn is_down(vk: u16) -> bool {
    (unsafe { GetAsyncKeyState(vk as i32) } as u16 & 0x8000) != 0
}

/// The hotkey fires while Alt is still physically down. Lift every modifier
/// the user is holding, or our Ctrl+C is delivered as Ctrl+Alt+C. We do not
/// press them again: the user releases them a moment later themselves.
pub(crate) fn release_held_modifiers() {
    let mut ups = Vec::new();
    for vk in [VK_LMENU, VK_RMENU, VK_LSHIFT, VK_RSHIFT, VK_LWIN, VK_RWIN] {
        if is_down(vk) {
            ups.push(key(vk, true));
        }
    }
    if !ups.is_empty() {
        send(&ups);
        sleep(Duration::from_millis(30));
    }
}

fn send_copy() {
    send(&[key(VK_CONTROL, false), key(VK_C, false)]);
    sleep(Duration::from_millis(10));
    send(&[key(VK_C, true), key(VK_CONTROL, true)]);
}

// ── which app was in front ───────────────────────────────

/// The executable's file name, e.g. "chrome.exe" -> "Chrome". The Android
/// side fills the same `source` field with an app label, and the Clips list
/// renders it the same way.
fn foreground_source(hwnd: HWND) -> String {
    if hwnd.is_null() {
        return String::new();
    }
    unsafe {
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return String::new();
        }
        let proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if proc.is_null() {
            return String::new();
        }
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(proc, PROCESS_NAME_WIN32, buf.as_mut_ptr(), &mut len);
        CloseHandle(proc);
        if ok == 0 || len == 0 {
            return String::new();
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        let file = path.rsplit(['\\', '/']).next().unwrap_or("");
        let stem = file.strip_suffix(".exe").unwrap_or(file);
        if stem.is_empty() {
            return String::new();
        }
        // "chrome" -> "Chrome". Good enough, and it matches how the Android
        // labels read in the same list.
        let mut chars = stem.chars();
        match chars.next() {
            Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            None => String::new(),
        }
    }
}

/// True when we cannot send input to the foreground window, which on Windows
/// means it is elevated and we are not. Worth distinguishing: reporting
/// "nothing selected" there would send people hunting for a bug that is
/// actually a permission boundary.
fn foreground_is_blocked(hwnd: HWND) -> bool {
    if hwnd.is_null() {
        return false;
    }
    unsafe {
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return false;
        }
        let proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if proc.is_null() {
            // Cannot even query it: almost always an elevated process.
            return true;
        }
        CloseHandle(proc);
        false
    }
}

// ── the whole dance ──────────────────────────────────────

pub fn capture_selection() -> Capture {
    let hwnd = unsafe { GetForegroundWindow() };
    if foreground_is_blocked(hwnd) {
        return Capture::Blocked;
    }

    let saved = snapshot();
    let before = unsafe { GetClipboardSequenceNumber() };

    release_held_modifiers();
    send_copy();

    // Poll rather than sleeping a fixed amount: a fast app answers in 30ms and
    // should not cost the user a second of latency.
    let deadline = Instant::now() + POLL_TOTAL;
    let mut changed = false;
    while Instant::now() < deadline {
        sleep(POLL_STEP);
        if unsafe { GetClipboardSequenceNumber() } != before {
            changed = true;
            break;
        }
    }

    if !changed {
        return Capture::NothingSelected;
    }

    let text = read_text().unwrap_or_default();

    // Let anything else watching the clipboard settle before we put the old
    // contents back, otherwise we race their read of our synthetic copy.
    sleep(Duration::from_millis(60));
    restore(&saved);

    let trimmed = text.trim();
    if trimmed.is_empty() {
        // The clipboard changed but holds no text — an image, or a format we
        // cannot use. Nothing to save.
        return Capture::NothingSelected;
    }

    Capture::Got {
        text: trimmed.to_string(),
        source: foreground_source(hwnd),
    }
}
