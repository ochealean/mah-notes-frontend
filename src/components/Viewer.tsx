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
import { hasLocalStore } from '../lib/platform';
import { repo } from '../lib/repo';
import { localdb } from '../lib/localdb';
import { contentToHtml, sanitizeHtml } from '../lib/richtext';
import { APP_DOWNLOAD_URL, fetchLatestRelease } from '../lib/updates';
import { isInAppBrowser } from '../lib/inAppBrowser';
import { isMobileBrowser, isWindowsBrowser } from '../lib/deviceKind';
import { previewTheme, restoreOwnTheme } from '../lib/palette';
import { useTheme } from '../context/ThemeContext';
import { getBundle, safeHandle } from '../lib/bundles';
import BundleAvatar from './BundleAvatar';
import BundleBackground from './BundleBackground';
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

// A few lines of plain text for the share card.
//
// Derived in the client from what /api/share already returns — there is no
// separate preview field, and inventing one would mean a second server path
// that can disagree with the body the reader opens a moment later.
// Tags are stripped rather than rendered: this is a summary line, not a
// second copy of the document, and unrendered markup in a teaser looks
// broken. Truncation is on a word boundary so it never cuts mid-word.
const PREVIEW_MAX = 190;

function previewOf(data) {
  if (!data) return '';
  let text = '';
  if (data.kind === 'plan') {
    // A plan's "content" is its week; the first few of today's items say
    // more about it than the raw markup ever would.
    const all = Object.values(data.days || {}).flat() as any[];
    text = all.map((it) => it && it.text).filter(Boolean).join(' · ');
  } else {
    text = String(data.contentHtml || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]*>/g, '');
  }
  // Entities survive tag-stripping, so decode the handful that actually
  // show up in prose before measuring the length.
  text = text
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= PREVIEW_MAX) return text;
  const cut = text.slice(0, PREVIEW_MAX);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 80 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

const refKey = (tok) => 'mahnotes_ref_' + tok;
const refLoad = (tok) => { try { return JSON.parse(localStorage.getItem(refKey(tok)) || '{}'); } catch { return {}; } };
const refSave = (tok, state) => { try { localStorage.setItem(refKey(tok), JSON.stringify(state)); } catch {} };


