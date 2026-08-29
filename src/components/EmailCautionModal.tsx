// ============================================================
//  Shown once at signup, right before the account is created, so the user
//  looks at the address one more time before committing to it.
//
//  IMPORTANT — this is NOT a real deliverability check. There's no reliable
//  way to ask Gmail (or any provider) "does this address exist" without
//  actually sending mail: Google doesn't expose that lookup (it's exactly
//  the kind of thing spam tools abuse), and probing it live via SMTP is
//  unreliable and risks getting our own sending IP flagged — the same IP
//  real password-reset emails go out from. So this is a plain reminder, not
//  a finding: we genuinely don't know whether the address is good.
// ============================================================
export default function EmailCautionModal({ email, busy, onCancel, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-circle-info" /> Double-check this email</h3>
          <button className="icon-btn" aria-label="Close" disabled={busy} onClick={onCancel}><i className="fas fa-times" /></button>
        </div>
        <p className="settings-hint-text" style={{ padding: 0, marginBottom: 14 }}>
          Are you sure that <b>{email}</b> is the correct email address? <br/> 
          If it is mistyped or inaccessible, 
          you will not be able to reset your password if you forget it.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-block" disabled={busy} onClick={onCancel}>
            Let me fix it
          </button>
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={onConfirm}>
            {busy ? 'Please wait…' : 'Yes, this is correct'}
          </button>
        </div>
      </div>
    </div>
  );
}
