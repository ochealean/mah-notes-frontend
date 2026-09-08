// ============================================================
//  Clipboard tab: text captured from Android's selection toolbar.
//  Highlight anything in any app, tap "Mah Notes" in the copy/paste bar,
//  and it lands here — no app switching, no pasting.
//
//  Each clip can be copied back to the system clipboard (which is also how it
//  reaches Gboard's clipboard panel) or promoted into a real document.
//  Clips are device-local; they never sync.
// ============================================================
import { useState } from 'react';
import { repo } from '../lib/repo';
import { notify } from '../lib/notify';
import { isNative } from '../lib/nativeAuth';
import { escapeHtml } from '../lib/richtext';
import { timeAgo } from '../lib/timeAgo';
import { copyClip, deleteClip, clearClips } from '../lib/clips';

// First line of a clip, used as the card's title.
function clipTitle(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

function ClipCard({ clip, onChanged }) {
  const [busy, setBusy] = useState(false);

  async function copy() {
    try {
      await copyClip(clip.text);
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
    <div className="note-card">
      <div className="note-card-top">
        <div className="note-card-title">
          <span dangerouslySetInnerHTML={{ __html: escapeHtml(clipTitle(clip.text) || 'Empty clip') }} />
        </div>
      </div>
      <div className="note-preview clip-text">{clip.text}</div>
      <div className="card-updated">
        <i className="fas fa-clipboard" /> {clip.source ? `From ${clip.source} · ` : ''}{timeAgo(clip.createdAt)}
      </div>
      <div className="card-actions">
        <button className="act-btn open" onClick={copy}><i className="fas fa-copy" /> Copy</button>
        <button className="act-btn view" onClick={makeNote} disabled={busy}>
          <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-file-lines'}`} /> Make note
        </button>
        <button className="act-btn danger del" onClick={remove}><i className="fas fa-trash" /> Delete</button>
      </div>
    </div>
  );
}

export default function ClipboardTab({ clips, onChanged }) {
  const [q, setQ] = useState('');
  const query = q.toLowerCase().trim();
  const filtered = !query ? clips : clips.filter((c) => c.text.toLowerCase().includes(query));

  async function clearAll() {
    if (!clips.length) return;
    if (!confirm(`Clear all ${clips.length} clip${clips.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
    try { await clearClips(); notify('Clipboard cleared', 'success'); }
    catch (err) { notify(err.message || 'Could not clear', 'error'); }
    finally { onChanged(); }
  }

  return (
    <section className="screen">
      <div className="search-bar">
        <i className="fas fa-search" />
        <input type="text" placeholder="Search clips…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {clips.length > 0 && (
        <div className="list-toolbar">
          <span className="clip-count">{clips.length} clip{clips.length > 1 ? 's' : ''}</span>
          <button className="bulk-delete-btn" onClick={clearAll}>
            <i className="fas fa-trash" /> Clear all
          </button>
        </div>
      )}
      <div className="list">
        {clips.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-clipboard" />
            {isNative ? (
              <p>
                Nothing clipped yet. Highlight text in <b>any</b> app, then tap
                {' '}<b>Mah Notes</b> in the copy/paste bar (it may be under the <b>⋮</b> menu)
                {' '}and it lands here.
              </p>
            ) : (
              <p>
                Clips are captured on your phone: highlight text in any app and tap
                {' '}<b>Mah Notes</b> in the copy/paste bar. They stay on that device, so
                {' '}they don’t appear here on the web.
              </p>
            )}
          </div>
        ) : (
          <>
            {filtered.map((c) => <ClipCard key={c.id} clip={c} onChanged={onChanged} />)}
            {filtered.length === 0 && (
              <div className="empty-state"><i className="fas fa-search" /><p>No matches for “{q}”.</p></div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