// Public acquisition CTA shown under a shared link on the web: get the app, and
// sign in / sign up. Hidden inside the native app and for signed-in owners.
// "Shared by …" — a face and a name make a shared page read as something a
// person sent you rather than a document dump. The author picks either, both
// or neither in Settings → Privacy, so all four shapes have to render:
// picture + name, initial + name, picture alone, or nothing at all.
function AuthorBadge({ author, bundleId }) {
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

  // At 40px this resolves to the 'simple' tier — the rim plus one orbiting
  // body. The full system would be invisible detail at this size and would
  // cost exactly the same to compute.
  if (disc && bundleId) disc = <BundleAvatar size={40} bundleId={bundleId}>{disc}</BundleAvatar>;

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
  const [installerUrl, setInstallerUrl] = useState(null);
  // A phone gets the APK alone; it cannot run a Windows installer. A desktop
  // gets both, since someone at a computer may be fetching the app for their
  // phone, and Windows goes first when that is what they are running.
  const onMobile = isMobileBrowser();
  const onWindows = isWindowsBrowser();
  const showWindows = !!installerUrl && !onMobile;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rel = await fetchLatestRelease();
      if (cancelled) return;
      if (rel?.apkUrl) setApkUrl(rel.apkUrl);
      if (rel?.installerUrl) setInstallerUrl(rel.installerUrl);
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
        {/* Windows first for a Windows visitor. The installer is an ordinary
            download, so a plain link is fine.

            Android goes via /download, which paints a real page before starting
            the transfer. A new tab aimed straight at the .apk holds no
            document, and Android leaves that download at 100% forever. */}
        {showWindows && onWindows && (
          <a className="vcta-btn primary" href={installerUrl}>
            <i className="fab fa-windows" /> Download for Windows
          </a>
        )}
        <a
          className={`vcta-btn ${showWindows && onWindows ? 'ghost' : 'primary'}`}
          href={apkUrl ? '/download' : APP_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <i className="fab fa-android" /> Download for Android
        </a>
        {showWindows && !onWindows && (
          <a className="vcta-btn ghost" href={installerUrl}>
            <i className="fab fa-windows" /> Download for Windows
          </a>
        )}
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

// ── The share card (v-card) ─────────────────────────────
//
// The card IS the page; the note opens from it. This is the one surface
// someone who has never used Mah Notes will ever see, so it is doing
// recruitment as well as decoration — and it is the only place the bundle
// catalogue gets discovered, by being seen on somebody else's page.
//
// Whose bundle: the SENDER'S, read from the link (?b=). The reader's own app
// keeps its own theme and its own bundle — nothing here is persisted, which is
// the same contract the author's colour theme already has (see previewTheme).
//
// What it shows: a decorated avatar, a name, a handle, the bundle's name,
// the title, a few lines of preview, and one clear action.
//
// The preview earns its place. Without it the card is a title and two
// buttons — a header with nothing under it — and a reader has no way to
// tell whether the link is worth opening. It is a few lines, stripped to
// plain text and truncated here in the client; the full body only arrives
// when they ask for it.
//
// The identity block degrades in four directions, because the author's two
// privacy switches make four shapes (picture and name, initial and name,
// picture alone, neither) and a fifth case where the link predates bundles
// and carries no handle at all. None of them may leave a hole: with no
// identity to show, the card leads with the app mark instead and still
// reads as something a person sent.
function VCard({ bundleId, author, handle, title, preview, kind, mode, onOpen }) {
  const signedIn = !!getToken();
  const bundle = getBundle(bundleId);
  const name = (author?.name || '').trim();
  const avatar = author?.avatar || '';
  const showAvatar = author?.showAvatar !== false;
  const initial = name.charAt(0).toUpperCase();

  let face = null;
  if (avatar) face = <img className="vc-face" src={avatar} alt="" />;
  else if (showAvatar) {
    face = (
      <span className="vc-face">
        {initial || <i className="fas fa-user" aria-hidden="true" />}
      </span>
    );
  }
  // Nothing at all to show for the sender: draw the app mark in the same
  // slot rather than collapsing the top of the card to nothing.
  const anonymous = !face && !name;

  // Signed in and the sender's handle travelled with the link → straight to
  // the friends sheet with the search already run. Signed out → sign up, which
  // is the only thing a stranger can usefully do with an add-friend button.
  const addFriend = handle
    ? (signedIn ? `/?tab=settings&friend=${encodeURIComponent(handle)}` : '/?signup=1')
    : null;

  return (
    <div className="vc-page bnb-host" data-bundle={bundle.id} data-intensity="full">
      {/* The share page is where the polish is worth spending, so the
          background runs at full here rather than at the calmer setting
          daily surfaces use. It still pauses on a hidden tab and still
          collapses to its still composition under reduced motion. */}
      <BundleBackground bundleId={bundle.id} intensity="full" />

      <div className="vc-card">
        {/* A hairline of the bundle's own light along the top edge, and a
            faint constellation in the corner. Small, static, and the
            difference between a themed card and a white box with a themed
            avatar dropped on it. */}
        <span className="vc-edge" aria-hidden="true" />
        <span className="vc-constellation" aria-hidden="true" />

        <div className="vc-kicker">Shared with you</div>

        <span className="vc-avatar">
          <BundleAvatar size={112} bundleId={bundle.id}>
            {face || (
              <span className="vc-face vc-face-mark">
                <img src={logoUrl} alt="" />
              </span>
            )}
          </BundleAvatar>
        </span>

        <div className="vc-ident">
          {name ? <div className="vc-name">{name}</div>
            : anonymous && <div className="vc-name vc-name-anon">Someone on Mah Notes</div>}
          {handle && <div className="vc-handle">@{handle}</div>}
          {bundle.id !== 'nocturne' && (
            <div className="vc-bundle">
              <span className="vc-bundle-dot" />
              {bundle.name}
            </div>
          )}
        </div>

        <div className="vc-note">
          <div className="vc-note-label">
            {kind === 'plan' ? 'Weekly plan' : 'Document'}
            {mode === 'live' ? ' · live' : mode === 'reference' ? ' · your own copy' : ''}
          </div>
          <div className="vc-note-title">{title || (kind === 'plan' ? 'Plan' : 'Untitled')}</div>
          {preview && <p className="vc-preview">{preview}</p>}
        </div>

        <div className="vc-act">
          <button type="button" className="vc-btn primary" onClick={onOpen}>
            <i className="fas fa-arrow-right" /> Open the {kind === 'plan' ? 'plan' : 'note'}
          </button>
          {addFriend && (
            <Link className="vc-btn ghost" to={addFriend}>
              <i className="fas fa-user-plus" /> {signedIn ? 'Add friend' : 'Add on Mah Notes'}
            </Link>
          )}
        </div>
      </div>

      <div className="vc-foot">
        <img src={logoUrl} alt="" />
        Mah Notes
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
  // The sender's cosmetics, carried by the link because the public share
  // endpoint has nowhere to put them (see ShareModal). Both are validated
  // here, not trusted: an unknown bundle id falls back to the default rather
  // than rendering nothing, and the handle is reduced to the character set the
  // server allows before it is ever drawn or put in a URL.
  const senderBundle = getBundle(params.get('b')).id;
  const senderHandle = safeHandle(params.get('h'));
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
  // The card is the whole page; the note opens FROM it. Owner views skip the
  // card entirely — it is a greeting for a recipient, and the owner is not one.
  const [opened, setOpened] = useState(false);
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
    if (hasLocalStore) {
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
  // A public link greets the reader with the card first. Note BODY content is
  // never on it — only the title — so nothing is revealed before they ask.
  const isShared = data.mode === 'live' || data.mode === 'reference';
  if (isShared && !opened) {
    return (
      <VCard
        bundleId={senderBundle}
        author={author}
        handle={senderHandle}
        title={data.title}
        preview={previewOf(data)}
        kind={data.kind}
        mode={data.mode}
        onOpen={() => setOpened(true)}
      />
    );
  }

  const badge = data.mode === 'live'
    ? <div className="live-badge"><span className="live-dot" /> Live · updates in real-time</div>
    : data.mode === 'reference'
      ? <div className="ref-badge"><i className="fas fa-list-check" /> Reference · your own copy</div>
      : <div className="own-badge"><i className="fas fa-circle-check" /> View mode · {data.readOnly ? 'read-only' : 'taps are saved'}</div>;

  const sub = data.mode === 'live' ? 'live · shared' : data.mode === 'reference' ? 'your copy' : 'view mode';

  return (
    <div className={`view-page${isShared ? ' view-page-shared' : ''}`}
      data-bundle={isShared ? senderBundle : undefined}>
      <div className="view-bar">
        {isShared && (
          <button className="icon-btn view-back" aria-label="Back to the card" onClick={() => setOpened(false)}>
            <i className="fas fa-arrow-left" />
          </button>
        )}
        {data.mode === 'owner' && (
          <button className="icon-btn view-back" aria-label="Back" onClick={() => navigate(backTo)}>
            <i className="fas fa-arrow-left" />
          </button>
        )}
        <img className="view-logo" src={logoUrl} alt="" />
        <span className="logo">Mah Notes</span><span className="sub">{sub}</span>
      </div>
      <div className="v-card">
        <AuthorBadge author={author} bundleId={isShared ? senderBundle : undefined} />
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
