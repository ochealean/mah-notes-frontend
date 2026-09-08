// ============================================================
//  /api/download — hands the browser the newest APK.
//
//  Why this exists rather than linking at the release asset directly:
//  github.com/<owner>/<repo>/releases/download/... is a verified Android App
//  Link. On a phone with the GitHub app installed, Android intercepts any
//  NAVIGATION to that URL and hands it to the GitHub app, which opens it in
//  its own embedded browser — where the APK download sits at 100% and never
//  finishes. (Pasting the same URL by hand works, because App Links only
//  intercept link navigations, never manually entered addresses. That
//  asymmetry is what gave the cause away.)
//
//  GitHub 302s that URL to release-assets.githubusercontent.com, which no app
//  can claim. So we follow that hop HERE, on the server, and redirect the
//  browser straight to the final host. github.com never appears in the
//  browser's navigation, so there is nothing for the GitHub app to intercept.
// ============================================================
const REPO = 'ochealean/mah-notes-frontend';
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export default async function handler(req, res) {
  try {
    const relRes = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mah-notes' },
    });
    if (!relRes.ok) throw new Error(`release lookup ${relRes.status}`);

    const rel = await relRes.json();
    const asset = (rel.assets || []).find((a) => /\.apk$/i.test(a.name || ''));
    if (!asset?.browser_download_url) throw new Error('no apk asset on latest release');

    // redirect: 'manual' so we can read the Location instead of following it —
    // we want the address, not 5.8 MB of APK through this function (which
    // would blow past the serverless response size limit anyway).
    const hop = await fetch(asset.browser_download_url, { redirect: 'manual' });
    const target = hop.headers.get('location');
    if (!target) throw new Error(`expected a redirect, got ${hop.status}`);

    // The signed CDN link is short-lived, so this must never be cached.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.writeHead(302, { Location: target });
    res.end();
  } catch (err) {
    // Never dead-end the user: fall back to the releases page, where they can
    // still grab the .apk by hand.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.writeHead(302, { Location: RELEASES_PAGE });
    res.end();
  }
}
