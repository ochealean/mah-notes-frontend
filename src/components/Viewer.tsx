// ============================================================
//  Viewer page — three modes:
//    ?token=…  (live)      → public, read-only, polled every 4s
//    ?token=…  (reference) → public blank scratch copy; ticks saved
//                            only in this browser's localStorage
//    ?type=&id=…  (owner)  → signed-in owner; taps save to the server
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api, getToken } from '../lib/api';
import { isNative } from '../lib/nativeAuth';
import { repo } from '../lib/repo';
import { localdb } from '../lib/localdb';
import { contentToHtml, sanitizeHtml } from '../lib/richtext';
import { APP_DOWNLOAD_URL, fetchLatestRelease } from '../lib/updates';
import { isInAppBrowser } from '../lib/inAppBrowser';
import { previewTheme, restoreOwnTheme } from '../lib/palette';
import { useTheme } from '../context/ThemeContext';
import logoUrl from '../images/mn_logo.png';

const KNOWN_TABS = ['docs', 'plans', 'view', 'schedule', 'settings'];

const JS_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABEL = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' };
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const today = () => JS_DAY[new Date().getDay()];

// Live refresh cadence for a shared link. Deliberately well under the public
// endpoint's IP rate limit, which the old 4s interval exceeded on its own.
const POLL_MS = 15000;
const POLL_MAX_MS = 60000;

const refKey = (tok) => 'mahnotes_ref_' + tok;
const refLoad = (tok) => { try { return JSON.parse(localStorage.getItem(refKey(tok)) || '{}'); } catch { return {}; } };
const refSave = (tok, state) => { try { localStorage.setItem(refKey(tok), JSON.stringify(state)); } catch {} };


// Public acquisition CTA shown under a shared link on the web: get the app, and
// sign in / sign up. Hidden inside the native app and for signed-in owners.
// "Shared by …" — a face and a name make a shared page read as something a
// person sent you rather than a document dump. The author picks either, both
// or neither in Settings → Privacy, so all four shapes have to render:
// picture + name, initial + name, picture alone, or nothing at all.
function AuthorBadge({ author }) {
  const name = (author?.name || '').trim();
  const avatar = author?.avatar || '';
  const showAvatar = author?.showAvatar !== false;
  const initial = name.charAt(0).toUpperCase();

  // The disc appears only when a picture is allowed — one drawn while the
  // author has the profile switched off is indistinguishable from the profile
  // they just hid. With it allowed but no picture stored, an initial stands in
  // when the name is public, and a neutral figure when it is not, so the
  // switch always does something visible without leaking the hidden name.
  let disc = null;
  if (avatar) disc = <img className="view-author-avatar" src={avatar} alt="" />;
  else if (showAvatar) {
    disc = (
      <span className="view-author-avatar">
        {initial || <i className="fas fa-user" aria-hidden="true" />}
      </span>
    );
  }
  if (!name && !disc) return null;

  return (
    <div className="view-author">
      {disc}
      <span className="view-author-meta">
        <span className="view-author-label">Shared by</span>
        {name && <span className="view-author-name">{name}</span>}
      </span>
    </div>
  );
}

