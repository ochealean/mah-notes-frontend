// ============================================================
//  Update-available prompt. The user always chooses — "Update now"
//  downloads the APK inside the app and launches Android's installer
//  (falls back to a browser download if that fails); "Later" just
//  dismisses. Nothing installs without the user's tap.
// ============================================================
import { useState } from 'react';
import { startUpdate } from '../lib/updates.js';

export default function UpdateModal({ update, onClose }) {
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    setBusy(true);
    try { await startUpdate(update); } finally { setBusy(false); onClose(); }
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
        <button className="btn btn-primary btn-block" disabled={busy} onClick={go}>
          {busy
            ? <><i className="fas fa-spinner fa-spin" /> Downloading…</>
            : <><i className="fas fa-download" /> Update now</>}
        </button>
        {!busy && <button className="btn btn-ghost btn-block" style={{ marginTop: 9 }} onClick={onClose}>Later</button>}
        <p className="changelog-foot">
          {busy ? 'Android will ask you to install when the download finishes.' : 'Downloads in the app, then Android asks you to install.'}
        </p>
      </div>
    </div>
  );
}
