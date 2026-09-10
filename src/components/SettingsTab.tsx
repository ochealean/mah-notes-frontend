import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { isNative, nativeGoogleSignIn } from '../lib/nativeAuth';
import { useSync, setSyncEnabled, setClipSyncEnabled, purgeAccountClips, syncNow, setSyncAccount, getAccountOnlyItems, removeAccountData, resetSyncForLogout } from '../lib/sync';
import { hasClips, hasLocalStore, isDesktop } from '../lib/platform';
import {
  getHotkeyStatus, isAutostartOn, setAutostart,
  isKeepRunningOn, setKeepRunning, desktopGoogleSignIn,
  type HotkeyStatus,
} from '../lib/desktopPrefs';
import { listClips } from '../lib/clips';
import { api, getToken } from '../lib/api';
import { notify } from '../lib/notify';
import { APP_VERSION } from '../lib/appInfo';
import { checkForUpdate, autoUpdateEnabled, setAutoUpdate } from '../lib/updates';
import { pushWidgetData } from '../lib/widget';
import { clearStrayAlarms } from '../lib/alarm';
import { listSchedules } from '../lib/scheduleStore';
import FriendsModal from './FriendsModal';
import InboxModal from './InboxModal';
import ConnectGoogle from './ConnectGoogle';
import SetAccountPassword from './SetAccountPassword';
import AccountUsername from './AccountUsername';
import DeleteAccount from './DeleteAccount';
import EmailCautionModal from './EmailCautionModal';
import DownloadAppModal from './DownloadAppModal';
import ThemeCustomizer from './ThemeCustomizer';
import WhatsNewModal from './WhatsNewModal';
import UpdateModal from './UpdateModal';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'fa-sun' },
  { value: 'dark', label: 'Dark', icon: 'fa-moon' },
  { value: 'system', label: 'System', icon: 'fa-laptop' },
];
// Shown on the collapsed Appearance header so the current choice is readable
// without opening the section.
const THEME_LABEL = Object.fromEntries(THEME_OPTIONS.map((o) => [o.value, o.label]));

