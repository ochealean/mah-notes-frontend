// ============================================================
//  In-app update check (native only).
//  The APK is distributed via GitHub Releases (not the Play Store),
//  so the app asks GitHub for the latest release and, if it's newer
//  than what's installed, offers to download + install it. The user
//  ALWAYS confirms — nothing installs on its own.
//
//  Setup: set UPDATE_REPO to the PUBLIC repo that hosts your APK
//  releases. Publish each release with a tag like "v1.2.0" and
//  attach the built app-release.apk as a release asset.
// ============================================================
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { AppLauncher } from '@capacitor/app-launcher';
import { isNative } from './nativeAuth';
import { isDesktop } from './platform';
import { APP_VERSION } from './appInfo';

const APK_MIME = 'application/vnd.android.package-archive';

// owner/repo of the public repo that holds your APK releases.
export const UPDATE_REPO = 'ochealean/mah-notes-frontend';
// /releases/latest always points at the newest build, so this never needs
// bumping per release. Shared by the Viewer's public download CTA and
// Settings → About & updates.
export const APP_DOWNLOAD_URL = `https://github.com/${UPDATE_REPO}/releases/latest`;
const AUTO_KEY = 'mahnotes:autoUpdateCheck';
const DISMISS_KEY = 'mahnotes:updateDismissedVersion'; // last version the prompt was shown for
const MUTE_KEY = 'mahnotes:updateMuted';               // user ticked "don't remind me again"

