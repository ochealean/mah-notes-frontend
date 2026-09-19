// ============================================================
//  Viewer page.
//    ?token=…     a public share link. When the link carries a bundle (?b=)
//                 it opens on the sender's card first; "Open the note" adds
//                 noteIsOpen=true, so a refresh or a dropped connection goes
//                 straight back to the note instead of the card.
//    ?type=&id=…  the signed-in owner's own view; taps save to their note.
//
//  On a public link that has checklists, the reader picks how to use them:
//    Follow live            — the sender's checks, refreshed as they change
//    Check off my own copy  — the reader's own checks, kept in this browser
//  Until they pick, they see the list as it was when the page loaded.
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { api, getToken } from '../lib/api';
import { isNative } from '../lib/nativeAuth';
import { hasLocalStore } from '../lib/platform';
import { repo } from '../lib/repo';
import { localdb } from '../lib/localdb';
import { contentToHtml, sanitizeHtml } from '../lib/richtext';
import { resolveTheme } from '../lib/palette';
import { useTheme } from '../context/ThemeContext';
import { getBundle } from '../lib/bundles';
import ShareCard from './ShareCard';
import DownloadAppModal from './DownloadAppModal';
import { celebrateCheck, celebrateNewChecks } from '../lib/checkFx';
import logoUrl from '../images/mn_logo.png';

const KNOWN_TABS = ['docs', 'plans', 'view', 'schedule', 'settings'];

const JS_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_LABEL = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' };
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
const today = () => JS_DAY[new Date().getDay()];

// Live refresh cadence for a shared link. Deliberately well under the public
// endpoint's IP rate limit.
const POLL_MS = 15000;
const POLL_MAX_MS = 60000;

// The reader's own checks, per link, in this browser only.
const refKey = (tok) => 'mahnotes_ref_' + tok;
const refLoad = (tok) => { try { return JSON.parse(localStorage.getItem(refKey(tok)) || '{}'); } catch { return {}; } };
const refSave = (tok, state) => { try { localStorage.setItem(refKey(tok), JSON.stringify(state)); } catch {} };

// How the reader is using the checklist, per link, so a refresh keeps it.
type VMode = 'view' | 'live' | 'mine';
const modeKey = (tok) => 'mahnotes_vmode_' + tok;
function modeLoad(tok): VMode | null {
  try {
    const v = localStorage.getItem(modeKey(tok));
    return v === 'view' || v === 'live' || v === 'mine' ? v : null;
  } catch { return null; }
}
const modeSave = (tok, m: VMode) => { try { localStorage.setItem(modeKey(tok), m); } catch {} };

