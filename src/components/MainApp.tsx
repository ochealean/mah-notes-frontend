// ============================================================
//  App shell, v2 "Modernist".
//
//  One layout for both platforms:
//    .rail  — brand, five tabs, search + sort, and the list
//    .pane  — the one thing you are reading
//
//  On a desktop they sit side by side. On a phone the rail IS the
//  screen and the pane takes over when you open an item (CSS does
//  the switching; `has-detail` is the only signal).
//
//  Changes from v1: the View tab is gone (opening an item already
//  shows it — the /view route still works for permanent links), and
//  the per-card action row is gone (verbs live in the pane cluster).
//  Import and scan moved into the rail's overflow menu.
// ============================================================
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { repo } from '../lib/repo';
import { isNative } from '../lib/nativeAuth';
import { initSync, setOnMerged, useSync, applyReconcile, dismissReconcile, syncNow } from '../lib/sync';
import { listSchedules } from '../lib/scheduleStore';
import { rearmAlarms, rearmReminders, ensureKeepAlive, pruneOrphanAlarms } from '../lib/alarm';
import { api, getToken } from '../lib/api';
import { notify } from '../lib/notify';
import { APP_VERSION } from '../lib/appInfo';
import { checkForUpdate, autoUpdateEnabled, shouldAutoPrompt } from '../lib/updates';
import { sortItems, loadSort, saveSort, SORT_OPTIONS } from '../lib/sortItems';
import DocsTab, { DocPane } from './DocsTab';
import PlansTab, { PlanPane } from './PlansTab';
import ClipboardTab, { ClipPane } from './ClipboardTab';
import ScheduleTab from './ScheduleTab';
import SettingsTab from './SettingsTab';
import DocEditor from './DocEditor';
import PlanEditor from './PlanEditor';
import ScheduleEditor from './ScheduleEditor';
import ShareModal from './ShareModal';
import ReconcileModal from './ReconcileModal';
import WhatsNewModal from './WhatsNewModal';
import UpdateModal from './UpdateModal';
import AiMenu from './AiMenu';
import { pushWidgetData, consumeWidgetOpen, consumeWidgetToggles } from '../lib/widget';
import { listClips, drainPendingClips, pushClipSnapshot, deleteClip } from '../lib/clips';
import { readCache, writeCache } from '../lib/webCache';
import { useSlowHint } from '../lib/useSlowHint';
import logoUrl from '../images/mn_logo.png';

const TAB_TITLES = { docs: 'Documents', plans: 'Weekly Plans', clipboard: 'Clipboard', schedule: 'Schedule', settings: 'Settings' };

const ALL_TABS = [
  { key: 'docs', label: 'Docs', icon: 'fa-book-open' },
  { key: 'plans', label: 'Plans', icon: 'fa-calendar-week' },
  { key: 'clipboard', label: 'Clips', icon: 'fa-clipboard' },
  { key: 'schedule', label: 'Time', icon: 'fa-clock' },
  { key: 'settings', label: 'Settings', icon: 'fa-gear' },
];
// Clips are captured by the Android selection toolbar and never leave the
// device, so on the web the tab could only ever show an empty state explaining
// why it is empty. It isn't offered there at all. `isNative` is settled once at
// module load (Capacitor.isNativePlatform()), so this list never changes after.
const TABS = ALL_TABS.filter((t) => t.key !== 'clipboard' || isNative);
const isTab = (t) => TABS.some((x) => x.key === t);

// Tabs that own a list in the rail. Schedule and Settings fill the pane instead.
const LIST_TABS = TABS.filter((t) => ['docs', 'plans', 'clipboard'].includes(t.key)).map((t) => t.key);
const SEARCH_PLACEHOLDER = { docs: 'Search documents', plans: 'Search plans', clipboard: 'Search clips' };

const RAIL_KEY = 'mahnotes_rail_w';
const RAIL_MIN = 260;
const RAIL_MAX = 620;

