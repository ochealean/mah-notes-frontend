// ============================================================
//  Friends sheet (online-only).
//
//  Find people by email or user ID, send a request, and accept the
//  ones others send you. Friendships are consent-based — both sides
//  agree. Built to power friend-sharing (Phase 3) later.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { notify } from '../lib/notify.js';

const initialOf = (p) => ((p?.displayName || p?.email || 'U')[0] || 'U').toUpperCase();

function Avatar({ person }) {
  return person?.avatar
    ? <img className="friend-avatar" src={person.avatar} alt="" />
    : <div className="friend-avatar">{initialOf(person)}</div>;
}

function Person({ person, children }) {
  return (
    <div className="friend-row">
      <Avatar person={person} />
      <div className="friend-meta">
        <div className="friend-name">{person.displayName}</div>
        <div className="friend-email">{person.email}</div>
      </div>
      <div className="friend-actions">{children}</div>
    </div>
  );
}

export default function FriendsModal({ me, onClose }) {
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
    try { await navigator.clipboard.writeText(String(me?.id || '')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
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
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-user-group" /> Friends</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        {/* Your ID — share this so people can find you. */}
        <div className="friend-myid">
          <div className="friend-myid-label">Your ID — share it so friends can add you</div>
          <div className="friend-myid-row">
            <code className="friend-myid-value">{me?.id || '—'}</code>
            <button className="share-copy-btn" onClick={copyId}><i className={`fas ${copied ? 'fa-check' : 'fa-copy'}`} /></button>
          </div>
        </div>

        {error && <div className="share-revoked">{error}</div>}

        {/* Search */}
        <div className="search-bar friend-search">
          <i className="fas fa-search" />
          <input type="text" placeholder="Find by email or user ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {q.trim().length >= 2 && (
          <div className="friend-section">
            {searching && <div className="friend-hint"><i className="fas fa-spinner fa-spin" /> Searching…</div>}
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
  );
}
