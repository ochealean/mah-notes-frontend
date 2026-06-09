import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext.jsx';

const ERROR_MAP = {
  'Incorrect email or password.': 'Incorrect email or password.',
  'An account already exists for that email.': 'An account already exists for that email.',
};

export default function AuthScreen() {
  const { login, register, loginWithGoogle } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isSignUp) await register(email.trim(), password);
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
          <div className="auth-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--grad-primary)', color: '#fff', fontSize: 34 }}>
            <i className="fas fa-feather-pointed" />
          </div>
          <h1 className="auth-name">Mah Notes</h1>
          <p className="auth-tag">Your notes, plans &amp; checklists — everywhere.</p>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
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
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          <div className="auth-error">{error}</div>
        </form>

        <div className="auth-divider"><span>or</span></div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={async (cred) => {
              setError('');
              try { await loginWithGoogle(cred.credential); }
              catch (err) { setError(err.message); }
            }}
            onError={() => setError('Google sign-in failed.')}
            useOneTap={false}
          />
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
