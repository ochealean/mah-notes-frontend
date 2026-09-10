// Exercises the Alt+N capture path WITHOUT the hotkey, because synthetic
// keystrokes do not reliably trigger a RegisterHotKey shortcut, which makes
// end-to-end automation of the hotkey unreliable rather than the code wrong.
//
// Prints the foreground window at capture time, so a failure tells you whether
// the code is wrong or the test simply pointed it at the wrong window.
#[cfg(target_os = "windows")]
fn main() {
    use mah_notes_lib::capture::{capture_selection, Capture};
    use std::{thread::sleep, time::Duration};
    use windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};

    let wait: u64 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(4);

    for i in (1..=wait).rev() {
        println!("capturing in {i}...");
        sleep(Duration::from_secs(1));
    }

    unsafe {
        let hwnd = GetForegroundWindow();
        let mut buf = [0u16; 256];
        let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        let title = String::from_utf16_lossy(&buf[..len.max(0) as usize]);
        println!("FOREGROUND: {title}");
        println!("SEQ_BEFORE: {}", GetClipboardSequenceNumber());
    }

    match capture_selection() {
        Capture::Got { text, source } => {
            println!("RESULT: GOT");
            println!("SOURCE: {source}");
            println!("TEXT: {text}");
        }
        Capture::NothingSelected => println!("RESULT: NOTHING_SELECTED"),
        Capture::Blocked => println!("RESULT: BLOCKED"),
    }

    unsafe {
        println!("SEQ_AFTER: {}", GetClipboardSequenceNumber());
    }
}

#[cfg(not(target_os = "windows"))]
fn main() {
    println!("windows only");
}
