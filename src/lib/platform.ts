// ============================================================
//  Which platform are we running on?
//
//  Until now this was a single boolean, `isNative`, meaning "Android
//  APK or not". A Tauri desktop build breaks that: Capacitor is absent
//  there, so `Capacitor.isNativePlatform()` returns false and desktop
//  silently inherits every WEB branch — REST-only data, no local store,
//  no clips tab. All three are wrong for a desktop app.
//
//  So the question splits in two:
//
//    platform       → WHICH OS shell are we in? Use for OS-specific
//                     things: alarms, widgets, the APK updater, the
//                     Capacitor plugins, global hotkeys.
//    hasLocalStore  → does this build own an offline copy of the data?
//                     Use for the repo/sync decision. True on Android
//                     AND desktop; false on the web.
//
//  Most call sites want the second question but were written against
//  the first, back when the two were the same thing.
// ============================================================
import { Capacitor } from '@capacitor/core';

export type Platform = 'web' | 'android' | 'desktop';

// Two signals, checked in this order:
//  1. the build target, set by `npm run build:desktop` / `desktop:dev`. This is
//     deterministic and settled before any script runs, which matters because
//     the dev server is a plain browser page until Tauri loads it.
//  2. Tauri v2's runtime globals, as a safety net for a window opened without
//     the build flag.
const builtForDesktop = import.meta.env.VITE_APP_TARGET === 'desktop';
const isTauri = builtForDesktop
  || (typeof window !== 'undefined'
    && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window));

export const platform: Platform = isTauri
  ? 'desktop'
  : (Capacitor.isNativePlatform() ? 'android' : 'web');

// Kept deliberately narrow: still means "the Android app", exactly as it
// did before, so the ~40 existing call sites keep their current meaning
// and nothing changes behaviour on day one. Prefer one of the predicates
// below when what you actually care about is a capability.
export const isNative = platform === 'android';

export const isDesktop = platform === 'desktop';
export const isWeb = platform === 'web';

// Owns an IndexedDB copy of the data and runs the sync engine, rather
// than talking to the REST API on every read.
export const hasLocalStore = platform !== 'web';

// Can capture clips locally. The website has no capture mechanism, so it
// has nothing to show until clips sync (see the plan's Phase 9).
export const hasClips = platform !== 'web';

// Global hotkeys, tray, and the paste panel — desktop only.
export const hasGlobalHotkeys = platform === 'desktop';
