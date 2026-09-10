// ============================================================
//  The Alt+N toast.
//
//  Lives in its own tiny Tauri window, declared with focus:false and
//  alwaysOnTop. That is the whole point: if this window took focus, the
//  app the user was working in would lose its selection, and the NEXT
//  Alt+N would fail — an intermittent bug that is miserable to chase.
//
//  Two messages, deliberately the same wording SaveClipActivity already
//  toasts on Android, so the platforms read identically.
// ============================================================
import { useEffect, useState } from 'react';

const HIDE_AFTER = 1600;

export default function Toast() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    let hideTimer: any = null;
    let unlisten: (() => void) | null = null;
    let alive = true;

    // The window is transparent, so the page behind it must be too, or the
    // rounded corners sit on an opaque square.
    document.documentElement.dataset.chrome = 'floating';

    (async () => {
      // Imported lazily so the web and Android bundles never pull Tauri in.
      const [{ listen }, { getCurrentWindow }] = await Promise.all([
        import('@tauri-apps/api/event'),
        import('@tauri-apps/api/window'),
      ]);
      if (!alive) return;
      const win = getCurrentWindow();

      unlisten = await listen<string>('toast:show', (e) => {
        setMessage(String(e.payload || ''));
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => { win.hide().catch(() => {}); }, HIDE_AFTER);
      });

      // Belt and braces. If this window is ever visible without a message —
      // restored by the OS, or shown by something that forgot to send one —
      // hide it rather than leaving an empty box on screen forever.
      if (await win.isVisible().catch(() => false)) {
        setTimeout(() => {
          if (!alive) return;
          setMessage((current) => {
            if (!current) win.hide().catch(() => {});
            return current;
          });
        }, HIDE_AFTER);
      }
    })();

    return () => {
      alive = false;
      clearTimeout(hideTimer);
      delete document.documentElement.dataset.chrome;
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className="toast-window">
      <span className="toast-mark" />
      <span className="toast-text">{message}</span>
    </div>
  );
}
