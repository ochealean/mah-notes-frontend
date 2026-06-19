// ============================================================
//  "What's new" — shows the changelog. Pops up automatically the
//  first time the app runs after an update, and is reachable any
//  time from Settings → What's new.
// ============================================================
import { APP_VERSION, CHANGELOG } from '../lib/appInfo';

export default function WhatsNewModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-gift" /> What’s new</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>
        <div className="changelog">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="changelog-entry">
              <div className="changelog-ver">
                <span className="changelog-badge">v{entry.version}</span>
                {entry.title && <span className="changelog-title">{entry.title}</span>}
                {entry.date && <span className="changelog-date">{entry.date}</span>}
              </div>
              <ul className="changelog-list">
                {entry.changes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={onClose}>
          <i className="fas fa-check" /> Got it
        </button>
        <p className="changelog-foot">You’re on version {APP_VERSION}</p>
      </div>
    </div>
  );
}
