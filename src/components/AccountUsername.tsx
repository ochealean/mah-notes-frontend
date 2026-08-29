// ============================================================
//  Login username — an alternate handle to email for signing in. Unique
//  across all accounts; the login form accepts either one.
// ============================================================
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { notify } from '../lib/notify';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export default function AccountUsername() {
  const { user, setUsername } = useAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  function startEdit() {
    setDraft(user.username || '');
    setError('');
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const value = draft.trim().toLowerCase();
    if (!USERNAME_RE.test(value)) {
      return setError('3–20 characters: letters, numbers, "_" or "." only.');
    }
    setBusy(true); setError('');
    try {
      await setUsername(value);
      notify('Username saved.', 'success');
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Could not save that username.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="settings-row" onClick={startEdit}>
        <span><i className="fas fa-at" /> {user.username ? `@${user.username}` : 'Add a username'}</span>
        <i className="fas fa-chevron-right" />
      </button>

      {open && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div className="popup">
            <div className="popup-head">
              <h3><i className="fas fa-at" /> {user.username ? 'Change username' : 'Add a username'}</h3>
              <button className="icon-btn" aria-label="Close" disabled={busy} onClick={() => setOpen(false)}><i className="fas fa-times" /></button>
            </div>
            <p className="settings-hint-text" style={{ padding: 0, marginBottom: 14 }}>
              You can sign in with your username instead of your email. Must be unique.
            </p>
            <form className="auth-form" onSubmit={submit}>
              <div className="field">
                <i className="fas fa-at field-icon" />
                <input className="field-input" type="text" placeholder="username" autoComplete="username"
                  value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={20} required autoFocus />
              </div>
              {error && <div className="auth-error">{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-block" disabled={busy} onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary btn-block" disabled={busy}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
