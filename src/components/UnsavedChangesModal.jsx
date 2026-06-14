// ============================================================
//  Unsaved-changes guard. Shown when the user tries to leave an
//  editor (back/close) while there are edits that haven't been saved.
//  Offers Save / Don't save / Cancel.
// ============================================================
export default function UnsavedChangesModal({ onSave, onDiscard, onCancel, saving }) {
  return (
    <div className="modal-overlay confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="popup confirm-popup">
        <div className="popup-head">
          <h3><i className="fas fa-triangle-exclamation" /> Unsaved changes</h3>
        </div>
        <p className="confirm-text">Your changes won’t be saved. What would you like to do?</p>
        <div className="confirm-actions">
          <button className="btn btn-primary btn-block" disabled={saving} onClick={onSave}>
            {saving ? 'Saving…' : <><i className="fas fa-check" /> Save changes</>}
          </button>
          <button className="btn btn-danger-ghost btn-block" disabled={saving} onClick={onDiscard}>
            <i className="fas fa-trash-can" /> Don’t save
          </button>
          <button className="btn btn-ghost btn-block" disabled={saving} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
