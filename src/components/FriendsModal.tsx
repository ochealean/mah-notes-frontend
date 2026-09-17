// ============================================================
//  Friends sheet (online-only).
//
//  Find people by their username or their Mah Notes ID, send a request, and
//  accept the ones others send you. Friendships are consent-based — both
//  sides agree.
//
//  Username is the handle people share. Email is accepted too, but only as a
//  FULL match: a partial one used to return strangers' addresses, which made
//  this a way to harvest them.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { onRealtime } from '../lib/realtime';
import { notify } from '../lib/notify';
import { copyText } from '../lib/copyText';
import BundleAvatar from './BundleAvatar';
import BundleBackground from './BundleBackground';
import { equippedId, equippedIntensity, getBundle } from '../lib/bundles';

const initialOf = (p) => ((p?.displayName || p?.username || 'U')[0] || 'U').toUpperCase();

// The line under someone's name: their handle, never their email.
//
// The server stopped sending addresses altogether — in search results AND in
// the friends list. Renders nothing rather than an empty grey line for the
// older accounts that predate usernames being required.
const subtitleOf = (p) => (p?.username ? `@${p.username}` : '');

// A row's decoration is the ROW'S OWN bundle, never the viewer's.
//
// Today the server sends no bundle with a friend (user.theme is a closed
// {ink, paper, accent, ambient} sub-schema and this is a frontend-only
// change), so `person.bundleId` is undefined and everyone else renders
// undecorated — which is the truthful answer, not a missing feature. Wiring
// it this way rather than reusing `equippedId()` is the point: the moment a
// bundleId reaches this payload, friends' decorations appear with no further
// change here. Painting your own ring on other people's faces would be a
// decoration that lies about them.
function Avatar({ person }) {
  return (
    <BundleAvatar size={38} bundleId={person?.bundleId || 'nocturne'}>
      {person?.avatar
        ? <img className="friend-avatar" src={person.avatar} alt="" />
        : <div className="friend-avatar">{initialOf(person)}</div>}
    </BundleAvatar>
  );
}

function Person({ person, children }) {
  return (
    <div className="friend-row">
      <Avatar person={person} />
      <div className="friend-meta">
        <div className="friend-name">{person.displayName}</div>
        {subtitleOf(person) && <div className="friend-email">{subtitleOf(person)}</div>}
      </div>
      <div className="friend-actions">{children}</div>
    </div>
  );
}

