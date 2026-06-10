// ============================================================
//  App shell: app bar, tabs, FAB, bottom nav. Owns the notes &
//  plans data and the editor/share modal state.
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { repo } from '../lib/repo.js';
import { isNative } from '../lib/nativeAuth.js';
import { initSync, setOnMerged, useSync, applyReconcile, dismissReconcile, syncNow } from '../lib/sync.js';
import { listSchedules } from '../lib/scheduleStore.js';
import { rescheduleAll } from '../lib/notifications.js';
import { api, getToken } from '../lib/api.js';
import { notify } from '../lib/notify.js';
import Loader from './Loader.jsx';
import DocsTab from './DocsTab.jsx';
import PlansTab from './PlansTab.jsx';
import ViewTab from './ViewTab.jsx';
import ScheduleTab from './ScheduleTab.jsx';
import SettingsTab from './SettingsTab.jsx';
import DocEditor from './DocEditor.jsx';
import PlanEditor from './PlanEditor.jsx';
import ScheduleEditor from './ScheduleEditor.jsx';
import ShareModal from './ShareModal.jsx';
import ReconcileModal from './ReconcileModal.jsx';

const TAB_TITLES = { docs: 'Documents', plans: 'Weekly Plans', view: 'View', schedule: 'Schedule', settings: 'Settings' };

