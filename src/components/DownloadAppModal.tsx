// ============================================================
//  "Get the Android app" — shown from Settings → About & updates (web only).
//  Two paths:
//    • Download   → the current latest release's .apk, fetched fresh so it's
//                    never a stale/hardcoded version.
//    • View versions → the full GitHub Releases list, for picking an older
//                    build or reading release notes before installing.
// ============================================================
import { useEffect, useState } from 'react';
import { UPDATE_REPO, fetchLatestRelease } from '../lib/updates';
import { isInAppBrowser } from '../lib/inAppBrowser';

const RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`;

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
  const inApp = isInAppBrowser();

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-mobile-screen-button" /> Get the Android app</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        {inApp && (
          <p className="signup-warn">
            <i className="fas fa-triangle-exclamation" /> You’re viewing this inside another app’s built-in browser
            (e.g. Messenger, Instagram). Downloads often get stuck at 100% there and never finish. Open the <b>⋮</b> or{' '}
            <b>···</b> menu and choose <b>“Open in Chrome”</b> (or your browser) first, then come back and download.
          </p>
        )}

        <p className="reconcile-intro">
          {loading
            ? 'Checking the latest release…'
            : release
              ? <>Latest version: <b>{release.version}</b>. Downloads as an APK — Android may ask you to allow installs from your browser the first time.</>
              : 'Downloads as an APK — Android may ask you to allow installs from your browser the first time.'}
        </p>

        {/* NO target="_blank" — deliberate. The asset responds with
            Content-Disposition: attachment, so a SAME-TAB navigation starts the
            download and leaves this page exactly where it is. Opening it in a
            fresh blank tab instead is what made Android Chrome sit at
            "100% / 5.80 MB of 5.80 MB" forever until the user manually
            refreshed — the new tab has no page to fall back to and never
            finalises the handoff to the download manager. */}
        <a
          className="btn btn-primary btn-block"
          href={downloadUrl}
          {...(isDirectApk ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          onClick={onClose}
        >
          <i className="fas fa-download" /> Download
        </a>
        <a className="btn btn-ghost btn-block" style={{ marginTop: 9 }} href={RELEASES_URL} target="_blank" rel="noopener noreferrer" onClick={onClose}>
          <i className="fas fa-list" /> View versions
        </a>
      </div>
    </div>
  );
}
