// ============================================================
//  Colour theme editor.
//
//  Three colours, a preset gallery, a live preview and a contrast
//  guard. Everything else in the interface is derived from these,
//  so there is no way to set forty values that disagree with each
//  other — which is what made the v1 editor easy to break.
//
//    Ink     → the text, and the whole grey ramp under it
//    Paper   → the ground, and every translucent surface on it
//    Accent  → buttons, links, the rules that matter
// ============================================================
import { useTheme } from '../context/ThemeContext';
import {
  PRESETS, DEFAULT_THEME, resolveTheme, activePresetId, contrast, onColor, isDarkColor,
} from '../lib/palette';
import ColorField from './ColorField';

export default function ThemeCustomizer() {
  const { palette, setPalette } = useTheme();
  const theme = resolveTheme(palette);
  const activeId = activePresetId(palette);

  // Only persist what differs from the built-in theme, so "Signal" stays the
  // stylesheet's own values rather than a saved copy of them.
  function update(patch) {
    const next = { ...theme, ...patch };
    const isDefault = next.ink === DEFAULT_THEME.ink
      && next.paper === DEFAULT_THEME.paper
      && next.accent === DEFAULT_THEME.accent
      && next.ambient === true;
    setPalette(isDefault ? null : next);
  }

  const ratio = contrast(theme.ink, theme.paper);
  const accentRatio = contrast(theme.accent, theme.paper);
  const lowText = ratio < 4.5;
  const lowAccent = accentRatio < 3;

  return (
    <div className="tc">
      <p className="tc-desc">
        Three colours drive everything. Ink is the text, paper is the ground, and the
        accent carries the buttons and links. The rest is worked out from them.
      </p>

      <div className="tc-presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`tc-preset${activeId === p.id ? ' active' : ''}`}
            onClick={() => update({ ink: p.ink, paper: p.paper, accent: p.accent })}
            title={p.name}
          >
            <span className="tc-swatches">
              <span style={{ background: p.paper }} />
              <span style={{ background: p.accent }} />
              <span style={{ background: p.ink }} />
            </span>
            <span className="tc-preset-name">{p.name}</span>
          </button>
        ))}
      </div>

      {/* Preview paints itself with the chosen colours, so you judge the theme
          on its own ground rather than on the page's current one. */}
      <div className="tc-preview" style={{ background: theme.paper }}>
        <div style={{ minWidth: 0 }}>
          <div className="tc-preview-title" style={{ color: theme.ink }}>Weekend groceries</div>
          <div className="tc-preview-sub" style={{ color: theme.ink, opacity: 0.64 }}>
            Updated 12m ago
          </div>
        </div>
        <span className="tc-preview-btn"
          style={{ background: theme.accent, color: onColor(theme.accent) }}>
          Save
        </span>
      </div>

      {(lowText || lowAccent) && (
        <div className="tc-warn">
          <i className="fas fa-triangle-exclamation" />
          <span>
            {lowText
              ? `Ink on paper is only ${ratio.toFixed(1)}:1. Text is hard to read below 4.5:1 — darken the ink or lighten the paper.`
              : `The accent is only ${accentRatio.toFixed(1)}:1 against the paper. Buttons and links will be hard to pick out below 3:1.`}
          </span>
        </div>
      )}

      <div className="tc-group">
        <ColorField label="Accent" value={theme.accent} onChange={(v) => update({ accent: v })} />
        <ColorField label="Paper (background)" value={theme.paper} onChange={(v) => update({ paper: v })} />
        <ColorField label="Ink (text)" value={theme.ink} onChange={(v) => update({ ink: v })} />
      </div>

      <div className="tc-group">
        <div className="tc-row">
          <span>Ambient background</span>
          <label className="switch">
            <input type="checkbox" checked={theme.ambient}
              onChange={() => update({ ambient: !theme.ambient })} />
            <span className="slider" />
          </label>
        </div>
        <div className="tc-row">
          <span style={{ color: 'var(--ink-64)', fontSize: 12 }}>
            Two soft washes of the accent drift behind the page. Turning this off
            leaves a flat ground.
          </span>
        </div>
        <div className="tc-row">
          <span>Ground</span>
          <span className="tc-row-hint">{isDarkColor(theme.paper) ? 'Dark' : 'Light'}</span>
        </div>
      </div>

      <button className="tc-reset" onClick={() => setPalette(null)}>
        <i className="fas fa-rotate-left" /> Reset to Signal
      </button>
    </div>
  );
}
