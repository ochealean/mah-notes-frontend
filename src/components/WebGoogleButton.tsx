// ============================================================
//  Our own "Continue with Google" button for the WEB.
//  Uses the OAuth *redirect* flow (full-page navigation to Google and back),
//  not the GIS popup/widget. That avoids the unreliable GIS button (0px/hidden),
//  Cross-Origin-Opener-Policy popup errors, FedCM, and any stray floating "G".
//  The return leg is handled in AuthContext via consumeGoogleRedirect().
// ============================================================
import { startGoogleRedirect } from '../lib/googleRedirect';

export default function WebGoogleButton({ intent = 'login', disabled = false, label = 'Continue with Google' }) {
  return (
    <button type="button" className="btn btn-google btn-block" disabled={disabled}
      onClick={() => startGoogleRedirect(intent)}>
      <i className="fab fa-google" style={{ marginRight: 8 }} /> {label}
    </button>
  );
}
