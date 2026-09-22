import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { isNative, nativeGoogleSignIn } from '../lib/nativeAuth';
import { useSync, setSyncEnabled, setClipSyncEnabled, purgeAccountClips, syncNow, setSyncAccount, getAccountOnlyItems, removeAccountData, resetSyncForLogout } from '../lib/sync';
import { hasClips, hasLocalStore, isDesktop, isWeb } from '../lib/platform';
import { uploadAvatar, pictureProblem } from '../lib/avatarUpload';
import AvatarCropModal from './AvatarCropModal';
import {
  getHotkeyStatus, isAutostartOn, setAutostart,
  isKeepRunningOn, setKeepRunning, desktopGoogleSignIn,
  type HotkeyStatus,
} from '../lib/desktopPrefs';
import { listClips } from '../lib/clips';
import { api, getToken } from '../lib/api';
import { onRealtime } from '../lib/realtime';
import { notify } from '../lib/notify';
import { APP_VERSION } from '../lib/appInfo';
import { checkForUpdate, autoUpdateEnabled, setAutoUpdate } from '../lib/updates';
import { pushWidgetData } from '../lib/widget';
import { clearStrayAlarms } from '../lib/alarm';
import { listSchedules } from '../lib/scheduleStore';
import FriendsPanel from './FriendsPanel';
import InboxPanel from './InboxPanel';
import { playSignOut } from '../lib/galaxyFarewell';
import ConnectGoogle from './ConnectGoogle';
import SetAccountPassword from './SetAccountPassword';
import AccountUsername from './AccountUsername';
import DeleteAccount from './DeleteAccount';
import EmailCautionModal from './EmailCautionModal';
import DownloadAppModal from './DownloadAppModal';
import ThemeCustomizer from './ThemeCustomizer';
import WhatsNewModal from './WhatsNewModal';
import UpdateModal from './UpdateModal';
import BundleAvatar, { Face } from './BundleAvatar';
import BundleSky from './BundleSky';
import BundleCollection from './BundleCollection';
import { useBundle } from '../lib/bundles';
import { PRESETS, activePresetId } from '../lib/palette';

// ── Offline-first builds: connect an account and control sync ──
//  Android and desktop both open without a login gate, so signing in lives
//  HERE rather than on a gate screen. That is also why it has to render on
//  desktop: without it there is no way to sign in at all.
function AccountSync({ reloadLists }) {
  const { user, login, register, loginWithGoogle, forgotPassword } = useAuth();
  const sync = useSync();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);
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
      {/* Signing out lives in one place: Settings → Log out. */}
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

// ============================================================
//  Settings, as sections.
//
//  The rail lists the sections; the pane shows exactly one. Picking
//  Bundles shows Bundles and nothing else — no scrolling up into Account,
//  and nothing from another section sitting above it. On a phone the list
//  is the screen and a section opens over it, like a note does.
//
//  These used to be one long page, then a stack of dialogs. A section per
//  pane gives each one the whole screen and keeps the list short enough
//  to scan.
// ============================================================
export type SettingsSectionId =
  | 'account' | 'friends' | 'bundles' | 'appearance' | 'privacy'
  | 'clipboard' | 'desktop' | 'troubleshooting' | 'about';

export type SettingsSection = {
  id: SettingsSectionId;
  group: string;
  title: string;
  icon: string;
  /** One line, readable without opening the section. */
  summary: string;
  /** Something here needs attention. */
  dot?: boolean;
};

/** What friends have sent me, for the red dots: `count` waiting, `unseen` not
    opened yet. Asked once the app has finished loading (`ready`), never during
    its cold start; after that the server's `inbox:changed` event keeps it
    current on every device, and coming back to the app asks again in case the
    socket was asleep meanwhile. */
