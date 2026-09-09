// ============================================================
//  /download — the tab the "Download" button opens.
//
//  Why a page instead of linking straight at the .apk: pointing a NEW tab at
//  the asset URL opens a tab with no document in it. Android then has nothing
//  to fall back to when it hands the transfer to the download manager, and the
//  bar sits at "5.81 MB / 5.81 MB" forever. Pasting the same URL into the
//  address bar works precisely because that tab ends up with a real page.
//
//  So: render a real page first, let it paint, THEN start the transfer. The
//  tab keeps this document, the download completes against it, and there's a
//  visible manual link if the automatic start is blocked.
// ============================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UPDATE_REPO, fetchLatestRelease } from '../lib/updates';
import logoUrl from '../images/mn_logo.png';

const RELEASES_URL = `https://github.com/${UPDATE_REPO}/releases`;
// Same-origin on purpose. It 302s to release-assets.githubusercontent.com,
// so the browser never navigates to github.com — which is a verified Android
// App Link that the GitHub app steals into its own embedded browser, where
// the download stalls at 100%. See api/download.js.
const APK_ENDPOINT = '/api/download';

export default function DownloadPage() {
  // undefined = still asking GitHub, null = asked and failed.
  const [release, setRelease] = useState(undefined as any);

  useEffect(() => {
    let cancelled = false;
    let timer;
    (async () => {
      const rel = await fetchLatestRelease();
      if (cancelled) return;
      setRelease(rel || null);
      if (!rel?.apkUrl) return;
      // Wait for this document to actually be on screen before navigating.
      // Two rAFs put us after the first paint; the timeout is the belt-and-
      // braces version for browsers that throttle rAF in a fresh tab.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        timer = setTimeout(() => {
          if (!cancelled) window.location.href = APK_ENDPOINT;
        }, 350);
      }));
    })();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const loading = release === undefined;
  const apkUrl = release?.apkUrl;

  return (
    <div className="view-page">
      <div className="view-bar">
        <img className="view-logo" src={logoUrl} alt="" />
        <span className="logo">Mah Notes</span>
      </div>
      <div className="v-card">
        <div className="empty-state">
          <i className={`fas ${loading ? 'fa-circle-notch fa-spin' : apkUrl ? 'fa-download' : 'fa-triangle-exclamation'}`} />
          <h2 style={{ marginBottom: 8, color: 'var(--dark)' }}>
            {loading ? 'Getting the latest version…' : apkUrl ? 'Your download is starting' : 'Couldn’t reach GitHub'}
          </h2>
          <p>
            {loading
              ? 'One moment.'
              : apkUrl
                ? <>Version <b>{release.version}</b> · keep this tab open until it finishes. Android may ask you to allow installs from your browser the first time.</>
                : 'The releases page has every build — grab the .apk from the newest one.'}
          </p>

          {apkUrl && (
            <a className="btn btn-primary btn-block" style={{ marginTop: 18 }} href={APK_ENDPOINT}>
              <i className="fas fa-download" /> Tap here if it didn’t start
            </a>
          )}
          {release === null && (
            <a className="btn btn-primary btn-block" style={{ marginTop: 18 }} href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
              <i className="fas fa-list" /> Open releases
            </a>
          )}

          <Link className="btn btn-ghost btn-block" style={{ marginTop: 9 }} to="/">
            <i className="fas fa-arrow-left" /> Back to Mah Notes
          </Link>
        </div>
      </div>
    </div>
  );
}
