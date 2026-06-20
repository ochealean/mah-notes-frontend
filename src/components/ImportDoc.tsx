// ============================================================
//  "Import a note from another app" (Docs).
//  Paste text, load a .txt/.md file, OR attach a photo of a note, then
//  either import it as-is or let AI tidy it into a clean, structured note.
//  As-is works offline (text only); the AI tidy needs an account + internet
//  and can read an attached photo (handwritten or printed).
// ============================================================
import { useRef, useState } from 'react';
import { getToken } from '../lib/api';
import { repo } from '../lib/repo';
import { notify } from '../lib/notify';
import { sanitizeHtml } from '../lib/richtext';
import { tidyNoteText, plainTextToHtml, firstLineTitle } from '../lib/aiImport';

export default function ImportDoc({ onImported }) {
  const fileRef = useRef(null);
  const imgRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState('');
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false); setText(''); clearImage();
  }

  function pickFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.onerror = () => notify('Could not read that file.', 'error');
    reader.readAsText(f);
  }

  function pickImage(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { notify('Please choose an image file.', 'info'); return; }
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    setImage(f);
    setImgUrl(URL.createObjectURL(f));
  }

  function clearImage() {
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    setImage(null); setImgUrl('');
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
    if (!text.trim() && !image) { notify('Paste some text or attach a photo first.', 'info'); return; }
    if (!getToken()) { notify('Sign in first — AI tidy needs an account.', 'info'); return; }
    setBusy(true);
    try {
      const { title, html } = await tidyNoteText(text, image);
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
      <input ref={imgRef} type="file" accept="image/*"
        style={{ display: 'none' }} onChange={pickImage} />

      {open && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="popup">
            <div className="popup-head">
              <h3><i className="fas fa-file-import" /> Import a note</h3>
              <button className="icon-btn" aria-label="Close" onClick={close}><i className="fas fa-times" /></button>
            </div>
            <p className="settings-hint-text" style={{ padding: '0 2px 8px' }}>
              Paste text (or load a .txt / .md file), or attach a photo of a note. Import text as-is, or let AI tidy
              text and/or a photo into a clean note.
            </p>
            <textarea className="day-textarea" rows={8} placeholder="Paste your note here…"
              value={text} onChange={(e) => setText(e.target.value)} />

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button className="chip-btn" onClick={() => fileRef.current?.click()}>
                <i className="fas fa-file-arrow-up" /> Load .txt / .md
              </button>
              <button className="chip-btn" onClick={() => imgRef.current?.click()}>
                <i className="fas fa-image" /> {image ? 'Change photo' : 'Attach a photo'}
              </button>
            </div>

            {imgUrl && (
              <div className="import-img-preview">
                <img src={imgUrl} alt="Attached note" />
                <button className="import-img-remove" aria-label="Remove photo" onClick={clearImage}>
                  <i className="fas fa-times" />
                </button>
              </div>
            )}

            <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={importTidy} disabled={busy}>
              <i className="fas fa-wand-magic-sparkles" /> {busy ? 'Working…' : 'Tidy with AI & import'}
            </button>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 9 }} onClick={importRaw} disabled={busy}>
              Import text as-is
            </button>
          </div>
        </div>
      )}
    </>
  );
}
