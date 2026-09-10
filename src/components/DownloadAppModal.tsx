// ============================================================
//  "Get the app" — shown from Settings → About & updates (web only).
//
//  One release carries every platform's build, so this offers whichever
//  ones are actually attached: the Android .apk and the Windows
//  installer. Both are read from the latest release rather than
//  hardcoded, so neither can go stale.
//
//  A phone is offered the APK alone — it cannot run a Windows installer,
//  so the second button would only be noise. A desktop gets both, since
//  someone at a computer may well be fetching the app for their phone,
//  with Windows first when that is what they are running.
// ============================================================
import { useEffect, useState } from 'react';
import { UPDATE_REPO, fetchLatestRelease } from '../lib/updates';
import { isInAppBrowser } from '../lib/inAppBrowser';
import { isMobileBrowser, isWindowsBrowser } from '../lib/deviceKind';

const RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`;

const onMobile = isMobileBrowser();
const onWindows = isWindowsBrowser();

export default function DownloadAppModal({ onClose }) {
  const [release, setRelease] = useState(null); // undefined while loading, null on failure
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rel = await fetchLatestRelease();
      if (!cancelled) { setRelease(rel); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // No direct .apk link (offline, GitHub unreachable, or the release just
  // doesn't have one attached) → the releases page is still a safe fallback,
  // since users can grab any asset from there themselves.
  const downloadUrl = release?.apkUrl || RELEASES_URL;
  // A real .apk responds with Content-Disposition: attachment, so same-tab is
  // safe AND is the reliable path (see the comment on the link below). The
  // fallback releases PAGE is an ordinary document though — navigating the
  // current tab there would kick the user out of the app, so that one still
  // opens in a new tab.
  const isDirectApk = !!release?.apkUrl;
  const installerUrl = release?.installerUrl || null;
  const inApp = isInAppBrowser();

  // The Windows installer is an ordinary download; none of the APK's
  // new-tab handling applies, so a plain link is right.
  const windowsBtn = installerUrl && !onMobile ? (
    <a
      className={`btn btn-block ${onWindows ? 'btn-primary' : 'btn-ghost'}`}
      style={onWindows ? undefined : { marginTop: 9 }}
      href={installerUrl}
      onClick={onClose}
    >
      <i className="fab fa-windows" /> Download for Windows
    </a>
  ) : null;

  const androidBtn = (
    <a
      className={`btn btn-block ${onWindows ? 'btn-ghost' : 'btn-primary'}`}
      style={onWindows && installerUrl ? { marginTop: 9 } : undefined}
      href={isDirectApk ? '/download' : downloadUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClose}
    >
      <i className="fab fa-android" /> Download for Android
    </a>
  );

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-download" /> Get the app</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        {inApp && (
          <p className="signup-warn">
            <i className="fas fa-triangle-exclamation" /> You’re viewing this inside another app’s built-in browser
            (e.g. Messenger, Instagram). Downloads often get stuck at 100% there and never finish. Open the <b>⋮</b> or{' '}
            <b>···</b> menu and choose <b>“Open in Chrome”</b> (or your browser) first, then come back and download.
          </p>
        )}

        {/* Only mention Windows where a Windows download is actually on offer. */}
        <p className="reconcile-intro">
          {loading
            ? 'Checking the latest release…'
            : <>
                {release && <>Latest version: <b>{release.version}</b>. </>}
                Android installs from an APK, so it may ask you to allow installs from your browser the first time.
                {windowsBtn && ' Windows installs per-user, with no admin prompt.'}
              </>}
        </p>

        {/* The Android link goes via /download, which paints a real page and
            THEN starts the transfer. Pointing a new tab straight at the .apk is
            what sat at "5.81 MB / 5.81 MB" forever: that tab holds no document,
            so Android never finalises the handoff to the download manager.
            Pasting the same URL by hand works because that tab does end up with
            a page. */}
        {onWindows ? <>{windowsBtn}{androidBtn}</> : <>{androidBtn}{windowsBtn}</>}
        <a className="btn btn-ghost btn-block" style={{ marginTop: 9 }} href={RELEASES_URL} target="_blank" rel="noopener noreferrer" onClick={onClose}>
          <i className="fas fa-list" /> View versions
        </a>

      </div>
    </div>
  );
}
