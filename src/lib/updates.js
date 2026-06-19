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
import { isNative } from './nativeAuth.js';
import { APP_VERSION } from './appInfo.js';

// owner/repo of the public repo that holds your APK releases.
export const UPDATE_REPO = 'ochealean/mah-notes-frontend';
const AUTO_KEY = 'mahnotes:autoUpdateCheck';

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

// Returns { version, notes, apkUrl, htmlUrl } when a newer release exists,
// or null (already current / offline / not configured / web). Never throws.
export async function checkForUpdate() {
  if (!isNative) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const rel = await res.json();
    if (rel.draft || rel.prerelease) return null;
    const version = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
    if (!version || cmp(version, APP_VERSION) <= 0) return null;
    const apk = (rel.assets || []).find((a) => /\.apk$/i.test(a.name || ''));
    return {
      version,
      notes: rel.body || '',
      apkUrl: apk?.browser_download_url || null,
      htmlUrl: rel.html_url || `https://github.com/${UPDATE_REPO}/releases/latest`,
    };
  } catch {
    return null; // offline or blocked — stay silent
  }
}

// Open the download in the system browser. Android downloads the APK and
// then prompts the user to install it. Falls back to the release page.
export function startUpdate(update) {
  const url = update?.apkUrl || update?.htmlUrl;
  if (!url) return;
  try { window.open(url, '_system'); } catch { window.open(url, '_blank'); }
}
