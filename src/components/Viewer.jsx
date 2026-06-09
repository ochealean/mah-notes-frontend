// ============================================================
//  Viewer page — three modes:
//    ?token=…  (live)      → public, read-only, polled every 4s
//    ?token=…  (reference) → public blank scratch copy; ticks saved
//                            only in this browser's localStorage
//    ?type=&id=…  (owner)  → signed-in owner; taps save to the server
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api, getToken } from '../lib/api.js';
import { contentToHtml, sanitizeHtml } from '../lib/richtext.js';

const JS_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABEL = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' };
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const today = () => JS_DAY[new Date().getDay()];

const refKey = (tok) => 'mahnotes_ref_' + tok;
const refLoad = (tok) => { try { return JSON.parse(localStorage.getItem(refKey(tok)) || '{}'); } catch { return {}; } };
const refSave = (tok, state) => { try { localStorage.setItem(refKey(tok), JSON.stringify(state)); } catch {} };

function Message({ icon, title, desc, extra }) {
  return (
    <div className="view-page">
      <div className="view-bar"><span className="logo">Mah Notes</span></div>
      <div className="v-card"><div className="empty-state">
        <i className={`fas ${icon}`} />
        <h2 style={{ marginBottom: 8, color: 'var(--dark)' }}>{title}</h2>
        <p>{desc}</p>
        {extra}
      </div></div>
    </div>
  );
}

function WeekDetails({ days, markDone = true }) {
  const t = today();
  return (
    <details className="plan-week"><summary>Full week</summary>
      <div className="week-grid">
        {DAY_ORDER.map((day) => {
          const items = (days && days[day]) || [];
          const isToday = day === t;
          return (
            <div key={day} className={`week-day${isToday ? ' is-today' : ''}`}>
              <div className="week-day-name">{DAY_SHORT[day]}{isToday ? ' · TODAY' : ''}</div>
              {items.length
                ? <ul>{items.map((it, i) => <li key={i} className={markDone && it.checked ? 'done' : ''}>{it.text}</li>)}</ul>
                : <div className="week-rest">Rest</div>}
            </div>
          );
        })}
      </div>
    </details>
  );
}