function ViewerCta({ themed }) {
  const signedIn = !!getToken();
  // Shared links land here from Messenger/Instagram/etc. often enough that
  // this is the single most common place someone hits the broken-download
  // path — their embedded WebView, not real Chrome, can't finish an APK
  // download (it just sits at 100% forever). Warn before they try.
  const inApp = isInAppBrowser();
  // Resolve the direct .apk so "Download the app" actually downloads, instead
  // of dropping the user on the GitHub releases page to hunt for the asset.
  // Falls back to that page until this resolves (or if it fails).
  const [apkUrl, setApkUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rel = await fetchLatestRelease();
      if (!cancelled && rel?.apkUrl) setApkUrl(rel.apkUrl);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="view-cta">
      <div className="view-cta-head">
        <span className="logo">Mah Notes</span>
        <p>Your notes, plans &amp; checklists — everywhere.</p>
      </div>
      {themed && (
        <p className="view-themed">
          <i className="fas fa-palette" /> You are reading this in the author&rsquo;s own colour
          theme. Every Mah Notes account picks its own, and it travels with everything you share.
        </p>
      )}
      {inApp && (
        <p className="vcta-warn">
          <i className="fas fa-triangle-exclamation" /> Downloads can get stuck here — tap <b>⋮</b> / <b>···</b> and choose
          <b> “Open in Chrome”</b> first.
        </p>
      )}
      <div className="view-cta-btns">
        {/* New tab → /download, which paints a real page before starting the
            transfer. A new tab aimed straight at the .apk holds no document,
            and Android leaves that download at 100% forever. */}
        <a
          className="vcta-btn primary"
          href={apkUrl ? '/download' : APP_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <i className="fas fa-download" /> Download the app
        </a>
        {signedIn ? (
          <Link className="vcta-btn ghost" to="/">
            <i className="fas fa-arrow-right" /> Open Mah Notes
          </Link>
        ) : (
          <>
            <Link className="vcta-btn ghost" to="/?signup=1">
              <i className="fas fa-user-plus" /> Create an account
            </Link>
            <Link className="vcta-btn ghost" to="/">
              <i className="fas fa-right-to-bracket" /> Sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function Message({ icon, title, desc, extra, busy }: any) {
  return (
    <div className="view-page">
      <div className="view-bar">
        <img className="view-logo" src={logoUrl} alt="" />
        <span className="logo">Mah Notes</span>
      </div>
      <div className="v-card"><div className="empty-state">
        {busy ? <span className="view-spinner" /> : <i className={`fas ${icon}`} />}
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
  const navigate = useNavigate();
  const { effective } = useTheme() || {};
  const token = params.get('token');
  const ownerType = params.get('type');
  const ownerId = params.get('id');
  const from = params.get('from');
  // Back returns to the tab the user opened this from (Docs/Plans/View), not
  // always the home default. Falls back to home when there's no/unknown source.
  const backTo = KNOWN_TABS.includes(from) ? `/?tab=${from}` : '/';

  const [state, setState] = useState<any>({ status: 'loading' }); // loading | ok | message
  const [data, setData] = useState<any>(null); // { kind, mode, title, contentHtml?, days?, id }
  // The author's colour theme, sent with a shared link so the page renders in
  // THEIR colours rather than the reader's. Null for an owner view.
  const [authorTheme, setAuthorTheme] = useState<any>(null);
  // { name, avatar } when the author lets their identity show (Settings →
  // Privacy). Null otherwise, and always null for an owner view.
  const [author, setAuthor] = useState<any>(null);
  const docRef = useRef(null);

  // Paint the page in the author's colours while it is open. Nothing is
  // persisted, so the reader's own theme is untouched and comes straight back
  // when they navigate away (or the fetch turns out to have no theme).
  // Re-runs on a light/dark flip, otherwise ThemeContext would repaint the
  // page in the READER's colours the moment they toggled the mode.
  useEffect(() => {
    if (!authorTheme) return undefined;
    const mode = effective === 'dark' ? 'dark' : 'light';
    previewTheme(authorTheme, mode);
    return () => restoreOwnTheme(mode);
  }, [authorTheme, effective]);

  // ── Load ──────────────────────────────────────────────
  const loadToken = useCallback(async () => {
    const res = await api.get(`/api/share/${token}`);
    const mode = res.viewMode === 'reference' ? 'reference' : 'live';
    setAuthorTheme(res.theme || null);
    setAuthor(res.author || null);
    if (res.itemType === 'plan') {
      setData({ kind: 'plan', mode, title: res.title, days: res.days || {} });
    } else {
      setData({ kind: 'note', mode, title: res.title, contentHtml: res.contentHtml || '' });
    }
    setState({ status: 'ok' });
  }, [token]);

  const loadOwner = useCallback(async () => {
    // Native reads its own offline copy (read-only); web fetches from the API.
    if (isNative) {
      const item = await localdb.get(ownerType === 'plan' ? 'plans' : 'notes', ownerId);
      if (!item) { const e: any = new Error('Not found'); e.status = 404; throw e; }
      // Owner view on the device: text stays read-only, but checkbox taps are
      // saved straight to the local store (repo routes to IndexedDB on native).
      if (ownerType === 'plan') {
        setData({ kind: 'plan', mode: 'owner', id: ownerId, title: item.title, days: item.days || {} });
      } else {
        setData({ kind: 'note', mode: 'owner', id: ownerId, title: item.title, contentHtml: contentToHtml(item.content) });
      }
      setState({ status: 'ok' });
      return;
    }
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
          if (!isNative && !getToken()) {
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
  // The public share endpoint is IP-limited because it is the one route a
  // stranger can hit, so polling has to stay under that ceiling. It also
  // pauses on a hidden tab (a backgrounded browser was spending the whole
  // budget on a page nobody was looking at) and backs off on a 429 rather
  // than retrying straight into the wall.
  useEffect(() => {
    if (!token || !data || data.mode !== 'live') return undefined;
    let delay = POLL_MS;
    let timer = null;
    let stopped = false;

    const schedule = () => { timer = setTimeout(tick, delay); };
    async function tick() {
      if (stopped) return;
      if (document.visibilityState !== 'visible') { schedule(); return; }
      try {
        await loadToken();
        delay = POLL_MS;                      // healthy again
      } catch (err: any) {
        if (err?.status === 429) delay = Math.min(delay * 2, POLL_MAX_MS);
      }
      schedule();
    }

    schedule();
    // Coming back to the tab refreshes immediately rather than waiting out
    // the rest of the interval.
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      delay = POLL_MS;
      tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [token, data, loadToken]);

  // ── Note checkbox wiring (owner saves; reference = localStorage) ──
  useEffect(() => {
    if (!data || data.kind !== 'note' || !docRef.current) return;
    if (data.mode === 'live' || data.readOnly) return; // read-only
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
        // repo → API on web, local IndexedDB on the device.
        try { await repo.updateNote(data.id, { content: sanitizeHtml(el.innerHTML) }); }
        catch { it.setAttribute('data-checked', now ? 'false' : 'true'); }
      }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [data, token]);

  if (state.status === 'loading') {
    return <Message busy title="Loading…" desc="Fetching the shared item." />;
  }
  if (state.status === 'message') {
    return <Message icon={state.icon} title={state.title} desc={state.desc} extra={state.extra} />;
  }

  // ── Render ────────────────────────────────────────────
  const badge = data.mode === 'live'
    ? <div className="live-badge"><span className="live-dot" /> Live · updates in real-time</div>
    : data.mode === 'reference'
      ? <div className="ref-badge"><i className="fas fa-list-check" /> Reference · your own copy</div>
      : <div className="own-badge"><i className="fas fa-circle-check" /> View mode · {data.readOnly ? 'read-only' : 'taps are saved'}</div>;

  const sub = data.mode === 'live' ? 'live · shared' : data.mode === 'reference' ? 'your copy' : 'view mode';

  return (
    <div className="view-page">
      <div className="view-bar">
        {data.mode === 'owner' && (
          <button className="icon-btn view-back" aria-label="Back" onClick={() => navigate(backTo)}>
            <i className="fas fa-arrow-left" />
          </button>
        )}
        <img className="view-logo" src={logoUrl} alt="" />
        <span className="logo">Mah Notes</span><span className="sub">{sub}</span>
      </div>
      <div className="v-card">
        <AuthorBadge author={author} />
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

      {/* Public share on the web → offer the app + sign-in. */}
      {!isNative && data.mode !== 'owner' && <ViewerCta themed={!!authorTheme} />}
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

  const interactive = data.mode !== 'live' && !data.readOnly;

  async function toggle(i) {
    if (!interactive) return;
    const now = !checks[i];
    setChecks((c) => c.map((v, idx) => (idx === i ? now : v)));
    if (data.mode === 'reference') {
      const s = refLoad(token); s[i] = now; refSave(token, s);
    } else {
      // repo → API on web, local IndexedDB on the device.
      try { await repo.checkPlan(data.id, { day: t, index: i, checked: now }); }
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