export default function MainApp() {
  const { user, logout } = useAuth();
  const { effective, setTheme } = useTheme();
  const navigate = useNavigate();
  const [tab, setTab] = useState('docs');
  const [notes, setNotes] = useState([]);
  const [plans, setPlans] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  const [docEditor, setDocEditor] = useState(null);   // { note } | { } (new) | null
  const [planEditor, setPlanEditor] = useState(null); // { plan } | { } | null
  const [scheduleEditor, setScheduleEditor] = useState(null); // { block } | { } | null
  const [share, setShare] = useState(null);           // { itemType, itemId } | null
  const [reconcile, setReconcile] = useState(null);   // { notes, plans } | null
  const syncState = useSync();

  const reload = useCallback(async () => {
    try {
      const [n, p] = await Promise.all([repo.listNotes(), repo.listPlans()]);
      setNotes(n);
      setPlans(p);
      if (isNative) setSchedules(await listSchedules());
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Native: re-arm weekly reminders on app start so the OS holds them
  // (survives reboots / app restarts).
  useEffect(() => {
    if (!isNative) return;
    (async () => { try { await rescheduleAll(await listSchedules()); } catch { /* best-effort */ } })();
  }, []);

  // Native: start the sync engine and refresh the lists whenever a sync
  // pull merges in new data from the account.
  useEffect(() => {
    if (!isNative) return;
    setOnMerged(reload);
    initSync();
  }, [reload]);

  // Native: surface items the WEB side deleted so the user can keep/delete them.
  useEffect(() => {
    if (!isNative) return;
    const pr = syncState.pendingReconcile;
    if (pr && (pr.notes.length || pr.plans.length)) setReconcile(pr);
  }, [syncState.pendingReconcile]);

  // Web: ask the server whether the app deleted anything we still show.
  const checkWebReconcile = useCallback(async () => {
    if (isNative || !getToken()) return;
    try {
      const pr = await api.get('/api/reconcile');
      if (pr && (pr.notes?.length || pr.plans?.length)) setReconcile(pr);
    } catch { /* non-critical */ }
  }, []);
  useEffect(() => {
    if (isNative) return undefined;
    checkWebReconcile();
    const onFocus = () => checkWebReconcile();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkWebReconcile]);

  async function onReconcileApply(sel) {
    try {
      if (isNative) {
        await applyReconcile(sel); // posts + restores kept items locally + reloads
      } else {
        await api.post('/api/reconcile', {
          keepNoteUids: sel.keepNotes.map((n) => n.uid),
          keepPlanUids: sel.keepPlans.map((p) => p.uid),
          deleteNoteUids: sel.deleteNoteUids,
          deletePlanUids: sel.deletePlanUids,
        });
        await reload();
      }
      setReconcile(null);
      const kept = sel.keepNotes.length + sel.keepPlans.length;
      const del = sel.deleteNoteUids.length + sel.deletePlanUids.length;
      notify(`Kept ${kept}, deleted ${del}`, 'success');
    } catch (err) { notify(err.message, 'error'); }
  }

  function onReconcileClose() {
    if (isNative) dismissReconcile();
    setReconcile(null);
  }

  // ── Privacy: hide/show every item on the active content tab ──
  const items = tab === 'plans' ? plans : notes;
  const allHidden = items.length > 0 && items.every((i) => i.hidden);

  async function togglePrivacyAll() {
    const list = tab === 'plans' ? plans : notes;
    if (!list.length) { notify('Nothing to hide yet', 'info'); return; }
    const shouldHide = !list.every((i) => i.hidden);
    const updateFn = tab === 'plans' ? repo.updatePlan : repo.updateNote;
    const setter = tab === 'plans' ? setPlans : setNotes;
    setter((arr) => arr.map((i) => ({ ...i, hidden: shouldHide })));
    try {
      await Promise.all(list.map((i) => updateFn(i.id, { hidden: shouldHide })));
      notify(shouldHide ? 'Content hidden' : 'Content shown', 'info');
    } catch (err) { notify(err.message, 'error'); reload(); }
  }

  async function toggleHidden(kind, id, hidden) {
    const updateFn = kind === 'plan' ? repo.updatePlan : repo.updateNote;
    const setter = kind === 'plan' ? setPlans : setNotes;
    setter((arr) => arr.map((i) => (i.id === id ? { ...i, hidden } : i)));
    try { await updateFn(id, { hidden }); }
    catch (err) { notify(err.message, 'error'); reload(); }
  }

  function onFab() {
    if (tab === 'docs') setDocEditor({});
    else if (tab === 'plans') setPlanEditor({});
    else if (tab === 'schedule') setScheduleEditor({});
  }

  // Open an item's permanent, read-only view. Same URL on web and app
  // (/view?type=&id=) — never expires; the app reads it from local storage.
  const openView = useCallback((kind, item) => {
    navigate(`/view?type=${kind}&id=${encodeURIComponent(item.id)}`);
  }, [navigate]);

  // After saving a friend-shared item into my account: web refetches; the app
  // pulls it down on the next sync (which fires onMerged → reload).
  const refreshAfterSave = useCallback(() => {
    if (isNative) syncNow(); else reload();
  }, [reload]);

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
          <button className="icon-btn" title={effective === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme" onClick={() => setTheme(effective === 'dark' ? 'light' : 'dark')}>
            <i className={`fas ${effective === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
          </button>
          {tab !== 'settings' && tab !== 'view' && tab !== 'schedule' && (
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
        {tab === 'view' && (
          <ViewTab notes={notes} plans={plans} onOpen={openView} />
        )}
        {tab === 'schedule' && (
          <ScheduleTab schedules={schedules} onEdit={(block) => setScheduleEditor({ block })} />
        )}
        {tab === 'settings' && (
          <SettingsTab user={user} onPrivacy={togglePrivacyAll} onLogout={logout} onReload={refreshAfterSave} />
        )}
      </main>

      {tab !== 'settings' && tab !== 'view' && (
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
        <button className={`nav-item${tab === 'view' ? ' active' : ''}`} onClick={() => setTab('view')}>
          <i className="fas fa-eye" /><span>View</span>
        </button>
        {isNative && (
          <button className={`nav-item${tab === 'schedule' ? ' active' : ''}`} onClick={() => setTab('schedule')}>
            <i className="fas fa-clock" /><span>Schedule</span>
          </button>
        )}
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
      {scheduleEditor && (
        <ScheduleEditor
          initial={scheduleEditor.block || null}
          onClose={() => setScheduleEditor(null)}
          onSaved={() => { setScheduleEditor(null); reload(); }}
        />
      )}
      {share && (
        <ShareModal itemType={share.itemType} itemId={share.itemId} onClose={() => setShare(null)} />
      )}
      {reconcile && (
        <ReconcileModal data={reconcile} onApply={onReconcileApply} onClose={onReconcileClose} />
      )}
    </div>
  );
}
