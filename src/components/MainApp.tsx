// ============================================================
//  App shell: app bar, tabs, FAB, bottom nav. Owns the notes &
//  plans data and the editor/share modal state.
// ============================================================
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { repo } from '../lib/repo';
import { isNative } from '../lib/nativeAuth';
import { initSync, setOnMerged, useSync, applyReconcile, dismissReconcile, syncNow } from '../lib/sync';
import { listSchedules } from '../lib/scheduleStore';
import { rearmAlarms, rearmReminders, ensureKeepAlive } from '../lib/alarm';
import { api, getToken } from '../lib/api';
import { notify } from '../lib/notify';
import { APP_VERSION } from '../lib/appInfo';
import { checkForUpdate, autoUpdateEnabled, shouldAutoPrompt } from '../lib/updates';
import DocsTab from './DocsTab';
import PlansTab from './PlansTab';
import ViewTab from './ViewTab';
import ScheduleTab from './ScheduleTab';
import SettingsTab from './SettingsTab';
import DocEditor from './DocEditor';
import PlanEditor from './PlanEditor';
import ScheduleEditor from './ScheduleEditor';
import ShareModal from './ShareModal';
import ReconcileModal from './ReconcileModal';
import WhatsNewModal from './WhatsNewModal';
import UpdateModal from './UpdateModal';
import logoUrl from '../images/mn_logo.png';

const TAB_TITLES = { docs: 'Documents', plans: 'Weekly Plans', view: 'View', schedule: 'Schedule', settings: 'Settings' };

