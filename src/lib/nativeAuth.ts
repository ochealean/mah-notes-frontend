// ============================================================
//  Native Google Sign-In (Android APK) via @capgo/capacitor-social-login.
//
//  On the web this is never used — AuthScreen renders the normal
//  @react-oauth/google button instead. On a device the plugin uses
//  the native Google account picker and returns an ID token, which our
//  backend /api/auth/google already verifies (no backend change needed).
//
//  The webClientId MUST be the "Web application" OAuth client ID — the
//  same value the backend checks (VITE_GOOGLE_CLIENT_ID) — so the
//  returned idToken's audience matches.
// ============================================================
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

const WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
let initPromise = null;

// Initialize the plugin once (lazy — only loads native code on a device).
export function initNativeGoogle() {
  if (!isNative) return Promise.resolve();
  if (!initPromise) {
    initPromise = import('@capgo/capacitor-social-login').then(({ SocialLogin }) =>
      SocialLogin.initialize({ google: { webClientId: WEB_CLIENT_ID } })
    );
  }
  return initPromise;
}

// Trigger the native account picker and return a Google ID token.
// NOTE: we do NOT pass `scopes`. The plugin already requests email/profile/openid
// by default, and the returned ID token carries email + name + picture (all the
// backend needs). Passing custom scopes would require modifying MainActivity.
export async function nativeGoogleSignIn() {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  await initNativeGoogle();
  const res: any = await SocialLogin.login({ provider: 'google', options: {} });
  const idToken = res?.result?.idToken;
  if (!idToken) throw new Error('Google did not return an ID token.');
  return idToken;
}
