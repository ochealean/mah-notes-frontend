// ============================================================
//  Documents tab: search + list of note cards. Checklist boxes in
//  a card preview can be ticked directly (gutter tap), which saves.
// ============================================================
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { notify } from '../lib/notify.js';
import { contentToHtml, escapeHtml, sanitizeHtml } from '../lib/richtext.js';

function scheduleBadge(schedule) {
  if (!schedule) return null;
  const label = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }[schedule] || schedule;
  return <span className="schedule-badge"><i className="fas fa-repeat" /> {label}</span>;
}

function NoteCard({ note, onOpen, onShare, onToggleHidden, onChanged }) {
  const previewRef = useRef(null);
  const navigate = useNavigate();
  const previewHtml = contentToHtml(note.content) || '<span class="note-preview-empty">Empty document</span>';

  // Tap inside the checkbox gutter → toggle + save; tap elsewhere → open editor.
  async function onPreviewClick(e) {
    const item = e.target.closest('.doc-check-item');
    if (item) {
      const rect = item.getBoundingClientRect();
      if (e.clientX - rect.left <= 32) {
        const now = item.getAttribute('data-checked') !== 'true';
        item.setAttribute('data-checked', now ? 'true' : 'false');
        try {
          await api.put(`/api/notes/${note.id}`, { content: sanitizeHtml(previewRef.current.innerHTML) });
        } catch (err) { notify('Failed to save', 'error'); }
        return;
      }
    }
    onOpen(note);
  }

  return (
    <div className={`note-card${note.hidden ? ' content-hidden' : ''}`}>
      <div className="note-card-top">
        <div className="note-card-title">
          <span dangerouslySetInnerHTML={{ __html: escapeHtml(note.title || 'Untitled') }} /> {scheduleBadge(note.schedule)}
        </div>
        <button className="icon-btn hide-toggle note-kebab" aria-label="Hide"
          onClick={(e) => { e.stopPropagation(); onToggleHidden(note.id, !note.hidden); }}>
          <i className={`fas ${note.hidden ? 'fa-eye' : 'fa-eye-slash'}`} />
        </button>
      </div>
      <div ref={previewRef} className="note-preview doc-content" onClick={onPreviewClick}
        dangerouslySetInnerHTML={{ __html: previewHtml }} />
      <div className="card-actions">
        <button className="act-btn open" onClick={() => onOpen(note)}><i className="fas fa-pen-to-square" /> Open</button>
        <button className="act-btn view" onClick={() => navigate(`/view?type=note&id=${encodeURIComponent(note.id)}`)}><i className="fas fa-eye" /> View</button>
        <button className="act-btn share" onClick={() => onShare(note.id)}><i className="fas fa-share-alt" /> Share</button>
        <button className="act-btn danger del" onClick={async () => {
          if (!confirm('Delete this document? This cannot be undone.')) return;
          try { await api.del(`/api/notes/${note.id}`); notify('Document deleted', 'success'); onChanged(); }
          catch (err) { notify(err.message, 'error'); }
        }}><i className="fas fa-trash" /> Delete</button>
      </div>
    </div>
  );
}

export default function DocsTab({ notes, onOpen, onShare, onToggleHidden, onChanged }) {
  const [q, setQ] = useState('');
  const query = q.toLowerCase().trim();
  const filtered = !query ? notes : notes.filter((n) =>
    `${n.title} ${n.content}`.toLowerCase().includes(query));

  return (
    <section className="screen">
      <div className="search-bar">
        <i className="fas fa-search" />
        <input type="text" placeholder="Search documents…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="list">
        {notes.length === 0 ? (
          <div className="empty-state">
            <i className="fas fa-feather-pointed" />
            <p>No documents yet. Tap <b>+</b> to start writing — mix notes, headings and checklists freely.</p>
          </div>
        ) : (
          filtered.map((note) => (
            <NoteCard key={note.id} note={note} onOpen={onOpen} onShare={onShare}
              onToggleHidden={onToggleHidden} onChanged={onChanged} />
          ))
        )}
      </div>
    </section>
  );
}
