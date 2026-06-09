import { useTheme } from '../context/ThemeContext.jsx';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'fa-sun' },
  { value: 'dark', label: 'Dark', icon: 'fa-moon' },
  { value: 'system', label: 'System', icon: 'fa-laptop' },
];

export default function SettingsTab({ user, onPrivacy, onLogout }) {
  const name = user?.displayName || (user?.email || 'You').split('@')[0];
  const initial = (name[0] || 'U').toUpperCase();
  const { pref, setTheme } = useTheme();

  return (
    <section className="screen" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="settings-card">
        <div className="settings-user">
          <div className="settings-avatar">{initial}</div>
          <div>
            <div className="settings-name">{name}</div>
            <div className="settings-email">{user?.email || ''}</div>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-section-label">Appearance</div>
        <div className="theme-seg">
          {THEME_OPTIONS.map((opt) => (
            <button key={opt.value} className={pref === opt.value ? 'active' : ''} onClick={() => setTheme(opt.value)}>
              <i className={`fas ${opt.icon}`} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-card">
        <button className="settings-row" onClick={onPrivacy}>
          <span><i className="fas fa-eye-slash" /> Hide all content (privacy)</span>
          <i className="fas fa-chevron-right" />
        </button>
        <button className="settings-row danger" onClick={() => { if (confirm('Log out of Mah Notes?')) onLogout(); }}>
          <span><i className="fas fa-sign-out-alt" /> Log out</span>
          <i className="fas fa-chevron-right" />
        </button>
      </div>

      <p className="settings-about">Mah Notes · MERN edition</p>
    </section>
  );
}
