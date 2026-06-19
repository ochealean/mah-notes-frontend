import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { isNative, nativeGoogleSignIn } from '../lib/nativeAuth';
import { useSync, setSyncEnabled, syncNow, setSyncAccount, getAccountOnlyItems, removeAccountData, resetSyncForLogout } from '../lib/sync';
import { api, getToken } from '../lib/api';
import { notify } from '../lib/notify';
import { APP_VERSION } from '../lib/appInfo';
import { checkForUpdate, autoUpdateEnabled, setAutoUpdate } from '../lib/updates';
import FriendsModal from './FriendsModal';
import InboxModal from './InboxModal';
import WhatsNewModal from './WhatsNewModal';
import UpdateModal from './UpdateModal';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'fa-sun' },
  { value: 'dark', label: 'Dark', icon: 'fa-moon' },
  { value: 'system', label: 'System', icon: 'fa-laptop' },
];

// ── Native-only: connect an account and control sync ──
function AccountSync({ reloadLists }) {
  const { user, login, register, loginWithGoogle, logout } = useAuth();
  const sync = useSync();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signOut, setSignOut] = useState(null);   // { notes, plans } counts | null
  const [signingOut, setSigningOut] = useState(false);

  async function afterAuth(account) {
    // If a DIFFERENT account's synced data is still on this device, isolate it
    // now (before any sync) so the two accounts never merge. Your own offline
    // notes are always kept.
    let switched = false;
    try { ({ switched } = await setSyncAccount(account)); } catch { /* best-effort */ }
    // Sync starts OFF on every login — the user opts in.
    await setSyncEnabled(false);
    if (switched && reloadLists) reloadLists();
    notify(
      switched
        ? 'Signed in to a different account. The previous account’s synced data was cleared from this device.'
        : 'Signed in. Turn on “Sync this device” to back up & merge.',
      'success',
    );
  }

  // Sign-out: first find which on-device items came from this account, then ask.
  async function openSignOut() {
    try {
      const acc = await getAccountOnlyItems();
      setSignOut({ notes: acc.notes.length, plans: acc.plans.length });
    } catch { setSignOut({ notes: 0, plans: 0 }); }
  }

  async function doSignOut(removeData) {
    setSigningOut(true);
    try {
      if (removeData) await removeAccountData(); // keeps the device's own notes
      await resetSyncForLogout();
      logout();
      if (reloadLists) reloadLists();
    } finally { setSigningOut(false); setSignOut(null); }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const u = mode === 'signup'
        ? await register(email.trim(), password, name.trim())
        : await login(email.trim(), password);
      await afterAuth(u?.email || email.trim());
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function google() {
    setBusy(true); setError('');
    try {
      const idToken = await nativeGoogleSignIn();
      const u = await loginWithGoogle(idToken);
      await afterAuth(u?.email);
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
          {mode === 'signup' && (
            <div className="field">
              <i className="fas fa-user field-icon" />
              <input className="field-input" type="text" placeholder="Name (optional)" autoComplete="name"
                value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
          )}
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
          {mode === 'signup' && (
            <p className="signup-warn">
              <i className="fas fa-triangle-exclamation" /> There’s no password reset — if you forget this password, the account <b>can’t be recovered</b>. Save it somewhere safe (or use Google instead).
            </p>
          )}
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
      <button className="settings-row danger" onClick={openSignOut}>
        <span><i className="fas fa-sign-out-alt" /> Sign out</span>
        <i className="fas fa-chevron-right" />
      </button>

      {signOut && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSignOut(null); }}>
          <div className="popup">
            <div className="popup-head">
              <h3><i className="fas fa-sign-out-alt" /> Sign out</h3>
              <button className="icon-btn" aria-label="Close" onClick={() => setSignOut(null)}><i className="fas fa-times" /></button>
            </div>
            {(signOut.notes + signOut.plans) > 0 ? (
              <>
                <p className="reconcile-intro">
                  Sync will be turned off and your own offline notes are <b>always kept</b>.
                  You can also clear the <b>{signOut.notes + signOut.plans}</b> copy{(signOut.notes + signOut.plans) > 1 ? 'ies' : ''} of <b>{user.email || user.displayName}</b>’s synced notes from this device — they stay safe in your account and come back when you sign in &amp; sync again. (Signing into a different account clears them for you automatically.)
                </p>
                <div className="signout-actions">
                  <button className="btn btn-primary btn-block" disabled={signingOut} onClick={() => doSignOut(false)}>
                    <i className="fas fa-box-archive" /> Sign out &amp; keep them
                  </button>
                  <button className="btn btn-block signout-remove" disabled={signingOut} onClick={() => doSignOut(true)}>
                    <i className="fas fa-trash" /> Sign out &amp; clear this device
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="reconcile-intro">Your notes stay on this device. Sync will be turned off.</p>
                <button className="btn btn-primary btn-block" disabled={signingOut} onClick={() => doSignOut(false)}>Sign out</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsTab({ user, onPrivacy, onLogout, onReload, reloadLists, updateAvailable }) {
  const name = user?.displayName || (user?.email || 'You').split('@')[0];
  const initial = (name[0] || 'U').toUpperCase();
  const { pref, setTheme } = useTheme();
  const { updateProfile } = useAuth();
  const [showFriends, setShowFriends] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [update, setUpdate] = useState(null);
  const [checking, setChecking] = useState(false);
  const [autoUpd, setAutoUpd] = useState(autoUpdateEnabled());

  function toggleAuto(on) { setAutoUpd(on); setAutoUpdate(on); }
  async function checkUpdates() {
    if (checking) return;
    setChecking(true);
    try {
      const u = await checkForUpdate();
      if (u) setUpdate(u);
      else notify('You’re on the latest version', 'success');
    } catch { notify('Could not check for updates', 'error'); }
    finally { setChecking(false); }
  }

  // Seed the editor with the *custom* name (blank when on the email fallback),
  // so saving an untouched field doesn't overwrite the fallback with a literal.
  function startEditName() {
    setNameDraft(user?.displayName || '');
    setEditingName(true);
  }
  async function saveName() {
    if (savingName) return;
    setSavingName(true);
    try {
      await updateProfile(nameDraft.trim());
      setEditingName(false);
      notify('Name updated', 'success');
    } catch (err) {
      notify(err.message || 'Could not update name', 'error');
    } finally {
      setSavingName(false);
    }
  }

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
            {editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                <input
                  className="field-input"
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder={(user?.email || 'You').split('@')[0]}
                  maxLength={60}
                  autoFocus
                  disabled={savingName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveName(); }
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                />
                <button className="icon-btn" title="Save name" disabled={savingName} onClick={saveName}>
                  <i className={`fas ${savingName ? 'fa-spinner fa-spin' : 'fa-check'}`} />
                </button>
                <button className="icon-btn" title="Cancel" disabled={savingName} onClick={() => setEditingName(false)}>
                  <i className="fas fa-times" />
                </button>
              </div>
            ) : (
              <>
                <div style={{ minWidth: 0 }}>
                  <div className="settings-name">{name}</div>
                  <div className="settings-email">{user?.email || ''}</div>
                </div>
                <button className="icon-btn" title="Edit name" style={{ marginLeft: 'auto' }} onClick={startEditName}>
                  <i className="fas fa-pen" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Native: account + sync controls. */}
      {isNative && <AccountSync reloadLists={reloadLists} />}

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

      <div className="settings-card">
        <div className="settings-section-label">About &amp; updates</div>
        <button className="settings-row" onClick={() => setShowWhatsNew(true)}>
          <span><i className="fas fa-gift" /> What’s new</span>
          <span className="settings-sub">v{APP_VERSION}</span>
        </button>
        {/* Native only: the APK self-updates from GitHub Releases (the web auto-updates on deploy). */}
        {isNative && (
          <>
            <div className="settings-row" style={{ cursor: 'default' }}>
              <span><i className="fas fa-rotate" /> Check for updates automatically</span>
              <label className="switch">
                <input type="checkbox" checked={autoUpd} onChange={(e) => toggleAuto(e.target.checked)} />
                <span className="slider" />
              </label>
            </div>
            <button className="settings-row" disabled={checking} onClick={checkUpdates}>
              <span>
                <i className={`fas ${checking ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`} /> {checking ? 'Checking…' : 'Check for updates'}
                {updateAvailable && <span className="update-dot" />}
              </span>
              {updateAvailable
                ? <span className="settings-sub update-ready">v{updateAvailable.version} ready</span>
                : <i className="fas fa-chevron-right" />}
            </button>
          </>
        )}
      </div>

      <p className="settings-about">Mah Notes · MERN edition</p>

      {showWhatsNew && <WhatsNewModal onClose={() => setShowWhatsNew(false)} />}
      {update && <UpdateModal update={update} onClose={() => setUpdate(null)} />}
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