// The desktop breakpoint, matched to app.css.
function useDesktop() {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const on = (e) => setWide(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export default function MainApp() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDesktop = useDesktop();

  // Rail width is a device preference, not account state — it depends on the
  // screen you are sitting at, so it never syncs.
  const [railW, setRailW] = useState(() => {
    try {
      const n = parseInt(localStorage.getItem(RAIL_KEY) || '', 10);
      return n >= RAIL_MIN && n <= RAIL_MAX ? n : 0;
    } catch { return 0; }
  });
  const railRef = useRef(null);
  const railWRef = useRef(railW);
  const [dragging, setDragging] = useState(false);

  function startResize(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = railRef.current?.offsetWidth || RAIL_MIN;
    setDragging(true);
    document.body.classList.add('rail-resizing');
    const onMove = (ev) => {
      const w = Math.min(RAIL_MAX, Math.max(RAIL_MIN, startW + ev.clientX - startX));
      railWRef.current = w;
      setRailW(w);
    };
    const onUp = () => {
      setDragging(false);
      document.body.classList.remove('rail-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try { localStorage.setItem(RAIL_KEY, String(railWRef.current)); } catch { /* ignore */ }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function resetRail() {
    railWRef.current = 0;
    setRailW(0);
    try { localStorage.removeItem(RAIL_KEY); } catch { /* ignore */ }
  }

  // Returning from the Viewer (/view?...&from=plans) lands back on the tab the
  // user was on (?tab=plans) instead of always resetting to Docs. A stale
  // ?tab=view from a v1 link falls back to Docs — that tab no longer exists.
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return isTab(t) ? t : 'docs';
  });

  // Web: seed from the localStorage cache so a revisit paints instantly, then
  // reload() refreshes in the background. Native returns null here (it reads its
  // own IndexedDB), so it keeps the normal first-load path.
  const cached = useState(() => readCache(user?.id))[0];
  const [notes, setNotes] = useState(() => cached?.notes || []);
  const [plans, setPlans] = useState(() => cached?.plans || []);
  const [schedules, setSchedules] = useState(() => cached?.schedules || []);
  // Clips are device-local (never synced, never cached for the web), so they
  // load on their own rather than through reload()/readCache.
  const [clips, setClips] = useState([]);
  // With a cache in hand there's nothing to "load" — show it immediately.
  const [loading, setLoading] = useState(!cached);

  // ── Rail: one search box and one sort, shared by the list tabs ──
  const [q, setQ] = useState('');
  const [sortDocs, setSortDocs] = useState(() => loadSort('docs'));
  const [sortPlans, setSortPlans] = useState(() => loadSort('plans'));

  // ── Selection: which item the pane is showing, per tab ──
  const [selDoc, setSelDoc] = useState(null);
  const [selPlan, setSelPlan] = useState(null);
  const [selClip, setSelClip] = useState(null);

  const [docEditor, setDocEditor] = useState(null);   // { note } | { } (new) | null
  const [planEditor, setPlanEditor] = useState(null); // { plan } | { } | null
  const [scheduleEditor, setScheduleEditor] = useState(null); // { block } | { } | null
  const [share, setShare] = useState(null);           // { itemType, itemId } | null
  const [reconcile, setReconcile] = useState(null);   // { notes, plans } | null
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [update, setUpdate] = useState(null);             // prompt currently shown | null
  const [updateAvailable, setUpdateAvailable] = useState(null); // an update exists → red dot
  const [bulkBusy, setBulkBusy] = useState(false);
  // Multi-select replaces the old "Delete all": you choose what goes, and
  // Select all is there when you really do mean everything.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Signed in via Google with no password set → can't log in if Google sign-in
  // ever breaks. `hasPassword === false` also covers accounts created before
  // `hasGoogle` existed (see ConnectGoogle.tsx).
  const needsPassword = !!user && user.hasPassword === false;
  const syncState = useSync();
  // A cold backend can hold the first fetch for tens of seconds — say so rather
  // than spinning silently.
  const slowLoad = useSlowHint(loading);

  const reload = useCallback(async () => {
    try {
      // All three in ONE wave. Schedules used to be awaited after the other two,
      // which cost an extra round trip on every load — painful when the backend
      // is cold. They don't depend on each other, so they go out together.
      // (Web → API, app → local + sync. The app adds native alarms on top; the
      // web is a plain timetable.)
      const [n, p, s] = await Promise.all([repo.listNotes(), repo.listPlans(), listSchedules()]);
      setNotes(n);
      setPlans(p);
      setSchedules(s);
    } catch (err) {
      // A 401 means the session is gone; AuthContext already signs us out and
      // shows the login screen, so don't pile a scary toast on top of that.
      if (err?.status !== 401) notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Pull in anything the Android selection toolbar captured while we were closed
  // or backgrounded, then re-read the store. Safe on web: the drain no-ops and
  // listClips() just returns an empty list.
  const reloadClips = useCallback(async () => {
    if (!isNative) return;
    await drainPendingClips();
    setClips(await listClips());
  }, []);

  useEffect(() => { reloadClips(); }, [reloadClips]);

  // Native: mirror the list back down so the "Mah Notes Clipboard" entry in the
  // selection toolbar can offer these clips from its own (WebView-less) process.
  useEffect(() => {
    if (!isNative) return;
    pushClipSnapshot(clips);
  }, [clips]);

  // Native: keep the home-screen widget's data mirror in sync with the lists.
  // Fetch fresh from the store (not the initial empty render state) and only
  // once the first load has finished, so the widget picker always sees real data.
  useEffect(() => {
    if (!isNative || loading) return;
    pushWidgetData();
  }, [notes, plans, schedules, loading]);

  // Web: keep the instant-load cache in step with the lists (including optimistic
  // edits like pin/hide), so the next visit renders the latest without waiting on
  // the network. Skipped while the first load is still in flight.
  useEffect(() => {
    if (isNative || loading) return;
    writeCache(user?.id, { notes, plans, schedules });
  }, [notes, plans, schedules, loading, user?.id]);

  // Native: if the app was opened by tapping a widget, route to that item.
  // Also refresh the widget mirror whenever the app comes back to the foreground.
  useEffect(() => {
    if (!isNative) return undefined;
    const openFromWidget = async () => {
      const t = await consumeWidgetOpen();
      if (!t) return;
      if (t.type === 'schedule') setTab('schedule');
      else navigate(`/view?type=${t.type}&id=${encodeURIComponent(t.id)}&from=widget`);
    };
    // Persist any checkbox the user ticked on a widget, then refresh the lists
    // and re-push so app and widget agree.
    const syncWidgetToggles = async () => {
      const changed = await consumeWidgetToggles();
      if (changed) reload();
      else pushWidgetData();
    };
    openFromWidget();
    syncWidgetToggles();
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      openFromWidget();
      syncWidgetToggles();
      // Clipping happens while we're backgrounded — pick it up on the way back
      // in so the Clipboard tab is current without an app restart.
      reloadClips();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // listSchedules() resolved, so this list is complete → safe to prune
        // alarms whose schedule is gone (deleted elsewhere / wiped by logout).
        await pruneOrphanAlarms(blocks, { loadOk: true });
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
        // A pull that merged a deletion from another device is exactly when an
        // orphan alarm appears — clear it here rather than waiting for a restart.
        await pruneOrphanAlarms(blocks, { loadOk: true });
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

  // ── Search + sort, applied once for the rail ──
  const query = q.toLowerCase().trim();

  const visibleNotes = useMemo(() => {
    const matched = !query ? notes
      : notes.filter((n) => `${n.title} ${n.content}`.toLowerCase().includes(query));
    // Pinned float above a stable sort, so order is preserved within each group.
    return [...sortItems(matched, sortDocs)].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [notes, query, sortDocs]);

  const visiblePlans = useMemo(() => {
    const matched = !query ? plans
      : plans.filter((p) => (p.title || '').toLowerCase().includes(query));
    return sortItems(matched, sortPlans);
  }, [plans, query, sortPlans]);

  const visibleClips = useMemo(() => (
    !query ? clips : clips.filter((c) => (c.text || '').toLowerCase().includes(query))
  ), [clips, query]);

  // The item the pane shows. On a desktop, fall back to the first row so the
  // pane is never blank next to a full list; on a phone, nothing is open until
  // you tap something.
  const pick = (list, id) => list.find((x) => x.id === id) || null;
  const curDoc = pick(visibleNotes, selDoc) || (isDesktop ? visibleNotes[0] : null) || null;
  const curPlan = pick(visiblePlans, selPlan) || (isDesktop ? visiblePlans[0] : null) || null;
  const curClip = pick(visibleClips, selClip) || (isDesktop ? visibleClips[0] : null) || null;

  // On a phone the pane replaces the rail. Schedule and Settings have no list,
  // so they always fill the pane.
  const isListTab = LIST_TABS.includes(tab);
  const openItem = tab === 'docs' ? selDoc && curDoc : tab === 'plans' ? selPlan && curPlan : tab === 'clipboard' ? selClip && curClip : null;
  const hasDetail = !isListTab || (!isDesktop && !!openItem);

  // The rows currently on screen — what "Select all" actually means.
  const visibleForTab = tab === 'plans' ? visiblePlans : tab === 'clipboard' ? visibleClips : visibleNotes;
  const allSelected = visibleForTab.length > 0 && visibleForTab.every((i) => selected.has(i.id));

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(visibleForTab.map((i) => i.id)));
  }
  function startSelecting() { setSelected(new Set()); setSelecting(true); }
  function stopSelecting() { setSelected(new Set()); setSelecting(false); }

  async function deleteSelected() {
    if (bulkBusy || !selected.size) return;
    const ids = [...selected];
    const noun = tab === 'plans' ? 'plan' : tab === 'clipboard' ? 'clip' : 'document';
    const label = `${ids.length} ${noun}${ids.length > 1 ? 's' : ''}`;
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        if (tab === 'plans') await repo.deletePlan(id);
        else if (tab === 'clipboard') await deleteClip(id);
        else await repo.deleteNote(id);
      }
      notify(`Deleted ${label}`, 'success');
    } catch (err) { notify(err.message || 'Could not delete everything', 'error'); }
    finally {
      setBulkBusy(false);
      stopSelecting();
      closeDetail();
      if (tab === 'clipboard') reloadClips(); else reload();
    }
  }

  function goTab(next) {
    setTab(next);
    setQ('');
    stopSelecting();
    // Leaving an item open across tabs would strand the phone in the pane.
    setSelDoc(null); setSelPlan(null); setSelClip(null);
  }

  const closeDetail = () => { setSelDoc(null); setSelPlan(null); setSelClip(null); };

  // Phone: opening an item replaces the list in place rather than navigating,
  // so Back would otherwise leave the app entirely. Push a throwaway history
  // entry while the pane is up and pop it on Back — Capacitor maps Android's
  // hardware Back onto history.back(), so this covers the app and the browser.
  const detailOpen = !isDesktop && !!openItem;
  const detailPushed = useRef(false);
  useEffect(() => {
    if (detailOpen && !detailPushed.current) {
      detailPushed.current = true;
      window.history.pushState({ mnDetail: true }, '');
    } else if (!detailOpen && detailPushed.current) {
      detailPushed.current = false;
      if (window.history.state?.mnDetail) window.history.back();
    }
  }, [detailOpen]);
  useEffect(() => {
    const onPop = () => { detailPushed.current = false; setSelDoc(null); setSelPlan(null); setSelClip(null); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ── Privacy: hide/show every item on the active content tab ──
  // Hiding blanks the RAIL rows only. Opening an item always shows it in
  // full — the point is that nobody reads your notes while you scroll.
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
      notify(shouldHide ? 'Hidden from the list' : 'Shown in the list', 'info');
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

  async function onTogglePlanCheck(planId, day, index, checked) {
    setPlans((arr) => arr.map((p) => {
      if (p.id !== planId) return p;
      const days = { ...p.days };
      days[day] = (days[day] || []).map((it, i) => (i === index ? { ...it, checked } : it));
      return { ...p, days };
    }));
    try { await repo.checkPlan(planId, { day, index, checked }); }
    catch (err) { notify(err.message, 'error'); reload(); }
  }

  function onNew() {
    if (tab === 'docs') setDocEditor({});
    else if (tab === 'plans') setPlanEditor({});
    else if (tab === 'schedule') setScheduleEditor({});
    else setDocEditor({});
  }

  // After saving a friend-shared item into my account: web refetches; the app
  // pulls it down on the next sync (which fires onMerged → reload).
  const refreshAfterSave = useCallback(() => {
    if (isNative) syncNow(); else reload();
  }, [reload]);

  const busy = loading || syncState.syncing;
  const syncLabel = syncState.syncing ? 'Syncing' : loading ? 'Loading' : 'Synced';
  const counts = { docs: notes.length, plans: plans.length, clipboard: clips.length };
  const canPrivacy = tab === 'docs' || tab === 'plans';
  const showSort = tab === 'docs' || tab === 'plans';
  const listCount = tab === 'docs' ? visibleNotes.length : tab === 'plans' ? visiblePlans.length : visibleClips.length;

  return (
    <div className={`app${hasDetail ? ' has-detail' : ''}`}
      style={railW ? ({ '--rail-w': `${railW}px` } as any) : undefined}>
      {/* Phone-only bar. The rail head covers this on a desktop. */}
      <header className="appbar">
        <div className="appbar-left">
          <img className="appbar-logo" src={logoUrl} alt="" />
          <span className="appbar-title">{TAB_TITLES[tab]}</span>
          {busy && (
            <span className="appbar-busy"><i className="fas fa-circle-notch fa-spin" /> {syncLabel}</span>
          )}
        </div>
        <div className="appbar-actions">
          {isListTab && (
            <>
              <AiMenu tab={tab} counts={counts} onChanged={tab === 'clipboard' ? reloadClips : reload}
                onStartSelect={startSelecting} />
              {canPrivacy && (
                <button className={`icon-btn${allHidden ? ' active' : ''}`}
                  title={allHidden ? 'Show all in the list' : 'Hide all from the list'} onClick={togglePrivacyAll}>
                  <i className={`fas ${allHidden ? 'fa-eye' : 'fa-eye-slash'}`} />
                </button>
              )}
            </>
          )}
        </div>
      </header>

      <aside className="rail" ref={railRef}>
        <button
          className={`rail-resize${dragging ? ' dragging' : ''}`}
          aria-label="Resize the list. Double-click to reset."
          title="Drag to resize · double-click to reset"
          onPointerDown={startResize}
          onDoubleClick={resetRail}
        />
        <div className="rail-head">
          <img className="rail-mark" src={logoUrl} alt="" />
          <span className="rail-name">Mah Notes</span>
          <span className="rail-sync">
            <span className={`rail-sync-dot${busy ? ' busy' : ''}`} />{syncLabel}
          </span>
          <div className="rail-actions">
            {isListTab && (
              <AiMenu tab={tab} counts={counts} onChanged={tab === 'clipboard' ? reloadClips : reload}
                onStartSelect={startSelecting} />
            )}
            {canPrivacy && (
              <button className={`rail-btn${allHidden ? ' on' : ''}`}
                title={allHidden ? 'Show all in the list' : 'Hide all from the list'}
                aria-label="Hide all from the list" onClick={togglePrivacyAll}>
                <i className={`fas ${allHidden ? 'fa-eye' : 'fa-eye-slash'}`} />
              </button>
            )}
            {tab !== 'settings' && tab !== 'clipboard' && (
              <button className="rail-btn solid" aria-label="New" title="New" onClick={onNew}>
                <i className="fas fa-plus" />
              </button>
            )}
          </div>
        </div>

        <nav className="rail-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`rail-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => goTab(t.key)}>
              <span className="nav-icon-wrap">
                <i className={`fas ${t.icon}`} />
                {t.key === 'settings' && (updateAvailable || needsPassword) && <span className="nav-dot" />}
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        {isListTab && (
          <div className="rail-search">
            <div className="search-bar">
              <i className="fas fa-search" />
              <input type="text" placeholder={SEARCH_PLACEHOLDER[tab]} value={q}
                onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="rail-meta">
              {showSort && (
                <label className="sort-control" title="Sort">
                  <i className="fas fa-arrow-down-wide-short" />
                  <select aria-label="Sort list"
                    value={tab === 'plans' ? sortPlans : sortDocs}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (tab === 'plans') { setSortPlans(v); saveSort('plans', v); }
                      else { setSortDocs(v); saveSort('docs', v); }
                    }}>
                    {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </label>
              )}
              <span className="rail-count">{listCount} of {counts[tab]}</span>
            </div>
          </div>
        )}

        {selecting && (
          <div className="select-bar">
            <button className="select-all" onClick={toggleSelectAll}>
              <span className={`row-check${allSelected ? ' on' : ''}`}><i className="fas fa-check" /></span>
              {allSelected ? 'None' : 'All'}
            </button>
            <span className="select-count">{selected.size} selected</span>
            <button className="select-del" onClick={deleteSelected} disabled={!selected.size || bulkBusy}>
              <i className={`fas ${bulkBusy ? 'fa-circle-notch fa-spin' : 'fa-trash'}`} />
              {bulkBusy ? 'Deleting' : 'Delete'}
            </button>
            <button className="select-cancel" onClick={stopSelecting}>Cancel</button>
          </div>
        )}

        <div className="rail-list">
          {loading ? (
            <div className="screen-loading">
              <i className="fas fa-circle-notch fa-spin" />
              <span>{slowLoad ? 'Waking up the server — this can take a moment…' : 'Loading…'}</span>
            </div>
          ) : (
            <>
              {tab === 'docs' && (
                <DocsTab notes={visibleNotes} selectedId={curDoc?.id} searching={!!query}
                  onSelect={(n) => setSelDoc(n.id)} onNew={() => setDocEditor({})}
                  selecting={selecting} selected={selected} onToggleSelect={toggleSelect} />
              )}
              {tab === 'plans' && (
                <PlansTab plans={visiblePlans} selectedId={curPlan?.id} searching={!!query}
                  onSelect={(p) => setSelPlan(p.id)}
                  selecting={selecting} selected={selected} onToggleSelect={toggleSelect} />
              )}
              {tab === 'clipboard' && (
                <ClipboardTab clips={visibleClips} selectedId={curClip?.id} searching={!!query}
                  onSelect={(c) => setSelClip(c.id)}
                  selecting={selecting} selected={selected} onToggleSelect={toggleSelect} />
              )}
            </>
          )}
        </div>
      </aside>

      <main className="pane">
        {tab === 'docs' && (
          <DocPane note={curDoc} onBack={closeDetail}
            onEdit={(note) => setDocEditor({ note })}
            onTogglePin={togglePinned}
            onToggleHidden={(id, hidden) => toggleHidden('note', id, hidden)}
            onShare={(id) => setShare({ itemType: 'note', itemId: id })}
            onDelete={() => { closeDetail(); reload(); }} />
        )}
        {tab === 'plans' && (
          <PlanPane plan={curPlan} onBack={closeDetail}
            onEdit={(plan) => setPlanEditor({ plan })}
            onToggleHidden={(id, hidden) => toggleHidden('plan', id, hidden)}
            onShare={(id) => setShare({ itemType: 'plan', itemId: id })}
            onToggleCheck={onTogglePlanCheck}
            onDelete={() => { closeDetail(); reload(); }} />
        )}
        {tab === 'clipboard' && (
          <ClipPane clip={curClip} onBack={closeDetail}
            onChanged={() => { closeDetail(); reloadClips(); }} />
        )}
        {tab === 'schedule' && (
          <div className="pane-scroll full">
            <div className="pane-head"><span className="pane-tag">Schedule</span></div>
            <h1 className="pane-title">This week</h1>
            <ScheduleTab schedules={schedules} onEdit={(block) => setScheduleEditor({ block })} onChanged={reload} />
          </div>
        )}
        {tab === 'settings' && (
          <div className="pane-scroll full">
            <div className="pane-head"><span className="pane-tag">Settings</span></div>
            <h1 className="pane-title">{user?.name || user?.username || 'Your account'}</h1>
            <SettingsTab user={user} onPrivacy={togglePrivacyAll} onLogout={logout}
              onReload={refreshAfterSave} reloadLists={reload}
              updateAvailable={updateAvailable} needsPassword={needsPassword} />
          </div>
        )}
      </main>

      {/* Phone-only: create button and the five-tab bar. */}
      {(tab === 'docs' || tab === 'plans' || tab === 'schedule') && !openItem && (
        <button className="add-fab" aria-label="Create" onClick={onNew}>
          <i className="fas fa-plus" />
        </button>
      )}

      <nav className="bottom-nav">
        {TABS.map((t) => (
          <button key={t.key} className={`nav-item${tab === t.key ? ' active' : ''}`}
            onClick={() => goTab(t.key)}>
            <span className="nav-icon-wrap">
              <i className={`fas ${t.icon}`} />
              {t.key === 'settings' && (updateAvailable || needsPassword) && <span className="nav-dot" />}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
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
