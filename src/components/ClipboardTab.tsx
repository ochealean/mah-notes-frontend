// ============================================================
//  Clipboard, v2: text captured from Android's selection toolbar.
//  Highlight anything in any app, tap "Mah Notes" in the copy/paste
//  bar, and it lands here — no app switching, no pasting.
//
//  Rows in the rail, the full clip in the pane. Copy back to the
//  system clipboard or promote a clip into a real document.
//
//  Clips are device-local: they never sync, and they only exist on the
//  phone that captured them. The web build therefore does not offer this
//  tab at all (see TABS in MainApp), so everything here is native-only.
// ============================================================
import { useState } from 'react';
import { repo } from '../lib/repo';
import { notify } from '../lib/notify';
import { escapeHtml } from '../lib/richtext';
import { timeAgo } from '../lib/timeAgo';
import { copyClip, deleteClip } from '../lib/clips';

// First line of a clip, used as its title.
export function clipTitle(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

// ── The list (rail) ──────────────────────────────────────
export default function ClipboardTab({ clips, selectedId, onSelect, searching, selecting, selected, onToggleSelect }) {
  if (!clips.length) {
    return searching ? (
      <div className="empty-state">
        <i className="fas fa-search" />
        <p>No clips match your search.</p>
      </div>
    ) : (
      <div className="empty-state">
        <i className="fas fa-clipboard" />
        <p>
          Nothing clipped yet. Highlight text in <b>any</b> app, then tap <b>Mah Notes</b> in
          the copy/paste bar (it may be under the <b>⋮</b> menu) and it lands here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rail-group kicker">Clipped</div>
      {clips.map((clip) => {
        const checked = !!selected?.has(clip.id);
        return (
        <button
          key={clip.id}
          className={`row${clip.id === selectedId && !selecting ? ' active' : ''}${checked ? ' checked' : ''}`}
          onClick={() => (selecting ? onToggleSelect(clip.id) : onSelect(clip))}
        >
          <div className="row-head">
            {selecting && (
              <span className={`row-check${checked ? ' on' : ''}`}><i className="fas fa-check" /></span>
            )}
            <span className="row-title"
              dangerouslySetInnerHTML={{ __html: escapeHtml(clipTitle(clip.text) || 'Empty clip') }} />
          </div>
          <div className="row-time">
            {clip.source ? `From ${clip.source} · ` : ''}{timeAgo(clip.createdAt)}
          </div>
        </button>
        );
      })}
    </>
  );
}

// ── The pane ─────────────────────────────────────────────
export function ClipPane({ clip, onChanged, onBack }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!clip) {
    return (
      <div className="pane-empty">
        <div className="kicker accent">Clipped</div>
        <h2>Nothing selected</h2>
        <p>Pick a clip on the left to read it in full, copy it back, or turn it into a document.</p>
      </div>
    );
  }

  async function copy() {
    try {
      await copyClip(clip.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      notify('Copied to clipboard', 'success');
    } catch (err) { notify(err.message || 'Could not copy', 'error'); }
  }

  // Promote a clip to a real document — that one DOES sync, unlike the clip.
  async function makeNote() {
    if (busy) return;
    setBusy(true);
    try {
      await repo.createNote({
        title: clipTitle(clip.text).slice(0, 60) || 'Clipped text',
        content: `<p>${escapeHtml(clip.text).replace(/\n/g, '<br>')}</p>`,
      });
      notify('Saved as a document', 'success');
    } catch (err) { notify(err.message || 'Could not create the document', 'error'); }
    finally { setBusy(false); }
  }

  async function remove() {
    try { await deleteClip(clip.id); onChanged(); }
    catch (err) { notify(err.message || 'Could not delete', 'error'); }
  }

  return (
    <>
      <div className="detail-bar">
        <button className="icon-btn" aria-label="Back to clips" onClick={onBack}>
          <i className="fas fa-chevron-left" />
        </button>
        <span className="detail-status"><span className="pane-dot" />{timeAgo(clip.createdAt)}</span>
      </div>

      <div className="pane-scroll">
        <div className="pane-head">
          <span className="pane-tag">Clipped</span>
          <span className="pane-status">
            <span className="pane-dot" />
            {clip.source ? `From ${clip.source} · ` : ''}{timeAgo(clip.createdAt)} · stays on this device, never synced
          </span>
        </div>

        <h1 className="pane-title" style={{ fontSize: 34, maxWidth: '26ch' }}>
          {clipTitle(clip.text) || 'Empty clip'}
        </h1>

        <div className="pane-clip">{clip.text}</div>

        <div className="pane-buttons">
          <button className="pane-btn solid" onClick={copy}>
            <i className="fas fa-copy" /> {copied ? 'Copied' : 'Copy'}
          </button>
          <button className="pane-btn" onClick={makeNote} disabled={busy}>
            <i className={`fas ${busy ? 'fa-circle-notch fa-spin' : 'fa-file-lines'}`} /> Make document
          </button>
          <button className="pane-btn icon-only" aria-label="Delete clip" onClick={remove}>
            <i className="fas fa-trash" />
          </button>
        </div>
      </div>
    </>
  );
}