export default function Viewer() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const ownerType = params.get('type');
  const ownerId = params.get('id');

  const [state, setState] = useState({ status: 'loading' }); // loading | ok | message
  const [data, setData] = useState(null); // { kind, mode, title, contentHtml?, days?, id }
  const docRef = useRef(null);

  // ── Load ──────────────────────────────────────────────
  const loadToken = useCallback(async () => {
    const res = await api.get(`/api/share/${token}`);
    const mode = res.viewMode === 'reference' ? 'reference' : 'live';
    if (res.itemType === 'plan') {
      setData({ kind: 'plan', mode, title: res.title, days: res.days || {} });
    } else {
      setData({ kind: 'note', mode, title: res.title, contentHtml: res.contentHtml || '' });
    }
    setState({ status: 'ok' });
  }, [token]);

  const loadOwner = useCallback(async () => {
    const path = ownerType === 'plan' ? `/api/plans/${ownerId}` : `/api/notes/${ownerId}`;
    const item = await api.get(path);
    if (ownerType === 'plan') {
      setData({ kind: 'plan', mode: 'owner', id: ownerId, title: item.title, days: item.days || {} });
    } else {
      setData({ kind: 'note', mode: 'owner', id: ownerId, title: item.title, contentHtml: contentToHtml(item.content) });
    }
    setState({ status: 'ok' });
  }, [ownerType, ownerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (token) {
          await loadToken();
        } else if (ownerType && ownerId) {
          if (!getToken()) {
            setState({ status: 'message', icon: 'fa-right-to-bracket', title: 'Sign in to view',
              desc: 'Open Mah Notes and sign in to see this item.',
              extra: <p style={{ marginTop: 14 }}><Link to="/" style={{ fontWeight: 700 }}>Go to Mah Notes →</Link></p> });
            return;
          }
          await loadOwner();
        } else {
          setState({ status: 'message', icon: 'fa-link-slash', title: 'No link provided', desc: 'This page needs a valid link.' });
        }
      } catch (err) {
        if (cancelled) return;
        if (err.status === 404) setState({ status: 'message', icon: 'fa-link-slash', title: 'Link expired or revoked', desc: 'This share link is no longer active.' });
        else setState({ status: 'message', icon: 'fa-triangle-exclamation', title: 'Could not load', desc: 'Check your connection and try again.' });
      }
    })();
    return () => { cancelled = true; };
  }, [token, ownerType, ownerId, loadToken, loadOwner]);

  // ── Live polling (read-only) ──────────────────────────
  useEffect(() => {
    if (!token || !data || data.mode !== 'live') return;
    const id = setInterval(() => { loadToken().catch(() => {}); }, 4000);
    return () => clearInterval(id);
  }, [token, data, loadToken]);

  // ── Note checkbox wiring (owner saves; reference = localStorage) ──
  useEffect(() => {
    if (!data || data.kind !== 'note' || !docRef.current) return;
    if (data.mode === 'live') return; // read-only
    const el = docRef.current;
    const items = [...el.querySelectorAll('.doc-check-item')];

    if (data.mode === 'reference') {
      const saved = refLoad(token);
      items.forEach((it, idx) => { it.classList.add('tap'); it.setAttribute('data-checked', saved[idx] ? 'true' : 'false'); });
    } else {
      items.forEach((it) => it.classList.add('tap'));
    }

    const onClick = async (e) => {
      const it = e.target.closest('.doc-check-item');
      if (!it) return;
      const idx = items.indexOf(it);
      const now = it.getAttribute('data-checked') !== 'true';
      it.setAttribute('data-checked', now ? 'true' : 'false');
      if (data.mode === 'reference') {
        const s = refLoad(token); s[idx] = now; refSave(token, s);
      } else {
        try { await api.put(`/api/notes/${data.id}`, { content: sanitizeHtml(el.innerHTML) }); }
        catch { it.setAttribute('data-checked', now ? 'false' : 'true'); }
      }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [data, token]);

  if (state.status === 'loading') {
    return <Message icon="fa-spinner fa-spin" title="Loading…" desc="Fetching the shared item." />;
  }
  if (state.status === 'message') {
    return <Message icon={state.icon} title={state.title} desc={state.desc} extra={state.extra} />;
  }

  // ── Render ────────────────────────────────────────────
  const badge = data.mode === 'live'
    ? <div className="live-badge"><span className="live-dot" /> Live · updates in real-time</div>
    : data.mode === 'reference'
      ? <div className="ref-badge"><i className="fas fa-list-check" /> Reference · your own copy</div>
      : <div className="own-badge"><i className="fas fa-circle-check" /> View mode · taps are saved</div>;

  const sub = data.mode === 'live' ? 'live · shared' : data.mode === 'reference' ? 'your copy' : 'view mode';

  return (
    <div className="view-page">
      <div className="view-bar"><span className="logo">Mah Notes</span><span className="sub">{sub}</span></div>
      <div className="v-card">
        {badge}
        <h1 className="v-title">{data.title || (data.kind === 'plan' ? 'Plan' : 'Untitled')}</h1>

        {data.kind === 'note' ? (
          <div ref={docRef} className="doc-content" dangerouslySetInnerHTML={{ __html: data.contentHtml }} />
        ) : (
          <PlanView data={data} token={token} />
        )}

        {data.mode === 'reference' && (
          <div className="ref-note"><i className="fas fa-circle-info" /> This is your own copy — ticks are saved only on this device and don't change the owner's list.</div>
        )}
      </div>
    </div>
  );
}

// Plan body: today's tickable list + full week.
function PlanView({ data, token }) {
  const t = today();
  const baseItems = (data.days && data.days[t]) || [];
  const [checks, setChecks] = useState(() => {
    if (data.mode === 'reference') {
      const saved = refLoad(token);
      return baseItems.map((_, i) => !!saved[i]);
    }
    return baseItems.map((it) => !!it.checked);
  });

  // Keep live/owner state in sync when data refreshes.
  useEffect(() => {
    if (data.mode === 'reference') return;
    setChecks(((data.days && data.days[t]) || []).map((it) => !!it.checked));
  }, [data, t]);

  const interactive = data.mode !== 'live';

  async function toggle(i) {
    if (!interactive) return;
    const now = !checks[i];
    setChecks((c) => c.map((v, idx) => (idx === i ? now : v)));
    if (data.mode === 'reference') {
      const s = refLoad(token); s[i] = now; refSave(token, s);
    } else {
      try { await api.patch(`/api/plans/${data.id}/check`, { day: t, index: i, checked: now }); }
      catch { setChecks((c) => c.map((v, idx) => (idx === i ? !now : v))); }
    }
  }

  return (
    <>
      <div className="today-badge" style={{ marginBottom: 12 }}><i className="fas fa-calendar-day" /> {DAY_LABEL[t]}</div>
      <div className="vlist">
        {baseItems.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}><i className="fas fa-mug-hot" /><p>Nothing scheduled for {DAY_LABEL[t]} — rest day!</p></div>
        ) : baseItems.map((it, i) => (
          <div key={i} className={`doc-check-item${interactive ? ' tap' : ''}`} data-checked={checks[i] ? 'true' : 'false'}
            onClick={() => toggle(i)}>
            {it.text}
          </div>
        ))}
      </div>
      <WeekDetails days={data.days} markDone={data.mode !== 'reference'} />
    </>
  );
}
