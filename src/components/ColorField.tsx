// ============================================================
//  In-app color picker (saturation square + hue slider + hex/RGB).
//  Uses react-colorful so it looks and works the SAME on the website
//  and inside the Android WebView — the native <input type="color">
//  falls back to a very basic OS dialog on Android, so we render our
//  own. The popover is portalled to <body> so the settings card's
//  overflow:hidden never clips it, and positioned next to the swatch.
// ============================================================
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker } from 'react-colorful';

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const clamp = (n: number) => Math.max(0, Math.min(255, n | 0));
function rgbToHex(r: number, g: number, b: number) {
  const h = (c: number) => clamp(c).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}
const normHex = (v: string) => {
  let s = (v || '').trim().replace(/^#?/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toUpperCase()}` : null;
};

const POP_W = 232;
const POP_H = 286;

export default function ColorField({ label, value, onChange, sub = false }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [hexText, setHexText] = useState(value);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => { setHexText(value.toUpperCase()); }, [value]);

  // Position the popover next to the swatch (flips above if no room below).
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current.getBoundingClientRect();
      const left = Math.min(Math.max(8, r.right - POP_W), window.innerWidth - POP_W - 8);
      const below = r.bottom + 6;
      const top = below + POP_H > window.innerHeight - 8 ? Math.max(8, r.top - POP_H - 6) : below;
      setPos({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  // Close when tapping outside both the trigger and the popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); };
  }, [open]);

  const rgb = hexToRgb(value);
  const setRgb = (key, raw) => {
    const n = clamp(parseInt(raw || '0', 10) || 0);
    onChange(rgbToHex(key === 'r' ? n : rgb.r, key === 'g' ? n : rgb.g, key === 'b' ? n : rgb.b));
  };

  return (
    <div className={`color-field${sub ? ' color-field-sub' : ''}`}>
      <button type="button" ref={btnRef} className="color-row" onClick={() => setOpen((s) => !s)}>
        <span className="color-row-label">{label}</span>
        <span className="color-row-val">{value.toUpperCase()}</span>
        <span className="color-swatch" style={{ background: value }} />
      </button>

      {open && createPortal(
        <div className="color-popover" ref={popRef} style={{ left: pos.left, top: pos.top }}>
          <HexColorPicker color={value} onChange={(c) => onChange(c.toUpperCase())} />

          <div className="cp-hex">
            <span>#</span>
            <input
              value={hexText.replace(/^#/, '')}
              onChange={(e) => {
                setHexText(e.target.value);
                const h = normHex(e.target.value);
                if (h) onChange(h);
              }}
              onBlur={() => setHexText(value.toUpperCase())}
              maxLength={7} spellCheck={false} aria-label={`${label} hex`}
            />
          </div>

          <div className="cp-rgb">
            {(['r', 'g', 'b'] as const).map((k) => (
              <label key={k} className="cp-rgb-field">
                <input type="number" min={0} max={255} value={rgb[k]}
                  onChange={(e) => setRgb(k, e.target.value)} aria-label={`${label} ${k.toUpperCase()}`} />
                <span>{k.toUpperCase()}</span>
              </label>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