// ── Offline-first builds: connect an account and control sync ──
//  Android and desktop both open without a login gate, so signing in lives
//  HERE rather than on a gate screen. That is also why it has to render on
//  desktop: without it there is no way to sign in at all.
function AccountSync({ reloadLists }) {
  const { user, login, register, loginWithGoogle, forgotPassword, logout } = useAuth();
  const sync = useSync();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [signOut, setSignOut] = useState(null);   // { notes, plans } counts | null
  const [signingOut, setSigningOut] = useState(false);
  // One-time "are you sure this address is right" gate before creating an
  // account — see EmailCautionModal. Re-armed whenever the email is edited.
  const [emailAcked, setEmailAcked] = useState(false);
  const [showEmailWarn, setShowEmailWarn] = useState(false);
  // Forgot-password: the reset LINK lands on the website (the server builds it
  // from CLIENT_ORIGIN), so the flow here is "request the email" only — the
  // user taps the link on their phone, sets a new password in the browser,
  // then comes back and signs in here. Nothing to handle in-app beyond asking.
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  function onEmailChange(v) {
    setEmail(v);
    setEmailAcked(false);
  }

  // Leaving the forgot view (either direction) resets it, so reopening never
  // shows a stale "email sent" confirmation from a previous attempt.
  function closeForgot() {
    setForgot(false);
    setResetSent(false);
    setError('');
  }

  async function onForgotSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      await forgotPassword(email.trim());
      // The server deliberately won't say whether the address exists, so this
      // confirmation is worded to be true either way.
      setResetSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

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

  async function doSubmit() {
    setBusy(true); setError('');
    try {
      const u = mode === 'signup'
        ? await register(email.trim(), password, name.trim(), username.trim())
        : await login(email.trim(), password);
      await afterAuth(u?.email || email.trim());
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  function submit(e) {
    e.preventDefault();
    // Signing up: pause once per address to make sure it's really the inbox
    // they can read — the only way "Forgot password" will ever reach them.
    if (mode === 'signup' && !emailAcked) { setShowEmailWarn(true); return; }
    doSubmit();
  }

  async function google() {
    setBusy(true); setError('');
    try {
      // Android hands back an ID token from the native picker. Desktop opens
      // the system browser and comes back with an auth code plus the loopback
      // URI it was issued for; the backend already accepts both shapes.
      const payload = isDesktop ? await desktopGoogleSignIn() : await nativeGoogleSignIn();
      const u = await loginWithGoogle(payload);
      await afterAuth(u?.email);
    } catch (err) {
      const m = String(err?.message || '');
      if (!/cancel|dismiss|closed/i.test(m)) setError(m || 'Google sign-in failed.');
    } finally { setBusy(false); }
  }

  // ── Signed out: forgot-password (request a reset email) ──
  if (!user && forgot) {
    return (
      <div className="settings-card">
        <div className="settings-section-label">Reset your password</div>
        {resetSent ? (
          <>
            <p className="settings-hint-text">
              <i className="fas fa-envelope-circle-check" style={{ marginRight: 6, color: 'var(--success)' }} />
              If that email has an account, a reset link is on its way. It expires in an hour.
            </p>
            <p className="settings-hint-text">
              Open the link on this phone, choose a new password in your browser, then come back
              here and sign in with it.
            </p>
            <div style={{ padding: '0 16px 14px' }}>
              <button type="button" className="btn btn-primary btn-block" onClick={closeForgot}>
                Back to sign in
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="settings-hint-text">
              Enter your email and we’ll send you a link to choose a new password.
            </p>
            {/* Shown to everyone, never conditionally — the server won't reveal
                whether an address has an account or which sign-in it uses, so
                this explains the "no email arrived" case without leaking. */}
            <p className="settings-hint-text">
              Signed up with Google and never set a password? There’s nothing to reset —
              use <b>Continue with Google</b> instead.
            </p>
            <form className="auth-form" style={{ padding: '0 16px 12px' }} onSubmit={onForgotSubmit}>
              <div className="field">
                <i className="fas fa-envelope field-icon" />
                <input className="field-input" type="email" placeholder="Email" autoComplete="email"
                  value={email} onChange={(e) => onEmailChange(e.target.value)} required />
              </div>
              <button className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Please wait…' : 'Send reset link'}
              </button>
              {error && <div className="auth-error">{error}</div>}
            </form>
            <button className="settings-row" onClick={closeForgot}>
              <span><i className="fas fa-arrow-left" /> Back to sign in</span>
            </button>
          </>
        )}
      </div>
    );
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
            <input className="field-input" type={mode === 'signup' ? 'email' : 'text'}
              placeholder={mode === 'signup' ? 'Email' : 'Email or username'}
              autoComplete={mode === 'signup' ? 'email' : 'username'}
              value={email} onChange={(e) => onEmailChange(e.target.value)} required />
          </div>
          {mode === 'signup' && (
            <div className="field">
              <i className="fas fa-at field-icon" />
              <input className="field-input" type="text" placeholder="Username (optional)" autoComplete="username"
                value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} />
            </div>
          )}
          <div className="field">
            <i className="fas fa-lock field-icon" />
            <input className="field-input" type={showPw ? 'text' : 'password'} placeholder="Password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="field-eye" aria-label="Show password" onClick={() => setShowPw((s) => !s)}>
              <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </div>
          {mode === 'signup' && (
            <p className="signup-warn">
              <i className="fas fa-circle-info" /> Use an email you can actually access — it’s the only way to reset this password if you forget it.
            </p>
          )}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account & sync' : 'Sign in & sync'}
          </button>
          {mode !== 'signup' && (
            <p className="auth-toggle">
              <a href="#" onClick={(e) => { e.preventDefault(); setError(''); setResetSent(false); setForgot(true); }}>
                Forgot password?
              </a>
            </p>
          )}
          {error && <div className="auth-error">{error}</div>}
        </form>
        {/* Android uses the native account picker; desktop opens the system
            browser and listens on a loopback port. The website has its own
            redirect button and never reaches this card. */}
        {(isNative || isDesktop) && (
          <>
            <div className="auth-divider" style={{ margin: '0 16px' }}><span>or</span></div>
            <div style={{ padding: '10px 16px 12px' }}>
              <button type="button" className="btn btn-google btn-block" onClick={google} disabled={busy}>
                {busy && isDesktop ? 'Waiting for your browser…' : 'Continue with Google'}
              </button>
              {isDesktop && (
                <p className="auth-hint">
                  This opens your normal browser, where you are probably already
                  signed in to Google.
                </p>
              )}
            </div>
          </>
        )}
        <button className="settings-row" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }}>
          <span><i className="fas fa-user-plus" /> {mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create an account'}</span>
          <i className="fas fa-chevron-right" />
        </button>

        {showEmailWarn && (
          <EmailCautionModal
            email={email.trim()}
            busy={busy}
            onCancel={() => setShowEmailWarn(false)}
            onConfirm={() => { setEmailAcked(true); setShowEmailWarn(false); doSubmit(); }}
          />
        )}
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

// What the collapsed Privacy header says about your shared links, so the
// current answer is readable without opening the section.
function shareSummary(user) {
  if (!user) return '';
  const name = user.shareIdentity !== false;
  const pic = user.shareAvatar !== false;
  if (name && pic) return 'Name and picture';
  if (name) return 'Name only';
  if (pic) return 'Picture only';
  return 'Anonymous';
}

// One switch in the share-privacy pair. Optimistic, because a toggle that
// waits on the network feels broken.
function ShareToggle({ icon, label, field, value, hint, disabled = false }) {
  const { setSharePrivacy } = useAuth();
  const [on, setOn] = useState(value);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setOn(value); }, [value]);

  async function toggle() {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    try { await setSharePrivacy({ [field]: next }); }
    catch (err) { setOn(!next); notify(err.message || 'Could not save that', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className={`settings-row${disabled ? ' is-disabled' : ''}`} style={{ cursor: 'default' }}>
        <span><i className={`fas ${icon}`} /> {label}</span>
        <label className="switch" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={on && !disabled} onChange={toggle} disabled={busy || disabled} />
          <span className="slider" />
        </label>
      </div>
      <p className="settings-hint-text">{hint}</p>
    </>
  );
}

// The byline on pages you share publicly. Both on by default: a share link is
// something you chose to publish, and a byline is what makes the page read as
// a person's rather than an anonymous dump.
//
// The two are independent — name only, picture only, both or neither. With
// both off there is no byline at all.
function SharePrivacy({ user }) {
  const nameOn = user.shareIdentity !== false;
  const avatarOn = user.shareAvatar !== false;
  const both = nameOn && avatarOn;
  const hasPicture = !!user.avatar;

  // Turning the picture on when none is stored does nothing visible, which
  // reads as a broken switch unless we say why.
  const avatarHint = !avatarOn
    ? (nameOn ? 'Your name appears on its own, with no picture.' : 'Your picture is hidden on shared links.')
    : hasPicture
      ? (both ? 'Your picture appears next to your name.' : 'Your picture appears above the note, on its own.')
      : (nameOn
        ? 'You have no profile picture yet, so your initial is shown instead.'
        : 'You have no profile picture yet, so a plain placeholder is shown. Connect Google or set one to use your own.');

  return (
    <>
      <ShareToggle
        icon="fa-id-badge"
        label="Show my name on shared links"
        field="shareIdentity"
        value={nameOn}
        hint={nameOn
          ? 'Your name appears above the note on any link you share.'
          : 'Your name is hidden on shared links.'}
      />
      <ShareToggle
        icon="fa-circle-user"
        label="Show my profile on shared links"
        field="shareAvatar"
        value={avatarOn}
        hint={avatarHint}
      />
      {!nameOn && !avatarOn && (
        <p className="settings-hint-text">
          With both off, pages you share carry no byline. The note itself is still
          readable by anyone holding the link.
        </p>
      )}
    </>
  );
}

// ── Clipboard sync (opt-in) ───────────────────────────────
//  Agreeing to sync your notes is NOT agreeing to upload everything you copy,
//  so this is a second switch on top of the master one, and it starts off.
//
//  The notice is permanent and visible rather than a tooltip: clips are stored
//  like notes, not end-to-end encrypted, and people paste passwords into
//  clipboards without thinking about it.
function ClipboardSync() {
  const sync = useSync();
  const [count, setCount] = useState(0);
  const [confirm, setConfirm] = useState(null); // 'on' | 'off' | null
  const [busy, setBusy] = useState(false);

  useEffect(() => { listClips().then((c) => setCount(c.length)).catch(() => {}); }, [sync.clipSync]);

  const signedIn = !!getToken();
  const ready = signedIn && sync.enabled;

  async function turnOn(uploadExisting) {
    setBusy(true);
    try {
      // "Start fresh" is one timestamp, not per-row bookkeeping: the push
      // filter simply ignores anything created before this moment.
      await setClipSyncEnabled(true, uploadExisting ? null : new Date().toISOString());
      notify(uploadExisting ? 'Clipboard is syncing' : 'Syncing new clips from now on', 'success');
    } catch (err) { notify(err.message || 'Could not turn that on', 'error'); }
    finally { setBusy(false); setConfirm(null); }
  }

  async function turnOff(purge) {
    setBusy(true);
    try {
      if (purge) await purgeAccountClips();
      await setClipSyncEnabled(false);
      notify(purge ? 'Stopped syncing and cleared your account' : 'Stopped syncing', 'info');
    } catch (err) { notify(err.message || 'Could not turn that off', 'error'); }
    finally { setBusy(false); setConfirm(null); }
  }

  return (
    <div className="settings-card">
      <div className="settings-section-label">Clipboard</div>

      <div className="clip-sync-choice">
        <button
          className={`clip-sync-opt${!sync.clipSync ? ' active' : ''}`}
          disabled={busy}
          onClick={() => (sync.clipSync ? setConfirm('off') : null)}
        >
          <span className="clip-sync-dot" />
          <span>
            Keep clips on this device only
            <small>Nothing is uploaded. This is the default.</small>
          </span>
        </button>
        <button
          className={`clip-sync-opt${sync.clipSync ? ' active' : ''}`}
          disabled={busy || !ready}
          onClick={() => (sync.clipSync ? null : setConfirm('on'))}
        >
          <span className="clip-sync-dot" />
          <span>
            Sync my clipboard to my account
            <small>Clips follow you between your phone and your computer.</small>
          </span>
        </button>
      </div>

      <p className="clip-sync-warn">
        <i className="fas fa-triangle-exclamation" />
        <span>
          Clips sync the same way your notes do. They are stored on our servers and are
          <b> not</b> end-to-end encrypted. Never clip passwords, card numbers, one-time
          codes, or anything you would not put in a note.
        </span>
      </p>

      <p className="settings-hint-text">
        {!signedIn
          ? 'Sign in to use this.'
          : !sync.enabled
            ? 'Turn on Sync above first — clips follow the same account.'
            : sync.clipSync
              ? `On \u2014 ${count} clip${count === 1 ? '' : 's'} on this device, synced to your account.`
              : `Off \u2014 ${count} clip${count === 1 ? '' : 's'}, on this device only.`}
      </p>

      {confirm === 'on' && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="popup confirm-popup">
            <div className="popup-head"><h3>Sync your clipboard?</h3></div>
            <p className="confirm-text">
              You have {count} clip{count === 1 ? '' : 's'} on this device. Uploading them puts
              their full text in your account, where your other devices can read it.
            </p>
            <div className="confirm-actions">
              <button className="btn btn-primary btn-block" disabled={busy} onClick={() => turnOn(true)}>
                Upload my {count} existing clip{count === 1 ? '' : 's'}
              </button>
              <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => turnOn(false)}>
                Start fresh, sync only new clips
              </button>
              <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm === 'off' && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="popup confirm-popup">
            <div className="popup-head"><h3>Stop syncing your clipboard?</h3></div>
            <p className="confirm-text">
              Your {count} clip{count === 1 ? '' : 's'} stay on this device either way. The
              question is only what happens to the copies in your account.
            </p>
            <div className="confirm-actions">
              <button className="btn btn-primary btn-block" disabled={busy} onClick={() => turnOff(false)}>
                Stop syncing, keep them in my account
              </button>
              <button className="btn btn-danger-ghost btn-block" disabled={busy} onClick={() => turnOff(true)}>
                Stop syncing and delete them from my account
              </button>
              <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => setConfirm(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Desktop: how the app runs, and its shortcuts ──────────
//  Two settings that only make sense together, so they share a heading:
//  whether Mah Notes starts with the computer, and whether it stays running
//  once the window is closed. Both exist for the same reason — the global
//  shortcuts only work while the app is actually running — so the group is
//  named for that rather than for the switches.
function DesktopCard() {
  const [keys, setKeys] = useState<HotkeyStatus | null>(null);
  const [autostart, setAuto] = useState(false);
  const [keepRunning, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getHotkeyStatus().then(setKeys).catch(() => {});
    isAutostartOn().then(setAuto).catch(() => {});
    isKeepRunningOn().then(setKeep).catch(() => {});
  }, []);

  // Optimistic on both: a switch that waits on the OS feels broken.
  async function toggle(next, setLocal, current, apply) {
    if (busy) return;
    setLocal(next);
    setBusy(true);
    try { await apply(next); }
    catch (err) {
      setLocal(current);
      notify(err.message || 'Could not change that', 'error');
    } finally { setBusy(false); }
  }

  const taken = keys && (!keys.captureOk || !keys.panelOk);

  return (
    <div className="settings-card">
      <div className="settings-section-label">Startup and background</div>

      <div className="settings-row" style={{ cursor: 'default' }}>
        <span><i className="fas fa-power-off" /> Start Mah Notes when I sign in to Windows</span>
        <label className="switch" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={autostart}
            disabled={busy}
            onChange={() => toggle(!autostart, setAuto, autostart, setAutostart)}
          />
          <span className="slider" />
        </label>
      </div>

      <div className="settings-row" style={{ cursor: 'default' }}>
        <span><i className="fas fa-inbox" /> Keep running when I close the window</span>
        <label className="switch" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={keepRunning}
            disabled={busy}
            onChange={() => toggle(!keepRunning, setKeep, keepRunning, setKeepRunning)}
          />
          <span className="slider" />
        </label>
      </div>

      <p className="settings-hint-text">
        {keepRunning
          ? 'Closing the window tucks Mah Notes into the tray, next to the clock. It keeps answering the shortcuts below, and Quit in the tray menu stops it properly.'
          : 'Closing the window quits Mah Notes completely. The shortcuts below will not work until you open it again.'}
      </p>

      <div className="settings-sub-label">Shortcuts</div>
      <div className="settings-row" style={{ cursor: 'default' }}>
        <span><i className="fas fa-scissors" /> Save the selected text</span>
        <kbd className={`hotkey${keys && !keys.captureOk ? ' failed' : ''}`}>
          {keys?.capture || 'Alt+N'}
        </kbd>
      </div>
      <div className="settings-row" style={{ cursor: 'default' }}>
        <span><i className="fas fa-clipboard-list" /> Open the paste panel</span>
        <kbd className={`hotkey${keys && !keys.panelOk ? ' failed' : ''}`}>
          {keys?.panel || 'Alt+M'}
        </kbd>
      </div>
      <p className="settings-hint-text">
        {taken
          ? 'Another app already owns one of these, so it will not fire. Close that app, or change its shortcut, and restart Mah Notes.'
          : 'Both shortcuts are registered and working.'}
      </p>
    </div>
  );
}

export default function SettingsTab({ user, onPrivacy, onLogout, onReload, reloadLists, updateAvailable, needsPassword = false }) {
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
  const [showDownload, setShowDownload] = useState(false);
  const [update, setUpdate] = useState(null);
  const [checking, setChecking] = useState(false);
  const [autoUpd, setAutoUpd] = useState(autoUpdateEnabled());
  // Recovery actions, collapsed by default: they only matter when something has
  // already gone wrong, so they shouldn't take up room in everyday settings.
  const [showMaintenance, setShowMaintenance] = useState(false);
  // Account Info starts collapsed to just the identity row (avatar/name/email) —
  // password, username, and Google linking are settled-once, rarely-revisited
  // controls that don't need to sit open on every visit to Settings.
  const [accountExpanded, setAccountExpanded] = useState(false);
  // Appearance retracts like Account Info. It is the section most likely to
  // grow (background, gradients, per-surface colours), so it stays closed by
  // default rather than pushing everything else off the screen.
  const [appearanceExpanded, setAppearanceExpanded] = useState(false);
  const [privacyExpanded, setPrivacyExpanded] = useState(false);

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
      {/* Account Info — identity is always visible; password, username, and
          Google linking retract behind it (web always; native when signed in). */}
      {user && (
        <div className="settings-card">
          <div className="settings-section-label">Account Info</div>
          <div
            className="settings-user settings-user-toggle"
            role="button"
            tabIndex={0}
            aria-expanded={accountExpanded}
            onClick={() => { if (!editingName) setAccountExpanded((v) => !v); }}
            onKeyDown={(e) => {
              if (editingName) return;
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAccountExpanded((v) => !v); }
            }}
          >
            {user.avatar
              ? <img className="settings-avatar" src={user.avatar} alt="" />
              : <div className="settings-avatar">{initial}</div>}
            {editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
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
                  <i className={`fas ${savingName ? 'fa-circle-notch fa-spin' : 'fa-check'}`} />
                </button>
                <button className="icon-btn" title="Cancel" disabled={savingName} onClick={() => setEditingName(false)}>
                  <i className="fas fa-times" />
                </button>
              </div>
            ) : (
              <>
                <div style={{ minWidth: 0 }}>
                  <div className="settings-name">{name}</div>
                  {/* A username, once set, is the more useful line here — it's what
                      they'd actually type to sign in, and it doesn't reveal the
                      backing Gmail/email address at a glance. */}
                  <div className="settings-email">{user?.username ? `@${user.username}` : (user?.email || '')}</div>
                </div>
                <button className="icon-btn" title="Edit name" style={{ marginLeft: 'auto' }}
                  onClick={(e) => { e.stopPropagation(); startEditName(); }}>
                  <i className="fas fa-pen" />
                </button>
                <i className={`fas fa-chevron-${accountExpanded ? 'up' : 'down'} settings-user-chevron`} />
              </>
            )}
          </div>

          {accountExpanded && (
            <>
              {/* Set a password (Google-only accounts) or change the existing one.
                  Without one, a broken Google sign-in locks the account out — so
                  say so here rather than leaving it to be discovered. */}
              {needsPassword && (
                <p className="settings-hint-text">
                  <i className="fas fa-triangle-exclamation" style={{ color: 'var(--accent-700)', marginRight: 8 }} />
                  This account has no password yet. Set one so you can still sign in if Google sign-in ever fails.
                </p>
              )}
              <SetAccountPassword />

              {/* Add or change the login username. */}
              <AccountUsername />

              {/* Connect a Google account to an email/password account (web + native when signed in). */}
              <ConnectGoogle />

              {/* Irreversible — deliberately last, and styled as a danger row. */}
              <DeleteAccount />
            </>
          )}
        </div>
      )}

      {/* Native: account + sync controls. */}
      {hasLocalStore && <AccountSync reloadLists={reloadLists} />}
      {hasClips && <ClipboardSync />}
      {isDesktop && <DesktopCard />}

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
        <button
          className={`settings-collapse${appearanceExpanded ? ' open' : ''}`}
          aria-expanded={appearanceExpanded}
          onClick={() => setAppearanceExpanded((v) => !v)}
        >
          <span><i className="fas fa-palette" /> Appearance</span>
          <span className="settings-collapse-right">
            <span className="settings-collapse-hint">{THEME_LABEL[pref] || 'System'}</span>
            <i className={`fas fa-chevron-${appearanceExpanded ? 'up' : 'down'}`} />
          </span>
        </button>

        {appearanceExpanded && (
          <div className="settings-collapse-body">
            <div className="settings-sub-label">Theme</div>
            <div className="theme-seg">
              {THEME_OPTIONS.map((opt) => (
                <button key={opt.value} className={pref === opt.value ? 'active' : ''} onClick={() => setTheme(opt.value)}>
                  <i className={`fas ${opt.icon}`} />
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="settings-sub-label">Colour theme</div>
            <ThemeCustomizer />
          </div>
        )}
      </div>

      {isNative && (
        <div className="settings-card">
          <button className="settings-row" onClick={() => setShowMaintenance((v) => !v)}>
            <span><i className="fas fa-screwdriver-wrench" /> Troubleshooting</span>
            <i className={`fas fa-chevron-${showMaintenance ? 'up' : 'down'}`} />
          </button>
          {showMaintenance && (
            <>
              <p className="settings-hint-text">
                Only needed if something looks wrong — the app keeps both of these in
                step on its own.
              </p>
              <button className="settings-row" onClick={async () => {
                const c = await pushWidgetData();
                notify(`Widget updated — ${c.notes} notes, ${c.plans} plans, ${c.schedule} schedule items`, 'success');
              }}>
                <span><i className="fas fa-table-cells-large" /> Refresh widget data</span>
                <i className="fas fa-rotate-right" />
              </button>
              <button className="settings-row" onClick={async () => {
                try {
                  const blocks = await listSchedules();
                  const removed = await clearStrayAlarms(blocks);
                  notify(
                    removed ? `Cleared ${removed} stray alarm${removed === 1 ? '' : 's'}`
                      : 'No stray alarms found',
                    'success',
                  );
                } catch (err) {
                  notify(err.message, 'error');
                }
              }}>
                <span><i className="fas fa-bell-slash" /> Clear stray alarms</span>
                <i className="fas fa-broom" />
              </button>
            </>
          )}
        </div>
      )}

      <div className="settings-card">
        <button
          className={`settings-collapse${privacyExpanded ? ' open' : ''}`}
          aria-expanded={privacyExpanded}
          onClick={() => setPrivacyExpanded((v) => !v)}
        >
          <span><i className="fas fa-lock" /> Privacy</span>
          <span className="settings-collapse-right">
            <span className="settings-collapse-hint">{shareSummary(user)}</span>
            <i className={`fas fa-chevron-${privacyExpanded ? 'up' : 'down'}`} />
          </span>
        </button>

        {privacyExpanded && (
          <div className="settings-collapse-body">
            <div className="settings-sub-label">In this app</div>
            <button className="settings-row" onClick={onPrivacy}>
              <span><i className="fas fa-eye-slash" /> Hide all content in the list</span>
              <i className="fas fa-chevron-right" />
            </button>

            <div className="settings-sub-label">On shared links</div>
            {user && <SharePrivacy user={user} />}
          </div>
        )}
      </div>

      {/* Log out sits in its own card: it is not a privacy setting, and it
          must not disappear when the section above is collapsed. */}
      {!isNative && (
        <div className="settings-card">
          <button className="settings-row danger" onClick={() => { if (confirm('Log out of Mah Notes?')) onLogout(); }}>
            <span><i className="fas fa-sign-out-alt" /> Log out</span>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
      )}

      <div className="settings-card">
        <div className="settings-section-label">About &amp; updates</div>
        <button className="settings-row" onClick={() => setShowWhatsNew(true)}>
          <span><i className="fas fa-gift" /> What’s new</span>
          <span className="settings-sub">v{APP_VERSION}</span>
        </button>
        {/* Web only: you're already running the app if this is native. */}
        {!isNative && (
          <button className="settings-row" onClick={() => setShowDownload(true)}>
            <span><i className="fas fa-download" /> Get the app for Windows or Android</span>
            <i className="fas fa-chevron-right" />
          </button>
        )}
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
                <i className={`fas ${checking ? 'fa-circle-notch fa-spin' : 'fa-cloud-arrow-down'}`} /> {checking ? 'Checking…' : 'Check for updates'}
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
      {showDownload && <DownloadAppModal onClose={() => setShowDownload(false)} />}
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
