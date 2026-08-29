// ============================================================
//  Permanently delete the account. Irreversible: notes, plans, schedules,
//  share links, and friend connections are all gone server-side once this
//  succeeds — there's no undo and no grace period (see authController.js's
//  deleteAccount for exactly what's cascaded).
//
//  Confirmation differs by account type, matching SetAccountPassword's split:
//    • has a password  → must type it (same bar as changing it).
//    • Google-only      → must type their email exactly. There's no password
//      to check, so this is a fat-finger guard, not a security boundary —
//      the authenticated session already is one.
// ============================================================
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { isNative } from '../lib/nativeAuth';
import { resetSyncForLogout } from '../lib/sync';
import { notify } from '../lib/notify';

export default function DeleteAccount() {
  const { user, deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPasswordDraft] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;
  const hasPassword = user.hasPassword !== false;
  const emailMatch = confirmText.trim().toLowerCase() === (user.email || '').toLowerCase();

  function reset() {
    setOpen(false); setError('');
    setPasswordDraft(''); setConfirmText('');
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!hasPassword && !emailMatch) return setError('Type your email exactly to confirm.');
    setBusy(true); setError('');
    try {
      await deleteAccount(hasPassword ? password : undefined);
      // Own device data stays (it's the user's regardless of the account being
      // gone); just unhook this device from an account that no longer exists.
      if (isNative) await resetSyncForLogout();
      notify('Account deleted.', 'success');
      // deleteAccount() already cleared the session — App re-renders to the
      // signed-out screen on its own once `user` goes null.
    } catch (err) {
      setError(err.message || 'Could not delete the account.');
      setBusy(false);
    }
  }

  return (
    <>
      <button className="settings-row danger" onClick={() => setOpen(true)}>
        <span><i className="fas fa-user-xmark" /> Delete account</span>
        <i className="fas fa-chevron-right" />
      </button>

      {open && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) reset(); }}>
          <div className="popup">
            <div className="popup-head">
              <h3><i className="fas fa-triangle-exclamation" style={{ color: 'var(--danger)' }} /> Delete account</h3>
              <button className="icon-btn" aria-label="Close" disabled={busy} onClick={reset}><i className="fas fa-times" /></button>
            </div>
            <p className="settings-hint-text" style={{ padding: 0, marginBottom: 14 }}>
              This permanently deletes <b>{user.email || user.username}</b> and everything in it —
              notes, weekly plans, schedules, share links, and friend connections.
              <b> This can’t be undone.</b>
              {isNative && ' Your own notes stay on this device; only the account and its synced data are removed.'}
            </p>
            <form className="auth-form" onSubmit={submit}>
              {hasPassword ? (
                <div className="field">
                  <i className="fas fa-lock field-icon" />
                  <input className="field-input" type={showPw ? 'text' : 'password'} placeholder="Current password"
                    autoComplete="current-password"
                    value={password} onChange={(e) => setPasswordDraft(e.target.value)} required autoFocus />
                  <button type="button" className="field-eye" aria-label="Show password" onClick={() => setShowPw((s) => !s)}>
                    <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              ) : (
                <div className="field">
                  <i className="fas fa-envelope field-icon" />
                  <input className="field-input" type="text" placeholder={`Type "${user.email}" to confirm`}
                    autoComplete="off" autoCapitalize="off" spellCheck={false}
                    value={confirmText} onChange={(e) => setConfirmText(e.target.value)} required autoFocus />
                </div>
              )}
              {error && <div className="auth-error">{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-block" disabled={busy} onClick={reset}>
                  Cancel
                </button>
                <button className="btn btn-block signout-remove" disabled={busy || (!hasPassword && !emailMatch)}>
                  {busy ? 'Deleting…' : 'Delete my account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