// `initialQuery` opens the sheet with a search already run. A share card's
// "Add friend" action lands here with the sender's handle (see MainApp), so
// the person who wanted to add someone does not have to retype the name they
// just tapped.
export default function FriendsModal({ me, onClose, initialQuery = '' }) {
  const [data, setData] = useState(null); // { friends, incoming, outgoing }
  const [q, setQ] = useState(initialQuery);
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

  // Realtime: when a friend renames themselves, refresh so the list shows it live.
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
      // Refresh search relations if a search is showing.
      if (q.trim().length >= 2) {
        try { const res = await api.get(`/api/users/search?q=${encodeURIComponent(q.trim())}`); setResults(res.results || []); } catch {}
      }
    } catch (err) { notify(err.message || `${label} failed`, 'error'); } finally { setBusyId(''); }
  }

  const sendRequest = (userId) => act('Request', () => api.post('/api/friends/request', { userId }), userId);
  const accept = (id) => act('Accept', () => api.post('/api/friends/accept', { id }), id);
  const removeLink = (id) => act('Remove', () => api.post('/api/friends/remove', { id }), id);

  async function copyId() {
    // The old version called navigator.clipboard directly and swallowed the
    // error, so in the packaged apps the button simply did nothing and gave no
    // hint why. copyText routes per platform and reports success.
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

  // Search result action by relationship.
  function resultAction(r) {
    if (r.relation === 'friends') return <span className="friend-tag ok"><i className="fas fa-check" /> Friends</span>;
    if (r.relation === 'outgoing') return <span className="friend-tag">Pending</span>;
    if (r.relation === 'incoming') {
      return <button className="friend-btn accept" disabled={busyId === r.id} onClick={() => sendRequest(r.id)}><i className="fas fa-check" /> Accept</button>;
    }
    return <button className="friend-btn add" disabled={busyId === r.id} onClick={() => sendRequest(r.id)}><i className="fas fa-user-plus" /> Add</button>;
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* One ground for the whole sheet, so every friend row sits on the
          same field the profile panel does.
          ONE layer, not one per row: a nebula behind each of fifty rows
          would be fifty blurred, animating boxes, and the rows scroll — so
          the background would swim against them. Behind the sheet it stays
          still relative to the list, and costs what a single panel costs.
          The scrim keeps every name and handle above 4.5:1 at every frame. */}
      <div className="popup bnb-host friend-popup" data-bundle={equippedId()} data-intensity={equippedIntensity()}>
        <BundleBackground bundleId={equippedId()} intensity={equippedIntensity()} />
        {/* The scroll moved off .popup and onto this inner shell. An
            absolutely positioned layer inside a scroll container is
            anchored to the top of the CONTENT, so the ground would slide
            up and off as soon as anyone scrolled the friends list. The
            shell scrolls; the sheet, and the sky behind it, stay put. */}
        <div className="friend-popup-scroll">
        <div className="popup-head">
          <h3><i className="fas fa-user-group" /> Friends</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        {/* You, then your ID. The one avatar in this sheet whose bundle we
            actually know is the viewer's own, so it is the one that wears a
            decoration — and seeing it beside undecorated rows is what makes
            the feature legible without claiming anything about anyone else. */}
        <div className="friend-me">
          <BundleAvatar size={38} bundleId={equippedId()}>
            {me?.avatar
              ? <img className="friend-avatar" src={me.avatar} alt="" />
              : <div className="friend-avatar">{initialOf(me)}</div>}
          </BundleAvatar>
          <div className="friend-meta">
            <div className="friend-name">{me?.displayName || 'You'}</div>
            <div className="friend-email">
              {subtitleOf(me) || 'You'}
              {equippedId() !== 'nocturne' && <> · {getBundle(equippedId()).name}</>}
            </div>
          </div>
        </div>

        {/* Your ID — share this so people can find you. */}
        <div className="friend-myid">
          <div className="friend-myid-label">Your Mah Notes ID (MNID) — share it so friends can add you</div>
          <div className="friend-myid-row">
            <code className="friend-myid-value">{me?.id || '—'}</code>
            <button className="share-copy-btn" onClick={copyId}><i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`} /></button>
          </div>
        </div>

        {error && <div className="share-revoked">{error}</div>}

        {/* Search */}
        <div className="search-bar friend-search">
          <i className="fas fa-search" />
          <input type="text" placeholder="Find by username or Mah Notes ID (MNID)…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {q.trim().length >= 2 && (
          <div className="friend-section">
            {searching && <div className="friend-hint"><i className="fas fa-circle-notch fa-spin" /> Searching…</div>}
            {!searching && results && results.length === 0 && <div className="friend-hint">No one matches “{q.trim()}”.</div>}
            {results && results.map((r) => <Person key={r.id} person={r}>{resultAction(r)}</Person>)}
          </div>
        )}

        {/* Incoming requests */}
        {incoming.length > 0 && (
          <div className="friend-section">
            <div className="view-section-label"><i className="fas fa-inbox" /> Requests ({incoming.length})</div>
            {incoming.map((e) => (
              <Person key={e.id} person={e.user}>
                <button className="friend-btn accept" disabled={busyId === e.id} onClick={() => accept(e.id)}><i className="fas fa-check" /></button>
                <button className="friend-btn decline" disabled={busyId === e.id} onClick={() => removeLink(e.id)}><i className="fas fa-times" /></button>
              </Person>
            ))}
          </div>
        )}

        {/* Outgoing (sent) */}
        {outgoing.length > 0 && (
          <div className="friend-section">
            <div className="view-section-label"><i className="fas fa-paper-plane" /> Sent ({outgoing.length})</div>
            {outgoing.map((e) => (
              <Person key={e.id} person={e.user}>
                <span className="friend-tag">Pending</span>
                <button className="friend-btn decline" disabled={busyId === e.id} onClick={() => removeLink(e.id)} title="Cancel"><i className="fas fa-times" /></button>
              </Person>
            ))}
          </div>
        )}

        {/* Friends */}
        <div className="friend-section">
          <div className="view-section-label"><i className="fas fa-user-group" /> Your friends ({friends.length})</div>
          {friends.length === 0 ? (
            <div className="friend-hint">No friends yet. Search above to add someone.</div>
          ) : friends.map((e) => (
            <Person key={e.id} person={e.user}>
              <button className="friend-btn decline" disabled={busyId === e.id} onClick={() => { if (confirm(`Remove ${e.user.displayName} as a friend?`)) removeLink(e.id); }} title="Remove">
                <i className="fas fa-user-minus" />
              </button>
            </Person>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}
