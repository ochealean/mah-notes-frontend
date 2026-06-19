// ============================================================
//  Update-available prompt. The user always chooses.
//   • "Update now" tries the seamless in-app install (download +
//     Android installer). If that fails it shows the real error and
//     points the user at the reliable browser path.
//   • "Download in browser" always works: opens the APK in the real
//     external browser (Chrome), which downloads + installs it.
//  Nothing installs without the user's tap.
// ============================================================
import { useState } from 'react';
import { installInApp, openInBrowser } from '../lib/updates.js';

export default function UpdateModal({ update, onClose }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function inApp() {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await installInApp(update); // resolves once the installer is launched
      onClose();
    } catch (e) {
      // Show why it failed so the in-app path can be perfected, and steer
      // the user to the reliable browser button below.
      setErr((e && e.message) || 'In-app install failed.');
    } finally {
      setBusy(false);
    }
  }

  async function browser() {
    await openInBrowser(update);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-cloud-arrow-down" /> Update available</h3>
          {!busy && <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>}
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

        <button className="btn btn-primary btn-block" disabled={busy} onClick={inApp}>
          {busy
            ? <><i className="fas fa-spinner fa-spin" /> Downloading…</>
            : <><i className="fas fa-download" /> Update now</>}
        </button>
        <button className="btn btn-ghost btn-block" style={{ marginTop: 9 }} disabled={busy} onClick={browser}>
          <i className="fas fa-up-right-from-square" /> Download in browser
        </button>
        {!busy && <button className="btn btn-block update-later" style={{ marginTop: 9 }} onClick={onClose}>Later</button>}

        <p className="changelog-foot">
          {busy ? 'Android will ask you to install when the download finishes.' : 'Seamless install can need “Install unknown apps” permission; the browser path always works.'}
        </p>
      </div>
    </div>
  );
}
