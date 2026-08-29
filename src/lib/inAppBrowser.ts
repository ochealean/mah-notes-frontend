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
