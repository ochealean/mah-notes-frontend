// ============================================================
//  "Shared with me" — right in Settings → Friends. Items friends sent you
//  (frozen snapshots). Save clones one into your own notes or plans;
//  Dismiss drops it.
//
//  Kept to titles until you ask for more, so three notes from one friend are
//  three tidy rows rather than three walls of text:
//    · the section itself folds away (remembered on this device)
//    · each share is one row — title, who, when — and opens in place to the
//      WHOLE thing, every line and every day, so it can be read properly
//      before deciding whether to keep it
//  A share is "new" until its row is first opened. New ones carry a red dot
//  here, on the section, on Friends in the Settings list, and on Settings.
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { onRealtime } from '../lib/realtime';
import { notify } from '../lib/notify';
import { sanitizeHtml } from '../lib/richtext';
import BundleAvatar, { Face } from './BundleAvatar';

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABEL = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

const OPEN_KEY = 'mahnotes_inbox_open';
const loadOpen = () => { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; } };
const saveOpen = (v: boolean) => { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch { /* ignore */ } };

// "just now", "5 min ago", "3 h ago", "yesterday", then a date.
function ago(iso) {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fullDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Every day of the plan, every item, as it was when it was sent.
function PlanFull({ days }) {
  const filled = DAY_ORDER.filter((d) => days?.[d]?.length);
  if (filled.length === 0) return <div className="inbox-empty">This plan is empty.</div>;
  return (
    <div className="inbox-week">
      {DAY_ORDER.map((d) => {
        const items = days?.[d] || [];
        return (
          <div key={d} className="inbox-day">
            <div className="inbox-day-name">{DAY_LABEL[d]}<span>{items.length ? items.length : 'Rest'}</span></div>
            {items.length > 0 && (
              <ul>
                {items.map((it, i) => (
                  <li key={i} className={it.checked ? 'done' : ''}>
                    <i className={`far ${it.checked ? 'fa-square-check' : 'fa-square'}`} aria-hidden="true" />
                    <span>{it.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ShareRow({ s, open, busy, onToggle, onSave, onDismiss }) {
  const kind = s.itemType === 'plan' ? 'plan' : 'doc';
  const bodyId = `inbox-body-${s.id}`;
  return (
    <div className={`inbox-item${open ? ' open' : ''}${s.seen ? '' : ' is-new'}`}>
      <button type="button" className="inbox-row" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="inbox-row-icon" aria-hidden="true">
          <i className={`fas ${s.itemType === 'plan' ? 'fa-calendar-week' : 'fa-file-lines'}`} />
        </span>
        <span className="inbox-row-main">
          <span className="inbox-row-title">{s.title || 'Untitled'}</span>
          <span className="inbox-row-meta">{s.from.displayName} · {ago(s.createdAt)}</span>
        </span>
        {!s.seen && <span className="new-dot" title="New" />}
        <i className="fas fa-chevron-down inbox-row-chev" aria-hidden="true" />
      </button>

      {open && (
        <div className="inbox-body" id={bodyId}>
          <div className="inbox-from">
            <BundleAvatar size={28} bundleId="default">
              <Face src={s.from.avatar} name={s.from.displayName} />
            </BundleAvatar>
            <span>
              <b>{s.from.displayName}</b> sent you this {kind}
              {s.createdAt && <span className="inbox-when"> · {fullDate(s.createdAt)}</span>}
            </span>
          </div>

          {s.itemType === 'plan'
            ? <PlanFull days={s.days} />
            : s.preview
              ? <div className="inbox-doc doc-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(s.preview) }} />
              : <div className="inbox-empty">This document is empty.</div>}

          <p className="inbox-snap">
            <i className="fas fa-camera" aria-hidden="true" /> A snapshot from when it was sent — their later
            edits don&rsquo;t change it. Save it to keep your own copy.
          </p>

          <div className="inbox-actions">
            <button className="friend-btn add" disabled={busy} onClick={onSave}>
              <i className="fas fa-download" /> Save to my {s.itemType === 'plan' ? 'plans' : 'notes'}
            </button>
            <button className="friend-btn decline" disabled={busy} onClick={onDismiss}>
              <i className="fas fa-times" /> Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InboxPanel({ onSaved, onChange }) {
  const [shares, setShares] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [openId, setOpenId] = useState('');
  const [sectionOpen, setSectionOpen] = useState(loadOpen);

  const load = useCallback(async () => {
    try { const res = await api.get('/api/friend-shares'); setShares(res.shares || []); }
    catch (err) { notify(err.message, 'error'); setShares([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Realtime: something new arrived (or was handled on another device), and a
  // sender renaming themselves should update their name here too.
  useEffect(() => onRealtime('inbox:changed', () => load()), [load]);
  useEffect(() => onRealtime('friend:updated', () => load()), [load]);

  function toggleSection() {
    setSectionOpen((v) => { saveOpen(!v); return !v; });
  }

  // Opening a row is what "seen" means: its dot goes, here and everywhere.
  function toggle(s) {
    const next = openId === s.id ? '' : s.id;
    setOpenId(next);
    if (next && !s.seen) {
      setShares((arr) => arr.map((x) => (x.id === s.id ? { ...x, seen: true } : x)));
      api.post('/api/friend-shares/seen', { ids: [s.id] })
        .then(() => { if (onChange) onChange(); })
        .catch(() => { /* stays new on the server; the next load shows it again */ });
    }
  }

  async function save(s) {
    setBusyId(s.id);
    try {
      await api.post(`/api/friend-shares/${s.id}/save`);
      setShares((arr) => arr.filter((x) => x.id !== s.id));
      notify(`Saved to your ${s.itemType === 'plan' ? 'plans' : 'notes'}`, 'success');
      if (onSaved) onSaved();
      if (onChange) onChange();
    } catch (err) { notify(err.message, 'error'); } finally { setBusyId(''); }
  }

  async function dismiss(s) {
    setBusyId(s.id);
    try {
      await api.del(`/api/friend-shares/${s.id}`);
      setShares((arr) => arr.filter((x) => x.id !== s.id));
      if (onChange) onChange();
    } catch (err) { notify(err.message, 'error'); } finally { setBusyId(''); }
  }

  const unseen = shares ? shares.filter((s) => !s.seen).length : 0;
  const hint = shares === null ? ''
    : unseen ? `${unseen} new`
      : shares.length ? `${shares.length} waiting` : 'Nothing yet';

  return (
    <div className="settings-card fp-card">
      <button type="button" className={`settings-collapse${sectionOpen ? ' open' : ''}`} aria-expanded={sectionOpen} onClick={toggleSection}>
        <span>
          <i className="fas fa-inbox" aria-hidden="true" />
          Shared with me
          {unseen > 0 && <span className="new-dot" title={`${unseen} new`} />}
        </span>
        <span className="settings-collapse-right">
          <span className="settings-collapse-hint">{hint}</span>{' '}
          <i className={`fas fa-chevron-${sectionOpen ? 'up' : 'down'}`} aria-hidden="true" />
        </span>
      </button>

      {sectionOpen && (
        <div className="settings-collapse-body fp-body inbox-list">
          {shares === null ? (
            <div className="friend-hint"><i className="fas fa-circle-notch fa-spin" /> Loading…</div>
          ) : shares.length === 0 ? (
            <div className="friend-hint">Nothing shared with you yet. When a friend sends a doc or plan, it lands here — a snapshot, so their later edits never change your copy.</div>
          ) : shares.map((s) => (
            <ShareRow
              key={s.id}
              s={s}
              open={openId === s.id}
              busy={busyId === s.id}
              onToggle={() => toggle(s)}
              onSave={() => save(s)}
              onDismiss={() => dismiss(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
