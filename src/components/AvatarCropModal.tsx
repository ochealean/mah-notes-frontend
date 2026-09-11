// ============================================================
//  Crop a picture before it is uploaded.
//
//  Cloudinary can crop on delivery, but that decides for the user — it guesses
//  at a face and centres on it. People generally have an opinion about which
//  part of a photo is them, so this asks first.
//
//  Cropping here also means the upload carries only the square that was kept,
//  rather than a full phone photo, which is the difference between a few
//  hundred kilobytes and several megabytes on a mobile connection.
// ============================================================
import { useCallback, useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';

const OUTPUT_SIZE = 512; // Generous for a 96px avatar, still small to send.

/// Draw the chosen region onto a square canvas and hand back a JPEG blob.
///
/// `area` arrives in natural image pixels from the cropper, so nothing here has
/// to know about how the picture was displayed or scaled on screen.
async function cropToBlob(src: string, area: { x: number; y: number; width: number; height: number }): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That image could not be read.'));
    img.src = src;
  });

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not prepare the image.');

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    area.x, area.y, area.width, area.height,
    0, 0, OUTPUT_SIZE, OUTPUT_SIZE,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The crop could not be saved.'))),
      'image/jpeg',
      0.9,
    );
  });
}

export default function AvatarCropModal({ file, onCancel, onDone }) {
  const [src, setSrc] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // An object URL rather than a data URL: no base64 round trip, and it is
  // released the moment this closes instead of sitting in memory.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_area, areaPixels) => setArea(areaPixels), []);

  async function confirm() {
    if (!area || busy) return;
    setBusy(true);
    setErr('');
    try {
      onDone(await cropToBlob(src, area));
    } catch (e) {
      setErr(e?.message || 'That image could not be cropped.');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onCancel(); }}>
      <div className="popup">
        <div className="popup-head">
          <h3><i className="fas fa-crop-simple" /> Position your picture</h3>
          {!busy && <button className="icon-btn" aria-label="Close" onClick={onCancel}><i className="fas fa-times" /></button>}
        </div>

        <div className="avatar-crop-stage">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <label className="avatar-crop-zoom">
          <i className="fas fa-magnifying-glass-minus" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
          />
          <i className="fas fa-magnifying-glass-plus" />
        </label>
        <p className="settings-hint-text">Drag to move, pinch or use the slider to zoom.</p>

        {err && <div className="share-revoked">{err}</div>}

        <button className="btn btn-primary btn-block" disabled={busy || !area} onClick={confirm}>
          {busy
            ? <><i className="fas fa-circle-notch fa-spin" /> Uploading…</>
            : <><i className="fas fa-check" /> Use this picture</>}
        </button>
        <button className="btn btn-ghost btn-block" style={{ marginTop: 9 }} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
