// ============================================================
//  App shell: app bar, tabs, FAB, bottom nav. Owns the notes &
//  plans data and the editor/share modal state.
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import { notify } from '../lib/notify.js';
import Loader from './Loader.jsx';
import DocsTab from './DocsTab.jsx';
import PlansTab from './PlansTab.jsx';
import SettingsTab from './SettingsTab.jsx';
import DocEditor from './DocEditor.jsx';
import PlanEditor from './PlanEditor.jsx';
import ShareModal from './ShareModal.jsx';

const TAB_TITLES = { docs: 'Documents', plans: 'Weekly Plans', settings: 'Settings' };

export default function MainApp() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('docs');
  const [notes, setNotes] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const [docEditor, setDocEditor] = useState(null);   // { note } | { } (new) | null
  const [planEditor, setPlanEditor] = useState(null); // { plan } | { } | null
  const [share, setShare] = useState(null);           // { itemType, itemId } | null

  const reload = useCallback(async () => {
    try {
      const [n, p] = await Promise.all([api.get('/api/notes'), api.get('/api/plans')]);
      setNotes(n);
      setPlans(p);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // ── Privacy: hide/show every item on the active content tab ──
  const items = tab === 'plans' ? plans : notes;
  const allHidden = items.length > 0 && items.every((i) => i.hidden);

  async function togglePrivacyAll() {
    const list = tab === 'plans' ? plans : notes;
    if (!list.length) { notify('Nothing to hide yet', 'info'); return; }
    const shouldHide = !list.every((i) => i.hidden);
    const path = tab === 'plans' ? '/api/plans' : '/api/notes';
    const setter = tab === 'plans' ? setPlans : setNotes;
    setter((arr) => arr.map((i) => ({ ...i, hidden: shouldHide })));
    try {
      await Promise.all(list.map((i) => api.put(`${path}/${i.id}`, { hidden: shouldHide })));
      notify(shouldHide ? 'Content hidden' : 'Content shown', 'info');
    } catch (err) { notify(err.message, 'error'); reload(); }
  }

  async function toggleHidden(kind, id, hidden) {
    const path = kind === 'plan' ? '/api/plans' : '/api/notes';
    const setter = kind === 'plan' ? setPlans : setNotes;
    setter((arr) => arr.map((i) => (i.id === id ? { ...i, hidden } : i)));
    try { await api.put(`${path}/${id}`, { hidden }); }
    catch (err) { notify(err.message, 'error'); reload(); }
  }

  function onFab() {
    if (tab === 'docs') setDocEditor({});
    else if (tab === 'plans') setPlanEditor({});
  }

  if (loading) return <Loader />;

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-left">
          <span className="appbar-logo" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <i className="fas fa-feather-pointed" />
          </span>
          <span className="appbar-title">{TAB_TITLES[tab]}</span>
        </div>
        <div className="appbar-actions">
          {tab !== 'settings' && (
            <button className={`icon-btn${allHidden ? ' active' : ''}`} title={allHidden ? 'Show all content' : 'Hide all content'}
              onClick={togglePrivacyAll}>
              <i className={`fas ${allHidden ? 'fa-eye' : 'fa-eye-slash'}`} />
            </button>
          )}
        </div>
      </header>

      <main className="screens">
        {tab === 'docs' && (
          <DocsTab
            notes={notes}
            onOpen={(note) => setDocEditor({ note })}
            onShare={(id) => setShare({ itemType: 'note', itemId: id })}
            onToggleHidden={(id, hidden) => toggleHidden('note', id, hidden)}
            onChanged={reload}
          />
        )}
        {tab === 'plans' && (
          <PlansTab
            plans={plans}
            onEdit={(plan) => setPlanEditor({ plan })}
            onShare={(id) => setShare({ itemType: 'plan', itemId: id })}
            onToggleHidden={(id, hidden) => toggleHidden('plan', id, hidden)}
            onChanged={reload}
            setPlans={setPlans}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab user={user} onPrivacy={togglePrivacyAll} onLogout={logout} />
        )}
      </main>

      {tab !== 'settings' && (
        <button className="fab" aria-label="Create" onClick={onFab}>
          <i className="fas fa-plus" />
        </button>
      )}

      <nav className="bottom-nav">
        <button className={`nav-item${tab === 'docs' ? ' active' : ''}`} onClick={() => setTab('docs')}>
          <i className="fas fa-book-open" /><span>Docs</span>
        </button>
        <button className={`nav-item${tab === 'plans' ? ' active' : ''}`} onClick={() => setTab('plans')}>
          <i className="fas fa-calendar-week" /><span>Plans</span>
        </button>
        <button className={`nav-item${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>
          <i className="fas fa-gear" /><span>Settings</span>
        </button>
      </nav>

      {docEditor && (
        <DocEditor
          initial={docEditor.note || null}
          onClose={() => setDocEditor(null)}
          onSaved={() => { setDocEditor(null); reload(); }}
        />
      )}
      {planEditor && (
        <PlanEditor
          initial={planEditor.plan || null}
          onClose={() => setPlanEditor(null)}
          onSaved={() => { setPlanEditor(null); reload(); }}
        />
      )}
      {share && (
        <ShareModal itemType={share.itemType} itemId={share.itemId} onClose={() => setShare(null)} />
      )}
    </div>
  );
}
