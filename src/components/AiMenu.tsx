// ============================================================
//  The rail's overflow menu.
//
//  The revamp keeps the list holding notes and nothing else, so the
//  AI entry points and the bulk actions moved out of the list body
//  and in here. The mockup never drew the AI features — they exist in
//  this app and are kept, just relocated:
//
//    Docs      → Import a note (AI tidy, text or photo)
//    Plans     → Build a weekly plan with AI
//    Schedule  → Scan a timetable photo with AI
//
//  Each AI component renders only its dialog (hideTrigger) and opens
//  when its token changes.
//
//  "Delete all" used to live here. It is now "Select items", which turns
//  the list into checkboxes — deleting everything is still one tap away
//  via Select all, but it is no longer the only option on offer.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import ImportDoc from './ImportDoc';
import ScanPlan from './ScanPlan';
import ScanSchedule from './ScanSchedule';

export default function AiMenu({ tab, counts, onChanged, onStartSelect }) {
  const [open, setOpen] = useState(false);
  const [importToken, setImportToken] = useState(0);
  const [planToken, setPlanToken] = useState(0);
  const [schedToken, setSchedToken] = useState(0);
  const wrapRef = useRef(null);

  // Click-away / Escape close.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = counts?.[tab] || 0;
  const noun = tab === 'plans' ? 'plan' : tab === 'clipboard' ? 'clip' : 'document';

  function run(fn) { setOpen(false); fn(); }

  return (
    <div className="ai-menu-wrap" ref={wrapRef}>
      <button className="rail-btn" aria-label="More actions" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>
        <i className="fas fa-ellipsis" />
      </button>

      {open && (
        <div className="ai-menu" role="menu">
          {(tab === 'docs' || tab === 'plans' || tab === 'schedule') && (
            <>
              <div className="ai-menu-label">Add with AI</div>
              {tab === 'docs' && (
                <button className="ai-menu-item" onClick={() => run(() => setImportToken((n) => n + 1))}>
                  <i className="fas fa-wand-magic-sparkles" />
                  <span>
                    Import a note
                    <small>Paste text or attach a photo — AI tidies it</small>
                  </span>
                </button>
              )}
              {tab === 'plans' && (
                <button className="ai-menu-item" onClick={() => run(() => setPlanToken((n) => n + 1))}>
                  <i className="fas fa-wand-magic-sparkles" />
                  <span>
                    Build a weekly plan
                    <small>Describe a routine or photograph one</small>
                  </span>
                </button>
              )}
              {tab === 'schedule' && (
                <button className="ai-menu-item" onClick={() => run(() => setSchedToken((n) => n + 1))}>
                  <i className="fas fa-wand-magic-sparkles" />
                  <span>
                    Scan a timetable
                    <small>Read a photo of your schedule</small>
                  </span>
                </button>
              )}
              <div className="ai-menu-sep" />
            </>
          )}

          {onStartSelect && (
            <button className="ai-menu-item" disabled={!count} onClick={() => run(onStartSelect)}>
              <i className="fas fa-list-check" />
              <span>
                Select {noun}s
                <small>{count} {noun}{count === 1 ? '' : 's'} — pick some, or select all</small>
              </span>
            </button>
          )}
        </div>
      )}

      {/* Dialogs only — the menu above is their trigger. */}
      <ImportDoc hideTrigger openToken={importToken} onImported={onChanged} />
      <ScanPlan hideTrigger openToken={planToken} onAdded={onChanged} />
      <ScanSchedule hideTrigger openToken={schedToken} onAdded={onChanged} />
    </div>
  );
}
