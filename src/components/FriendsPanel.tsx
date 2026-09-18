// ============================================================
//  Friends — shown right in Settings → Friends, not in a pop-up behind
//  another tap.
//
//  Find people by their username or their Mah Notes ID, send a request, and
//  accept the ones others send you. Friendships are consent-based — both
//  sides agree.
//
//  Each friend is drawn as a card in THEIR look, not yours: their colour
//  theme (ink, paper, accent) and their bundle. A friend on Midnight with
//  Galaxy shows up dark, under their own sky, with their own decoration —
//  the same header they see on their own account page. Both come from their
//  account, so they follow the friend wherever they change them.
//
//  Username is the handle people share. Email is accepted too, but only as a
//  FULL match: a partial one used to return strangers' addresses.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { onRealtime } from '../lib/realtime';
import { notify } from '../lib/notify';
import { copyText } from '../lib/copyText';
import { getBundle } from '../lib/bundles';
import { computeVars, resolveTheme, isDarkColor } from '../lib/palette';
import BundleAvatar, { Face } from './BundleAvatar';
import BundleSky from './BundleSky';

// The line under someone's name: their handle, never their email.
const subtitleOf = (p) => (p?.username ? `@${p.username}` : '');

// A stable number from an id, so each friend's sky is laid out its own way
// and stays that way.
function seedOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 100000 + 1;
}

/** A compact row — search results, requests. Decorated in their bundle. */
function Person({ person, children }) {
  return (
    <div className="friend-row">
      <BundleAvatar size={38} bundleId={person?.bundle || 'default'}>
        <Face src={person?.avatar} name={person?.displayName || person?.username} />
      </BundleAvatar>
      <div className="friend-meta">
        <div className="friend-name">{person.displayName}</div>
        {subtitleOf(person) && <div className="friend-email">{subtitleOf(person)}</div>}
      </div>
      <div className="friend-actions">{children}</div>
    </div>
  );
}

/**
 * A friend's colours as CSS variables, scoped to their card. A friend with
 * no saved theme uses the built-in one — that is what their app looks like,
 * so that is what their card shows, whatever YOUR theme is.
 */
function themeScope(theme, bundle) {
  // A bundle with its own appearance decides what they look like — that is
  // what their app is wearing. Otherwise it is their own saved colours.
  const t = resolveTheme(bundle.theme || theme || null);
  const vars = computeVars(t, isDarkColor(t.paper) ? 'dark' : 'light');
  return { t, style: vars as any, dark: isDarkColor(t.paper) };
}

/** A friend, as the header card they see on their own account page — in
    their theme and their bundle. */
function FriendHero({ entry, busy, onRemove }) {
  const p = entry.user;
  const bundle = getBundle(p.bundle);
  const look = themeScope(p.theme, bundle);
  return (
    <section className="acct-hero friend-hero theme-scope" style={look.style}
      data-ground={look.dark ? 'dark' : 'light'} data-bundle-surface={bundle.id} aria-label={p.displayName}>
      {/* Only drawn while on screen — a long list must not run twenty skies.
          Painted against THEIR paper, so the scrim matches their ground. */}
      <BundleSky preset="friend" bundleId={bundle.id} seed={seedOf(String(p.id))} lazy
        ground={{ ink: look.t.ink, paper: look.t.paper }} />
      <div className="acct-hero-c">
        <BundleAvatar size={64} bundleId={bundle.id}>
          <Face src={p.avatar} name={p.displayName || p.username} />
        </BundleAvatar>
        <div className="acct-id">
          <div className="acct-name">{p.displayName}</div>
          {p.username && <div className="acct-handle">@{p.username}</div>}
        </div>
        <div className="friend-hero-act">
          <button className="friend-btn decline" disabled={busy} onClick={onRemove}
            title={`Remove ${p.displayName}`} aria-label={`Remove ${p.displayName} as a friend`}>
            <i className="fas fa-user-minus" />
          </button>
        </div>
      </div>
    </section>
  );
}

