// ============================================================
//  Sort helpers shared by the Docs and Plans lists. Pure functions —
//  each tab keeps its own pinned-first overlay on top of the chosen order.
//  The chosen key is remembered per list (localStorage) so it sticks.
// ============================================================

export const SORT_OPTIONS = [
  { key: 'updated', label: 'Recently updated' },
  { key: 'created', label: 'Recently created' },
  { key: 'title-az', label: 'Title A–Z' },
  { key: 'title-za', label: 'Title Z–A' },
];

const VALID = new Set(SORT_OPTIONS.map((o) => o.key));

const time = (v) => (v ? +new Date(v) : 0);
const titleOf = (x) => String(x?.title || '').trim().toLowerCase();

// Return a new array sorted by `key` (never mutates the input).
export function sortItems(items, key) {
  const arr = [...(items || [])];
  switch (key) {
    case 'created':
      return arr.sort((a, b) => time(b.createdAt) - time(a.createdAt));
    case 'title-az':
      return arr.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
    case 'title-za':
      return arr.sort((a, b) => titleOf(b).localeCompare(titleOf(a)));
    case 'updated':
    default:
      return arr.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  }
}

const STORE_PREFIX = 'mahnotes:sort:';

export function loadSort(scope) {
  try {
    const v = localStorage.getItem(STORE_PREFIX + scope);
    if (v && VALID.has(v)) return v;
  } catch { /* ignore */ }
  return 'updated';
}

export function saveSort(scope, key) {
  try { localStorage.setItem(STORE_PREFIX + scope, key); } catch { /* ignore */ }
}
