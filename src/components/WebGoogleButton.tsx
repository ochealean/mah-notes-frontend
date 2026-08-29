// ============================================================
//  Our own "Continue with Google" button for the WEB.
//  Uses the OAuth *redirect* flow (full-page navigation to Google and back),
//  not the GIS popup/widget. That avoids the unreliable GIS button (0px/hidden),
//  Cross-Origin-Opener-Policy popup errors, FedCM, and any stray floating "G".
//  The return leg is handled in AuthContext via consumeGoogleRedirect().
// ============================================================
import { useState } from 'react';
import { startGoogleRedirect } from '../lib/googleRedirect';

export default function WebGoogleButton({ intent = 'login', disabled = false, label = 'Continue with Google' }) {
  // The full-page navigation to Google isn't instant. Without this the button
  // looks dead for that beat, and a second click overwrites the CSRF nonce we
  // just stored — so latch it on the first click and never fire twice.
  const [redirecting, setRedirecting] = useState(false);

  function onClick() {
    if (redirecting || disabled) return;
    setRedirecting(true);
    startGoogleRedirect(intent);
  }

  return (
    <button type="button" className="btn btn-google btn-block" disabled={disabled || redirecting} onClick={onClick}>
      {redirecting ? (
        <><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} /> Redirecting to Google…</>
      ) : (
        <><i className="fab fa-google" style={{ marginRight: 8 }} /> {label}</>
      )}
    </button>
  );
}
