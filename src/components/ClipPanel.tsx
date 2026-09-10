// ============================================================
//  Alt+M — the paste panel. Their version of Win+V.
//
//  Its own borderless, always-on-top window, hidden rather than
//  destroyed so it opens instantly: building a WebView costs several
//  hundred milliseconds, which is the difference between a launcher and
//  an annoyance.
//
//  Enter pastes into whatever had focus before the panel opened. Rust
//  does the actual work (see paste.rs); this side only decides what.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { listClips, setClipPinned, deleteClip, type Clip } from '../lib/clips';
import { clipTitle } from './ClipboardTab';
import { timeAgo } from '../lib/timeAgo';
import { escapeHtml } from '../lib/richtext';

export default function ClipPanel() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const query = q.toLowerCase().trim();
  const shown = !query ? clips : clips.filter((c) => c.text.toLowerCase().includes(query));

  const refresh = useCallback(async () => {
    setClips(await listClips());
  }, []);

  // Reset to a clean slate every time the panel opens: a stale search from
  // twenty minutes ago is never what you want.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;
    document.documentElement.dataset.chrome = 'floating';
    refresh();

    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      if (!alive) return;
      unlisten = await listen('panel:opened', () => {
        setQ('');
        setActive(0);
        refresh();
        // The window has only just been shown; focus after paint.
        setTimeout(() => inputRef.current?.focus(), 40);
      });
    })();

    setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      alive = false;
      delete document.documentElement.dataset.chrome;
      if (unlisten) unlisten();
    };
  }, [refresh]);

  // Keep the highlighted row in view as the user arrows through.
  useEffect(() => {
    const el = listRef.current?.querySelector('.row.active') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, q]);

  async function hide() {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().hide();
    } catch { /* not in Tauri */ }
  }

  async function paste(clip: Clip) {
    if (!clip) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      // Rust hides the window itself before restoring focus — it has to, or
      // Windows will not hand the foreground back.
      await invoke('paste_clip', { text: clip.text });
    } catch {
      await hide();
    }
  }

  async function togglePin(clip: Clip) {
    await setClipPinned(clip.id, !clip.pinned);
    refresh();
  }

  async function remove(clip: Clip) {
    await deleteClip(clip.id);
    refresh();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); hide(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const clip = shown[active];
      if (!clip) return;
      // Ctrl+Enter copies without pasting, for when you want it on the
      // clipboard but not typed into whatever is behind the panel.
      if (e.ctrlKey) {
        import('../lib/clips').then(({ copyClip }) => copyClip(clip.text)).then(hide);
      } else {
        paste(clip);
      }
    }
  }

  return (
    <div className="clip-panel" onKeyDown={onKeyDown}>
      <div className="clip-panel-search">
        <i className="fas fa-search" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          placeholder="Search your clips"
          spellCheck={false}
        />
        <span className="clip-panel-hint">Esc</span>
      </div>

      <div className="clip-panel-list" ref={listRef}>
        {shown.length === 0 ? (
          <div className="empty-state" style={{ padding: '28px 18px' }}>
            <i className="fas fa-clipboard" />
            <p>
              {clips.length === 0
                ? 'Nothing clipped yet. Select text anywhere and press Alt+N.'
                : 'No clips match that search.'}
            </p>
          </div>
        ) : shown.map((clip, i) => (
          <button
            key={clip.id}
            className={`row${i === active ? ' active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => paste(clip)}
          >
            <div className="row-head">
              {clip.pinned && <i className="fas fa-thumbtack row-pin" />}
              <span
                className="row-title"
                dangerouslySetInnerHTML={{ __html: escapeHtml(clipTitle(clip.text) || 'Empty clip') }}
              />
              <span className="clip-panel-actions">
                <i
                  className="fas fa-thumbtack"
                  title={clip.pinned ? 'Unpin' : 'Pin'}
                  onClick={(e) => { e.stopPropagation(); togglePin(clip); }}
                />
                <i
                  className="fas fa-trash"
                  title="Delete"
                  onClick={(e) => { e.stopPropagation(); remove(clip); }}
                />
              </span>
            </div>
            <div className="row-time">
              {clip.source ? `From ${clip.source} · ` : ''}{timeAgo(clip.createdAt)}
            </div>
          </button>
        ))}
      </div>

      <div className="clip-panel-foot">
        <span><b>Enter</b> paste</span>
        <span><b>Ctrl+Enter</b> copy</span>
        <span><b>↑↓</b> move</span>
      </div>
    </div>
  );
}
