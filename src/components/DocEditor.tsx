// ============================================================
//  Document editor sheet: rich-text contentEditable surface with a
//  formatting toolbar and inline checklists. Logic ported from the
//  original app's editor.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { repo } from '../lib/repo';
import { notify } from '../lib/notify';
import { rateGate } from '../lib/rateLimit';
import { contentToHtml, sanitizeHtml } from '../lib/richtext';
import { saveDraft, loadDraft, clearDraft } from '../lib/drafts';
import UnsavedChangesModal from './UnsavedChangesModal';

export default function DocEditor({ initial, onClose, onSaved }) {
  const editorRef = useRef(null);
  const toolbarRef = useRef(null);
  const [title, setTitle] = useState(initial?.title || '');
  const [schedule, setSchedule] = useState(initial?.schedule || '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // The "Repeat" row only makes sense for checklists (it resets the boxes on a
  // schedule), so it's hidden until the doc actually contains a checklist.
  const [hasChecklist, setHasChecklist] = useState(false);
  // Drafts: a brand-new doc shares one slot; edits to an existing doc key by id.
  const draftKey = initial?.id ? `note:${initial.id}` : 'note:new';
  const [restoredDraft, setRestoredDraft] = useState(false);
  // Bumped on every content change so the autosave effect re-runs (the editor
  // body isn't React state, so we can't depend on it directly).
  const [draftTick, setDraftTick] = useState(0);

  // Mark the doc edited: enables Save, and triggers the debounced draft autosave.
  function markChanged() { setDirty(true); setDraftTick((t) => t + 1); }

  // Leaving with unsaved edits → ask first (Save / Don't save / Cancel).
  function requestClose() { if (dirty) setConfirmLeave(true); else onClose(); }
  function confirmSave() { setConfirmLeave(false); save(); }
  // Explicit "Don't save": the work is being thrown away, so drop the draft too.
  function discardAndClose() { clearDraft(draftKey); onClose(); }

  function refreshChecklist() {
    setHasChecklist(!!editorRef.current?.querySelector('.doc-check-item'));
  }

  // Revert the restored draft back to what's actually saved (or empty for a
  // new doc) and forget it.
  function discardDraft() {
    clearDraft(draftKey);
    const editor = editorRef.current;
    if (editor) editor.innerHTML = initial ? contentToHtml(initial.content || '') : '';
    setTitle(initial?.title || '');
    setSchedule(initial?.schedule || '');
    setDirty(false);
    setRestoredDraft(false);
    refreshChecklist();
  }

  // Seed the editable surface once, then restore an unsaved draft if one exists
  // (e.g. the app was closed mid-typing) and it actually differs from what's saved.
  useEffect(() => {
    const editor = editorRef.current;
    const savedHtml = initial ? contentToHtml(initial.content || '') : '';
    editor.innerHTML = savedHtml;
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch {}

    const draft = loadDraft(draftKey);
    if (draft) {
      const draftHtml = contentToHtml(draft.content || '');
      const changed = draftHtml !== savedHtml
        || (draft.title || '') !== (initial?.title || '')
        || (draft.schedule || '') !== (initial?.schedule || '');
      if (changed && (draftHtml.trim() || (draft.title || '').trim())) {
        editor.innerHTML = draftHtml;
        setTitle(draft.title || '');
        setSchedule(draft.schedule || '');
        setDirty(true);
        setRestoredDraft(true);
      }
    }

    refreshChecklist();
    setTimeout(() => { (initial?.title ? editor : null)?.focus(); updateToolbarState(); }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave the in-progress doc to a local draft (debounced) whenever it
  // changes, so closing the app mid-typing never loses work. Cleared on save.
  useEffect(() => {
    if (!dirty) return undefined;
    const id = setTimeout(() => {
      const content = sanitizeHtml(editorRef.current?.innerHTML || '');
      const plain = content.replace(/<[^>]*>/g, '').replace(/​|&nbsp;/g, '').trim();
      if (!title.trim() && !plain) { clearDraft(draftKey); return; }
      saveDraft(draftKey, { title, content, schedule });
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, schedule, draftTick, dirty]);

  // ── DOM helpers (operate on the editor element) ──
  const makeCheckItem = (innerHtml?: string) => {
    const item = document.createElement('div');
    item.className = 'doc-check-item';
    item.setAttribute('data-checked', 'false');
    item.innerHTML = innerHtml && innerHtml.trim() ? innerHtml : '<br>';
    return item;
  };
  const placeCaretAtStart = (el) => {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(el);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };
  function getCurrentBlock() {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    let node: any = range.startContainer;
    if (node === editor) node = editor.childNodes[range.startOffset] || editor.lastChild;
    if (!node) return null;
    while (node.parentNode && node.parentNode !== editor) node = node.parentNode;
    if (!node.parentNode) return null;
    if (node.nodeType === Node.TEXT_NODE) {
      const div = document.createElement('div');
      node.replaceWith(div);
      div.appendChild(node);
      node = div;
    }
    return node.nodeType === Node.ELEMENT_NODE ? node : null;
  }
  const isCheckItem = (el) => !!(el && el.classList && el.classList.contains('doc-check-item'));
  const isEmptyBlock = (el) => el.textContent.replace(/​/g, '').trim() === '';
  function getCheckItemAtCaret() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let node: any = sel.getRangeAt(0).startContainer;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    return node && node.closest ? node.closest('.doc-check-item') : null;
  }
  function insertChecklistItem() {
    const editor = editorRef.current;
    editor.focus();
    const block = getCurrentBlock();
    if (isCheckItem(block)) {
      // Already a checklist line → add a new empty one after it.
      const item = makeCheckItem();
      block.after(item);
      placeCaretAtStart(item);
    } else if (block && isEmptyBlock(block)) {
      // Empty line → turn it into an empty checklist item.
      const item = makeCheckItem();
      block.replaceWith(item);
      placeCaretAtStart(item);
    } else if (block) {
      // Line has text (caret anywhere in it) → convert that whole line into a
      // checklist item, keeping its content. No more empty box + text pushed away.
      const item = makeCheckItem(block.innerHTML);
      block.replaceWith(item);
      placeCaretAtStart(item);
    } else {
      const item = makeCheckItem();
      editor.appendChild(item);
      placeCaretAtStart(item);
    }
    refreshChecklist();
  }

  function updateToolbarState() {
    const tb = toolbarRef.current;
    if (!tb) return;
    ['bold', 'italic', 'underline', 'strikeThrough'].forEach((cmd) => {
      const btn = tb.querySelector(`.tb-btn[data-cmd="${cmd}"]`);
      if (!btn) return;
      let on = false;
      try { on = document.queryCommandState(cmd); } catch {}
      btn.classList.toggle('active', on);
    });
  }

  function onToolbarClick(e) {
    const btn = e.target.closest('.tb-btn');
    if (!btn) return;
    editorRef.current.focus();
    markChanged();
    if (btn.dataset.action === 'checklist') { insertChecklistItem(); return; }
    document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
    updateToolbarState();
  }

  function onEditorPointerDown(e) {
    const item = e.target.closest && e.target.closest('.doc-check-item');
    if (!item) return;
    const rect = item.getBoundingClientRect();
    if (e.clientX - rect.left <= 30) {
      e.preventDefault();
      item.setAttribute('data-checked', item.getAttribute('data-checked') === 'true' ? 'false' : 'true');
      markChanged();
    }
  }

  function onEditorKeyDown(e) {
    if (e.key !== 'Enter' && e.key !== 'Backspace') return;
    const item = getCheckItemAtCaret();
    if (!item) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isEmptyBlock(item)) {
        const line = document.createElement('div'); line.innerHTML = '<br>';
        item.replaceWith(line); placeCaretAtStart(line);
      } else {
        const next = makeCheckItem(); item.after(next); placeCaretAtStart(next);
      }
    } else if (e.key === 'Backspace' && isEmptyBlock(item)) {
      const sel = window.getSelection();
      if (sel.rangeCount && sel.getRangeAt(0).startOffset === 0) {
        e.preventDefault();
        const line = document.createElement('div'); line.innerHTML = '<br>';
        item.replaceWith(line); placeCaretAtStart(line);
      }
    }
    markChanged();
    refreshChecklist();
  }

  function uncheckAll() {
    editorRef.current.querySelectorAll('.doc-check-item[data-checked="true"]')
      .forEach((it) => it.setAttribute('data-checked', 'false'));
    editorRef.current.focus();
    markChanged();
  }

  async function save() {
    const content = sanitizeHtml(editorRef.current.innerHTML);
    const payload = { title: (title || '').trim() || 'Untitled', content, schedule: schedule || null };
    setSaving(true);
    try {
      rateGate('save', { limit: 20, windowMs: 10_000, message: 'You’re saving too fast — slow down a moment.' });
      if (initial?.id) {
        await repo.updateNote(initial.id, payload);
        notify('Document updated', 'success');
      } else {
        await repo.createNote(payload);
        notify('Document saved', 'success');
      }
      clearDraft(draftKey); // saved for real — the draft is no longer needed
      onSaved();
    } catch (err) {
      notify(err.message, 'error');
      setSaving(false);
    }
  }

  return (
    <>
    <div className="sheet">
      <div className="sheet-bar">
        <button className="icon-btn" aria-label="Close" onClick={requestClose}><i className="fas fa-arrow-left" /></button>
        <input type="text" className="sheet-title-input" placeholder="Untitled document"
          value={title} onChange={(e) => { setTitle(e.target.value); markChanged(); }} />
        <button className="icon-btn save-icon" aria-label="Save" disabled={saving} onClick={save}><i className="fas fa-check" /></button>
      </div>

      <div className="sheet-scroll">
        {restoredDraft && (
          <div className="draft-banner">
            <span><i className="fas fa-clock-rotate-left" /> Restored your unsaved draft</span>
            <button type="button" onClick={discardDraft}>Discard</button>
          </div>
        )}
        {hasChecklist && (
          <div className="schedule-row">
            <label><i className="fas fa-repeat" /> Repeat</label>
            <select className="mini-select" value={schedule} onChange={(e) => { setSchedule(e.target.value); markChanged(); }}>
              <option value="">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (Mon)</option>
              <option value="monthly">Monthly (1st)</option>
            </select>
            <button type="button" className="chip-btn" onClick={uncheckAll}><i className="fas fa-rotate-left" /> Uncheck</button>
          </div>
        )}

        <div
          ref={editorRef}
          className="doc-editor"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Start writing… use the toolbar below to format or add a checklist."
          onPointerDown={onEditorPointerDown}
          onKeyDown={onEditorKeyDown}
          onKeyUp={updateToolbarState}
          onMouseUp={updateToolbarState}
          onInput={() => { markChanged(); refreshChecklist(); }}
        />
      </div>

      <div className="doc-toolbar" ref={toolbarRef}
        onPointerDown={(e) => { if ((e.target as HTMLElement).closest('.tb-btn')) e.preventDefault(); }}
        onClick={onToolbarClick}>
        <button type="button" className="tb-btn" data-cmd="bold" title="Bold"><i className="fas fa-bold" /></button>
        <button type="button" className="tb-btn" data-cmd="italic" title="Italic"><i className="fas fa-italic" /></button>
        <button type="button" className="tb-btn" data-cmd="underline" title="Underline"><i className="fas fa-underline" /></button>
        <button type="button" className="tb-btn" data-cmd="strikeThrough" title="Strikethrough"><i className="fas fa-strikethrough" /></button>
        <span className="tb-sep" />
        <button type="button" className="tb-btn" data-cmd="formatBlock" data-val="h1" title="Heading 1"><b>H1</b></button>
        <button type="button" className="tb-btn" data-cmd="formatBlock" data-val="h2" title="Heading 2"><b>H2</b></button>
        <button type="button" className="tb-btn" data-cmd="formatBlock" data-val="p" title="Normal"><i className="fas fa-paragraph" /></button>
        <span className="tb-sep" />
        <button type="button" className="tb-btn" data-cmd="insertUnorderedList" title="Bullets"><i className="fas fa-list-ul" /></button>
        <button type="button" className="tb-btn" data-cmd="insertOrderedList" title="Numbered"><i className="fas fa-list-ol" /></button>
        <button type="button" className="tb-btn" data-action="checklist" title="Checklist"><i className="fas fa-square-check" /></button>
        <button type="button" className="tb-btn" data-cmd="formatBlock" data-val="blockquote" title="Quote"><i className="fas fa-quote-right" /></button>
        <span className="tb-sep" />
        <button type="button" className="tb-btn" data-cmd="removeFormat" title="Clear"><i className="fas fa-eraser" /></button>
      </div>
    </div>
    {confirmLeave && (
      <UnsavedChangesModal
        saving={saving}
        onSave={confirmSave}
        onDiscard={discardAndClose}
        onCancel={() => setConfirmLeave(false)}
      />
    )}
    </>
  );
}