export function useInboxCount(user, ready = true) {
  const [counts, setCounts] = useState({ count: 0, unseen: 0 });
  const userId = user?.id;
  const refresh = useCallback(async () => {
    if (!userId || !getToken()) { setCounts({ count: 0, unseen: 0 }); return; }
    try {
      const res = await api.get('/api/friend-shares/count');
      setCounts({ count: res.total || 0, unseen: res.unseen || 0 });
    } catch { /* offline / non-critical */ }
  }, [userId]);
  useEffect(() => { if (ready) refresh(); }, [refresh, ready]);
  useEffect(() => onRealtime('inbox:changed', (p) => {
    if (p && typeof p.total === 'number') setCounts({ count: p.total, unseen: p.unseen || 0 });
    else refresh();
  }), [refresh]);
  useEffect(() => {
    if (!ready) return undefined;
    let last = Date.now();
    const onShow = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 60000) return;
      last = Date.now();
      refresh();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [ready, refresh]);
  return { ...counts, refresh };
}

export function useSettingsSections({ user, inboxCount = 0, inboxUnseen = 0, updateAvailable = null, needsPassword = false }) {
  const { bundle } = useBundle();
  const { effective, palette } = useTheme();
  const sync = useSync();
  const presetId = activePresetId(palette);
  const presetName = PRESETS.find((p) => p.id === presetId)?.name || 'Custom';
  const name = user ? (user.displayName || user.username || 'Your account') : '';

  const list: SettingsSection[] = [];
  list.push({
    id: 'account', group: 'You', title: 'Account', icon: 'fa-circle-user',
    summary: user ? (user.username ? `${name} · @${user.username}` : name) : 'Not signed in',
    dot: needsPassword,
  });
  if (user) {
    list.push({
      id: 'friends', group: 'You', title: 'Friends', icon: 'fa-user-group',
      summary: inboxUnseen
        ? `${inboxUnseen} new from friends`
        : inboxCount ? `${inboxCount} shared with you` : 'Find people by @username',
      // New, not merely waiting: once you have looked, the dot goes.
      dot: inboxUnseen > 0,
    });
  }
  list.push({ id: 'bundles', group: 'Look & feel', title: 'Bundles', icon: 'fa-meteor', summary: `${bundle.name} equipped` });
  list.push({
    id: 'appearance', group: 'Look & feel', title: 'Appearance', icon: 'fa-palette',
    summary: bundle.theme
      ? `${bundle.name} colours while it is equipped`
      : `${presetName} · ${effective === 'dark' ? 'dark' : 'light'} ground`,
  });
  list.push({
    id: 'privacy', group: 'Privacy & data', title: 'Privacy', icon: 'fa-lock',
    summary: user ? `Shared links show: ${shareSummary(user).toLowerCase()}` : 'Hide content in the list',
  });
  if (hasClips) {
    list.push({
      id: 'clipboard', group: 'Privacy & data', title: 'Clipboard', icon: 'fa-clipboard',
      summary: sync.clipSync ? 'Syncing to your account' : 'On this device only',
    });
  }
  if (isDesktop) {
    list.push({ id: 'desktop', group: 'This device', title: 'Startup & shortcuts', icon: 'fa-keyboard', summary: 'Alt+N capture · Alt+M paste panel' });
  }
  if (isNative) {
    list.push({ id: 'troubleshooting', group: 'This device', title: 'Troubleshooting', icon: 'fa-screwdriver-wrench', summary: 'Widget data and stray alarms' });
  }
  list.push({
    id: 'about', group: 'App', title: 'About & updates', icon: 'fa-circle-info',
    summary: updateAvailable ? `v${updateAvailable.version} ready to install` : `Version ${APP_VERSION}`,
    dot: !!updateAvailable,
  });
  return list;
}

