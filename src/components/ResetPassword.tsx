// ============================================================
//  Landing page for the emailed reset link (/reset-password?token=…).
//  Swaps the one-time token for a new password; the server signs the user
//  in on success, so we land straight in the app.
// ============================================================
import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logoUrl from '../images/mn_logo.png';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('The two passwords don’t match.'); return; }
    if (password.length < 6) { setError('Password should be at least 6 characters.'); return; }
    setBusy(true);
    try {
      await resetPassword(token, password);
      navigate('/', { replace: true }); // signed in by the reset response
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // A link with no token at all — nothing to do but send them back.
  if (!token) {
    return (
      <section className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            <img className="auth-logo" src={logoUrl} alt="Mah Notes" />
            <h1 className="auth-name">Mah Notes</h1>
          </div>
          <p className="auth-hint" style={{ textAlign: 'center' }}>
            This reset link is missing its token. Request a new one from the sign-in screen.
          </p>
          <p className="auth-toggle"><Link to="/">Back to sign in</Link></p>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <img className="auth-logo" src={logoUrl} alt="Mah Notes" />
          <h1 className="auth-name">Choose a new password</h1>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <i className="fas fa-lock field-icon" />
            <input type={showPw ? 'text' : 'password'} className="field-input" placeholder="New password"
              autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="field-eye" aria-label="Show password" onClick={() => setShowPw((s) => !s)}>
              <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </div>
          <div className="field">
            <i className="fas fa-lock field-icon" />
            <input type={showPw ? 'text' : 'password'} className="field-input" placeholder="Confirm new password"
              autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : 'Set new password'}
          </button>
          <div className="auth-error">{error}</div>
        </form>

        <p className="auth-toggle"><Link to="/">Back to sign in</Link></p>
      </div>
    </section>
  );
}