// "v1.2.0" / "1.2.0" → [1, 2, 0]; missing parts count as 0.
function parse(v) {
  return String(v || '').replace(/^v/i, '').split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
}
// 1 if a is newer than b, -1 if older, 0 if equal.
function cmp(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Auto-check is opt-out (on by default); the user can disable it in Settings.
export function autoUpdateEnabled() {
  try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch { return true; }
}
export function setAutoUpdate(on) {
  try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

// "Don't remind me again" — when on, the prompt never auto-opens; the only
// signal that an update exists is the red dot in Settings.
export function isUpdateMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export function setUpdateMuted(on) {
  try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

// Auto-open the prompt for this version? Only once per version (until a newer
// one ships) and never when muted. The red dot is shown regardless.
export function shouldAutoPrompt(version) {
  if (isUpdateMuted()) return false;
  try { return cmp(version, localStorage.getItem(DISMISS_KEY) || '0') > 0; }
  catch { return true; }
}
// Remember the prompt was shown for this version, so it won't auto-open again.
export function markUpdateDismissed(version) {
  try { localStorage.setItem(DISMISS_KEY, String(version || '')); } catch { /* ignore */ }
}

// Shared by checkForUpdate() (native, "is this newer than what's installed")
// and fetchLatestRelease() (web, "what's the direct .apk link right now") —
// same GitHub call, different question asked of the result.
async function fetchRelease() {
  try {
    const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const rel = await res.json();
    if (rel.draft || rel.prerelease) return null;
    const version = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
    if (!version) return null;
    const assets = rel.assets || [];

    // Pick by extension, but ALWAYS prefer a file whose name carries this
    // release's version.
    //
    // A release can end up holding assets from an earlier version — a failed
    // build that was retried, or files uploaded by hand. Taking the first match
    // then handed everyone the OLD installer: v2.1.2 still carried a
    // 2.1.0-setup.exe, it sorted first, and the website offered 2.1.0 while
    // claiming to be current. The in-app updater had it worse, offering an
    // "update" to the version already installed.
    const pick = (re: RegExp) => {
      const matching = assets.filter((a) => re.test(a.name || ''));
      if (!matching.length) return undefined;
      return matching.find((a) => (a.name || '').includes(version)) || matching[0];
    };

    const apk = pick(/\.apk$/i);
    // NSIS first: it installs per-user without a UAC prompt, which the MSI
    // cannot do.
    const installer = pick(/-setup\.exe$/i) || pick(/\.exe$/i) || pick(/\.msi$/i);
    return {
      version,
      notes: rel.body || '',
      apkUrl: apk?.browser_download_url || null,
      installerUrl: installer?.browser_download_url || null,
      // What THIS platform should download.
      downloadUrl: (isDesktop ? installer?.browser_download_url : apk?.browser_download_url) || null,
      htmlUrl: rel.html_url || `https://github.com/${UPDATE_REPO}/releases/latest`,
    };
  } catch {
    return null; // offline or blocked — stay silent
  }
}

// Returns { version, notes, apkUrl, htmlUrl } when a newer release exists,
// or null (already current / offline / not configured / web). Never throws.
export async function checkForUpdate() {
  // Desktop checks too now; it just installs differently (see openInBrowser).
  if (!isNative && !isDesktop) return null;
  const rel = await fetchRelease();
  if (!rel || cmp(rel.version, APP_VERSION) <= 0) return null;
  // A release with nothing for this platform is not an update we can offer.
  if (isDesktop && !rel.downloadUrl) return null;
  return rel;
}

// Web's "Get the Android app" download link needs the CURRENT latest release
// regardless of what's installed (there's nothing installed to compare
// against) — same shape as checkForUpdate()'s result, no "is it newer" gate,
// and works on web too (checkForUpdate() is native-only by design).
export async function fetchLatestRelease() {
  return fetchRelease();
}

// Reliable path: open the APK download in the REAL external browser (e.g.
// Chrome), which downloads it and lets the user tap to install. AppLauncher
// hands off to the OS's default browser app (not the in-app WebView, which
// can't complete an APK install). Falls back to window.open if needed.
export async function openInBrowser(update) {
  const url = update?.downloadUrl || update?.apkUrl || update?.htmlUrl;
  if (!url) return;
  if (isDesktop) {
    // The FALLBACK, now that installDesktopUpdate exists: hand the installer
    // to the system browser. Still needed for a build that predates the
    // updater, and for the case where the signed manifest cannot be fetched.
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch {
      try { window.open(url, '_blank'); } catch { /* nothing else to try */ }
      return;
    }
  }
  try { await AppLauncher.openUrl({ url }); }
  catch {
    try { window.open(url, '_system'); } catch { window.open(url, '_blank'); }
  }
}

// DESKTOP seamless path: Tauri fetches the signed manifest, downloads the new
// build, swaps the app and restarts it. No file for the user to find.
//
// The signature is verified against the public key baked into tauri.conf.json,
// so a tampered or unsigned build is refused rather than installed — that check
// is the entire reason this needs a signing key at all.
//
// THROWS on failure so the caller can fall back to the browser download, which
// still works and needs no key.
export async function installDesktopUpdate(onProgress) {
  if (!isDesktop) throw new Error('In-app update is desktop-only.');
  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) throw new Error('No update available.');

  let downloaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') total = event.data.contentLength || 0;
    else if (event.event === 'Progress') downloaded += event.data.chunkLength || 0;
    if (onProgress) onProgress(total ? Math.min(1, downloaded / total) : 0);
  });

  // The installer has run; restarting is what actually swaps the running app.
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

// Seamless path: download the APK inside the app, then launch Android's
// package installer (the user still taps "Install"). THROWS on any failure
// so the caller can show why and offer the browser path instead.
export async function installInApp(update) {
  if (!isNative) throw new Error('In-app install is Android-only.');
  if (!update?.apkUrl) throw new Error('No APK in this release.');
  const { path } = await Filesystem.downloadFile({
    url: update.apkUrl,
    path: `mah-notes-${update.version}.apk`,
    directory: Directory.Cache,
  });
  if (!path) throw new Error('Download returned no file path.');
  // contentType triggers the package-installer intent for the .apk.
  await FileOpener.open({ filePath: path, contentType: APK_MIME });
}
