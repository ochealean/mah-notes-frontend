// ============================================================
//  Account password — two modes, same underlying endpoint:
//
//  Google-only account (no passwordHash): "Set a password" so the account
//  can still sign in by email if Google sign-in ever breaks. No current
//  password to check, so the form only asks for the new one.
//
//  Account that already has a password: "Change password" — requires the
//  current password too (the server enforces this either way).
// ============================================================
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { notify } from '../lib/notify';

export default function SetAccountPassword() {
  const { user, setPassword } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPasswordDraft] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!user) return null;
  const hasPassword = user.hasPassword !== false;

  function reset() {
    setOpen(false); setError('');
    setCurrent(''); setPasswordDraft(''); setConfirm('');
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (hasPassword && !current) return setError('Enter your current password.');
    if (password.length < 6) return setError('Password should be at least 6 characters.');
    if (password !== confirm) return setError('Passwords don’t match.');
    setBusy(true); setError('');
    try {
      await setPassword(password, current);
      notify(hasPassword ? 'Password changed.' : 'Password set — you can now sign in with your email too.', 'success');
      reset();
    } catch (err) {
      setError(err.message || 'Could not save the new password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="settings-row" onClick={() => setOpen(true)}>
        <span>
          <i className={`fas ${hasPassword ? 'fa-key' : 'fa-triangle-exclamation'}`}
            style={!hasPassword ? { color: 'var(--danger)' } : undefined} />
          {hasPassword ? 'Change password' : 'Set a password'}
          {!hasPassword && <span className="update-dot" />}
        </span>
        <i className="fas fa-chevron-right" />
      </button>

      {open && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) reset(); }}>
          <div className="popup">
            <div className="popup-head">
              <h3><i className={`fas ${hasPassword ? 'fa-key' : 'fa-triangle-exclamation'}`} /> {hasPassword ? 'Change password' : 'Set a password'}</h3>
              <button className="icon-btn" aria-label="Close" disabled={busy} onClick={reset}><i className="fas fa-times" /></button>
            </div>
            <p className="settings-hint-text" style={{ padding: 0, marginBottom: 14 }}>
              {hasPassword
                ? <>Change the password for <b>{user.email}</b>.</>
                : <>Your account only signs in with Google right now. Add a password so you can also
                    sign in with <b>{user.email}</b> — a backup in case Google sign-in ever fails.</>}
            </p>
            <form className="auth-form" onSubmit={submit}>
              {hasPassword && (
                <div className="field">
                  <i className="fas fa-lock field-icon" />
                  <input className="field-input" type={showCurrent ? 'text' : 'password'} placeholder="Current password"
                    autoComplete="current-password"
                    value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
                  <button type="button" className="field-eye" aria-label="Show password" onClick={() => setShowCurrent((s) => !s)}>
                    <i className={`fas ${showCurrent ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              )}
              <div className="field">
                <i className="fas fa-lock field-icon" />
                <input className="field-input" type={showPw ? 'text' : 'password'} placeholder="New password" autoComplete="new-password"
                  value={password} onChange={(e) => setPasswordDraft(e.target.value)} required autoFocus={!hasPassword} />
                <button type="button" className="field-eye" aria-label="Show password" onClick={() => setShowPw((s) => !s)}>
                  <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
              <div className="field">
                <i className="fas fa-lock field-icon" />
                <input className="field-input" type={showConfirm ? 'text' : 'password'} placeholder="Confirm new password" autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                <button type="button" className="field-eye" aria-label="Show password" onClick={() => setShowConfirm((s) => !s)}>
                  <i className={`fas ${showConfirm ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
              {error && <div className="auth-error">{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-block" disabled={busy} onClick={reset}>
                  Cancel
                </button>
                <button className="btn btn-primary btn-block" disabled={busy}>
                  {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
