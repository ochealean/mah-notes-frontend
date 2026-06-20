// ============================================================
//  "Connect Google" — link a Google account to the CURRENT signed-in
//  account (e.g. one created via the email/password signup form).
//  Shows a connected badge once linked. Any Google account that isn't
//  already attached to another user can be linked; once linked you
//  can't switch to a different Google account.
//
//  Web uses our own button (auth-code flow) instead of the GIS-rendered
//  <GoogleLogin> widget, which rendered unreliably and could leave a stray
//  floating "G". Native uses the system account picker.
// ============================================================
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isNative, nativeGoogleSignIn } from '../lib/nativeAuth';
import { notify } from '../lib/notify';
import WebGoogleButton from './WebGoogleButton';

export default function ConnectGoogle() {
  const { user, linkGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  // Already linked (or clearly a Google-only account: it has no password) → show a
  // connected badge, never the connect control. The `hasPassword === false` check
  // also covers older cached user objects from before `hasGoogle` existed.
  const isGoogleAccount = user.hasGoogle || user.hasPassword === false;
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

  async function linkWeb(code) {
    if (busy) return;
    setBusy(true);
    try {
      await linkGoogle({ code });
      notify('Google connected', 'success');
    } catch (err) {
      notify(err.message || 'Could not connect Google.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-card">
      <div className="settings-section-label">Google</div>
      <p className="settings-hint-text">
        Connect a Google account so you can also sign in with one tap. You can link any Google account
        that isn’t already connected to another account.
      </p>
      <div style={{ padding: '0 16px 14px' }}>
        {isNative ? (
          <button className="btn btn-google btn-block" onClick={linkNative} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect Google'}
          </button>
        ) : (
          <WebGoogleButton
            label={busy ? 'Connecting…' : 'Connect Google'}
            disabled={busy}
            onCode={linkWeb}
            onError={() => notify('Google sign-in failed.', 'error')}
          />
        )}
      </div>
    </div>
  );
}
