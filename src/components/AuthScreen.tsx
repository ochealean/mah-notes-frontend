import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isNative, nativeGoogleSignIn } from '../lib/nativeAuth';
import WebGoogleButton from './WebGoogleButton';
import logoUrl from '../images/mn_logo.png';

const ERROR_MAP = {
  'Incorrect email or password.': 'Incorrect email or password.',
  'An account already exists for that email.': 'An account already exists for that email.',
};

export default function AuthScreen() {
  const { login, register, loginWithGoogle } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleSetupNeeded, setGoogleSetupNeeded] = useState(false);

  // The native Google plugin is initialised lazily inside nativeGoogleSignIn()
  // on the actual sign-in tap. We deliberately do NOT warm it up on mount —
  // eager init can leave Google's One Tap "Sign in" button rendered in a corner.

  async function onNativeGoogle() {
    setError('');
    setBusy(true);
    try {
      const idToken = await nativeGoogleSignIn();
      await loginWithGoogle(idToken);
    } catch (err) {
      const msg = String(err?.message || '');
      if (/cancel|dismiss|closed/i.test(msg)) {
        // User backed out of the account picker — not an error.
      } else if (/developer|credential|10:|16:|unregistered|sha|audience|client|configuration|not.*config/i.test(msg)) {
        // Android OAuth client / SHA-1 not registered yet (or still propagating).
        setGoogleSetupNeeded(true);
        setError('Google sign-in isn’t set up for this build yet.');
      } else {
        setError(msg || 'Google sign-in failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isSignUp) await register(email.trim(), password, name.trim());
      else await login(email.trim(), password);
      // AuthContext flips us into the app on success.
    } catch (err) {
      setError(ERROR_MAP[err.message] || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-logo" src={logoUrl} alt="Mah Notes" />
          <h1 className="auth-name">Mah Notes</h1>
          <p className="auth-tag">Your notes, plans &amp; checklists — everywhere.</p>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          {isSignUp && (
            <div className="field">
              <i className="fas fa-user field-icon" />
              <input type="text" className="field-input" placeholder="Name (optional)" autoComplete="name"
                value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
          )}
          <div className="field">
            <i className="fas fa-envelope field-icon" />
            <input type="email" className="field-input" placeholder="Email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <i className="fas fa-lock field-icon" />
            <input type={showPw ? 'text' : 'password'} className="field-input" placeholder="Password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="field-eye" aria-label="Show password" onClick={() => setShowPw((s) => !s)}>
              <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </div>
          {isSignUp && (
            <p className="signup-warn">
              <i className="fas fa-triangle-exclamation" /> There’s no password reset — if you forget this password, the account <b>can’t be recovered</b>. Save it somewhere safe (or use Google instead).
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          <div className="auth-error">{error}</div>
        </form>

        <div className="auth-divider"><span>or</span></div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {isNative ? (
            // Native Android: web GIS popups are blocked in a WebView, so use
            // the native Google account picker instead.
            <div style={{ width: '100%' }}>
              <button type="button" className="btn btn-google btn-block" onClick={onNativeGoogle}
                disabled={busy || googleSetupNeeded}>
                Continue with Google
              </button>
              {googleSetupNeeded && (
                <p className="auth-hint">
                  Needs one-time Android OAuth setup (package + SHA-1). Sign in with email &amp; password for now.
                </p>
              )}
            </div>
          ) : (
            <div style={{ width: '100%' }}>
              {/* Redirect flow: navigates to Google; AuthContext finishes on return. */}
              <WebGoogleButton intent="login" disabled={busy} />
            </div>
          )}
        </div>

        <p className="auth-toggle">
          <span>{isSignUp ? 'Already have an account?' : "Don't have an account?"}</span>{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); setIsSignUp((s) => !s); setError(''); }}>
            {isSignUp ? 'Sign in' : 'Sign up'}
          </a>
        </p>
      </div>
    </section>
  );
}
