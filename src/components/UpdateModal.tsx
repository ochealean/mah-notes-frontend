// ============================================================
//  Update-available prompt. The user always chooses.
//   • ANDROID — "Update now" tries the seamless in-app install (download +
//     Android installer). If that fails it shows the real error and
//     points the user at the reliable browser path.
//   • "Download in browser" always works: opens the APK in the real
//     external browser (Chrome), which downloads + installs it.
//   • WINDOWS — "Update now" downloads the signed build, swaps the app and
//     restarts it. Nothing to find, no file to open. If that fails for any
//     reason the browser download is still there underneath.
//   • "Don't remind me again" stops the prompt from auto-opening — a
//     red dot in Settings → Check for updates is the only signal then.
//  Closing the prompt records this version so it won't nag again.
// ============================================================
import { useState } from 'react';
import {
  installInApp, installDesktopUpdate, openInBrowser,
  markUpdateDismissed, setUpdateMuted, isUpdateMuted,
} from '../lib/updates';
import { isDesktop, isNative } from '../lib/platform';

export default function UpdateModal({ update, onClose }) {
  const [busy, setBusy] = useState(false);
  // 0..1 while a desktop update downloads. Android reports nothing granular,
  // so it stays at 0 there and the button just spins.
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const [dontRemind, setDontRemind] = useState(isUpdateMuted());

  // Every dismissal funnels through here: remember the version (so it won't
  // auto-pop again) and apply the "don't remind me again" choice.
  function close() {
    markUpdateDismissed(update.version);
    setUpdateMuted(dontRemind);
    onClose();
  }

  async function inApp() {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      if (isDesktop) {
        // Does not return: the app restarts into the new version.
        await installDesktopUpdate(setProgress);
      } else {
        await installInApp(update); // resolves once the installer is launched
      }
      close();
    } catch (e) {
      // Tauri rejects an invoke with a plain STRING, not an Error, so reading
      // `.message` produced undefined and the fallback text swallowed the only
      // clue there was. Take whichever form it arrives in.
      const reason = typeof e === 'string' ? e : (e?.message || (e ? String(e) : ''));
      setErr(reason ? `The update could not be installed. ${reason}` : 'The update could not be installed.');
    } finally {
      setBusy(false);
    }
  }

  async function browser() {
    await openInBrowser(update);
    close();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) close(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-cloud-arrow-down" /> Update available</h3>
          {!busy && <button className="icon-btn" aria-label="Close" onClick={close}><i className="fas fa-times" /></button>}
        </div>
        <p className="reconcile-intro">
          Version <b>{update.version}</b> is ready. Update now to get the latest fixes and features.
        </p>
        {update.notes && <div className="update-notes">{update.notes}</div>}

        {err && (
          <div className="update-error">
            <b><i className="fas fa-triangle-exclamation" /> Couldn’t install in-app.</b>
            <span>{err}</span>
            <span>Use <b>Download in browser</b> below — it always works.</span>
          </div>
        )}

{/* Android gets the seamless path first. Everywhere else the browser
            download IS the path, so it becomes the primary button rather than
            a fallback sitting under one that cannot work. */}
{/* Both platforms can now install without leaving the app. The browser
            download stays as a fallback for when that fails. */}
        <button className="btn btn-primary btn-block" disabled={busy} onClick={inApp}>
          {busy
            ? <>
                <i className="fas fa-circle-notch fa-spin" />
                {progress > 0 ? ` Downloading… ${Math.round(progress * 100)}%` : ' Downloading…'}
              </>
            : <><i className="fas fa-download" /> Update now</>}
        </button>
        <button className="btn btn-ghost btn-block" style={{ marginTop: 9 }} disabled={busy} onClick={browser}>
          <i className="fas fa-up-right-from-square" />
          {isNative ? ' Download in browser' : ' Download the installer instead'}
        </button>

        {!busy && (
          <>
            <label className="update-remind">
              <input type="checkbox" checked={dontRemind} onChange={(e) => setDontRemind(e.target.checked)} />
              <span>Don’t remind me again — I’ll see a dot in Settings</span>
            </label>
            <button className="btn btn-block update-later" onClick={close}>Later</button>
          </>
        )}

        <p className="changelog-foot">
          {isNative
            ? (busy
              ? 'Android will ask you to install when the download finishes.'
              : 'Seamless install can need “Install unknown apps” permission; the browser path always works.')
            : (busy
              ? 'Mah Notes will close and reopen once the update is in place.'
              : 'The update installs itself and reopens the app. If that fails, the installer download always works.')}
        </p>
      </div>
    </div>
  );
}
