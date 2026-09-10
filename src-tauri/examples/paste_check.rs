// Exercises the Alt+M paste path without the hotkey or the panel: remember a
// window, then put text back into it. Same reason as capture_check —
// synthetic keystrokes do not reliably trigger a registered global hotkey,
// so automating the hotkey tests the harness rather than the code.
#[cfg(target_os = "windows")]
fn main() {
    use mah_notes_lib::paste::{paste_into_previous, remember_foreground, Paste};
    use std::{thread::sleep, time::Duration};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};

    let wait: u64 = std::env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(5);
    let text = std::env::args().nth(2).unwrap_or_else(|| "PASTED-BY-MAH-NOTES".into());

    for i in (1..=wait).rev() {
        println!("remembering target in {i}...");
        sleep(Duration::from_secs(1));
    }

    unsafe {
        let hwnd = GetForegroundWindow();
        let mut buf = [0u16; 256];
        let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        println!("TARGET: {}", String::from_utf16_lossy(&buf[..len.max(0) as usize]));
    }

    // This is what the hotkey handler does before showing the panel.
    remember_foreground();
    // Stand in for the user reading the panel and pressing Enter.
    sleep(Duration::from_millis(800));

    match paste_into_previous(&text) {
        Paste::Done => println!("RESULT: DONE"),
        Paste::NoTarget => println!("RESULT: NO_TARGET"),
    }
}

#[cfg(not(target_os = "windows"))]
fn main() { println!("windows only"); }
