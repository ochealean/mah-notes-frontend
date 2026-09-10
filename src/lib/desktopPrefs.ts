// ============================================================
//  Desktop-only preferences that live in the OS, not in our storage.
//
//  Run-at-login is a registry entry; the hotkey status is whatever
//  Windows actually granted us. Both are read back from the system
//  rather than remembered, so Settings shows the truth even if
//  something else changed it.
// ============================================================
import { isDesktop } from './platform';

export interface HotkeyStatus {
  captureOk: boolean;
  panelOk: boolean;
  capture: string;
  panel: string;
}

/// Which global hotkeys actually registered. A shortcut is refused when
/// another app already owns it, and that used to be invisible.
export async function getHotkeyStatus(): Promise<HotkeyStatus | null> {
  if (!isDesktop) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<HotkeyStatus>('hotkey_status');
  } catch {
    return null;
  }
}

export async function isAutostartOn(): Promise<boolean> {
  if (!isDesktop) return false;
  try {
    const { isEnabled } = await import('@tauri-apps/plugin-autostart');
    return await isEnabled();
  } catch {
    return false;
  }
}

export async function setAutostart(on: boolean): Promise<void> {
  const mod = await import('@tauri-apps/plugin-autostart');
  if (on) await mod.enable();
  else await mod.disable();
}

/// Does closing the window keep the app alive in the tray?
///
/// Default on, and it is what makes the hotkeys keep working. Rust owns this
/// one because the close handler needs the answer before the WebView is
/// necessarily up.
export async function isKeepRunningOn(): Promise<boolean> {
  if (!isDesktop) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<boolean>('get_keep_running');
  } catch {
    return true;
  }
}

export async function setKeepRunning(on: boolean): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('set_keep_running', { on });
}

/// Sign in with Google through the loopback flow. Returns the same shape the
/// backend already accepts from the website, so nothing server-side changes.
export async function desktopGoogleSignIn(): Promise<{ code: string; redirectUri: string }> {
  const { invoke } = await import('@tauri-apps/api/core');
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  return invoke('google_sign_in', { clientId });
}
