// ============================================================
//  Which kind of machine is reading this page.
//
//  Used only to decide which downloads to offer. A phone cannot run the
//  Windows installer, so offering it there is noise; a desktop visitor
//  may well want the APK for their phone, so both belong there.
//
//  Sniffing the user agent is unreliable in general, but the cost of
//  being wrong here is one extra or one missing button on a download
//  card, which is proportionate. `maxTouchPoints` catches the iPad,
//  which reports a desktop Safari UA and would otherwise look like a Mac.
// ============================================================
function ua() {
  try { return navigator.userAgent || ''; } catch { return ''; }
}

export function isMobileBrowser() {
  const s = ua();
  if (/Android|iPhone|iPod|IEMobile|Opera Mini|Windows Phone/i.test(s)) return true;
  if (/iPad/i.test(s)) return true;
  // iPadOS 13+ masquerades as desktop Safari; touch points give it away.
  try {
    if (/Macintosh/i.test(s) && navigator.maxTouchPoints > 1) return true;
  } catch { /* older browsers */ }
  return false;
}

export function isWindowsBrowser() {
  // "Windows Phone" contains "Windows" but is not a desktop.
  const s = ua();
  return /Windows NT/i.test(s) && !/Windows Phone/i.test(s);
}
