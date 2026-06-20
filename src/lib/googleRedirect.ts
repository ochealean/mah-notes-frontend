// ============================================================
//  Web Google sign-in via the OAuth *redirect* flow (no popup, no GIS widget).
//  We send the browser to Google's consent page; Google redirects back to our
//  app origin with ?code=…&state=…. The app reads the code and posts it to the
//  backend, which exchanges it (with redirectUri) for an ID token.
//
//  This avoids the GIS popup entirely — no Cross-Origin-Opener-Policy issues,
//  no FedCM/One Tap, and no stray floating "G".
// ============================================================
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const STATE_KEY = 'mahnotes_google_oauth_state';

// The redirect URI must exactly match one registered in the Google Cloud console
// (Authorized redirect URIs). We use the bare app origin.
export function googleRedirectUri() {
  return window.location.origin;
}

// Begin sign-in: remember the intent (+ a CSRF nonce) and navigate to Google.
export function startGoogleRedirect(intent /* 'login' | 'link' */) {
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessionStorage.setItem(STATE_KEY, JSON.stringify({ intent, nonce }));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    include_granted_scopes: 'true',
    state: nonce,
    prompt: 'select_account',
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

// On app load, if we came back from Google, return { code, intent } once and
// clean the URL + stored state. Returns null when there's nothing to handle.
export function consumeGoogleRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (!code && !error) return null;

  let stored = null;
  try { stored = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); } catch {}
  sessionStorage.removeItem(STATE_KEY);

  // Strip the OAuth params from the address bar regardless of outcome.
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  url.searchParams.delete('scope');
  url.searchParams.delete('authuser');
  url.searchParams.delete('prompt');
  window.history.replaceState({}, '', url.toString());

  if (error) return { error };
  if (!stored || stored.nonce !== state) return { error: 'state_mismatch' };
  return { code, intent: stored.intent, redirectUri: googleRedirectUri() };
}
