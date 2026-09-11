// ============================================================
//  Profile picture upload.
//
//  Three steps, and the middle one deliberately does NOT go through our own
//  server: ask the backend to sign an upload, send the file straight to
//  Cloudinary, then tell the backend the resulting URL. Routing image bytes
//  through a free Render instance would be slow and would burn its memory for
//  no benefit.
//
//  The signature is bound to the account, so it cannot be used to overwrite
//  anyone else's picture, and the backend re-checks the URL it is handed
//  rather than trusting the client's word for where the file ended up.
// ============================================================
import { api } from './api';

// Cloudinary's free tier is generous, but a phone camera photo is several
// megabytes and an avatar is displayed at 96 pixels. Refuse the huge ones
// rather than spending someone's data allowance on them.
export const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/// Checks the file the user PICKED, before cropping. The cropped result is
/// always a small JPEG this code produced, so it needs no second opinion.
/// Returns a message to show the user, or null when the file is acceptable.
export function pictureProblem(file: File | null): string | null {
  if (!file) return 'No picture selected.';
  if (!ALLOWED.includes(file.type)) return 'Pick a JPEG, PNG, WebP or GIF image.';
  if (file.size > MAX_BYTES) return 'That picture is larger than 5 MB. Try a smaller one.';
  return null;
}

/// Delivered small, in whatever format the viewer's browser prefers.
///
/// Deliberately NO gravity setting. What arrives here is already the square the
/// user chose in the crop dialog, so asking Cloudinary to find a face and crop
/// to it would quietly overrule that decision. This only scales.
function displayUrl(secureUrl: string): string {
  // Inserted right after "/upload/", which is where Cloudinary expects it.
  return secureUrl.replace('/upload/', '/upload/c_fill,w_256,h_256,q_auto,f_auto/');
}

/// Uploads the image and returns the URL to store. Takes the square blob the
/// crop dialog produced, not the original file. Throws with a message worth
/// showing if anything fails.
export async function uploadAvatar(image: Blob): Promise<string> {
  if (!image || !image.size) throw new Error('There was nothing to upload.');

  const sig = await api.post('/api/auth/avatar-signature', {});
  if (!sig?.signature || !sig?.cloudName) {
    throw new Error('Picture uploads are not available right now.');
  }

  const form = new FormData();
  // A filename is supplied because the blob has none of its own, and Cloudinary
  // uses it when working out the format.
  form.append('file', image, 'avatar.jpg');
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('public_id', sig.public_id);
  form.append('overwrite', sig.overwrite);
  form.append('invalidate', sig.invalidate);
  form.append('signature', sig.signature);

  // Deliberately plain fetch, not our api helper: this goes to Cloudinary, and
  // must not carry our Authorization header to a third party.
  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.secure_url) {
    throw new Error(body?.error?.message || 'The picture could not be uploaded.');
  }

  return displayUrl(body.secure_url);
}
