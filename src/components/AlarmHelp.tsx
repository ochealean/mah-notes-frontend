// ============================================================
//  "Make alarms reliable" panel (native only).
//
//  Aggressive Android skins (HiOS/Transsion, MIUI, ColorOS, One UI…) freeze
//  background apps, so an exact alarm only rings when you next open the app.
//  The most dependable fix is the KEEP-ALIVE switch (a quiet ongoing service
//  that stops the freeze). The rest are one-tap jumps to the right settings.
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { ensurePermission, hasPermission } from '../lib/notifications';
import {
  reliabilityStatus, requestBatteryUnrestricted, requestFullScreenIntent,
  openAutoStartSettings, isKeepAlive, setKeepAlive, testAlarm,
} from '../lib/alarm';

function Row({ icon, title, desc, state, action, actionLabel, children }: any) {
  // state: 'ok' | 'warn' | 'todo'
  const badge = state === 'ok'
    ? <span className="ar-badge ok"><i className="fas fa-check" /> On</span>
    : state === 'warn'
      ? <span className="ar-badge warn"><i className="fas fa-triangle-exclamation" /> Needed</span>
      : state === 'todo'
        ? <span className="ar-badge todo"><i className="fas fa-circle-dot" /> Do this</span>
        : null;
  return (
    <div className="ar-row">
      <div className="ar-row-icon"><i className={`fas ${icon}`} /></div>
      <div className="ar-row-main">
        <div className="ar-row-title">{title} {badge}</div>
        <div className="ar-row-desc">{desc}</div>
        {action && <button className="btn btn-sm ar-row-btn" onClick={action}>{actionLabel}</button>}
        {children}
      </div>
    </div>
  );
}

export default function AlarmHelp({ onClose }) {
  const [status, setStatus] = useState({ battery: true, fullScreen: true, brand: '' });
  const [notif, setNotif] = useState(false);
  const [keepAlive, setKeep] = useState(false);
  const [testAt, setTestAt] = useState(null); // Date the armed test alarm rings at

  const refresh = useCallback(async () => {
    try {
      const [s, n, k] = await Promise.all([reliabilityStatus(), hasPermission(), isKeepAlive()]);
      setStatus(s); setNotif(n); setKeep(k);
    } catch { /* keep last */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const brand = (status.brand || '').toLowerCase();
  const isTranssion = /tecno|infinix|itel|transsion/.test(brand);

  async function grantNotif() { await ensurePermission(); setNotif(await hasPermission()); }
  async function grantBattery() { await requestBatteryUnrestricted(); setTimeout(refresh, 800); }
  async function grantFullScreen() { await requestFullScreenIntent(); setTimeout(refresh, 800); }
  async function toggleKeep(on) { setKeep(on); await setKeepAlive(on); }
  async function fireTest() {
    await ensurePermission();
    setTestAt(await testAlarm());
  }
  const fmtClock = (d) => d?.toLocaleTimeString?.(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-shield-halved" /> Make alarms reliable</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><i className="fas fa-times" /></button>
        </div>

        <p className="settings-hint-text" style={{ padding: '0 2px 8px' }}>
          If an alarm only rings when you open the app, your phone is freezing it in the
          background. The switch below is the most reliable fix; grant the rest once too.
        </p>

        {/* The real fix — a quiet keep-alive service. */}
        <Row
          icon="fa-shield-heart"
          title="Keep alarms running (recommended)"
          desc="Shows one small, silent ongoing notification so your phone can't freeze the app. This is what makes alarms ring on time while the app is closed."
        >
          <label className="switch ar-switch">
            <input type="checkbox" checked={keepAlive} onChange={(e) => toggleKeep(e.target.checked)} />
            <span className="slider" />
          </label>
        </Row>

        <Row
          icon="fa-bell"
          title="Notifications"
          desc="Lets the alarm and reminders show and make sound."
          state={notif ? 'ok' : 'warn'}
          action={notif ? null : grantNotif}
          actionLabel="Allow notifications"
        />
        <Row
          icon="fa-battery-full"
          title="Battery: don't optimize"
          desc="Set Mah Notes to “Unrestricted / No restrictions” so it can wake on time."
          state={status.battery ? 'ok' : 'warn'}
          action={status.battery ? null : grantBattery}
          actionLabel="Allow background battery"
        />
        <Row
          icon="fa-mobile-screen"
          title="Show over lock screen"
          desc="Android 14+: allow the full-screen alarm to appear on the lock screen."
          state={status.fullScreen ? 'ok' : 'warn'}
          action={status.fullScreen ? null : grantFullScreen}
          actionLabel="Allow full-screen alarm"
        />
        <Row
          icon="fa-rocket"
          title="Auto-start (if your phone has it)"
          desc={isTranssion
            ? "On Tecno/HiOS it's often hidden: try Settings → Apps → Mah Notes → look for “Auto launch / Allow background activity”, or the Phone Master app → Auto-start. If you can't find it, the switch above covers you."
            : "Enable “Auto-start / Allow background activity” for Mah Notes if the option exists. If not, the switch above covers you."}
          state="todo"
          action={openAutoStartSettings}
          actionLabel="Open settings"
        />

        {/* The decisive check: a fire-once alarm ~2 min out, no day/time entry involved. */}
        <Row
          icon="fa-vial-circle-check"
          title="Test it now"
          desc={testAt
            ? `Armed! It will ring at ${fmtClock(testAt)}. Now CLOSE the app (swipe it away — don't Force Stop) and lock the phone. If it rings, alarms work on this phone.`
            : 'Arms a one-time alarm about 2 minutes from now. After tapping, close the app and lock the phone to prove alarms ring while it’s closed.'}
          state={testAt ? 'ok' : 'todo'}
          action={fireTest}
          actionLabel={testAt ? 'Arm another test' : 'Ring a test alarm'}
        />

        <div className="signout-actions" style={{ marginTop: 6 }}>
          <button className="btn btn-primary btn-block" onClick={refresh}>
            <i className="fas fa-rotate" /> Re-check status
          </button>
          <button className="btn btn-block" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
