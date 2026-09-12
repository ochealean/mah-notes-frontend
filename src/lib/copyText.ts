// ============================================================
//  Copy text to the system clipboard, on any of the three platforms.
//
//  `navigator.clipboard` is not dependable inside a packaged webview: on
//  desktop it needs focus it does not always have, and on Android it is
//  refused outright in some contexts. Both failures are silent, which is why
//  the Friends "copy my ID" button looked like it did nothing.
//
//  The clips code already solved this per platform. This is the same routing,
//  pulled out so anything that copies can use it, and returning whether it
//  actually worked so callers can say so.
// ============================================================
import { isDesktop, isNative } from './platform';

export async function copyText(text: string): Promise<boolean> {
  const value = String(text ?? '');
  if (!value) return false;

  try {
    if (isNative) {
      const { default: Clips } = await import('./clipsPlugin');
      await Clips.copyToSystem({ text: value });
      return true;
    }
    if (isDesktop) {
      // Through Rust rather than the webview, for the focus reason above.
      const { desktopCopy } = await import('./clipsDesktop');
      await desktopCopy(value);
      return true;
    }
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Last resort for older webviews and insecure contexts, where the async
    // clipboard API does not exist but the old command still works.
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      // Kept off screen and unfocusable-looking, but it must be IN the document
      // and selectable for execCommand to see it.
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
