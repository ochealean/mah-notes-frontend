// ============================================================
//  AI timetable scan — client side.
//  Takes a photo/screenshot of a class schedule, shrinks it to a
//  sane size (phone photos are huge), and sends it to the backend,
//  which reads it with Claude vision and returns clean blocks:
//    [{ day, start "HH:MM", end "HH:MM", title, sub }]
//  Needs sign-in + internet (the AI runs on the server).
// ============================================================
import { api } from './api';

const MAX_EDGE = 1600;   // px — plenty for reading a timetable
const JPEG_QUALITY = 0.85;

// Downscale + re-encode the picked file via canvas → { data, mediaType }.
async function toPayload(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image.'));
      i.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // PNG transparency → white, not black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return { data: dataUrl.split(',')[1], mediaType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Full flow: file → payload → backend → blocks. Throws with a friendly
// message on failure; returns [] when the AI found no timetable.
export async function scanScheduleImage(file) {
  if (!navigator.onLine) throw new Error('Scanning needs an internet connection.');
  const { data, mediaType } = await toPayload(file);
  const res = await api.post('/api/scan-schedule', { image: data, mediaType });
  return res.blocks || [];
}
