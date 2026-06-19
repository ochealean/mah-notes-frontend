// ============================================================
//  Rich-text helpers (client side) — ported from the original app.
//  The server re-sanitizes on save, but we also sanitize here so the
//  editor and previews stay consistent and safe before sending.
// ============================================================

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
  'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'DIV', 'SPAN',
]);
const ALLOWED_CLASSES = ['doc-check-item', 'doc-check-box', 'doc-check-text'];

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function cleanChildren(node) {
  const frag = document.createDocumentFragment();
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      frag.appendChild(document.createTextNode(child.nodeValue));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const tag = child.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') return;

    if (ALLOWED_TAGS.has(tag)) {
      const clean = document.createElement(tag.toLowerCase());
      const keptClasses = [...child.classList].filter((c) => ALLOWED_CLASSES.includes(c));
      if (keptClasses.length) clean.className = keptClasses.join(' ');
      if (child.hasAttribute('data-checked')) {
        clean.setAttribute('data-checked', child.getAttribute('data-checked') === 'true' ? 'true' : 'false');
      }
      if (clean.classList.contains('doc-check-box')) clean.setAttribute('contenteditable', 'false');
      clean.appendChild(cleanChildren(child));
      frag.appendChild(clean);
    } else {
      frag.appendChild(cleanChildren(child));
    }
  });
  return frag;
}

export function sanitizeHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html || '';
  const holder = document.createElement('div');
  holder.appendChild(cleanChildren(tpl.content));
  return holder.innerHTML;
}

function looksLikeHtml(str) {
  return /<[a-z][\s\S]*>/i.test(str || '');
}

export function normalizeChecklists(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html || '';
  holder.querySelectorAll('.doc-check-item').forEach((item) => {
    const textEl = item.querySelector('.doc-check-text');
    const boxEl = item.querySelector('.doc-check-box');
    if (textEl || boxEl) {
      const inner = textEl ? textEl.innerHTML.trim() : item.textContent.trim();
      item.innerHTML = inner || '<br>';
    }
  });
  return holder.innerHTML;
}

export function contentToHtml(content) {
  if (!content) return '';
  if (looksLikeHtml(content)) return sanitizeHtml(normalizeChecklists(content));
  return escapeHtml(content).replace(/\n/g, '<br>');
}
