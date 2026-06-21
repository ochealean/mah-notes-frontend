// ============================================================
//  Color-theme customizer (Settings → Appearance). Presets like
//  "Coffee", per-color pickers for Primary & Accent with an optional
//  gradient end, and an Advanced section for surface/text colors.
//  Changes apply live (the whole app recolors instantly).
// ============================================================
import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { PRESETS, colorOf, activePresetId, lighten } from '../lib/palette';
import ColorField from './ColorField';

export default function ThemeCustomizer() {
  const { palette, setPalette, resetPalette } = useTheme();
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const active = activePresetId(palette);

  const cur = (k) => colorOf(palette, k);
  const merge = (patch) => setPalette({ ...(palette || {}), ...patch });

  // A solid color = its gradient end equals its start.
  const primaryGrad = cur('primaryEnd') !== cur('primary');
  const accentGrad = cur('accentEnd') !== cur('accent');

  function pickPreset(p) {
    setPalette(p.colors ? { ...p.colors } : null);
  }

  // Editing the main color keeps the gradient coherent (end auto-follows unless
  // gradient is off, where end tracks the start).
  function setPrimary(v) {
    const val = v.toUpperCase();
    merge({ primary: val, primaryEnd: primaryGrad ? lighten(val) : val });
  }
  function setAccent(v) {
    const val = v.toUpperCase();
    merge({ accent: val, accentEnd: accentGrad ? lighten(val) : val });
  }
  const setKey = (k, v) => merge({ [k]: v.toUpperCase() });

  function toggleGrad(which, on) {
    if (which === 'primary') merge({ primaryEnd: on ? lighten(cur('primary')) : cur('primary') });
    else merge({ accentEnd: on ? lighten(cur('accent')) : cur('accent') });
  }

  return (
    <div className="theme-custom">
      <button className="theme-section-toggle" onClick={() => setOpen((s) => !s)}>
        <span><i className="fas fa-palette" /> Color theme</span>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'}`} />
      </button>

      {!open ? null : (<>
      {/* Presets */}
      <div className="preset-grid">
        {PRESETS.map((p) => {
          const c = p.colors || { primary: '#7C83FD', primaryEnd: '#9A8CFF', accent: '#2FD3B6', accentEnd: '#5DE0C8' };
          return (
            <button key={p.id} className={`preset-chip${active === p.id ? ' active' : ''}`} onClick={() => pickPreset(p)}>
              <span className="preset-swatch" style={{
                background: `linear-gradient(135deg, ${c.primary}, ${c.primaryEnd} 60%, ${c.accent})`,
              }} />
              <span className="preset-name">{p.name}</span>
            </button>
          );
        })}
      </div>

      {/* Live preview */}
      <div className="theme-preview">
        <span className="tp-btn" style={{ background: 'var(--grad-primary)' }}>Primary</span>
        <span className="tp-btn" style={{ background: 'var(--grad-accent)' }}>Accent</span>
        <span className="tp-dot" style={{ background: 'var(--grad-accent)' }}><i className="fas fa-plus" /></span>
      </div>

      {/* Primary */}
      <ColorControl label="Primary" value={cur('primary')} onChange={setPrimary}
        gradient={primaryGrad} endValue={cur('primaryEnd')}
        onToggleGrad={(on) => toggleGrad('primary', on)} onEndChange={(v) => setKey('primaryEnd', v)} />

      {/* Accent */}
      <ColorControl label="Accent" value={cur('accent')} onChange={setAccent}
        gradient={accentGrad} endValue={cur('accentEnd')}
        onToggleGrad={(on) => toggleGrad('accent', on)} onEndChange={(v) => setKey('accentEnd', v)} />

      {/* Advanced surface/text colors */}
      <button className="theme-advanced-toggle" onClick={() => setAdvanced((s) => !s)}>
        <span><i className="fas fa-sliders" /> Advanced colors</span>
        <i className={`fas fa-chevron-${advanced ? 'up' : 'down'}`} />
      </button>
      {advanced && (
        <div className="theme-advanced">
          <p className="settings-hint-text" style={{ padding: '0 0 8px' }}>
            Surface &amp; text colors. These also apply in dark mode — if it looks off, tap Reset.
          </p>
          <ColorField label="Surface tint" value={cur('light')} onChange={(v) => setKey('light', v)} />
          <ColorField label="Text" value={cur('dark')} onChange={(v) => setKey('dark', v)} />
          <ColorField label="Muted text" value={cur('muted')} onChange={(v) => setKey('muted', v)} />
        </div>
      )}

      <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={resetPalette}>
        <i className="fas fa-rotate-left" /> Reset to default
      </button>
      </>)}
    </div>
  );
}

// A color with an optional gradient end.
function ColorControl({ label, value, onChange, gradient, endValue, onToggleGrad, onEndChange }) {
  return (
    <div className="color-control">
      <ColorField label={label} value={value} onChange={onChange} />
      <label className="grad-toggle">
        <span><i className="fas fa-fill-drip" /> Gradient</span>
        <span className="switch">
          <input type="checkbox" checked={gradient} onChange={(e) => onToggleGrad(e.target.checked)} />
          <span className="slider" />
        </span>
      </label>
      {gradient && <ColorField label="Gradient end" value={endValue} onChange={onEndChange} sub />}
    </div>
  );
}
