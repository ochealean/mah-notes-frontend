// ============================================================
//  Make links inside notes actually open.
//
//  The sanitizer gives every link target="_blank" (see richtext.ts). In a
//  browser that opens a new tab. In the packaged apps there is no such thing:
//  the desktop webview has no popup handler, so the click lands on nothing at
//  all, and a link in a note looks broken.
//
//  One document-level listener rather than a prop on every renderer, because
//  note bodies are injected as HTML in seven different components and a link
//  can appear in any of them.
//
//  NOTE: the desktop side also needs `opener:allow-default-urls` in the Tauri
//  capability. `opener:allow-open-url` alone enables the command with NO scope,
//  so every URL is refused and the click appears to do nothing at all.
// ============================================================
import { isDesktop, isNative, isWeb } from './platform';

/// Hand a URL to the system browser, away from the app's own webview.
export async function openExternal(url: string) {
  if (isDesktop) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch { /* fall through */ }
  }
  if (isNative) {
    try {
      const { AppLauncher } = await import('@capacitor/app-launcher');
      await AppLauncher.openUrl({ url });
      return;
    } catch { /* fall through */ }
  }
  try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* nothing left */ }
}

/// Installs the listener. Returns a function that removes it again.
export function installExternalLinkHandler(): () => void {
  // The web already does exactly the right thing; intercepting there would
  // only risk breaking ordinary navigation.
  if (isWeb) return () => {};

  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;

    const target = e.target as Element | null;
    const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;

    const href = anchor.getAttribute('href') || '';
    // Only genuinely external schemes. Router links are relative and must keep
    // being handled by the router, not thrown at the operating system.
    if (!/^(https?:|mailto:)/i.test(href)) return;

    // An open document is an EDITABLE surface, so a plain click there has to go
    // on meaning "put the caret here" — otherwise a link's text could never be
    // corrected. Ctrl+click opens it instead, which is what Word and most
    // editors do. Everywhere else a plain click opens, as people expect.
    const editing = !!anchor.closest('[contenteditable="true"]');
    if (editing) {
      if (!e.ctrlKey && !e.metaKey) return;
    } else if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      // Outside the editor, leave modified clicks to the platform.
      return;
    }

    e.preventDefault();
    openExternal(href);
  };

  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}
