// Compact sort dropdown used above the Docs and Plans lists.
import { SORT_OPTIONS } from '../lib/sortItems';

export default function SortControl({ value, onChange }) {
  return (
    <label className="sort-control" title="Sort">
      <i className="fas fa-arrow-down-wide-short" />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Sort list">
        {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </label>
  );
}
