// ============================================================
//  Desktop clipboard bridge.
//
//  The Tauri-side sibling of clipsPlugin.ts. Same shape, same reasoning:
//  Alt+N runs in Rust while the WebView is usually closed to the tray, so
//  captures are queued to disk and drained here when the UI next runs.
//
//  Everything is dynamically imported so the web and Android bundles
//  never pull the Tauri API in.
// ============================================================
import { isDesktop } from './platform';

export type PendingClip = {
  id: string;
  text: string;
  source: string;
  /// Epoch millis, matching the Android bridge so both normalise the same way.
  created_at: number;
};

/// Take the captures Rust queued while we were not running. Destructive on the
/// Rust side, exactly like Android's ClipStore.takePending.
export async function takePendingDesktopClips(): Promise<PendingClip[]> {
  if (!isDesktop) return [];
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const list = await invoke<PendingClip[]>('take_pending_clips');
    return Array.isArray(list) ? list : [];
  } catch {
    // A broken bridge must never stop the app from starting.
    return [];
  }
}

/// Subscribe to captures that happen while the window IS open, so a clip
/// appears in the list immediately rather than at the next launch.
export async function onDesktopCapture(fn: () => void): Promise<() => void> {
  if (!isDesktop) return () => {};
  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen('clip:captured', () => fn());
  } catch {
    return () => {};
  }
}

/// Copy to the system clipboard through Rust rather than the WebView, which
/// is more reliable than navigator.clipboard inside a webview.
export async function desktopCopy(text: string) {
  const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
  await writeText(text);
}
