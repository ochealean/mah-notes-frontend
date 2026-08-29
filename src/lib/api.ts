// ============================================================
//  Tiny fetch wrapper. Attaches the JWT and base URL, unwraps
//  JSON, and throws a clean Error(message) on failure.
// ============================================================
const BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:3000').replace(/\/$/, '');

const TOKEN_KEY = 'mahnotes_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(method: string, path: string, body?: any) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // Generous enough to cover a cold server waking up, short enough that a truly
  // dead connection surfaces an error instead of spinning forever.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { error: text }; } }

  if (!res.ok) {
    const err: any = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (p: string) => request('GET', p),
  post: (p: string, b?: any) => request('POST', p, b ?? {}),
  put: (p: string, b?: any) => request('PUT', p, b ?? {}),
  patch: (p: string, b?: any) => request('PATCH', p, b ?? {}),
  del: (p: string, b?: any) => request('DELETE', p, b),
};

export const API_BASE = BASE;
