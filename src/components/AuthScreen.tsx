import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isNative, nativeGoogleSignIn } from '../lib/nativeAuth';
import WebGoogleButton from './WebGoogleButton';
import EmailCautionModal from './EmailCautionModal';
import logoUrl from '../images/mn_logo.png';

const ERROR_MAP = {
  'Incorrect email/username or password.': 'Incorrect email/username or password.',
  'An account already exists for that email.': 'An account already exists for that email.',
  'That username is already taken.': 'That username is already taken.',
};

export default function AuthScreen() {
  const { login, register, loginWithGoogle, forgotPassword } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [forgot, setForgot] = useState(false); // showing the "email me a link" form
  const [sent, setSent] = useState(false);     // reset link requested
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleSetupNeeded, setGoogleSetupNeeded] = useState(false);
  // One-time "are you sure this address is right" gate before creating an
  // account — see EmailCautionModal for why this is a reminder, not a check.
  // Re-armed whenever the email is edited, so an acknowledgment only covers
  // the exact address it was given for.
  const [emailAcked, setEmailAcked] = useState(false);
  const [showEmailWarn, setShowEmailWarn] = useState(false);

  function onEmailChange(v) {
    setEmail(v);
    setEmailAcked(false);
  }

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

  async function onForgotSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      // The server deliberately won't say whether the address exists, so this
      // confirmation is worded to be true either way.
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function doAuth() {
    setError('');
    setBusy(true);
    try {
      if (isSignUp) await register(email.trim(), password, name.trim(), username.trim());
      else await login(email.trim(), password);
      // AuthContext flips us into the app on success.
    } catch (err) {
      setError(ERROR_MAP[err.message] || err.message);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    // Signing up: pause once per address to make sure it's really the inbox
    // they can read — the only way "Forgot password" will ever reach them.
    if (isSignUp && !emailAcked) { setShowEmailWarn(true); return; }
    doAuth();
  }

  return (
    <section className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-logo" src={logoUrl} alt="Mah Notes" />
          <h1 className="auth-name">Mah Notes</h1>
          <p className="auth-tag">Your notes, plans &amp; checklists — everywhere.</p>
        </div>

        {forgot ? (
          <form className="auth-form" onSubmit={onForgotSubmit}>
            {sent ? (
              <>
                <p className="auth-hint" style={{ textAlign: 'center' }}>
                  <i className="fas fa-envelope-circle-check" style={{ marginRight: 6 }} />
                  If that email has an account, a reset link is on its way. It expires in an hour.
                </p>
                <button type="button" className="btn btn-primary btn-block"
                  onClick={() => { setForgot(false); setSent(false); setError(''); }}>
                  Back to sign in
                </button>
              </>
            ) : (
              <>
                <p className="auth-hint">
                  Enter your email and we’ll send you a link to choose a new password.
                </p>
                {/* Shown to everyone, never conditionally — the server won't
                    reveal whether an address has an account or which sign-in it
                    uses, so this explains the "no email arrived" case without
                    leaking anything. */}
                <p className="auth-hint">
                  Signed up with Google and never set a password? There’s nothing to reset —
                  use <b>Continue with Google</b> instead.
                </p>
                <div className="field">
                  <i className="fas fa-envelope field-icon" />
                  <input type="email" className="field-input" placeholder="Email" autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                  {busy ? 'Please wait…' : 'Send reset link'}
                </button>
                <div className="auth-error">{error}</div>
                <p className="auth-toggle">
                  <a href="#" onClick={(e) => { e.preventDefault(); setForgot(false); setError(''); }}>
                    Back to sign in
                  </a>
                </p>
              </>
            )}
          </form>
        ) : (
        <>
        <form className="auth-form" onSubmit={onSubmit}>
          {isSignUp && (
            <div className="field">
              <i className="fas fa-user field-icon" />
              <input type="text" className="field-input" placeholder="Name (optional)" autoComplete="name"
                value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
          )}
          {isSignUp && (
            <div className="field">
              <i className="fas fa-at field-icon" />
              <input type="text" className="field-input" placeholder="Username (optional)" autoComplete="username"
                value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} />
            </div>
          )}
          <div className="field">
            <i className="fas fa-envelope field-icon" />
            <input type={isSignUp ? 'email' : 'text'} className="field-input"
              placeholder={isSignUp ? 'Email' : 'Email or username'}
              autoComplete={isSignUp ? 'email' : 'username'}
              value={email} onChange={(e) => onEmailChange(e.target.value)} required />
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
              <i className="fas fa-circle-info" /> Use an email you can actually access — it’s the only way to reset this password if you forget it.
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          {!isSignUp && (
            <p className="auth-toggle">
              <a href="#" onClick={(e) => { e.preventDefault(); setForgot(true); setError(''); }}>
                Forgot password?
              </a>
            </p>
          )}
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
        </>
        )}
      </div>

      {showEmailWarn && (
        <EmailCautionModal
          email={email.trim()}
          busy={busy}
          onCancel={() => setShowEmailWarn(false)}
          onConfirm={() => { setEmailAcked(true); setShowEmailWarn(false); doAuth(); }}
        />
      )}
    </section>
  );
}