// ── Signing out ────────────────────────────────────────
// Android and desktop keep the account's synced notes on the device, so
// signing out there first asks whether to keep those copies. (The website
// keeps nothing and simply logs out.) Rendered on <body>: a panel with a
// backdrop blur would otherwise trap a full-screen dialog inside itself.
function SignOutDialog({ counts, onClose, reloadLists }) {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const copies = counts.notes + counts.plans;

  async function doSignOut(removeData) {
    setSigningOut(true);
    try {
      if (removeData) await removeAccountData(); // keeps the device's own notes
      await resetSyncForLogout();
      onClose();
      await playSignOut(); // the bundle's farewell; resolves at once otherwise
      logout();
      if (reloadLists) reloadLists();
    } finally { setSigningOut(false); }
  }

  return createPortal(
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-sign-out-alt" /> Log out</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>
        {copies > 0 ? (
          <>
            <p className="reconcile-intro">
              Sync will be turned off and your own offline notes are <b>always kept</b>.
              You can also clear the <b>{copies}</b> cop{copies > 1 ? 'ies' : 'y'} of <b>{user?.email || user?.displayName}</b>’s synced notes from this device — they stay safe in your account and come back when you sign in &amp; sync again. (Signing into a different account clears them for you automatically.)
            </p>
            <div className="signout-actions">
              <button className="btn btn-primary btn-block" disabled={signingOut} onClick={() => doSignOut(false)}>
                <i className="fas fa-box-archive" /> Log out &amp; keep them
              </button>
              <button className="btn btn-block signout-remove" disabled={signingOut} onClick={() => doSignOut(true)}>
                <i className="fas fa-trash" /> Log out &amp; clear this device
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="reconcile-intro">Your notes stay on this device. Sync will be turned off.</p>
            <button className="btn btn-primary btn-block" disabled={signingOut} onClick={() => doSignOut(false)}>Log out</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── The rail list ──────────────────────────────────────
export function SettingsNav({ sections, current, onPick, user, onLogout, reloadLists }) {
  const [signOut, setSignOut] = useState(null); // { notes, plans } counts | null
  const out = [];
  let group = '';
  sections.forEach((s) => {
    if (s.group !== group) {
      group = s.group;
      out.push(<div key={`g-${group}`} className="rail-group kicker">{group}</div>);
    }
    const on = current === s.id;
    out.push(
      <button key={s.id} className={`row set-row${on ? ' active' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => onPick(s.id)}>
        <div className="row-head">
          <i className={`fas ${s.icon} set-row-icon`} aria-hidden="true" />
          <span className="row-title">{s.title}</span>
          {s.dot && <span className="set-row-dot" title="Needs attention" />}
          <i className="fas fa-chevron-right set-row-chev" aria-hidden="true" />
        </div>
        <div className="row-snippet">{s.summary}</div>
      </button>,
    );
  });
  // Log out is an action, not a section, and it must never hide behind one.
  // It is the ONLY way out, on every platform — the phone app included.
  async function logOut() {
    if (!hasLocalStore) {
      if (confirm('Log out of Mah Notes?')) onLogout();
      return;
    }
    // Android and desktop: find which on-device items came from this
    // account first, then ask what to do with them.
    try {
      const acc = await getAccountOnlyItems();
      setSignOut({ notes: acc.notes.length, plans: acc.plans.length });
    } catch { setSignOut({ notes: 0, plans: 0 }); }
  }
  if (user && onLogout) {
    out.push(<div key="g-session" className="rail-group kicker">Session</div>);
    out.push(
      <button key="logout" className="row set-row danger" onClick={logOut}>
        <div className="row-head">
          <i className="fas fa-sign-out-alt set-row-icon" aria-hidden="true" />
          <span className="row-title">Log out</span>
        </div>
        <div className="row-snippet">{isWeb ? 'Sign out of this browser' : isNative ? 'Sign out of this phone' : 'Sign out of this computer'}</div>
      </button>,
    );
  }
  return (
    <>
      {out}
      {signOut && <SignOutDialog counts={signOut} onClose={() => setSignOut(null)} reloadLists={reloadLists} />}
    </>
  );
}

// ── Account ────────────────────────────────────────────
function AccountSection({ user, reloadLists, needsPassword }) {
  const { updateProfile, setAvatar } = useAuth();
  const { bundle } = useBundle();
  const name = user?.displayName || (user?.email || 'You').split('@')[0];

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  // The avatar itself is the button: tapping your own face is what people
  // try first. The upload only starts once the crop dialog has decided which
  // square of the photo is actually them.
  const pictureInput = useRef(null);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  const [pendingPicture, setPendingPicture] = useState(null);

  function onPicturePicked(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // so picking the SAME file again still fires onChange
    if (!file) return;
    const problem = pictureProblem(file);
    if (problem) { notify(problem, 'error'); return; }
    setPendingPicture(file);
  }

  async function onCropped(blob) {
    setUploadingPicture(true);
    try {
      const url = await uploadAvatar(blob);
      await setAvatar(url);
      setPendingPicture(null);
      notify('Picture updated', 'success');
    } catch (err) {
      notify(err?.message || 'Could not update your picture', 'error');
    } finally { setUploadingPicture(false); }
  }

  async function removePicture() {
    setUploadingPicture(true);
    try { await setAvatar(''); notify('Picture removed', 'success'); }
    catch (err) { notify(err?.message || 'Could not remove your picture', 'error'); }
    finally { setUploadingPicture(false); }
  }

  // Seed with the *custom* name (blank on the email fallback), so saving an
  // untouched field doesn't overwrite the fallback with a literal.
  function startEditName() { setNameDraft(user?.displayName || ''); setEditingName(true); }
  async function saveName(e) {
    e?.preventDefault?.();
    if (savingName) return;
    setSavingName(true);
    try {
      await updateProfile(nameDraft.trim());
      setEditingName(false);
      notify('Name updated', 'success');
    } catch (err) {
      notify(err.message || 'Could not update name', 'error');
    } finally { setSavingName(false); }
  }

  return (
    <>
      {user && (
        <section className="acct-hero">
          <BundleSky preset="header" />
          <div className="acct-hero-c">
            <span className="acct-av">
              <button type="button" className="acct-av-btn" title="Change your picture" aria-label="Change your picture"
                disabled={uploadingPicture} onClick={() => pictureInput.current?.click()}>
                <BundleAvatar size={112}><Face src={user.avatar} name={name} /></BundleAvatar>
              </button>
              <span className="acct-cam" aria-hidden="true">
                <i className={`fas ${uploadingPicture ? 'fa-circle-notch fa-spin' : 'fa-camera'}`} />
              </span>
            </span>
            <input ref={pictureInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onPicturePicked} />
            <div className="acct-id">
              <div className="kicker">Signed in as</div>
              {editingName ? (
                <form className="acct-name-edit" onSubmit={saveName}>
                  <input className="field-input" type="text" value={nameDraft} maxLength={60} autoFocus disabled={savingName}
                    aria-label="Display name" placeholder={(user?.email || 'You').split('@')[0]}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditingName(false); }} />
                  <button className="icon-btn" type="submit" title="Save name" disabled={savingName}>
                    <i className={`fas ${savingName ? 'fa-circle-notch fa-spin' : 'fa-check'}`} />
                  </button>
                  <button className="icon-btn" type="button" title="Cancel" disabled={savingName} onClick={() => setEditingName(false)}>
                    <i className="fas fa-times" />
                  </button>
                </form>
              ) : (
                <div className="acct-name-row">
                  <span className="acct-name">{name}</span>
                  <button className="icon-btn" title="Edit name" aria-label="Edit name" onClick={startEditName}><i className="fas fa-pen" /></button>
                </div>
              )}
              {/* The username is the more useful line: it is what they type
                  to sign in, and it doesn't show the backing email at a glance. */}
              <div className="acct-handle">{user.username ? `@${user.username}` : user.email}</div>
              {user.username && user.email && <div className="acct-email">{user.email}</div>}
              {bundle.id !== 'default' && <div className="acct-bundle"><span className="bsq" />{bundle.name} equipped</div>}
            </div>
          </div>
        </section>
      )}

      {user && (
        <div className="settings-card">
          <div className="settings-section-label">Sign-in &amp; security</div>
          {!!user.avatar && (
            <button className="settings-row" disabled={uploadingPicture} onClick={removePicture}>
              <span><i className="fas fa-user-slash" /> Remove profile picture</span>
              <i className="fas fa-chevron-right" />
            </button>
          )}
          {needsPassword && (
            <p className="settings-hint-text">
              <i className="fas fa-triangle-exclamation" style={{ color: 'var(--accent-700)', marginRight: 8 }} />
              This account has no password yet. Set one so you can still sign in if Google sign-in ever fails.
            </p>
          )}
          <SetAccountPassword />
          <AccountUsername />
          <ConnectGoogle />
          {/* Irreversible — deliberately last, and styled as a danger row. */}
          <DeleteAccount />
        </div>
      )}

      {/* Android and desktop: sign in here, and control sync. */}
      {hasLocalStore && <AccountSync reloadLists={reloadLists} />}

      {pendingPicture && (
        <AvatarCropModal file={pendingPicture} onCancel={() => setPendingPicture(null)} onDone={onCropped} />
      )}
    </>
  );
}

// ── Friends ────────────────────────────────────────────
// Everything is right here — Settings → Friends, not Settings → Friends →
// a pop-up. What friends sent you comes first (it is waiting on you), then
// finding people, then your friends, each in their own bundle.
function FriendsSection({ user, refreshInbox, onReload }) {
  return (
    <>
      <InboxPanel onSaved={() => { if (onReload) onReload(); }} onChange={refreshInbox} />
      <FriendsPanel me={user} />
    </>
  );
}

// ── Appearance ─────────────────────────────────────────
// A bundle dresses the whole app, so while one is equipped the colours are
// the bundle's call, not the theme editor's. The editor stays visible — you
// can see what you would be changing — but it is switched off until the
// Default bundle is back on.
function AppearanceSection({ onOpenSection }) {
  const { bundle } = useBundle();
  // Every bundle but Default brings its own partner theme, so the editor is
  // locked whenever one is equipped (bundles.ts checks the rule at load).
  const locked = !!bundle.theme;
  // A disabled fieldset only reaches real form controls; the colour pickers
  // are drag-and-arrow-key widgets, so the whole editor is made inert too —
  // no pointer, no focus, no keys.
  const editorRef = useRef(null);
  useEffect(() => { if (editorRef.current) editorRef.current.inert = locked; }, [locked]);
  return (
    <>
      {locked && (
        <div className="set-lock-note" role="note">
          <i className="fas fa-lock" aria-hidden="true" />
          <div>
            <b>{bundle.name} brings its own colours.</b>
            <p>
              A bundle is a whole look, so while {bundle.name} is equipped the app wears its
              appearance. Your own theme is kept exactly as you left it — equip the <b>Default</b>
              bundle and it comes straight back, ready to edit here.
            </p>
            <button type="button" className="btn btn-ghost" onClick={() => onOpenSection && onOpenSection('bundles')}>
              <i className="fas fa-meteor" /> Go to Bundles
            </button>
          </div>
        </div>
      )}
      {/* A disabled fieldset switches off every control inside it at once. */}
      <fieldset ref={editorRef} className={`settings-card set-tc set-fieldset${locked ? ' is-locked' : ''}`} disabled={locked} aria-disabled={locked}>
        {/* No light/dark/system switch: a light paper is a light theme, a
            dark one (Midnight, or your own) is a dark theme. */}
        <ThemeCustomizer />
      </fieldset>
    </>
  );
}

// ── Privacy ────────────────────────────────────────────
function PrivacySection({ user, onPrivacy }) {
  return (
    <>
      <div className="settings-card">
        <div className="settings-section-label">In this app</div>
        <button className="settings-row" onClick={onPrivacy}>
          <span><i className="fas fa-eye-slash" /> Hide all content in the list</span>
          <i className="fas fa-chevron-right" />
        </button>
        <p className="settings-hint-text">
          Hiding blanks the rows in the list, so nobody reads your notes over your shoulder while
          you scroll. Opening an item still shows it in full.
        </p>
      </div>
      {user && (
        <div className="settings-card">
          <div className="settings-section-label">On shared links</div>
          <SharePrivacy user={user} />
        </div>
      )}
    </>
  );
}

// ── Troubleshooting (Android) ──────────────────────────
function TroubleshootingSection() {
  return (
    <div className="settings-card">
      <p className="settings-hint-text" style={{ paddingTop: 18 }}>
        Only needed if something looks wrong — the app keeps both of these in step on its own.
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
          notify(removed ? `Cleared ${removed} stray alarm${removed === 1 ? '' : 's'}` : 'No stray alarms found', 'success');
        } catch (err) { notify(err.message, 'error'); }
      }}>
        <span><i className="fas fa-bell-slash" /> Clear stray alarms</span>
        <i className="fas fa-broom" />
      </button>
    </div>
  );
}

// ── About & updates ────────────────────────────────────
function AboutSection({ updateAvailable }) {
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
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

  return (
    <>
      <div className="settings-card">
        <button className="settings-row" onClick={() => setShowWhatsNew(true)}>
          <span><i className="fas fa-gift" /> What’s new</span>
          <span className="settings-sub">v{APP_VERSION}</span>
        </button>
        {/* Web only. On a phone or the desktop app you are already running the
            thing this would offer to download. */}
        {isWeb && (
          <button className="settings-row" onClick={() => setShowDownload(true)}>
            <span><i className="fas fa-download" /> Get the app for Windows or Android</span>
            <i className="fas fa-chevron-right" />
          </button>
        )}
        {/* The installed apps check GitHub Releases themselves; the website
            updates whenever it is deployed. */}
        {!isWeb && (
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
    </>
  );
}

// ── The pane ───────────────────────────────────────────
export function SettingsPane({
  section, sections, user, onBack, onPrivacy, onReload, reloadLists,
  updateAvailable, needsPassword, inboxCount, refreshInbox, onShareCard, onOpenSection,
}) {
  const meta = sections.find((s) => s.id === section);
  if (!meta) {
    return (
      <div className="pane-empty">
        <div className="kicker accent">Settings</div>
        <h2>Nothing selected</h2>
        <p>Pick a section on the left. Each one opens here on its own.</p>
      </div>
    );
  }

  return (
    <>
      <div className="detail-bar">
        <button className="icon-btn" aria-label="Back to settings" onClick={onBack}>
          <i className="fas fa-chevron-left" />
        </button>
        <span className="detail-status"><span className="pane-dot" />Settings</span>
      </div>
      {/* Keyed by section, so switching sections starts at the top rather than
          at wherever the last one was scrolled to. */}
      <div className="pane-scroll set-pane" key={meta.id}>
        {/* One centred column: the header, the title and every card in the
            section share the same width. */}
        <div className="set-col">
        <div className="pane-head">
          <span className="pane-tag">Settings</span>
          <span className="pane-status"><span className="pane-dot" />{meta.summary}</span>
        </div>
        <h1 className="pane-title">{meta.title}</h1>
        <div className="set-body">
          {meta.id === 'account' && (
            <AccountSection user={user} reloadLists={reloadLists} needsPassword={needsPassword} />
          )}
          {meta.id === 'friends' && (
            <FriendsSection user={user} refreshInbox={refreshInbox} onReload={onReload} />
          )}
          {meta.id === 'bundles' && <BundleCollection user={user} onShareCard={onShareCard} />}
          {meta.id === 'appearance' && <AppearanceSection onOpenSection={onOpenSection} />}
          {meta.id === 'privacy' && <PrivacySection user={user} onPrivacy={onPrivacy} />}
          {meta.id === 'clipboard' && <ClipboardSync />}
          {meta.id === 'desktop' && <DesktopCard />}
          {meta.id === 'troubleshooting' && <TroubleshootingSection />}
          {meta.id === 'about' && <AboutSection updateAvailable={updateAvailable} />}
        </div>
        </div>
      </div>
    </>
  );
}
