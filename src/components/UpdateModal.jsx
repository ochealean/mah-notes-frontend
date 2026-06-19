// ============================================================
//  Update-available prompt. The user always chooses — "Update now"
//  opens the APK download in the system browser (Android then asks
//  them to install); "Later" just dismisses. Nothing is automatic.
// ============================================================
import { startUpdate } from '../lib/updates.js';

export default function UpdateModal({ update, onClose }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-cloud-arrow-down" /> Update available</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>
        <p className="reconcile-intro">
          Version <b>{update.version}</b> is ready. Update now to get the latest fixes and features.
        </p>
        {update.notes && <div className="update-notes">{update.notes}</div>}
        <button className="btn btn-primary btn-block" onClick={() => { startUpdate(update); onClose(); }}>
          <i className="fas fa-download" /> Update now
        </button>
        <button className="btn btn-ghost btn-block" style={{ marginTop: 9 }} onClick={onClose}>Later</button>
        {!update.apkUrl && (
          <p className="changelog-foot">Opens the release page — download the APK there.</p>
        )}
      </div>
    </div>
  );
}
