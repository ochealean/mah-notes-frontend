// ============================================================
//  "Connect Google" — link a Google account to the CURRENT signed-in
//  account (e.g. one created via the email/password signup form).
//  Shows a connected badge once linked. Any Google account that isn't
//  already attached to another user can be linked; once linked you
//  can't switch to a different Google account.
// ============================================================
import { useEffect, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { isNative, nativeGoogleSignIn } from '../lib/nativeAuth';
import { notify } from '../lib/notify';

// Google's Identity (GIS) script injects iframes into <body> for both the One Tap
// prompt AND the rendered "Sign in with Google" button. When <GoogleLogin> mounts
// briefly (e.g. on first paint, before /me confirms the account is already linked)
// and then unmounts, GIS does NOT clean up its injected iframe — it's left pinned
// in a screen corner as a stray, clickable green "G". We remove every GIS-injected
// node here. This is the real fix; the CSS rule in app.css is a backstop.
function purgeGoogleIdentityNodes() {
  const sel = [
    '#credential_picker_container',
    '#credential_picker_iframe',
    'div[id^="credential_picker"]',
    'iframe[src*="accounts.google.com/gsi"]',
    'iframe[title="Sign in with Google Button"]',
    'iframe[id^="gsi_"]',
    'div[aria-labelledby="button-label"]',
  ].join(',');
  document.querySelectorAll(sel).forEach((el) => {
    // Remove the iframe and its wrapping container if GIS added one.
    const host = el.closest('div[style*="position: absolute"], div[style*="position:fixed"]');
    (host && host !== document.body ? host : el).remove();
  });
}

export default function ConnectGoogle() {
  const { user, linkGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  // Already linked (or clearly a Google-only account: it has no password) → show a
  // connected badge, never the connect control. The `hasPassword === false` check
  // also covers older cached user objects from before `hasGoogle` existed, so a
  // Google sign-up never sees a stray "Connect Google" button.
  const isGoogleAccount = !!user && (user.hasGoogle || user.hasPassword === false);

  // For a connected account we never render <GoogleLogin>, so sweep away any GIS
  // iframe it may have injected on an earlier render (the stray floating green G).
  useEffect(() => {
    if (!isGoogleAccount) return;
    purgeGoogleIdentityNodes();
    const t1 = setTimeout(purgeGoogleIdentityNodes, 300);
    const t2 = setTimeout(purgeGoogleIdentityNodes, 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isGoogleAccount]);

  if (!user) return null;
  if (isGoogleAccount) {
    return (
      <div className="settings-card">
        <div className="settings-section-label">Google</div>
        <div className="settings-row" style={{ cursor: 'default' }}>
          <span><i className="fab fa-google" style={{ color: '#4285F4' }} /> Connected to Google</span>
          <i className="fas fa-circle-check" style={{ color: 'var(--success)' }} />
        </div>
      </div>
    );
  }

  async function linkNative() {
    if (busy) return;
    setBusy(true);
    try {
      const idToken = await nativeGoogleSignIn();
      await linkGoogle(idToken);
      notify('Google connected', 'success');
    } catch (err) {
      const m = String(err?.message || '');
      if (!/cancel|dismiss|closed/i.test(m)) notify(m || 'Could not connect Google.', 'error');
    } finally {
      setBusy(false);
    }
  }

  // Only the web path renders the GIS <GoogleLogin> widget, and ONLY once we're
  // certain this is a password account that isn't linked yet. While the account
  // flags are still unknown (e.g. a cached user from before they existed) we render
  // nothing Google-interactive — that's what prevents the widget mounting then
  // unmounting and leaving a stray floating "G".
  const canShowWebConnect = !isNative && user.hasPassword === true && user.hasGoogle === false;

  return (
    <div className="settings-card">
      <div className="settings-section-label">Google</div>
      <p className="settings-hint-text">
        Connect a Google account so you can also sign in with one tap. You can link any Google account
        that isn’t already connected to another account.
      </p>
      <div style={{ padding: '0 16px 14px', position: 'relative' }}>
        {isNative ? (
          <button className="btn btn-google btn-block" onClick={linkNative} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect Google'}
          </button>
        ) : canShowWebConnect ? (
          // Keep the Google widget inside this card; without an explicit container
          // it can render as a stray floating icon in the page corner.
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <GoogleLogin
              onSuccess={async (cred) => {
                try { await linkGoogle(cred.credential); notify('Google connected', 'success'); }
                catch (err) { notify(err.message || 'Could not connect Google.', 'error'); }
              }}
              onError={() => notify('Google sign-in failed.', 'error')}
              useOneTap={false}
              text="continue_with"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
