// ============================================================
//  Detects the common "in-app browser" WebViews (Messenger, Instagram,
//  Facebook, TikTok, Line, WeChat, Twitter/X, Snapchat) that a link opens
//  into when tapped from inside those apps.
//
//  Why this matters: on Android, these embedded browsers frequently can't
//  complete a file download — the APK download bar sits at 100% forever and
//  never finishes writing to storage. It's a limitation of the embedding
//  app's WebView, not of the link or server. The fix is always the same:
//  the embedding app's own menu has an "Open in Chrome/Browser" option that
//  hands the page to the real browser, which downloads normally.
//
//  This is a heuristic on the user agent string — in-app browsers don't
//  advertise themselves consistently, so this can't be exhaustive, but it
//  catches the large majority of real traffic.
// ============================================================
const SIGNATURES = [
  // Every Android WebView tags itself "; wv)" in the UA, whichever app is
  // embedding it. This catches the long tail the named checks below miss —
  // Discord, Reddit, Slack, Gmail, LinkedIn, and anything else that opens
  // links internally — so a user in an unlisted app still gets warned.
  /;\s*wv[;)]/i,
  /FBAN|FBAV|FB_IAB/i,     // Facebook / Messenger
  /Instagram/i,
  /Line\//i,
  /MicroMessenger/i,       // WeChat
  /Twitter/i,
  /TikTok|musical_ly|BytedanceWebview/i,
  /Snapchat/i,
  /GSA\/[\d.]+/i,          // Google app's embedded browser (Discover feed links)
];

export function isInAppBrowser() {
  try {
    return SIGNATURES.some((re) => re.test(navigator.userAgent || ''));
  } catch {
    return false;
  }
}

export function isAndroid() {
  try { return /Android/i.test(navigator.userAgent || ''); } catch { return false; }
}

// Hand a URL to real Chrome, escaping whatever WebView we're trapped in.
// Android resolves an "intent://" navigation against the named package, so
// this opens Chrome proper — the one browser we know finishes an APK
// download — and falls back to the plain https URL if Chrome isn't installed.
//
// This exists because detection can never be complete: a Chrome Custom Tab is
// byte-for-byte identical to Chrome in the UA, so isInAppBrowser() cannot see
// it, yet it stalls downloads the same way. So the escape hatch is offered
// unconditionally rather than only when the sniff above fires.
export function chromeIntentUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    return `intent://${u.host}${u.pathname}${u.search}`
      + '#Intent;scheme=https;package=com.android.chrome'
      + `;S.browser_fallback_url=${encodeURIComponent(url)};end`;
  } catch {
    return null;
  }
}
