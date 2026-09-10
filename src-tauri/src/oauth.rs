// ============================================================
//  Google sign-in on the desktop.
//
//  The web flow redirects the page to Google and expects Google to
//  redirect back to window.location.origin. A Tauri app's origin is
//  http://tauri.localhost, which cannot be registered as an Authorized
//  redirect URI — so the web flow simply cannot work here.
//
//  The standard answer is a loopback redirect: open the SYSTEM browser
//  (not an embedded webview — Google blocks those, and the user's
//  existing Google session lives in their real browser anyway), listen
//  on 127.0.0.1 for the redirect, and read the code off the query
//  string.
//
//  Google exempts loopback addresses from its https-only rule, but the
//  exact PORT must be registered, so we try a short list and use the
//  first one free. All three must exist in the Google Cloud console.
//
//  No PKCE: the backend exchanges the code with the web client SECRET,
//  exactly as it already does for the website. Adding PKCE would mean
//  round-tripping a verifier through the backend, which is the backend
//  change this design avoids.
// ============================================================
#![cfg(desktop)]

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

/// Ports registered as Authorized redirect URIs in Google Cloud. If none are
/// free the user probably has three stuck processes, and a clear error beats
/// silently picking an unregistered port that Google would reject anyway.
const PORTS: [u16; 3] = [8765, 8766, 8767];

/// How long to wait for the user to finish in their browser before giving up
/// and releasing the port.
const TIMEOUT: Duration = Duration::from_secs(180);

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Mah Notes</title>\
<body style=\"font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#f3f2f2;color:#201e1d\">\
<div style=\"text-align:center\"><h1 style=\"font-size:20px;margin:0 0 8px\">You're signed in</h1>\
<p style=\"margin:0;color:#666\">You can close this tab and go back to Mah Notes.</p></div>";

pub struct Callback {
    pub code: String,
    pub redirect_uri: String,
}

fn bind() -> Option<(TcpListener, u16)> {
    for port in PORTS {
        if let Ok(l) = TcpListener::bind(("127.0.0.1", port)) {
            return Some((l, port));
        }
    }
    None
}

/// Pull `code` (or `error`) out of the request line: "GET /?code=... HTTP/1.1".
fn parse_query(line: &str) -> (Option<String>, Option<String>) {
    let path = line.split_whitespace().nth(1).unwrap_or("");
    let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
    let mut code = None;
    let mut error = None;
    for pair in query.split('&') {
        let Some((k, v)) = pair.split_once('=') else { continue };
        let v = percent_decode(v);
        match k {
            "code" => code = Some(v),
            "error" => error = Some(v),
            _ => {}
        }
    }
    (code, error)
}

fn percent_decode(s: &str) -> String {
    let bytes = s.replace('+', " ").into_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn respond(mut stream: TcpStream) {
    let body = DONE_PAGE.as_bytes();
    let head = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

/// Open the browser at Google's consent screen and wait for the redirect.
///
/// Blocking, so callers run it off the UI thread.
pub fn google_login(app: &tauri::AppHandle, client_id: &str) -> Result<Callback, String> {
    use tauri_plugin_opener::OpenerExt;

    if client_id.trim().is_empty() {
        return Err("No Google client ID is configured for this build.".into());
    }
    let (listener, port) = bind().ok_or_else(|| {
        format!(
            "None of the sign-in ports ({}) are free. Close whatever is using them and try again.",
            PORTS.map(|p| p.to_string()).join(", ")
        )
    })?;
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=select_account",
        urlencode(client_id),
        urlencode(&redirect_uri),
        urlencode("openid email profile"),
    );
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("Could not open your browser: {e}"))?;

    // Non-blocking accept + a deadline, so a user who abandons the browser tab
    // does not leave the port held forever.
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("Could not listen for the sign-in: {e}"))?;
    let deadline = Instant::now() + TIMEOUT;

    while Instant::now() < deadline {
        match listener.accept() {
            Ok((stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let mut reader = BufReader::new(&stream);
                let mut line = String::new();
                if reader.read_line(&mut line).is_err() {
                    continue;
                }
                let (code, error) = parse_query(&line);
                respond(stream);

                if let Some(err) = error {
                    return Err(if err == "access_denied" {
                        "Sign-in was cancelled.".into()
                    } else {
                        format!("Google returned an error: {err}")
                    });
                }
                if let Some(code) = code {
                    return Ok(Callback { code, redirect_uri });
                }
                // A favicon request or similar — keep waiting for the real one.
                continue;
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(format!("Sign-in listener failed: {e}")),
        }
    }
    Err("Sign-in timed out. Try again.".into())
}

fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
