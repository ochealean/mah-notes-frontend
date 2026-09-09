// ============================================================
//  Documents, v2.
//
//  The list is now rows in the rail — no per-card button row, no
//  View button. Selecting a document shows it in the pane, and the
//  verbs (edit, pin, hide, share, delete) appear once, next to the
//  thing you are reading, in the hover cluster.
//
//  Checklist boxes stay tickable in both places: a tap inside the
//  32px gutter toggles and saves.
//
//  "Hidden" is a LIST-only privacy state: it blanks the row snippet so
//  nobody reads your notes over your shoulder while you scroll. Opening
//  the document still shows it in full — hiding is not locking.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { repo } from '../lib/repo';
import { notify } from '../lib/notify';
import { contentToHtml, escapeHtml, sanitizeHtml } from '../lib/richtext';
import { loadDraft, clearDraft } from '../lib/drafts';
import { timeAgo } from '../lib/timeAgo';

// Plain-text preview of a saved draft's HTML body, for the resume banner.
function draftPreview(d) {
  const text = String(d?.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return (d?.title || '').trim() || text || 'Untitled draft';
}

// One-line summary of a document, for the row.
export function snippetOf(note) {
  const text = String(contentToHtml(note?.content) || '')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return text || 'Empty document';
}

function wordCount(note) {
  const text = snippetOf(note);
  return text === 'Empty document' ? 0 : text.split(/\s+/).filter(Boolean).length;
}

const SCHEDULE_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

function DocRow({ note, active, onSelect, selecting, checked, onToggleSelect }) {
  return (
    <button
      className={`row${active && !selecting ? ' active' : ''}${checked ? ' checked' : ''}`}
      onClick={() => (selecting ? onToggleSelect(note.id) : onSelect(note))}
    >
      <div className="row-head">
        {selecting && (
          <span className={`row-check${checked ? ' on' : ''}`}><i className="fas fa-check" /></span>
        )}
        {note.pinned && <i className="fas fa-thumbtack row-pin" title="Pinned" />}
        <span className="row-title" dangerouslySetInnerHTML={{ __html: escapeHtml(note.title || 'Untitled') }} />
      </div>
      {note.hidden
        ? <div className="row-snippet is-hidden"><i className="fas fa-eye-slash" /> Hidden from the list</div>
        : <div className="row-snippet">{snippetOf(note)}</div>}
      {note.updatedAt && <div className="row-time">{timeAgo(note.updatedAt)}</div>}
    </button>
  );
}

// ── The list (rail) ──────────────────────────────────────
export default function DocsTab({ notes, selectedId, onSelect, onNew, searching, selecting, selected, onToggleSelect }) {
  // A new-doc draft (app closed mid-typing before the first save). Re-check on
  // mount and whenever the list changes (saving a doc clears its own draft).
  const [draft, setDraft] = useState(() => loadDraft('note:new'));
  useEffect(() => { setDraft(loadDraft('note:new')); }, [notes]);

  const pinned = notes.filter((n) => n.pinned);
  const rest = notes.filter((n) => !n.pinned);

  if (!notes.length) {
    return searching ? (
      <div className="empty-state">
        <i className="fas fa-search" />
        <p>No documents match your search.</p>
      </div>
    ) : (
      <div className="empty-state">
        <i className="fas fa-feather-pointed" />
        <p>No documents yet. Tap <b>+</b> to start writing. Mix notes, headings and checklists freely.</p>
      </div>
    );
  }

  return (
    <>
      {draft && (
        <div className="docs-draft-banner">
          <div className="ddb-main">
            <div className="ddb-title"><i className="fas fa-clock-rotate-left" /> Unsaved draft</div>
            <div className="ddb-sub">{draftPreview(draft)}</div>
          </div>
          <button className="ddb-resume" onClick={() => onNew && onNew()}>Resume</button>
          <button className="ddb-discard" aria-label="Discard draft"
            onClick={() => { clearDraft('note:new'); setDraft(null); }}>
            <i className="fas fa-times" />
          </button>
        </div>
      )}

      {pinned.length > 0 && (
        <>
          <div className="rail-group kicker">Pinned</div>
          {pinned.map((n) => (
            <DocRow key={n.id} note={n} active={n.id === selectedId} onSelect={onSelect}
              selecting={selecting} checked={!!selected?.has(n.id)} onToggleSelect={onToggleSelect} />
          ))}
          <div className="rail-rule" />
        </>
      )}
      <div className="rail-group kicker">{pinned.length ? 'All documents' : 'Documents'}</div>
      {rest.map((n) => (
        <DocRow key={n.id} note={n} active={n.id === selectedId} onSelect={onSelect}
          selecting={selecting} checked={!!selected?.has(n.id)} onToggleSelect={onToggleSelect} />
      ))}
    </>
  );
}

// ── The reading pane ─────────────────────────────────────
export function DocPane({ note, onEdit, onTogglePin, onToggleHidden, onShare, onDelete, onBack }) {
  const proseRef = useRef(null);

  if (!note) {
    return (
      <div className="pane-empty">
        <div className="kicker accent">Documents</div>
        <h2>Nothing selected</h2>
        <p>Pick a document on the left, or start a new one. Whatever you open is shown here in full.</p>
      </div>
    );
  }

  const html = contentToHtml(note.content) || '<span class="note-preview-empty">Empty document</span>';
  const words = wordCount(note);

  // Tap inside the checkbox gutter → toggle + save; tap a link → let it
  // navigate. Everything else is just reading.
  async function onProseClick(e) {
    if (e.target.closest('a')) return;
    const item = e.target.closest('.doc-check-item');
    if (!item) return;
    const rect = item.getBoundingClientRect();
    if (e.clientX - rect.left > 32) return;
    const now = item.getAttribute('data-checked') !== 'true';
    item.setAttribute('data-checked', now ? 'true' : 'false');
    try { await repo.updateNote(note.id, { content: sanitizeHtml(proseRef.current.innerHTML) }); }
    catch { notify('Failed to save', 'error'); }
  }

  async function remove() {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    try { await repo.deleteNote(note.id); notify('Document deleted', 'success'); onDelete(); }
    catch (err) { notify(err.message, 'error'); }
  }

  return (
    <>
      <div className="detail-bar">
        <button className="icon-btn" aria-label="Back to documents" onClick={onBack}>
          <i className="fas fa-chevron-left" />
        </button>
        <span className="detail-status">
          <span className="pane-dot" />
          {note.updatedAt ? `Updated ${timeAgo(note.updatedAt)}` : 'All changes saved'}
        </span>
        <button className="detail-action" onClick={() => onEdit(note)}>Edit</button>
      </div>

      <div className="pane-scroll">
        <div className="pane-head">
          <span className="pane-tag">{SCHEDULE_LABEL[note.schedule] || 'Document'}</span>
          <span className="pane-status">
            <span className="pane-dot" />
            {words} word{words === 1 ? '' : 's'}
            {note.updatedAt ? ` · updated ${timeAgo(note.updatedAt)}` : ''}
          </span>
          {note.hidden && (
            <span className="pane-tag hidden-tag"><i className="fas fa-eye-slash" /> Hidden in list</span>
          )}
        </div>

        <h1 className="pane-title">{note.title || 'Untitled document'}</h1>

        {/* Always readable here. Hiding only affects the list. */}
        <div ref={proseRef} className="pane-prose doc-content" onClick={onProseClick}
          dangerouslySetInnerHTML={{ __html: html }} />

        {/* On a phone this row sits under the content; on a desktop CSS lifts
            it into the floating cluster at the bottom right of the pane. */}
        <div className="cluster">
          <button className="cluster-btn" aria-label="Edit" title="Edit" onClick={() => onEdit(note)}>
            <i className="fas fa-pen" />
          </button>
          <button className={`cluster-btn${note.pinned ? ' on' : ''}`} aria-label="Pin"
            title={note.pinned ? 'Unpin' : 'Pin to top'} onClick={() => onTogglePin(note.id, !note.pinned)}>
            <i className="fas fa-thumbtack" />
          </button>
          <button className={`cluster-btn${note.hidden ? ' on' : ''}`} aria-label="Hide from list"
            title={note.hidden ? 'Show in the list' : 'Hide from the list'}
            onClick={() => onToggleHidden(note.id, !note.hidden)}>
            <i className={`fas ${note.hidden ? 'fa-eye' : 'fa-eye-slash'}`} />
          </button>
          <button className="cluster-btn" aria-label="Share" title="Share" onClick={() => onShare(note.id)}>
            <i className="fas fa-share-nodes" />
          </button>
          <button className="cluster-btn danger" aria-label="Delete" title="Delete" onClick={remove}>
            <i className="fas fa-trash" />
          </button>
        </div>
      </div>
    </>
  );
}
