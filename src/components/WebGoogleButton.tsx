// ============================================================
//  Our own "Continue with Google" button for the WEB.
//  Uses the auth-code flow (popup) instead of the GIS-rendered <GoogleLogin>
//  widget — that widget renders unreliably in some browsers (0px / hidden) and
//  could leave a stray floating "G". This button is plain markup we control; it
//  hands the auth `code` to onCode(), which the backend exchanges for an id token.
// ============================================================
import { useGoogleLogin } from '@react-oauth/google';

export default function WebGoogleButton({ onCode, onError, disabled, label = 'Continue with Google' }) {
  const start = useGoogleLogin({
    flow: 'auth-code',
    onSuccess: (resp) => { if (resp?.code) onCode(resp.code); },
    onError: () => onError && onError(),
  });

  return (
    <button type="button" className="btn btn-google btn-block" disabled={disabled} onClick={() => start()}>
      <i className="fab fa-google" style={{ marginRight: 8 }} /> {label}
    </button>
  );
}