// "Shared by …" — a face and a name make a shared page read as something a
// person sent you rather than a document dump. The author picks either, both
// or neither in Settings → Privacy, so all four shapes have to render.
function AuthorBadge({ author }) {
  const name = (author?.name || '').trim();
  const avatar = author?.avatar || '';
  const showAvatar = author?.showAvatar !== false;
  const initial = name.charAt(0).toUpperCase();

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

// Public "get the app / sign in" block under a shared link (web only). One
// Download button: the modal it opens offers Windows and mobile, and warns
// about in-app browsers where downloads get stuck.
function ViewerCta({ themed, bundleName = '' }) {
  const signedIn = !!getToken();
  const [showDownload, setShowDownload] = useState(false);

  return (
    <div className="view-cta">
      <div className="view-cta-head">
        <span className="logo">Mah Notes</span>
        <p>Your notes, plans &amp; checklists — everywhere.</p>
      </div>
      {bundleName ? (
        <p className="view-themed">
          <i className="fas fa-palette" /> You are reading this in the author&rsquo;s {bundleName}{' '}
          bundle — its colours and its sky. Every bundle is free, and it travels with everything
          you share.
        </p>
      ) : themed && (
        <p className="view-themed">
          <i className="fas fa-palette" /> You are reading this in the author&rsquo;s own colour
          theme. Every Mah Notes account picks its own, and it travels with everything you share.
        </p>
      )}
      <div className="view-cta-btns">
        <button type="button" className="vcta-btn primary" onClick={() => setShowDownload(true)}>
          <i className="fas fa-download" /> Download
        </button>
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
      {showDownload && <DownloadAppModal onClose={() => setShowDownload(false)} />}
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

// The two ways to use a shared checklist, in a panel of their own — above
// the note, never between its title and its text — so they read as controls
// for the page and not as part of what the sender wrote. Pressing the active
// one again goes back to the list as it was when the page loaded.
function ModeBar({ vmode, onLive, onMine }) {
  const live = vmode === 'live';
  const mine = vmode === 'mine';
  return (
    <section className="v-modes-panel" aria-labelledby="vModesHead">
      <div className="v-modes-head" id="vModesHead">
        <i className="fas fa-list-check" aria-hidden="true" />
        <span><b>This has a checklist.</b> How do you want to use it?</span>
      </div>
      <div className="v-modes" role="group" aria-labelledby="vModesHead">
        <button type="button" className={`v-mode${live ? ' on' : ''}`} aria-pressed={live} onClick={onLive}>
          {live ? <span className="v-live-dot" aria-hidden="true" /> : <i className="fas fa-tower-broadcast" aria-hidden="true" />}
          <span className="v-mode-t">
            <b>{live ? 'Following live' : 'Follow live'}</b>
            <small>{live ? 'The sender’s checks, as they change. Tap to stop.' : 'See the sender’s checks as they change'}</small>
          </span>
        </button>
        <button type="button" className={`v-mode${mine ? ' on' : ''}`} aria-pressed={mine} onClick={onMine}>
          <i className={`fas ${mine ? 'fa-square-check' : 'fa-pen-to-square'}`} aria-hidden="true" />
          <span className="v-mode-t">
            <b>{mine ? 'Checking off my own copy' : 'Check off my own copy'}</b>
            <small>{mine ? 'Saved on this device only. Tap to stop.' : 'Check the boxes yourself — the sender’s list never changes'}</small>
          </span>
        </button>
      </div>
    </section>
  );
}

// Before the reader starts checking off their own copy: keep the boxes that
// are checked, or uncheck them all.
function StartCopyDialog({ onClear, onKeep, onCancel }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="modal-overlay confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="popup confirm-popup" role="dialog" aria-modal="true" aria-labelledby="startCopyTitle">
        <div className="popup-head"><h3 id="startCopyTitle"><i className="fas fa-pen-to-square" /> Check off your own copy</h3></div>
        <p className="confirm-text">
          Your checks stay in this browser and never change the sender’s list. Start with every
          box unchecked, or keep the boxes checked exactly as they are now?
        </p>
        <div className="confirm-actions">
          <button className="btn btn-primary btn-block" onClick={onClear}>Uncheck every box</button>
          <button className="btn btn-ghost btn-block" onClick={onKeep}>Keep the boxes checked</button>
          <button className="btn btn-ghost btn-block" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function Viewer() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { setPageTheme } = useTheme() || ({} as any);
  const token = params.get('token');
  const ownerType = params.get('type');
  const ownerId = params.get('id');
  const from = params.get('from');
  // The sender's bundle, carried by the link. Validated, not trusted: an
  // unknown id falls back to Default. (Their @handle is NOT taken from the
  // link — it comes from the server, which only sends it while the sender
  // shows their name on shared links. See Settings → Privacy.)
  const senderBundle = getBundle(params.get('b'));
  // In the URL rather than in state, so it survives a refresh.
  const noteIsOpen = params.get('noteIsOpen') === 'true';
  const backTo = KNOWN_TABS.includes(from) ? `/?tab=${from}` : '/';

  const [state, setState] = useState<any>({ status: 'loading' }); // loading | ok | message
  // { kind, mode: 'live'|'reference'|'owner', title, contentHtml?, days?, id }
  const [data, setData] = useState<any>(null);
  // The author's colour theme, so the page renders in THEIR colours.
  const [authorTheme, setAuthorTheme] = useState<any>(null);
  // { name, avatar, showAvatar } when the author lets their identity show.
  const [author, setAuthor] = useState<any>(null);
  const [vmode, setVmode] = useState<VMode>(() => (token && modeLoad(token)) || 'view');
  const [askCopy, setAskCopy] = useState(false);
  const docRef = useRef(null);
  const firstLoad = useRef(true);
  // Which boxes were checked at the last live refresh, so the ones the sender
  // has just checked can pop as they arrive.
  const liveChecks = useRef<Set<number> | null>(null);

  // The page wears the sender's LOOK: their bundle's appearance when the
  // bundle brings one (Galaxy is deep space), otherwise their own saved
  // colours. Nothing is persisted, and whatever the reader has in force
  // comes straight back on the way out.
  // Handed to the theme provider, which paints it on the page's own ground
  // (never the reader's, which would swap a light theme's ink and paper).
  const pageTheme = senderBundle.theme || authorTheme;
  useEffect(() => {
    if (!pageTheme || !setPageTheme) return undefined;
    setPageTheme(pageTheme);
    return () => setPageTheme(null);
  }, [pageTheme, setPageTheme]);

  function changeMode(m: VMode) {
    setVmode(m);
    if (token) modeSave(token, m);
  }

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
    // An old "reference" link was always a blank copy of your own; keep
    // opening it that way unless the reader has picked something since.
    if (firstLoad.current) {
      firstLoad.current = false;
      if (mode === 'reference' && !modeLoad(token)) setVmode('mine');
    }
    setState({ status: 'ok' });
  }, [token]);

  const loadOwner = useCallback(async () => {
    // Native reads its own offline copy; web fetches from the API.
    if (hasLocalStore) {
      const item = await localdb.get(ownerType === 'plan' ? 'plans' : 'notes', ownerId);
      if (!item) { const e: any = new Error('Not found'); e.status = 404; throw e; }
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
          if (!hasLocalStore && !getToken()) {
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

  // ── Follow live: poll the sender's copy ───────────────
  // The public share endpoint is IP-limited, so polling stays well under that
  // ceiling, pauses on a hidden tab, and backs off on a 429.
  const following = !!token && !!data && vmode === 'live';
  useEffect(() => {
    if (!following) return undefined;
    let delay = POLL_MS;
    let timer = null;
    let stopped = false;

    const schedule = () => { timer = setTimeout(tick, delay); };
    async function tick() {
      if (stopped) return;
      if (document.visibilityState !== 'visible') { schedule(); return; }
      try {
        await loadToken();
        delay = POLL_MS;
      } catch (err: any) {
        if (err?.status === 429) delay = Math.min(delay * 2, POLL_MAX_MS);
      }
      schedule();
    }

    // Turning it on shows the sender's current checks straight away.
    tick();
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
  }, [following, loadToken]);

  // ── Note checkboxes: owner saves; "my copy" saves locally; else read-only ──
  useEffect(() => {
    if (!data || data.kind !== 'note' || !docRef.current) return undefined;
    const el = docRef.current;
    const items = [...el.querySelectorAll('.doc-check-item')];
    const owner = data.mode === 'owner';
    const interactive = owner ? !data.readOnly : vmode === 'mine';

    if (!owner && vmode === 'mine') {
      const saved = refLoad(token);
      items.forEach((it, idx) => it.setAttribute('data-checked', saved[idx] ? 'true' : 'false'));
    }
    items.forEach((it) => it.classList.toggle('tap', interactive));
    if (!interactive) return undefined;

    const onClick = async (e) => {
      const it = e.target.closest('.doc-check-item');
      if (!it) return;
      const idx = items.indexOf(it);
      const now = it.getAttribute('data-checked') !== 'true';
      it.setAttribute('data-checked', now ? 'true' : 'false');
      if (now) celebrateCheck(it);
      if (!owner) {
        const s = refLoad(token); s[idx] = now; refSave(token, s);
      } else {
        try { await repo.updateNote(data.id, { content: sanitizeHtml(el.innerHTML) }); }
        catch { it.setAttribute('data-checked', now ? 'false' : 'true'); }
      }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [data, token, vmode]);

  // Follow live: pop each box the sender has checked since the last refresh.
  // The first refresh only records the starting point, so opening the page
  // doesn't set off every box that was already checked.
  useEffect(() => {
    if (!data || data.kind !== 'note' || vmode !== 'live' || !docRef.current) { liveChecks.current = null; return; }
    if (!liveChecks.current) {
      const start = new Set<number>();
      docRef.current.querySelectorAll('.doc-check-item').forEach((it, i) => {
        if (it.getAttribute('data-checked') === 'true') start.add(i);
      });
      liveChecks.current = start;
      return;
    }
    liveChecks.current = celebrateNewChecks(docRef.current, liveChecks.current);
  }, [data, vmode]);

  // Back from the open note to the card, where the download and sign-up are.
  function backToCard() {
    const next = new URLSearchParams(params);
    next.delete('noteIsOpen');
    setParams(next, { replace: true });
    window.scrollTo(0, 0);
  }

  // Start checking off your own copy, from empty or from what is checked now.
  function startCopy(keep: boolean) {
    const s = {};
    if (keep && data) {
      if (data.kind === 'note' && docRef.current) {
        [...docRef.current.querySelectorAll('.doc-check-item')].forEach((it: any, i) => {
          if (it.getAttribute('data-checked') === 'true') s[i] = true;
        });
      } else if (data.kind === 'plan') {
        ((data.days && data.days[today()]) || []).forEach((it, i) => { if (it.checked) s[i] = true; });
      }
    }
    refSave(token, s);
    setAskCopy(false);
    changeMode('mine');
  }

  if (state.status === 'loading') {
    return <Message busy title="Loading…" desc="Fetching the shared item." />;
  }
  if (state.status === 'message') {
    return <Message icon={state.icon} title={state.title} desc={state.desc} extra={state.extra} />;
  }

  // ── The share card ────────────────────────────────────
  // A public link that carries a bundle opens here first. Default links, the
  // owner's own view, and a card already opened (noteIsOpen) skip it.
  if (token && senderBundle.id !== 'default' && !noteIsOpen && data.mode !== 'owner') {
    const openNote = () => {
      const next = new URLSearchParams(params);
      next.set('noteIsOpen', 'true');
      setParams(next, { replace: true });
    };
    return (
      <div className={`vcard-page${senderBundle.id === 'galaxy' ? ' galaxy-amb' : ''}`}>
        <div className="vcard-wrap">
          <ShareCard
            bundleId={senderBundle.id}
            author={author}
            handle={author?.handle || ''}
            kind={data.kind === 'plan' ? 'plan' : 'note'}
            title={data.title}
            onOpen={openNote}
            ground={pageTheme ? resolveTheme(pageTheme) : null}
          />
          {!isNative && <ViewerCta themed={!!pageTheme} bundleName={senderBundle.theme ? senderBundle.name : ''} />}
        </div>
      </div>
    );
  }

  // ── The note ──────────────────────────────────────────
  const isOwner = data.mode === 'owner';
  const hasChecks = data.kind === 'plan'
    ? Object.values(data.days || {}).some((a: any) => a && a.length)
    : /doc-check-item/.test(data.contentHtml || '');
  const showModes = !!token && !isOwner && hasChecks;

  return (
    <div className={`view-page${senderBundle.id === 'galaxy' ? ' galaxy-amb' : ''}`}>
      <div className="view-bar">
        {isOwner && (
          <button className="icon-btn view-back" aria-label="Back" onClick={() => navigate(backTo)}>
            <i className="fas fa-arrow-left" />
          </button>
        )}
        {/* Once the note is open, the card — and the download and sign-up
            under it — is one step back. */}
        {!isOwner && noteIsOpen && (
          <button type="button" className="view-back-btn" onClick={backToCard}
            title="Back to the card, where you can get the app or sign in">
            <i className="fas fa-arrow-left" /> Back
          </button>
        )}
        <img className="view-logo" src={logoUrl} alt="" />
        <span className="logo">Mah Notes</span>
        <span className="sub">{isOwner ? 'view mode' : 'shared with you'}</span>
      </div>

      {showModes && (
        <ModeBar
          vmode={vmode}
          onLive={() => changeMode(vmode === 'live' ? 'view' : 'live')}
          onMine={() => (vmode === 'mine' ? changeMode('view') : setAskCopy(true))}
        />
      )}

      <div className="v-card">
        {/* Once the reader has opened the note from the card they have
            already met the sender — the byline would only repeat it. */}
        {!isOwner && !noteIsOpen && <AuthorBadge author={author} />}
        {isOwner && (
          <div className="own-badge"><i className="fas fa-circle-check" /> View mode · {data.readOnly ? 'read-only' : 'taps are saved'}</div>
        )}
        <h1 className="v-title">{data.title || (data.kind === 'plan' ? 'Plan' : 'Untitled')}</h1>

        {/* Keyed by mode so switching always starts from the sender's own
            HTML, rather than from checks drawn onto the old DOM. */}
        {data.kind === 'note' ? (
          <div key={vmode} ref={docRef} className="doc-content" dangerouslySetInnerHTML={{ __html: data.contentHtml }} />
        ) : (
          <PlanView key={vmode} data={data} token={token} vmode={vmode} />
        )}

        {showModes && vmode === 'mine' && (
          <div className="ref-note"><i className="fas fa-circle-info" /> This is your own copy — your checks are saved only on this device and never change the sender's list.</div>
        )}
      </div>

      {/* Public share on the web → offer the app + sign-in, until the note
          has been opened from the card. */}
      {!isNative && !isOwner && !noteIsOpen && <ViewerCta themed={!!pageTheme} bundleName={senderBundle.theme ? senderBundle.name : ''} />}

      {askCopy && (
        <StartCopyDialog onClear={() => startCopy(false)} onKeep={() => startCopy(true)} onCancel={() => setAskCopy(false)} />
      )}
    </div>
  );
}

// Plan body: today's checklist + full week.
function PlanView({ data, token, vmode }) {
  const t = today();
  const baseItems = (data.days && data.days[t]) || [];
  const owner = data.mode === 'owner';
  const mine = !owner && vmode === 'mine';
  const [checks, setChecks] = useState(() => {
    if (mine) {
      const saved = refLoad(token);
      return baseItems.map((_, i) => !!saved[i]);
    }
    return baseItems.map((it) => !!it.checked);
  });

  const listRef = useRef(null);
  const checksRef = useRef(checks);
  checksRef.current = checks;

  // Follow the sender's checks whenever the data refreshes. While following
  // live, a box they have just checked pops as it arrives.
  useEffect(() => {
    if (mine) return;
    const next = ((data.days && data.days[t]) || []).map((it) => !!it.checked);
    const fresh = vmode === 'live' ? next.map((v, i) => v && !checksRef.current[i]) : [];
    setChecks(next);
    if (fresh.some(Boolean)) {
      requestAnimationFrame(() => fresh.forEach((f, i) => { if (f) celebrateCheck(listRef.current?.children[i]); }));
    }
  }, [data, t, mine, vmode]);

  const interactive = owner ? !data.readOnly : mine;

  async function toggle(i, el) {
    if (!interactive) return;
    const now = !checks[i];
    if (now) celebrateCheck(el);
    setChecks((c) => c.map((v, idx) => (idx === i ? now : v)));
    if (mine) {
      const s = refLoad(token); s[i] = now; refSave(token, s);
    } else {
      try { await repo.checkPlan(data.id, { day: t, index: i, checked: now }); }
      catch { setChecks((c) => c.map((v, idx) => (idx === i ? !now : v))); }
    }
  }

  return (
    <>
      <div className="today-badge" style={{ marginBottom: 12 }}><i className="fas fa-calendar-day" /> {DAY_LABEL[t]}</div>
      <div className="vlist" ref={listRef}>
        {baseItems.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}><i className="fas fa-mug-hot" /><p>Nothing scheduled for {DAY_LABEL[t]} — rest day!</p></div>
        ) : baseItems.map((it, i) => (
          <div key={i} className={`doc-check-item${interactive ? ' tap' : ''}`} data-checked={checks[i] ? 'true' : 'false'}
            onClick={(e) => toggle(i, e.currentTarget)}>
            {it.text}
          </div>
        ))}
      </div>
      <WeekDetails days={data.days} markDone={!mine} />
    </>
  );
}
