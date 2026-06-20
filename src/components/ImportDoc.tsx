// ============================================================
//  "Import a note from another app" (Docs).
//  Paste text (or load a .txt/.md file), then either import it as-is
//  or let AI tidy it into a clean, structured note. As-is works offline;
//  the AI tidy needs an account + internet.
// ============================================================
import { useRef, useState } from 'react';
import { getToken } from '../lib/api';
import { repo } from '../lib/repo';
import { notify } from '../lib/notify';
import { sanitizeHtml } from '../lib/richtext';
import { tidyNoteText, plainTextToHtml, firstLineTitle } from '../lib/aiImport';

export default function ImportDoc({ onImported }) {
  const fileRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  function close() { setOpen(false); setText(''); }

  function pickFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.onerror = () => notify('Could not read that file.', 'error');
    reader.readAsText(f);
  }

  async function importRaw() {
    if (busy) return;
    if (!text.trim()) { notify('Paste some text or load a file first.', 'info'); return; }
    setBusy(true);
    try {
      const content = sanitizeHtml(plainTextToHtml(text));
      await repo.createNote({ title: firstLineTitle(text), content, schedule: null });
      notify('Note imported', 'success');
      close();
      if (onImported) onImported();
    } catch (err) { notify(err.message || 'Import failed', 'error'); }
    finally { setBusy(false); }
  }

  async function importTidy() {
    if (busy) return;
    if (!text.trim()) { notify('Paste some text or load a file first.', 'info'); return; }
    if (!getToken()) { notify('Sign in first — AI tidy needs an account.', 'info'); return; }
    setBusy(true);
    try {
      const { title, html } = await tidyNoteText(text);
      const content = sanitizeHtml(html) || sanitizeHtml(plainTextToHtml(text));
      await repo.createNote({ title: title || firstLineTitle(text), content, schedule: null });
      notify('Note imported & tidied', 'success');
      close();
      if (onImported) onImported();
    } catch (err) { notify(err.message || 'AI tidy failed', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button className="scan-btn" onClick={() => setOpen(true)}>
        <i className="fas fa-file-import" />
        <span>Import a note from another app</span>
      </button>
      <input ref={fileRef} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown"
        style={{ display: 'none' }} onChange={pickFile} />

      {open && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="popup">
            <div className="popup-head">
              <h3><i className="fas fa-file-import" /> Import a note</h3>
              <button className="icon-btn" aria-label="Close" onClick={close}><i className="fas fa-times" /></button>
            </div>
            <p className="settings-hint-text" style={{ padding: '0 2px 8px' }}>
              Paste text copied from another app (or load a .txt / .md file). Import it as-is, or let AI tidy it into a clean note.
            </p>
            <textarea className="day-textarea" rows={8} placeholder="Paste your note here…"
              value={text} onChange={(e) => setText(e.target.value)} />
            <button className="chip-btn" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>
              <i className="fas fa-file-arrow-up" /> Load a .txt / .md file
            </button>
            <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={importTidy} disabled={busy}>
              <i className="fas fa-wand-magic-sparkles" /> {busy ? 'Working…' : 'Tidy with AI & import'}
            </button>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 9 }} onClick={importRaw} disabled={busy}>
              Import as-is
            </button>
          </div>
        </div>
      )}
    </>
  );
}
