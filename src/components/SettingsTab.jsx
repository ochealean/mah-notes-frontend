import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { isNative, nativeGoogleSignIn } from '../lib/nativeAuth.js';
import { useSync, setSyncEnabled, syncNow } from '../lib/sync.js';
import { api, getToken } from '../lib/api.js';
import { notify } from '../lib/notify.js';
import FriendsModal from './FriendsModal.jsx';
import InboxModal from './InboxModal.jsx';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'fa-sun' },
  { value: 'dark', label: 'Dark', icon: 'fa-moon' },
  { value: 'system', label: 'System', icon: 'fa-laptop' },
];

// ── Native-only: connect an account and control sync ──
function AccountSync() {
  const { user, login, register, loginWithGoogle, logout } = useAuth();
  const sync = useSync();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function afterAuth() {
    await setSyncEnabled(true); // turns sync on and runs the first merge
    notify('Signed in — merging your notes', 'success');
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (mode === 'signup') await register(email.trim(), password);
      else await login(email.trim(), password);
      await afterAuth();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function google() {
    setBusy(true); setError('');
    try {
      const idToken = await nativeGoogleSignIn();
      await loginWithGoogle(idToken);
      await afterAuth();
    } catch (err) {
      const m = String(err?.message || '');
      if (!/cancel|dismiss|closed/i.test(m)) setError(m || 'Google sign-in failed.');
    } finally { setBusy(false); }
  }

  // ── Signed out: offer sign in / sign up ──
  if (!user) {
    return (
      <div className="settings-card">
        <div className="settings-section-label">Account &amp; Sync</div>
        <p className="settings-hint-text">
          Your notes are saved on this device and work offline. Sign in to back them
          up and sync — your offline notes <b>merge</b> with your account, nothing is replaced.
        </p>
        <form className="auth-form" style={{ padding: '0 16px 12px' }} onSubmit={submit}>
          <div className="field">
            <i className="fas fa-envelope field-icon" />
            <input className="field-input" type="email" placeholder="Email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <i className="fas fa-lock field-icon" />
            <input className="field-input" type="password" placeholder="Password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account & sync' : 'Sign in & sync'}
          </button>
          {error && <div className="auth-error">{error}</div>}
        </form>
        <div className="auth-divider" style={{ margin: '0 16px' }}><span>or</span></div>
        <div style={{ padding: '10px 16px 12px' }}>
          <button type="button" className="btn btn-google btn-block" onClick={google} disabled={busy}>
            Continue with Google
          </button>
        </div>
        <button className="settings-row" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }}>
          <span><i className="fas fa-user-plus" /> {mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create an account'}</span>
          <i className="fas fa-chevron-right" />
        </button>
      </div>
    );
  }

  // ── Signed in: sync controls (toggle works even while logged in) ──
  const last = sync.lastSync ? new Date(sync.lastSync).toLocaleString() : 'never';
  return (
    <div className="settings-card">
      <div className="settings-section-label">Account &amp; Sync</div>
      <div className="settings-row" style={{ cursor: 'default' }}>
        <span><i className="fas fa-circle-check" style={{ color: 'var(--success)' }} /> {user.email || user.displayName}</span>
      </div>
      <div className="settings-row" style={{ cursor: 'default' }}>
        <span><i className="fas fa-rotate" /> Sync this device</span>
        <label className="switch">
          <input type="checkbox" checked={sync.enabled} onChange={(e) => setSyncEnabled(e.target.checked)} />
          <span className="slider" />
        </label>
      </div>
      <button className="settings-row" disabled={!sync.enabled || sync.syncing || !sync.online} onClick={() => syncNow()}>
        <span><i className={`fas fa-arrows-rotate${sync.syncing ? ' fa-spin' : ''}`} /> {sync.syncing ? 'Syncing…' : 'Sync now'}</span>
        <span className="settings-sub">{!sync.online ? 'Offline' : !sync.enabled ? 'Sync off' : `Last: ${last}`}</span>
      </button>
      {sync.error && <p className="settings-hint-text" style={{ color: 'var(--danger)' }}>{sync.error}</p>}
      <button className="settings-row danger" onClick={() => {
        if (confirm('Sign out? Your notes stay on this device.')) { setSyncEnabled(false); logout(); }
      }}>
        <span><i className="fas fa-sign-out-alt" /> Sign out</span>
        <i className="fas fa-chevron-right" />
      </button>
    </div>
  );
}

export default function SettingsTab({ user, onPrivacy, onLogout, onReload }) {
  const name = user?.displayName || (user?.email || 'You').split('@')[0];
  const initial = (name[0] || 'U').toUpperCase();
  const { pref, setTheme } = useTheme();
  const [showFriends, setShowFriends] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  // How many items friends have shared with me (badge).
  const refreshInbox = useCallback(async () => {
    if (!user || !getToken()) { setInboxCount(0); return; }
    try { const res = await api.get('/api/friend-shares'); setInboxCount((res.shares || []).length); }
    catch { /* offline / non-critical */ }
  }, [user]);
  useEffect(() => { refreshInbox(); }, [refreshInbox]);

  return (
    <section className="screen" style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Identity card — only when there's an account (web always; native when signed in). */}
      {user && (
        <div className="settings-card">
          <div className="settings-user">
            <div className="settings-avatar">{initial}</div>
            <div>
              <div className="settings-name">{name}</div>
              <div className="settings-email">{user?.email || ''}</div>
            </div>
          </div>
        </div>
      )}

      {/* Native: account + sync controls. */}
      {isNative && <AccountSync />}

      {/* Friends + sharing inbox — online features, need an account. */}
      {user && (
        <div className="settings-card">
          <div className="settings-section-label">Connect</div>
          <button className="settings-row" onClick={() => setShowFriends(true)}>
            <span><i className="fas fa-user-group" /> Friends</span>
            <i className="fas fa-chevron-right" />
          </button>
          <button className="settings-row" onClick={() => setShowInbox(true)}>
            <span><i className="fas fa-inbox" /> Shared with me</span>
            {inboxCount > 0 ? <span className="inbox-badge">{inboxCount}</span> : <i className="fas fa-chevron-right" />}
          </button>
        </div>
      )}

      <div className="settings-card">
        <div className="settings-section-label">Appearance</div>
        <div className="theme-seg">
          {THEME_OPTIONS.map((opt) => (
            <button key={opt.value} className={pref === opt.value ? 'active' : ''} onClick={() => setTheme(opt.value)}>
              <i className={`fas ${opt.icon}`} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-card">
        <button className="settings-row" onClick={onPrivacy}>
          <span><i className="fas fa-eye-slash" /> Hide all content (privacy)</span>
          <i className="fas fa-chevron-right" />
        </button>
        {/* Web logout lives here; native logout is in the Account & Sync card. */}
        {!isNative && (
          <button className="settings-row danger" onClick={() => { if (confirm('Log out of Mah Notes?')) onLogout(); }}>
            <span><i className="fas fa-sign-out-alt" /> Log out</span>
            <i className="fas fa-chevron-right" />
          </button>
        )}
      </div>

      <p className="settings-about">Mah Notes · MERN edition</p>

      {showFriends && <FriendsModal me={user} onClose={() => setShowFriends(false)} />}
      {showInbox && (
        <InboxModal
          onClose={() => { setShowInbox(false); refreshInbox(); }}
          onSaved={() => { if (onReload) onReload(); refreshInbox(); }}
        />
      )}
    </section>
  );
}