export default function MainApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Returning from the Viewer (/view?...&from=plans) lands back on the tab the
  // user was on (?tab=plans) instead of always resetting to Docs.
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return TAB_TITLES[t] ? t : 'docs';
  });
  const [notes, setNotes] = useState([]);
  const [plans, setPlans] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  const [docEditor, setDocEditor] = useState(null);   // { note } | { } (new) | null
  const [planEditor, setPlanEditor] = useState(null); // { plan } | { } | null
  const [scheduleEditor, setScheduleEditor] = useState(null); // { block } | { } | null
  const [share, setShare] = useState(null);           // { itemType, itemId } | null
  const [reconcile, setReconcile] = useState(null);   // { notes, plans } | null
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [update, setUpdate] = useState(null);             // prompt currently shown | null
  const [updateAvailable, setUpdateAvailable] = useState(null); // an update exists → red dot
  const syncState = useSync();

  const reload = useCallback(async () => {
    try {
      const [n, p] = await Promise.all([repo.listNotes(), repo.listPlans()]);
      setNotes(n);
      setPlans(p);
      // Schedules sync like notes/plans (web → API, app → local + sync).
      // The app adds native alarms on top; the web is a plain timetable.
      setSchedules(await listSchedules());
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Show "What's new" once after an update (compare last-seen vs current
  // version). Skipped on a first-ever install — we just record the version.
  useEffect(() => {
    try {
      const seen = localStorage.getItem('mahnotes:lastSeenVersion');
      if (seen && seen !== APP_VERSION) setShowWhatsNew(true);
      localStorage.setItem('mahnotes:lastSeenVersion', APP_VERSION);
    } catch { /* ignore */ }
  }, []);

  // Native: quietly check GitHub Releases for a newer APK on startup (only if
  // the user hasn't turned auto-check off). An update lights the red dot in
  // Settings; the prompt auto-opens only ONCE per version (and never if the
  // user picked "don't remind me again"). We only ever prompt — never install.
  useEffect(() => {
    if (!isNative || !autoUpdateEnabled()) return undefined;
    let alive = true;
    const t = setTimeout(async () => {
      const u = await checkForUpdate();
      if (!alive || !u) return;
      setUpdateAvailable(u);                 // red dot in Settings
      if (shouldAutoPrompt(u.version)) setUpdate(u); // prompt once
    }, 2500); // let the app settle before hitting the network
    return () => { alive = false; clearTimeout(t); };
  }, []);

  // Native: re-arm weekly reminders on app start so the OS holds them
  // (survives reboots / app restarts).
  useEffect(() => {
    if (!isNative) return;
    (async () => {
      try {
        const blocks = await listSchedules();
        await rearmReminders(blocks); // gentle reminders (exact, native)
        await rearmAlarms(blocks);    // ringing alarms (safety net)
        await ensureKeepAlive();      // resume keep-alive service if user enabled it
      } catch { /* best-effort */ }
    })();
  }, []);

  // Native: start the sync engine and refresh the lists whenever a sync
  // pull merges in new data from the account. Schedules pulled from another
  // device need their reminders/alarms armed on THIS device too.
  useEffect(() => {
    if (!isNative) return;
    setOnMerged(async () => {
      await reload();
      try {
        const blocks = await listSchedules();
        await rearmReminders(blocks);
        await rearmAlarms(blocks);
      } catch { /* best-effort */ }
    });
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

  // Optimistic: flip the pin (and re-sort) instantly, then persist in the
  // background — the round-trip never blocks the UI.
  async function togglePinned(id, pinned) {
    setNotes((arr) => arr.map((i) => (i.id === id ? { ...i, pinned } : i)));
    try { await repo.updateNote(id, { pinned }); }
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
    navigate(`/view?type=${kind}&id=${encodeURIComponent(item.id)}&from=view`);
  }, [navigate]);

  // After saving a friend-shared item into my account: web refetches; the app
  // pulls it down on the next sync (which fires onMerged → reload).
  const refreshAfterSave = useCallback(() => {
    if (isNative) syncNow(); else reload();
  }, [reload]);

  // Open straight into the app shell — never a full-screen loader. While the
  // first read (or a sync pull) is in flight we show a small inline indicator.
  const busy = loading || syncState.syncing;

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-left">
          <img className="appbar-logo" src={logoUrl} alt="Mah Notes" />
          <span className="appbar-title">{TAB_TITLES[tab]}</span>
          {busy && (
            <span className="appbar-busy" title={syncState.syncing ? 'Syncing…' : 'Loading…'}>
              <i className="fas fa-circle-notch fa-spin" /> {syncState.syncing ? 'Syncing…' : 'Loading…'}
            </span>
          )}
        </div>
        <div className="appbar-actions">
          {tab !== 'settings' && tab !== 'view' && tab !== 'schedule' && (
            <button className={`icon-btn${allHidden ? ' active' : ''}`} title={allHidden ? 'Show all content' : 'Hide all content'}
              onClick={togglePrivacyAll}>
              <i className={`fas ${allHidden ? 'fa-eye' : 'fa-eye-slash'}`} />
            </button>
          )}
        </div>
      </header>

      <main className="screens">
        {loading ? (
          <div className="screen-loading">
            <i className="fas fa-circle-notch fa-spin" />
            <span>Loading…</span>
          </div>
        ) : (
        <>
        {tab === 'docs' && (
          <DocsTab
            notes={notes}
            onOpen={(note) => setDocEditor({ note })}
            onNew={() => setDocEditor({})}
            onShare={(id) => setShare({ itemType: 'note', itemId: id })}
            onToggleHidden={(id, hidden) => toggleHidden('note', id, hidden)}
            onTogglePin={(id, pinned) => togglePinned(id, pinned)}
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
          <ScheduleTab schedules={schedules} onEdit={(block) => setScheduleEditor({ block })} onChanged={reload} />
        )}
        {tab === 'settings' && (
          <SettingsTab user={user} onPrivacy={togglePrivacyAll} onLogout={logout} onReload={refreshAfterSave} reloadLists={reload} updateAvailable={updateAvailable} />
        )}
        </>
        )}
      </main>

      {tab !== 'settings' && tab !== 'view' && (
        <button className="add-fab" aria-label="Create" onClick={onFab}>
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
        <button className={`nav-item${tab === 'schedule' ? ' active' : ''}`} onClick={() => setTab('schedule')}>
          <i className="fas fa-clock" /><span>Schedule</span>
        </button>
        <button className={`nav-item${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>
          <i className="fas fa-gear" />{updateAvailable && <span className="nav-dot" />}<span>Settings</span>
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
      {showWhatsNew && <WhatsNewModal onClose={() => setShowWhatsNew(false)} />}
      {update && <UpdateModal update={update} onClose={() => setUpdate(null)} />}
    </div>
  );
}
