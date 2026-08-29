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
  // The text-size input lives outside the contentEditable surface, so
  // focusing it loses the caret's position. This remembers which line was
  // last active so the size can still be applied to the right place.
  const lastBlockRef = useRef(null);
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
  // Older docs may still carry the size as a class (from before the size
  // input replaced the small/large text buttons); clear both forms.
  const LEGACY_TEXT_SIZE_CLASSES = ['doc-text-sm', 'doc-text-lg'];
  const FONT_SIZE_MIN = 8;
  const FONT_SIZE_MAX = 72;
  function applyFontSize(raw) {
    const block = lastBlockRef.current || getCurrentBlock();
    if (!block) return;
    LEGACY_TEXT_SIZE_CLASSES.forEach((c) => block.classList.remove(c));
    if (raw === '') { block.style.fontSize = ''; markChanged(); return; }
    const n = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, parseInt(raw, 10) || 16));
    block.style.fontSize = `${n}px`;
    markChanged();
  }
  const MAX_INDENT = 6;
  function indentBlock(increase) {
    const block = getCurrentBlock();
    if (!block) return;
    const current = [...block.classList].find((c) => /^doc-indent-\d$/.test(c));
    let level = current ? parseInt(current.slice('doc-indent-'.length), 10) : 0;
    if (current) block.classList.remove(current);
    level = increase ? Math.min(level + 1, MAX_INDENT) : Math.max(level - 1, 0);
    if (level > 0) block.classList.add(`doc-indent-${level}`);
  }
  // Carries a line's indent/text-size formatting over to a new or converted
  // block, so it doesn't get lost when a line becomes a checklist item or
  // when a checklist item spawns the next one via Enter.
  function copyLineClasses(from, to) {
    if (!from) return;
    if (from.style && from.style.fontSize) to.style.fontSize = from.style.fontSize;
    if (!from.classList) return;
    [...from.classList].forEach((c) => {
      if (/^doc-indent-\d$/.test(c) || c === 'doc-text-sm' || c === 'doc-text-lg') to.classList.add(c);
    });
  }
  // ── Links ──
  // Same scheme allow-list as richtext.ts's sanitizer (which still re-checks
  // this on save) — kept in sync so a rejected link is rejected consistently,
  // not silently stripped later with no explanation.
  const SAFE_HREF = /^(https?:|mailto:)/i;
  function normalizeUrl(raw) {
    const v = (raw || '').trim();
    if (!v) return null;
    if (SAFE_HREF.test(v)) return v;
    // No recognizable scheme at all → assume the user meant a plain website
    // and meant to type "https://". A scheme we don't allow (javascript:,
    // data:, ftp:, …) is rejected outright rather than "fixed".
    if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) return `https://${v}`;
    return null;
  }
  function getSelectionAnchor() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    let node: any = sel.getRangeAt(0).startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    return node && node.closest ? node.closest('a') : null;
  }
  // One button, two behaviors: caret already inside a link → remove it
  // (toggle off); otherwise wrap the current selection in a new one.
  function insertLink() {
    const editor = editorRef.current;
    editor.focus();
    if (getSelectionAnchor()) {
      document.execCommand('unlink');
      markChanged();
      return;
    }
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
      notify('Select some text first, then add the link.', 'info');
      return;
    }
    const raw = window.prompt('Link URL (e.g. https://example.com)');
    if (raw === null) return; // cancelled
    const url = normalizeUrl(raw);
    if (!url) { notify('That doesn’t look like a valid link.', 'error'); return; }
    document.execCommand('createLink', false, url);
    // createLink only sets href — force the same target/rel the sanitizer
    // would anyway, so the doc already matches what a reload produces.
    editor.querySelectorAll('a:not([target])').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
    });
    markChanged();
  }

  const isCheckItem = (el) => !!(el && el.classList && el.classList.contains('doc-check-item'));
  const isEmptyBlock = (el) => el.textContent.replace(/​/g, '').trim() === '';
  function isCaretAtStartOfItem(item) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;
    const preRange = document.createRange();
    preRange.selectNodeContents(item);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().length === 0;
  }
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
      copyLineClasses(block, item);
      block.after(item);
      placeCaretAtStart(item);
    } else if (block && isEmptyBlock(block)) {
      // Empty line → turn it into an empty checklist item.
      const item = makeCheckItem();
      copyLineClasses(block, item);
      block.replaceWith(item);
      placeCaretAtStart(item);
    } else if (block) {
      // Line has text (caret anywhere in it) → convert that whole line into a
      // checklist item, keeping its content. No more empty box + text pushed away.
      const item = makeCheckItem(block.innerHTML);
      copyLineClasses(block, item);
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
    const linkBtn = tb.querySelector('.tb-btn[data-action="link"]');
    if (linkBtn) linkBtn.classList.toggle('active', !!getSelectionAnchor());
  }

  function onToolbarClick(e) {
    const btn = e.target.closest('.tb-btn');
    if (!btn) return;
    editorRef.current.focus();
    markChanged();
    if (btn.dataset.action === 'checklist') { insertChecklistItem(); return; }
    if (btn.dataset.action === 'link') { insertLink(); updateToolbarState(); return; }
    if (btn.dataset.action === 'indent') { indentBlock(true); updateToolbarState(); return; }
    if (btn.dataset.action === 'outdent') { indentBlock(false); updateToolbarState(); return; }
    if (btn.dataset.cmd === 'formatBlock' && btn.dataset.val === 'p') {
      document.execCommand('formatBlock', false, 'p');
      const block = getCurrentBlock();
      if (block) {
        LEGACY_TEXT_SIZE_CLASSES.forEach((c) => block.classList.remove(c));
        block.style.fontSize = '';
      }
      updateToolbarState();
      return;
    }
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
        copyLineClasses(item, line);
        item.replaceWith(line); placeCaretAtStart(line);
      } else {
        const next = makeCheckItem(); copyLineClasses(item, next); item.after(next); placeCaretAtStart(next);
      }
    } else if (e.key === 'Backspace' && isCaretAtStartOfItem(item)) {
      e.preventDefault();
      const line = document.createElement('div');
      line.innerHTML = isEmptyBlock(item) ? '<br>' : item.innerHTML;
      copyLineClasses(item, line);
      item.replaceWith(line); placeCaretAtStart(line);
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
        <button type="button" className="tb-btn" data-action="link" title="Add/remove link (select text first)"><i className="fas fa-link" /></button>
        <span className="tb-sep" />
        <button type="button" className="tb-btn" data-cmd="formatBlock" data-val="p" title="Normal"><i className="fas fa-paragraph" /></button>
        <input type="number" className="tb-size-input" title="Text size (px)" min={8} max={72} placeholder="16"
          onPointerDown={() => { const b = getCurrentBlock(); if (b) lastBlockRef.current = b; }}
          onChange={(e) => applyFontSize(e.target.value)} />
        <span className="tb-sep" />
        <button type="button" className="tb-btn" data-cmd="insertUnorderedList" title="Bullets"><i className="fas fa-list-ul" /></button>
        <button type="button" className="tb-btn" data-cmd="insertOrderedList" title="Numbered"><i className="fas fa-list-ol" /></button>
        <button type="button" className="tb-btn" data-action="checklist" title="Checklist"><i className="fas fa-square-check" /></button>
        <button type="button" className="tb-btn" data-cmd="formatBlock" data-val="blockquote" title="Quote"><i className="fas fa-quote-right" /></button>
        <button type="button" className="tb-btn" data-action="outdent" title="Outdent"><i className="fas fa-outdent" /></button>
        <button type="button" className="tb-btn" data-action="indent" title="Indent"><i className="fas fa-indent" /></button>
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
