// ============================================================
//  Document editor sheet: rich-text contentEditable surface with a
//  formatting toolbar and inline checklists. Logic ported from the
//  original app's editor.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { repo } from '../lib/repo.js';
import { notify } from '../lib/notify.js';
import { contentToHtml, sanitizeHtml } from '../lib/richtext.js';
import UnsavedChangesModal from './UnsavedChangesModal.jsx';

export default function DocEditor({ initial, onClose, onSaved }) {
  const editorRef = useRef(null);
  const toolbarRef = useRef(null);
  const [title, setTitle] = useState(initial?.title || '');
  const [schedule, setSchedule] = useState(initial?.schedule || '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Leaving with unsaved edits → ask first (Save / Don't save / Cancel).
  function requestClose() { if (dirty) setConfirmLeave(true); else onClose(); }
  function confirmSave() { setConfirmLeave(false); save(); }

  // Seed the editable surface once.
  useEffect(() => {
    const editor = editorRef.current;
    editor.innerHTML = initial ? contentToHtml(initial.content || '') : '';
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch {}
    setTimeout(() => { (initial?.title ? editor : null)?.focus(); updateToolbarState(); }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── DOM helpers (operate on the editor element) ──
  const makeCheckItem = (innerHtml) => {
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
    let node = range.startContainer;
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
    let node = sel.getRangeAt(0).startContainer;
    if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    return node && node.closest ? node.closest('.doc-check-item') : null;
  }

  function insertChecklistItem() {
    const editor = editorRef.current;
    editor.focus();
    const block = getCurrentBlock();
    const item = makeCheckItem();
    if (isCheckItem(block)) block.after(item);
    else if (block && isEmptyBlock(block)) block.replaceWith(item);
    else if (block) block.after(item);
    else editor.appendChild(item);
    placeCaretAtStart(item);
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
    setDirty(true);
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
      setDirty(true);
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
  }

  function uncheckAll() {
    editorRef.current.querySelectorAll('.doc-check-item[data-checked="true"]')
      .forEach((it) => it.setAttribute('data-checked', 'false'));
    editorRef.current.focus();
    setDirty(true);
  }

  async function save() {
    const content = sanitizeHtml(editorRef.current.innerHTML);
    const payload = { title: (title || '').trim() || 'Untitled', content, schedule: schedule || null };
    setSaving(true);
    try {
      if (initial?.id) {
        await repo.updateNote(initial.id, payload);
        notify('Document updated', 'success');
      } else {
        await repo.createNote(payload);
        notify('Document saved', 'success');
      }
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
          value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
        <button className="icon-btn save-icon" aria-label="Save" disabled={saving} onClick={save}><i className="fas fa-check" /></button>
      </div>

      <div className="sheet-scroll">
        <div className="schedule-row">
          <label><i className="fas fa-repeat" /> Repeat</label>
          <select className="mini-select" value={schedule} onChange={(e) => { setSchedule(e.target.value); setDirty(true); }}>
            <option value="">Never</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly (Mon)</option>
            <option value="monthly">Monthly (1st)</option>
          </select>
          <button type="button" className="chip-btn" onClick={uncheckAll}><i className="fas fa-rotate-left" /> Uncheck</button>
        </div>

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
          onInput={() => setDirty(true)}
        />
      </div>

      <div className="doc-toolbar" ref={toolbarRef}
        onPointerDown={(e) => { if (e.target.closest('.tb-btn')) e.preventDefault(); }}
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
        onDiscard={onClose}
        onCancel={() => setConfirmLeave(false)}
      />
    )}
    </>
  );
}