export default function FriendsPanel({ me }) {
  const [data, setData] = useState(null); // { friends, incoming, outgoing }
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null); // null = idle, [] = no matches
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const debounce = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get('/api/friends'));
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load friends.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: a friend renaming themselves — or equipping a new bundle —
  // refreshes the list, so their card changes while you look at it.
  useEffect(() => onRealtime('friend:updated', () => load()), [load]);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    clearTimeout(debounce.current);
    if (term.length < 2) { setResults(null); setSearching(false); return undefined; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await api.get(`/api/users/search?q=${encodeURIComponent(term)}`);
        setResults(res.results || []);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(debounce.current);
  }, [q]);

  async function act(label, fn, id) {
    setBusyId(id);
    try {
      await fn();
      await load();
      if (q.trim().length >= 2) {
        try { const res = await api.get(`/api/users/search?q=${encodeURIComponent(q.trim())}`); setResults(res.results || []); } catch { /* keep the old results */ }
      }
    } catch (err) { notify(err.message || `${label} failed`, 'error'); } finally { setBusyId(''); }
  }

  const sendRequest = (userId) => act('Request', () => api.post('/api/friends/request', { userId }), userId);
  const accept = (id) => act('Accept', () => api.post('/api/friends/accept', { id }), id);
  const removeLink = (id) => act('Remove', () => api.post('/api/friends/remove', { id }), id);

  async function copyId() {
    if (await copyText(String(me?.id || ''))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      notify('Could not copy — select the ID and copy it by hand', 'error');
    }
  }

  const incoming = data?.incoming || [];
  const outgoing = data?.outgoing || [];
  const friends = data?.friends || [];

  function resultAction(r) {
    if (r.relation === 'friends') return <span className="friend-tag ok"><i className="fas fa-check" /> Friends</span>;
    if (r.relation === 'outgoing') return <span className="friend-tag">Pending</span>;
    if (r.relation === 'incoming') {
      return <button className="friend-btn accept" disabled={busyId === r.id} onClick={() => sendRequest(r.id)}><i className="fas fa-check" /> Accept</button>;
    }
    return <button className="friend-btn add" disabled={busyId === r.id} onClick={() => sendRequest(r.id)}><i className="fas fa-user-plus" /> Add</button>;
  }

  return (
    <>
      <div className="settings-card fp-card">
        <div className="settings-section-label">Find people</div>
        <div className="fp-body">
          {/* Your ID — share this so people can find you. */}
          <div className="friend-myid">
            <div className="friend-myid-label">Your Mah Notes ID (MNID) — share it so friends can add you</div>
            <div className="friend-myid-row">
              <code className="friend-myid-value">{me?.id || '—'}</code>
              <button className="share-copy-btn" aria-label="Copy your ID" onClick={copyId}><i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`} /></button>
            </div>
          </div>

          {error && <div className="share-revoked">{error}</div>}

          <div className="search-bar friend-search">
            <i className="fas fa-search" />
            <input type="text" placeholder="Find by username or Mah Notes ID (MNID)…" value={q}
              aria-label="Find people" onChange={(e) => setQ(e.target.value)} />
          </div>
          {q.trim().length >= 2 && (
            <div className="friend-section">
              {searching && <div className="friend-hint"><i className="fas fa-circle-notch fa-spin" /> Searching…</div>}
              {!searching && results && results.length === 0 && <div className="friend-hint">No one matches “{q.trim()}”.</div>}
              {results && results.map((r) => <Person key={r.id} person={r}>{resultAction(r)}</Person>)}
            </div>
          )}
        </div>
      </div>

      {(incoming.length > 0 || outgoing.length > 0) && (
        <div className="settings-card fp-card">
          {incoming.length > 0 && (
            <>
              <div className="settings-section-label">Requests ({incoming.length})</div>
              <div className="fp-body">
                {incoming.map((e) => (
                  <Person key={e.id} person={e.user}>
                    <button className="friend-btn accept" disabled={busyId === e.id} onClick={() => accept(e.id)} aria-label="Accept"><i className="fas fa-check" /></button>
                    <button className="friend-btn decline" disabled={busyId === e.id} onClick={() => removeLink(e.id)} aria-label="Decline"><i className="fas fa-times" /></button>
                  </Person>
                ))}
              </div>
            </>
          )}
          {outgoing.length > 0 && (
            <>
              <div className="settings-section-label">Sent ({outgoing.length})</div>
              <div className="fp-body">
                {outgoing.map((e) => (
                  <Person key={e.id} person={e.user}>
                    <span className="friend-tag">Pending</span>
                    <button className="friend-btn decline" disabled={busyId === e.id} onClick={() => removeLink(e.id)} title="Cancel" aria-label="Cancel request"><i className="fas fa-times" /></button>
                  </Person>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="fp-list-head">
        <span className="kicker">Your friends{data ? ` (${friends.length})` : ''}</span>
      </div>
      {data === null && !error ? (
        <div className="friend-hint"><i className="fas fa-circle-notch fa-spin" /> Loading friends…</div>
      ) : friends.length === 0 ? (
        <div className="settings-card fp-card"><p className="settings-hint-text" style={{ paddingTop: 16 }}>No friends yet. Search above to add someone.</p></div>
      ) : friends.map((e) => (
        <FriendHero key={e.id} entry={e} busy={busyId === e.id}
          onRemove={() => { if (confirm(`Remove ${e.user.displayName} as a friend?`)) removeLink(e.id); }} />
      ))}
    </>
  );
}
